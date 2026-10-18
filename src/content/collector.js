// 采集层（浏览器内）：渲染后 DOM → 归一化 PageModel。**只读**：不写宿主样式、不改属性、不点击。
// 与基准层（Node，合成 fixture）产出同一种节点对象（plan/03 §六）。
// 注意：本文件不 import 时钟，时间由调用方注入（便于基准与测试）。

import { contrastRatio, labelFrom, limitNearText, makeElementNode, makeTextNode, NEAR_TEXT_LIMIT } from "../lib/page-model.js";

export const MAX_DEPTH = 64;
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "meta", "link"]);

/** 稳定的元素定位串：`tag:nth(i)` 链（同一棵树内唯一、可回解）。 */
export function pathOf(element, root = null) {
  const parts = [];
  let node = element;
  while (node && node !== root && node.tagName) {
    parts.unshift(segmentOf(node));
    node = node.parentElement;
  }
  return parts.join(">");
}

function segmentOf(element) {
  const tag = String(element.tagName || "").toLowerCase() || "unknown";
  let index = 0;
  const siblings = element.parentElement?.children ?? [];
  for (const sibling of siblings) {
    if (sibling === element) break;
    if (String(sibling.tagName || "").toLowerCase() === tag) index += 1;
  }
  return `${tag}:nth(${index})`;
}

/** 定位串回解（M3 用；回解不到返回 null——调用方必须显式提示，不许静默跳过）。 */
export function resolveLocator(path, root = null) {
  const segments = String(path).split(">").filter((part) => part.length > 0);
  let current = root;
  for (const segment of segments) {
    const match = /^(.+):nth\((\d+)\)$/.exec(segment);
    if (!match) return null;
    const [, tag, rawIndex] = match;
    const wanted = Number(rawIndex);
    let pool;
    if (!current) {
      const top = typeof document !== "undefined" ? document.documentElement : null;
      if (!top) return null;
      if (String(top.tagName || "").toLowerCase() === tag && wanted === 0) {
        current = top;
        continue;
      }
      pool = [top];
    } else {
      pool = [...(current.children ?? [])];
    }
    const sameTag = pool.filter((node) => String(node.tagName || "").toLowerCase() === tag);
    if (wanted >= sameTag.length) return null;
    current = sameTag[wanted];
  }
  return current ?? null;
}

function attrsOf(element) {
  const attrs = {};
  for (const attribute of element.attributes ?? []) {
    attrs[attribute.name] = attribute.value;
  }
  if (element.tagName === "INPUT" && element.checked === true && attrs.checked === undefined) attrs.checked = "true";
  return attrs;
}

function effectiveBackground(element, view) {
  let node = element;
  while (node && node.nodeType === 1) {
    const value = view.getComputedStyle(node).backgroundColor;
    if (value && value !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(value)) return value;
    node = node.parentElement;
  }
  return "rgb(255, 255, 255)";
}

/**
 * 声明样式子集（与基准侧的 `style-map.json` 同形状）**+ 对比度**。
 * ⚠ `contrast` 是**节点顶层字段**（`node.contrast`），不是 `node.style.contrast`——
 * 证据登记表（`src/lib/page-model.js` 的 `EVIDENCE["contrast-ratio"]`）读的是 `node.contrast`。
 * 放进 `style` 里会让 `contrast-ratio` 永远取不到 → `dp-dark-close` 永不产出（实测踩过：两侧语义漂移，
 * 由 `tests/collector-parity.test.mjs` 抓出）。
 */
function styleOf(element, view) {
  const computed = view.getComputedStyle(element);
  const background = effectiveBackground(element, view);
  return {
    style: {
      display: computed.display,
      color: computed.color,
      backgroundColor: background,
      opacity: Number.parseFloat(computed.opacity ?? "1"),
      fontSizePx: Number.parseFloat(computed.fontSize ?? "0"),
    },
    contrast: contrastRatio(computed.color, background) ?? undefined,
  };
}

