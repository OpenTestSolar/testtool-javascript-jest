import * as process from "process";
import { runTestCase } from "./jestx/excutor";

// 从命令行参数中获取文件路径
const runParamFile = process.argv[2];

// 定义一个用于运行测试用例的函数
async function main() {
  try {
    await runTestCase(runParamFile);
    console.log("Run result reported successfully");
  } catch (error) {
    console.error("Failed to run test cases:", error);
  }
}

// 使脚本可以直接通过 Node.js 运行
if (require.main === module) {
  main();
}
