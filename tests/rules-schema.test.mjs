// 规则包 schema 守门：
//   ① 12 条规则字段齐、枚举合法、id 唯一、match_priority 全覆盖；
//   ② `src/lib/rules-pack.js` 与 rules/*.json **逐字节对应**（生成物不许手编）；
//   ③ 校验器**真的会拒绝**坏规则（变异验证：缺字段 / 未知 detect 键 / 未知严重度 / 重复 id / 优先级漏项）。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_RULE_FIELDS, validateRulePack } from "../src/lib/rules.js";
import { RULESET, RULE_SPECS } from "../src/lib/rules-pack.js";
import { MANIFEST, pack } from "./helpers/model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("规则包可加载；12 条规则字段齐、含 limits（每条必须声明「本工具不判断什么」）", () => {
  const loaded = pack();
  assert.equal(RULE_SPECS.length, 12, `规则数 = ${RULE_SPECS.length}`);
  assert.equal(RULESET.rule_files.length, 12);
  for (const spec of RULE_SPECS) {
    for (const field of REQUIRED_RULE_FIELDS) assert.ok(spec[field] !== undefined, `${spec.rule_id} 缺 ${field}`);
    assert.ok(Array.isArray(spec.limits) && spec.limits.length > 0, `${spec.rule_id} 缺 limits`);
    assert.ok(loaded.byId.has(spec.rule_id));
  }
});

test("枚举合法：severity/category/evidence_kinds/detect 键都在 manifest 声明内", () => {
  for (const spec of RULE_SPECS) {
    assert.ok(MANIFEST.severity_levels.includes(spec.severity), `${spec.rule_id} severity 越界`);
    assert.ok(MANIFEST.categories.includes(spec.category), `${spec.rule_id} category 越界`);
    for (const kind of spec.evidence_required) {
      assert.ok(MANIFEST.evidence_kinds.includes(kind), `${spec.rule_id} 用了未登记的证据类型 ${kind}`);
    }
    for (const key of Object.keys(spec.detect)) {
      assert.ok(MANIFEST.detect_keys.includes(key), `${spec.rule_id} 用了未登记的 detect 键 ${key}`);
    }
  }
});

test("match_priority 覆盖全部规则且无重复（同一节点多命中时归属唯一）", () => {
  const ids = RULE_SPECS.map((spec) => spec.rule_id);
  assert.deepEqual([...MANIFEST.match_priority].sort(), [...ids].sort());
  assert.equal(new Set(MANIFEST.match_priority).size, MANIFEST.match_priority.length);
});

test("阈值只在 manifest 里出现（keys 齐 + 都是数值）", () => {
  const thresholds = MANIFEST.thresholds;
  for (const key of [
    "precision_min",
    "recall_min",
    "min_cases_per_rule",
    "scan_timeout_ms",
    "first_result_budget_ms",
    "fixture_page_count",
    "snippet_max_len",
  ]) {
    assert.equal(typeof thresholds[key], "number", `thresholds.${key} 缺失或非数值`);
  }
});

test("生成物 rules-pack.js 与 rules/*.json 逐字节一致（== 跑 hash-rules --check）", () => {
  const out = execFileSync(process.execPath, [join(ROOT, "tools", "hash-rules.mjs"), "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.match(out, /一致：/);
  const packSource = readFileSync(join(ROOT, "src", "lib", "rules-pack.js"), "utf8");
  assert.match(packSource, /禁止手改/);
});

// ── 变异验证：校验器必须**真的拒绝**坏规则（坏规则若被放行 = 校验器是假门）──────────
const MUTATIONS = [
  {
    name: "缺 evidence_required",
    mutate: (specs) => {
      delete specs[0].evidence_required;
    },
    expect: /dp-prechecked-optin: 缺字段 evidence_required/,
  },
  {
    name: "未知 detect 键（会让规则静默永不命中）",
    mutate: (specs) => {
      specs[0].detect.unknown_key = true;
    },
    expect: /未知键 unknown_key/,
  },
  {
    name: "未知严重度",
    mutate: (specs) => {
      specs[0].severity = "critical";
    },
    expect: /severity=critical 不在 manifest\.severity_levels/,
  },
  {
    name: "未知证据类型",
    mutate: (specs) => {
      specs[0].evidence_required = ["checked-state", "vibes"];
    },
    expect: /未知证据类型 vibes/,
  },
  {
    name: "detect.style_any 里的未知样式键",
    mutate: (specs) => {
      const target = specs.find((spec) => spec.detect.style_any);
      target.detect.style_any.push({ looks_suspicious: true });
    },
    expect: /detect\.style_any 含未知键/,
  },
  {
    name: "rule_id 重复",
    mutate: (specs) => {
      specs[1].rule_id = specs[0].rule_id;
    },
    expect: /rule_id 重复/,
  },
  {
    name: "match_priority 漏一条规则",
    mutate: (specs, manifest) => {
      manifest.match_priority = manifest.match_priority.filter((id) => id !== specs[0].rule_id);
    },
    expect: /match_priority 漏掉了规则/,
  },
  {
    name: "ruleset_hash 仍是占位值",
    mutate: (specs, manifest) => {
      manifest.ruleset_hash = "TBD-COMPUTED-BY-tools/hash-rules.mjs";
    },
    expect: /仍是占位值/,
  },
];

for (const mutation of MUTATIONS) {
  test(`规则包校验变异验证：${mutation.name} → 必须被拒绝`, () => {
    const manifest = JSON.parse(JSON.stringify(MANIFEST));
    const specs = JSON.parse(JSON.stringify(RULE_SPECS));
    mutation.mutate(specs, manifest);
    const errors = validateRulePack(manifest, specs);
    assert.ok(errors.length > 0, "坏规则包必须报错（空错误列表 = 校验器是假门）");
    assert.match(errors.join("\n"), mutation.expect);
  });
}

test("正常规则包不得报错（阴性对照：校验器不能「永远报错」）", () => {
  assert.deepEqual(validateRulePack(MANIFEST, RULE_SPECS), []);
});

test("规则解释文本里没有越界定性词（文案红线的数据侧）", () => {
  const banned = readFileSync(join(ROOT, "src", "lib", "copy.js"), "utf8");
  const words = [...banned.matchAll(/bannedWords: \[([^\]]+)\]/g)][0][1].split(",").map((word) => word.trim().replace(/"/g, ""));
  for (const spec of RULE_SPECS) {
    for (const word of words) {
      assert.equal(spec.explanation.includes(word), false, `${spec.rule_id} 的 explanation 含禁用词「${word}」`);
    }
  }
});
