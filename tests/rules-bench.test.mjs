// 规则基准守门（M2 DoD；B1–B7，`plan/05` §四）：
//   ① B1 双边门：逐规则 precision ≥ thresholds.precision_min、recall ≥ thresholds.recall_min、**误报边 = 0**；
//   ② B2 证据门禁零产出（按类断供证据 → 归零 + rejected；反向对照 + 按引用还原自证）；
//   ③ B3 排序/编号双跑逐字节一致；④ B4 snippet 原样子串（含截断）；⑤ B5 locator 回解唯一；
//   ⑥ B6 超时 → 部分结果 + truncated: true；⑦ B7 压力页耗时 < thresholds.first_result_budget_ms；
//   ⑧ **探活（可证伪）**：往沙箱注入已知缺陷 → B1 必须报未达标，还原后断言**字节已还原**；
//   ⑨ `not_assessed` 口径：某规则无负样本时 precision 记 not_assessed（**不填 1.0**）。
//
// 口径来源：阈值只在 `rules/manifest.json`；本文件不写第二份数字（`tests/threshold-token.test.mjs` 守）。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPackFrom, runAllChecks, runBenchmark } from "../tools/bench-rules.mjs";
import { MANIFEST } from "./helpers/model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THRESHOLDS = MANIFEST.thresholds;
const BENCH = join(ROOT, "tools", "bench-rules.mjs");

const bench = runBenchmark();
const checks = await runAllChecks(bench);
const byId = new Map(checks.map((check) => [check.id, check]));

test("基准跑起来且**非空跑**：页面数 = fixture_page_count，规则数 = 规则包条数（缺件即 FAIL，不是 SKIP）", () => {
  assert.equal(bench.totals.pages, THRESHOLDS.fixture_page_count, `页面 ${bench.totals.pages} ≠ ${THRESHOLDS.fixture_page_count}`);
  assert.equal(bench.totals.rules, MANIFEST.rule_files.length);
  assert.equal(bench.totals.combinations, bench.totals.pages * bench.totals.rules, "双登记：组合数必须等于 页 × 规则");
  assert.ok(bench.totals.positives >= bench.totals.rules * THRESHOLDS.min_cases_per_rule, "正样本总数低于下限总和");
  assert.ok(bench.totals.negatives > 0, "负样本必须存在（否则 precision 全是 not_assessed）");
});

test("B1 双边门：逐规则 precision ≥ precision_min、recall ≥ recall_min、误报边 = 0（逐样本点名）", () => {
  assert.equal(bench.rules.length, MANIFEST.rule_files.length);
  const problems = [];
  for (const rule of bench.rules) {
    if (rule.false_positives !== 0) problems.push(`${rule.rule_id}: 误报 ${rule.false_positives} 条（误报边要求 0）`);
    if (rule.recall < THRESHOLDS.recall_min) problems.push(`${rule.rule_id}: recall ${rule.recall} < ${THRESHOLDS.recall_min}`);
    if (rule.precision !== "not_assessed" && rule.precision < THRESHOLDS.precision_min) {
      problems.push(`${rule.rule_id}: precision ${rule.precision} < ${THRESHOLDS.precision_min}`);
    }
    if (rule.positives < THRESHOLDS.min_cases_per_rule) {
      problems.push(`${rule.rule_id}: 正样本 ${rule.positives} < ${THRESHOLDS.min_cases_per_rule}（覆盖下限）`);
    }
  }
  assert.deepEqual(problems, [], problems.join("；"));
  assert.deepEqual(bench.discrepancies, [], `逐样本点名有差异：${JSON.stringify(bench.discrepancies.slice(0, 5))}`);
  assert.ok(byId.get("B1").ok, `B1 段必须 PASS：${(byId.get("B1").problems ?? []).join("；")}`);
});

test("B1 覆盖下限逐规则点名：每条规则都有正样本与负样本（无弱项）", () => {
  const weak = bench.rules
    .filter((rule) => rule.positives < THRESHOLDS.min_cases_per_rule || rule.negatives === 0)
    .map((rule) => `${rule.rule_id}(正 ${rule.positives} / 负 ${rule.negatives})`);
  assert.deepEqual(weak, [], `覆盖弱：${weak.join("、")}`);
});

