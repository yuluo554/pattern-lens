#!/usr/bin/env node
// M2 规则基准（B1–B7；`plan/05` §四）：40 页合成 fixture × 12 规则，**逐样本点名**。
//
// 独立性（`plan/05` §二.3 / §三 第②层）：
//   · 页面模型由 `tools/fixture-page-model.mjs` **从盘上冻结产物独立解析**（不复用生成器内部结构）；
//   · 期望值只来自 `truth.json` 的 `positives` / `negatives`（真值只存输入与期望，无 `observed_*`）；
//   · 门槛与规模一律读 `rules/manifest.json`（K1：本文件不写第二份阈值数字）。
//
// 输出纪律（`plan/05` §4.3）：打印「总数 / 采样数双登记」并显式声明"这是合成基准，非穷举真实站点"；
// 无负样本的规则 `precision` 记 `not_assessed`（不填 1.0）——"没有反例"不等于"精度 100%"。
//
// 用法：
//   node tools/bench-rules.mjs              跑基准并打印报告（rc=0 全达标 / 1 有未达标）
//   node tools/bench-rules.mjs --json       额外打印机器可读汇总
//   node tools/bench-rules.mjs --quiet      只打印结论行
// 退出码：0 全达标 / 1 有未达标 / 2 用法或环境错误。

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanNodes } from "../src/lib/engine.js";
import { toJsonText } from "../src/lib/export.js";
import { loadRulePack } from "../src/lib/rules.js";
import { collectEvidence, EVIDENCE, matchesDetect } from "../src/lib/page-model.js";
import { runScan } from "../src/content/scanner.js";
import { loadFixturePage, loadStressPage, pageIds, resolvePath, textContentOf } from "./fixture-page-model.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 基准里 `scanned_at` 固定：基准**不读时钟**（否则双跑字节比对会漂）；耗时单独测量、绝不进产物。 */
export const BENCH_SCANNED_AT = "1970-01-01T00:00:00.000Z";
export const BASELINE_SETTINGS = { site_policy: { mode: "blocklist", hosts: [] }, disabled_rule_ids: [] };

/** 从**给定仓库根**读规则包（沙箱注入缺陷时读的是沙箱里的规则数据）。 */
export function loadPackFrom(root) {
  const manifest = JSON.parse(readFileSync(join(root, "rules", "manifest.json"), "utf8"));
  const specs = manifest.rule_files.map((file) => JSON.parse(readFileSync(join(root, "rules", file), "utf8")));
  return loadRulePack(manifest, specs);
}

/** 语料（页面 + 真值 + 模型 + 原始 HTML）。模型绝不读真值。 */
export function loadCorpus(root) {
  return pageIds(root).map((id) => loadFixturePage(root, id));
}

const keyOf = (ruleId, locator) => `${ruleId}|${locator}`;
const pct = (value) => (typeof value === "number" ? value.toFixed(4) : value);
const padEnd = (text, width) => String(text) + " ".repeat(Math.max(0, width - [...String(text)].length));

// ── B1：逐规则 precision / recall（双边门 + 逐样本点名）─────────────────────────

function assessRule(rule, thresholds) {
  const failures = [];
  if (rule.positives < thresholds.min_cases_per_rule) {
    failures.push(`正样本 ${rule.positives} < min_cases_per_rule（${thresholds.min_cases_per_rule}）`);
  }
  if (rule.negatives === 0) failures.push("无负样本（precision 只能记 not_assessed）");
  if (rule.precision !== "not_assessed" && rule.precision < thresholds.precision_min) {
    failures.push(`precision ${rule.precision.toFixed(4)} < precision_min（${thresholds.precision_min}）`);
  }
  if (rule.recall < thresholds.recall_min) {
    failures.push(`recall ${rule.recall.toFixed(4)} < recall_min（${thresholds.recall_min}）`);
  }
  if (rule.false_positives > 0) {
    failures.push(`误报边：${rule.false_positives} 条 finding 落在未声明样本上（误报边要求为 0）`);
  }
  return failures;
}

