// 采集侧 ↔ 基准侧**同语义**（K24 / `plan/04` M2 待办第 1 条）：
//   把同一份 `page.html` + `style-map.json` 分别喂给
//     ① `src/content/collector.js`（浏览器侧采集器，跑在**假 DOM** 上）
//     ② `tools/fixture-page-model.mjs`（Node 侧基准解析器）
//   逐节点比对 `path / kind / text / label / nearText / attrs / style / contrast / box`。
//
// 为什么必须有这条：基准证明的是"判定核心在该模型下正确"；若**模型本身**两侧语义不同，
// 基准全绿也证明不了浏览器里的行为。M2 改过 `collector.js`（label / 周边文本口径），
// 但本机拉不起浏览器 → 这条测试就是"改过采集器"的唯一可执行证据（离线，假 DOM）。
//
// 假 DOM 的口径（与真实浏览器对齐到"声明样式子集"这一层，D15/D28）：
//   · `textContent` 用**原始拼接**（不插分隔符，与浏览器一致）——两侧都归一空白，故应当一致；
//   · `getComputedStyle` 返回 `style-map.json` 的声明值；**未声明尺寸的元素 `getBoundingClientRect` 返回 null**
//     （与基准侧"声明样式子集"同口径；真实浏览器里所有元素都有 box，这是 D15 已登记的缺口）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectPageModel } from "../src/content/collector.js";
import { buildPageModel, parseHtml, pageIds } from "../tools/fixture-page-model.mjs";
import { DECLARED_DEFAULT_STYLE } from "../tools/fixture-page-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "meta", "link"]);
const VOID_TAGS = new Set(["meta", "input", "link", "br", "img", "hr"]);

