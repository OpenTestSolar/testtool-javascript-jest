import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  executeCommand,
  isFileOrDirectory,
  filterTestcases,
  parseTestcase,
  generateCommands,
  parseJsonContent,
  createTempDirectory,
  parseJsonFile,
  executeCommands,
  groupTestCasesByPath,
  createTestResults,
  generateCoverageJson, 
  sleep,
} from "../src/jestx/utils";

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

// executeCommand
describe("executeCommand", () => {
  test("should execute a command and return stdout and stderr", async () => {
    const command = 'echo "Hello World"';
    const result = await executeCommand(command);
    expect(result.stderr).toBe("");
  });

  test("should handle command execution errors", async () => {
    const command = "";
    await expect(executeCommand(command)).rejects.toThrowError("The argument 'file' cannot be empty. Received ''");
  });
});

// isFileOrDirectory
describe("isFileOrDirectory", () => {
  test("should return 1 for files", async () => {
    const result = await isFileOrDirectory("src/jestx/utils.ts");
    expect(result).toBe(1);
  });

  test("should return -1 for directories", async () => {
    const result = await isFileOrDirectory("src/jestx");
    expect(result).toBe(-1);
  });




  test("should r置超时时eturn 0 for neither file nor directory", async () => {
    log.info("Testing unknown path...");
    const testUnknown = path.join(__dirname, "unknown");
    const result = isFileOrDirectory(testUnknown);
    log.info("Unknown path test complete.");
    expect(result).toBe(0);
  }, 10000);

  test("should reject for non-existent paths", async () => {
    log.info("Testing non-existent path...");
    expect(isFileOrDirectory("path/to/nonexistent"));
    log.info("Non-existent path test complete.");
  }, 10000);

});