/**
 * 跑一遍基准（B1 的逐样本统计）。**只扫一遍语料**，B2–B7 由 `runAllChecks` 在这份结果上继续做。
 * @param {{root?: string, pack?: object, corpus?: Array}} [options]
 */
export function runBenchmark({ root = ROOT, pack = null, corpus = null } = {}) {
  const loadedPack = pack ?? loadPackFrom(root);
  const pages = corpus ?? loadCorpus(root);
  const thresholds = loadedPack.manifest.thresholds;

  const perRule = new Map(
    loadedPack.order.map((spec) => [
      spec.rule_id,
      {
        rule_id: spec.rule_id,
        name: spec.name,
        severity: spec.severity,
        positives: 0,
        negatives: 0,
        hits: 0,
        misses: 0,
        false_positives: 0,
        misattributed: 0,
        rejected: 0,
      },
    ]),
  );

  const discrepancies = [];
  const pageResults = [];
  let positives = 0;
  let negatives = 0;
  let findingsTotal = 0;
  let rejectedTotal = 0;

  for (const page of pages) {
    const { findings, rejected } = scanNodes(page.model.nodes, loadedPack);
    const truth = page.truth ?? { positives: [], negatives: [] };
    const declared = new Map((truth.positives ?? []).map((entry) => [keyOf(entry.rule_id, entry.selector_path), entry]));
    const byLocator = new Map();
    for (const finding of findings) {
      const list = byLocator.get(finding.locator) ?? [];
      list.push(finding);
      byLocator.set(finding.locator, list);
    }

    for (const entry of truth.positives ?? []) {
      positives += 1;
      const stat = perRule.get(entry.rule_id);
      stat.positives += 1;
      const hit = findings.some((item) => item.rule_id === entry.rule_id && item.locator === entry.selector_path);
      if (hit) stat.hits += 1;
      else {
        stat.misses += 1;
        discrepancies.push({
          page: page.id,
          rule_id: entry.rule_id,
          kind: "miss",
          locator: entry.selector_path,
          snippet: entry.snippet_expected,
          note: "真值声明应命中，实际无产出",
        });
      }
      // 错误归属逐样本核对（plan/05 §4.1 ③）：该 locator 上是否有**别的规则**的 finding
      for (const other of byLocator.get(entry.selector_path) ?? []) {
        if (other.rule_id === entry.rule_id) continue;
        stat.misattributed += 1;
        discrepancies.push({
          page: page.id,
          rule_id: entry.rule_id,
          kind: "misattributed",
          locator: entry.selector_path,
          snippet: other.snippet,
          note: `真值声明 ${entry.rule_id}，实际归属 ${other.rule_id}`,
        });
      }
    }

    for (const entry of truth.negatives ?? []) {
      negatives += 1;
      perRule.get(entry.rule_id).negatives += 1;
    }

    for (const finding of findings) {
      findingsTotal += 1;
      const stat = perRule.get(finding.rule_id);
      if (!declared.has(keyOf(finding.rule_id, finding.locator))) {
        stat.false_positives += 1;
        discrepancies.push({
          page: page.id,
          rule_id: finding.rule_id,
          kind: "false_positive",
          locator: finding.locator,
          snippet: finding.snippet,
          note: "未声明样本上产出 finding（含负样本命中）",
        });
      }
    }

    for (const item of rejected) {
      rejectedTotal += 1;
      if (perRule.has(item.rule_id)) perRule.get(item.rule_id).rejected += 1;
    }

    pageResults.push({ id: page.id, findings, rejected, model: page.model, html: page.html, truth: page.truth });
  }

  const rules = [...perRule.values()].map((stat) => {
    const denominator = stat.hits + stat.false_positives;
    const precision = stat.negatives === 0 ? "not_assessed" : denominator === 0 ? 0 : stat.hits / denominator;
    const recall = stat.positives === 0 ? 0 : stat.hits / stat.positives;
    const rule = { ...stat, precision, recall };
    rule.failures = assessRule(rule, thresholds);
    return rule;
  });

  return {
    root,
    thresholds,
    pack: loadedPack,
    rules,
    discrepancies,
    pageResults,
    failures: rules.flatMap((rule) => rule.failures.map((detail) => `${rule.rule_id}: ${detail}`)),
    totals: {
      pages: pages.length,
      rules: loadedPack.order.length,
      combinations: pages.length * loadedPack.order.length,
      positives,
      negatives,
      findings: findingsTotal,
      rejected: rejectedTotal,
    },
  };
}

