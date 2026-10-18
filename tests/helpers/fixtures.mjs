// fixture 语料读取 + 真值形态校验（**独立于生成器**：直接读盘、自写轻量解析、自己复算）。
//
// 为什么独立：`plan/05` §三 要求两层守门——① 断言**盘上冻结产物**的形态；② 再生成位级一致。
// 若第①层复用生成器的内部结构，生成器被改坏时两层会同时瞎掉。故此处只读盘 + 自写解析。
//
// 同时提供"独立读取路径"复算真值（`plan/05` §二.3）：把 `page.html` 直接解析成树，
// 用 `selector_path` 回解节点，核对 `snippet_expected` 是**该节点的直接文本或可读标签**——
// 不依赖被测判定引擎，也不依赖生成器。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const TRUTH_TOP_KEYS = new Set(["page", "site", "url", "positives", "negatives"]);
/** 正/负样本条目形态**统一**（正负由所在数组决定）：`{rule_id, selector_path, snippet_expected, note?}`。 */
export const ITEM_KEYS = new Set(["rule_id", "selector_path", "snippet_expected", "note"]);
export const POSITIVE_KEYS = ITEM_KEYS;
export const NEGATIVE_KEYS = ITEM_KEYS;
/** 真值里**禁止**的"观测"字段（冻结观测会让基准退化成比对两份预先算好的答案）。 */
export const FORBIDDEN_KEY = /observed|matched|detected|found|predicted|actual|hit_/i;

const VOID_TAGS = new Set(["meta", "input", "link", "br", "img", "hr"]);
const TAG_TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\/?>/g;

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

/** 读出全部页面（html / truth / style-map），缺失的字段为 null（由调用方报问题）。 */
export function loadCorpus(root) {
  return pageIds(root).map((id) => {
    const dir = join(fixturesDir(root), id);
    const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : null);
    const parse = (name) => {
      const text = read(name);
      if (text === null) return null;
      try {
        return JSON.parse(text);
      } catch {
        return { __parseError: true };
      }
    };
    return { id, dir, html: read("page.html"), truth: parse("truth.json"), styleMap: parse("style-map.json") };
  });
}

/** 自写轻量 HTML 解析（只覆盖 fixture 用到的子集：普通标签 / 双引号属性 / void / 文本 / 注释）。 */
export function parseHtml(html) {
  const root = { tag: "#document", attrs: {}, children: [] };
  const stack = [root];
  let last = 0;
  let match;
  TAG_TOKEN.lastIndex = 0;
  while ((match = TAG_TOKEN.exec(html)) !== null) {
    const text = html.slice(last, match.index);
    if (text.trim().length > 0) stack[stack.length - 1].children.push({ text });
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
  if (tail.trim().length > 0) stack[stack.length - 1].children.push({ text: tail });
  return root;
}

function parseAttrs(raw) {
  const attrs = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    if (match[0].trim().length === 0) continue;
    attrs[match[1].toLowerCase()] = match[2] ?? "";
  }
  return attrs;
}

export function resolvePath(root, path) {
  const segments = String(path).split(">").filter((part) => part.length > 0);
  if (segments.length === 0) return null;
  let current = null;
  let pool = root.children.filter((child) => child.tag !== undefined);
  for (const segment of segments) {
    const match = /^([a-zA-Z0-9]+):nth\((\d+)\)$/.exec(segment);
    if (!match) return null;
    const [, tag, rawIndex] = match;
    const sameTag = pool.filter((child) => child.tag === tag.toLowerCase());
    const wanted = Number(rawIndex);
    if (wanted >= sameTag.length) return null;
    current = sameTag[wanted];
    pool = current.children.filter((child) => child.tag !== undefined);
  }
  return current ?? null;
}

/** 独立复算：期望 snippet 必须是该节点的**直接文本**或**可读标签**（空串 = 通过，非空 = 问题描述）。 */
export function checkExpectation(root, entry) {
  const element = resolvePath(root, entry.selector_path);
  if (!element) return `selector_path「${entry.selector_path}」在 page.html 里回解不到节点`;
  if (element.tag === "#document") return `selector_path「${entry.selector_path}」指向文档根（不是可取证节点）`;
  const directTexts = (element.children ?? [])
    .filter((child) => child.text !== undefined)
    .map((child) => child.text.trim())
    .filter((text) => text.length > 0);
  if (directTexts.includes(entry.snippet_expected)) return "";
  for (const name of ["aria-label", "title", "placeholder", "alt"]) {
    const value = element.attrs?.[name];
    if (typeof value === "string" && value.trim() === entry.snippet_expected) return "";
  }
  return `snippet「${entry.snippet_expected}」既不是该节点的直接文本，也不是其可读标签（${element.tag}）`;
}

