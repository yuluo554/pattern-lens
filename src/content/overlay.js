// 页内取证高亮层（M3）：Shadow DOM 覆盖层 + 编号徽标 + 双向联动 + 幂等清除。
//
// 只读纪律（plan/04 M3 判定语义）：
//   · 宿主页面**只多一个容器节点**（`pattern-lens-overlay`）；样式全在 shadow root 内；
//   · 不写宿主元素属性 / 内联样式；不插 `<style>` 到宿主 head；不改宿主任何节点；
//   · 编号**不再排序、不再编号**——`finding_id` 由 `src/lib/ordering.js` 单点产出（K5），
//     本模块只把 `finding_id` 当编号用（页内徽标与侧边栏因此天然一一对应）。
//
// 双向联动（消息名见 plan/03 §三；SW 的转发分支已实现）：
//   · sidepanel → `apply-overlay`（渲染覆盖层）/ `clear-overlay`（移除容器与全部徽标）
//               / `focus-finding`（滚动定位 + 闪烁徽标）；
//   · 页内徽标点击 → 发同一个 `focus-finding`（sidepanel 侧据此高亮对应条目）。
//     点击只发消息，**不重排编号**；两条路径共用同一编号，故不需要第二次映射。

import { resolveLocator } from "./collector.js";
import { COPY } from "../lib/copy.js";

export const OVERLAY_HOST_ID = "pattern-lens-overlay";
export const LAYER_CLASS = "pl-layer";
export const BADGE_CLASS = "pl-badge";
export const FLASH_CLASS = "pl-flash";
export const STALE_ITEM_CLASS = "pl-stale-item";

export const MESSAGE_APPLY_OVERLAY = "apply-overlay";
export const MESSAGE_CLEAR_OVERLAY = "clear-overlay";
export const MESSAGE_FOCUS_FINDING = "focus-finding";

/** 闪烁时长（毫秒）：可注入，测试里传 stub 以免留挂定时器。 */
export const FLASH_MS = 900;

// 样式全部写在 shadow root 内（**不进宿主 document.head**）：
// 于是 `document.styleSheets.length` 在覆盖层出现/消失时都不变（M3 的 diff 判据之一）。
const STYLE_TEXT = [
  ":host { all: initial; }",
  `.${LAYER_CLASS} { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }`,
  `.${BADGE_CLASS} { position: fixed; pointer-events: auto; box-sizing: border-box;`,
  "  top: var(--pl-top, 0px); left: var(--pl-left, 0px);",
  "  min-width: 34px; padding: 2px 7px; border: 1px solid #b45309; border-radius: 999px;",
  "  background: #fff7ed; color: #7c2d12; font: 600 12px/1.4 system-ui, sans-serif;",
  "  text-align: center; cursor: pointer; }",
  `.${BADGE_CLASS}.${FLASH_CLASS} { background: #fde68a; box-shadow: 0 0 0 4px rgba(180, 83, 9, 0.35); }`,
  ".pl-panel { position: fixed; right: 12px; top: 12px; max-width: 320px; pointer-events: auto;",
  "  background: #ffffff; color: #1f2937; border: 1px solid #b45309; border-radius: 8px;",
  "  padding: 8px 10px; font: 12px/1.5 system-ui, sans-serif; }",
  `.${STALE_ITEM_CLASS} { margin: 2px 0; }`,
].join("\n");

function docOf(options = {}) {
  return options.doc ?? (typeof document !== "undefined" ? document : null);
}

/** 运行时（可注入：离线测试传假 chrome，不碰全局）。 */
function runtimeOf(options = {}) {
  return options.runtime ?? (typeof chrome !== "undefined" ? chrome : null);
}

/** 覆盖层宿主：按 id 在宿主文档里找（**无模块级状态**，多文档测试不会互相污染）。 */
function findHost(doc) {
  if (!doc || typeof doc.getElementById !== "function") return null;
  return doc.getElementById(OVERLAY_HOST_ID) ?? null;
}

function layerOf(shadowRoot) {
  const found = shadowRoot.querySelectorAll?.(`.${LAYER_CLASS}`) ?? [];
  return found[0] ?? null;
}

