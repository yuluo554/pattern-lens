// 站点黑白名单与规则开关（M5 DoD 第 4/5 项）——**在真实设置路径上**验收：
//   ④ 站点黑名单命中 → **不注入**（否定性事实：`executeScript` 一次都没被调用），且 UI **明示"该站点已停用"**；
//   ⑤ 规则开关生效：禁用规则**不参与扫描、不出现在导出**（开关写进 `storage.local`，扫描侧读回）。
//
// 与 `tests/injection-chain.test.mjs` 的分工：那边验 SW 侧的注入链路；本文件补
// **UI 侧明示**（恢复分支落到文案）+ **规则开关的端到端**（UI 勾选 → storage → 扫描 → 导出）。
//
// ⚠ 口径：假 DOM + 假 chrome 运行时上的本地等价校验（不是浏览器实证）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COPY } from "../src/lib/copy.js";
import { RULESET, RULE_SPECS } from "../src/lib/rules-pack.js";
import { buildScanResult } from "../src/lib/engine.js";
import { loadRulePack } from "../src/lib/rules.js";
import { activeRuleIds, isSiteEnabled, normalizeSettings } from "../src/lib/site-policy.js";
import { buildEvidencePack } from "../src/lib/export.js";
import { LAST_SCAN_KEY } from "../src/lib/sidepanel-view.js";
import { checkboxNode, closeButtonNode, scanOf, textNode } from "./helpers/model.mjs";
import { fakeChrome, importWorker, openSidepanel, textOf } from "./helpers/sidepanel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIDEPANEL_SOURCE = readFileSync(join(ROOT, "src", "sidepanel", "sidepanel.js"), "utf8");

const nodes = () => [
  textNode({ seq: 1, text: "仅剩 2 件，倒计时 09:59", nearText: "限时" }),
  checkboxNode({ seq: 2, label: "自动续订会员" }),
  closeButtonNode({ seq: 3, color: null, contrast: 1.5 }),
  textNode({ seq: 4, text: "原价 199 现价 99", nearText: "优惠" }),
];

// ── ④ 站点黑名单：不注入 + UI 明示 ─────────────────────────────────────────
test("④ 黑名单命中 → **不注入**（否定性事实：executeScript 一次都没被调用），并回 blocked + 原因", async () => {
  const { chrome, calls } = fakeChrome({
    settings: { site_policy: { mode: "blocklist", hosts: ["example.invalid"] }, disabled_rule_ids: [] },
  });
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.deepEqual(outcome, { status: "blocked", reason: "blocklisted" });
  assert.deepEqual(calls.filter((call) => call.fn === "scripting.executeScript"), [], "黑名单站点不得注入");
});

test("④ 白名单模式：不在名单里的站点不注入（reason 显式，不静默）", async () => {
  const { chrome, calls } = fakeChrome({
    settings: { site_policy: { mode: "allowlist", hosts: ["fixture.local"] }, disabled_rule_ids: [] },
  });
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.deepEqual(outcome, { status: "blocked", reason: "not_allowlisted" });
  assert.deepEqual(calls.filter((call) => call.fn === "scripting.executeScript"), []);
});

test("④ 纯函数侧：isSiteEnabled 三态显式（命中黑名单 / 未在名单 / 放行），url 不可解析也显式判否", () => {
  const block = { site_policy: { mode: "blocklist", hosts: ["example.invalid"] }, disabled_rule_ids: [] };
  assert.deepEqual(isSiteEnabled("https://example.invalid/p.html", block), { enabled: false, reason: "blocklisted" });
  assert.deepEqual(isSiteEnabled("https://other.invalid/p.html", block), { enabled: true, reason: "enabled" });
  const allow = { site_policy: { mode: "allowlist", hosts: ["example.invalid"] }, disabled_rule_ids: [] };
  assert.deepEqual(isSiteEnabled("https://example.invalid/p.html", allow), { enabled: true, reason: "enabled" });
  assert.deepEqual(isSiteEnabled("https://other.invalid/p.html", allow), { enabled: false, reason: "not_allowlisted" });
  assert.deepEqual(isSiteEnabled("not a url", block), { enabled: false, reason: "url_unparsable" });
});

test("④ UI 明示「该站点已停用」：点击扫描命中黑名单 → 状态行显示 COPY.blockedSite（不显示空结果）", async () => {
  const fake = fakeChrome({
    settings: { site_policy: { mode: "blocklist", hosts: ["example.invalid"] }, disabled_rule_ids: [] },
  });
  await importWorker(fake.chrome);
  const panel = await openSidepanel(fake);
  panel.doc.getElementById("scan").click();
  await new Promise((done) => setTimeout(done, 0)); // 等扫描按钮的异步回传落定
  const text = textOf(panel.doc);
  assert.ok(text.includes(COPY.blockedSite), `状态行应明示该站点已停用：${text}`);
  assert.equal(text.includes(COPY.emptyResult), false, "被停用不得显示「未发现符合规则的证据」");
});

