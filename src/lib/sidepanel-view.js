// 侧边栏视图的**纯逻辑**（M4）：落盘记录形态、站点级折叠、四组分组、恢复决策、空态文案。
//
// 为什么单列一个 lib 模块（而不是写在 sidepanel.js 里）：
//   · 这些判据（分组顺序 / 归属 / 折叠顺序 / 冷启动恢复 / 空态文案）必须能**离线验收**——
//     sidepanel.js 依赖宿主 `document`，纯逻辑放这里才可被 `node --test` 直接跑（同 overlay/collector 的做法）；
//   · `src/lib/**` 是纯核心（K10）：本模块**不碰**扩展 API / DOM / 全局时钟。
//
// 口径（M4 DoD / plan/04 M4）：
//   ① 分组顺序与条目归属来自**规则包**（`manifest.categories` + 规则 `category`），UI 不写死；
//   ② 同一站点多次扫描**按扫描时间倒序折叠**，默认展开最新一次；
//   ③ `LastScan` 记录形态 = `{url, scanned_at, scan_result}`（M4 收敛口径，见 plan/03 §三）。

import { hostOf } from "./site-policy.js";

/** 会话存储的两个键：最新一次（DoD 第 4 项）与按站点折叠用的历史。 */
export const LAST_SCAN_KEY = "LastScan";
export const HISTORY_KEY = "ScanHistory";
/** 历史条数上限（小整数常数，不是可调阈值——K1 豁免面见 tests/threshold-token.test.mjs）。 */
export const HISTORY_MAX = 20;

/** 恢复分支（显式枚举：**没有**"静默什么都不做"这一支）。 */
export const RESTORE_KIND = {
  none: "none",
  error: "error",
  blocked: "blocked",
  scan: "scan",
};

/** 一条记录是否是"扫描结果"记录（形态严格：三字段齐且类型对）。 */
export function isScanRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.url === "string" &&
    typeof value.scanned_at === "string" &&
    value.scan_result !== null &&
    typeof value.scan_result === "object"
  );
}

/**
 * 把 `ScanResult` 包成落盘记录。**三字段形态只在这里定义一次**（改字段名只改这里 + 测试）。
 * @param {object} scan ScanResult
 */
export function scanRecordOf(scan) {
  return { url: String(scan?.url ?? ""), scanned_at: String(scan?.scanned_at ?? ""), scan_result: scan };
}

/**
 * 追加一条历史并保持**扫描时间倒序**（M4 折叠口径就是"按时间倒序"）。
 * 按 `(url, scanned_at)` 去重（重复落同一次扫描不产生第二条）；超出上限截断尾部。
 * 不改入参；非记录形态的条目被丢弃（不静默混进视图）。
 */
export function appendHistory(records, record, max = HISTORY_MAX) {
  const list = (Array.isArray(records) ? records : []).filter(isScanRecord);
  if (!isScanRecord(record)) return list;
  const kept = list.filter((item) => !(item.url === record.url && item.scanned_at === record.scanned_at));
  return [record, ...kept].sort(byScannedAtDesc).slice(0, Math.max(0, max));
}

/** 历史里最新一次扫描的 `ScanResult`（没有则 null）。 */
export function latestScanOf(records) {
  const list = (Array.isArray(records) ? records : []).filter(isScanRecord);
  return list.length > 0 ? list[0].scan_result : null;
}

/**
 * 按规则包的 `categories` 顺序分组；**条目归属由 `finding.category` 决定**（UI 不写死归属）。
 * 空组不产出（不渲染空标题）；未知 category 的 finding **不静默吞掉**——归入 `category: null` 组。
 */
export function groupByCategory(findings, categories) {
  const list = Array.isArray(findings) ? findings : [];
  const known = Array.isArray(categories) ? categories : [];
  const sections = [];
  for (const category of known) {
    const items = list.filter((finding) => finding?.category === category);
    if (items.length > 0) sections.push({ category, findings: items });
  }
  const stray = list.filter((finding) => !known.includes(finding?.category));
  if (stray.length > 0) sections.push({ category: null, findings: stray });
  return sections;
}

/** 扫描时间倒序（ISO-8601 UTC 字符串可直接字典序比较）；同时间按 url 稳定排序。 */
function byScannedAtDesc(left, right) {
  if (left.scanned_at !== right.scanned_at) return left.scanned_at < right.scanned_at ? 1 : -1;
  if (left.url === right.url) return 0;
  return left.url < right.url ? 1 : -1;
}

/**
 * 站点级折叠计划：按站点分组，**组按该站最新一次扫描时间倒序**，组内扫描按时间倒序，
 * **每组第 0 条（最新）默认展开**（`expandedByDefault: true`），其余默认折叠。
 * @returns {Array<{host: string, scans: Array<{record: object, expandedByDefault: boolean}>}>}
 */
export function planSiteGroups(records) {
  const list = (Array.isArray(records) ? records : []).filter(isScanRecord);
  const byHost = new Map();
  for (const record of list) {
    const host = hostOf(record.url);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(record);
  }
  const groups = [...byHost.entries()].map(([host, scans]) => ({
    host,
    scans: [...scans].sort(byScannedAtDesc).map((record, index) => ({ record, expandedByDefault: index === 0 })),
  }));
  return groups.sort((left, right) => {
    const newestLeft = left.scans[0]?.record.scanned_at ?? "";
    const newestRight = right.scans[0]?.record.scanned_at ?? "";
    if (newestLeft !== newestRight) return newestLeft < newestRight ? 1 : -1;
    return left.host < right.host ? -1 : left.host > right.host ? 1 : 0;
  });
}

/** 该记录的来源主机与当前标签页主机不同 → 返回来源主机（UI 显式标注"不是当前页"）；否则 null。 */
export function staleHostOf(recordUrl, currentUrl) {
  const current = hostOf(currentUrl);
  const source = hostOf(recordUrl);
  if (current.length === 0 || source.length === 0) return null;
  return current === source ? null : source;
}

/**
 * 恢复决策（纯函数）：把 `LastScan` 记录 + 当前标签页 URL 变成**显式**视图状态。
 * 四支都要显式：没有记录 / 出错 / 命中黑名单 / 有扫描结果；`scan` 支还给出陈旧主机（不冒充当前页）。
 * @returns {{kind: string, record?: object, reason?: string, staleHost?: string|null}}
 */
export function planRestore(lastScan, currentUrl) {
  if (lastScan === null || typeof lastScan !== "object") return { kind: RESTORE_KIND.none };
  if (lastScan.error) return { kind: RESTORE_KIND.error, reason: String(lastScan.error) };
  if (lastScan.blocked) return { kind: RESTORE_KIND.blocked, reason: String(lastScan.blocked) };
  if (!isScanRecord(lastScan)) return { kind: RESTORE_KIND.none };
  return { kind: RESTORE_KIND.scan, record: lastScan, staleHost: staleHostOf(lastScan.url, currentUrl) };
}
