// 侧边栏取证台（M4 主战场，M0 已落骨架）：
//   · 四组分组（顺序与归属都来自规则包，UI 不写死）；
//   · 站点级折叠（同站点多次扫描按时间倒序折叠，默认展开最新一次；历史读 `storage.session`）；
//   · 空态/错误态/陈旧态都是**显式文案**，绝不显示定性结论（见 copy.js）；
//   · 导出走 Blob + <a download>（全本地）；导出字段顺序由 src/lib/export.js 单点决定。
//
// 纯逻辑单列在 `src/lib/sidepanel-view.js`（分组/折叠/恢复决策/记录形态）——本文件只做 DOM 接线，
// 故 `initSidepanel({doc, runtime})` 可注入依赖，冷启动恢复与 SW 回收后恢复都能**离线验收**
// （假 DOM + 假 chrome 运行时，同 injection-chain / overlay 的做法）。

import { COPY, categoryLabel, severityLabel } from "../lib/copy.js";
import { RULESET, RULE_SPECS } from "../lib/rules-pack.js";
import { exportFileName, toJsonText, toMarkdown } from "../lib/export.js";
import {
  HISTORY_KEY,
  LAST_SCAN_KEY,
  RESTORE_KIND,
  groupByCategory,
  isScanRecord,
  planRestore,
  planSiteGroups,
} from "../lib/sidepanel-view.js";
import { DEFAULT_SETTINGS, hostOf, normalizeSettings } from "../lib/site-policy.js";

const SETTINGS_KEY = "settings";

const state = {
  scan: null,
  history: [],
  staleHost: null,
  currentUrl: "",
  settings: normalizeSettings(DEFAULT_SETTINGS),
};

/** 运行时/文档由 `initSidepanel` 注入（默认取全局；离线测试传假件）。 */
let ctx = { doc: typeof document !== "undefined" ? document : null, runtime: typeof chrome !== "undefined" ? chrome : null };

const el = (id) => ctx.doc.getElementById(id);

function send(message) {
  return ctx.runtime.runtime.sendMessage(message);
}

function setStatus(text) {
  const node = el("status");
  if (node) node.textContent = text ?? "";
}

