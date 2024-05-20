import * as process from "process";
import * as child_process from "child_process";
import * as util from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseISO, addMilliseconds } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";
import {
  TestResult,
  TestCaseStep,
  TestCaseLog,
  LogLevel,
  ResultType,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/testresult";

const exec = util.promisify(child_process.exec);

// 执行命令并返回结果
export async function executeCommand(
  command: string,
): Promise<{ stdout: string; stderr: string; error?: Error }> {
  try {
    const { stdout, stderr } = await exec(command);
    return { stdout, stderr };
  } catch (error) {
    const typedError = error as Error & { stdout: string; stderr: string }; // 类型断言
    // console.error(
    //   `Error executing command: ${command}\nError stdout: ${typedError.stdout}\nError stderr: ${typedError.stderr}, please check testcase's log`,
    // );
    return {
      stdout: typedError.stdout,
      stderr: typedError.stderr,
      error: typedError,
    };
  }
}

export function parseErrorCases(
  jsonData: any,
  cases: string[],
): Record<string, any> {
  const caseResults: Record<string, any> = {};

  // 获取统计信息
  const startTime = jsonData.stats.startTime;
  const duration = jsonData.stats.duration;
  const [specStartTime, specEndTime, specDuration] = parseTimeStamp(
    startTime,
    duration,
  );

  // 检查 suites 是否为空
  if (jsonData.suites.length === 0) {
    if (jsonData.errors.length > 0) {
      // 处理存在的错误
      for (const error of jsonData.errors) {
        const errorMessage = error.message;
        const errorStack = error.stack;
        const errorLocation = `${error.location.file}:${error.location.line}:${error.location.column}`;
        const errorSnippet = error.snippet;

        // 构建错误信息的结构
        const errorResult = {
          projectID: null, // 根据实际情况设置或从 error 对象中获取
          result: "failed",
          duration: specDuration, // 从统计信息中获取耗时
          startTime: specStartTime, // 从统计信息中获取启动时间
          endTime: specEndTime, // 计算结束时间
          message: errorMessage,
          content: `${errorStack}\nLocation: ${errorLocation}\nSnippet:\n${errorSnippet}`,
        };

        // 遍历 cases，为每个 case 添加错误信息
        for (const testCase of cases) {
          caseResults[testCase] = [errorResult];
        }
      }
    } else {
      // 当 suites 和 errors 都为空时，添加特殊消息
      const message = "日志为空，请检查用例本地是否跑通，或者联系腾讯云助手";
      for (const testCase of cases) {
        caseResults[testCase] = [
          {
            projectID: null,
            result: "failed",
            duration: specDuration,
            startTime: specStartTime,
            endTime: specEndTime,
            message: message,
            content: message,
          },
        ];
      }
    }
  }

  return caseResults;
}

// 判断路径是文件还是目录
export const isFileOrDirectory = (path: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err) {
        resolve(0);
        return;
      }

      if (stats.isFile()) {
        resolve(1);
      } else if (stats.isDirectory()) {
        resolve(-1);
      } else {
        resolve(0);
      }
    });
  });
};

// 根据选择器过滤测试用例
export const filterTestcases = async (
  testSelectors: string[],
  parsedTestcases: string[],
  exclude: boolean = false,
): Promise<string[]> => {
  if (testSelectors.length === 0) {
    return parsedTestcases;
  }
  const filteredTestcases: string[] = [];

  for (const testCase of parsedTestcases) {
    let matched = false;

    for (const selector of testSelectors) {
      const fileType = await isFileOrDirectory(selector).catch((err) => {
        console.error(err);
        return 0;
      });

      if (fileType === -1) {
        // 如果selector是目录路径，检查testCase是否包含selector + '/' 避免文件名与用例名重复
        if (testCase.includes(selector + "/")) {
          matched = true;
          break;
        }
      } else {
        if (testCase.includes(selector)) {
          matched = true;
          break;
        }
      }
    }

    // 根据 exclude 参数，确定是否将匹配的测试用例包含在结果中
    if (exclude && !matched) {
      filteredTestcases.push(testCase);
    } else if (!exclude && matched) {
      filteredTestcases.push(testCase);
    }
  }

  return filteredTestcases;
};