function boxOf(element) {
  const rect = element.getBoundingClientRect?.();
  if (!rect) return {};
  return { widthPx: Math.round(rect.width), heightPx: Math.round(rect.height) };
}

/**
 * 元素文本内容：**跳过 SKIP_TAGS 子树**（`script`/`style`/`noscript`/…）。
 *
 * ⚠ 为什么不直接用 `element.textContent`：它会连 `<style>` 块里的 CSS 与 `<script>` 里的代码一起算进去。
 * 这会让 `nearby-text`（= 父容器文本 − 自身文本）被 CSS 文本污染——例如 `body` 的周边文本会包含整段样式表，
 * 使 `nearby_absent_any`（"周边没有可核对来源"）这类判据在**每个**元素上都可能被无关文本干扰。
 * 口径单点：与 `tools/fixture-page-model.mjs` / `tools/gen-fixtures.mjs` 的 `textContentOf` **同语义**，
 * 由 `tests/collector-parity.test.mjs` 逐节点断言两侧一致（K24）。
 */
function textContentSkipping(element) {
  let out = "";
  for (const child of element.childNodes ?? []) {
    if (child.nodeType === 3) out += child.nodeValue ?? "";
    else if (child.nodeType === 1 && !SKIP_TAGS.has(String(child.tagName || "").toLowerCase())) {
      out += textContentSkipping(child);
    }
  }
  return out;
}

function labelOf(element) {
  return labelFrom({ tag: element.tagName, attrs: attrsOf(element), ownText: textContentSkipping(element) });
}

function nearTextOf(element) {
  const parent = element.parentElement;
  if (!parent) return "";
  return limitNearText(textContentSkipping(element), textContentSkipping(parent));
}

/**
 * 采集渲染后 DOM。
 * @param {Document|Element} root
 * @param {{deadline?: number, now?: () => number, limitNodes?: number}} [options]
 * @returns {{nodes: Array, truncated: boolean}}
 */
export function collectPageModel(root = document, options = {}) {
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const now = options.now ?? (() => Date.now());
  const limitNodes = options.limitNodes ?? Number.POSITIVE_INFINITY;
  const view = root.defaultView ?? (typeof window !== "undefined" ? window : null);
  if (!view) throw new Error("collectPageModel 需要浏览器环境（getComputedStyle 不可用）");

  const nodes = [];
  let seq = 0;
  let truncated = false;

  const push = (node) => {
    nodes.push(node);
    seq += 1;
  };

  const walkTexts = (element) => {
    for (const child of element.childNodes ?? []) {
      if (child.nodeType !== 3) continue;
      const text = (child.nodeValue ?? "").trim();
      if (text.length === 0) continue;
      if (text.length > NEAR_TEXT_LIMIT * 2) continue; // 长文本块不参与文本级规则
      push(
        makeTextNode({
          seq,
          text,
          path: pathOf(element, root),
          nearText: nearTextOf(element),
        }),
      );
    }
  };

  const walk = (element, depth) => {
    if (truncated) return;
    if (nodes.length >= limitNodes) {
      truncated = true;
      return;
    }
    if (now() > deadline) {
      truncated = true;
      return;
    }
    if (depth > MAX_DEPTH) return;
    const tag = String(element.tagName || "").toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    const path = pathOf(element, root);
    const declared = styleOf(element, view);
    push(
      makeElementNode({
        seq,
        tag,
        path,
        attrs: attrsOf(element),
        label: labelOf(element),
        nearText: nearTextOf(element),
        style: declared.style,
        contrast: declared.contrast,
        box: boxOf(element),
      }),
    );
    walkTexts(element);
    for (const child of element.children ?? []) walk(child, depth + 1);
  };

  const start = root.documentElement ?? root;
  if (start) walk(start, 0);
  return { nodes, truncated };
}
