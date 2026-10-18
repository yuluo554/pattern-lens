// 导出：字段完整、键顺序固定、双跑**逐字节一致**、缺字段**拒绝导出**（不补默认值）。
// 边界：空结果导出不得出现定性结论（只看 copy 单点的固定文案）。

import test from "node:test";
import assert from "node:assert/strict";

import { COPY } from "../src/lib/copy.js";
import {
  EXPORT_FINDING_FIELDS,
  EXPORT_TOP_FIELDS,
  buildEvidencePack,
  exportFileName,
  toJsonText,
  toMarkdown,
} from "../src/lib/export.js";
import { MANIFEST, checkboxNode, closeButtonNode, scanOf, textNode } from "./helpers/model.mjs";

const nodes = () => [
  textNode({ seq: 1, text: "取消请致电客服热线", nearText: "帮助中心" }),
  checkboxNode({ seq: 2, label: "自动续订会员" }),
  closeButtonNode({ seq: 3, color: null, contrast: 1.5 }),
];

test("JSON 导出：顶层键顺序 = 契约顺序（顺序变了就红）", () => {
  const pack = buildEvidencePack(scanOf(nodes()), MANIFEST);
  assert.deepEqual(Object.keys(pack), EXPORT_TOP_FIELDS);
});

test("JSON 导出：finding 字段顺序 = 契约顺序；证据逐项在", () => {
  const pack = buildEvidencePack(scanOf(nodes()), MANIFEST);
  assert.ok(pack.findings.length >= 2);
  for (const finding of pack.findings) {
    assert.deepEqual(Object.keys(finding), EXPORT_FINDING_FIELDS);
    assert.ok(finding.evidence.length > 0, `${finding.rule_id} 的证据不能为空（否则不该产出）`);
  }
});

test("JSON 导出：规则包版本与哈希在，且禁用规则列表可见", () => {
  const pack = buildEvidencePack(scanOf(nodes(), { disabledRuleIds: ["dp-fake-scarcity"] }), MANIFEST);
  assert.equal(pack.ruleset.version, MANIFEST.ruleset_version);
  assert.equal(pack.ruleset.hash, MANIFEST.ruleset_hash);
  assert.deepEqual(pack.ruleset.disabled_rule_ids, ["dp-fake-scarcity"]);
});

test("双跑逐字节一致（JSON 与 Markdown 两种格式都验）", () => {
  const first = scanOf(nodes());
  const second = scanOf(nodes());
  assert.equal(toJsonText(first, MANIFEST), toJsonText(second, MANIFEST));
  assert.equal(toMarkdown(first, MANIFEST), toMarkdown(second, MANIFEST));
  assert.equal(Buffer.from(toJsonText(first, MANIFEST)).equals(Buffer.from(toJsonText(first, MANIFEST))), true);
});

test("Markdown 导出：含必要小节与免责声明；空结果只写空态文案", () => {
  const markdown = toMarkdown(scanOf(nodes()), MANIFEST);
  for (const needle of ["# 界面取证镜", "元素定位", "原文片段", "证据", "规则说明", "未产出结论的候选", COPY.disclaimer]) {
    assert.ok(markdown.includes(needle), `Markdown 缺「${needle}」`);
  }
  const empty = toMarkdown(scanOf([]), MANIFEST);
  assert.ok(empty.includes(COPY.emptyResult));
  assert.equal(/共 0 条/.test(empty), true);
});

test("缺字段 → 拒绝导出（不补默认值）", () => {
  const scan = scanOf(nodes());
  delete scan.ruleset_hash;
  assert.throws(() => buildEvidencePack(scan, MANIFEST), /缺字段 ruleset_hash/);
  assert.throws(() => buildEvidencePack(null, MANIFEST), /不是对象/);
});

test("文件名含站点主机名与时间戳，且不含其他个人数据", () => {
  const scan = scanOf(nodes());
  const name = exportFileName(scan, "md");
  assert.match(name, /^pattern-lens-evidence-example\.invalid-\d{14}\.md$/);
});

test("导出对象里没有截图/整页 HTML/用户输入这类字段（红线；按**字段名**核，不扫自由文本）", () => {
  const pack = buildEvidencePack(scanOf(nodes()), MANIFEST);
  const names = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        names.add(key);
        walk(child);
      }
    }
  };
  walk(pack);
  for (const forbidden of ["screenshot", "image", "raw_html", "user_input", "password", "cookie", "token"]) {
    assert.equal(names.has(forbidden), false, `导出里出现了禁用字段 ${forbidden}`);
  }
  assert.deepEqual(Object.keys(pack.source), ["url", "host", "scanned_at", "node_count", "elapsed_ms", "truncated"]);
});