function makeButton(label, onClick) {
  const button = ctx.doc.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderFinding(finding) {
  const card = ctx.doc.createElement("article");
  card.className = "finding";
  card.dataset.findingId = finding.finding_id;

  const header = ctx.doc.createElement("header");
  const id = ctx.doc.createElement("span");
  id.className = "id";
  id.textContent = finding.finding_id;
  const name = ctx.doc.createElement("span");
  name.textContent = finding.rule_name;
  const severity = ctx.doc.createElement("span");
  severity.className = `sev ${finding.severity}`;
  severity.textContent = severityLabel(finding.severity);
  header.append(id, name, severity);

  const list = ctx.doc.createElement("dl");
  const addRow = (term, value, asCode) => {
    const dt = ctx.doc.createElement("dt");
    dt.textContent = term;
    const dd = ctx.doc.createElement("dd");
    if (asCode) {
      const code = ctx.doc.createElement("code");
      code.textContent = value;
      dd.append(code);
    } else {
      dd.textContent = value;
    }
    list.append(dt, dd);
  };
  addRow("原文片段", finding.snippet, true);
  addRow("元素定位", finding.locator, true);
  addRow("证据", finding.evidence.map((item) => `${item.kind}=${item.value}`).join("；"));
  addRow("规则说明", finding.explanation);

  const row = ctx.doc.createElement("div");
  row.className = "row";
  // 定位串直接显示在 <code> 里（可选中复制）；**不使用剪贴板 API**——省一个权限，也不做隐式数据流动。
  row.append(makeButton(COPY.actions.highlight, () => send({ type: "focus-finding", finding_id: finding.finding_id })));

  card.append(header, list, row);
  return card;
}

/** 渲染**一次**扫描的正文：截断提示 + 空态（固定文案 + 扫描时间 + 节点数）+ 四组分组。 */
function renderScanBody(scan, container) {
  if (scan.truncated) {
    const notice = ctx.doc.createElement("p");
    notice.className = "hint";
    notice.textContent = COPY.truncatedNotice;
    container.append(notice);
  }
  if (scan.findings.length === 0) {
    const empty = ctx.doc.createElement("p");
    empty.className = "hint empty-result";
    // 文案单点（K9）：固定文案来自 COPY.emptyResult，附扫描时间与节点数（M4 DoD 第 3 项）。
    empty.textContent = `${COPY.emptyResult}（扫描时间 ${scan.scanned_at}，节点数 ${scan.node_count}）`;
    container.append(empty);
    return;
  }

  for (const section of groupByCategory(scan.findings, RULESET.categories)) {
    const group = ctx.doc.createElement("section");
    group.className = "group";
    group.dataset.category = section.category ?? "unknown";
    const heading = ctx.doc.createElement("h2");
    heading.textContent = `${categoryLabel(section.category)}（${section.findings.length}）`;
    group.append(heading);
    for (const finding of section.findings) group.append(renderFinding(finding));
    container.append(group);
  }

  const disabled = new Set(scan.disabled_rule_ids ?? []);
  if (disabled.size > 0) {
    const hint = ctx.doc.createElement("p");
    hint.className = "hint";
    hint.textContent = `本次已禁用 ${disabled.size} 条规则：${[...disabled].join("、")}`;
    container.append(hint);
  }
}

/** 站点级折叠：同站点多次扫描按时间倒序折叠，默认展开最新一次（`<details open>`）。 */
function renderHistory(container) {
  const currentHost = hostOf(state.currentUrl ?? "");
  for (const site of planSiteGroups(state.history)) {
    const section = ctx.doc.createElement("section");
    section.className = "site";
    section.dataset.host = site.host;
    const heading = ctx.doc.createElement("h2");
    heading.textContent = `${site.host || "（无法解析的主机）"} · ${site.scans.length} 次扫描`;
    section.append(heading);

    for (const entry of site.scans) {
      const record = entry.record;
      const scan = record.scan_result;
      const details = ctx.doc.createElement("details");
      details.className = "scan";
      details.dataset.scannedAt = record.scanned_at;
      details.open = entry.expandedByDefault; // 默认展开最新一次，其余折叠
      const summary = ctx.doc.createElement("summary");
      const count = Array.isArray(scan.findings) ? scan.findings.length : 0;
      summary.textContent = `${record.scanned_at}（${count} 条）`;
      details.append(summary);

      if (currentHost && site.host && site.host !== currentHost) {
        const notice = ctx.doc.createElement("p");
        notice.className = "hint stale-result";
        notice.textContent = `${COPY.staleResult}（来源主机：${site.host}）`;
        details.append(notice);
      }
      renderScanBody(scan, details);
      section.append(details);
    }
    container.append(section);
  }
}

function renderGroups() {
  const container = el("groups");
  if (!container) return;
  container.textContent = "";

  if (state.history.length > 0) {
    renderHistory(container);
    return;
  }
  if (!state.scan) {
    const empty = ctx.doc.createElement("p");
    empty.className = "hint";
    empty.textContent = COPY.notScanned;
    container.append(empty);
    return;
  }
  if (state.staleHost) {
    const notice = ctx.doc.createElement("p");
    notice.className = "hint stale-result";
    notice.textContent = `${COPY.staleResult}（来源主机：${state.staleHost}）`;
    container.append(notice);
  }
  renderScanBody(state.scan, container);
}

function renderSettings() {
  const mode = el("policy-mode");
  if (mode) mode.value = state.settings.site_policy.mode;
  const hosts = el("policy-hosts");
  if (hosts) hosts.value = state.settings.site_policy.hosts.join("\n");
  const toggles = el("rule-toggles");
  if (!toggles) return;
  toggles.textContent = "";
  const disabled = new Set(state.settings.disabled_rule_ids);
  for (const spec of RULE_SPECS) {
    const label = ctx.doc.createElement("label");
    label.className = "rule";
    const input = ctx.doc.createElement("input");
    input.type = "checkbox";
    input.checked = !disabled.has(spec.rule_id);
    input.addEventListener("change", async () => {
      const next = new Set(state.settings.disabled_rule_ids);
      if (input.checked) next.delete(spec.rule_id);
      else next.add(spec.rule_id);
      state.settings = normalizeSettings({ ...state.settings, disabled_rule_ids: [...next] });
      await ctx.runtime.storage.local.set({ [SETTINGS_KEY]: state.settings });
      renderSettings();
    });
    label.append(input, ctx.doc.createTextNode(` ${spec.rule_id}（${spec.severity}／${spec.category}）`));
    toggles.append(label);
  }
  const line = el("ruleset-line");
  if (line) line.textContent = `规则包 ${RULESET.ruleset_version}·${RULESET.ruleset_hash.slice(0, 12)}（${RULE_SPECS.length} 条规则）`;
}

async function persistSitePolicy() {
  const mode = el("policy-mode");
  const hosts = el("policy-hosts");
  if (!mode || !hosts) return;
  const list = hosts.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  state.settings = normalizeSettings({ ...state.settings, site_policy: { mode: mode.value, hosts: list } });
  await ctx.runtime.storage.local.set({ [SETTINGS_KEY]: state.settings });
  renderSettings();
}

function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = ctx.doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 新结果到达：更新最新一次 + 重读历史（历史由 SW 落盘，本侧只读，不各存一份）。 */
async function applyScan(scan) {
  state.scan = scan;
  renderGroups();
  await refreshHistory();
}

async function refreshHistory() {
  const stored = await send({ type: "get-scan-history" }).catch(() => null);
  const records = stored?.[HISTORY_KEY];
  state.history = (Array.isArray(records) ? records : []).filter(isScanRecord);
  renderGroups();
}

async function currentUrl() {
  const response = await send({ type: "current-url" }).catch(() => null);
  return response?.url ?? "";
}

/** 冷启动 / SW 回收后恢复：读 `storage.session.LastScan`，按四支**显式**落到视图。 */
async function loadLastScan() {
  const stored = await send({ type: "get-last-scan" }).catch(() => null);
  const decision = planRestore(stored?.[LAST_SCAN_KEY], state.currentUrl ?? "");
  if (decision.kind === RESTORE_KIND.error) {
    setStatus(`${COPY.scanFailed}：${decision.reason}`);
    return;
  }
  if (decision.kind === RESTORE_KIND.blocked) {
    setStatus(COPY.blockedSite);
    return;
  }
  if (decision.kind === RESTORE_KIND.scan) {
    state.scan = decision.record.scan_result;
    state.staleHost = decision.staleHost;
    renderGroups();
  }
}

function wire() {
  const setText = (id, text) => {
    const node = el(id);
    if (node) node.textContent = text;
  };
  setText("title", COPY.productName);
  setText("tagline", COPY.tagline);
  setText("scan", COPY.actions.scan);
  setText("highlight", COPY.actions.highlight);
  setText("clear", COPY.actions.clear);
  setText("export-md", COPY.actions.exportMarkdown);
  setText("export-json", COPY.actions.exportJson);

  el("scan")?.addEventListener("click", async () => {
    setStatus("扫描中…");
    const outcome = await send({ type: "start-scan" });
    if (outcome?.status === "blocked") setStatus(COPY.blockedSite);
    else if (outcome?.status === "error") setStatus(`${COPY.injectFailed}：${outcome.reason}`);
    else setStatus("");
  });
  el("clear")?.addEventListener("click", () => send({ type: "clear-overlay" }));
  el("highlight")?.addEventListener("click", () => {
    if (state.scan) send({ type: "apply-overlay", findings: state.scan.findings });
  });
  el("export-md")?.addEventListener("click", () => {
    if (!state.scan) return setStatus(COPY.notScanned);
    download(toMarkdown(state.scan, RULESET), exportFileName(state.scan, "md"), "text/markdown");
  });
  el("export-json")?.addEventListener("click", () => {
    if (!state.scan) return setStatus(COPY.notScanned);
    download(toJsonText(state.scan, RULESET), exportFileName(state.scan, "json"), "application/json");
  });
  el("policy-mode")?.addEventListener("change", persistSitePolicy);
  el("policy-hosts")?.addEventListener("change", persistSitePolicy);

  ctx.runtime.runtime.onMessage.addListener((message) => {
    if (message?.type === "scan-result" && message.outcome?.scan) applyScan(message.outcome.scan);
    if (message?.type === "scan-error") setStatus(`${COPY.scanFailed}：${message.reason}`);
    // 双向联动（反向半程）：页内徽标被点击 → SW 收到 content 来源的 `focus-finding` →
    // 本侧把对应条目滚进视野并高亮。编号即映射键（`data-finding-id`，与徽标同一编号）。
    if (message?.type === "focus-finding") highlightFinding(message.finding_id);
  });
}

/** 侧边栏侧高亮：按编号找到条目 → 滚动进视野 + 加 `is-focused` 类（幂等：先清后加）。
 *  `doc` 可注入（默认全局 `document`）——离线假 DOM 上也要能验收反向半程。 */
export function highlightFinding(findingId, doc = ctx.doc) {
  const id = String(findingId ?? "");
  if (id.length === 0 || !doc) return false;
  for (const card of doc.querySelectorAll(".finding")) card.classList.remove("is-focused");
  const card = doc.querySelector(`.finding[data-finding-id="${id}"]`);
  if (!card) return false;
  card.classList.add("is-focused");
  if (typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
  return true;
}

/**
 * 初始化（可注入依赖：离线测试传假 DOM + 假 chrome 运行时）。
 * @param {{doc?: object, runtime?: object}} [options]
 */
export async function initSidepanel(options = {}) {
  ctx = { doc: options.doc ?? ctx.doc, runtime: options.runtime ?? ctx.runtime };
  state.currentUrl = await currentUrl();
  wire();
  const stored = await ctx.runtime.storage.local.get(SETTINGS_KEY);
  state.settings = normalizeSettings(stored?.[SETTINGS_KEY]);
  renderSettings();
  renderGroups();
  await loadLastScan();
  await refreshHistory();
  renderGroups();
}

/** 只有真的跑在扩展页里才自启动（否则模块可被离线单测 import——反向半程必须能离线验收）。 */
const HAS_RUNTIME =
  typeof chrome !== "undefined" && Boolean(chrome.runtime?.id) && typeof document !== "undefined";

if (HAS_RUNTIME) initSidepanel();
