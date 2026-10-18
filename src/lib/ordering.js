// 排序与编号：唯一实现处（UI 不再排序、导出不再排序）。
// 规则：severity 降序 → DOM 文档序（dom_order 升序）；编号 F-01…与排序后顺序一致。

import { severityRank } from "./rules.js";

export const FINDING_ID_PREFIX = "F-";

/** 返回**新数组**（不改入参）；同级按 dom_order 升序，稳定。 */
export function sortFindings(findings, manifest) {
  return [...findings]
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => {
      const delta = severityRank(manifest, right.finding.severity) - severityRank(manifest, left.finding.severity);
      if (delta !== 0) return delta;
      const byDom = left.finding.dom_order - right.finding.dom_order;
      if (byDom !== 0) return byDom;
      return left.index - right.index;
    })
    .map((entry) => entry.finding);
}

/** 编号：宽度 = max(2, 总数的位数)；同输入同顺序 → 同编号。 */
export function assignFindingIds(findings) {
  const width = Math.max(2, String(findings.length).length);
  return findings.map((finding, index) => ({
    ...finding,
    finding_id: `${FINDING_ID_PREFIX}${String(index + 1).padStart(width, "0")}`,
  }));
}
