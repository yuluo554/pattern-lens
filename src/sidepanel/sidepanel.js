// 侧边栏取证台（M4 主战场，M0 已落骨架）：
//   · 四组分组（顺序与归属都来自规则包，UI 不写死）；
//   · 空态/错误态/陈旧态都是**显式文案**，绝不显示定性结论（见 copy.js）；
//   · 导出走 Blob + <a download>（全本地）；导出字段顺序由 src/lib/export.js 单点决定。

import { COPY, categoryLabel, severityLabel } from "../lib/copy.js";
import { RULESET, RULE_SPECS } from "../lib/rules-pack.js";
import { exportFileName, toJsonText, toMarkdown } from "../lib/export.js";
import { DEFAULT_SETTINGS, hostOf, normalizeSettings } from "../lib/site-policy.js";

const SETTINGS_KEY = "settings";

const el = (id) => document.getElementById(id);

const state = {
  scan: null,
  settings: normalizeSettings(DEFAULT_SETTINGS),
  staleHost: null,
};

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function setStatus(text) {
  el("status").textContent = text ?? "";
}

function makeButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderFinding(finding) {
  const card = document.createElement("article");
  card.className = "finding";
  card.dataset.findingId = finding.finding_id;

  const header = document.createElement("header");
  const id = document.createElement("span");
  id.className = "id";
  id.textContent = finding.finding_id;
  const name = document.createElement("span");
  name.textContent = finding.rule_name;
  const severity = document.createElement("span");
  severity.className = `sev ${finding.severity}`;
  severity.textContent = severityLabel(finding.severity);
  header.append(id, name, severity);

  const list = document.createElement("dl");
  const addRow = (term, value, asCode) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    if (asCode) {
      const code = document.createElement("code");
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

  const row = document.createElement("div");
  row.className = "row";
  // 定位串直接显示在 <code> 里（可选中复制）；**不使用剪贴板 API**——省一个权限，也不做隐式数据流动。
  row.append(makeButton(COPY.actions.highlight, () => send({ type: "focus-finding", finding_id: finding.finding_id })));

  card.append(header, list, row);
  return card;
}

function renderGroups() {
  const container = el("groups");
  container.textContent = "";
  const scan = state.scan;
  if (!scan) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = COPY.notScanned;
    container.append(empty);
    return;
  }

  if (state.staleHost) {
    const notice = document.createElement("p");
    notice.className = "hint";
    notice.textContent = `${COPY.staleResult}（来源主机：${state.staleHost}）`;
    container.append(notice);
  }
  if (scan.truncated) {
    const notice = document.createElement("p");
    notice.className = "hint";
    notice.textContent = COPY.truncatedNotice;
    container.append(notice);
  }
  if (scan.findings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = `${COPY.emptyResult}（扫描时间 ${scan.scanned_at}，节点数 ${scan.node_count}）`;
    container.append(empty);
    return;
  }

  const disabled = new Set(scan.disabled_rule_ids ?? []);
  for (const category of RULESET.categories) {
    const items = scan.findings.filter((finding) => finding.category === category);
    if (items.length === 0) continue;
    const section = document.createElement("section");
    section.className = "group";
    const heading = document.createElement("h2");
    heading.textContent = `${categoryLabel(category)}（${items.length}）`;
    section.append(heading);
    for (const finding of items) section.append(renderFinding(finding));
    container.append(section);
  }
  if (disabled.size > 0) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = `本次已禁用 ${disabled.size} 条规则：${[...disabled].join("、")}`;
    container.append(hint);
  }
}

function renderSettings() {
  el("policy-mode").value = state.settings.site_policy.mode;
  el("policy-hosts").value = state.settings.site_policy.hosts.join("\n");
  const toggles = el("rule-toggles");
  toggles.textContent = "";
  const disabled = new Set(state.settings.disabled_rule_ids);
  for (const spec of RULE_SPECS) {
    const label = document.createElement("label");
    label.className = "rule";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !disabled.has(spec.rule_id);
    input.addEventListener("change", async () => {
      const next = new Set(state.settings.disabled_rule_ids);
      if (input.checked) next.delete(spec.rule_id);
      else next.add(spec.rule_id);
      state.settings = normalizeSettings({ ...state.settings, disabled_rule_ids: [...next] });
      await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
      renderSettings();
    });
    label.append(input, document.createTextNode(` ${spec.rule_id}（${spec.severity}／${spec.category}）`));
    toggles.append(label);
  }
  el("ruleset-line").textContent = `规则包 ${RULESET.ruleset_version}·${RULESET.ruleset_hash.slice(0, 12)}（${RULE_SPECS.length} 条规则）`;
}

