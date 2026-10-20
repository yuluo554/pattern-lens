#!/usr/bin/env node
// 计数守门（二次迭代 B2.3，2026-10-21 改为独立脚本）：测试数漂移过一次实测——
// plan/RELEASE-M6.md 同一页写「254 项」与「255 项」（tag 树与 HEAD 自相矛盾）。
// 本门把"文档登记数与实测不一致"变成红灯。
//
// 为什么是独立脚本而不是 node:test 里的测试：守门需要拿到 node --test 的**全量汇总行**，
// 在测试内部再 spawn 全量会有三个坑（2026-10-20 CI 实测）：
//   ① node22 下运行器注入的环境变量让内层误判"递归 run()"而跳过全部文件（stdout 空、无汇总行）；
//   ② 内层全量与外层并行测试抢 CPU，把 bench 压力页挤过预算（windows/node22 冷 503.7ms > 500ms）；
//   ③ 内层任何一项红都会连坐本门（守门该报的是"计数漂移"，不是转述别人的失败）。
// 独立脚本无 NODE_TEST_CONTEXT，且由 verify 串行调度（见 tools/verify.mjs 的 test.count 段）。
//
// 口径：
// - 登记锚点：`plan/RELEASE-M6.md` 里的「当前测试数登记」行——它是**活锚点**，每次新增/删除测试都必须同步；
//   §一 的「255 项」是 tag 前历史事实，**不**参与比对（不许改历史）。
// - 实测面：真跑一遍测试命令（复用 package.json 的 scripts.test 文件列表），解析「ℹ tests N」。
// - 测试数变了时，正确动作 = 更新活锚点数字，不是改本门。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  process.stderr.write(`FAIL  test.count            ${message}\n`);
  process.exitCode = 1;
}

function registeredCount() {
  const text = readFileSync(join(ROOT, "plan", "RELEASE-M6.md"), "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.includes("当前测试数登记"));
  if (lines.length !== 1) {
    fail(`plan/RELEASE-M6.md 里「当前测试数登记」锚点行应恰好 1 条，实测 ${lines.length}`);
    return null;
  }
  const match = lines[0].match(/\*\*(\d+) 项\*\*/);
  if (!match) {
    fail(`锚点行没有「**N 项**」格式：${lines[0].trim().slice(0, 80)}`);
    return null;
  }
  return Number(match[1]);
}

function actualCount() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const files = (pkg.scripts?.test ?? "")
    .split(/\s+/)
    .filter((token) => token.startsWith("tests/") && token.endsWith(".test.mjs"));
  if (files.length === 0) {
    fail("package.json scripts.test 里没有测试文件");
    return null;
  }
  let output = "";
  try {
    output = execFileSync(process.execPath, ["--test", ...files], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1e8,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // 内层有失败测试时命令非零——汇总行照样在 stdout 里，本门只管计数，失败详情交给 npm test / verify 的 tests 段。
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  // 汇总行两种格式（node 版本决定默认 reporter）：spec =「ℹ tests N」（node 24+）、TAP =「# tests N」（node 22）。
  const match = output.match(/^\s*[#ℹ] tests (\d+)\r?$/m);
  if (!match) {
    fail("node --test 输出里没找到「tests N」汇总行（spec 的 ℹ 行与 TAP 的 # 行都不在）");
    return null;
  }
  return Number(match[1]);
}

const registered = registeredCount();
const actual = actualCount();
if (registered === null || actual === null) process.exit(1);
if (actual !== registered) {
  process.stderr.write(
    `FAIL  test.count            测试数漂移：实测 ${actual}，登记 ${registered}。正确动作 = 更新 plan/RELEASE-M6.md 的「当前测试数登记」锚点，不是改本门。\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS  test.count            实测 ${actual} 项 == 「当前测试数登记」锚点\n`);
}
