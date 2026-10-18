// 冻结产物守门（M1；两层守门的第①层之产物侧 + 第②层的变异自证）：
//   ① 冻结产物形态：40 页齐 + 每页三件套 + COVERAGE.md / README.md / stress-5k；
//   ② COVERAGE.md 是**生成物**：逐规则计数与合计必须与真值复算一致（手编即红）；
//   ③ style-map 覆盖每条真值 selector_path（M2 建模依赖它，缺了会静默降级）；
//   ④ 第②层：`fixtures:check`（再生成位级一致）在本仓必须绿；
//   ⑤ 变异验证：①手工改坏冻结产物 ②改坏生成器 → 至少一层必红（两层都在才不是假门）。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fixturesDir,
  loadCorpus,
  pageIds,
  parseCoverageMarkdown,
  parseCoverageTotals,
  recomputeCoverage,
  validateTruthShape,
} from "./helpers/fixtures.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "rules", "manifest.json"), "utf8"));
const RULE_IDS = new Set(MANIFEST.match_priority);
const THRESHOLDS = MANIFEST.thresholds;
const GENERATOR = join(ROOT, "tools", "gen-fixtures.mjs");

const CORPUS = loadCorpus(ROOT);
const COVERAGE_TEXT = existsSync(join(fixturesDir(ROOT), "COVERAGE.md"))
  ? readFileSync(join(fixturesDir(ROOT), "COVERAGE.md"), "utf8")
  : null;

