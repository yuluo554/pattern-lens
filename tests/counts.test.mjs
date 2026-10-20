// 计数守门（二次迭代 B2.3）：测试数漂移过一次实测——plan/RELEASE-M6.md 同一页写「254 项」与「255 项」
// （tag 树与 HEAD 自相矛盾）。本守门把"文档登记数与实测不一致"变成红灯。
//
// 口径：
// - 登记锚点：`plan/RELEASE-M6.md` §二（tag 后追加）里的「当前测试数登记」行——它是**活锚点**，
//   每次新增/删除测试都必须同步；§一 的「255 项」是 tag 前历史事实，**不**参与比对（不许改历史）。
// - 实测面：真跑一遍测试命令（复用 package.json 的 scripts.test 文件列表），
//   解析 node --test 汇总行的「ℹ tests N」。
// - 测试数变了时，正确动作 = 更新那个活锚点数字，不是改这条守门。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function registeredCount() {
  const text = readFileSync(join(ROOT, "plan", "RELEASE-M6.md"), "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.includes("当前测试数登记"));
  assert.equal(lines.length, 1, `plan/RELEASE-M6.md 里「当前测试数登记」锚点行应恰好 1 条，实测 ${lines.length}`);
  const match = lines[0].match(/\*\*(\d+) 项\*\*/);
  assert.ok(match, `锚点行没有「**N 项**」格式：${lines[0].trim().slice(0, 80)}`);
  return Number(match[1]);
}

function actualCount() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const all = (pkg.scripts?.test ?? "")
    .split(/\s+/)
    .filter((token) => token.startsWith("tests/") && token.endsWith(".test.mjs"));
  assert.ok(all.length > 0, "package.json scripts.test 里没有测试文件");
  // 内层跑"清单去掉本文件"（本文件已在跑，再带上会无限递归 spawn），结果 + 1（本文件 1 项）。
  const files = all.filter((file) => file !== "tests/counts.test.mjs");
  // 必须剥掉测试运行器注入的 NODE_TEST_CONTEXT / NODE_TEST_WORKER_ID：
  // 不剥的话，内层 node --test 误判为"递归 run()"而跳过全部文件（stdout 为空、无汇总行）。
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_TEST_WORKER_ID;
  delete childEnv.NODE_OPTIONS;
  const output = execFileSync(process.execPath, ["--test", ...files], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1e8,
    env: childEnv,
  }).toString();
  const match = output.match(/^ℹ tests (\d+)\r?$/m);
  assert.ok(match, "node --test 输出里没找到「ℹ tests N」汇总行");
  return Number(match[1]) + 1;
}

test("「当前测试数登记」锚点与实测 tests 数一致（计数守门；新增测试须同步锚点）", () => {
  const registered = registeredCount();
  const actual = actualCount();
  assert.equal(
    actual,
    registered,
    `测试数漂移：实测 ${actual}，登记 ${registered}。正确动作 = 更新 plan/RELEASE-M6.md 的「当前测试数登记」锚点，不是改本守门。`,
  );
});
