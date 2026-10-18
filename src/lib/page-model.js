// 页面模型（PageModel）契约 + 证据登记表 + detect 规格匹配。
// 采集层（浏览器）与基准层（Node，合成 fixture）**产出同一种节点对象**，判定核心只认它——
// 这是"判定核心可离线基准"的前提（plan/03 §六）。

export const KIND_TEXT = "text";
export const KIND_ELEMENT = "element";
export const KIND_CONTROL = "control";

export const CONTROL_TAGS = ["input", "button", "select", "textarea", "a"];

/** 周边文本 / 标签文本的截断长度（口径单点：采集层、基准侧、fixture 生成器都读它）。 */
export const NEAR_TEXT_LIMIT = 200;

/** 控件标签属性的优先级（口径单点，与 `data/fixtures/README.md` 一致）。 */
export const LABEL_ATTRS = ["aria-label", "title", "placeholder", "alt"];

export function kindOfTag(tag) {
  const lower = String(tag || "").toLowerCase();
  if (!lower) return KIND_TEXT;
  return CONTROL_TAGS.includes(lower) ? KIND_CONTROL : KIND_ELEMENT;
}

/**
 * 可读标签（**口径单点**，采集层与基准侧都调它，K24）：
 *   显式标签属性（aria-label / title / placeholder / alt）→ **仅控件**的自身文本 → `value`。
 *
 * ⚠ 为什么普通元素**不取自身文本**（决策 D29）：元素节点的自身文本回退取的是 `textContent`（含全部子孙），
 * 于是每个祖先容器都会带着子孙全文去命中"允许 element 的文本级规则"——连 `body`/`html` 都命中
 * （实测：40 页基准上 85 条误报，倒计时/划线价/挽留/费用四条规则 precision 掉到 0.28）。
 * 文本的取证点本就落在**文本节点**上（路径与宿主元素相同），普通元素无需重复承载。
 */
export function labelFrom({ tag = "", attrs = {}, ownText = "" }) {
  for (const name of LABEL_ATTRS) {
    const value = attrs?.[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim().slice(0, NEAR_TEXT_LIMIT);
  }
  if (!CONTROL_TAGS.includes(String(tag).toLowerCase())) return "";
  const own = String(ownText ?? "").trim();
  if (own.length > 0) return own.slice(0, NEAR_TEXT_LIMIT);
  const value = attrs?.value;
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, NEAR_TEXT_LIMIT) : "";
}

/** 文本节点：`seq` 是文档序下标，`nearText` 是同容器内其余文本（可空串，但必须**有定义**）。 */
export function makeTextNode({ seq, text, path, nearText = "", ownerTag = "#text" }) {
  return {
    seq,
    kind: KIND_TEXT,
    tag: ownerTag,
    text: String(text ?? ""),
    label: "",
    attrs: {},
    style: {},
    box: {},
    contrast: undefined,
    nearText: String(nearText ?? ""),
    path,
  };
}

/** 元素/控件节点：`label` 是可读标签（aria-label / title / label 文本 / 自身文本）。 */
export function makeElementNode({
  seq,
  tag,
  path,
  attrs = {},
  text = "",
  label = "",
  nearText = "",
  style = {},
  box = {},
  contrast = undefined,
}) {
  return {
    seq,
    kind: kindOfTag(tag),
    tag: String(tag || "").toLowerCase(),
    text: String(text ?? ""),
    label: String(label ?? ""),
    attrs: { ...attrs },
    style: { ...style },
    box: { ...box },
    contrast,
    nearText: String(nearText ?? ""),
    path,
  };
}

/** 匹配用的文本池：自身文本 + 可读标签（控件通常只有标签）。 */
export function haystack(node) {
  return [node.text, node.label].filter((part) => part && part.length > 0).join(" ").trim();
}

