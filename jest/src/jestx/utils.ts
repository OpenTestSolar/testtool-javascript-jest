import * as process from "process";
import * as child_process from "child_process";
import * as util from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from 'uuid';
import retry from 'async-retry';

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";
import {
  TestResult,
  TestCaseStep,
  TestCaseLog,
  LogLevel,
  ResultType,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/testresult";

const exec = util.promisify(child_process.exec);

const coverageFileName = "testsolar_coverage"

interface SpecResult {
  result: string;
  duration: number;
  startTime: number;
  endTime: number;
  message: string;
  content: string;
}

interface CaseResult {
  assertionResults: {
    fullName: string;
    status: string;
    failureMessages: string[];
  }[];
  endTime: number;
  message: string;
  name: string;
  startTime: number;
}
interface JsonData {
  testResults: CaseResult[];
}

interface ProjectPath {
  projectPath: string;
}

interface Coverage {
  coverageFile: string;
  coverageType: string;
  projectPath: ProjectPath;
}

// 执行命令并返回结果
export async function executeCommand(
  command: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec(command);
    return { stdout, stderr };
  } catch (error) {
    const typedError = error as Error & { stdout: string; stderr: string };
    // 记录错误日志
    log.error(`Error executing command: ${command}`);
    log.error(`Error message: ${typedError.message}`);
    log.error(`stdout: ${typedError.stdout}`);
    log.error(`stderr: ${typedError.stderr}`);
    // 抛出错误以触发重试机制
    throw typedError;
  }
}

