// 最小假 DOM（**只覆盖覆盖层模块用到的子集**）：覆盖层必须在离线可验收——
// 本机自动化拉浏览器不稳（有实测史，见 `plan/06` §五），M2 的采集器/注入链路也是这么验的。
//
// 口径对齐真实浏览器（只对齐被测的那几件事）：
//   · `document.children = [documentElement]`——与 `src/content/collector.js` 的 `resolveLocator(path, root)`
//     的 root 语义一致（root 非空时它从 `root.children` 起解）；
//   · `shadowRoot` **不是**宿主元素的 child（不参与宿主节点数）——这正是"只多一个容器节点"的判据来源；
//   · `style` 写在 shadow root 内 → **不进 `document.styleSheets`**（真实浏览器亦如此，判据之三）；
//   · 属性/类/内联样式都落在元素上（`getAttribute` 形态），快照可逐字段比对。
//
// 这里允许用 `setAttribute`（本文件在 `tests/helpers/`，不是 `src/content/**`）——
// `src/content/**` 的只读纪律由 `tests/source-hygiene.test.mjs` 守，两处判据各管各的。

import { parseHtml } from "../../tools/fixture-page-model.mjs";

const VOID_TAGS = new Set(["meta", "input", "link", "br", "img", "hr"]);

class FakeStyle {
  constructor() {
    this.vars = new Map();
  }
  setProperty(name, value) {
    this.vars.set(String(name), String(value));
  }
  getPropertyValue(name) {
    return this.vars.get(String(name)) ?? "";
  }
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }
  add(...names) {
    const set = new Set(this.element.className.split(/\s+/).filter(Boolean));
    for (const name of names) if (name) set.add(String(name));
    this.element.className = [...set].join(" ");
  }
  remove(...names) {
    const set = new Set(this.element.className.split(/\s+/).filter(Boolean));
    for (const name of names) set.delete(String(name));
    this.element.className = [...set].join(" ");
  }
  contains(name) {
    return this.element.className.split(/\s+/).includes(String(name));
  }
}

export class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.nodeType = 1;
    this.localName = String(tagName).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.childNodes = [];
    this.parentElement = null;
    this.attrs = new Map();
    this.dataset = {};
    this.style = new FakeStyle();
    this.shadowRoot = null;
    this.listeners = new Map();
    this.scrollIntoViewCalls = [];
    this.rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.ownText = "";
    this.classList = new FakeClassList(this);
  }

  // ── 属性（真实 DOM 的 getAttribute/setAttribute 形态；快照据此逐字段比对）──
  getAttribute(name) {
    return this.attrs.get(String(name)) ?? null;
  }
  setAttribute(name, value) {
    this.attrs.set(String(name), String(value));
  }
  get attributes() {
    return [...this.attrs].map(([name, value]) => ({ name, value }));
  }
  get id() {
    return this.attrs.get("id") ?? "";
  }
  set id(value) {
    this.attrs.set("id", String(value));
  }
  get className() {
    return this.attrs.get("class") ?? "";
  }
  set className(value) {
    const text = String(value);
    if (text.length === 0) this.attrs.delete("class");
    else this.attrs.set("class", text);
  }

  // ── 文本 ──
  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    this.ownText = String(value);
    for (const child of [...this.children]) child.remove();
  }

  // ── 树操作 ──
  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      node.parentElement = this;
      this.children.push(node);
      this.childNodes.push(node);
    }
  }
  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    parent.childNodes = parent.childNodes.filter((child) => child !== this);
    this.parentElement = null;
  }
  attachShadow() {
    const root = new FakeShadowRoot(this.ownerDocument, this);
    this.shadowRoot = root;
    return root;
  }

  // ── 查询（只实现覆盖层/侧边栏用到的选择器：`tag` / `.class` / `#id` / `.class[data-x="y"]`）──
  matches(selector) {
    const attr = /\[([^=\]]+)="([^"]*)"\]$/.exec(selector);
    const base = attr ? selector.slice(0, selector.length - attr[0].length) : selector;
    if (attr) {
      const actual = attr[1].startsWith("data-")
        ? this.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())]
        : this.getAttribute(attr[1]);
      if (String(actual ?? "") !== attr[2]) return false;
    }
    if (base.length === 0) return true;
    if (base.startsWith(".")) return this.className.split(/\s+/).includes(base.slice(1));
    if (base.startsWith("#")) return this.id === base.slice(1);
    return this.localName === base.toLowerCase();
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  // ── 事件与几何 ──
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this });
  }
  click() {
    this.dispatch("click");
  }
  getBoundingClientRect() {
    return { ...this.rect };
  }
  scrollIntoView(options) {
    this.scrollIntoViewCalls.push(options ?? null);
  }
}