async function persistSitePolicy() {
  const mode = el("policy-mode").value;
  const hosts = el("policy-hosts")
    .value.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  state.settings = normalizeSettings({ ...state.settings, site_policy: { mode, hosts } });
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
  renderSettings();
}

function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function applyScan(scan) {
  state.scan = scan;
  const currentHost = hostOf(await currentUrl());
  state.staleHost = currentHost && hostOf(scan.url) !== currentHost ? hostOf(scan.url) : null;
  renderGroups();
}

async function currentUrl() {
  const response = await send({ type: "current-url" }).catch(() => null);
  return response?.url ?? "";
}

async function loadLastScan() {
  const stored = await send({ type: "get-last-scan" }).catch(() => null);
  const record = stored?.["LastScan"];
  if (!record) return;
  if (record.error) {
    setStatus(`${COPY.scanFailed}：${record.error}`);
    return;
  }
  if (record.blocked) {
    setStatus(COPY.blockedSite);
    return;
  }
  if (record.scan) await applyScan(record.scan);
}

function wire() {
  el("title").textContent = COPY.productName;
  el("tagline").textContent = COPY.tagline;
  el("scan").textContent = COPY.actions.scan;
  el("highlight").textContent = COPY.actions.highlight;
  el("clear").textContent = COPY.actions.clear;
  el("export-md").textContent = COPY.actions.exportMarkdown;
  el("export-json").textContent = COPY.actions.exportJson;

  el("scan").addEventListener("click", async () => {
    setStatus("扫描中…");
    const outcome = await send({ type: "start-scan" });
    if (outcome?.status === "blocked") setStatus(COPY.blockedSite);
    else if (outcome?.status === "error") setStatus(`${COPY.injectFailed}：${outcome.reason}`);
    else setStatus("");
  });
  el("clear").addEventListener("click", () => send({ type: "clear-overlay" }));
  el("highlight").addEventListener("click", () => {
    if (state.scan) send({ type: "apply-overlay", findings: state.scan.findings });
  });
  el("export-md").addEventListener("click", () => {
    if (!state.scan) return setStatus(COPY.notScanned);
    download(toMarkdown(state.scan, RULESET), exportFileName(state.scan, "md"), "text/markdown");
  });
  el("export-json").addEventListener("click", () => {
    if (!state.scan) return setStatus(COPY.notScanned);
    download(toJsonText(state.scan, RULESET), exportFileName(state.scan, "json"), "application/json");
  });
  el("policy-mode").addEventListener("change", persistSitePolicy);
  el("policy-hosts").addEventListener("change", persistSitePolicy);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "scan-result" && message.outcome?.scan) applyScan(message.outcome.scan);
    if (message?.type === "scan-error") setStatus(`${COPY.scanFailed}：${message.reason}`);
    // 双向联动（反向半程）：页内徽标被点击 → SW 收到 content 来源的 `focus-finding` →
    // 本侧把对应条目滚进视野并高亮。编号即映射键（`data-finding-id`，与徽标同一编号）。
    if (message?.type === "focus-finding") highlightFinding(message.finding_id);
  });
}

/** 侧边栏侧高亮：按编号找到条目 → 滚动进视野 + 加 `is-focused` 类（幂等：先清后加）。 */
function highlightFinding(findingId) {
  const id = String(findingId ?? "");
  if (id.length === 0) return false;
  for (const card of document.querySelectorAll(".finding")) card.classList.remove("is-focused");
  const card = document.querySelector(`.finding[data-finding-id="${id}"]`);
  if (!card) return false;
  card.classList.add("is-focused");
  if (typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
  return true;
}

async function init() {
  wire();
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  state.settings = normalizeSettings(stored?.[SETTINGS_KEY]);
  renderSettings();
  renderGroups();
  await loadLastScan();
}

init();
