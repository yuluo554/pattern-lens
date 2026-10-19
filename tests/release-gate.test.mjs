// 发布门（tools/check-release.mjs）的运行时形态守门。
// **刻意只测门的形态，不测"当前 0 FAIL"**——发布门在发布前本来就该红（K31），
// 若把"当前全绿"钉进常驻测试，发布前 CI 必红、发布后又会随留档入库而翻转（门自变族）。
// 判据全落在"门自己的输出"上：结论行数 = 汇总计数、SKIP 与 PASS 分开、缺档态可构造。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = join(ROOT, "tools", "check-release.mjs");

function runGate(args = [], env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [GATE, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? -1, stdout: String(error.stdout ?? "") };
  }
}

/** 指向一个不存在的留档路径——把"缺档"这一瞬态变成可重复构造的输入（与 M6 进度解耦）。 */
const ABSENT_DOC = { RELEASE_DOC_PATH: "plan/__absent-release-doc__.md" };
const linePattern = /^(PASS|FAIL|SKIP)\s{2}/;

function conclusionLines(stdout) {
  return stdout.split("\n").filter((line) => linePattern.test(line));
}

test("发布门：离线模式每项恰好一行结论，同一检查项不重复出结论", () => {
  const { stdout } = runGate();
  const lines = conclusionLines(stdout);
  assert.ok(lines.length >= 12, `结论行过少: ${lines.length}`);
  const ids = lines.map((line) => line.trim().split(/\s{2,}/)[1]);
  assert.equal(new Set(ids).size, ids.length, "同一检查项不得重复出结论");
  assert.match(stdout, /SKIP 不计入 PASS/);
});

test("发布门：离线模式不把远端项写成 PASS（SKIP 不冒充通过）", () => {
  const { stdout } = runGate();
  for (const id of ["REPO_PUBLIC", "REMOTE_TAG", "REMOTE_RELEASE", "RELEASE_ASSET_SHA"]) {
    assert.match(stdout, new RegExp(`^SKIP\\s{2}${id}\\b`, "m"));
    assert.doesNotMatch(stdout, new RegExp(`^PASS\\s{2}${id}\\b`, "m"));
  }
});

test("发布门：结论行数 = 汇总三项之和（门自己数『这轮扫到了几个』）", () => {
  const { stdout } = runGate();
  const summary = /PASS (\d+) \/ FAIL (\d+) \/ SKIP (\d+)/.exec(stdout);
  assert.ok(summary, "缺少汇总行");
  const total = Number(summary[1]) + Number(summary[2]) + Number(summary[3]);
  assert.equal(total, conclusionLines(stdout).length);
  assert.match(stdout, /这轮扫到：检查项 \d+/);
});

test("发布门：--pre-tag 时缺失发布留档报 SKIP 而不是 FAIL（门能随预备提交进 tag 树）", () => {
  const { stdout } = runGate(["--pre-tag"], ABSENT_DOC);
  assert.match(stdout, /^SKIP\s{2}RELEASE_DOC\b/m);
  assert.doesNotMatch(stdout, /^FAIL\s{2}RELEASE_DOC\b/m);
});

test("发布门：离线模式缺失发布留档报 FAIL（缺档不得伪装成通过）", () => {
  const { stdout } = runGate([], ABSENT_DOC);
  assert.match(stdout, /^FAIL\s{2}RELEASE_DOC\b/m);
});

test("发布门：被检查对象不存在时仍跑完其余检查、不崩（rc=1 但结论行齐）", () => {
  const { code, stdout } = runGate([], ABSENT_DOC);
  assert.equal(code, 1, "缺档应为发布未达成（exit 1），不是环境缺失（exit 3）");
  const lines = conclusionLines(stdout);
  assert.ok(lines.length >= 12, `缺档下仍应给出全部检查结论，实际 ${lines.length} 行`);
  // 留档派生项不得静默消失：三条都要有结论（SKIP 或 FAIL 均可，但不许缺行）
  for (const id of ["RELEASE_DOC", "RELEASE_DOC_NO_DIGEST", "COVERAGE_TABLE"]) {
    assert.match(stdout, new RegExp(`^(PASS|FAIL|SKIP)\\s{2}${id}\\b`, "m"));
  }
});

test("发布门：留档存在时两栏齐备 → RELEASE_DOC PASS（与 --pre-tag 同判）", () => {
  const preTag = runGate(["--pre-tag"]);
  const offline = runGate();
  assert.match(preTag.stdout, /^PASS\s{2}RELEASE_DOC\s+两栏: true\/true/m);
  assert.match(offline.stdout, /^PASS\s{2}RELEASE_DOC\s+两栏: true\/true/m);
});

test("发布门：覆盖对账表三态逐条（归宿列不许留空）——留档在位时 PASS", () => {
  const { stdout } = runGate(["--pre-tag"]);
  assert.match(stdout, /^PASS\s{2}COVERAGE_TABLE\s+\d+ 行三态齐备/m);
});

test("发布门：包内文档不许写附件 sha256（写入动作会改包内容）", () => {
  const { stdout } = runGate(["--pre-tag"]);
  assert.match(stdout, /^PASS\s{2}RELEASE_DOC_NO_DIGEST\b/m);
});

test("发布门：用法错误 → exit 2（未知参数不静默吞掉）", () => {
  const { code } = runGate(["--bogus"]);
  assert.equal(code, 2);
});

test("发布门：脱敏扫描走文件级豁免且有阳性对照（判据不许是空的）", () => {
  const { stdout } = runGate(["--pre-tag"]);
  assert.match(stdout, /^PASS\s{2}NO_LOCAL_PATHS\s+0 命中（豁免 2 份：扫描器与留档；阳性对照通过）/m);
});