function collectKeys(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collectKeys(item, out);
    }
  }
  return out;
}

/**
 * 真值形态校验（**纯函数**：输入 = 一页的 truth + html，输出 = 问题清单）。
 * 只查"这一页"的形态与期望；**跨页的覆盖下限**由 `recomputeCoverage()` 侧判（口径不同，别混）。
 */
export function validateTruthShape({ pageId, truth, html, positiveRuleIds }) {
  const problems = [];
  const where = `${pageId}/truth.json`;
  if (truth === null) return [`${where} 不存在`];
  if (truth.__parseError) return [`${where} 不是合法 JSON`];
  if (Array.isArray(truth) || typeof truth !== "object") return [`${where} 顶层必须是对象`];

  const unknownTop = Object.keys(truth).filter((key) => !TRUTH_TOP_KEYS.has(key));
  if (unknownTop.length > 0) problems.push(`${where} 顶层出现未登记键：${unknownTop.join(", ")}`);
  for (const key of ["positives", "negatives"]) {
    if (!Array.isArray(truth[key])) problems.push(`${where} 的 ${key} 必须是数组`);
  }
  const forbidden = collectKeys(truth).filter((key) => FORBIDDEN_KEY.test(key));
  if (forbidden.length > 0) {
    problems.push(`${where} 含「观测」类字段（冻结观测会让基准比对两份预先算好的答案）：${[...new Set(forbidden)].join(", ")}`);
  }
  if (truth.page !== pageId) problems.push(`${where} 的 page 字段（${truth.page}）与目录名不一致`);
  if (typeof truth.site !== "string" || truth.site.length === 0) problems.push(`${where} 缺 site`);
  if (typeof truth.url !== "string" || truth.url.length === 0) problems.push(`${where} 缺 url`);
  if (!Array.isArray(truth.positives) || !Array.isArray(truth.negatives)) return problems;

  const root = html === null ? null : parseHtml(html);
  const seen = new Set();

  truth.positives.forEach((entry, index) => {
    const label = `${where} positives[${index}]`;
    const unknown = Object.keys(entry ?? {}).filter((key) => !POSITIVE_KEYS.has(key));
    if (unknown.length > 0) problems.push(`${label} 出现未登记键：${unknown.join(", ")}`);
    if (typeof entry?.rule_id !== "string" || entry.rule_id.length === 0) problems.push(`${label} 缺 rule_id`);
    else if (!positiveRuleIds.has(entry.rule_id)) problems.push(`${label} 的 rule_id「${entry.rule_id}」不在规则包内`);
    if (typeof entry?.selector_path !== "string" || entry.selector_path.length === 0) {
      problems.push(`${label} 缺 selector_path`);
    }
    if (typeof entry?.snippet_expected !== "string" || entry.snippet_expected.length === 0) {
      problems.push(`${label} 缺 snippet_expected`);
    } else if (html !== null && !html.includes(entry.snippet_expected)) {
      problems.push(`${label} 的 snippet「${entry.snippet_expected}」不是 page.html 的原样子串`);
    }
    if (root && typeof entry?.selector_path === "string" && typeof entry?.snippet_expected === "string") {
      const reason = checkExpectation(root, entry);
      if (reason) problems.push(`${label} 独立复算不一致：${reason}`);
    }
    if (typeof entry?.rule_id === "string" && typeof entry?.selector_path === "string") {
      const key = `${entry.rule_id}|${entry.selector_path}`;
      if (seen.has(key)) problems.push(`${label} 与前面的正样本重复（${key}）`);
      seen.add(key);
    }
  });

  const seenNegative = new Set();
  truth.negatives.forEach((entry, index) => {
    const label = `${where} negatives[${index}]`;
    const unknown = Object.keys(entry ?? {}).filter((key) => !NEGATIVE_KEYS.has(key));
    if (unknown.length > 0) problems.push(`${label} 出现未登记键：${unknown.join(", ")}`);
    if (typeof entry?.rule_id !== "string" || entry.rule_id.length === 0) problems.push(`${label} 缺 rule_id`);
    else if (!positiveRuleIds.has(entry.rule_id)) problems.push(`${label} 的 rule_id「${entry.rule_id}」不在规则包内`);
    if (typeof entry?.selector_path !== "string" || entry.selector_path.length === 0) {
      problems.push(`${label} 缺 selector_path`);
    }
    if (typeof entry?.snippet_expected !== "string" || entry.snippet_expected.length === 0) {
      problems.push(`${label} 缺 snippet_expected`);
    } else if (html !== null && !html.includes(entry.snippet_expected)) {
      problems.push(`${label} 的 snippet「${entry.snippet_expected}」不是 page.html 的原样子串`);
    }
    if (root && typeof entry?.selector_path === "string" && typeof entry?.snippet_expected === "string") {
      const reason = checkExpectation(root, entry);
      if (reason) problems.push(`${label} 独立复算不一致：${reason}`);
    }
    if (typeof entry?.rule_id === "string" && typeof entry?.selector_path === "string") {
      const key = `${entry.rule_id}|${entry.selector_path}`;
      if (seenNegative.has(key)) problems.push(`${label} 与前面的负样本重复（${key}）`);
      seenNegative.add(key);
    }
  });

  if ((truth.positives ?? []).length === 0) problems.push(`${where} 本页没有正样本（每页至少 1 条）`);
  return problems;
}