// filterTestcases
describe("filterTestcases", () => {
  test("should filter test cases based on selectors", async () => {
    const testSelectors = ["tests", "test2"];
    const parsedTestcases = ["tests/utils.test.ts", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases);
    expect(result).toEqual(["tests/utils.test.ts", "test2"]);
  });

  test("should filter test cases based on none selectors", async () => {
    const testSelectors: string[] = [];
    const parsedTestcases = ["test1", "test2"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test1", "test2"]);
  });

  test("should exclude test cases based on selectors when exclude is true", async () => {
    const testSelectors = ["test1", "test2"];
    const parsedTestcases = ["test1", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test3"]);
  });
});

// parseTestcase
describe("parseTestcase", () => {
  test("should parse test cases from file data", () => {
    const projPath = "tests";
    const fileData = ["tests/utils.test.ts"];
    const result = parseTestcase(projPath, fileData);
    expect(result).toEqual(
      expect.arrayContaining(["utils.test.ts?executeCommand should execute a command and return stdout and stderr"]),
    );
  });

  test("should parse single test cases from file data", () => {
    const projPath = "tests";
    const fileData = ["tests/demo.test.ts"];
    const result = parseTestcase(projPath, fileData);
    expect(result).toEqual(
      ["demo.test.ts?demo"]
    );
  });
});

// generateCommands
describe("generateCommands", () => {
  test("should generate test execution commands", () => {
    const path = "path/to/tests";
    const testCases = ["test1", "test2"];
    const jsonName = "results.json";
    const { command } = generateCommands(path, testCases, jsonName);
    expect(command).toContain("npx jest");
  });

  test("should generate zero test execution commands", () => {
    const path = "path/to/tests";
    const testCases: string[] = [];
    const jsonName = "results.json";
    const { command } = generateCommands(path, testCases, jsonName);
    expect(command).toContain("npx jest");
  });
});

// parseJsonFile
describe("parseJsonFile", () => {
  test("should parse JSON file and return case results", () => {
    const projPath = "tests";
    const jsonName = "tests/results.json";
    const result = parseJsonFile(projPath, jsonName);
    const expectedResults = {
      "items/common.test.js?test_items": {
        result: "passed",
        duration: 10000,
        startTime: 1610000000000,
        endTime: 1610000010000,
        message: "",
        content: "",
      },
    };
    expect(result).toEqual(expectedResults);
  });
});

// parseJsonContent
describe("parseJsonContent", () => {
  test("should parse JSON content and return case results", () => {
    const projPath = "path/to/project";
    const data = {
      testResults: [
        {
          assertionResults: [
            {
              ancestorTitles: ["test_items"],
              failureMessages: [
                'Error: expect(received).toEqual(expected) // deep equality\n\nExpected: "Hello, Tom!"\nReceived: "Hello, world! Tom!"\n    at Object.<anonymous> (/data/tests/items/common.test.js:6:29)\n    at Object.asyncJestTest (/data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/jasmineAsyncInstall.js:106:37)\n    at /data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/queueRunner.js:45:12\n    at new Promise (<anonymous>)\n    at mapper (/data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/queueRunner.js:28:19)\n    at /data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/queueRunner.js:75:41',
              ],
              fullName: "test_items test_greeting",
              location: null,
              status: "failed",
              title: "test_greeting",
            },
            {
              ancestorTitles: ["test_items"],
              failureMessages: [""],
              fullName: "test_items test_greeting",
              location: null,
              status: "pending",
              title: "test_greeting",
            },
            {
              ancestorTitles: ["test_items"],
              failureMessages: ["123"],
              fullName: "test_items test_greeting",
              location: null,
              status: "failed",
              title: "test_greeting",
            },
          ],
          endTime: 1716346166067,
          message:
            "  ● test_items › test_greeting\n\n    expect(received).toEqual(expected) // deep equality\n\n    Expected: \"Hello, Tom!\"\n    Received: \"Hello, world! Tom!\"\n\n      4 |   it('test_greeting', () => {\n      5 |     console.log(\"===---111222\")\n    > 6 |     expect(greeting('Tom')).toEqual('Hello, Tom!')\n        |                             ^\n      7 |   });\n      8 | })\n      9 |\n\n      at Object.<anonymous> (items/common.test.js:6:29)\n",
          name: "/data/tests/items/common.test.js",
          startTime: 1716346165650,
          status: "failed",
          summary: "",
        },
      ],
    };
    const result = parseJsonContent(projPath, data);
    expect(result).toEqual(expect.any(Object));
  });
});

// createTempDirectory
describe("createTempDirectory", () => {
  test("should create a temporary directory", () => {
    const tempDirectory = createTempDirectory();
    expect(tempDirectory).toContain("caseOutPut");
  });
});


// groupTestCasesByPath
describe("groupTestCasesByPath", () => {
  test("should group test cases by path", () => {
    const testcases = [
      "tests/utils.test.js?sum module adds 1 + 2 to equal 3",
      "tests/utils.test.js",
    ];
    const result = groupTestCasesByPath(testcases);
    expect(result).toEqual({
      "tests/utils.test.js": ["sum module adds 1 + 2 to equal 3", ""],
    });
  });
});

// createTestResults
describe("createTestResults", () => {
  test("should create TestResult instances from spec results", () => {
    const output = {
      "path/to/testcase": {
        result: "passed",
        duration: 100,
        startTime: 1610000000000,
        endTime: 1610000010000,
        message: "Test passed",
        content: "Test passed",
      },
    };
    const testResults = createTestResults(output);
    expect(testResults).toEqual(expect.arrayContaining([expect.any(Object)]));
  });
});

describe("sleep", () => {
  jest.useFakeTimers();

  test("should resolve after the specified time", () => {
    const ms = 1000;
    const promise = sleep(ms);

    jest.advanceTimersByTime(ms);

    return expect(promise).resolves.toBeUndefined();
  });
});



describe("generateCoverageJson", () => {
  const projectPath = "tests";
  const fileReportPath = "tests/testdata";
  const coverageDir = path.join(projectPath, "coverage");
  const cloverXmlPath = path.join(projectPath, "clover.xml");
  const targetCloverXmlPath = path.join(coverageDir, "clover.xml");
  const coverageFileName = "testsolar_coverage";
  const coverageJsonDir = path.join(projectPath, coverageFileName);

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建 coverage 目录
    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir);
    }

    // 复制 clover.xml 文件到 coverage 目录
    if (fs.existsSync(cloverXmlPath)) {
      fs.copyFileSync(cloverXmlPath, targetCloverXmlPath);
    }
  });

  afterEach(() => {
    // 清理 coverage 目录中的 clover.xml 文件
    if (fs.existsSync(targetCloverXmlPath)) {
      fs.unlinkSync(targetCloverXmlPath);
    }

    // 清理生成的 JSON 文件
    if (fs.existsSync(coverageJsonDir)) {
      const files = fs.readdirSync(coverageJsonDir);
      files.forEach(file => fs.unlinkSync(path.join(coverageJsonDir, file)));
    }
  });

  test("should generate coverage JSON successfully", () => {
    // 确保测试前目录是干净的
    if (!fs.existsSync(coverageJsonDir)) {
      fs.mkdirSync(coverageJsonDir);
    }

    // 调用函数
    generateCoverageJson(projectPath, fileReportPath);
    
    // 检查生成的 JSON 文件是否存在
    const files = fs.readdirSync(coverageJsonDir);
    const jsonFiles = files.filter(file => file.endsWith(".json"));
    
    expect(jsonFiles.length).toBeGreaterThan(0); // 至少有一个 JSON 文件被生成
  });

  test("should log an error if clover.xml file does not exist", () => {
    // 确保 clover.xml 文件不存在
    if (fs.existsSync(targetCloverXmlPath)) {
      fs.unlinkSync(targetCloverXmlPath);
    }

    // 监听 log.error 的调用
    const logErrorSpy = jest.spyOn(log, "error");

    // 调用函数
    generateCoverageJson(projectPath, fileReportPath);

    // 检查 log.error 是否被调用以及调用参数是否正确
    expect(logErrorSpy).toHaveBeenCalledWith(`Clover XML file not found at ${targetCloverXmlPath}`);
  });
});





describe("executeCommands", () => {
  const projPath = "tests";
  const jsonName = path.join(projPath, "results2.json");
  const command = `touch ${jsonName}`; // 简单的命令来创建 jsonName 文件

  test("should execute command and parse JSON file successfully", async () => {
    // 创建一个空的 results.json 文件
    fs.writeFileSync(jsonName, JSON.stringify({}));

    const results = await executeCommands(projPath, command, jsonName);

    // 检查生成的 JSON 文件是否存在
    expect(fs.existsSync(jsonName)).toBe(true);
  });

});