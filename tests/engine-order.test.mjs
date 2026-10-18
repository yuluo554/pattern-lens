// 排序与编号：severity 降序 → DOM 文档序；编号与顺序一致；同输入双跑**逐字节一致**。
// 也覆盖"禁用规则不进结果也不进导出"。

import test from "node:test";
import assert from "node:assert/strict";

import { toJsonText } from "../src/lib/export.js";
import { MANIFEST, checkboxNode, closeButtonNode, pack, scanOf, textNode } from "./helpers/model.mjs";
import { sortFindings } from "../src/lib/ordering.js";

function mixedNodes() {
  return [
    textNode({ seq: 1, text: "取消请致电客服热线", nearText: "帮助中心", path: "html:nth(0)>body:nth(0)>p:nth(1)" }),
    checkboxNode({ seq: 2, label: "自动续订会员", path: "html:nth(0)>body:nth(0)>input:nth(0)" }),
    textNode({ seq: 3, text: "仅剩 2 件", nearText: "示例商城（虚构）", path: "html:nth(0)>body:nth(0)>span:nth(0)" }),
    textNode({ seq: 4, text: "限时 09:59", nearText: "活动专区", path: "html:nth(0)>body:nth(0)>span:nth(1)" }),
  ];
}

test("排序：severity 降序，同级按 DOM 文档序（不按节点数组顺序）", () => {
  const scan = scanOf(mixedNodes());
  const severities = scan.findings.map((finding) => MANIFEST.severity_levels.indexOf(finding.severity));
  const sorted = [...severities].sort((left, right) => right - left);
  assert.deepEqual(severities, sorted, `严重度未降序：${scan.findings.map((f) => `${f.rule_id}/${f.severity}`).join(" ")}`);
  assert.equal(scan.findings[0].rule_id, "dp-subscription-trap", "最高的 high 里 DOM 序最前者应排第一");
  const domOrder = scan.findings.map((finding) => finding.dom_order);
  const highs = scan.findings.filter((finding) => finding.severity === "high").map((finding) => finding.dom_order);
  assert.deepEqual(highs, [...highs].sort((a, b) => a - b), "同级必须按 DOM 文档序");
  assert.equal(new Set(domOrder).size, domOrder.length, "每个节点只归属一条规则");
});

test("编号：F-01…递增，与排序后顺序一致（两位起）", () => {
  const scan = scanOf(mixedNodes());
  assert.deepEqual(
    scan.findings.map((finding) => finding.finding_id),
    scan.findings.map((_, index) => `F-${String(index + 1).padStart(2, "0")}`),
  );
});

test("排序函数不改入参（纯函数），且同输入两次结果相同", () => {
  const scan = scanOf(mixedNodes());
  const input = [...scan.findings];
  const once = sortFindings(input, MANIFEST).map((finding) => finding.finding_id);
  const twice = sortFindings([...input], MANIFEST).map((finding) => finding.finding_id);
  assert.deepEqual(once, twice);
  assert.deepEqual(input, scan.findings, "入参数组不得被改动");
});

test("同输入双跑：导出文本逐字节一致（确定性）", () => {
  const first = toJsonText(scanOf(mixedNodes()), MANIFEST);
  const second = toJsonText(scanOf(mixedNodes()), MANIFEST);
  assert.equal(Buffer.from(first).equals(Buffer.from(second)), true, "两次扫描的导出字节必须相同");
});

test("节点数组顺序打乱不改变结果（按 seq 稳定处理）", () => {
  const nodes = mixedNodes();
  const shuffled = [nodes[2], nodes[0], nodes[3], nodes[1]];
  assert.equal(toJsonText(scanOf(shuffled), MANIFEST), toJsonText(scanOf(nodes), MANIFEST));
});

test("禁用规则不参与扫描、也不出现在导出里", () => {
  const scan = scanOf(mixedNodes(), { disabledRuleIds: ["dp-countdown-pressure"] });
  assert.equal(scan.findings.some((finding) => finding.rule_id === "dp-countdown-pressure"), false);
  assert.deepEqual(scan.disabled_rule_ids, ["dp-countdown-pressure"]);
  assert.match(toJsonText(scan, MANIFEST), /"disabled_rule_ids": \[\n\s+"dp-countdown-pressure"\n\s+\]/);
});

test("hidden-close 优先于 dark-close（与规则包声明一致，不是数组顺序巧合）", () => {
  const hidden = closeButtonNode({ seq: 1, size: 6, contrast: 1.2, color: "#8b8b8b", background: "#8b8b8b" });
  const first = scanOf([hidden]).findings[0].rule_id;
  const packOrder = pack().order.map((spec) => spec.rule_id);
  assert.equal(first, "dp-hidden-close");
  assert.ok(packOrder.indexOf("dp-hidden-close") < packOrder.indexOf("dp-dark-close"));
});
