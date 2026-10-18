// CI 工作流静态自查（零依赖；不做完整 YAML 解析，只做**能抓真实故障**的结构判据）：
//   ① 步骤 `name` 里不得出现**裸 `: `**——GitHub 会直接不建 job（run 显示 failure 而 jobs=0，
//      文件字节与 state 看着都正常）——这是发布期最难诊断的一类；本项目实测过同族形态；
//   ② job / step 计数与必需步骤清单（顺序也要对：布局门在最前，verify 在最后）；
//   ③ 矩阵 os × node 就是那四个组合（四矩阵同点全红 = 接线缺陷，不是平台差异）；
//   ④ 阳性对照：把一条 name 改成裸 `: ` → 同一检查器必须报出来（否则它只是"看起来在查"）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = ".github/workflows/ci.yml";
const REQUIRED_STEPS = [
  "node tools/check-sprint-layout.mjs",
  "node tools/hash-rules.mjs --check",
  "npm test",
  "npm run build",
  "node tools/build-extension.mjs --check",
  "npm run verify",
];

export function stepNames(yaml) {
  return [...yaml.matchAll(/^\s*-\s*name:\s*(.+)$/gm)].map((match) => match[1].trim());
}

/** 裸 `: ` = 值里出现未加引号的 ": "（整行第一个 ": " 是键值分隔，之后的才算裸）。 */
export function bareColonProblems(yaml) {
  const problems = [];
  for (const line of yaml.split("\n")) {
    const match = /^\s*-\s*name:\s*(.+)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (!quoted && value.includes(": ")) problems.push(value);
  }
  return problems;
}

const yaml = readFileSync(join(ROOT, WORKFLOW), "utf8");

test("步骤 name 里没有裸 `: `（会让 GitHub 不建 job，run 报 failure 而 jobs=0）", () => {
  assert.deepEqual(bareColonProblems(yaml), []);
  assert.ok(stepNames(yaml).length >= 6, `步骤过少：${stepNames(yaml).length}`);
});

test("阳性对照：同一检查器能抓出注入的裸冒号（否则上面的零命中证明不了任何事）", () => {
  const broken = yaml.replace('- name: "Full self-check"', "- name: Full self-check: 全量");
  assert.notEqual(broken, yaml, "变异未生效：没找到可替换的步骤名（判据会假绿）");
  assert.deepEqual(bareColonProblems(broken), ["Full self-check: 全量"]);
});

test("必需步骤都在，且顺序正确（布局门最前 → verify 最后）", () => {
  const positions = REQUIRED_STEPS.map((needle) => {
    const index = yaml.indexOf(needle);
    assert.ok(index >= 0, `工作流里缺步骤命令：${needle}`);
    return index;
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "步骤顺序与声明不符");
  assert.ok(yaml.indexOf(REQUIRED_STEPS[0]) < yaml.indexOf("npm test"), "布局门必须在测试之前");
});

test("矩阵 = 2 个 OS × 2 个 node（四个 job；同点全红即接线缺陷）", () => {
  assert.match(yaml, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(yaml, /node: \["22", "24"\]/);
  assert.match(yaml, /fail-fast: false/);
});

test("工作流只有 1 个 job，且不申请写权限（contents: read）", () => {
  const start = yaml.indexOf("\njobs:");
  assert.ok(start >= 0, "工作流里找不到 jobs: 块");
  const jobsBlock = yaml.slice(start + 1);
  const jobKeys = [...jobsBlock.matchAll(/^ {2}([a-z][\w-]*):$/gm)].map((match) => match[1]);
  assert.deepEqual(jobKeys, ["verify"], `job 列表 = ${jobKeys.join(",")}`);
  assert.match(yaml, /^permissions:\n {2}contents: read$/m);
});
