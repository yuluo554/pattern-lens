// 注入入口（按需注入的 content script）：采集 → 判定 → 回传。
// 纪律：
//   · 未点击前零注入（manifest 不声明 content_scripts，本文件只由 service worker 显式注入）；
//   · 站点开关在这里**再查一次**（SW 已查过一次；两处都查是为了"设置刚改动"也能立即生效）；
//   · 超时 → 返回**部分结果 + truncated: true**，绝不静默返回空；
//   · 注入失败 / 规则包加载失败 → 显式报错（UI 显示"注入失败/扫描未能完成"，不显示"未发现"）。

import { collectPageModel } from "./collector.js";
import { RULE_SPECS, RULESET } from "../lib/rules-pack.js";
import { loadRulePack } from "../lib/rules.js";
import { buildScanResult } from "../lib/engine.js";
import { isSiteEnabled, normalizeSettings } from "../lib/site-policy.js";

export const MESSAGE_SCAN_RESULT = "scan-result";
export const MESSAGE_SCAN_ERROR = "scan-error";
export const SETTINGS_KEY = "settings";

/**
 * @param {{doc?: Document, href?: string, settings?: object, now?: () => number, collect?: Function}} [options]
 * @returns {Promise<{status: "ok"|"blocked"|"error", reason?: string, scan?: object}>}
 */
export async function runScan(options = {}) {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  const href = options.href ?? (typeof location !== "undefined" ? location.href : "");
  const now = options.now ?? (() => Date.now());
  const collect = options.collect ?? collectPageModel;

  let settings = options.settings;
  if (!settings) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return { status: "error", reason: "no_storage" };
    }
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = normalizeSettings(stored?.[SETTINGS_KEY]);
  } else {
    settings = normalizeSettings(settings);
  }

  const gate = isSiteEnabled(href, settings);
  if (!gate.enabled) return { status: "blocked", reason: gate.reason };

  let pack;
  try {
    pack = loadRulePack(RULESET, RULE_SPECS);
  } catch (error) {
    return { status: "error", reason: `rule_pack_invalid: ${error.message}` };
  }

  const startedAt = now();
  const deadline = startedAt + pack.manifest.thresholds.scan_timeout_ms;
  const { nodes, truncated } = collect(doc, { deadline, now });
  const elapsedMs = Math.max(0, now() - startedAt);

  const scan = buildScanResult({
    url: href,
    scannedAt: new Date(startedAt).toISOString(),
    nodes,
    pack,
    elapsedMs,
    truncated,
    disabledRuleIds: settings.disabled_rule_ids,
  });
  return { status: "ok", scan };
}

const isInjected =
  typeof chrome !== "undefined" && Boolean(chrome.runtime?.id) && typeof document !== "undefined";

if (isInjected) {
  runScan()
    .then((outcome) => chrome.runtime.sendMessage({ type: MESSAGE_SCAN_RESULT, outcome }))
    .catch((error) =>
      chrome.runtime.sendMessage({ type: MESSAGE_SCAN_ERROR, reason: String(error?.message ?? error) }),
    );
}