test("B2 证据门禁零产出：按类断供证据 → 需要它的规则零产出且进 rejected；不需要它的规则不掉命中", () => {
  const check = byId.get("B2");
  assert.ok(check.ok, `B2 必须 PASS：${(check.problems ?? []).join("；")}`);
  assert.ok(check.kinds >= 4, `断供的证据类型过少：${check.kinds}（判据可能失效）`);
  for (const detail of check.details) {
    assert.equal(detail.findings_for_needy, 0, `${detail.kind}：证据取不到仍产出 finding`);
    assert.ok(detail.rejected_for_needy > 0, `${detail.kind}：丢弃必须可观测（rejected 为空）`);
    assert.ok(detail.baseline_hits_of_needy > 0, `${detail.kind}：没有正样本用例（缺用例 → FAIL）`);
    assert.equal(detail.unexplained, 0, `${detail.kind}：有不可解释的命中漂移`);
  }
  assert.ok(check.restored, "证据登记表必须按引用还原（否则变异泄漏到后续判据）");
});

test("B3 排序与编号稳定：同输入（含打乱输入顺序）双跑**逐字节一致**", () => {
  const check = byId.get("B3");
  assert.ok(check.ok, `B3 必须 PASS：${(check.problems ?? []).join("；")}`);
  assert.ok(check.compared >= THRESHOLDS.fixture_page_count, `双跑页数 ${check.compared} 少于页数`);
});

test("B4 snippet 原样子串：逐条都在 page.html 里；截断只从尾部且长度 = snippet_max_len", () => {
  const check = byId.get("B4");
  assert.ok(check.ok, `B4 必须 PASS：${(check.problems ?? []).join("；")}`);
  assert.ok(check.checked >= bench.totals.findings, `核对条数 ${check.checked} 少于 finding 数 ${bench.totals.findings}`);
  // 截断分支在本语料上是否真的被走到：如实登记（没走到就不是"已验"）
  assert.equal(typeof check.truncated, "number");
  for (const page of bench.pageResults) {
    for (const finding of page.findings) {
      if (finding.snippet_truncated) assert.equal(finding.snippet.length, THRESHOLDS.snippet_max_len);
    }
  }
});

test("B5 locator 回解唯一：每条 finding 的 locator 都能回解到节点，且同一 (rule_id, locator) 只出一条", () => {
  const check = byId.get("B5");
  assert.ok(check.ok, `B5 必须 PASS：${(check.problems ?? []).join("；")}`);
  assert.ok(check.checked >= bench.totals.findings, `核对条数 ${check.checked} 少于 finding 数`);
});

test("B6 超时 → 部分结果 + truncated: true（绝不静默返回空；并配阴性对照）", () => {
  const check = byId.get("B6");
  assert.ok(check.ok, `B6 必须 PASS：${(check.problems ?? []).join("；")}`);
  assert.equal(check.truncated, true);
});

test("B7 压力页：节点数读 manifest；解析 + 判定耗时 < first_result_budget_ms", () => {
  const check = byId.get("B7");
  assert.ok(check.ok, `B7 必须 PASS：${(check.problems ?? []).join("；")}`);
  const [cold, warm] = check.timings;
  assert.ok(cold.nodeCount >= THRESHOLDS.stress_node_count, `压力页节点数 ${cold.nodeCount} < 阈值`);
  assert.ok(cold.elapsedMs < THRESHOLDS.first_result_budget_ms, `冷 ${cold.elapsedMs}ms 超预算`);
  assert.ok(warm.elapsedMs < THRESHOLDS.first_result_budget_ms, `热 ${warm.elapsedMs}ms 超预算`);
  assert.notEqual(cold.nodeCount, 0, "压力页不得空跑");
});

test("基准报告：双登记（总数/采样数）+ 显式声明「合成基准，非穷举真实站点」+ not_assessed 单列", async () => {
  const { renderReport } = await import("../tools/bench-rules.mjs");
  const text = renderReport(bench, checks);
  assert.match(text, /双登记：页面 \d+ × 规则 \d+ = \d+ 个 \(规则,页\) 组合，实跑 \d+/);
  assert.match(text, /非穷举真实站点/);
  assert.match(text, /precision 记 not_assessed 的规则/);
  assert.match(text, /合成 fixture 语料/);
});