// ── B2–B7 ────────────────────────────────────────────────────────────────────

/**
 * B2：证据门禁零产出（**定向断供一类证据**，并配反向对照与还原自证）。
 *
 * 变异方式 = 把证据登记表里某一类证据的取值函数置成"取不到"（`undefined`），再重跑全部语料：
 *   · 需要该类证据的规则必须**零产出**，且候选要进 `rejected`（reason = `missing_evidence`）；
 *   · 不需要该类证据的规则**命中数与基线逐条相同**（反向对照：防"引擎整体崩掉"式的假绿）；
 *   · 只需**改证据登记表**即可，改完立即按引用还原（还原断言在函数末尾）。
 *
 * 为什么不能只靠语料：这份语料里**没有**"命中但证据取不到"的候选（探针会把它数出来），
 * 所以"去掉证据节点 → 归零"在语料上恒真，必须把"取不到"这件事真的造出来才可证伪。
 */
export function evidenceGateProbe(bench) {
  const { pack, pageResults, rules } = bench;
  const baselineHits = new Map(rules.map((rule) => [rule.rule_id, rule.hits]));
  const kinds = [...new Set(pack.order.flatMap((spec) => spec.evidence_required))].sort();
  const snapshot = { ...EVIDENCE };
  const details = [];
  const problems = [];

  // 语料侧登记：有多少候选是"命中但证据取不到"（若为 0，说明语料本身不覆盖这条路径）
  let corpusBlocked = 0;
  for (const page of pageResults) {
    for (const node of page.model.nodes) {
      for (const spec of pack.order) {
        if (!matchesDetect(node, spec.detect).matched) continue;
        if (collectEvidence(node, spec.evidence_required).missing.length > 0) corpusBlocked += 1;
      }
    }
  }
  if (corpusBlocked > 0) {
    // 语料真有这类候选时，门禁同样要挡住：直接断言（不需要断供注入）
    problems.push(`语料里出现 ${corpusBlocked} 个「命中但证据取不到」的候选——请核对真值与规则数据`);
  }

  try {
    for (const kind of kinds) {
      const needs = new Set(pack.order.filter((spec) => spec.evidence_required.includes(kind)).map((spec) => spec.rule_id));
      EVIDENCE[kind] = () => undefined;
      const hitsNow = new Map();
      let needyBaselineHits = 0;
      let needyFindings = 0;
      let needyRejected = 0;
      const cascades = [];
      const unexplained = [];
      for (const page of pageResults) {
        const { findings, rejected } = scanNodes(page.model.nodes, pack);
        for (const finding of findings) hitsNow.set(finding.rule_id, (hitsNow.get(finding.rule_id) ?? 0) + 1);
        for (const finding of findings) if (needs.has(finding.rule_id)) needyFindings += 1;
        for (const item of rejected) {
          if (item.reason === "missing_evidence" && (item.missing_evidence ?? []).includes(kind)) needyRejected += 1;
        }
        // 反向对照：不需要该证据的规则**不得掉命中**；掉不了但"涨了"的，必须是
        // 更高优先级规则被门禁挡下后的**顺延归属**（K4 先到先得 + 逐条可解释），否则视为异常。
        const baselineHere = new Map();
        for (const finding of page.findings) baselineHere.set(finding.rule_id, (baselineHere.get(finding.rule_id) ?? 0) + 1);
        const nowHere = new Map();
        for (const finding of findings) nowHere.set(finding.rule_id, (nowHere.get(finding.rule_id) ?? 0) + 1);
        for (const [ruleId, count] of baselineHere) {
          if (needs.has(ruleId)) continue;
          if ((nowHere.get(ruleId) ?? 0) < count) {
            unexplained.push(`${page.id}/${ruleId}: 不需要 ${kind} 的规则反而掉了命中（${count} → ${nowHere.get(ruleId) ?? 0}）`);
          }
        }
        if (needyRejected > 0 || needs.size > 0) {
          const baselineKeys = new Set(page.findings.map((finding) => keyOf(finding.rule_id, finding.locator)));
          for (const finding of findings) {
            if (needs.has(finding.rule_id)) continue;
            if (baselineKeys.has(keyOf(finding.rule_id, finding.locator))) continue; // 基线本来就有，不是新增
            const donors = rejected.filter(
              (item) =>
                item.locator === finding.locator &&
                item.reason === "missing_evidence" &&
                needs.has(item.rule_id) &&
                pack.order.findIndex((spec) => spec.rule_id === item.rule_id) <
                  pack.order.findIndex((spec) => spec.rule_id === finding.rule_id),
            );
            if (donors.length > 0) {
              cascades.push(`${page.id}/${finding.rule_id} ← ${donors[0].rule_id}（同 locator 被门禁挡下后顺延）`);
            } else {
              unexplained.push(`${page.id}/${finding.rule_id}@${finding.locator}: 新增命中但无同 locator 的高优先级被挡候选（不可解释）`);
            }
          }
        }
      }
      for (const ruleId of needs) needyBaselineHits += baselineHits.get(ruleId) ?? 0;
      details.push({
        kind,
        rules_needing: needs.size,
        baseline_hits_of_needy: needyBaselineHits,
        findings_for_needy: needyFindings,
        rejected_for_needy: needyRejected,
        explained_cascades: cascades.length,
        unexplained: unexplained.length,
      });
      if (needyBaselineHits === 0) problems.push(`证据类型 ${kind} 在本语料上没有正样本用例（缺用例 → FAIL）`);
      if (needyFindings !== 0) problems.push(`证据 ${kind} 取不到仍产出 ${needyFindings} 条 finding（门禁是假门）`);
      if (needyRejected === 0) problems.push(`证据 ${kind} 取不到却一条 rejected 都没记（丢弃必须可观测）`);
      problems.push(...unexplained);
      EVIDENCE[kind] = snapshot[kind];
    }
  } finally {
    Object.assign(EVIDENCE, snapshot);
  }

  const restored =
    Object.keys(snapshot).length === Object.keys(EVIDENCE).length &&
    Object.keys(snapshot).every((kind) => EVIDENCE[kind] === snapshot[kind]);
  if (!restored) problems.push("证据登记表未按引用还原（变异会泄漏到后续判据）");
  if (kinds.length === 0) problems.push("规则包没有声明任何证据类型（缺用例 → FAIL）");

  return { ok: problems.length === 0, kinds: kinds.length, corpusBlocked, details, problems, restored };
}

