// snippet 必须是宿主文本的**原样子串**（不 trim 中间、不重排、不做归一化）；超长截断要标出来。
// 变异验证：把 makeSnippet 改成"取首个词"或"加前后缀" → 下面的子串断言必须红。

import test from "node:test";
import assert from "node:assert/strict";

import { makeSnippet } from "../src/lib/page-model.js";
import { MANIFEST, scanOf, textNode } from "./helpers/model.mjs";

const MAX_LEN = MANIFEST.thresholds.snippet_max_len;

test("短文本：snippet 与宿主文本逐字节相同，且未标截断", () => {
  const text = "仅剩 2 件（示例商城（虚构））";
  const node = textNode({ seq: 1, text, nearText: "示例商城（虚构）" });
  const { snippet, snippet_truncated } = makeSnippet(node, MAX_LEN);
  assert.equal(snippet, text);
  assert.equal(snippet_truncated, false);
});

test("长文本：截断后仍是原串前缀（原样子串），并置 snippet_truncated = true", () => {
  const text = "限时 09:59 ".repeat(60);
  const node = textNode({ seq: 1, text, nearText: "" });
  const { snippet, snippet_truncated } = makeSnippet(node, MAX_LEN);
  assert.equal(snippet.length, MAX_LEN);
  assert.equal(snippet_truncated, true);
  assert.equal(text.includes(snippet), true, "snippet 必须是宿主文本的原样子串");
  assert.equal(text.startsWith(snippet), true, "截断只允许从尾部截");
});

test("finding 里的 snippet 与标记和扫描入口一致（端到端）", () => {
  const long = "限时 09:59 ".repeat(60);
  const scan = scanOf([textNode({ seq: 1, text: long, nearText: "" })]);
  const finding = scan.findings.find((item) => item.rule_id === "dp-countdown-pressure");
  assert.ok(finding, "应命中倒计时规则");
  assert.equal(finding.snippet_truncated, true);
  assert.equal(long.includes(finding.snippet), true);
});

test("边界：恰好等于上限不标截断，超一个字符才标（阈值语义单一）", () => {
  const text = "限时 09:59 ".repeat(40).slice(0, MAX_LEN);
  const a = makeSnippet(textNode({ seq: 1, text, nearText: "" }), MAX_LEN);
  const b = makeSnippet(textNode({ seq: 1, text: `${text}限`, nearText: "" }), MAX_LEN);
  assert.equal(a.snippet_truncated, false, `长度 ${text.length} == 上限 ${MAX_LEN} 不该标截断`);
  assert.equal(b.snippet_truncated, true);
  assert.equal(b.snippet.length, MAX_LEN);
});