/** 文本归一：空白折叠为单空格 + 去首尾（口径单点，采集层与基准侧同语义）。 */
export function normalizeWs(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 周边文本（`nearby-text`）的口径单点：**宿主元素的父容器文本 − 宿主元素文本**，归一空白后取前 `limit` 字符。
 * 空串是合法证据（"这个区域确实没有别的文本"）。
 *
 * ⚠ 为什么要"按需翻倍前缀"而不是通篇归一：父容器文本可能很长（实测压力页：一个 `<ul>` 下 2500 行，
 * 父文本 ~25k 字符 × 2500 个子节点 = 6 千万字符的正则归一 → 单页 1.3s，直接打挂 NFR-06 的 500ms 预算）。
 * 归一只会让字符串**变短**（只折叠空白），故"原始前缀归一后 ≥ limit"时，其前 limit 字符与
 * "全串归一后前 limit 字符"**逐字节相同**（末尾被 trim 的差异只可能出现在字符串末端，而这里没取到末端）。
 * 语义与通篇归一等价，工作量为 O(limit × 常数)。
 */
export function limitNearText(ownText, parentText, limit = NEAR_TEXT_LIMIT) {
  const own = String(ownText ?? "").trim();
  const all = String(parentText ?? "").trim();
  const stripped = own.length > 0 ? all.replace(own, "") : all;
  let size = Math.min(stripped.length, limit * 2);
  let normalized = normalizeWs(stripped.slice(0, size));
  while (normalized.length < limit && size < stripped.length) {
    size = Math.min(stripped.length, size * 2);
    normalized = normalizeWs(stripped.slice(0, size));
  }
  return normalized.slice(0, limit);
}

// ── 证据登记表：每个 kind 一个取值函数；**取不到 → 返回 undefined → 该候选被丢弃**（不是降级）。
// 关键语义：空串是"取到了空值"（合法证据），undefined 才是"取不到"。
const stringOrUndefined = (value) => (typeof value === "string" ? value : undefined);
const numberOrUndefined = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

export const EVIDENCE = {
  text: (node) => stringOrUndefined(node.text),
  "label-text": (node) => {
    const label = node.label && node.label.length > 0 ? node.label : node.text;
    return typeof label === "string" ? label : undefined;
  },
  "nearby-text": (node) => stringOrUndefined(node.nearText),
  "checked-state": (node) => {
    if (!node.attrs || !("checked" in node.attrs)) return undefined;
    return node.attrs.checked === "true" ? "checked" : "unchecked";
  },
  "box-size": (node) => {
    const width = numberOrUndefined(node.box?.widthPx);
    const height = numberOrUndefined(node.box?.heightPx);
    if (width === undefined || height === undefined) return undefined;
    return `${width}x${height}`;
  },
  "contrast-ratio": (node) => {
    const ratio = numberOrUndefined(node.contrast);
    return ratio === undefined ? undefined : ratio.toFixed(2);
  },
  "style-color": (node) => stringOrUndefined(node.style?.color),
  "style-background-color": (node) => stringOrUndefined(node.style?.backgroundColor),
  "style-display": (node) => stringOrUndefined(node.style?.display),
  "style-opacity": (node) => numberOrUndefined(node.style?.opacity)?.toString(),
  "style-font-size": (node) => numberOrUndefined(node.style?.fontSizePx)?.toString(),
  "dom-path": (node) => stringOrUndefined(node.path),
};

/** 取一条证据；未知 kind 直接抛错（规则包校验会先拦下，见 rules.js）。 */
export function evidenceValue(node, kind) {
  const getter = EVIDENCE[kind];
  if (!getter) throw new Error(`未知证据类型: ${kind}`);
  return getter(node);
}

export function collectEvidence(node, kinds) {
  const out = [];
  const missing = [];
  for (const kind of kinds) {
    const value = evidenceValue(node, kind);
    if (value === undefined) missing.push(kind);
    else out.push({ kind, value });
  }
  return { evidence: out, missing };
}

// ── 颜色工具（单点实现：采集层用它算对比度，基准生成期也用它算，两处同源）────────
const NAMED_COLORS = {
  black: "#000000",
  white: "#ffffff",
  transparent: "#00000000",
};

export function parseColor(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase();
  if (text.length === 0) return null;
  const named = NAMED_COLORS[text];
  const source = named ?? text;
  if (source.startsWith("#")) {
    const hex = source.slice(1);
    if (hex.length === 3) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  const match = /^rgba?\(([^)]+)\)$/.exec(source);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter((p) => p.length > 0).map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

/** 颜色等价判定（#fff 与 rgb(255,255,255) 视为同色；认不出的写法按字符串比较）。 */
export function colorsEqual(a, b) {
  const left = parseColor(a);
  const right = parseColor(b);
  if (!left || !right) return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  return left.r === right.r && left.g === right.g && left.b === right.b;
}

function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  const parsed = typeof color === "string" ? parseColor(color) : color;
  if (!parsed) return null;
  return 0.2126 * channelLuminance(parsed.r) + 0.7152 * channelLuminance(parsed.g) + 0.0722 * channelLuminance(parsed.b);
}

/** WCAG 相对对比度；任一颜色认不出 → null（= 取不到证据，不是 1:1）。 */
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── detect 规格匹配（支持键集以 rules/manifest.json 的 detect_keys 为准，未知键在加载期报错）──
const toRegexes = (patterns, where) =>
  (patterns || []).map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new Error(`${where} 的正则无法编译: ${pattern}（${error.message}）`);
    }
  });

