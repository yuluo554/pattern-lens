#!/usr/bin/env node
// Node 侧页面模型解析器（基准用）：把**盘上的冻结产物** `data/fixtures/page-NN/{page.html,style-map.json}`
// 解析成 PageModel（与 `src/content/collector.js` **同语义**，K24）。
//
// 独立性纪律（`plan/05` §二.3 / §三）：
//   本模块**不 import `tools/gen-fixtures.mjs`**，也不复用生成器的内存树——只读盘 + 自写 HTML 解析 + 由
//   `src/lib/page-model.js` 的工具复算（对比度）。否则"期望值与实现同源"：生成器改坏时基准照常绿。
//
// 页面模型口径（单点在 `data/fixtures/README.md`，与采集器逐条对齐）：
//   · 定位串 `tag:nth(i)`（i = 同标签兄弟中的下标，**含被跳过的标签**一起计数）；文本节点的路径 = 其宿主元素路径。
//   · 节点产出顺序：元素在前，其**直接文本子节点**随后（文档序），然后递归其元素子节点。
//   · `label` 取控件标签优先级 `aria-label` / `title` / `placeholder` / `alt` → 自身文本 → `value`；
//     **普通元素不取 `label`**（决策 D29：否则每个祖先容器都会带着子孙全文命中文本级规则，连 body/html 都命中）。
//   · `nearby-text` = **宿主元素的父容器文本 − 宿主元素文本**（归一空白；空串是合法证据）。
//   · `checked` 布尔属性归一为字符串 `true` / `false`。
//   · 样式取自同目录 `style-map.json`（**声明的样式子集**，D15/D28）；缺该节点即**报错**（不静默取默认值）；
//     仅压力页（生成器不产 style-map）落回 `DECLARED_DEFAULT_STYLE`。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio, labelFrom, limitNearText, makeElementNode, makeTextNode, NEAR_TEXT_LIMIT } from "../src/lib/page-model.js";

export const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "meta", "link"]);
export const VOID_TAGS = new Set(["meta", "input", "link", "br", "img", "hr"]);
export { NEAR_TEXT_LIMIT };
/** 长文本块不参与文本级规则（与 `src/content/collector.js` 的 `NEAR_TEXT_LIMIT * 2` 同口径）。 */
export const TEXT_NODE_LIMIT = NEAR_TEXT_LIMIT * 2;

/** 声明样式的默认值（D28：默认样式不写进 HTML；单点声明在本模块 + 生成器同口径）。 */
export const DECLARED_DEFAULT_STYLE = {
  display: "block",
  color: "#1f2937",
  backgroundColor: "#ffffff",
  opacity: 1,
  fontSizePx: 16,
};

const TAG_TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\/?>/g;
const ATTR_TOKEN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g;
/** 自写轻量 HTML 解析（只覆盖 fixture 用到的子集：普通标签 / 双引号属性 / void / 文本 / 注释）。 */
export function parseHtml(html) {
  const document = { tag: "#document", attrs: {}, children: [] };
  const stack = [document];
  let last = 0;
  let match;
  TAG_TOKEN.lastIndex = 0;
  while ((match = TAG_TOKEN.exec(html)) !== null) {
    const chunk = html.slice(last, match.index);
    if (chunk.length > 0) stack[stack.length - 1].children.push({ text: chunk });
    last = TAG_TOKEN.lastIndex;
    const [, closing, opening, rawAttrs] = match;
    if (closing) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === closing.toLowerCase()) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    if (!opening) continue; // 注释 / doctype
    const node = { tag: opening.toLowerCase(), attrs: parseAttrs(rawAttrs ?? ""), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(node.tag)) stack.push(node);
  }
  const tail = html.slice(last);
  if (tail.length > 0) stack[stack.length - 1].children.push({ text: tail });
  return document;
}

function parseAttrs(raw) {
  const attrs = {};
  ATTR_TOKEN.lastIndex = 0;
  let match;
  while ((match = ATTR_TOKEN.exec(raw)) !== null) {
    if (match[0].trim().length === 0) continue;
    attrs[match[1].toLowerCase()] = match[2] ?? "";
  }
  if (attrs.checked === "" || attrs.checked === "checked") attrs.checked = "true";
  return attrs;
}

const isElement = (node) => node.tag !== undefined;
const elementChildren = (node) => node.children.filter(isElement);
const textChildren = (node) => node.children.filter((child) => child.text !== undefined);


/** 文本内容带记忆化（压力页 5007 节点是扁平大列表，逐节点重算父文本是 O(n²)）。 */
const textContentCache = new WeakMap();

/** 文本内容：递归拼接（跳过 SKIP_TAGS 子树），与浏览器 `textContent` 同语义（随后由调用方归一空白）。 */
export function textContentOf(node) {
  if (node.text !== undefined) return node.text;
  if (SKIP_TAGS.has(node.tag)) return "";
  const cached = textContentCache.get(node);
  if (cached !== undefined) return cached;
  const value = node.children.map(textContentOf).join(" ");
  textContentCache.set(node, value);
  return value;
}

function labelOf(node) {
  return labelFrom({ tag: node.tag, attrs: node.attrs, ownText: textContentOf(node) });
}