// 解析测试用例
export const parseTestcase = (projPath: string, fileData: any): string[] => {
  const testcases: string[] = [];

  // 遍历所有文件
  for (const filePath of fileData) {

    const relativePath = path.relative(projPath, filePath);
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // 将文件内容按行分割
    const lines = fileContent.split('\n');

    // 初始化 describeContent 变量
    let describeContent = '';

    // 遍历每一行
    for (const line of lines) {
      // 匹配 describe 标签
      const describeMatch = line.match(/describe\(['"](.*?)['"]\,/);
      if (describeMatch) {
        // 更新 describeContent
        describeContent = describeMatch[1];
      }

      // 扫描只有it或者test标签用例，无describe
      const singleItMatch = line.match(/^(it|test)\(['"](.*?)['"]\,/);
      if (singleItMatch) {
        const testcase = `${relativePath.replace(projPath, '')}?${singleItMatch[2]}`;
        testcases.push(testcase);
        describeContent = ''
        continue
      }
      // 匹配describe下的 it 或 test 标签
      const itMatch = line.match(/\s+(it|test)\(['"](.*?)['"]\,/);
      if (itMatch) {
        if (describeContent) {
          const testcase = `${relativePath.replace(projPath, '')}?${describeContent} ${itMatch[2]}`;
          testcases.push(testcase);
        }
      }
    }
  }

  return Array.from(new Set(testcases));
};

/// 生成运行测试用例的命令
export function generateCommands(
  path: string,
  testCases: string[],
  jsonName: string,
): { command: string; testIdentifiers: string[] } {
  const testIdentifiers: string[] = [];

  // 从环境变量中获取 TESTSOLAR_TTP_EXTRAARGS 值
  const extraArgs = process.env.TESTSOLAR_TTP_EXTRAARGS || "";

  // 检查 testCases 是否为空
  if (testCases.length === 0) {
    const defaultCommand = `npx jest ${path} --json --outputFile=${jsonName} --color=false `;
    console.log(`Generated default command for test cases: ${defaultCommand}`);
    return { command: defaultCommand, testIdentifiers: [] };
  }

  let grepPattern = decodeURI(testCases.join("|"));
  if (grepPattern) {
    grepPattern = `--testNamePattern="${grepPattern}"`;
  }
  const command = `npx jest ${path} ${grepPattern} --json --outputFile=${jsonName} --color=false `;

  for (const testcase of testCases) {
    testIdentifiers.push(`${path}?${testcase}`);
  }

  console.log(`Generated command for test cases: ${command}`);
  return { command, testIdentifiers };
}

// 处理文件路径，移除项目路径前缀
export function handlePath(projPath: string, filePath: string): string {
  return filePath.replace(`${projPath}/`, "");
}

// 解析时间戳，返回开始时间、结束时间和持续时间
export function parseTimeStamp(
  startTime: string,
  duration: number,
): [number, number, number] {
  const startDate = zonedTimeToUtc(parseISO(startTime), "UTC");
  const endDate = addMilliseconds(startDate, duration);
  const startTimestamp = startDate.getTime() / 1000;
  const endTimestamp = endDate.getTime() / 1000;
  return [startTimestamp, endTimestamp, duration / 1000];
}

export function parseSuiteLogs(message: string): Map<string, string> {
  const contentList = message.split("●")
  const data = new Map<string, string>()

  for (const content of contentList) {
    if (!content.trim()) {
      continue
    }
    const case_name = content.split("\n")[0].replace(" › ", " ").trim()
    data.set(case_name, content)
  }

  return data
}

// 解析 JSON 内容并返回用例结果
export function parseJsonContent(projPath: string, data: any): Record<string, any> {
  const caseResults: Record<string, any> = {};
  let specResult: Record<string, any> = {};

  for (const testResult of data.testResults) {
    const suiteLogs = parseSuiteLogs(testResult.message)
    const testPath = path.relative(projPath, testResult.name);
    const startTime = testResult.startTime
    const endTime = testResult.endTime

    for (const assertionResult of testResult.assertionResults) {
      const testName = assertionResult.fullName
      const testselector = `${testPath}?${testName}`
      const result = assertionResult.status
      if (result === "pending") {
        continue
      }
      let failureMessages = assertionResult.failureMessages || ""
      if (suiteLogs.get(testName)) {
        failureMessages = suiteLogs.get(testName) + "\n" + failureMessages
      }
      specResult = {
        result: result,
        duration: endTime - startTime,
        startTime: startTime,
        endTime: endTime,
        errMessage: failureMessages,
      };

      if (!caseResults[testselector]) {
        caseResults[testselector] = specResult ? [specResult] : [];
      } else {
        if (specResult) {
          if (!Array.isArray(caseResults[testselector])) {
            caseResults[testselector] = [caseResults[testselector]];
          }
          caseResults[testselector].push(specResult);
        }

      }

    }
  }
  return caseResults
}

// 解析 JSON 文件并返回用例结果
export function parseJsonFile(
  projPath: string,
  jsonFile: string,
  cases: string[],
): Record<string, any> {
  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
  console.log("--------json data:---------");
  console.log(JSON.stringify(data, null, 2));
  console.log("---------------------------");
  const result = parseJsonContent(projPath, data);

  console.log(`Parse result from json: ${JSON.stringify(result, null, 2)}`);
  return result;
}

// 获取包含项目 ID 的键列表
export function getKeysWithProjectId(record: Record<string, any>): string[] {
  const resultList: string[] = [];

  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      const projectId = record[key].projectId;
      const combinedKey = key + "/" + projectId;
      resultList.push(combinedKey);
    }
  }

  return resultList;
}

export function createTempDirectory(): string {
  const prefix = "caseOutPut";
  const tempDirectory = path.join(os.tmpdir(), `${prefix}-${Date.now()}`);

  try {
    fs.mkdirSync(tempDirectory);
    console.log(`Temporary directory created: ${tempDirectory}`);
    return tempDirectory;
  } catch (error: any) {
    console.error(`Failed to create temporary directory: ${error.message}`);
    throw error;
  }
}

// 执行命令列表并上报结果
export async function executeCommands(
  projPath: string,
  command: string,
  cases: string[],
  jsonName: string,
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  const { stdout, stderr } = await executeCommand(command);
  // console.log(
  //   `Run cmdline: ${command} \n Run stdout: ${stdout}\nRun stderr: ${stderr}`,
  // );
  // 解析 JSON 文件并处理结果
  const testResults = parseJsonFile(projPath, jsonName, cases);
  Object.assign(results, testResults);
  return testResults;
}

export function groupTestCasesByPath(
  testcases: string[],
): Record<string, string[]> {
  const groupedTestCases: Record<string, string[]> = {};

  testcases.forEach((testcase) => {
    let path: string;
    let name: string = "";

    // 检查测试用例是否包含问号
    const questionMarkIndex = testcase.indexOf("?");
    if (questionMarkIndex !== -1) {
      // 如果有问号，分割路径和名称
      path = testcase.substring(0, questionMarkIndex);
      name = testcase.substring(questionMarkIndex + 1);
    } else {
      // 如果没有问号，路径是整个测试用例，名称为空字符串
      path = testcase;
    }

    // 如果路径不存在，则初始化一个空数组
    if (!groupedTestCases[path]) {
      groupedTestCases[path] = [];
    }

    // 将测试用例名称添加到对应路径的数组中
    groupedTestCases[path].push(name);
  });

  console.log("Grouped test cases by path: ", groupedTestCases);

  return groupedTestCases;
}

export function createTestResults(output: Record<string, any[]>): TestResult[] {
  const testResults: TestResult[] = [];

  for (const [testCase, results] of Object.entries(output)) {
    for (const result of results) {
      const test = new TestCase(encodeURI(testCase), {}); // 假设 TestCase 构造函数接受路径和空记录
      const startTime = new Date(result.startTime * 1000).toISOString();
      const endTime = new Date(result.endTime * 1000).toISOString();
      const resultType =
        result.result === "passed" ? ResultType.SUCCEED : ResultType.FAILED;
      const message = result.message || "";
      const content = result.content || "";

      // 创建 TestCaseLog 实例
      const testLog = new TestCaseLog(
        startTime, // 使用结束时间作为日志时间
        result.result === "passed" ? LogLevel.INFO : LogLevel.ERROR,
        content,
        [], // 空附件数组
        undefined, // 无断言错误
        undefined, // 无运行时错误
      );

      // 创建 TestCaseStep 实例
      const testStep = new TestCaseStep(
        startTime,
        endTime,
        "Step title",
        resultType,
        [testLog],
      );

      // 创建 TestResult 实例
      const testResult = new TestResult(
        test,
        startTime,
        endTime,
        resultType,
        message,
        [testStep],
      );

      // 添加到结果数组
      testResults.push(testResult);
    }
  }

  return testResults;
}
