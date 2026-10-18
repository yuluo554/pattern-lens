// 证据包导出（Markdown / JSON）：字段顺序固定 → 同一 ScanResult 导出两次**字节一致**。
// 不含截图、不含整页 HTML、不含用户输入；不读时钟（时间只用 scan.scanned_at）。
// 唯一序列化点见 serialize.js。

import { COPY } from "./copy.js";
import { orderedJsonText } from "./serialize.js";

export const EXPORT_SCHEMA = "pattern-lens/evidence-pack@1";

export const EXPORT_TOP_FIELDS = [
  "schema",
  "source",
  "ruleset",
  "summary",
  "findings",
  "rejected",
  "disclaimer",
];

export const EXPORT_FINDING_FIELDS = [
  "finding_id",
  "rule_id",
  "rule_name",
  "category",
  "severity",
  "locator",
  "snippet",
  "snippet_truncated",
  "evidence",
  "explanation",
];

const hostOf = (url) => {
  try {
    return new URL(String(url)).host;
  } catch {
    return "";
  }
};

/** 缺字段 → **拒绝导出**（不补默认值：防"看起来完整的证据包"）。 */
export const REQUIRED_SCAN_FIELDS = [
  "url",
  "scanned_at",
  "node_count",
  "elapsed_ms",
  "truncated",
  "ruleset_version",
  "ruleset_hash",
  "findings",
  "rejected",
];

function assertScan(scan) {
  if (!scan || typeof scan !== "object") throw new Error("导出被拒绝：ScanResult 不是对象");
  const missing = REQUIRED_SCAN_FIELDS.filter((field) => scan[field] === undefined);
  if (missing.length > 0) throw new Error(`导出被拒绝：ScanResult 缺字段 ${missing.join("、")}`);
  if (!Array.isArray(scan.findings) || !Array.isArray(scan.rejected)) {
    throw new Error("导出被拒绝：findings / rejected 必须是数组");
  }
}

function countBy(items, key) {
  const out = new Map();
  for (const item of items) out.set(item[key], (out.get(item[key]) ?? 0) + 1);
  return out;
}

/** 组出导出对象；**键顺序即契约**（字段在 `EXPORT_*_FIELDS` 里定义一次）。 */
export function buildEvidencePack(scan, manifest) {
  assertScan(scan);
  const severityLevels = manifest?.severity_levels ?? [];
  const categories = manifest?.categories ?? [];
  const severityCounts = countBy(scan.findings, "severity");
  const categoryCounts = countBy(scan.findings, "category");

  const bySeverity = {};
  for (const level of severityLevels) bySeverity[level] = severityCounts.get(level) ?? 0;
  const byCategory = {};
  for (const category of categories) byCategory[category] = categoryCounts.get(category) ?? 0;

  return {
    schema: EXPORT_SCHEMA,
    source: {
      url: scan.url,
      host: hostOf(scan.url),
      scanned_at: scan.scanned_at,
      node_count: scan.node_count,
      elapsed_ms: scan.elapsed_ms,
      truncated: scan.truncated,
    },
    ruleset: {
      version: scan.ruleset_version,
      hash: scan.ruleset_hash,
      disabled_rule_ids: [...(scan.disabled_rule_ids ?? [])],
    },
    summary: {
      finding_count: scan.findings.length,
      rejected_count: scan.rejected.length,
      by_severity: bySeverity,
      by_category: byCategory,
    },
    findings: scan.findings.map((finding) => ({
      finding_id: finding.finding_id,
      rule_id: finding.rule_id,
      rule_name: finding.rule_name,
      category: finding.category,
      severity: finding.severity,
      locator: finding.locator,
      snippet: finding.snippet,
      snippet_truncated: finding.snippet_truncated,
      evidence: finding.evidence.map((item) => ({ kind: item.kind, value: item.value })),
      explanation: finding.explanation,
    })),
    rejected: scan.rejected.map((item) => ({
      rule_id: item.rule_id,
      locator: item.locator,
      reason: item.reason,
      missing_evidence: [...item.missing_evidence],
    })),
    disclaimer: COPY.disclaimer,
  };
}

export function toJsonText(scan, manifest) {
  return orderedJsonText(buildEvidencePack(scan, manifest), manifest?.output?.json_indent ?? 2);
}

export function toMarkdown(scan, manifest) {
  const pack = buildEvidencePack(scan, manifest);
  const lines = [];
  lines.push(`# ${COPY.productName} · 证据包`);
  lines.push("");
  lines.push(`- 页面：${pack.source.url}`);
  lines.push(`- 扫描时间：${pack.source.scanned_at}`);
  lines.push(`- 节点数：${pack.source.node_count}`);
  lines.push(`- 耗时：${pack.source.elapsed_ms} ms`);
  lines.push(`- 结果是否截断：${pack.source.truncated ? "是" : "否"}`);
  lines.push(`- 规则包：${pack.ruleset.version}（${pack.ruleset.hash.slice(0, 16)}）`);
  if (pack.ruleset.disabled_rule_ids.length > 0) {
    lines.push(`- 本次已禁用规则：${pack.ruleset.disabled_rule_ids.join(", ")}`);
  }
  lines.push("");
  lines.push(`> ${pack.disclaimer}`);
  lines.push("");
  lines.push(`## ${COPY.pendingCheck} · 共 ${pack.summary.finding_count} 条`);
  lines.push("");

  if (pack.summary.finding_count === 0) {
    lines.push(COPY.emptyResult);
    lines.push("");
  }
  for (const finding of pack.findings) {
    const severity = COPY.severityLabels[finding.severity] ?? finding.severity;
    const category = COPY.categoryLabels[finding.category] ?? finding.category;
    lines.push(`### ${finding.finding_id} ${finding.rule_name}（严重度：${severity}／分组：${category}）`);
    lines.push("");
    lines.push(`- 元素定位：\`${finding.locator}\``);
    lines.push(`- 原文片段：\`${finding.snippet}\`${finding.snippet_truncated ? "（已截断）" : ""}`);
    lines.push(`- 证据：${finding.evidence.map((item) => `${item.kind}=${item.value}`).join("；")}`);
    lines.push(`- 规则说明：${finding.explanation}`);
    lines.push("");
  }

  lines.push(`## 未产出结论的候选 · 共 ${pack.summary.rejected_count} 条（供复核）`);
  lines.push("");
  if (pack.summary.rejected_count === 0) {
    lines.push("（无）");
  } else {
    for (const item of pack.rejected) {
      lines.push(`- \`${item.rule_id}\` @ \`${item.locator}\`：${item.reason}（${item.missing_evidence.join("、")}）`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** 文件名含站点主机名与时间戳；不含其他个人数据。 */
export function exportFileName(scan, extension) {
  const host = hostOf(scan.url).replace(/[^a-zA-Z0-9.-]/g, "_") || "unknown-host";
  const stamp = String(scan.scanned_at).replace(/[^0-9]/g, "").slice(0, 14) || "no-timestamp";
  return `pattern-lens-evidence-${host}-${stamp}.${extension}`;
}
