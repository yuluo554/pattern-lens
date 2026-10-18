#!/usr/bin/env node
// M1 fixture 生成器（plan/04 · M1「数据先行」；plan/05 §一–§三）。
//
// 职责（逐条对应 plan/06 §二 M1 DoD）：
//   ① 40 页合成页面：`data/fixtures/page-NN/{page.html,style-map.json,truth.json}`
//      （页数读 `rules/manifest.json` → `thresholds.fixture_page_count`，本文件不写第二份数字）
//   ② 真值只存**输入与期望**：`positives` = `{rule_id, selector_path, snippet_expected, note?}`，
//      `negatives` = `{rule_id, selector_path, note}`（"看起来像但按规则不成立"）。
//      **禁止 `observed_*` 一类"观测"字段**——冻结观测会让基准退化成"比对两份预先算好的答案"。
//   ③ `COVERAGE.md` **由真值汇总生成**（不手编）：逐规则正/负样本计数。
//   ④ 压力页 `data/fixtures/stress-5k/page.html`（节点数读 manifest → `thresholds.stress_node_count`）。
//   ⑤ 产物一律经 `src/lib/serialize.js`（字段顺序 / LF / 结尾换行单点）；**无随机、无系统时钟、无时间戳**：
//      同输入 → 逐字节同产物（`--check` 在本进程内再生成一遍，与冻结产物位级比对，不写盘）。
//   ⑥ 生成期断言：白名单（站点名 / 域名）、snippet 原样（逐字出现在 `page.html`）、
//      每条真值节点在**规则数据**下确实命中 / 确实不命中（不依赖任何"观测"结果）。
//
// 用法：
//   node tools/gen-fixtures.mjs          生成 / 覆盖 data/fixtures/
//   node tools/gen-fixtures.mjs --check  再生成并与冻结产物逐字节比对
// 退出码：0 成功 / 1 `--check` 发现差异 / 2 用法或断言错误。

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectEvidence,
  contrastRatio,
  makeElementNode,
  makeSnippet,
  makeTextNode,
  matchesDetect,
} from "../src/lib/page-model.js";
import { RULESET, RULE_SPECS } from "../src/lib/rules-pack.js";
import { orderedJsonText } from "../src/lib/serialize.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES_DIR = join(ROOT, "data", "fixtures");
export const STRESS_DIR_NAME = "stress-5k";

/** 假站点名白名单（单点在 `data/README.md` §3.1；`tests/truth-shape.test.mjs` 断言两处一致）。 */
export const SITE_NAMES = [
  "示例商城（虚构）",
  "样例电器（虚构）",
  "演示票务（虚构）",
  "演示订阅（虚构）",
  "样例会员（虚构）",
];

/** 允许的保留域名（同上，`data/README.md` §3.1）。 */
export const ALLOWED_DOMAINS = ["example.invalid", "fixture.local"];

/** 真实/受限顶级域：出现在 fixture 里即为白名单越界（`.invalid` / `.local` 不在其内）。 */
const FORBIDDEN_DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:com|cn|net|org|io|co|shop|store|app|dev|me|biz|info|xyz)\b/i;

const PLACEHOLDER_PHONE = "19900000000";

const NEAR_TEXT_LIMIT = 200;
const TEXT_NODE_LIMIT = 400;
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "meta", "link"]);
const VOID_TAGS = new Set(["meta", "input", "link", "br", "img", "hr"]);
const NO_STYLE_ATTR = new Set(["html", "head", "style", "title", "meta", "link", "br", "img", "hr"]);

const BASE_STYLE = { display: "block", color: "#1f2937", backgroundColor: "#ffffff", opacity: 1, fontSizePx: 16 };

const STYLE_BLOCK = [
  "body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; }",
  "main { max-width: 760px; }",
  "header h1 { font-size: 20px; margin: 0 0 4px; }",
  "section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }",
  "h2 { font-size: 15px; margin: 0 0 8px; }",
  "p { margin: 6px 0; }",
  "footer { font-size: 12px; margin-top: 24px; }",
].join("\n");

// ── 断言工具 ─────────────────────────────────────────────────────────────────

function fail(message) {
  const error = new Error(message);
  error.fixtureFailure = true;
  throw error;
}

