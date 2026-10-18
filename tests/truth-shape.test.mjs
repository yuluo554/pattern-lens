// 真值形态守门（M1；两层守门的第①层之真值侧）：
//   ① 每页 truth.json 的键白名单（顶层 + 条目）与**禁"观测"字段**；
//   ② snippet_expected 是 page.html 的原样子串，且**独立复算**（直接解析 page.html 回解 selector_path）；
//   ③ 口径分层：单页校验"形态与期望"，跨页校验"每规则正样本下限 + 负样本存在"；
//   ④ 站点名 / 域名只用 data/README.md §3.1 白名单；
//   ⑤ 变异验证：注入坏真值 → 校验器必须报出（否则校验器是假门）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkCoverageFloor,
  loadCorpus,
  pageIds,
  parseWhitelist,
  recomputeCoverage,
  validateTruthShape,
} from "./helpers/fixtures.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "rules", "manifest.json"), "utf8"));
const RULE_IDS = new Set(MANIFEST.match_priority);
const MIN_CASES = MANIFEST.thresholds.min_cases_per_rule;
const PAGE_COUNT = MANIFEST.thresholds.fixture_page_count;

const CORPUS = loadCorpus(ROOT);
const WHITELIST = parseWhitelist(readFileSync(join(ROOT, "data", "README.md"), "utf8"));

const shapeProblems = (pages) =>
  pages.flatMap((page) =>
    validateTruthShape({ pageId: page.id, truth: page.truth, html: page.html, positiveRuleIds: RULE_IDS }),
  );

test("非空跑自证：真的扫到了 fixture 页（否则下面的断言全是空跑）", () => {
  assert.equal(CORPUS.length, PAGE_COUNT, `应有 ${PAGE_COUNT} 页 fixture，实际 ${CORPUS.length}`);
  assert.ok(RULE_IDS.size >= 12, `规则数过少：${RULE_IDS.size}`);
  assert.ok(CORPUS.every((page) => page.html !== null && page.html.length > 0), "每页都必须有非空 page.html");
  assert.ok(CORPUS.every((page) => page.truth !== null && !page.truth.__parseError), "每页 truth.json 必须可解析");
  assert.ok(
    CORPUS.every((page) => page.styleMap !== null && !page.styleMap.__parseError),
    "每页 style-map.json 必须可解析",
  );
});

test("每页目录形态齐备（page.html + style-map.json + truth.json）且页名规整", () => {
  const ids = pageIds(ROOT);
  assert.deepEqual(ids, [...ids].sort(), "页目录必须排序稳定（page-NN 两位补零）");
  assert.equal(ids.length, PAGE_COUNT);
  for (const id of ids) {
    assert.match(id, /^page-\d{2}$/, `页目录名不合规：${id}`);
    const page = CORPUS.find((entry) => entry.id === id);
    assert.equal(page.truth.page, id, `${id}/truth.json 的 page 字段与目录名不一致`);
    assert.equal(page.styleMap.page, id, `${id}/style-map.json 的 page 字段不一致`);
    assert.equal(typeof page.styleMap.styles, "object", `${id}/style-map.json 缺 styles`);
    assert.ok(Object.keys(page.styleMap.styles).length > 0, `${id}/style-map.json 的 styles 为空`);
  }
});

test("真值形态：键白名单 + snippet 原样 + 独立复算（阴性对照，逐页逐条）", () => {
  const problems = shapeProblems(CORPUS);
  assert.deepEqual(problems, [], `真值形态问题：\n${problems.join("\n")}`);
});

test("真值只存输入与期望：任何层级都不得出现 observed_* / matched / detected 一类字段", () => {
  const hits = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (/observed|matched|detected|found|predicted|actual|hit_/i.test(key)) hits.push(`${path}.${key}`);
        walk(item, `${path}.${key}`);
      }
    }
  };
  for (const page of CORPUS) walk(page.truth, page.id);
  assert.deepEqual(hits, [], `真值里冻结了「观测」（基准会退化成比对两份预先算好的答案）：${hits.join(", ")}`);
});

test("snippet_expected 逐字出现在 page.html（逐条点名，条数非空）", () => {
  let checked = 0;
  for (const page of CORPUS) {
    for (const entry of page.truth.positives ?? []) {
      checked += 1;
      assert.ok(
        page.html.includes(entry.snippet_expected),
        `${page.id}: snippet「${entry.snippet_expected}」不是 page.html 的原样子串`,
      );
    }
  }
  assert.ok(checked >= RULE_IDS.size * MIN_CASES, `实际核对条数过少：${checked}`);
});

test("覆盖下限（跨页口径）：每条规则正样本 ≥ min_cases_per_rule 且负样本存在", () => {
  const problems = checkCoverageFloor(CORPUS, RULE_IDS, MIN_CASES);
  assert.deepEqual(problems, [], problems.join("；"));
  const { perRule, positives, negatives } = recomputeCoverage(CORPUS, RULE_IDS);
  for (const ruleId of RULE_IDS) {
    assert.ok(perRule.get(ruleId).positive >= MIN_CASES, `${ruleId} 正样本不足`);
  }
  assert.ok(positives > 0 && negatives > 0, "正/负样本都必须非空");
});

