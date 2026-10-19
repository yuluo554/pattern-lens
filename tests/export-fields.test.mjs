// 导出字段完整性 + 双跑字节一致（M5 DoD 第 1/2 项）——**在侧边栏的真实导出路径上**验收。
//
// 与 `tests/export.test.mjs` 的分工：
//   · `export.test.mjs`（M0）验的是**导出核心**（`buildEvidencePack` / `toJsonText` / `toMarkdown`）的字段顺序与双跑；
//   · 本文件验的是**UI 路径**：`sidepanel.js` 的导出按钮 → `runExport()` → `exportArtifact()` → 落到下载 sink
//     的那份 `{filename, mime, text}` 是否字段完整、是否与核心逐字节同源、双跑是否一致、禁用规则是否可见。
//
// ⚠ 口径：假 DOM + 假 chrome 运行时上的**本地等价校验**（不是浏览器实证）；真实浏览器的导出与
//    网络计数由 `tools/smoke-export.mjs` 单独覆盖（缺浏览器时显式 SKIP）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COPY } from "../src/lib/copy.js";
import { RULESET } from "../src/lib/rules-pack.js";
import {
  EXPORT_FINDING_FIELDS,
  EXPORT_FORMATS,
  EXPORT_TOP_FIELDS,
  buildEvidencePack,
  exportArtifact,
  toJsonText,
  toMarkdown,
} from "../src/lib/export.js";
import { checkboxNode, closeButtonNode, scanOf, textNode } from "./helpers/model.mjs";
import { fakeChrome, importWorker, openSidepanel } from "./helpers/sidepanel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIDEPANEL_SOURCE = readFileSync(join(ROOT, "src", "sidepanel", "sidepanel.js"), "utf8");

const nodes = () => [
  textNode({ seq: 1, text: "仅剩 2 件，倒计时 09:59", nearText: "限时" }),
  checkboxNode({ seq: 2, label: "自动续订会员" }),
  closeButtonNode({ seq: 3, color: null, contrast: 1.5 }),
  textNode({ seq: 4, text: "原价 199 现价 99", nearText: "优惠" }),
];

const scanAt = (url, scannedAt, options = {}) => scanOf(nodes(), { url, scannedAt, ...options });

/** 把一条 ScanResult 落进共享 session（走 SW 的 storeLastScan），再开侧边栏 → state.scan 就位。 */
async function openWithScan(scan) {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  await worker.storeLastScan(scan);
  const panel = await openSidepanel(fake);
  return { ...panel, fake, worker };
}

const clickExport = (panel, id) => panel.doc.getElementById(id).click();

// ── ① 字段完整（含规则包版本与哈希、禁用规则列表）────────────────────────────
test("① UI 导出路径（Markdown/JSON 各一次）字段完整：顶层键 = 契约顺序，含规则包版本/哈希与禁用规则列表", async () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z", {
    disabledRuleIds: ["dp-fake-scarcity"],
  });
  const panel = await openWithScan(scan);
  clickExport(panel, "export-md");
  clickExport(panel, "export-json");
  assert.equal(panel.downloads.length, 2, "两个导出按钮各应产出一次下载");

  const [md, json] = panel.downloads;
  assert.equal(md.mime, "text/markdown");
  assert.equal(json.mime, "application/json");
  assert.match(md.filename, /^pattern-lens-evidence-example\.invalid-\d{14}\.md$/);
  assert.match(json.filename, /^pattern-lens-evidence-example\.invalid-\d{14}\.json$/);

  // JSON 侧：顶层键顺序 = 契约；finding 字段顺序 = 契约；规则包版本/哈希与禁用规则列表在。
  const pack = JSON.parse(json.text);
  assert.deepEqual(Object.keys(pack), EXPORT_TOP_FIELDS);
  assert.equal(pack.ruleset.version, RULESET.ruleset_version);
  assert.equal(pack.ruleset.hash, RULESET.ruleset_hash);
  assert.deepEqual(pack.ruleset.disabled_rule_ids, ["dp-fake-scarcity"], "禁用规则列表必须写进导出");
  assert.ok(pack.findings.length > 0, "阳性对照：导出里必须有 finding（否则字段判据空跑）");
  for (const finding of pack.findings) {
    assert.deepEqual(Object.keys(finding), EXPORT_FINDING_FIELDS);
    assert.ok(finding.evidence.length > 0, `${finding.rule_id} 的证据不能为空`);
  }
  // Markdown 侧：必要小节 + 禁用规则明示 + 免责声明。
  for (const needle of ["# 界面取证镜", "元素定位", "原文片段", "证据", "规则说明", "未产出结论的候选", COPY.disclaimer]) {
    assert.ok(md.text.includes(needle), `Markdown 缺「${needle}」`);
  }
  assert.ok(md.text.includes("dp-fake-scarcity"), "Markdown 里禁用规则列表必须可见");
});

