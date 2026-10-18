// 判定核心（**纯函数**：不读时钟、不碰 DOM、不碰 chrome API）。
// 输入 = 归一化页面模型（plan/03 §三）+ 规则包；输出 = {findings, rejected, nodeCount}。
//
// 核心口径（plan/04 M2 判定语义）：
//   1. 证据门禁：evidence_required 取不到 → **丢弃并记 rejected**（不是降级、不是待确认）；
//   2. 同一节点多规则命中 → 按 manifest.match_priority 归属（先到先得，一个节点只出一条 finding）；
//   3. 被中和项抑制的候选也记 rejected（"没命中"与"被中和"是两种事实）；
//   4. snippet 是宿主文本的**原样子串**，超长截断并记 snippet_truncated；
//   5. explanation 逐字取规则包（UI 不得手写第二份）。

import { collectEvidence, makeSnippet, matchesDetect } from "./page-model.js";
import { assignFindingIds, sortFindings } from "./ordering.js";

export const REJECT_REASON = {
  missingEvidence: "missing_evidence",
  suppressed: "suppressed",
  duplicateLocator: "duplicate_locator",
};

/**
 * @param {Array} nodes 页面模型节点（任意顺序；内部按 seq 升序稳定处理）
 * @param {{manifest: object, order: Array}} pack loadRulePack 的产物
 * @param {{disabledRuleIds?: string[]}} [options]
 */
export function scanNodes(nodes, pack, options = {}) {
  const disabled = new Set(options.disabledRuleIds ?? []);
  const maxLen = pack.manifest.thresholds.snippet_max_len;
  const ordered = [...nodes].sort((left, right) => left.seq - right.seq);
  const findings = [];
  const rejected = [];
  // 去重键：同一 (rule_id, locator) 只出一条（K26）。一个 locator 上可能有两个节点——
  // 文本节点与其宿主**控件**元素共用同一个定位串（`tag:nth(i)` 的约定），若两条都产出，
  // 同一条证据会在清单里出现两次。**先到先得**（文档序在前者胜），被丢弃的那条记 rejected（不静默）。
  const claimed = new Set();

  for (const node of ordered) {
    for (const spec of pack.order) {
      if (disabled.has(spec.rule_id)) continue;
      const verdict = matchesDetect(node, spec.detect);
      if (verdict.suppressed_by) {
        rejected.push({
          rule_id: spec.rule_id,
          locator: node.path,
          reason: REJECT_REASON.suppressed,
          missing_evidence: [verdict.suppressed_by],
        });
        continue;
      }
      if (!verdict.matched) continue;

      const key = `${spec.rule_id}|${node.path}`;
      if (claimed.has(key)) {
        rejected.push({
          rule_id: spec.rule_id,
          locator: node.path,
          reason: REJECT_REASON.duplicateLocator,
          missing_evidence: [],
        });
        break; // 同一 locator 已归属该规则：本节点不再参与更低优先级规则的匹配
      }

      const { evidence, missing } = collectEvidence(node, spec.evidence_required);
      if (missing.length > 0) {
        rejected.push({
          rule_id: spec.rule_id,
          locator: node.path,
          reason: REJECT_REASON.missingEvidence,
          missing_evidence: missing,
        });
        continue;
      }

      const { snippet, snippet_truncated } = makeSnippet(node, maxLen);
      claimed.add(key);
      findings.push({
        rule_id: spec.rule_id,
        rule_name: spec.name,
        category: spec.category,
        severity: spec.severity,
        snippet,
        snippet_truncated,
        locator: node.path,
        evidence,
        explanation: spec.explanation,
        dom_order: node.seq,
      });
      break; // 该节点已归属一条规则：不再参与更低优先级规则的匹配
    }
  }

  return { findings, rejected, nodeCount: ordered.length };
}

/** 组出 ScanResult（字段顺序为导出契约的一部分，见 plan/04 M5）。 */
export function buildScanResult({
  url,
  scannedAt,
  nodes,
  pack,
  elapsedMs,
  truncated = false,
  disabledRuleIds = [],
}) {
  const { findings, rejected, nodeCount } = scanNodes(nodes, pack, { disabledRuleIds });
  const numbered = assignFindingIds(sortFindings(findings, pack.manifest));
  return {
    url,
    scanned_at: scannedAt,
    node_count: nodeCount,
    elapsed_ms: elapsedMs,
    truncated: Boolean(truncated),
    ruleset_version: pack.manifest.ruleset_version,
    ruleset_hash: pack.manifest.ruleset_hash,
    disabled_rule_ids: [...disabledRuleIds].sort(),
    findings: numbered,
    rejected,
  };
}