/** 扫描结果 → 导出文本（`elapsed_ms` 固定 0：耗时是测量值，不进产物）。 */
export function scanTextFor(page, pack, findings, rejected) {
  return toJsonText(
    {
      url: `https://bench.invalid/${page.id}.html`,
      scanned_at: BENCH_SCANNED_AT,
      node_count: page.model.nodes.length,
      elapsed_ms: 0,
      truncated: false,
      ruleset_version: pack.manifest.ruleset_version,
      ruleset_hash: pack.manifest.ruleset_hash,
      disabled_rule_ids: [],
      findings,
      rejected,
    },
    pack.manifest,
  );
}

/** B3：同输入双跑逐字节一致（排序 + 编号 + 导出契约；输入顺序打乱也算同输入）。 */
export function doubleRunProbe(pack, pageResults) {
  const problems = [];
  let compared = 0;
  for (const page of pageResults) {
    const forward = scanNodes(page.model.nodes, pack);
    const reversed = scanNodes([...page.model.nodes].reverse(), pack);
    compared += 1;
    const left = scanTextFor(page, pack, forward.findings, forward.rejected);
    const right = scanTextFor(page, pack, reversed.findings, reversed.rejected);
    if (left !== right) problems.push(`${page.id}: 打乱输入顺序后结果字节不同（排序/编号不稳定）`);
    if (forward.findings.length !== reversed.findings.length) problems.push(`${page.id}: 双跑条数不同`);
  }
  if (compared === 0) problems.push("没有可比对的页面（缺用例 → FAIL）");
  return { ok: problems.length === 0, compared, problems };
}