/** 宿主元素的周边文本 = 父容器文本 − 宿主元素文本（空串合法；口径单点在 `src/lib/page-model.js`）。 */
function nearTextOf(node, parent) {
  if (!parent) return "";
  return limitNearText(textContentOf(node), textContentOf(parent));
}

/** 定位串：`tag:nth(i)`（i = 同标签**元素**兄弟中的下标；文本节点不参与计数）。 */
function assignPaths(node, parentPath, pathMap, siblingIndex) {
  const path = parentPath === null ? `${node.tag}:nth(0)` : `${parentPath}>${node.tag}:nth(${siblingIndex})`;
  pathMap.set(node, path);
  const counters = new Map();
  for (const child of elementChildren(node)) {
    const index = counters.get(child.tag) ?? 0;
    counters.set(child.tag, index + 1);
    assignPaths(child, path, pathMap, index);
  }
  return pathMap;
}

function styleEntryOf(styleMap, path, pageId) {
  if (styleMap === null) return { ...DECLARED_DEFAULT_STYLE };
  const entry = styleMap?.styles?.[path];
  if (!entry) throw new Error(`${pageId}: style-map.json 缺 ${path}（声明样式子集不完整——不静默取默认值）`);
  return entry;
}

/**
 * 页面模型：元素节点在前，其直接文本子节点随后（与 `src/content/collector.js` 的遍历顺序一致）。
 * @param {{html: string, styleMap: object|null, pageId?: string}} input
 */
export function buildPageModel({ html, styleMap, pageId = "page" }) {
  const document = parseHtml(html);
  const root = elementChildren(document)[0] ?? null;
  if (!root) throw new Error(`${pageId}: page.html 里找不到根元素`);
  const pathMap = assignPaths(root, null, new Map(), 0);

  const nodes = [];
  let seq = 0;
  const visit = (node, parent) => {
    if (SKIP_TAGS.has(node.tag)) return;
    const path = pathMap.get(node);
    const entry = styleEntryOf(styleMap, path, pageId);
    const style = {
      display: entry.display,
      color: entry.color,
      backgroundColor: entry.backgroundColor,
      opacity: entry.opacity,
      fontSizePx: entry.fontSizePx,
    };
    const box = {};
    if (entry.widthPx !== undefined) box.widthPx = entry.widthPx;
    if (entry.heightPx !== undefined) box.heightPx = entry.heightPx;
    const nearText = nearTextOf(node, parent);
    nodes.push(
      makeElementNode({
        seq: seq++,
        tag: node.tag,
        path,
        attrs: { ...node.attrs },
        label: labelOf(node),
        nearText,
        style,
        box,
        contrast: contrastRatio(style.color, style.backgroundColor) ?? undefined,
      }),
    );
    for (const child of textChildren(node)) {
      const text = child.text.trim();
      if (text.length === 0 || text.length > TEXT_NODE_LIMIT) continue;
      nodes.push(makeTextNode({ seq: seq++, text, nearText, path }));
    }
    for (const child of elementChildren(node)) visit(child, node);
  };
  visit(root, null);

  const byPath = new Map();
  for (const node of nodes) {
    const list = byPath.get(node.path) ?? [];
    list.push(node);
    byPath.set(node.path, list);
  }
  return { nodes, document, root, pathMap, byPath };
}

/** 定位串回解（B5：locator 必须唯一可回解）；回解不到返回 null（不静默兜底）。 */
export function resolvePath(document, path) {
  const segments = String(path).split(">").filter((part) => part.length > 0);
  if (segments.length === 0) return null;
  let pool = elementChildren(document);
  let current = null;
  for (const segment of segments) {
    const match = /^([a-zA-Z0-9]+):nth\((\d+)\)$/.exec(segment);
    if (!match) return null;
    const [, tag, rawIndex] = match;
    const sameTag = pool.filter((node) => node.tag === tag.toLowerCase());
    const wanted = Number(rawIndex);
    if (wanted >= sameTag.length) return null;
    current = sameTag[wanted];
    pool = elementChildren(current);
  }
  return current;
}

export function fixturesDir(root) {
  return join(root, "data", "fixtures");
}

export function pageIds(root) {
  const dir = fixturesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^page-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

/**
 * 读一页并产出模型（**真值与页面一起读**，但模型绝不读真值——真值只用于对账）。
 * @returns {{id, html, truth, styleMap, model}}
 */
export function loadFixturePage(root, id) {
  const dir = join(fixturesDir(root), id);
  const htmlPath = join(dir, "page.html");
  if (!existsSync(htmlPath)) throw new Error(`缺 ${htmlPath}（先跑 npm run fixtures）`);
  const html = readFileSync(htmlPath, "utf8");
  const styleMap = readJson(join(dir, "style-map.json"));
  const truth = readJson(join(dir, "truth.json"));
  return { id, dir, html, truth, styleMap, model: buildPageModel({ html, styleMap, pageId: id }) };
}

/** 压力页：生成器不产 style-map（D28 的默认样式单点），故此处落回声明默认值。 */
export function loadStressPage(root, dirName = "stress-5k") {
  const dir = join(fixturesDir(root), dirName);
  const html = readFileSync(join(dir, "page.html"), "utf8");
  const styleMap = readJson(join(dir, "style-map.json"));
  return {
    id: dirName,
    html,
    meta: readJson(join(dir, "meta.json")),
    model: buildPageModel({ html, styleMap, pageId: dirName }),
  };
}