test("④ 冷启动恢复黑名单：LastScan 里记了 blocked → 打开侧边栏即明示（不冒充空结果）", async () => {
  const fake = fakeChrome();
  await importWorker(fake.chrome);
  fake.session[LAST_SCAN_KEY] = { blocked: "blocklisted", url: "https://example.invalid/x.html" };
  const panel = await openSidepanel(fake);
  const text = textOf(panel.doc);
  assert.ok(text.includes(COPY.blockedSite), "恢复分支必须落到「该站点已停用」文案");
  assert.equal(text.includes(COPY.emptyResult), false);
});

// ── ⑤ 规则开关：禁用规则不参与扫描、不出现在导出 ───────────────────────────
test("⑤ 规则开关写进 storage.local：勾掉一条 → settings.disabled_rule_ids 含它（UI 不静默）", async () => {
  const fake = fakeChrome({ settings: { site_policy: { mode: "blocklist", hosts: [] }, disabled_rule_ids: [] } });
  await importWorker(fake.chrome);
  const panel = await openSidepanel(fake);

  const toggles = panel.doc.querySelectorAll(".rule");
  assert.equal(toggles.length, RULE_SPECS.length, `规则开关数应等于规则数（${RULE_SPECS.length}）`);
  // 勾掉第一条规则（`toggles[0]` 对应 RULE_SPECS[0]）。
  const firstId = RULE_SPECS[0].rule_id;
  const checkbox = toggles[0].querySelectorAll("input")[0];
  assert.equal(checkbox.checked, true, "默认全开");
  checkbox.checked = false;
  checkbox.dispatch("change");
  await new Promise((done) => setTimeout(done, 0));

  const written = fake.calls.filter((call) => call.fn === "storage.local.set").at(-1);
  assert.ok(written, "勾选变更必须落 storage.local");
  assert.deepEqual(written.items.settings.disabled_rule_ids, [firstId], "被勾掉的规则应进禁用集合");
});

test("⑤ 禁用规则**不参与扫描**：同一页面禁用前后 findings 差集 = 被禁规则", () => {
  const all = scanOf(nodes());
  const disabledId = all.findings[0].rule_id;
  const restricted = scanOf(nodes(), { disabledRuleIds: [disabledId] });
  const removed = all.findings.filter((finding) => finding.rule_id === disabledId).length;
  assert.ok(removed > 0, "阳性对照：被禁规则原本有产出");
  assert.equal(all.findings.length - restricted.findings.length, removed, "禁用前后差集必须恰是被禁规则的产出");
  assert.equal(restricted.findings.some((finding) => finding.rule_id === disabledId), false);
  assert.deepEqual(restricted.disabled_rule_ids, [disabledId]);
});

test("⑤ 禁用规则**不出现在导出**（findings 与 rejected 两侧都不出现；集合写进 ruleset.disabled_rule_ids）", () => {
  const all = scanOf(nodes());
  const disabledId = all.findings[0].rule_id;
  const pack = buildEvidencePack(scanOf(nodes(), { disabledRuleIds: [disabledId] }), RULESET);
  assert.equal(pack.findings.some((finding) => finding.rule_id === disabledId), false);
  assert.equal(pack.rejected.some((item) => item.rule_id === disabledId), false);
  assert.deepEqual(pack.ruleset.disabled_rule_ids, [disabledId]);
});

test("⑤ 端到端（离线）：settings 里的禁用集合 → runScan 读回 → 扫描结果不含该规则", () => {
  const pack = loadRulePack(RULESET, RULE_SPECS);
  const all = scanOf(nodes());
  const disabledId = all.findings[0].rule_id;
  const settings = normalizeSettings({ site_policy: { mode: "blocklist", hosts: [] }, disabled_rule_ids: [disabledId] });
  // 模拟 scanner.js 的取用路径：activeRuleIds 过滤 + buildScanResult 带 disabledRuleIds。
  const active = activeRuleIds(RULE_SPECS.map((spec) => spec.rule_id), settings);
  assert.equal(active.includes(disabledId), false, "被禁规则不应出现在 active 规则集合里");
  const scan = buildScanResult({
    url: "https://example.invalid/p.html",
    scannedAt: "2026-10-19T00:00:00.000Z",
    nodes: nodes(),
    pack,
    elapsedMs: 5,
    disabledRuleIds: settings.disabled_rule_ids,
  });
  assert.equal(scan.findings.some((finding) => finding.rule_id === disabledId), false);
});

// ── 接线与纪律 ─────────────────────────────────────────────────────────────
test("接线：sidepanel.js 的站点策略与规则开关都落 storage.local（无内存态假象）", () => {
  assert.ok(SIDEPANEL_SOURCE.includes("storage.local.set"), "设置必须落 storage.local");
  assert.ok(SIDEPANEL_SOURCE.includes("disabled_rule_ids"), "规则开关必须写进 disabled_rule_ids");
  assert.ok(SIDEPANEL_SOURCE.includes("COPY.blockedSite"), "被停用站点必须走文案单点");
});

test("可证伪性：不命中黑名单的站点必须放行（否则「黑名单不注入」是恒真的）", async () => {
  const { chrome, calls } = fakeChrome({
    settings: { site_policy: { mode: "blocklist", hosts: ["other.invalid"] }, disabled_rule_ids: [] },
  });
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.equal(outcome.status, "injected", "未命中黑名单必须注入");
  assert.equal(calls.filter((call) => call.fn === "scripting.executeScript").length, 1);
});