/** B4：snippet 是宿主文本的**原样子串**（含截断分支的口径）。 */
export function snippetProbe(pageResults, thresholds) {
  const problems = [];
  let checked = 0;
  let truncated = 0;
  for (const page of pageResults) {
    for (const finding of page.findings) {
      checked += 1;
      if (!page.html.includes(finding.snippet)) {
        problems.push(`${page.id}/${finding.rule_id}: snippet 不是 page.html 的原样子串`);
      }
      if (finding.snippet_truncated) {
        truncated += 1;
        if (finding.snippet.length !== thresholds.snippet_max_len) {
          problems.push(`${page.id}/${finding.rule_id}: 截断后长度 ${finding.snippet.length} ≠ snippet_max_len`);
        }
      }
    }
  }
  if (checked === 0) problems.push("没有任何 finding 参与 snippet 核对（缺用例 → FAIL）");
  return { ok: problems.length === 0, checked, truncated, problems };
}

/** B5：locator 回解唯一（且同一 locator 只出一条 finding——K26 去重）。 */
export function locatorProbe(pageResults) {
  const problems = [];
  let checked = 0;
  for (const page of pageResults) {
    const seen = new Set();
    for (const finding of page.findings) {
      checked += 1;
      const key = keyOf(finding.rule_id, finding.locator);
      if (seen.has(key)) problems.push(`${page.id}: 同一 (rule_id, locator) 出了多条 finding（${key}）`);
      seen.add(key);
      const element = resolvePath(page.model.document, finding.locator);
      if (!element) {
        problems.push(`${page.id}/${finding.rule_id}: locator 回解不到节点（${finding.locator}）`);
        continue;
      }
      const labelled = ["aria-label", "title", "placeholder", "alt", "value"].some(
        (name) => element.attrs?.[name] === finding.snippet,
      );
      if (!textContentOf(element).includes(finding.snippet) && !labelled) {
        problems.push(`${page.id}/${finding.rule_id}: snippet 不在 locator 回解节点的文本内（${finding.locator}）`);
      }
    }
    for (const item of page.rejected) {
      if (!resolvePath(page.model.document, item.locator)) {
        problems.push(`${page.id}/${item.rule_id}: rejected 的 locator 回解不到节点（${item.locator}）`);
      }
    }
  }
  if (checked === 0) problems.push("没有任何 finding 参与 locator 核对（缺用例 → FAIL）");
  return { ok: problems.length === 0, checked, problems };
}

/**
 * B6：超时 → **部分结果 + truncated: true**（绝不静默返回空）。
 * 走 `runScan` 的真实入口，只换掉 `collect`（注入"到了时限只采到一半"的分支）；
 * 配阴性对照：同样一半节点但不标截断时 `truncated` 必须为 false（证明该标记来自采集结果，不是硬编码）。
 */
