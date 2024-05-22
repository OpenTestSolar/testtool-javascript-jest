import {describe, expect, test} from '@jest/globals';
import * as fs from 'fs';
import {
    executeCommand,
    isFileOrDirectory,
    filterTestcases,
    parseTestcase,
    generateCommands,
    parseJsonContent,
    createTempDirectory,
    parseJsonFile,
    groupTestCasesByPath,
    createTestResults,
  } from '../src/jestx/utils';

// executeCommand

describe('executeCommand', () => {
  test('should execute a command and return stdout and stderr', async () => {
    const command = 'echo "Hello World"';
    const result = await executeCommand(command);
    expect(result.stdout.trim()).toBe('Hello World');
    expect(result.stderr).toBe('');
  });

  test('should handle command execution errors', async () => {
    const command = 'nonexistentcommand';
    const result = await executeCommand(command);
    expect(result.error).toBeDefined();
  });
});

// isFileOrDirectory
describe('isFileOrDirectory', () => {
  test('should return 1 for files', async () => {
    const result = await isFileOrDirectory('src/jestx/utils.ts');
    expect(result).toBe(1);
  });

  test('should return -1 for directories', async () => {
    const result = await isFileOrDirectory('src/jestx');
    expect(result).toBe(-1);
  });

  test('should reject for non-existent paths', async () => {
    await expect(isFileOrDirectory('path/to/nonexistent')).rejects.toThrow();
  });
});

// filterTestcases
describe('filterTestcases', () => {
  test('should filter test cases based on selectors', async () => {
    const testSelectors = ['tests', 'test2'];
    const parsedTestcases = ['tests/sum.test.ts', 'test2', 'test3'];
    const result = await filterTestcases(testSelectors, parsedTestcases);
    expect(result).toEqual(['tests/sum.test.ts', 'test2']);
  });

  test('should exclude test cases based on selectors when exclude is true', async () => {
    const testSelectors = ['test1', 'test2'];
    const parsedTestcases = ['test1', 'test2', 'test3'];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(['test3']);
  });
});

// parseTestcase
describe('parseTestcase', () => {
  test('should parse test cases from file data', () => {
    const projPath = 'tests';
    const fileData = ['tests/sum.test.ts'];
    const result = parseTestcase(projPath, fileData);
    expect(result).toEqual(expect.arrayContaining(['sum.test.ts?sum module adds 1 + 2 to equal 3']));
  });
});

// generateCommands
describe('generateCommands', () => {
  test('should generate test execution commands', () => {
    const path = 'path/to/tests';
    const testCases = ['test1', 'test2'];
    const jsonName = 'results.json';
    const { command } = generateCommands(path, testCases, jsonName);
    expect(command).toContain('npx jest');
  });

  test('should generate zero test execution commands', () => {
    const path = 'path/to/tests';
    const testCases: string[] = [];
    const jsonName = 'results.json';
    const { command } = generateCommands(path, testCases, jsonName);
    expect(command).toContain('npx jest');
  });
});

// parseJsonFile
describe('parseJsonFile', () => {
    test('should parse JSON file and return case results', () => {
        const projPath = 'tests';
        const jsonName = 'tests/results.json';
        const result = parseJsonFile(projPath, jsonName);
        const expectedResults = {
            'items/common.test.js?test_items': {
              result: 'passed',
              duration: 10000,
              startTime: 1610000000000,
              endTime: 1610000010000,
              message: '',
              content: '',
            },
          };
        expect(result).toEqual(expectedResults);
    });
});

// parseJsonContent
describe('parseJsonContent', () => {
  test('should parse JSON content and return case results', () => {
    const projPath = 'path/to/project';
    const data = {
      testResults: [
        {
            "assertionResults": [
              {
                "ancestorTitles": [
                  "test_items"
                ],
                "failureMessages": [
                  "Error: expect(received).toEqual(expected) // deep equality\n\nExpected: \"Hello, Tom!\"\nReceived: \"Hello, world! Tom!\"\n    at Object.<anonymous> (/data/tests/items/common.test.js:6:29)\n    at Object.asyncJestTest (/data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/jasmineAsyncInstall.js:106:37)\n    at /data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/queueRunner.js:45:12\n    at new Promise (<anonymous>)\n    at mapper (/data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/queueRunner.js:28:19)\n    at /data/tests/node_modules/.pnpm/jest-jasmine2@26.6.3/node_modules/jest-jasmine2/build/queueRunner.js:75:41"
                ],
                "fullName": "test_items test_greeting",
                "location": null,
                "status": "failed",
                "title": "test_greeting"
              }
            ],
            "endTime": 1716346166067,
            "message": "  ● test_items › test_greeting\n\n    expect(received).toEqual(expected) // deep equality\n\n    Expected: \"Hello, Tom!\"\n    Received: \"Hello, world! Tom!\"\n\n      4 |   it('test_greeting', () => {\n      5 |     console.log(\"===---111222\")\n    > 6 |     expect(greeting('Tom')).toEqual('Hello, Tom!')\n        |                             ^\n      7 |   });\n      8 | })\n      9 |\n\n      at Object.<anonymous> (items/common.test.js:6:29)\n",
            "name": "/data/tests/items/common.test.js",
            "startTime": 1716346165650,
            "status": "failed",
            "summary": ""
          }
      ],
    };
    const result = parseJsonContent(projPath, data);
    expect(result).toEqual(expect.any(Object));
  });
});

// createTempDirectory
describe('createTempDirectory', () => {
  test('should create a temporary directory', () => {
    const tempDirectory = createTempDirectory();
    expect(tempDirectory).toContain('caseOutPut');
  });
});

// executeCommands
describe('executeCommands', () => {
    const command = 'npx jest tests/sum.test.ts  --json --outputFile=tests/sum.test.js.json --color=false ';
    const filePath = 'tests/sum.test.js.json';
  
    test('should check if the file exists', () => {
      executeCommand(command);    
      // Check if the file exists
      const fileExists = fs.existsSync(filePath);
      expect(fileExists).toBe(true);
    });
  
    test('should check if the file content has expected fields', () => {
      if (fs.existsSync(filePath)) {
        // Read the file content
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonContent = JSON.parse(fileContent);
  
        // Verify specific fields in the JSON content
        const assertionResult = jsonContent.testResults[0].assertionResults[0];
        expect(assertionResult.fullName).toBe('sum module adds 1 + 2 to equal 3');
        expect(assertionResult.status).toBe('passed');
  
        // Verify the test name and path
        expect(jsonContent.testResults[0].name).toContain('sum.test.ts');
        expect(jsonContent.testResults[0].status).toBe('passed');
      } else {
        throw new Error(`File ${filePath} does not exist.`);
      }
    });
});


describe('Dynamic File Content Check', () => {
    
  });



// groupTestCasesByPath
describe('groupTestCasesByPath', () => {
  test('should group test cases by path', () => {
    const testcases = ['tests/sum.test.js?sum module adds 1 + 2 to equal 3'];
    const result = groupTestCasesByPath(testcases);
    expect(result).toEqual({
      'tests/sum.test.js': ['sum module adds 1 + 2 to equal 3'],
    });
  });
});

// createTestResults
describe('createTestResults', () => {
  test('should create TestResult instances from spec results', () => {
    const output = {
      'path/to/testcase': {
        result: 'passed',
        duration: 100,
        startTime: 1610000000000,
        endTime: 1610000010000,
        message: 'Test passed',
        content: 'Test passed',
      },
    };
    const testResults = createTestResults(output);
    expect(testResults).toEqual(expect.arrayContaining([expect.any(Object)]));
  });
});