test("负样本覆盖「看起来像但不成立」：每条规则都有负样本，且负样本页存在", () => {
  const { perRule } = recomputeCoverage(CORPUS, RULE_IDS);
  const missing = [...RULE_IDS].filter((ruleId) => perRule.get(ruleId).negative === 0);
  assert.deepEqual(missing, [], `以下规则没有负样本：${missing.join(", ")}`);
});

test("站点名 / 域名只用 data/README.md §3.1 白名单", () => {
  assert.ok(WHITELIST.names.length >= 5, `白名单解析异常：${WHITELIST.names.join(",")}`);
  assert.ok(WHITELIST.domains.length >= 2, `域名白名单解析异常：${WHITELIST.domains.join(",")}`);
  const foreign = /\b[a-z0-9][a-z0-9-]*\.(?:com|cn|net|org|io|co|shop|store|app|dev|me|biz|info|xyz)\b/i;
  for (const page of CORPUS) {
    const host = String(page.truth.url).replace(/^https?:\/\//, "").split("/")[0];
    assert.ok(WHITELIST.domains.includes(host), `${page.id}: 域名「${host}」不在白名单`);
    assert.ok(WHITELIST.names.includes(page.truth.site), `${page.id}: 站点名「${page.truth.site}」不在白名单`);
    assert.ok(page.html.includes(page.truth.site), `${page.id}: 页面里没有出现站点名`);
    const match = foreign.exec(page.html);
    assert.equal(match, null, `${page.id}: 页面出现白名单外域名「${match?.[0]}」`);
  }
});

// ── 变异验证：注入坏真值 → 校验器必须报出（坏真值被放行 = 假门）──────────────

const MUTATIONS = [
  {
    name: "注入 observed_findings（冻结观测）",
    mutate: (truth) => {
      truth.positives[0].observed_findings = 2;
    },
    expect: /含「观测」类字段/,
  },
  {
    name: "条目里多一个未登记键",
    mutate: (truth) => {
      truth.positives[0].severity = "high";
    },
    expect: /出现未登记键/,
  },
  {
    name: "snippet_expected 与页面文本不一致",
    mutate: (truth) => {
      truth.positives[0].snippet_expected = "这段文字不存在于页面";
    },
    expect: /不是 page\.html 的原样子串/,
  },
  {
    name: "selector_path 回解不到节点",
    mutate: (truth) => {
      truth.positives[0].selector_path = "html:nth(0)>body:nth(9)>div:nth(9)";
    },
    expect: /回解不到节点/,
  },
  {
    name: "rule_id 不在规则包内",
    mutate: (truth) => {
      truth.positives[0].rule_id = "dp-nonexistent";
    },
    expect: /不在规则包内/,
  },
  {
    name: "负样本缺 snippet_expected（条目形态必须统一）",
    mutate: (truth) => {
      delete truth.negatives[0].snippet_expected;
    },
    expect: /negatives\[0\] 缺 snippet_expected/,
  },
  {
    name: "负样本的 snippet 不在页面里",
    mutate: (truth) => {
      truth.negatives[0].snippet_expected = "负样本的锚点不存在";
    },
    expect: /不是 page\.html 的原样子串/,
  },
  {
    name: "一页的正样本被清空（每页至少 1 条正样本）",
    mutate: (truth) => {
      truth.positives = [];
    },
    expect: /没有正样本/,
  },
];

for (const mutation of MUTATIONS) {
  test(`真值形态变异验证：${mutation.name} → 必须报出`, () => {
    const base = CORPUS.find((page) => (page.truth.positives ?? []).length > 1) ?? CORPUS[0];
    const page = { id: base.id, html: base.html, truth: JSON.parse(JSON.stringify(base.truth)) };
    const baseline = validateTruthShape({ pageId: page.id, truth: page.truth, html: page.html, positiveRuleIds: RULE_IDS });
    assert.deepEqual(baseline, [], "变异前该页应无问题——否则变异验证失去基线");
    mutation.mutate(page.truth);
    const problems = validateTruthShape({
      pageId: page.id,
      truth: page.truth,
      html: page.html,
      positiveRuleIds: RULE_IDS,
    });
    assert.ok(problems.length > 0, `坏真值必须报错（空问题清单 = 校验器是假门）：${mutation.name}`);
    assert.match(problems.join("\n"), mutation.expect);
  });
}

test("覆盖下限变异验证：抽掉某条规则的负样本 → 覆盖门必须报出", () => {
  const ruleId = [...RULE_IDS][0];
  const mutated = CORPUS.map((page) => ({
    id: page.id,
    html: page.html,
    truth: {
      ...page.truth,
      negatives: (page.truth.negatives ?? []).filter((entry) => entry.rule_id !== ruleId),
    },
  }));
  const problems = checkCoverageFloor(mutated, RULE_IDS, MIN_CASES);
  assert.ok(problems.some((problem) => problem.includes(ruleId) && problem.includes("无负样本")), problems.join("；"));
});

test("阴性对照：当前冻结真值不得报任何问题（校验器不能「永远报错」）", () => {
  assert.deepEqual(shapeProblems(CORPUS), []);
  assert.deepEqual(checkCoverageFloor(CORPUS, RULE_IDS, MIN_CASES), []);
});