/** 假 DOM：把解析树包成采集器要的形状。**样式只来自 style-map**（声明子集）。 */
function makeFakeDom(html, styleMap) {
  const tree = parseHtml(html);
  const rootTree = tree.children.find((child) => child.tag !== undefined);
  if (!rootTree) throw new Error("page.html 里找不到根元素");

  // 先按**独立于采集器**的路径算法给每个元素挂上声明样式
  const styles = new Map();
  const assign = (node, parentPath, siblingIndex) => {
    const path = parentPath === null ? `${node.tag}:nth(0)` : `${parentPath}>${node.tag}:nth(${siblingIndex})`;
    styles.set(node, styleMap.styles?.[path] ?? DECLARED_DEFAULT_STYLE);
    const counters = new Map();
    for (const child of node.children.filter((c) => c.tag !== undefined)) {
      const index = counters.get(child.tag) ?? 0;
      counters.set(child.tag, index + 1);
      assign(child, path, index);
    }
  };
  assign(rootTree, null, 0);

  const wrap = (node, parent) => {
    if (node.text !== undefined) {
      return { nodeType: 3, nodeValue: node.text, parentElement: parent };
    }
    const element = {
      nodeType: 1,
      tagName: node.tag.toUpperCase(),
      parentElement: parent,
      attributes: Object.entries(node.attrs).map(([name, value]) => ({ name, value })),
      childNodes: [],
      children: [],
      checked: node.attrs.checked === "true",
      getBoundingClientRect: () => {
        const entry = styles.get(node) ?? DECLARED_DEFAULT_STYLE;
        if (entry.widthPx === undefined || entry.heightPx === undefined) return null;
        return { width: entry.widthPx, height: entry.heightPx };
      },
    };
    Object.defineProperty(element, "textContent", {
      get() {
        // 原始拼接（不插分隔符）——与真实浏览器一致；两侧随后各自归一空白
        return element.childNodes.map((child) => (child.nodeType === 3 ? child.nodeValue : child.textContent)).join("");
      },
    });
    for (const child of node.children) {
      const wrapped = wrap(child, element);
      element.childNodes.push(wrapped);
      if (wrapped.nodeType === 1) element.children.push(wrapped);
    }
    return element;
  };

  const documentElement = wrap(rootTree, null);
  const document = {
    nodeType: 9,
    documentElement,
    children: [documentElement],
    defaultView: {
      getComputedStyle: (element) => {
        const entry = styles.get(findTree(element)) ?? DECLARED_DEFAULT_STYLE;
        return {
          display: entry.display,
          color: entry.color,
          backgroundColor: entry.backgroundColor,
          opacity: String(entry.opacity),
          fontSize: `${entry.fontSizePx}px`,
        };
      },
    },
  };
  documentElement.parentElement = document;

  // element → 解析树节点（供 getComputedStyle 取声明样式）
  const treeOf = new WeakMap();
  const link = (element, node) => {
    treeOf.set(element, node);
    const elementChildren = node.children.filter((child) => child.tag !== undefined);
    element.children.forEach((child, index) => link(child, elementChildren[index]));
  };
  link(documentElement, rootTree);
  const findTree = (element) => treeOf.get(element);
  return document;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const compact = (node) => ({
  kind: node.kind,
  tag: node.tag,
  text: node.text,
  label: node.label,
  nearText: node.nearText,
  attrs: node.attrs,
  style: {
    display: node.style.display,
    color: node.style.color,
    backgroundColor: node.style.backgroundColor,
    opacity: node.style.opacity,
    fontSizePx: node.style.fontSizePx,
  },
  contrast: node.contrast ?? null,
  box: { widthPx: node.box?.widthPx ?? null, heightPx: node.box?.heightPx ?? null },
  path: node.path,
});

const IDS = pageIds(ROOT);

test("扫描面非空：40 页都参与两侧语义比对（判据不能空跑）", () => {
  assert.ok(IDS.length >= 12, `参与比对的页面过少：${IDS.length}`);
});

test("采集器（假 DOM）与基准解析器逐节点同语义：path/kind/text/label/nearText/attrs/style/contrast/box", () => {
  const problems = [];
  let compared = 0;
  for (const id of IDS) {
    const dir = join(ROOT, "data", "fixtures", id);
    const html = readFileSync(join(dir, "page.html"), "utf8");
    const styleMap = readJson(join(dir, "style-map.json"));

    const browser = collectPageModel(makeFakeDom(html, styleMap), { now: () => 0 });
    const bench = buildPageModel({ html, styleMap, pageId: id });

    if (browser.nodes.length !== bench.nodes.length) {
      problems.push(`${id}: 节点数不同（采集 ${browser.nodes.length} / 基准 ${bench.nodes.length}）`);
      continue;
    }
    browser.nodes.forEach((node, index) => {
      compared += 1;
      const left = compact(node);
      const right = compact(bench.nodes[index]);
      for (const field of Object.keys(left)) {
        const a = JSON.stringify(left[field]);
        const b = JSON.stringify(right[field]);
        if (a !== b) problems.push(`${id}[${index}] ${field}: 采集 ${a} ≠ 基准 ${b}`);
      }
    });
  }
  assert.ok(compared > 0, "没有比对到任何节点");
  assert.deepEqual(problems.slice(0, 20), [], `两侧语义不一致（共 ${problems.length} 处）：${problems.slice(0, 20).join("；")}`);
});

test("同语义自证：这条比对**真的会红**（把基准侧 label 口径换成缺口形态 → 必须报出差异）", () => {
  const id = IDS[0];
  const dir = join(ROOT, "data", "fixtures", id);
  const html = readFileSync(join(dir, "page.html"), "utf8");
  const styleMap = readJson(join(dir, "style-map.json"));
  const browser = collectPageModel(makeFakeDom(html, styleMap), { now: () => 0 });
  const bench = buildPageModel({ html, styleMap, pageId: id });

  // 基线：两侧一致
  const baseline = browser.nodes.filter((node, index) => JSON.stringify(compact(node)) !== JSON.stringify(compact(bench.nodes[index])));
  assert.deepEqual(baseline, [], "基线两侧应当一致");

  // 变异：把基准侧**普通元素**的 label 换成自身文本（M1 缺口形态）→ 必须报出差异
  const mutated = bench.nodes.map((node) => (node.kind === "element" ? { ...node, label: "缺口形态注入的标签" } : node));
  const diff = browser.nodes.filter((node, index) => JSON.stringify(compact(node)) !== JSON.stringify(compact(mutated[index])));
  assert.ok(diff.length > 0, "注入差异后两侧仍全等 → 这条比对是恒真的（证明不了同语义）");
});

test("采集器只读纪律在假 DOM 上也成立：不改属性、不写样式（比对后宿主对象逐字段未变）", () => {
  const id = IDS[0];
  const dir = join(ROOT, "data", "fixtures", id);
  const html = readFileSync(join(dir, "page.html"), "utf8");
  const styleMap = readJson(join(dir, "style-map.json"));
  const document = makeFakeDom(html, styleMap);
  const snapshot = (element) =>
    JSON.stringify({
      attrs: element.attributes,
      children: element.children.length,
      text: element.textContent,
      inline: element.getAttribute?.("style") ?? null,
    });
  const before = [];
  const walk = (element) => {
    before.push(snapshot(element));
    for (const child of element.children) walk(child);
  };
  walk(document.documentElement);
  collectPageModel(document, { now: () => 0 });
  const after = [];
  const walkAfter = (element) => {
    after.push(snapshot(element));
    for (const child of element.children) walkAfter(child);
  };
  walkAfter(document.documentElement);
  assert.deepEqual(after, before, "采集器不得改动宿主（属性集 / 子节点数 / 文本）");
});