test("B1 探活（可证伪）：把中和项短路注入沙箱 → 基准必须报未达标；还原后断言字节已还原", () => {
  const sandbox = sandboxCopy("mut-neutralizer");
  try {
    const baseline = runBench(sandbox);
    assert.equal(baseline.code, 0, `变异前沙箱应全达标（当基线）；实际 rc=${baseline.code}\n${baseline.stdout}`);
    const target = join(sandbox, "src", "lib", "page-model.js");
    const original = readFileSync(target, "utf8");
    const anchor = "  for (const pattern of toRegexes(spec.neutralizers, \"detect.neutralizers\")) {";
    assert.ok(original.includes(anchor), "变异锚点不存在（str.replace 会静默返回原文 → 判据会假绿）");
    const mutated = original.replace(
      anchor,
      "  return { matched: true, suppressed_by: null };\n" + anchor,
    );
    assert.notEqual(mutated, original, "变异未生效（字节没变）");
    writeFileSync(target, mutated);
    const after = runBench(sandbox);
    assert.equal(after.code, 1, `缺陷注入后基准必须报未达标；实际 rc=${after.code}\n${after.stdout}`);
    assert.match(after.stdout, /precision|误报边/, "未达标原因必须落在 precision/误报边上（而不是别的地方红了）");
    writeFileSync(target, original);
    assert.equal(readFileSync(target, "utf8"), original, "还原后字节必须与原文一致（防「变异没真还原」）");
    assert.equal(runBench(sandbox).code, 0, "还原后基准必须重新全达标");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("B1 探活（可证伪）：数据侧删掉 `nearby_absent_any` → 误报边必须红；还原后字节已还原", () => {
  const sandbox = sandboxCopy("mut-absent");
  try {
    assert.equal(runBench(sandbox).code, 0, "变异前沙箱应全达标");
    const target = join(sandbox, "rules", "dp-04-fake-scarcity.json");
    const original = readFileSync(target, "utf8");
    const parsed = JSON.parse(original);
    delete parsed.detect.nearby_absent_any;
    const mutated = `${JSON.stringify(parsed, null, 2)}\n`;
    assert.notEqual(mutated, original, "变异未生效");
    writeFileSync(target, mutated);
    const after = runBench(sandbox);
    assert.equal(after.code, 1, `删掉 nearby_absent_any 后必须报未达标；实际 rc=${after.code}\n${after.stdout}`);
    assert.match(after.stdout, /dp-fake-scarcity: 误报边/);
    writeFileSync(target, original);
    assert.equal(readFileSync(target, "utf8"), original, "还原后字节必须与原文一致");
    assert.equal(runBench(sandbox).code, 0, "还原后基准必须重新全达标");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("B1 探活（可证伪）：数据侧加一条不可满足的 `text_all` → 检出边（recall）必须红", () => {
  const sandbox = sandboxCopy("mut-tighten");
  try {
    assert.equal(runBench(sandbox).code, 0, "变异前沙箱应全达标");
    const target = join(sandbox, "rules", "dp-03-countdown-pressure.json");
    const original = readFileSync(target, "utf8");
    const parsed = JSON.parse(original);
    parsed.detect.text_all = ["这条断言在本语料上永远不成立"];
    const mutated = `${JSON.stringify(parsed, null, 2)}\n`;
    assert.notEqual(mutated, original, "变异未生效");
    writeFileSync(target, mutated);
    const after = runBench(sandbox);
    assert.equal(after.code, 1, `收紧后必须报未达标；实际 rc=${after.code}\n${after.stdout}`);
    assert.match(after.stdout, /dp-countdown-pressure: recall/);
    writeFileSync(target, original);
    assert.equal(readFileSync(target, "utf8"), original, "还原后字节必须与原文一致");
    assert.equal(runBench(sandbox).code, 0, "还原后基准必须重新全达标");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("not_assessed 口径：某规则无负样本 → precision 记 not_assessed（**不填 1.0**）且被显式列出", async () => {
  const sandbox = sandboxCopy("mut-noneg");
  try {
    // 把所有负样本清空（只留正样本）：precision 必须变成 not_assessed，且 B1 必须因"无负样本"报未达标
    for (let index = 1; index <= THRESHOLDS.fixture_page_count; index += 1) {
      const target = join(sandbox, "data", "fixtures", `page-${String(index).padStart(2, "0")}`, "truth.json");
      const truth = JSON.parse(readFileSync(target, "utf8"));
      truth.negatives = [];
      writeFileSync(target, `${JSON.stringify(truth, null, 2)}\n`);
    }
    const { runBenchmark: runInSandbox } = await import(`${pathToFileURL(join(sandbox, "tools", "bench-rules.mjs")).href}?bust=${Date.now()}`);
    const local = runInSandbox({ root: sandbox });
    assert.ok(local.rules.length > 0, "沙箱里没跑出规则");
    for (const rule of local.rules) {
      assert.equal(rule.precision, "not_assessed", `${rule.rule_id} 无负样本时 precision 必须记 not_assessed，实际 ${rule.precision}`);
    }
    assert.ok(local.failures.some((line) => /无负样本/.test(line)), `B1 必须报「无负样本」：${local.failures.join("；")}`);
    const report = (await import("../tools/bench-rules.mjs")).renderReport(local, []);
    assert.match(report, /not_assessed 的规则（无负样本，不填 1\.0）：dp-/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

// ── 建模缺口处置（D29 + K26）的反事实对照 ─────────────────────────────────────

test("建模缺口（D29）：普通元素不取自身文本作 label —— 反事实对照证明这条口径是**载荷**的", async () => {
  // 反事实：把普通元素的 label 恢复成 textContent（缺口原样），**整页**跑引擎看误报。
  // 若这个对照不红，说明「缺口已修」是空话（口径根本没起作用）。
  // 口径：整页重扫（不是逐节点单跑）——逐节点单跑会漏掉"同节点多规则归属"的相互影响。
  const pack = loadPackFrom(ROOT);
  const baselineFp = bench.rules.reduce((sum, rule) => sum + rule.false_positives, 0);
  const baselineHits = bench.rules.reduce((sum, rule) => sum + rule.hits, 0);
  assert.equal(baselineFp, 0, `基线误报边必须为 0（否则反事实对照没有意义）；实际 ${baselineFp}`);
  assert.ok(baselineHits > 0, "基线命中数必须非零");

  const { scanNodes } = await import("../src/lib/engine.js");
  const { resolvePath, textContentOf } = await import("../tools/fixture-page-model.mjs");
  let mutatedFp = 0;
  let mutatedFindings = 0;
  const worst = [];
  for (const page of bench.pageResults) {
    const declared = new Set((page.truth.positives ?? []).map((entry) => `${entry.rule_id}|${entry.selector_path}`));
    const mutatedNodes = page.model.nodes.map((node) => {
      if (node.kind !== "element") return node;
      const own = textContentOf(resolvePath(page.model.document, node.path));
      return own.length === 0 ? node : { ...node, label: own.slice(0, 200) };
    });
    const { findings } = scanNodes(mutatedNodes, pack);
    mutatedFindings += findings.length;
    const perRule = new Map();
    for (const finding of findings) {
      if (!declared.has(`${finding.rule_id}|${finding.locator}`)) {
        mutatedFp += 1;
        perRule.set(finding.rule_id, (perRule.get(finding.rule_id) ?? 0) + 1);
      }
    }
    for (const [ruleId, count] of perRule) worst.push(`${page.id}/${ruleId}=${count}`);
  }
  // 实测口径（写进 plan/00 D29 与 plan/06 §三之二，改这里要同步那两处）：
  //   整页重扫 → 133 条 finding / 85 条误报；四条文本级规则 precision 掉到 0.1379~0.1667
  assert.ok(
    mutatedFp >= 60,
    `恢复缺口形态后误报只有 ${mutatedFp} 条（太少 → 证明不了这条口径是载荷的）；明细：${worst.slice(0, 8).join(" ")}`,
  );
  assert.ok(
    mutatedFindings > baselineHits,
    `缺口形态下 finding 总数（${mutatedFindings}）应明显多于基线命中（${baselineHits}）`,
  );
});

test("建模缺口（D29）反事实：四条文本级规则的 precision 必须掉到双边门以下（逐规则点名）", async () => {
  const pack = loadPackFrom(ROOT);
  const { scanNodes } = await import("../src/lib/engine.js");
  const { resolvePath, textContentOf } = await import("../tools/fixture-page-model.mjs");
  const thresholds = MANIFEST.thresholds;
  const target = new Set([
    "dp-countdown-pressure",
    "dp-anchored-discount",
    "dp-exit-retention",
    "dp-hidden-fee",
  ]);
  const stat = new Map([...target].map((id) => [id, { tp: 0, fp: 0 }]));
  for (const page of bench.pageResults) {
    const declared = new Set((page.truth.positives ?? []).map((entry) => `${entry.rule_id}|${entry.selector_path}`));
    const mutatedNodes = page.model.nodes.map((node) => {
      if (node.kind !== "element") return node;
      const own = textContentOf(resolvePath(page.model.document, node.path));
      return own.length === 0 ? node : { ...node, label: own.slice(0, 200) };
    });
    for (const finding of scanNodes(mutatedNodes, pack).findings) {
      if (!stat.has(finding.rule_id)) continue;
      const bucket = stat.get(finding.rule_id);
      if (declared.has(`${finding.rule_id}|${finding.locator}`)) bucket.tp += 1;
      else bucket.fp += 1;
    }
  }
  const broken = [];
  for (const [ruleId, bucket] of stat) {
    const denominator = bucket.tp + bucket.fp;
    const precision = denominator === 0 ? 0 : bucket.tp / denominator;
    if (!(precision < thresholds.precision_min)) {
      broken.push(`${ruleId}: 缺口形态下 precision ${precision.toFixed(4)} 仍未掉到门槛 ${thresholds.precision_min} 以下（反事实对照失效）`);
    }
  }
  assert.deepEqual(broken, [], broken.join("；"));
  assert.equal(stat.size, 4, "四条文本级规则的样本必须都取到");
});

test("建模缺口（K26）：同一 (rule_id, locator) 只出一条 finding —— 去重可观测且记 rejected", async () => {
  // 文本节点与其宿主控件共用同一 locator；构造「同一 locator 上两条同规则命中」的输入。
  const pack = loadPackFrom(ROOT);
  const { scanNodes } = await import("../src/lib/engine.js");
  const { makeElementNode, makeTextNode } = await import("../src/lib/page-model.js");
  const path = "html:nth(0)>body:nth(0)>button:nth(0)";
  const element = makeElementNode({
    seq: 1,
    tag: "button",
    path,
    attrs: { type: "button" },
    text: "不，不要优惠",
    label: "不，不要优惠",
    nearText: "结算页",
  });
  const text = makeTextNode({ seq: 2, text: "不，不要优惠", nearText: "结算页", path });
  const { findings, rejected } = scanNodes([element, text], pack);
  const own = findings.filter((finding) => finding.rule_id === "dp-confirmshaming");
  assert.equal(own.length, 1, `同一 (rule_id, locator) 只许出一条，实际 ${own.length}`);
  assert.equal(
    rejected.filter((item) => item.reason === "duplicate_locator" && item.rule_id === "dp-confirmshaming").length,
    1,
    "被去重丢掉的候选必须记 rejected（不静默）",
  );
});

// ── 沙箱工具 ─────────────────────────────────────────────────────────────────

function sandboxCopy(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pl-bench-${prefix}-`));
  for (const entry of ["tools", "src", "rules", "data", "package.json"]) {
    cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  }
  return dir;
}

function runBench(dir) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [join(dir, "tools", "bench-rules.mjs")], { cwd: dir, encoding: "utf8" }) };
  } catch (error) {
    return { code: error.status ?? -1, stdout: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function pathToFileURL(path) {
  return new URL(`file://${path.replace(/\\/g, "/")}`);
}