/** shadow root：**不进宿主 children**（不参与宿主节点数），但可查询其内部节点。 */
class FakeShadowRoot extends FakeElement {
  constructor(ownerDocument, host) {
    super("#shadow-root", ownerDocument);
    this.host = host;
  }
}

export function createFakeDocument() {
  const doc = {
    nodeType: 9,
    styleSheets: [],
    children: [],
  createElement: (tagName) => new FakeElement(tagName, doc),
  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  },
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  },
  getElementById(id) {
      const walk = (element) => {
        if (element.id === String(id)) return element;
        for (const child of element.children) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this.documentElement);
    },
  };
  const html = new FakeElement("html", doc);
  const head = new FakeElement("head", doc);
  const body = new FakeElement("body", doc);
  html.append(head, body);
  doc.documentElement = html;
  doc.children = [html];
  doc.body = body;
  return doc;
}

/** 由真实 `page.html` 建假 DOM（定位串因此可在假 DOM 上按 `resolveLocator` 回解）。 */
export function buildFakeDom(html) {
  const tree = parseHtml(html);
  const rootTree = tree.children.find((child) => child.tag !== undefined);
  if (!rootTree) throw new Error("page.html 里找不到根元素");
  const doc = createFakeDocument();
  const wrap = (node, parent) => {
    if (node.text !== undefined) return null; // 文本节点不建（覆盖层只需要元素定位）
    const element = new FakeElement(node.tag, doc);
    element.parentElement = parent;
    for (const [name, value] of Object.entries(node.attrs ?? {})) element.setAttribute(name, value);
    for (const child of node.children) {
      const wrapped = wrap(child, element);
      if (wrapped) element.append(wrapped);
    }
    return element;
  };
  // 整棵树直接按解析结果重建（含 html/head/body），再把假文档的指针指过去——
  // 与真实浏览器形态一致：`document.children = [documentElement]`（`resolveLocator` 的 root 语义）。
  const documentElement = wrap(rootTree, null);
  documentElement.localName = "html";
  documentElement.tagName = "HTML";
  doc.documentElement = documentElement;
  doc.children = [documentElement];
  doc.body = documentElement.children.find((child) => child.localName === "body") ?? documentElement;
  return doc;
}

/** 宿主快照：**节点数 / 属性集（含 id/class/其余属性/data-*） / `document.styleSheets.length`** 三项。 */
export function snapshotDocument(doc) {
  const rows = [];
  const walk = (element) => {
    const attrs = element.attributes
      .map(({ name, value }) => `${name}=${value}`)
      .sort()
      .join(",");
    const data = Object.entries(element.dataset)
      .map(([name, value]) => `data-${name}=${value}`)
      .sort()
      .join(",");
    rows.push(`${element.localName}|${attrs}|${data}`);
    for (const child of element.children) walk(child);
  };
  walk(doc.documentElement);
  return { nodeCount: rows.length, attributeSet: rows.join("\n"), styleSheetCount: doc.styleSheets.length };
}

/** 三项判据逐项比对；返回差异清单（空 = 一致）。 */
export function snapshotDiff(before, after) {
  const diffs = [];
  if (before.nodeCount !== after.nodeCount) diffs.push(`节点数 ${before.nodeCount} → ${after.nodeCount}`);
  if (before.attributeSet !== after.attributeSet) diffs.push("属性集不同");
  if (before.styleSheetCount !== after.styleSheetCount) {
    diffs.push(`document.styleSheets.length ${before.styleSheetCount} → ${after.styleSheetCount}`);
  }
  return diffs;
}

/** 假 chrome 运行时：记下 `runtime.sendMessage`（覆盖层的"点徽标 → 通知侧边栏"要断言这条）。 */
export function fakeRuntime() {
  const calls = [];
  return {
    calls,
    runtime: {
      id: "fake-extension-id",
      sendMessage: (message) => {
        calls.push(message);
        return Promise.resolve({ status: "ok" });
      },
    },
  };
}