function assertPlainText(value, where) {
  if (/[<>&"]/.test(String(value))) fail(`${where} 含 HTML 保留字符（会让 snippet 无法逐字出现在 page.html）：${value}`);
}

/** 白名单断言：站点名 / 域名 / 电话号段（越界即报错退出，不静默替换）。 */
export function assertWhitelisted({ pageId, site, url, html }) {
  if (!SITE_NAMES.includes(site)) fail(`${pageId}: 站点名「${site}」不在 data/README.md §3.1 白名单内`);
  const host = String(url).replace(/^https?:\/\//, "").split("/")[0];
  if (!ALLOWED_DOMAINS.includes(host)) fail(`${pageId}: 域名「${host}」不在白名单（${ALLOWED_DOMAINS.join(" / ")}）内`);
  if (/https?:\/\//.test(html)) fail(`${pageId}: 页面正文出现外部链接（fixture 不得含任何外链）`);
  const foreign = FORBIDDEN_DOMAIN.exec(html);
  if (foreign) fail(`${pageId}: 页面出现白名单外域名「${foreign[0]}」`);
  for (const match of html.matchAll(/\b1\d{10}\b/g)) {
    if (match[0] !== PLACEHOLDER_PHONE) fail(`${pageId}: 电话号段越界「${match[0]}」（只用保留号段 ${PLACEHOLDER_PHONE}）`);
  }
}

// ── 元素树 DSL（渲染 HTML 与构建模型共用同一棵树）──────────────────────────────

function tx(value, truth) {
  assertPlainText(value, "文本节点");
  return { text: String(value), truth };
}

function el(tag, options = {}, children = []) {
  const { attrs = {}, style = {}, box = {}, truth } = options;
  for (const [name, value] of Object.entries(attrs)) assertPlainText(value, `属性 ${tag}[${name}]`);
  return { tag, attrs: { ...attrs }, style: { ...BASE_STYLE, ...style }, box: { ...box }, children, truth };
}

const p = (value, truth) => el("p", {}, [tx(value, truth)]);
const span = (value) => el("span", { style: { display: "inline" } }, [tx(value)]);
const sample = (children) => el("div", { attrs: { class: "sample" }, style: {} }, children);
const block = (heading, sampleNode) => el("section", {}, [el("h2", {}, [tx(heading)]), sampleNode]);

function checkbox(label, { checked = true, truth } = {}) {
  const attrs = { type: "checkbox" };
  if (checked) attrs.checked = "true";
  attrs["aria-label"] = label;
  return el("input", { attrs, style: { display: "inline-block" }, box: { widthPx: 16, heightPx: 16 }, truth });
}

function button(label, { widthPx, heightPx, color, backgroundColor, opacity = 1, truth } = {}) {
  return el(
    "button",
    {
      attrs: { type: "button" },
      style: { display: "inline-block", color, backgroundColor, opacity, fontSizePx: 14 },
      box: { widthPx, heightPx },
      truth,
    },
    [tx(label)],
  );
}

// ── 渲染 ─────────────────────────────────────────────────────────────────────

function styleAttr(node) {
  const style = [
    `display:${node.style.display}`,
    `color:${node.style.color}`,
    `background-color:${node.style.backgroundColor}`,
    `opacity:${node.style.opacity}`,
    `font-size:${node.style.fontSizePx}px`,
  ];
  if (node.box.widthPx !== undefined) style.push(`width:${node.box.widthPx}px`);
  if (node.box.heightPx !== undefined) style.push(`height:${node.box.heightPx}px`);
  return style.join(";");
}

function renderAttrs(node) {
  const parts = Object.entries(node.attrs).map(([name, value]) => `${name}="${value}"`);
  const isBaseStyle =
    Object.keys(BASE_STYLE).every((key) => node.style[key] === BASE_STYLE[key]) &&
    node.box.widthPx === undefined &&
    node.box.heightPx === undefined;
  // 只渲染"非默认"样式：默认样式不写进 HTML（声明式样式子集在 style-map.json 里逐节点给出）
  if (!NO_STYLE_ATTR.has(node.tag) && !isBaseStyle) parts.push(`style="${styleAttr(node)}"`);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function renderNode(node, depth) {
  const pad = "  ".repeat(depth);
  const attrs = renderAttrs(node);
  if (VOID_TAGS.has(node.tag)) return `${pad}<${node.tag}${attrs}>`;
  const kids = node.children;
  if (kids.length === 0) return `${pad}<${node.tag}${attrs}></${node.tag}>`;
  if (kids.length === 1 && kids[0].text !== undefined) {
    return `${pad}<${node.tag}${attrs}>${kids[0].text}</${node.tag}>`;
  }
  const inner = kids
    .map((child) => (child.text !== undefined ? `${"  ".repeat(depth + 1)}${child.text}` : renderNode(child, depth + 1)))
    .join("\n");
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}

export function renderDocument(root) {
  return `<!DOCTYPE html>\n${renderNode(root, 0)}\n`;
}

// ── 页面模型（与 src/content/collector.js 同语义：同为「渲染后 DOM → 归一化节点」的一层）──

const normalizeWs = (text) => String(text).replace(/\s+/g, " ").trim();

function textContentOf(node) {
  if (node.text !== undefined) return node.text;
  if (SKIP_TAGS.has(node.tag)) return "";
  return node.children.map(textContentOf).join(" ");
}

function labelOf(node) {
  for (const name of ["aria-label", "title", "placeholder", "alt"]) {
    const value = node.attrs[name];
    if (value && value.trim().length > 0) return value.trim().slice(0, NEAR_TEXT_LIMIT);
  }
  const own = textContentOf(node).trim();
  if (own.length > 0) return own.slice(0, NEAR_TEXT_LIMIT);
  const value = node.attrs.value;
  return value && value.trim().length > 0 ? value.trim().slice(0, NEAR_TEXT_LIMIT) : "";
}

function nearTextOf(node, parent) {
  if (!parent) return "";
  const own = textContentOf(node).trim();
  const all = textContentOf(parent).trim();
  return normalizeWs(all.replace(own, "")).slice(0, NEAR_TEXT_LIMIT);
}

function styleOf(node, chain) {
  let background = "rgb(255, 255, 255)";
  for (const candidate of [node, ...chain]) {
    const value = candidate.style.backgroundColor;
    if (value && value !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(value)) {
      background = value;
      break;
    }
  }
  return {
    style: {
      display: node.style.display,
      color: node.style.color,
      backgroundColor: background,
      opacity: node.style.opacity,
      fontSizePx: node.style.fontSizePx,
    },
    contrast: contrastRatio(node.style.color, background) ?? undefined,
  };
}

function assignPaths(node, parentPath, pathMap) {
  const path = parentPath ? parentPath : `${node.tag}:nth(0)`;
  pathMap.set(node, path);
  const counters = new Map();
  for (const child of node.children) {
    if (child.text !== undefined) {
      pathMap.set(child, path); // 文本节点的路径 = 其父元素路径（与采集器一致）
      continue;
    }
    const index = counters.get(child.tag) ?? 0;
    counters.set(child.tag, index + 1);
    assignPaths(child, `${path}>${child.tag}:nth(${index})`, pathMap);
  }
}

/** 页面模型：元素节点在前、其直接文本子节点随后（与采集器的遍历顺序一致）。 */
export function buildModel(root) {
  const pathMap = new Map();
  assignPaths(root, "", pathMap);
  const nodes = [];
  let seq = 0;
  const visit = (node, chain) => {
    if (SKIP_TAGS.has(node.tag)) return;
    const parent = chain[0] ?? null;
    const path = pathMap.get(node);
    const declared = styleOf(node, chain);
    nodes.push(
      makeElementNode({
        seq: seq++,
        tag: node.tag,
        path,
        attrs: node.attrs,
        label: labelOf(node),
        nearText: nearTextOf(node, parent),
        style: declared.style,
        contrast: declared.contrast,
        box: node.box,
      }),
    );
    for (const child of node.children) {
      if (child.text === undefined) continue;
      const text = child.text.trim();
      if (text.length === 0 || text.length > TEXT_NODE_LIMIT) continue;
      nodes.push(makeTextNode({ seq: seq++, text, nearText: nearTextOf(node, parent), path }));
    }
    for (const child of node.children) {
      if (child.text === undefined) visit(child, [node, ...chain]);
    }
  };
  visit(root, []);
  return { nodes, pathMap };
}

/** 判定核心的节点归属（先到先得 + 证据门禁）；此处只用来核对**真值与规则数据一致**。 */
export function effectiveRule(node, packOrder) {
  for (const spec of packOrder) {
    if (!matchesDetect(node, spec.detect).matched) continue;
    if (collectEvidence(node, spec.evidence_required).missing.length === 0) return spec.rule_id;
  }
  return null;
}

// ── 规则 → 样本块（每条规则 4 正样本 + 2 负样本；负样本 = "看起来像但按规则不成立"）────

const P = (rule_id, note) => ({ rule_id, kind: "positive", note });
const N = (rule_id, note) => ({ rule_id, kind: "negative", note });

function textBlocks(ruleId, heading, positives, negatives) {
  return {
    positives: positives.map((item) => () => block(heading, sample([p(item.text, P(ruleId, item.note))]))),
    negatives: negatives.map(
      (item) => () =>
        block(
          heading,
          sample([p(item.text, N(ruleId, item.note)), ...(item.nearby ? [p(item.nearby)] : [])]),
        ),
    ),
  };
}

function checkboxBlocks(ruleId, heading, positives, negatives) {
  return {
    positives: positives.map((item) => () => block(heading, sample([
      checkbox(item.label, { checked: true, truth: P(ruleId, item.note) }),
      span(item.visible),
    ]))),
    negatives: negatives.map((item) => () => block(heading, sample([
      checkbox(item.label, { checked: item.checked, truth: N(ruleId, item.note) }),
      span(item.visible),
    ]))),
  };
}

function closeButtonBlocks(ruleId, heading, positives, negatives) {
  const build = (item, kind) =>
    (() => block(heading, sample([
      button(item.label, {
        widthPx: item.widthPx,
        heightPx: item.heightPx,
        color: item.color,
        backgroundColor: item.backgroundColor,
        opacity: item.opacity ?? 1,
        truth: kind === "positive" ? P(ruleId, item.note) : N(ruleId, item.note),
      }),
    ])));
  return { positives: positives.map((item) => build(item, "positive")), negatives: negatives.map((item) => build(item, "negative")) };
}

const BLOCKS = {
  "dp-prechecked-optin": checkboxBlocks(
    "dp-prechecked-optin",
    "区域：结算页的默认勾选",
    [
      { label: "自动续订会员", visible: "自动续订会员，每月 19 元", note: "加载即勾选；标签指向续订会员" },
      { label: "加入保价服务", visible: "加入保价服务，享 30 天价保", note: "加载即勾选；标签指向保价服务" },
      { label: "订阅每月资讯", visible: "订阅每月资讯邮件", note: "加载即勾选；标签指向订阅" },
      { label: "推荐服务加购", visible: "推荐服务：优先发货", note: "加载即勾选；标签指向推荐服务" },
    ],
    [
      { label: "自动续订会员", visible: "自动续订会员，每月 19 元", checked: false, note: "同类订阅复选框，但加载时未勾选" },
      { label: "同意服务条款", visible: "同意服务条款", checked: true, note: "加载即勾选，但标签与订阅/会员/保价无关" },
    ],
  ),
  "dp-default-addon": checkboxBlocks(
    "dp-default-addon",
    "区域：结算页的默认附加项",
    [
      { label: "延保服务", visible: "延保服务，两年 39 元", note: "附加项加载即勾选（延保）" },
      { label: "一起买配件套装", visible: "一起买：配件套装", note: "搭售项加载即勾选（一起买）" },
      { label: "顺带买贴膜", visible: "顺带买：屏幕贴膜", note: "搭售项加载即勾选（顺带）" },
      { label: "附加服务包", visible: "附加服务包：上门安装", note: "附加项加载即勾选（附加/服务包）" },
    ],
    [
      { label: "延保服务", visible: "延保服务，两年 39 元", checked: false, note: "同类附加项，但加载时未勾选" },
      { label: "记住我的选择", visible: "记住我的选择", checked: true, note: "加载即勾选，但标签与延保/服务包/搭售无关" },
    ],
  ),
  "dp-hidden-close": closeButtonBlocks(
    "dp-hidden-close",
    "区域：弹层的关闭控件",
    [
      { label: "关闭", widthPx: 6, heightPx: 6, color: "#1f2937", backgroundColor: "#ffffff", note: "关闭控件可点击尺寸 6x6（极小）" },
      { label: "跳过", widthPx: 8, heightPx: 8, color: "#1f2937", backgroundColor: "#ffffff", note: "跳过控件可点击尺寸 8x8（极小）" },
      { label: "取消", widthPx: 48, heightPx: 24, color: "#ffffff", backgroundColor: "#ffffff", note: "取消控件前景色与背景色相同" },
      { label: "稍后", widthPx: 4, heightPx: 12, color: "#374151", backgroundColor: "#f9fafb", note: "稍后控件可点击尺寸 4x12（极小）" },
    ],
    [
      { label: "关闭", widthPx: 48, heightPx: 24, color: "#1f2937", backgroundColor: "#ffffff", note: "普通尺寸、正常对比度：不构成隐形关闭" },
      { label: "关闭", widthPx: 40, heightPx: 20, color: "#6b7280", backgroundColor: "#ffffff", note: "尺寸与对比度都在正常范围" },
    ],
  ),
  "dp-dark-close": closeButtonBlocks(
    "dp-dark-close",
    "区域：弹层的关闭控件（对比度）",
    [
      { label: "关闭", widthPx: 48, heightPx: 24, color: "#8a8a8a", backgroundColor: "#909090", note: "关闭控件对比度低于阈值（前景近似背景）" },
      { label: "取消", widthPx: 48, heightPx: 24, color: "#9aa0a6", backgroundColor: "#a8adb3", note: "取消控件对比度低于阈值" },
      { label: "跳过", widthPx: 48, heightPx: 24, color: "#1f2937", backgroundColor: "#ffffff", opacity: 0.3, note: "跳过控件整体透明度 0.3" },
      { label: "关闭", widthPx: 48, heightPx: 24, color: "#777777", backgroundColor: "#808080", note: "关闭控件对比度低于阈值" },
    ],
    [
      { label: "关闭", widthPx: 48, heightPx: 24, color: "#374151", backgroundColor: "#ffffff", note: "对比度充足、透明度正常：不构成低对比关闭" },
      { label: "取消", widthPx: 48, heightPx: 24, color: "#6b7280", backgroundColor: "#ffffff", opacity: 0.8, note: "对比度与透明度都在正常范围" },
    ],
  ),
  "dp-countdown-pressure": textBlocks(
    "dp-countdown-pressure",
    "区域：活动提示",
    [
      { text: "限时 02:45 结束", note: "倒计时形态文本（时分）" },
      { text: "倒计时 10 分钟", note: "倒计时提示文本" },
      { text: "仅剩 5 分钟", note: "倒计时形态文本（分钟）" },
      { text: "限时 199 元", note: "限时施压文本" },
    ],
    [
      { text: "距活动开始 02:45", note: "同为倒计时形态，但文本声明「距活动开始」（中和项）" },
      { text: "活动回顾：倒计时 10 分钟", note: "活动回顾文案（中和项）" },
    ],
  ),
  "dp-fake-scarcity": textBlocks(
    "dp-fake-scarcity",
    "区域：库存提示",
    [
      { text: "仅剩 2 件", note: "数量稀缺表述，周边无来源" },
      { text: "只剩 1 件", note: "数量稀缺表述，周边无来源" },
      { text: "库存仅 3 套", note: "数量稀缺表述，周边无来源" },
      { text: "即将售罄，尽快下单", note: "稀缺表述，周边无来源" },
    ],
    [
      { text: "仅剩 2 件", note: "同为数量稀缺表述，但同区域给出了可核对来源", nearby: "实时库存来源：仓库余量 18" },
      { text: "即将售罄", note: "稀缺表述，但同区域给出了可核对来源", nearby: "库存数据来源：门店盘点" },
    ],
  ),
  "dp-confirmshaming": textBlocks(
    "dp-confirmshaming",
    "区域：拒绝选项的文案",
    [
      { text: "不，不要优惠", note: "把拒绝写成「不要优惠」" },
      { text: "继续以原价购买", note: "把拒绝写成「继续原价」" },
      { text: "还是不要优惠了", note: "把拒绝写成「不要优惠」" },
      { text: "我不需要变得更省钱", note: "把拒绝写成贬损表述" },
    ],
    [
      { text: "不用了，谢谢", note: "中性拒绝文案：不构成确认羞辱" },
      { text: "继续浏览商品", note: "中性继续文案：不构成确认羞辱" },
    ],
  ),
  "dp-anchored-discount": textBlocks(
    "dp-anchored-discount",
    "区域：价格对比",
    [
      { text: "原价 ¥299 现价 ¥199", note: "并列划线价与现价，周边无价格来源" },
      { text: "划线价 ¥499，优惠价 ¥299", note: "并列划线价与优惠价，周边无来源" },
      { text: "日常价 ¥159，到手价 ¥99", note: "并列日常价与到手价，周边无来源" },
      { text: "原价 ¥89，券后 ¥59", note: "并列原价与券后价，周边无来源" },
    ],
    [
      { text: "原价 ¥299 现价 ¥199", note: "并列两个价格，但同区域给出价格来源", nearby: "价格说明：划线价为厂商建议零售价" },
      { text: "划线价 ¥499，优惠价 ¥299", note: "并列两个价格，但同区域可查历史价格", nearby: "历史价格可查" },
    ],
  ),
  "dp-exit-retention": textBlocks(
    "dp-exit-retention",
    "区域：离开前的挽留",
    [
      { text: "确定要离开吗？", note: "挽留型确认文案" },
      { text: "确定放弃本次订单？", note: "挽留型确认文案" },
      { text: "再想想，购物车先留着", note: "挽留型文案（再想想）" },
      { text: "留下即可领优惠", note: "挽留型文案（留下+优惠）" },
    ],
    [
      { text: "确认订单信息", note: "确认型文案，但不是挽留" },
      { text: "返回购物车", note: "返回型文案，但不是挽留" },
    ],
  ),
  "dp-subscription-trap": textBlocks(
    "dp-subscription-trap",
    "区域：取消说明",
    [
      { text: "如需取消订阅，请致电客服热线", note: "取消渠道指向电话/客服，周边无在线入口" },
      { text: "退订请拨打客服热线 19900000000", note: "退订渠道指向客服热线，周边无在线入口" },
      { text: "解约需前往门店办理", note: "解约渠道指向门店，周边无在线入口" },
      { text: "取消会员请电话联系", note: "取消渠道指向电话，周边无在线入口" },
    ],
    [
      { text: "如需取消订阅，请致电客服热线", note: "同样指向电话，但同区域提供了在线自助入口", nearby: "也可在线取消" },
      { text: "退订请拨打客服热线", note: "同样指向客服，但同区域提供了自助入口", nearby: "或前往账户设置自助取消" },
    ],
  ),
  "dp-hidden-fee": textBlocks(
    "dp-hidden-fee",
    "区域：费用明细",
    [
      { text: "服务费 ¥12 将在结算页计入", note: "附加费用在结算阶段出现" },
      { text: "配送费 8 元，下单时另计", note: "配送费后置出现" },
      { text: "手续费 ¥3，退款不返还", note: "手续费后置出现" },
      { text: "包装费 2 元，另计价", note: "包装费后置出现" },
    ],
    [
      { text: "商品 88 元，合计 88 元（含全部费用）", note: "价格区块一次性给出合计：不含后置费用" },
      { text: "价格明细：商品 88 元 + 运费 0 元", note: "价格区块一次性给出明细：不含后置费用" },
    ],
  ),
  "dp-forced-signup": textBlocks(
    "dp-forced-signup",
    "区域：查看/购买前置条件",
    [
      { text: "注册后才能查看完整评价", note: "把查看评价与注册绑定" },
      { text: "登录后即可浏览商品详情", note: "把浏览与登录绑定" },
      { text: "仅会员可见价格", note: "把可见性与会员身份绑定" },
      { text: "注册即可购买", note: "把购买与注册绑定" },
    ],
    [
      { text: "注册即可领取新客券", note: "注册只关联优惠券，不作为查看/购买前置" },
      { text: "登录查看订单历史", note: "登录用于查看自己的订单，不构成强制注册" },
    ],
  ),
};

const RULE_ORDER = RULE_SPECS.map((spec) => spec.rule_id);
const POSITIVES_PER_RULE = 4;
const NEGATIVES_PER_RULE = 2;

/** 页面分配：正样本逐页轮转（每页至少 1 条），负样本按 3 步长散开（覆盖"看起来像"的页）。 */
export function buildAssignments(pageCount) {
  const pages = Array.from({ length: pageCount }, () => ({ positives: [], negatives: [] }));
  let cursor = 0;
  for (const ruleId of RULE_ORDER) {
    for (let variant = 0; variant < POSITIVES_PER_RULE; variant += 1) {
      pages[cursor % pageCount].positives.push({ rule_id: ruleId, variant });
      cursor += 1;
    }
  }
  cursor = Math.floor(pageCount / 2);
  for (const ruleId of RULE_ORDER) {
    for (let variant = 0; variant < NEGATIVES_PER_RULE; variant += 1) {
      pages[(cursor * 3) % pageCount].negatives.push({ rule_id: ruleId, variant });
      cursor += 1;
    }
  }
  return pages;
}

// ── 一页的产出 ───────────────────────────────────────────────────────────────

function buildPage(index, assignments, thresholds) {
  const pageId = `page-${String(index + 1).padStart(2, "0")}`;
  const site = SITE_NAMES[index % SITE_NAMES.length];
  const url = `https://${index % 2 === 0 ? ALLOWED_DOMAINS[0] : ALLOWED_DOMAINS[1]}/${pageId}.html`;
  const plan = assignments[index];

  const sections = [];
  for (const item of plan.positives) sections.push(BLOCKS[item.rule_id].positives[item.variant]());
  for (const item of plan.negatives) sections.push(BLOCKS[item.rule_id].negatives[item.variant]());

  const root = el("html", { attrs: { lang: "zh-CN" } }, [
    el("head", {}, [
      el("meta", { attrs: { charset: "utf-8" } }),
      el("title", {}, [tx(`${site} · 合成 fixture ${pageId}`)]),
      el("style", {}, [tx(STYLE_BLOCK)]),
    ]),
    el("body", { attrs: { class: "page" } }, [
      el("header", {}, [
        el("h1", {}, [tx(site)]),
        el("p", {}, [tx(`合成 fixture · ${pageId} · 仅用于规则基准，站点与商品均为虚构`)]),
      ]),
      el("main", {}, sections),
      el("footer", {}, [el("p", {}, [tx("本页为合成页面；逐条植入真值见同目录 truth.json。")])]),
    ]),
  ]);

  const html = renderDocument(root);
  const { nodes: model, pathMap } = buildModel(root);

  const positives = [];
  const negatives = [];
  const declaredNodes = [];
  const byPath = new Map();
  for (const node of model) {
    const list = byPath.get(node.path) ?? [];
    list.push(node);
    byPath.set(node.path, list);
  }

  const walkTruth = (node) => {
    if (node.truth) {
      const path = pathMap.get(node);
      const isText = node.text !== undefined;
      const candidates = (byPath.get(path) ?? []).filter((candidate) =>
        isText ? candidate.kind === "text" : candidate.kind !== "text",
      );
      if (candidates.length !== 1) {
        fail(`${pageId}: 真值节点在页面模型里不唯一（path=${path}, kind=${isText ? "text" : "element"}）`);
      }
      const modelNode = candidates[0];
      if (isText && modelNode.text !== node.text.trim()) {
        fail(`${pageId}: 文本节点与模型不一致（path=${path}）`);
      }
      // 条目形态**统一**（`plan/00` D26）：{rule_id, selector_path, snippet_expected, note?}；
      // 正/负由所在数组决定——`positives` = 应命中，`negatives` = "看起来像但按规则不成立"（期望不产出）。
      const { snippet } = makeSnippet(modelNode, thresholds.snippet_max_len);
      if (snippet.length === 0) fail(`${pageId}: ${node.truth.rule_id} 的 snippet 为空`);
      if (!html.includes(snippet)) fail(`${pageId}: snippet「${snippet}」不是 page.html 的原样子串`);
      const entry = {
        rule_id: node.truth.rule_id,
        selector_path: path,
        snippet_expected: snippet,
        note: node.truth.note,
      };
      if (node.truth.kind === "positive") positives.push(entry);
      else negatives.push(entry);
      declaredNodes.push({ kind: node.truth.kind, rule_id: node.truth.rule_id, path, modelNode });
    }
    for (const child of node.children ?? []) walkTruth(child);
  };
  walkTruth(root);

  // 生成期一致性：真值声明的节点必须在**规则数据**下命中/不命中（不依赖任何观测结果）。
  const declared = new Set(declaredNodes.map((item) => `${item.rule_id}|${item.path}`));
  for (const item of declaredNodes) {
    const actual = effectiveRule(item.modelNode, RULE_SPECS);
    const detail = JSON.stringify({
      kind: item.modelNode.kind,
      text: item.modelNode.text,
      label: item.modelNode.label,
      nearText: item.modelNode.nearText,
      attrs: item.modelNode.attrs,
      style: item.modelNode.style,
      box: item.modelNode.box,
    });
    if (item.kind === "positive" && actual !== item.rule_id) {
      fail(`${pageId}: 正样本 ${item.rule_id}（${item.path}）在规则数据下归属为 ${actual ?? "无"}｜节点 ${detail}`);
    }
    if (item.kind === "negative" && actual !== null) {
      fail(`${pageId}: 负样本 ${item.rule_id}（${item.path}）在规则数据下仍被归为 ${actual}｜节点 ${detail}`);
    }
  }
  for (const node of model) {
    if (node.kind === "element") continue; // 容器元素的 label 会含全部子文本：基准层按控件/文本节点对账
    const actual = effectiveRule(node, RULE_SPECS);
    if (actual !== null && !declared.has(`${actual}|${node.path}`)) {
      fail(`${pageId}: 未声明的候选命中 ${actual}（${node.path}：${node.text || node.label}）`);
    }
  }

  const styleMap = {
    page: pageId,
    url,
    site,
    selector_convention: "tag:nth(i) —— i 为同标签兄弟中的下标（与 src/content/collector.js 的定位串一致）",
    styles: {},
  };
  const seen = new Set();
  const collectStyles = (node, chain) => {
    if (!SKIP_TAGS.has(node.tag)) {
      const path = pathMap.get(node);
      if (!seen.has(path)) {
        seen.add(path);
        const style = styleOf(node, chain).style;
        const declaration = {
          display: style.display,
          color: style.color,
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          fontSizePx: style.fontSizePx,
        };
        if (node.box.widthPx !== undefined) declaration.widthPx = node.box.widthPx;
        if (node.box.heightPx !== undefined) declaration.heightPx = node.box.heightPx;
        styleMap.styles[path] = declaration;
      }
    }
    for (const child of node.children ?? []) {
      if (child.text !== undefined) continue;
      collectStyles(child, [node, ...chain]);
    }
  };
  collectStyles(root, []);

  const truth = { page: pageId, site, url, positives, negatives };
  assertWhitelisted({ pageId, site, url, html });
  return { pageId, url, site, html, styleMap, truth };
}

// ── 压力页（5k 节点；规模读 manifest）───────────────────────────────────────────

export function buildStressPage(nodeCount) {
  const rows = Math.max(1, Math.ceil(nodeCount / 2));
  const items = [];
  for (let index = 0; index < rows; index += 1) {
    items.push(el("li", { attrs: { class: "row" } }, [tx(`条目 ${String(index + 1).padStart(5, "0")}`)]));
  }
  const root = el("html", { attrs: { lang: "zh-CN" } }, [
    el("head", {}, [
      el("meta", { attrs: { charset: "utf-8" } }),
      el("title", {}, [tx("压力页 · 合成 fixture（虚构）")]),
      el("style", {}, [tx("body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; } li { padding: 2px 0; }")]),
    ]),
    el("body", { attrs: { class: "stress" } }, [
      el("header", {}, [el("h1", {}, [tx("示例商城（虚构）")])]),
      el("main", {}, [el("ul", { attrs: { class: "rows" } }, items)]),
    ]),
  ]);
  const html = renderDocument(root);
  const { nodes } = buildModel(root);
  return { html, styleMap: null, meta: { page: STRESS_DIR_NAME, rows, nodes: nodes.length }, nodes: nodes.length };
}

// ── 汇总产物 ─────────────────────────────────────────────────────────────────

export function renderCoverage(pages, thresholds) {
  const perRule = new Map(RULE_SPECS.map((spec) => [spec.rule_id, { name: spec.name, positive: 0, negative: 0 }]));
  for (const page of pages) {
    for (const item of page.truth.positives) perRule.get(item.rule_id).positive += 1;
    for (const item of page.truth.negatives) perRule.get(item.rule_id).negative += 1;
  }

  const weak = [];
  const lines = [];
  lines.push("# fixture 覆盖矩阵（生成物 · 禁止手编）");
  lines.push("");
  lines.push("> 生成命令 `npm run fixtures`；再生成位级比对 `npm run fixtures:check`。");
  lines.push("> 本文件由 `tools/gen-fixtures.mjs` 从各页 `truth.json` 汇总生成——手工编辑会被 `fixtures:check` 判为不一致。");
  lines.push("> 正样本 = `truth.json` 的 `positives`（规则应命中）；负样本 = `negatives`（看起来像但按规则不成立）。");
  lines.push("> 每规则最少用例数、fixture 规模、压力页节点数只在 `rules/manifest.json` 定义，本文件不写第二份数字。");
  lines.push("");
  lines.push("## 逐规则覆盖");
  lines.push("");
  lines.push("| rule_id | 规则名 | 正样本 | 负样本 | 覆盖判定 |");
  lines.push("| --- | --- | ---: | ---: | --- |");
  for (const spec of RULE_SPECS) {
    const counts = perRule.get(spec.rule_id);
    const reasons = [];
    if (counts.positive < thresholds.min_cases_per_rule) reasons.push("正样本不足");
    if (counts.negative === 0) reasons.push("无负样本");
    if (reasons.length > 0) weak.push(spec.rule_id);
    lines.push(
      `| ${spec.rule_id} | ${spec.name} | ${counts.positive} | ${counts.negative} | ${reasons.length === 0 ? "达标" : `覆盖弱（${reasons.join("、")}）`} |`,
    );
  }
  lines.push("");
  lines.push("## 逐页索引");
  lines.push("");
  lines.push("| 页 | 站点 | 正样本规则 | 负样本规则 |");
  lines.push("| --- | --- | --- | --- |");
  for (const page of pages) {
    const positiveRules = page.truth.positives.map((item) => item.rule_id).join("、") || "（无）";
    const negativeRules = page.truth.negatives.map((item) => item.rule_id).join("、") || "（无）";
    lines.push(`| ${page.pageId} | ${page.site} | ${positiveRules} | ${negativeRules} |`);
  }
  lines.push("");
  lines.push("## 合计");
  lines.push("");
  lines.push(`- 页面：${pages.length}（\`rules/manifest.json\` → \`thresholds.fixture_page_count\`）`);
  lines.push(`- 规则：${RULE_SPECS.length}`);
  lines.push(`- 正样本：${pages.reduce((sum, page) => sum + page.truth.positives.length, 0)}`);
  lines.push(`- 负样本：${pages.reduce((sum, page) => sum + page.truth.negatives.length, 0)}`);
  lines.push(`- 覆盖弱规则：${weak.length === 0 ? "（无）" : weak.join("、")}`);
  lines.push("");
  return lines.join("\n");
}

export function renderReadme() {
  return [
    "# data/fixtures —— 合成 fixture（生成物）",
    "",
    "由 `tools/gen-fixtures.mjs` 生成：`npm run fixtures` 重生成，`npm run fixtures:check` 做再生成位级比对。",
    "**手工修改 fixture 必须同步改同目录 `truth.json`**，否则 `fixtures:check` 失败。",
    "",
    "## 目录",
    "",
    "- `page-NN/page.html` —— 合成页面（站点名与域名只用 `data/README.md` §3.1 白名单，生成器断言）",
    "- `page-NN/style-map.json` —— **声明样式子集**：`selector_path` → `display/color/backgroundColor/opacity/fontSizePx`（+ 可选的 `widthPx/heightPx`）",
    "- `page-NN/truth.json` —— 逐页真值（只存**输入与期望**）",
    "- `stress-5k/page.html` + `stress-5k/meta.json` —— 压力页（节点规模见 `rules/manifest.json` → `thresholds.stress_node_count`）",
    "- `COVERAGE.md` —— 逐规则正/负样本计数（由真值汇总生成）",
    "",
    "## truth.json 形态（真值纪律，plan/05 §二）",
    "",
    "```json",
    "{",
    '  "page": "page-01",',
    '  "site": "示例商城（虚构）",',
    '  "url": "https://example.invalid/page-01.html",',
    '  "positives": [{ "rule_id": "dp-countdown-pressure", "selector_path": "html:nth(0)>…", "snippet_expected": "限时 02:45 结束", "note": "…" }],',
    '  "negatives": [{ "rule_id": "dp-fake-scarcity", "selector_path": "html:nth(0)>…", "snippet_expected": "即将售罄", "note": "…" }]',
    "}",
    "```",
    "",
    "- **只存输入与期望**：`positives` = 规则**应命中**的节点；`negatives` = **看起来像但按规则不成立**的节点（期望不产出）；两类条目形态**一致**：`{rule_id, selector_path, snippet_expected, note?}`——正负由所在数组决定，不靠额外字段。",
    "- **禁止 `observed_*` / `matched` / `detected` 一类字段**：冻结「观测」会让基准退化成「比对两份预先算好的答案」（引擎全坏也全绿）。",
    "- `snippet_expected` 必须是 `page.html` 的**原样子串**（生成期逐条断言；`tests/truth-shape.test.mjs` 独立复算）。",
    "- 真值**先于规则**、且与规则数据的一致性由生成期断言把关：每条正样本在规则数据下必须归属到声明的 `rule_id`，每条负样本必须不归属任何规则。",
    "",
    "## 页面模型口径（与 `src/content/collector.js` 同语义）",
    "",
    "- 定位串：`tag:nth(i)>tag:nth(i)`，`i` = 同标签兄弟中的下标；文本节点的路径 = 其父元素路径。",
    "- 文本节点：`text` 为宿主文本**原样**（仅去首尾空白），空白文本节点不产出。",
    "- `nearby-text`（周边文本）= **父元素文本内容减去本节点文本内容**（归一空白）；空串是合法证据（`nearby_absent_any` 判据依赖它）。",
    "- 控件标签优先级：`aria-label` / `title` / `placeholder` / `alt` → 自身文本 → `value`。",
    "- `checked` 布尔属性归一为字符串 `true` / `false`。",
    "- 样式来自本目录 `style-map.json`（**声明的样式子集**，不是浏览器计算样式——该缺口在 `plan/03` §六 与 README 局限披露里写明）。",
    "",
  ].join("\n");
}

// ── 产出与比对 ───────────────────────────────────────────────────────────────

export function generate() {
  const thresholds = RULESET.thresholds;
  const pageCount = thresholds.fixture_page_count;
  const assignments = buildAssignments(pageCount);
  const pages = [];
  for (let index = 0; index < pageCount; index += 1) pages.push(buildPage(index, assignments, thresholds));

  const perRule = new Map(RULE_SPECS.map((spec) => [spec.rule_id, 0]));
  for (const page of pages) for (const item of page.truth.positives) perRule.set(item.rule_id, perRule.get(item.rule_id) + 1);
  const under = [...perRule.entries()].filter(([, count]) => count < thresholds.min_cases_per_rule);
  if (under.length > 0) {
    fail(`以下规则正样本少于 min_cases_per_rule：${under.map(([id, count]) => `${id}=${count}`).join(", ")}`);
  }

  const files = new Map();
  for (const page of pages) {
    files.set(`${page.pageId}/page.html`, page.html);
    files.set(`${page.pageId}/style-map.json`, orderedJsonText(page.styleMap));
    files.set(`${page.pageId}/truth.json`, orderedJsonText(page.truth));
  }
  const stress = buildStressPage(thresholds.stress_node_count);
  if (stress.nodes < thresholds.stress_node_count) {
    fail(`压力页节点数不足：${stress.nodes} < ${thresholds.stress_node_count}`);
  }
  files.set(`${STRESS_DIR_NAME}/page.html`, stress.html);
  files.set(`${STRESS_DIR_NAME}/meta.json`, orderedJsonText(stress.meta));
  files.set("COVERAGE.md", renderCoverage(pages, thresholds));
  files.set("README.md", renderReadme());
  return { files, pages, stress, thresholds };
}

function writeTree(dir, files) {
  for (const [rel, text] of files) {
    const target = join(dir, ...rel.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, out);
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

/** 两层守门的第②层：把"再生成结果"与冻结产物逐字节比对（`--check`）。 */
function compareWithFrozen(files) {
  if (!existsSync(FIXTURES_DIR) || !statSync(FIXTURES_DIR).isDirectory()) {
    process.stderr.write(`冻结产物不存在：data/fixtures/（先跑 npm run fixtures）\n`);
    return { status: 1, lines: [] };
  }
  const expected = [...files.keys()].sort();
  const actual = listFiles(FIXTURES_DIR);
  const problems = [];
  for (const name of expected) if (!actual.includes(name)) problems.push(`缺文件 ${name}`);
  for (const name of actual) if (!files.has(name)) problems.push(`多文件 ${name}（冻结产物里有生成器不再产出的文件）`);
  for (const name of expected) {
    if (!actual.includes(name)) continue;
    const onDisk = readFileSync(join(FIXTURES_DIR, ...name.split("/")), "utf8");
    if (onDisk !== files.get(name)) problems.push(`内容不一致 ${name}`);
  }
  const lines = [`再生成 ${expected.length} 个文件 / 冻结产物 ${actual.length} 个文件`];
  if (problems.length === 0) {
    lines.push("一致：冻结产物与再生成结果逐字节相同（位级一致自证）");
    return { status: 0, lines };
  }
  lines.push(`不一致 ${problems.length} 处：`);
  for (const problem of problems.slice(0, 20)) lines.push(`  - ${problem}`);
  if (problems.length > 20) lines.push(`  …（其余 ${problems.length - 20} 处省略）`);
  lines.push("处置：跑 npm run fixtures 重生成（或修正被手工改动的文件）");
  return { status: 1, lines };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write("用法: node tools/gen-fixtures.mjs [--check]\n");
    process.exitCode = 2;
    return;
  }

  let generated;
  try {
    generated = generate();
  } catch (error) {
    process.stderr.write(`${error.fixtureFailure ? "fixture 断言失败" : "生成失败"}：${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (checkOnly) {
    const { status, lines } = compareWithFrozen(generated.files);
    for (const line of lines) process.stdout.write(`${line}\n`);
    process.exitCode = status;
    return;
  }

  rmSync(FIXTURES_DIR, { recursive: true, force: true });
  writeTree(FIXTURES_DIR, generated.files);
  const positives = generated.pages.reduce((sum, page) => sum + page.truth.positives.length, 0);
  const negatives = generated.pages.reduce((sum, page) => sum + page.truth.negatives.length, 0);
  process.stdout.write(`已生成 data/fixtures/：页面 ${generated.pages.length} / 规则 ${RULE_SPECS.length} / 正样本 ${positives} / 负样本 ${negatives} / 文件 ${generated.files.size}\n`);
  process.stdout.write(`压力页：${generated.stress.meta.rows} 行 / ${generated.stress.nodes} 节点（阈值见 rules/manifest.json）\n`);
  process.stdout.write("确定性：无系统时钟、无系统随机 —— 重跑一致由 npm run fixtures:check 断言\n");
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