export async function timeoutProbe(pageResults) {
  const problems = [];
  const source = pageResults.find((page) => page.findings.length > 0);
  if (!source) return { ok: false, truncated: null, problems: ["没有可用的页面（缺用例 → FAIL）"] };
  const firstHit = source.model.nodes.findIndex((node) =>
    source.findings.some((finding) => finding.locator === node.path),
  );
  const half = source.model.nodes.slice(0, Math.max(1, firstHit + 1));
  const run = (truncated) =>
    runScan({
      doc: null,
      href: `https://bench.invalid/${source.id}.html`,
      settings: BASELINE_SETTINGS,
      now: () => 0,
      collect: () => ({ nodes: half, truncated }),
    });
  const timedOut = await run(true);
  const normal = await run(false);
  if (timedOut.status !== "ok") {
    problems.push(`扫描未完成：${timedOut.status}/${timedOut.reason}`);
  } else {
    if (timedOut.scan.truncated !== true) problems.push("截断分支未标 truncated: true");
    if (timedOut.scan.node_count === 0) problems.push("截断分支返回了空结果（不得静默返回空）");
    if (timedOut.scan.findings.length === 0) problems.push("截断分支丢掉了已采集到的部分结果");
    for (const field of ["url", "scanned_at", "node_count", "elapsed_ms", "truncated", "ruleset_version", "ruleset_hash", "findings", "rejected"]) {
      if (timedOut.scan[field] === undefined) problems.push(`ScanResult 缺字段 ${field}`);
    }
  }
  if (normal.status !== "ok" || normal.scan.truncated !== false) {
    problems.push("阴性对照失败：未截断的路径不该标 truncated");
  }
  return { ok: problems.length === 0, truncated: timedOut.scan?.truncated ?? null, problems };
}

/** B7：压力页（节点数读 manifest）**解析 + 判定**耗时 < `thresholds.first_result_budget_ms`。 */
export function latencyProbe(pack, thresholds, root) {
  const problems = [];
  const timings = [];
  for (let round = 0; round < 2; round += 1) {
    const started = process.hrtime.bigint();
    const stress = loadStressPage(root);
    const { findings, nodeCount } = scanNodes(stress.model.nodes, pack);
    timings.push({
      round: round === 0 ? "cold" : "warm",
      elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
      nodeCount,
      findings: findings.length,
    });
  }
  const cold = timings[0];
  if (cold.nodeCount < thresholds.stress_node_count) {
    problems.push(`压力页节点数 ${cold.nodeCount} < stress_node_count（${thresholds.stress_node_count}）`);
  }
  if (!(cold.elapsedMs < thresholds.first_result_budget_ms)) {
    problems.push(`冷启动耗时 ${cold.elapsedMs.toFixed(1)}ms ≥ first_result_budget_ms（${thresholds.first_result_budget_ms}ms）`);
  }
  return { ok: problems.length === 0, timings, problems };
}

/** B1–B7 检查项（同一份基准结果上做，不重复扫语料）。 */
export async function runAllChecks(bench, { root = bench.root } = {}) {
  const { pack, pageResults, thresholds } = bench;
  const gate = evidenceGateProbe(bench);
  const latency = latencyProbe(pack, thresholds, root);
  const [cold, warm] = latency.timings;
  return [
    {
      id: "B1",
      ok: bench.failures.length === 0,
      detail: `逐规则 precision/recall（双边门 + 逐样本点名）：${
        bench.rules.filter((rule) => rule.failures.length === 0).length
      }/${bench.rules.length} 达标（门槛读 rules/manifest.json）`,
      problems: bench.failures,
    },
    {
      id: "B2",
      ...gate,
      detail: `证据门禁零产出（${gate.kinds} 类证据按类断供 + 反向对照 + 按引用还原自证；语料侧"命中但证据取不到"的候选 ${gate.corpusBlocked} 个）`,
    },
    { id: "B3", ...doubleRunProbe(pack, pageResults), detail: "排序与编号稳定（双跑逐字节一致）" },
    { id: "B4", ...snippetProbe(pageResults, thresholds), detail: "snippet 原样子串（含截断）" },
    { id: "B5", ...locatorProbe(pageResults), detail: "locator 回解唯一" },
    { id: "B6", ...(await timeoutProbe(pageResults)), detail: "超时部分结果 + truncated: true" },
    {
      id: "B7",
      ...latency,
      detail: `压力页 ${cold.nodeCount} 节点（${cold.findings} 条 finding）：冷 ${cold.elapsedMs.toFixed(1)}ms / 热 ${warm.elapsedMs.toFixed(1)}ms < first_result_budget_ms`,
    },
  ];
}

// ── 报告 ─────────────────────────────────────────────────────────────────────

