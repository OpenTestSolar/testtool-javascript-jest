import * as process from "process";
import * as fs from "fs";
import * as path from "path";
import {
  createTempDirectory,
  executeCommand,
  parseTestcase,
  filterTestcases,
} from "./utils";

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

import {
  LoadError,
  LoadResult,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/load";
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";

export async function collectTestCases(
  projPath: string,
  testSelectors: string[],
): Promise<LoadResult> {
  const test: TestCase[] = [];
  const loadError: LoadError[] = [];
  const result = new LoadResult(test, loadError);

  try {
    // 进入projPath目录
    process.chdir(projPath);
    log.info(`Current directory: ${process.cwd()}`);

    const tempDirectory = createTempDirectory();
    const filePath = path.join(tempDirectory, "testSolarOutput.json");

    // 执行命令获取output.json文件内容

    const command = `npx jest --listTests --json | tee ${filePath}`;
    log.info("Run Command: ", command);
    const { stdout, stderr } = await executeCommand(command);
    log.debug("stdout:", stdout);
    log.debug("stderr:", stderr);

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const testData = JSON.parse(fileContent);

    // 检查是否为文件模式
    const runMode = process.env.TESTSOLAR_TTP_RUN_MODE;
    let loadCaseResult: string[];

    if (runMode === 'file') {
      // 文件模式：只返回文件路径
      loadCaseResult = testData
      log.info("Jest testtool file mode - returning files only: \n", loadCaseResult);
    } else {
      // 正常模式：解析所有用例
      loadCaseResult = parseTestcase(projPath, testData);
      log.info("Jest testtool parse all testcases: \n", loadCaseResult);
    }

    // 过滤用例
    let filterResult;
    if (testSelectors && testSelectors.length > 0) {
      // 检查 testSelectors 是否只包含一个 "."
      if (testSelectors.length === 1 && testSelectors[0] === ".") {
        // 如果 testSelectors 只包含一个 "."，则直接返回 loadCaseResult
        filterResult = loadCaseResult;
      } else {
        // 如果 testSelectors 不为空且不只是 "."，则调用 filterTestcases 函数
        filterResult = await filterTestcases(
          testSelectors,
          loadCaseResult,
          false,
        );
      }
    } else {
      // 如果 testSelectors 为空，则直接使用 loadCaseResult
      filterResult = loadCaseResult;
    }
    log.info("filter testcases: ", filterResult);

    // 提取用例数据
    filterResult.forEach((filteredTestCase: string) => {
       if (runMode === 'file') {
        // 文件模式：直接使用文件路径作为测试用例名称
        const test = new TestCase(filteredTestCase, {});
        result.Tests.push(test);
       } else {
        const [path, descAndName] = filteredTestCase.split("?");
        const test = new TestCase(`${path}?${descAndName}`, {});
        result.Tests.push(test);
       }
    });
  } catch (error: unknown) {
    // 直接抛出异常并退出
    const errorMessage =
      (error as Error).message ||
      "Parse json file error, please check the file content!";
    console.error(errorMessage);
  }

  return result;
}

export async function loadTestCasesFromFile(filePath: string): Promise<void> {
  log.info("Pipe file: ", filePath);

  // 读取文件并解析 JSON
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(fileContent);
  log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
  const testSelectors = data.TestSelectors || [];
  const projPath = data.ProjectPath;
  const taskId = data.TaskId;

  log.info("generate demo load result");
  const loadResults: LoadResult = await collectTestCases(
    projPath,
    testSelectors,
  );

  const reporter = new Reporter(taskId, data.FileReportPath);
  await reporter.reportLoadResult(loadResults);
}