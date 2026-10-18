// 可见文案单点（**UI 不得手写第二份文案**；tests/copy-guard.test.mjs 扫描 src/ 其余文件）。
// 文案红线（plan/01 §六）：统一"可疑模式（待核对）"，不写"欺诈/违法/恶意网站"，不下定性结论。

export const COPY = {
  productName: "界面取证镜",
  tagline: "只做取证，不做打分",
  pendingCheck: "可疑模式（待核对）",

  // 空态与错误态（**都不是结论**）
  emptyResult: "本页未发现符合规则的证据",
  notScanned: "尚未扫描本页",
  scanFailed: "扫描未能完成",
  injectFailed: "注入失败",
  blockedSite: "该站点已停用：设置里的站点黑名单命中，本次未注入扫描",
  truncatedNotice: "本次扫描未在时限内完成，结果是部分结果（已标注截断）",
  staleResult: "以下内容不是当前页面的扫描结果",
  locatorStale: "元素已失效（页面可能已变化）",

  disclaimer: "本清单是启发式取证结果，每条都附规则说明与原文片段，供人工复核；不构成法律意见或事实认定。",

  categoryLabels: {
    urgency: "紧迫",
    misleading: "误导",
    obstacle: "障碍",
    price: "价格",
  },
  severityLabels: { low: "低", medium: "中", high: "高" },

  actions: {
    scan: "开始扫描",
    clear: "清除取证层",
    highlight: "在页面高亮",
    exportMarkdown: "导出 Markdown",
    exportJson: "导出 JSON",
  },

  /** 禁用词表：UI/导出/规则解释里**不得出现**（阳性对照由测试保证扫描器真的能抓到）。 */
  bannedWords: ["欺诈", "违法", "恶意", "诈骗", "骗局", "风险评分", "无风险", "未发现问题", "安全"],
};

/** 分组顺序由规则包 manifest.categories 决定；本函数只做标签映射（未知分组显式报出，不吞掉）。 */
export function categoryLabel(category) {
  const label = COPY.categoryLabels[category];
  return label ?? `未知分组（${category}）`;
}

export function severityLabel(severity) {
  return COPY.severityLabels[severity] ?? `未知严重度（${severity}）`;
}
