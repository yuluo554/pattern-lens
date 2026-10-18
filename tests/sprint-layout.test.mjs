// 布局门自身的守门：
//   ① 当前工作树全绿（布局是常驻不变量，不是发布期一次性动作）；
//   ② 门报出"这轮扫到了几个"（非空跑自证）；
//   ③ 被检查对象不存在时报 FAIL 并跑完，不崩；
//   ④ 判据只落仓库内文件（不读 git 元数据 / 不起子进程）——浅克隆与无 .git 形态下结论不变；
//   ⑤ 六组变异验证：改坏任一处 → 门必须变红（**变异后仍绿 = 假门**）。
//     变异都在中立临时目录里做（跑的是副本里的门脚本——门按自身路径定位仓库根，
//     跑原路径时它仍在扫真仓库，缺档分支永远不会执行）。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = join(ROOT, "tools", "check-sprint-layout.mjs");

function runGate(script = GATE, cwd = ROOT) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [script], { cwd, encoding: "utf8" }) };
  } catch (error) {
    return { code: error.status ?? -1, stdout: String(error.stdout ?? "") + String(error.stderr ?? "") };
  }
}

function sandbox(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pl-layout-${prefix}-`));
  for (const entry of ["plan", "data", "tools", ".github", "AGENTS.md", "README.md"]) {
    cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  }
  return dir;
}

function runInSandbox(dir) {
  return runGate(join(dir, "tools", "check-sprint-layout.mjs"), dir);
}

test("布局门：当前工作树全绿", () => {
  const { code, stdout } = runGate();
  assert.equal(code, 0, `布局门应常绿；实际 rc=${code}\n${stdout}`);
});

test("布局门：每项一行结论，且报出「这轮扫到了几个」（非空跑自证）", () => {
  const { stdout } = runGate();
  const lines = stdout.split("\n").filter((line) => /^(PASS|FAIL)\s{2}LAYOUT\./.test(line));
  assert.ok(lines.length >= 8, `结论行过少：${lines.length}`);
  const ids = lines.map((line) => line.trim().split(/\s{2,}/)[1]);
  assert.equal(new Set(ids).size, ids.length, "同一检查项不得重复出结论");
  assert.match(stdout, /这轮扫到：文档 \d+ \/ 交接单 \d+ \/ 状态副本 \d+/);
  assert.match(stdout, /^结论: /m);
});

test("布局门：被检查对象不存在时报 FAIL 并跑完，不崩", () => {
  const dir = sandbox("missing");
  try {
    rmSync(join(dir, "AGENTS.md"));
    const { code, stdout } = runInSandbox(dir);
    assert.equal(code, 1, "缺 AGENTS.md 应判 FAIL（rc=1）");
    assert.match(stdout, /^FAIL\s{2}LAYOUT\.FILES\s+缺: AGENTS\.md/m);
    assert.match(stdout, /^结论: \d+ 项 FAIL/m, "应跑完并给出结论");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("布局门：判据不依赖 git / 子进程（浅克隆与无 .git 形态下结论不变）", () => {
  const source = readFileSync(GATE, "utf8");
  const forbidden = ["execFileSync", "execSync", "spawnSync", "child_process"];
  const hit = forbidden.filter((needle) => source.includes(needle));
  assert.deepEqual(hit, [], `布局门不应依赖 git / 子进程（命中：${hit.join(",")}）`);
});

// ── 六组变异验证（照抄 methodology-binding §二 的清单，逐条换成本仓路径）────────────
const MUTATIONS = [
  {
    name: "M1 删 AGENTS.md",
    expect: /^FAIL\s{2}LAYOUT\.FILES/m,
    apply: (dir) => rmSync(join(dir, "AGENTS.md")),
  },
  {
    name: "M2 把一个 ✅ 里程碑在某一个副本里翻成 ⬜",
    expect: /^FAIL\s{2}LAYOUT\.STATUS/m,
    apply: (dir) => {
      const path = join(dir, "README.md");
      const text = readFileSync(path, "utf8");
      const next = text.replace("| M0 | 计划套件 + 方法论装订 + 可运行骨架（规则数据 / 判定核心 / 导出 / 门 / CI） | ✅ 2026-10-18 |", "| M0 | 计划套件 + 方法论装订 + 可运行骨架（规则数据 / 判定核心 / 导出 / 门 / CI） | ⬜ 未开始 |");
      assert.notEqual(next, text, "变异未生效：README 状态行没匹配上（判据会假绿）");
      writeFileSync(path, next);
    },
  },
  {
    name: "M3 删一份必需的交接单",
    expect: /^FAIL\s{2}LAYOUT\.HANDOFFS/m,
    apply: (dir) => rmSync(join(dir, "plan", "HANDOFF-M1.md")),
  },
  {
    name: "M4 删 plan/00 顶部整行装订行",
    expect: /^FAIL\s{2}LAYOUT\.BINDING_HEAD/m,
    apply: (dir) => {
      const path = join(dir, "plan", "00-README总览.md");
      const lines = readFileSync(path, "utf8").split("\n");
      const kept = lines.filter((line) => !line.includes("check-sprint-layout"));
      assert.notEqual(kept.length, lines.length, "变异未生效：装订行没找到");
      writeFileSync(path, kept.join("\n"));
    },
  },
  {
    name: "M5 删 plan/07 的「缺口」表头（判据表搬走）",
    expect: /^FAIL\s{2}LAYOUT\.GAPS/m,
    apply: (dir) => {
      const path = join(dir, "plan", "07-交付对标与发布计划.md");
      const lines = readFileSync(path, "utf8").split("\n");
      const kept = lines.filter((line) => !(line.startsWith("|") && line.includes("缺口")));
      assert.notEqual(kept.length, lines.length, "变异未生效：缺口表头没找到");
      writeFileSync(path, kept.join("\n"));
    },
  },
  {
    name: "M6 删 CI 里的布局门步骤",
    expect: /^FAIL\s{2}LAYOUT\.CI/m,
    apply: (dir) => {
      const path = join(dir, ".github", "workflows", "ci.yml");
      const text = readFileSync(path, "utf8");
      const next = text.replace("node tools/check-sprint-layout.mjs", "node tools/check-release.mjs");
      assert.notEqual(next, text, "变异未生效：CI 里的门命令没找到");
      writeFileSync(path, next);
    },
  },
];

for (const mutation of MUTATIONS) {
  test(`布局门变异验证：${mutation.name} → 必须变红`, () => {
    const dir = sandbox(`mut-${mutation.name.slice(0, 2)}`);
    try {
      const before = runInSandbox(dir);
      assert.equal(before.code, 0, `变异前副本应全绿（拿它当基线）；实际 rc=${before.code}\n${before.stdout}`);
      mutation.apply(dir);
      const after = runInSandbox(dir);
      assert.equal(after.code, 1, `变异后应变红；实际 rc=${after.code}\n${after.stdout}`);
      assert.match(after.stdout, mutation.expect, `应变红的检查项不对：\n${after.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