/** 跨页覆盖下限（口径 = 整份语料，不是单页）：不足即返回问题清单。 */
export function checkCoverageFloor(pages, ruleIds, minCasesPerRule) {
  const { perRule } = recomputeCoverage(pages, ruleIds);
  const problems = [];
  for (const ruleId of ruleIds) {
    const counts = perRule.get(ruleId) ?? { positive: 0, negative: 0 };
    if (counts.positive < minCasesPerRule) {
      problems.push(`规则 ${ruleId} 正样本 ${counts.positive} < min_cases_per_rule（${minCasesPerRule}）`);
    }
    if (counts.negative === 0) problems.push(`规则 ${ruleId} 无负样本（precision 会变成 not_assessed）`);
  }
  return problems;
}

/** 由真值复算覆盖计数（COVERAGE.md 必须与它一致，否则"生成物"是手编的）。 */
export function recomputeCoverage(pages, ruleIds) {
  const perRule = new Map([...ruleIds].map((ruleId) => [ruleId, { positive: 0, negative: 0, pages: 0 }]));
  let positives = 0;
  let negatives = 0;
  for (const page of pages) {
    const truth = page.truth;
    if (truth === null || truth.__parseError) continue;
    for (const entry of truth.positives ?? []) {
      if (perRule.has(entry.rule_id)) perRule.get(entry.rule_id).positive += 1;
      positives += 1;
    }
    for (const entry of truth.negatives ?? []) {
      if (perRule.has(entry.rule_id)) perRule.get(entry.rule_id).negative += 1;
      negatives += 1;
    }
    for (const ruleId of ruleIds) {
      const hit = (truth.positives ?? []).some((entry) => entry.rule_id === ruleId);
      if (hit) perRule.get(ruleId).pages += 1;
    }
  }
  return { perRule, positives, negatives };
}

/** 解析 COVERAGE.md 的「逐规则覆盖」表（键 → 计数）；解析不到即返回空表。 */
export function parseCoverageMarkdown(text) {
  const out = new Map();
  if (typeof text !== "string") return out;
  for (const line of text.split("\n")) {
    if (!line.startsWith("| dp-")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const [, ruleId, , positive, negative] = cells;
    if (!ruleId || !/^\d+$/.test(positive) || !/^\d+$/.test(negative)) continue;
    out.set(ruleId, { positive: Number(positive), negative: Number(negative) });
  }
  return out;
}

/** 解析 COVERAGE.md「合计」小节的数字（冒号后的数字）。 */
export function parseCoverageTotals(text) {
  const out = {};
  if (typeof text !== "string") return out;
  const patterns = { 页面: /- 页面：(\d+)/, 规则: /- 规则：(\d+)/, 正样本: /- 正样本：(\d+)/, 负样本: /- 负样本：(\d+)/ };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = pattern.exec(text);
    if (match) out[key] = Number(match[1]);
  }
  return out;
}

/** 白名单（与 `data/README.md` §3.1 同源）：从台账里解析出允许的站点名与域名。 */
export function parseWhitelist(dataReadme) {
  const marker = dataReadme.indexOf("### 3.1");
  const body = marker >= 0 ? dataReadme.slice(marker) : "";
  const end = body.indexOf("**纪律**");
  const section = end > 0 ? body.slice(0, end) : body;
  const names = [...section.matchAll(/\*\*([^*]+（虚构）)\*\*/g)].map((match) => match[1]);
  const domains = [...section.matchAll(/`([a-z0-9.-]+\.(?:invalid|local))`/g)].map((match) => match[1]);
  return { names: [...new Set(names)], domains: [...new Set(domains)] };
}
