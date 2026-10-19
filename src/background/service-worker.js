// service worker（MV3）：只做三件事——开侧边栏、按需注入扫描器、转发/落盘结果。
// 硬约束：不声明 content_scripts（未点击前零注入）；不申请 tabs/cookies/webRequest；
//        不做任何网络请求；被回收后靠 chrome.storage.session 恢复。

import { RULESET } from "../lib/rules-pack.js";
import { isSiteEnabled, normalizeSettings } from "../lib/site-policy.js";

/** build 产物把拼接后的经典脚本放在扩展根（见 plan/03 §五）。 */
export const SCANNER_FILE = "scanner.js";
export const MENU_ID = "pattern-lens-scan-page";
export const SETTINGS_KEY = "settings";
export const LAST_SCAN_KEY = "LastScan";

export async function openPanel(tab) {
  if (!tab?.windowId) return false;
  await chrome.sidePanel.open({ windowId: tab.windowId });
  return true;
}

async function readSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored?.[SETTINGS_KEY]);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/** 注入前先做站点开关检查；命中黑名单**不注入**并显式回传原因。 */
export async function startScan(tabId, url) {
  const settings = await readSettings();
  const gate = isSiteEnabled(url, settings);
  if (!gate.enabled) return { status: "blocked", reason: gate.reason };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [SCANNER_FILE] });
  } catch (error) {
    return { status: "error", reason: `inject_failed: ${String(error?.message ?? error)}` };
  }
  return { status: "injected", ruleset_version: RULESET.ruleset_version };
}

export async function storeLastScan(scan) {
  await chrome.storage.session.set({
    [LAST_SCAN_KEY]: { url: scan.url, scanned_at: scan.scanned_at, scan },
  });
}

/** 只有真的跑在扩展运行时里才挂监听（否则模块可被离线单测 import——注入链路必须能离线验收）。 */
const HAS_RUNTIME = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

if (HAS_RUNTIME) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: "用界面取证镜检查本页", contexts: ["page"] });
  });

  chrome.action.onClicked.addListener(async (tab) => {
    await openPanel(tab);
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    await openPanel(tab);
    await startScan(tab.id, tab.url);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message?.type === "start-scan") {
        const tab = sender?.tab?.id ? sender.tab : await activeTab();
        if (!tab?.id) return { status: "error", reason: "no_active_tab" };
        const outcome = await startScan(tab.id, tab.url ?? message.url ?? "");
        if (outcome.status === "blocked") {
          await chrome.storage.session.set({ [LAST_SCAN_KEY]: { url: tab.url ?? "", blocked: outcome.reason } });
        }
        return outcome;
      }
      if (message?.type === "scan-result" && message.outcome?.scan) {
        await storeLastScan(message.outcome.scan);
        return { status: "stored" };
      }
      if (message?.type === "scan-error") {
        await chrome.storage.session.set({ [LAST_SCAN_KEY]: { error: message.reason ?? "unknown" } });
        return { status: "error_recorded" };
      }
      if (message?.type === "get-last-scan") {
        return await chrome.storage.session.get(LAST_SCAN_KEY);
      }
      if (message?.type === "current-url") {
        const tab = await activeTab();
        return { url: tab?.url ?? "" };
      }
      if (message?.type === "get-ruleset") {
        return { version: RULESET.ruleset_version, hash: RULESET.ruleset_hash, rule_count: RULESET.rule_files.length };
      }
      if (message?.type === "clear-overlay" || message?.type === "focus-finding" || message?.type === "apply-overlay") {
        // 方向纪律：**只有侧边栏发起**的这三条才转发给页内脚本。
        // 页内徽标点击也会发 `focus-finding`（双向联动的反向半程）——它带 `sender.tab`，
        // 若在这里再转回该标签页，会变成"点一次闪两下"。侧边栏直接收 runtime 广播，无需中转。
        if (sender?.tab) return { status: "from_content" };
        const tab = await activeTab();
        if (!tab?.id) return { status: "error", reason: "no_active_tab" };
        try {
          await chrome.tabs.sendMessage(tab.id, message);
          return { status: "forwarded" };
        } catch (error) {
          return { status: "error", reason: `forward_failed: ${String(error?.message ?? error)}` };
        }
      }
      return { status: "ignored" };
    })()
      .then(sendResponse)
      .catch((error) => sendResponse({ status: "error", reason: String(error?.message ?? error) }));
    return true;
  });
}