function panelOf(shadowRoot) {
  const found = shadowRoot.querySelectorAll?.(".pl-panel") ?? [];
  return found[0] ?? null;
}

/**
 * locator 回解：**回解不到返回 null**——调用方必须显式提示，不许静默跳过。
 * 以传入的文档为根（不是全局 `document`）：同一模块可在多文档/离线假 DOM 上验收，
 * 且与真实 DOM 的 `document.children = [documentElement]` 形态一致（见 `resolveLocator` 的 root 语义）。
 */
function resolveTarget(locator, doc) {
  if (typeof locator !== "string" || locator.length === 0) return null;
  return resolveLocator(locator, doc);
}

function positionBadge(badge, target) {
  const rect = typeof target?.getBoundingClientRect === "function" ? target.getBoundingClientRect() : null;
  const top = rect ? Math.round(rect.top) : 0;
  const right = rect ? Math.round(rect.right ?? rect.left) : 0;
  badge.style.setProperty("--pl-top", `${top}px`);
  badge.style.setProperty("--pl-left", `${right}px`);
}

function createHost(doc) {
  const host = doc.createElement("pattern-lens-overlay");
  host.id = OVERLAY_HOST_ID;
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = STYLE_TEXT;
  shadowRoot.append(style);
  const layer = doc.createElement("div");
  layer.className = LAYER_CLASS;
  shadowRoot.append(layer);
  const parent = doc.body ?? doc.documentElement;
  if (!parent) return null;
  parent.append(host);
  return host;
}

function ensureHost(doc) {
  return findHost(doc) ?? createHost(doc);
}

/** 幂等：徽标编号 → 已有徽标（重复高亮同一 finding 时**更新位置**，不再新建）。 */
function badgeIndex(shadowRoot) {
  const map = new Map();
  for (const badge of shadowRoot.querySelectorAll?.(`.${BADGE_CLASS}`) ?? []) {
    const id = badge.dataset?.findingId;
    if (typeof id === "string" && id.length > 0) map.set(id, badge);
  }
  return map;
}

function addStaleItem(doc, shadowRoot, findingId) {
  const existing = (shadowRoot.querySelectorAll?.(`.${STALE_ITEM_CLASS}`) ?? []).find(
    (item) => item.dataset?.findingId === findingId,
  );
  if (existing) return existing;
  let panel = panelOf(shadowRoot);
  if (!panel) {
    panel = doc.createElement("div");
    panel.className = "pl-panel";
    shadowRoot.append(panel);
  }
  const item = doc.createElement("p");
  item.className = STALE_ITEM_CLASS;
  item.dataset.findingId = findingId;
  // 文案单点（K9）：这里只引用 COPY.locatorStale，不手写第二份。
  item.textContent = `${findingId} ${COPY.locatorStale}`;
  panel.append(item);
  return item;
}

function flash(badge, options) {
  badge.classList?.add(FLASH_CLASS);
  const schedule = options.setTimeout ?? (typeof setTimeout === "function" ? setTimeout : null);
  if (typeof schedule !== "function") return;
  schedule(() => badge.classList?.remove(FLASH_CLASS), options.flashMs ?? FLASH_MS);
}