function runGenerator(dir, args = []) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [join(dir, "tools", "gen-fixtures.mjs"), ...args], {
      cwd: dir,
      encoding: "utf8",
    }) };
  } catch (error) {
    return { code: error.status ?? -1, stdout: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function sandbox(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pl-fixtures-${prefix}-`));
  for (const entry of ["tools", "src", "rules", "data"]) cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(dir, "package.json"));
  return dir;
}

test("冻结产物齐备：40 页三件套 + COVERAGE.md + README.md + stress-5k", () => {
  const ids = pageIds(ROOT);
  assert.equal(ids.length, THRESHOLDS.fixture_page_count, `页数应为 ${THRESHOLDS.fixture_page_count}，实际 ${ids.length}`);
  for (const page of CORPUS) {
    assert.ok(page.html !== null, `${page.id}/page.html 缺`);
    assert.ok(page.styleMap !== null && !page.styleMap.__parseError, `${page.id}/style-map.json 缺或不可解析`);
    assert.ok(page.truth !== null && !page.truth.__parseError, `${page.id}/truth.json 缺或不可解析`);
  }
  assert.ok(COVERAGE_TEXT !== null, "data/fixtures/COVERAGE.md 缺（应由生成器产出）");
  assert.ok(existsSync(join(fixturesDir(ROOT), "README.md")), "data/fixtures/README.md 缺（应由生成器产出）");
  assert.ok(existsSync(join(fixturesDir(ROOT), "stress-5k", "page.html")), "stress-5k/page.html 缺");
  assert.ok(COVERAGE_TEXT.includes("禁止手编"), "COVERAGE.md 必须声明自己是生成物");
});

test("COVERAGE.md 是生成物：逐规则正/负样本计数与真值复算逐条一致", () => {
  const parsed = parseCoverageMarkdown(COVERAGE_TEXT);
  assert.equal(parsed.size, RULE_IDS.size, `覆盖矩阵行数 ${parsed.size} ≠ 规则数 ${RULE_IDS.size}`);
  const { perRule } = recomputeCoverage(CORPUS, RULE_IDS);
  const mismatches = [];
  for (const ruleId of RULE_IDS) {
    const expected = perRule.get(ruleId);
    const actual = parsed.get(ruleId);
    if (!actual) {
      mismatches.push(`${ruleId}: 覆盖矩阵缺行`);
      continue;
    }
    if (actual.positive !== expected.positive) mismatches.push(`${ruleId}: 正样本 ${actual.positive} ≠ 真值复算 ${expected.positive}`);
    if (actual.negative !== expected.negative) mismatches.push(`${ruleId}: 负样本 ${actual.negative} ≠ 真值复算 ${expected.negative}`);
  }
  assert.deepEqual(mismatches, [], mismatches.join("；"));
});

test("COVERAGE.md 合计小节与真值复算一致（分母不是手写的）", () => {
  const totals = parseCoverageTotals(COVERAGE_TEXT);
  const { positives, negatives } = recomputeCoverage(CORPUS, RULE_IDS);
  assert.equal(totals["页面"], CORPUS.length, `合计页面数 ${totals["页面"]} ≠ ${CORPUS.length}`);
  assert.equal(totals["规则"], RULE_IDS.size, `合计规则数 ${totals["规则"]} ≠ ${RULE_IDS.size}`);
  assert.equal(totals["正样本"], positives, `合计正样本 ${totals["正样本"]} ≠ ${positives}`);
  assert.equal(totals["负样本"], negatives, `合计负样本 ${totals["负样本"]} ≠ ${negatives}`);
  assert.ok(positives >= RULE_IDS.size * THRESHOLDS.min_cases_per_rule, "正样本总数低于下限总和");
});

test("style-map.json 覆盖每条真值 selector_path（M2 建模依赖，缺了会静默降级）", () => {
  let checked = 0;
  const missing = [];
  for (const page of CORPUS) {
    const declared = new Set(Object.keys(page.styleMap.styles ?? {}));
    for (const entry of [...(page.truth.positives ?? []), ...(page.truth.negatives ?? [])]) {
      checked += 1;
      if (!declared.has(entry.selector_path)) missing.push(`${page.id}: ${entry.selector_path}`);
    }
  }
  assert.ok(checked > 0, "没有核对到任何真值条目");
  assert.deepEqual(missing, [], `style-map 缺以下路径的样式声明：${missing.join("；")}`);
});

test("stress-5k：行数与 meta 一致，节点数达 thresholds.stress_node_count", () => {
  const dir = join(fixturesDir(ROOT), "stress-5k");
  const html = readFileSync(join(dir, "page.html"), "utf8");
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const rows = (html.match(/<li\b/g) ?? []).length;
  assert.equal(rows, meta.rows, `页面 <li> 行数 ${rows} ≠ meta.rows ${meta.rows}`);
  assert.ok(
    meta.nodes >= THRESHOLDS.stress_node_count,
    `压力页节点数 ${meta.nodes} < thresholds.stress_node_count（${THRESHOLDS.stress_node_count}）`,
  );
  assert.ok(meta.nodes > rows, "节点数必须多于行数（每行至少 1 元素 + 1 文本节点）");
});

test("第②层守门：npm run fixtures:check 在本仓绿（冻结产物与再生成逐字节一致）", () => {
  const { code, stdout } = runGenerator(ROOT, ["--check"]);
  assert.equal(code, 0, `fixtures:check 应为 rc=0；实际 rc=${code}\n${stdout}`);
  assert.match(stdout, /一致：冻结产物与再生成结果逐字节相同/);
  assert.match(stdout, /再生成 \d+ 个文件 \/ 冻结产物 \d+ 个文件/);
});

// ── 变异验证：两层守门必须真的会红 ──────────────────────────────────────────────

test("变异①（冻结产物侧）：手工改坏 page.html → 第②层 fixtures:check 必须红", () => {
  const dir = sandbox("mut-page");
  try {
    const baseline = runGenerator(dir, ["--check"]);
    assert.equal(baseline.code, 0, `变异前副本应绿（当作基线）；实际 ${baseline.code}\n${baseline.stdout}`);
    const target = join(dir, "data", "fixtures", "page-01", "page.html");
    const text = readFileSync(target, "utf8");
    const next = `${text}<!-- 手工改动 -->\n`;
    assert.notEqual(next, text);
    writeFileSync(target, next);
    const after = runGenerator(dir, ["--check"]);
    assert.equal(after.code, 1, `手工改动后应报不一致；实际 rc=${after.code}\n${after.stdout}`);
    assert.match(after.stdout, /内容不一致 page-01\/page\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("变异②（生成器侧）：把生成器里的一条样本文本改掉 → 第②层 fixtures:check 必须红", () => {
  const dir = sandbox("mut-gen");
  try {
    const target = join(dir, "tools", "gen-fixtures.mjs");
    const text = readFileSync(target, "utf8");
    const next = text.replace('{ text: "仅剩 2 件", note:', '{ text: "仅剩 4 件", note:');
    assert.notEqual(next, text, "变异未生效：生成器里的样本文本锚点没匹配上（判据会假绿）");
    writeFileSync(target, next);
    const after = runGenerator(dir, ["--check"]);
    assert.equal(after.code, 1, `生成器被改坏后应报不一致；实际 rc=${after.code}\n${after.stdout}`);
    assert.match(after.stdout, /不一致 \d+ 处/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("变异③（冻结产物侧）：手工给真值加 observed_* → 第①层真值形态守门必须红", () => {
  const page = CORPUS[0];
  const truth = JSON.parse(JSON.stringify(page.truth));
  truth.positives[0].observed_confidence = 0.9;
  const problems = validateTruthShape({
    pageId: page.id,
    truth,
    html: page.html,
    positiveRuleIds: RULE_IDS,
  });
  assert.ok(problems.length > 0, "手工注入观测字段必须被第①层报出");
  assert.match(problems.join("\n"), /观测/);
});

test("变异④（数量侧）：冻结产物少一页 → 形态守门必须红", () => {
  const dir = sandbox("mut-count");
  try {
    rmSync(join(dir, "data", "fixtures", "page-40"), { recursive: true, force: true });
    const ids = pageIds(dir);
    assert.equal(ids.length, THRESHOLDS.fixture_page_count - 1);
    assert.notEqual(ids.length, THRESHOLDS.fixture_page_count, "少一页必须与期望页数不等（否则判据恒真）");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
