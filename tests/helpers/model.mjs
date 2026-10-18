// 测试用页面模型构造器（不进 dist；只服务 node --test）。

import { RULESET, RULE_SPECS } from "../../src/lib/rules-pack.js";
import { loadRulePack } from "../../src/lib/rules.js";
import { buildScanResult } from "../../src/lib/engine.js";
import { makeElementNode, makeTextNode } from "../../src/lib/page-model.js";

export const MANIFEST = RULESET;

export function pack() {
  return loadRulePack(RULESET, RULE_SPECS);
}

export const URL_UNDER_TEST = "https://example.invalid/checkout";

export function textNode({ seq, text, nearText = "", path = `html:nth(0)>body:nth(0)>p:nth(0)` }) {
  return makeTextNode({ seq, text, nearText, path });
}

export function checkboxNode({
  seq,
  label,
  checked = true,
  nearText = "",
  path = "html:nth(0)>body:nth(0)>input:nth(0)",
}) {
  const attrs = { type: "checkbox" };
  if (checked) attrs.checked = "true";
  return makeElementNode({ seq, tag: "input", path, attrs, label, nearText, box: { widthPx: 16, heightPx: 16 } });
}

export function checkoutNode({ seq, label, checked = true, nearText = "结算页", path = "html:nth(0)>body:nth(0)>input:nth(0)" }) {
  return checkboxNode({ seq, label, checked, nearText, path });
}

export function closeButtonNode({  seq,
  label = "关闭",
  color = "#8a8a8a",
  background = "#909090",
  contrast = 1.5,
  size = 24,
  opacity = 1,
  path = "html:nth(0)>body:nth(0)>button:nth(0)",
}) {
  const style = { display: "block", backgroundColor: background, opacity, fontSizePx: 14 };
  if (color !== null) style.color = color;
  return makeElementNode({
    seq,
    tag: "button",
    path,
    attrs: {},
    label,
    style,
    box: { widthPx: size, heightPx: size },
    contrast,
  });
}

export function scanOf(nodes, options = {}) {
  return buildScanResult({
    url: options.url ?? URL_UNDER_TEST,
    scannedAt: options.scannedAt ?? "2026-10-18T00:00:00.000Z",
    nodes,
    pack: options.pack ?? pack(),
    elapsedMs: options.elapsedMs ?? 12,
    truncated: options.truncated ?? false,
    disabledRuleIds: options.disabledRuleIds ?? [],
  });
}
