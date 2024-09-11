import * as fs from "fs";

import {
  executeCommands,
  generateCommands,
  groupTestCasesByPath,
  createTestResults,
  generateCoverageJson,
} from "./utils";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";

export async function runTestCase(runParamFile: string): Promise<void> {
  console.log("Pipe file: ", runParamFile);
  const fileContent = fs.readFileSync(runParamFile, "utf-8");
  const data = JSON.parse(fileContent);
  console.log(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
  const testSelectors = data.TestSelectors || [];
  const projPath = data.ProjectPath;
  const taskId = data.TaskId;

  // 按照文件对用例进行分组
  const caseLists = groupTestCasesByPath(testSelectors);

  // 对每个文件生成命令行
  for (const [path, testcases] of Object.entries(caseLists)) {
    // 生成 json 文件名称
    const jsonName = path.replace(/\//g, "_") + ".json";

    const { command, testIdentifiers } = generateCommands(
      path,
      testcases,
      jsonName,
    );
    console.log(testIdentifiers);

    // 增加覆盖率参数
    let finalCommand = command;
    const coverage_enable = process.env.TESTSOLAR_TTP_ENABLECOVERAGE || "";
    if (coverage_enable) {
      console.log("Enable coverage, run jest with coverage");
      finalCommand = `{${command} --collect-coverage}`;
    }
    
    // 执行命令，解析用例生成的 JSON 文件，上报结果
    const testResults = await executeCommands(projPath, finalCommand, jsonName);
    // console.log("Parse json results:\n", testResults);
    const results = createTestResults(testResults);
    const reporter = new Reporter(taskId, data.FileReportPath);
    for (const result of results) {
      await reporter.reportTestResult(result);
    }

    // 处理覆盖率
    if (coverage_enable) {
      generateCoverageJson(projPath, data.FileReportPath);
    }
  }
}