function kindMatches(node, kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0) return true;
  if (kinds.includes(node.kind)) return true;
  return node.kind === KIND_CONTROL && kinds.includes(KIND_ELEMENT);
}

function attrsMatch(node, attrs) {
  for (const [name, expected] of Object.entries(attrs || {})) {
    const actual = node.attrs?.[name];
    if (actual === undefined) return false;
    if (String(actual) !== String(expected)) return false;
  }
  return true;
}

function styleMatches(node, style) {
  const spec = style || {};
  const box = node.box || {};
  const computed = node.style || {};
  if (spec.max_size_px !== undefined) {
    const width = numberOrUndefined(box.widthPx);
    const height = numberOrUndefined(box.heightPx);
    if (width === undefined || height === undefined) return false;
    if (Math.min(width, height) > spec.max_size_px) return false;
  }
  if (spec.color_equals_background === true) {
    const color = computed.color;
    const background = computed.backgroundColor;
    if (typeof color !== "string" || typeof background !== "string") return false;
    if (!colorsEqual(color, background)) return false;
  }
  if (spec.opacity_max !== undefined) {
    const opacity = numberOrUndefined(computed.opacity);
    if (opacity === undefined || opacity > spec.opacity_max) return false;
  }
  if (spec.contrast_below !== undefined) {
    const ratio = numberOrUndefined(node.contrast);
    if (ratio === undefined || ratio >= spec.contrast_below) return false;
  }
  if (spec.min_font_size_px !== undefined) {
    const size = numberOrUndefined(computed.fontSizePx);
    if (size === undefined || size < spec.min_font_size_px) return false;
  }
  return true;
}

/**
 * 样式条件有两档（语义显式，别混）：
 *   · `detect.style`     = **全部**条件都成立（AND）；
 *   · `detect.style_any` = 只要**任一**条件组成立（OR）——用于"极小 **或** 与背景同色"这类规则。
 * 判据 = "同一条规则里的两个外观特征，是同时要求还是任一即可？"写错会让规则要么过宽要么永不命中。
 */
function styleAnyMatches(node, groups) {
  if (!Array.isArray(groups) || groups.length === 0) return true;
  return groups.some((group) => styleMatches(node, group));
}

/**
 * 判定一个节点是否命中一条规则的 detect 规格。
 * 返回 `{ matched, suppressed_by }`——被中和项抑制时 `matched=false` 但 `suppressed_by` 有值，
 * 便于调试与基准统计（"没命中"与"被中和"是两种事实）。
 */
export function matchesDetect(node, detect) {
  const spec = detect || {};
  if (!kindMatches(node, spec.node_kinds)) return { matched: false, suppressed_by: null };
  if (!attrsMatch(node, spec.attrs)) return { matched: false, suppressed_by: null };

  const pool = haystack(node);
  const text = node.text || "";
  if (spec.text_any) {
    const hit = toRegexes(spec.text_any, "detect.text_any").some((re) => re.test(pool));
    if (!hit) return { matched: false, suppressed_by: null };
  }
  if (spec.text_all) {
    const hit = toRegexes(spec.text_all, "detect.text_all").every((re) => re.test(pool));
    if (!hit) return { matched: false, suppressed_by: null };
  }
  if (spec.near_text_any) {
    const hit = toRegexes(spec.near_text_any, "detect.near_text_any").some((re) => re.test(`${node.nearText}\n${pool}`));
    if (!hit) return { matched: false, suppressed_by: null };
  }
  if (spec.nearby_absent_any) {
    const hit = toRegexes(spec.nearby_absent_any, "detect.nearby_absent_any").some((re) => re.test(node.nearText || ""));
    if (hit) return { matched: false, suppressed_by: "nearby_absent_any" };
  }
  if (!styleMatches(node, spec.style)) return { matched: false, suppressed_by: null };
  if (!styleAnyMatches(node, spec.style_any)) return { matched: false, suppressed_by: null };

  for (const pattern of toRegexes(spec.neutralizers, "detect.neutralizers")) {
    if (pattern.test(pool) || pattern.test(text)) return { matched: false, suppressed_by: `neutralizer:${pattern.source}` };
  }
  return { matched: true, suppressed_by: null };
}

/** 截断 snippet：必须是宿主文本的**原样子串**；截断时调用方记 `snippet_truncated: true`。 */
export function makeSnippet(node, maxLen) {
  const source = node.kind === KIND_TEXT ? node.text || node.label : node.label || node.text;
  const text = typeof source === "string" ? source : "";
  if (maxLen === undefined || maxLen === null || text.length <= maxLen) {
    return { snippet: text, snippet_truncated: false };
  }
  return { snippet: text.slice(0, maxLen), snippet_truncated: true };
}