/** 徽标点击：发 `focus-finding`（sidepanel 侧据此高亮条目），并在本页闪烁 + 滚动定位。 */
function notifyFocus(findingId, options) {
  const runtime = runtimeOf(options);
  const send = runtime?.runtime?.sendMessage ?? runtime?.sendMessage;
  if (typeof send !== "function") return false;
  const receiver = runtime?.runtime?.sendMessage ? runtime.runtime : runtime;
  try {
    const result = send.call(receiver, { type: MESSAGE_FOCUS_FINDING, finding_id: findingId });
    if (result && typeof result.catch === "function") result.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * 渲染覆盖层（幂等）。
 * @param {Array} findings ScanResult.findings（编号已由 ordering.js 产出；本模块不重排）
 * @returns {{status: string, applied: number, duplicates: number, stale: string[]}}
 */
export function applyOverlay(findings, options = {}) {
  const doc = docOf(options);
  if (!doc) return { status: "error", reason: "no_document", applied: 0, duplicates: 0, stale: [] };
  const list = Array.isArray(findings) ? findings : [];
  const report = { status: "applied", applied: 0, duplicates: 0, stale: [] };
  if (list.length === 0) return { ...report, status: "empty" };

  const host = ensureHost(doc);
  if (!host?.shadowRoot) return { ...report, status: "error", reason: "no_shadow_root" };
  const shadowRoot = host.shadowRoot;
  const layer = layerOf(shadowRoot);
  const index = badgeIndex(shadowRoot);

  for (const finding of list) {
    const findingId = String(finding?.finding_id ?? "");
    if (findingId.length === 0) continue;
    const target = resolveTarget(finding.locator, doc);
    if (!target) {
      // locator 失效分支：**显式提示**，不静默跳过（plan/04 M3 失败路径）。
      report.stale.push(findingId);
      addStaleItem(doc, shadowRoot, findingId);
      continue;
    }
    const existing = index.get(findingId);
    if (existing) {
      positionBadge(existing, target); // 幂等：只更新位置，不再新建徽标
      report.duplicates += 1;
      continue;
    }
    const badge = doc.createElement("button");
    badge.type = "button";
    badge.className = BADGE_CLASS;
    badge.dataset.findingId = findingId;
    badge.dataset.locator = String(finding.locator ?? "");
    badge.textContent = findingId;
    badge.addEventListener("click", () => {
      notifyFocus(findingId, options);
      focusFinding(findingId, options);
    });
    positionBadge(badge, target);
    layer.append(badge);
    index.set(findingId, badge);
    report.applied += 1;
  }
  return report;
}

/** 清除取证层：移除容器与全部徽标（宿主页面的节点数/属性集回到基线）。幂等。 */
export function clearOverlay(options = {}) {
  const doc = docOf(options);
  const host = findHost(doc);
  if (!host) return { status: "absent", removed: false };
  host.remove();
  return { status: "cleared", removed: true };
}

/** 滚动定位 + 闪烁：按 `finding_id` 找徽标；徽标不在 → 回解该 finding 的 locator 重新定位。 */
export function focusFinding(findingId, options = {}) {
  const doc = docOf(options);
  const id = String(findingId ?? "");
  if (id.length === 0) return { status: "error", reason: "no_finding_id" };
  const host = findHost(doc);
  if (!host?.shadowRoot) return { status: "absent" };
  const badge = badgeIndex(host.shadowRoot).get(id);
  if (!badge) return { status: "not_found", finding_id: id };
  const target = resolveTarget(badge.dataset?.locator, doc);
  if (!target) {
    // 页面已变化：目标节点回解不到 → 显式提示（不静默跳过）。
    addStaleItem(doc, host.shadowRoot, id);
    return { status: "stale", finding_id: id };
  }
  if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "center" });
  flash(badge, options);
  return { status: "focused", finding_id: id };
}

/** content script 侧的消息入口（SW 转发；同步处理，故监听器不需要 return true）。 */
export function handleOverlayMessage(message, options = {}) {
  if (!message || typeof message !== "object") return null;
  if (message.type === MESSAGE_APPLY_OVERLAY) return applyOverlay(message.findings, options);
  if (message.type === MESSAGE_CLEAR_OVERLAY) return clearOverlay(options);
  if (message.type === MESSAGE_FOCUS_FINDING) return focusFinding(message.finding_id, options);
  return null;
}

/** 只读探针（测试用）：容器是否在场、徽标编号清单、失效条目清单。 */
export function overlayState(options = {}) {
  const doc = docOf(options);
  const host = findHost(doc);
  if (!host?.shadowRoot) return { present: false, badgeIds: [], staleIds: [], hostId: OVERLAY_HOST_ID };
  const shadowRoot = host.shadowRoot;
  return {
    present: true,
    hostId: host.id,
    badgeIds: (shadowRoot.querySelectorAll?.(`.${BADGE_CLASS}`) ?? []).map((badge) => badge.dataset?.findingId),
    staleIds: (shadowRoot.querySelectorAll?.(`.${STALE_ITEM_CLASS}`) ?? []).map((item) => item.dataset?.findingId),
    styleInsideShadow: (shadowRoot.querySelectorAll?.("style") ?? []).length,
  };
}