/** 报告文本（`plan/05` §4.3：双登记 + 合成基准声明 + not_assessed 显式列出）。 */
export function renderReport(bench, checks) {
  const lines = [];
  const { totals, thresholds, rules, discrepancies } = bench;
  lines.push("规则基准（B1–B7）· 合成 fixture 语料");
  lines.push("=".repeat(78));
  lines.push(`双登记：页面 ${totals.pages} × 规则 ${totals.rules} = ${totals.combinations} 个 (规则,页) 组合，实跑 ${totals.combinations}`);
  lines.push(`样本台账：正样本 ${totals.positives} / 负样本 ${totals.negatives}；产出 finding ${totals.findings} / rejected ${totals.rejected}`);
  lines.push(`门槛（唯一真相源 rules/manifest.json）：precision ≥ ${thresholds.precision_min}，recall ≥ ${thresholds.recall_min}，误报边 = 0`);
  lines.push("这是合成基准（40 页自建 fixture，站点名与商品均为虚构），**非穷举真实站点**——所有小数只描述本语料。");
  lines.push("");
  lines.push(`${padEnd("rule_id", 24)}${padEnd("正/负", 8)}${padEnd("命中", 6)}${padEnd("漏", 5)}${padEnd("误报", 6)}${padEnd("precision", 12)}recall`);
  lines.push("-".repeat(78));
  for (const rule of rules) {
    lines.push(
      `${padEnd(rule.rule_id, 24)}${padEnd(`${rule.positives}/${rule.negatives}`, 8)}${padEnd(rule.hits, 6)}${padEnd(
        rule.misses,
        5,
      )}${padEnd(rule.false_positives, 6)}${padEnd(pct(rule.precision), 12)}${pct(rule.recall)}`,
    );
  }
  const notAssessed = rules.filter((rule) => rule.precision === "not_assessed").map((rule) => rule.rule_id);
  lines.push("");
  lines.push(`precision 记 not_assessed 的规则（无负样本，不填 1.0）：${notAssessed.length === 0 ? "（无）" : notAssessed.join("、")}`);
  lines.push("");
  if (discrepancies.length === 0) {
    lines.push("逐样本点名：无差异（每条真值样本都逐条对上）。");
  } else {
    lines.push(`逐样本点名（${discrepancies.length} 处）：`);
    for (const item of discrepancies.slice(0, 40)) {
      lines.push(`  - ${item.page} / ${item.rule_id} [${item.kind}] ${item.locator} :: ${item.snippet}（${item.note}）`);
    }
    if (discrepancies.length > 40) lines.push(`  …（其余 ${discrepancies.length - 40} 处省略）`);
  }
  lines.push("");
  lines.push("基准段：");
  for (const check of checks) {
    lines.push(`  ${check.ok ? "PASS" : "FAIL"}  ${check.id}  ${check.detail}`);
    for (const problem of (check.problems ?? []).slice(0, 8)) lines.push(`        · ${problem}`);
  }
  const failed = bench.failures.length > 0 ? 1 : checks.filter((check) => !check.ok).length;
  lines.push("");
  lines.push(`结论: ${failed === 0 ? "全达标" : `${failed} 段未达标`}`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !["--json", "--quiet"].includes(arg));
  if (unknown.length > 0) {
    process.stderr.write("用法: node tools/bench-rules.mjs [--json] [--quiet]\n");
    process.exitCode = 2;
    return;
  }
  let bench;
  let checks;
  try {
    bench = runBenchmark();
    checks = await runAllChecks(bench);
  } catch (error) {
    process.stderr.write(`基准跑不起来（缺件即 FAIL，不是 SKIP）：${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (!args.includes("--quiet")) process.stdout.write(`${renderReport(bench, checks)}\n`);
  if (args.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          totals: bench.totals,
          checks: checks.map(({ id, ok, detail }) => ({ id, ok, detail })),
          discrepancies: bench.discrepancies.length,
        },
        null,
        2,
      )}\n`,
    );
  }
  const failed = bench.failures.length + checks.filter((check) => !check.ok).length;
  process.exitCode = failed === 0 ? 0 : 1;
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`基准异常：${error?.stack ?? error}\n`);
    process.exitCode = 2;
  });
}