test("① UI 导出与导出核心**逐字节同源**（UI 不另拼一份文本）", async () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const panel = await openWithScan(scan);
  clickExport(panel, "export-md");
  clickExport(panel, "export-json");
  const [md, json] = panel.downloads;
  assert.equal(md.text, toMarkdown(scan, RULESET));
  assert.equal(json.text, toJsonText(scan, RULESET));
  assert.equal(md.text, exportArtifact(scan, RULESET, "markdown").text);
  assert.equal(json.text, exportArtifact(scan, RULESET, "json").text);
});

// ── ② 同一 ScanResult 导出两次**字节一致**（在 UI 路径上）────────────────────
test("② 同一 ScanResult 导出两次字节一致（JSON 与 Markdown 都验；UI 路径）", async () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const first = await openWithScan(scan);
  clickExport(first, "export-json");
  clickExport(first, "export-md");
  const second = await openWithScan(scan);
  clickExport(second, "export-json");
  clickExport(second, "export-md");

  assert.equal(Buffer.from(first.downloads[0].text).equals(Buffer.from(second.downloads[0].text)), true, "JSON 两次导出必须逐字节一致");
  assert.equal(Buffer.from(first.downloads[1].text).equals(Buffer.from(second.downloads[1].text)), true, "Markdown 两次导出必须逐字节一致");
  assert.equal(first.downloads[0].filename, second.downloads[0].filename, "文件名也必须一致（含同一时间戳）");
});

test("可证伪性：换一个扫描时间戳 → 导出字节必须变（否则「双跑一致」是恒真的）", async () => {
  const a = exportArtifact(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z"), RULESET, "json");
  const b = exportArtifact(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:01.000Z"), RULESET, "json");
  assert.notEqual(a.text, b.text, "扫描时间不同却导出同一份 → 一致性判据证明不了任何东西");
});

// ── ③ 导出不含截图 / 整页 HTML / 用户输入（红线）────────────────────────────
test("③ 导出里没有截图 / 整页 HTML / 用户输入一类字段（UI 路径产物，按字段名核）", async () => {
  const panel = await openWithScan(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z"));
  clickExport(panel, "export-json");
  const pack = JSON.parse(panel.downloads[0].text);
  const names = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { names.add(key); walk(child); }
  };
  walk(pack);
  for (const forbidden of ["screenshot", "image", "raw_html", "user_input", "password", "cookie", "token"]) {
    assert.equal(names.has(forbidden), false, `导出里出现了禁用字段 ${forbidden}`);
  }
});

// ── ④ 禁用规则**不出现在导出**（M5 DoD 第 5 项的导出侧）─────────────────────
test("④ 禁用某规则后：该规则不参与扫描、不出现在导出，但被写进 ruleset.disabled_rule_ids", () => {
  const all = scanOf(nodes());
  const disabledId = all.findings[0].rule_id; // 拿一条真会产出的规则来禁
  assert.ok(disabledId, "阳性对照：全量扫描必须至少有一条 finding");

  const restricted = scanOf(nodes(), { disabledRuleIds: [disabledId] });
  assert.equal(
    restricted.findings.some((finding) => finding.rule_id === disabledId),
    false,
    `禁用的 ${disabledId} 不得出现在扫描结果里`,
  );
  assert.equal(
    restricted.rejected.some((item) => item.rule_id === disabledId),
    false,
    `禁用的 ${disabledId} 也不得出现在 rejected 里（禁用 ≠ 被门禁丢弃）`,
  );
  assert.deepEqual(restricted.disabled_rule_ids, [disabledId]);

  const pack = buildEvidencePack(restricted, RULESET);
  assert.equal(pack.findings.some((finding) => finding.rule_id === disabledId), false);
  assert.deepEqual(pack.ruleset.disabled_rule_ids, [disabledId], "禁用集合必须写进导出（可复核这份证据包用了哪些规则）");
});

// ── 接线与纪律 ─────────────────────────────────────────────────────────────
test("接线：sidepanel.js 不自己拼导出文本/MIME（单点 exportArtifact；无第二份 toMarkdown/toJsonText 调用）", () => {
  assert.ok(SIDEPANEL_SOURCE.includes("exportArtifact"), "UI 必须走 exportArtifact 单点");
  for (const needle of ["toMarkdown(", "toJsonText(", "text/markdown", "application/json"]) {
    assert.equal(SIDEPANEL_SOURCE.includes(needle), false, `sidepanel.js 里出现了第二份导出拼装：${needle}`);
  }
  assert.equal(EXPORT_FORMATS.length, 2, "导出格式表应有 Markdown / JSON 两种");
});

test("接线：未知格式显式报错（不静默产出一份空产物）", () => {
  assert.throws(() => exportArtifact(scanOf(nodes()), RULESET, "pdf"), /未知格式 pdf/);
});
