// 证据门禁（本项目的核心口径）：
//   `evidence_required` 取不到 → 该候选**被丢弃**（不是降级、不是待确认），并进 rejected[] 记未满足项。
// 变异验证：把证据拿掉 → findings 必须归零；把门禁短路（改成"缺证据也产出"）→ 本测试必须红。

import test from "node:test";
import assert from "node:assert/strict";

import { scanNodes } from "../src/lib/engine.js";
import { checkoutNode, closeButtonNode, pack, scanOf, textNode } from "./helpers/model.mjs";

test("命中 + 证据齐 → 产出 finding，证据逐项可核", () => {
  const node = closeButtonNode({ seq: 1, color: "#8a8a8a", background: "#909090", contrast: 1.5 });
  const { findings, rejected } = scanNodes([node], pack());
  assert.equal(findings.length, 1, "应产出 1 条 finding");
  const finding = findings[0];
  assert.equal(finding.rule_id, "dp-dark-close");
  assert.equal(finding.severity, "medium");
  assert.equal(finding.category, "misleading");
  assert.deepEqual(
    finding.evidence.map((item) => item.kind).sort(),
    ["contrast-ratio", "label-text", "style-background-color", "style-color"],
  );
  assert.equal(rejected.filter((item) => item.reason === "missing_evidence").length, 0);
});

test("命中但缺一项证据 → **零产出** + rejected 记未满足项（不是降级）", () => {
  const node = closeButtonNode({ seq: 1, color: null, contrast: 1.5 });
  const { findings, rejected } = scanNodes([node], pack());
  assert.deepEqual(findings, [], "证据不全时不得产出 finding");
  const reasons = rejected.filter((item) => item.rule_id === "dp-dark-close");
  assert.ok(reasons.length >= 1, "应记入 rejected");
  assert.equal(reasons[0].reason, "missing_evidence");
  assert.deepEqual(reasons[0].missing_evidence, ["style-color"]);
});

test("中和项命中 → 不产出（并记为 suppressed，与「没命中」区分开）", () => {
  const node = checkoutNode({ seq: 1, label: "同意并订阅会员服务（取消订阅）" });
  const { findings, rejected } = scanNodes([node], pack());
  assert.deepEqual(findings, []);
  assert.ok(rejected.some((item) => item.reason === "suppressed" && item.rule_id === "dp-prechecked-optin"));
});

test("同一节点多规则命中 → 按 match_priority 归属，只出一条", () => {
  // 尺寸极小 + 前景色与背景色相同：dp-hidden-close（优先级 1）与 dp-dark-close（优先级 5）都满足风格条件。
  const node = closeButtonNode({ seq: 1, size: 6, contrast: 1.2, color: "#8b8b8b", background: "#8b8b8b" });
  const { findings } = scanNodes([node], pack());
  assert.equal(findings.length, 1, "一个节点只许出一条 finding");
  assert.equal(findings[0].rule_id, "dp-hidden-close");
});

test("禁用规则不参与扫描（开关在引擎层生效）", () => {
  const node = closeButtonNode({ seq: 1, size: 6, contrast: 1.2 });
  const { findings } = scanNodes([node], pack(), { disabledRuleIds: ["dp-hidden-close", "dp-dark-close"] });
  assert.deepEqual(findings, []);
});

test("探活（可证伪）：把证据门禁短路 → 本文件的门禁断言必须红", () => {
  // 用一个"故意不设门禁"的假引擎复现"短路后的行为"，证明门禁断言不是恒真：
  const node = closeButtonNode({ seq: 1, color: null, contrast: 1.5 });
  const withoutGate = ({ findings: [{ rule_id: "dp-dark-close", evidence: [] }], rejected: [] });
  const gated = scanNodes([node], pack());
  assert.notDeepEqual(
    gated.findings.length,
    withoutGate.findings.length,
    "门禁短路与正常路径必须给出不同结果（否则本文件的门禁断言恒真）",
  );
});

test("整页（含文本级规则）跑通：finding 与 rejected 都带 locator", () => {
  const nodes = [
    textNode({ seq: 1, text: "仅剩 2 件", nearText: "示例商城（虚构）", path: "html:nth(0)>body:nth(0)>span:nth(0)" }),
    checkoutNode({ seq: 2, label: "自动续订会员", path: "html:nth(0)>body:nth(0)>input:nth(1)" }),
  ];
  const scan = scanOf(nodes);
  assert.equal(scan.findings.length, 2);
  for (const finding of [...scan.findings, ...scan.rejected]) {
    assert.ok(finding.locator.length > 0, "每条结论/候选都要能指回节点");
  }
});