// 判断路径是文件还是目录
export const isFileOrDirectory = (filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      return 1; // 文件
    } else if (stats.isDirectory()) {
      return -1; // 目录
    } else {
      return 0; // 其他类型
    }
  } catch (err) {
    return 0; // 其他类型
  }
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
      const fileType = isFileOrDirectory(selector);
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
export const parseTestcase = (
  projPath: string,
  fileData: string[],
): string[] => {
  const testcases: string[] = [];

  // 遍历所有文件
  for (const filePath of fileData) {
    const relativePath = path.relative(projPath, filePath);
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // 将文件内容按行分割
    const lines = fileContent.split("\n");

    // 初始化 describeContent 变量
    let describeContent = "";

    // 遍历每一行
    for (const line of lines) {
      // 匹配 describe 标签
      const describeMatch = line.match(/describe\(['"](.*?)['"],/);
      if (describeMatch) {
        // 更新 describeContent
        describeContent = describeMatch[1];
      }

      // 扫描只有it或者test标签用例，无describe
      const singleItMatch = line.match(/^(it|test)\(['"](.*?)['"],/);
      if (singleItMatch) {
        const testcase = `${relativePath.replace(projPath, "")}?${singleItMatch[2]}`;
        testcases.push(testcase);
        describeContent = "";
        continue;
      }
      // 匹配describe下的 it 或 test 标签
      const itMatch = line.match(/\s+(it|test)\(['"](.*?)['"],/);
      if (itMatch) {
        if (describeContent) {
          const testcase = `${relativePath.replace(projPath, "")}?${describeContent} ${itMatch[2]}`;
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
    const defaultCommand = `npx jest ${path} --json --outputFile=${jsonName} --color=false ${extraArgs}`;
    log.info(`Generated default command for test cases: ${defaultCommand}`);
    return { command: defaultCommand, testIdentifiers: [] };
  }

  let grepPattern = decodeURI(testCases.join("|"));
  if (grepPattern) {
    grepPattern = `--testNamePattern="${grepPattern}"`;
  }
  const command = `npx jest ${path} ${grepPattern} --json --outputFile=${jsonName} --color=false ${extraArgs}`;

  for (const testcase of testCases) {
    testIdentifiers.push(`${path}?${testcase}`);
  }

  log.info(`Generated command for test cases: ${command}`);
  return { command, testIdentifiers };
}

export function parseSuiteLogs(message: string): Map<string, string> {
  const contentList = message.split("●");
  const data = new Map<string, string>();

  for (const content of contentList) {
    if (!content.trim()) {
      continue;
    }
    const case_name = content.split("\n")[0].replace(" › ", " ").trim();
    data.set(case_name, content);
  }

  return data;
}

// 解析 JSON 内容并返回用例结果
export function parseJsonContent(
  projPath: string,
  data: JsonData,
): Record<string, SpecResult> {
  const caseResults: Record<string, SpecResult> = {};

  for (const testResult of data.testResults) {
    const suiteLogs = parseSuiteLogs(testResult.message);
    const testPath = path.relative(projPath, testResult.name);
    const startTime = testResult.startTime;
    const endTime = testResult.endTime;

    for (const assertionResult of testResult.assertionResults) {
      const testName = assertionResult.fullName;
      const testselector = `${testPath}?${testName}`;
      const result = assertionResult.status;
      if (result === "pending") {
        continue;
      }
      // 确保 failureMessages 是一个字符串
      let failureMessages = Array.isArray(assertionResult.failureMessages)
        ? assertionResult.failureMessages.join("\n")
        : assertionResult.failureMessages || "";

      if (suiteLogs.get(testName)) {
        failureMessages = suiteLogs.get(testName) + "\n" + failureMessages;
      }

      const specResult = {
        result: result,
        duration: endTime - startTime,
        startTime: startTime,
        endTime: endTime,
        message: failureMessages,
        content: failureMessages,
      };

      // 不需要检查 specResult 是否存在，因为它总是会被创建
      if (!caseResults[testselector]) {
        caseResults[testselector] = specResult;
      } else {
        caseResults[testselector].message += "\n" + specResult.message;
      }
    }
  }
  return caseResults;
}

// 解析 JSON 文件并返回用例结果
export function parseJsonFile(
  projPath: string,
  jsonFile: string,
): Record<string, SpecResult> {
  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
  log.info("--------json data:---------");
  log.info(JSON.stringify(data, null, 2));
  log.info("---------------------------");
  const result = parseJsonContent(projPath, data);
  log.info(`Parse result from json: ${JSON.stringify(result, null, 2)}`);
  return result;
}

export function createTempDirectory(): string {
  const prefix = "caseOutPut";
  const tempDirectory = path.join(os.homedir(), `${prefix}-${Date.now()}`);

  fs.mkdirSync(tempDirectory);
  log.info(`Temporary directory created: ${tempDirectory}`);
  return tempDirectory;
}

// 执行命令列表并上报结果，增加重试机制
export async function executeCommands(
  projPath: string,
  command: string,
  jsonName: string,
): Promise<Record<string, SpecResult>> {
  const results: Record<string, SpecResult> = {};
  log.info(`Execute final command: ${command}`);

  try {
    await retry(async () => {
      try {
        await executeCommand(command);
      } catch (commandError) {
        // 命令执行失败时，立即检查 JSON 文件是否存在
        if (jsonName && fs.existsSync(jsonName)) {
          log.info(`Jest command failed but JSON file exists: ${jsonName}, will use existing results`);
          return; // 不抛出错误，让重试机制停止
        }
        // 如果 JSON 文件不存在，重新抛出错误以触发重试
        throw commandError;
      }

      // 命令执行成功后，检查文件是否存在
      if (!fs.existsSync(jsonName)) {
        log.error(`File not found after command execution: ${jsonName}`);
        throw new Error(`File not found: ${jsonName}`);
      }
    }, {
      retries: 3,
      minTimeout: 2000,
      onRetry: (error, attempt) => {
        if (error instanceof Error) {
          log.warn(`Retrying command (${attempt}/3): ${error.message}`);
        } else {
          log.warn(`Retrying command (${attempt}/3): Unknown error`);
        }
      },
    });

    // 解析 JSON 文件（无论是命令成功还是文件已存在）
    if (fs.existsSync(jsonName)) {
      const testResults = parseJsonFile(projPath, jsonName);
      Object.assign(results, testResults);
    }
  } catch (finalError) {
    // 最终失败处理：检查 JSON 文件是否存在
    if (jsonName && fs.existsSync(jsonName)) {
      log.info(`Jest execution failed after retries but JSON file exists: ${jsonName}, parsing results from existing file`);
      try {
        const testResults = parseJsonFile(projPath, jsonName);
        Object.assign(results, testResults);
        return results;
      } catch (parseError) {
        log.error(`Failed to parse existing JSON file ${jsonName}:`, parseError);
        // 如果解析失败，继续抛出原始错误
      }
    } else if (jsonName) {
      log.error(`Jest execution failed and specified JSON file does not exist: ${jsonName}`);
      throw new Error(`Jest execution failed and specified JSON file does not exist: ${jsonName}`);
    }

    if (finalError instanceof Error) {
      log.error(`Failed to execute command after retries: ${finalError.message}`);
    } else {
      log.error(`Failed to execute command after retries: ${finalError}`);
    }
    throw finalError;
  }

  return results;
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

  log.info("Grouped test cases by path: ", groupedTestCases);

  return groupedTestCases;
}

export function createTestResults(
  output: Record<string, SpecResult>,
): TestResult[] {
  const testResults: TestResult[] = [];

  for (const [testCase, result] of Object.entries(output)) {
    const test = new TestCase(encodeURI(testCase), {}); // 假设 TestCase 构造函数接受路径和空记录
    const startTime = new Date(result.startTime).toISOString();
    const endTime = new Date(result.endTime).toISOString();
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

  return testResults;
}


export function generateCoverageJson(projectPath: string, fileReportPath: string) {
  const cloverXml = path.join(projectPath, "coverage", "clover.xml");

  if (fs.existsSync(cloverXml)) {
    // 目标 clover.xml 文件路径
    const unique_id = uuidv4();
    const targetCloverXmlPath = path.join(fileReportPath, `${unique_id}_clover.xml`);

    // 尝试复制文件
    try {
      fs.copyFileSync(cloverXml, targetCloverXmlPath);
      // 删除源文件
      fs.unlinkSync(cloverXml);
    } catch (error) {
      log.error(`Error moving file from ${cloverXml} to ${targetCloverXmlPath}:`, error);
      return;
    }

    // 创建 ProjectPath 对象
    const projPath: ProjectPath = {
      projectPath: projectPath
    };

    // 创建 Coverage 对象
    const coverage: Coverage = {
      coverageFile: targetCloverXmlPath,
      coverageType: 'clover_xml',
      projectPath: projPath
    };

    // 在 projectPath 下的 testsolar_coverage 目录中创建一个随机名称（UUID）的 JSON 文件
    const testsolarCoverageDir = path.join(projectPath, coverageFileName);
    if (!fs.existsSync(testsolarCoverageDir)) {
      fs.mkdirSync(testsolarCoverageDir);
    }

    const randomFileName = `${unique_id}.json`;
    const randomFilePath = path.join(testsolarCoverageDir, randomFileName);
    
    fs.writeFileSync(randomFilePath, JSON.stringify(coverage, null, 2));
    
    log.info(`Coverage data written to ${randomFilePath}`);
  } else {
    log.error(`Clover XML file not found at ${cloverXml}`);
  }
}

// sleep 函数用于等待指定的时间（以毫秒为单位）
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}