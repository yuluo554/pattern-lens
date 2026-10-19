// 侧边栏取证台（M4 DoD）离线验收：
//   ① 四组分组顺序与条目归属来自**规则包**（改 categories 顺序 → 分组跟着变，UI 无硬编码）；
//   ② 冷启动恢复一致；**SW 被回收后**重开仍可恢复（历史/最新一次都在 `storage.session`，SW 无内存态）；
//   ③ 空结果文案 = 固定文案 + 扫描时间 + 节点数（不是定性结论；禁用词扫描须过）；
//   ④ `LastScan` 结构含 `url` / `scanned_at` / `scan_result`（M4 收敛口径，plan/03 §三）；
//   ⑤ 站点级折叠：同站点多次扫描按时间倒序折叠，默认展开最新一次。
//
// ⚠ 口径（与 injection-chain / overlay 同一条）：这是**假 DOM + 假 chrome 运行时上的本地等价校验**，
//    不是浏览器实证（真实渲染路径由 `npm run smoke:overlay` 单独覆盖）。
//
// 可证伪性：每条关键判据都配一条"把实现改坏必须变红"的自证（下方 POSITIVE CONTROLS）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COPY } from "../src/lib/copy.js";
import { RULESET } from "../src/lib/rules-pack.js";
import {
  HISTORY_KEY,
  HISTORY_MAX,
  LAST_SCAN_KEY,
  RESTORE_KIND,
  appendHistory,
  groupByCategory,
  isScanRecord,
  planRestore,
  planSiteGroups,
  scanRecordOf,
} from "../src/lib/sidepanel-view.js";
import { checkboxNode, closeButtonNode, scanOf, textNode } from "./helpers/model.mjs";
import { buildFakeDom } from "./helpers/fake-dom.mjs";
import { stripComments } from "./helpers/text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIDEPANEL_SOURCE = readFileSync(join(ROOT, "src", "sidepanel", "sidepanel.js"), "utf8");
const INDEX_HTML = readFileSync(join(ROOT, "src", "sidepanel", "index.html"), "utf8");
const WORKER_PATH = join(ROOT, "src", "background", "service-worker.js");

/** 该页真能扫出四条不同分组的 finding（紧迫/误导/障碍/价格各至少一条）。 */
const nodes = () => [
  textNode({ seq: 1, text: "仅剩 2 件，倒计时 09:59", nearText: "限时" }),
  checkboxNode({ seq: 2, label: "自动续订会员" }),
  closeButtonNode({ seq: 3, color: null, contrast: 1.5 }),
  textNode({ seq: 4, text: "原价 199 现价 99", nearText: "优惠" }),
];

const scanAt = (url, scannedAt) => scanOf(nodes(), { url, scannedAt });

let bust = 0;

/** 假 chrome 运行时（SW 侧）：记下调用、把 storage.session 当共享真相源。 */
function fakeChrome(session = {}) {
  const calls = [];
  const listeners = { message: [] };
  const chrome = {
    runtime: {
      id: "fake-extension-id",
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
    },
    action: { onClicked: { addListener: () => {} } },
    contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
    sidePanel: { open: async () => {} },
    tabs: {
      query: async () => [{ id: 42, windowId: 3, url: "https://example.invalid/current.html" }],
      sendMessage: async () => {},
    },
    storage: {
      local: { get: async () => ({}) },
      session: {
        set: async (items) => {
          calls.push({ fn: "storage.session.set", items });
          Object.assign(session, items);
        },
        get: async (key) => ({ [key]: session[key] }),
      },
    },
    scripting: { executeScript: async () => [{ result: "ok" }] },
  };
  return { chrome, calls, listeners, session };
}

async function importWorker(chrome) {
  if (chrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = chrome;
  bust += 1;
  return import(`${new URL(`file://${WORKER_PATH.replace(/\\/g, "/")}`).href}?bust=${bust}`);
}

/** 侧边栏侧假运行时：`sendMessage` 由**给定 SW 实例的消息路由器**应答
 *  （SW 被回收 = 换一个实例/换一份 listeners，而 `storage.session` 保持不变）。
 *  `fake` = `fakeChrome()` 的返回值（要它的 `listeners`，模块命名空间里没有）。 */
function sidepanelRuntime(fake, currentUrl = "https://example.invalid/current.html") {
  const calls = [];
  return {
    calls,
    runtime: {
      id: "fake-extension-id",
      sendMessage: (message) =>
        new Promise((done) => {
          calls.push(message);
          if (message?.type === "current-url") return done({ url: currentUrl });
          const onMessage = fake.listeners.message[0];
          if (!onMessage) return done({});
          onMessage(message, {}, done);
        }),
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: { get: async () => ({ settings: undefined }), set: async () => {} },
      session: { get: async (key) => ({ [key]: fake.session[key] }) },
    },
  };
}

/** 每个侧边栏"打开"都取一个**全新模块实例**（真实里每次打开是新文档）。
 *  注意：**保留 `globalThis.chrome`**——SW 的消息路由器要靠它读 `storage.session`；
 *  而 sidepanel 的自启动守卫还要求 `typeof document !== "undefined"`（Node 里为 false），故不会误启动。 */
async function openSidepanel(fake, options = {}) {
  bust += 1;
  const module = await import(
    `${new URL(`file://${join(ROOT, "src", "sidepanel", "sidepanel.js").replace(/\\/g, "/")}`).href}?bust=${bust}`
  );
  const doc = buildFakeDom(INDEX_HTML);
  await module.initSidepanel({ doc, runtime: sidepanelRuntime(fake, options.currentUrl) });
  return { module, doc };
}

const textOf = (doc) => doc.body.textContent;

test("扫描面非空：语料能产出四组 finding（判据不能空跑）", () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const categories = new Set(scan.findings.map((finding) => finding.category));
  assert.ok(categories.size >= 3, `四组分组判据需要多组 finding（实际 ${categories.size} 组）`);
});

// ── ① 分组顺序与归属来自规则包（UI 无硬编码）────────────────────────────────
test("① 分组顺序 = 规则包 categories 顺序；空组不产出", () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const sections = groupByCategory(scan.findings, RULESET.categories);
  const order = sections.map((section) => section.category);
  const expected = RULESET.categories.filter((category) =>
    scan.findings.some((finding) => finding.category === category),
  );
  assert.deepEqual(order, expected, `分组顺序必须按规则包 categories：${order} ≠ ${expected}`);
  for (const section of sections) {
    assert.ok(section.findings.length > 0, "空组不得产出");
    for (const finding of section.findings) assert.equal(finding.category, section.category);
  }
});

test("① 归属由 finding.category 决定（改 finding 的分组 → 归属跟着变，UI 不写死）", () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const moved = scan.findings.map((finding) => ({ ...finding, category: "price" }));
  const sections = groupByCategory(moved, RULESET.categories);
  assert.deepEqual(sections.map((section) => section.category), ["price"]);
  assert.equal(sections[0].findings.length, scan.findings.length);
});

test("① 未知分组不静默吞掉：归入 category=null 组", () => {
  const stray = [{ finding_id: "F-01", category: "vibes" }];
  const sections = groupByCategory(stray, RULESET.categories);
  assert.deepEqual(sections, [{ category: null, findings: stray }]);
});

test("① UI 无硬编码：sidepanel.js 不出现任何分组名，也不自带分组顺序表", () => {
  for (const category of RULESET.categories) {
    assert.equal(SIDEPANEL_SOURCE.includes(category), false, `sidepanel.js 手写了分组名「${category}」`);
  }
  assert.equal(SIDEPANEL_SOURCE.includes("groupByCategory"), true, "分组必须走规则包驱动的纯函数");
});

test("可证伪性：把 categories 顺序倒过来 → 分组顺序必须跟着变（否则判据是恒真的）", () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const forward = groupByCategory(scan.findings, RULESET.categories).map((section) => section.category);
  const reversed = groupByCategory(scan.findings, [...RULESET.categories].reverse()).map((section) => section.category);
  assert.ok(forward.length >= 2, "至少两组才能验顺序可证伪");
  assert.notDeepEqual(reversed, forward, "倒序后分组顺序不变 → 顺序判据证明不了任何东西");
  assert.deepEqual(reversed, [...forward].reverse());
});

// ── ④ LastScan 记录形态（url / scanned_at / scan_result）────────────────────
test("④ scanRecordOf 产出三字段形态；isScanRecord 对缺字段/错类型显式判否", () => {
  const scan = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:00.000Z");
  const record = scanRecordOf(scan);
  assert.deepEqual(Object.keys(record).sort(), ["scan_result", "scanned_at", "url"]);
  assert.equal(record.scan_result, scan);
  assert.equal(isScanRecord(record), true);
  const broken = [
    null,
    undefined,
    "record",
    {},
    { url: "u", scanned_at: "t" }, // 缺 scan_result
    { url: "u", scanned_at: "t", scan_result: null }, // scan_result 为空
    { url: 1, scanned_at: "t", scan_result: {} }, // url 类型错
    { url: "u", scanned_at: 2, scan_result: {} }, // scanned_at 类型错
  ];
  for (const value of broken) {
    assert.equal(isScanRecord(value), false, `该形态必须判否：${JSON.stringify(value)}`);
  }
});

test("④ SW 落盘 = url/scanned_at/scan_result 三件，且 LastScan 取最新一次（乱序到达不顶掉新的）", async () => {
  const { chrome, session } = fakeChrome();
  const worker = await importWorker(chrome);
  const older = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:01.000Z");
  const newer = scanAt("https://example.invalid/p.html", "2026-10-19T00:00:02.000Z");
  await worker.storeLastScan(newer);
  await worker.storeLastScan(older); // 旧结果**后到**
  assert.deepEqual(Object.keys(session.LastScan).sort(), ["scan_result", "scanned_at", "url"]);
  assert.equal(session.LastScan.scanned_at, "2026-10-19T00:00:02.000Z", "LastScan 必须仍是最新一次");
  assert.deepEqual(
    session.ScanHistory.map((record) => record.scanned_at),
    ["2026-10-19T00:00:02.000Z", "2026-10-19T00:00:01.000Z"],
  );
});

// ── ⑤ 站点级折叠 ───────────────────────────────────────────────────────────
test("⑤ 站点级折叠：按站点分组、组内时间倒序、默认展开最新一次", () => {
  const records = [
    scanRecordOf(scanAt("https://example.invalid/a.html", "2026-10-19T00:00:01.000Z")),
    scanRecordOf(scanAt("https://example.invalid/a.html", "2026-10-19T00:00:03.000Z")),
    scanRecordOf(scanAt("https://example.invalid/b.html", "2026-10-19T00:00:02.000Z")),
  ];
  const groups = planSiteGroups(records);
  // a.html 与 b.html 同主机（同一站点）→ 只有一组，组内按时间倒序。
  assert.equal(groups.length, 1, "同一主机应折叠为一组");
  assert.deepEqual(
    groups[0].scans.map((entry) => entry.record.scanned_at),
    ["2026-10-19T00:00:03.000Z", "2026-10-19T00:00:02.000Z", "2026-10-19T00:00:01.000Z"],
    "组内必须按扫描时间倒序",
  );
  assert.equal(groups[0].scans[0].expandedByDefault, true, "最新一次默认展开");
  assert.equal(groups[0].scans[1].expandedByDefault, false);
  assert.equal(groups[0].scans[2].expandedByDefault, false);
});

test("⑤ 不同站点：组按各自最新一次的时间倒序", () => {
  const records = [
    scanRecordOf(scanAt("https://a.invalid/p.html", "2026-10-19T00:00:01.000Z")),
    scanRecordOf(scanAt("https://b.invalid/p.html", "2026-10-19T00:00:05.000Z")),
  ];
  const groups = planSiteGroups(records);
  assert.deepEqual(groups.map((group) => group.host), ["b.invalid", "a.invalid"]);
});

test("⑤ appendHistory：时间倒序、按 (url, scanned_at) 去重、上限截断", () => {
  const base = scanRecordOf(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:02.000Z"));
  let history = appendHistory([], base);
  assert.equal(history.length, 1);
  const older = scanRecordOf(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:01.000Z"));
  history = appendHistory(history, older);
  assert.deepEqual(history.map((record) => record.scanned_at), ["2026-10-19T00:00:02.000Z", "2026-10-19T00:00:01.000Z"]);
  history = appendHistory(history, older); // 重复 → 不产生第二条
  assert.equal(history.length, 2);
  for (let index = 0; index < HISTORY_MAX + 5; index += 1) {
    history = appendHistory(history, scanRecordOf(scanAt("https://example.invalid/p.html", `2026-10-19T00:01:${String(index).padStart(2, "0")}.000Z`)));
  }
  assert.equal(history.length, HISTORY_MAX, `上限应为 ${HISTORY_MAX}`);
  assert.equal(appendHistory(history, { bogus: true }).length, history.length, "非记录形态的条目应被丢弃");
});

// ── ② 冷启动恢复 + SW 被回收后恢复 ──────────────────────────────────────────
test("② 冷启动恢复：storage.session 里已有 LastScan → 打开侧边栏即恢复同一结果", async () => {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  const scan = scanAt("https://example.invalid/current.html", "2026-10-19T00:00:00.000Z");
  await worker.storeLastScan(scan);

  const { doc } = await openSidepanel(fake);
  const text = textOf(doc);
  for (const finding of scan.findings) {
    assert.ok(text.includes(finding.finding_id), `恢复后应显示条目 ${finding.finding_id}`);
  }
  assert.equal(text.includes(COPY.notScanned), false, "有结果时不得显示空态");
});

test("② SW 被回收后重开仍可恢复（新 SW 实例无内存态，只从 storage.session 读）", async () => {
  const fake = fakeChrome();
  const first = await importWorker(fake.chrome);
  const scan = scanAt("https://example.invalid/current.html", "2026-10-19T00:00:00.000Z");
  await first.storeLastScan(scan);

  // 模拟 SW 被回收：重新 import 出**全新实例**（模块级状态归零），共享同一个 storage.session。
  const recycled = await importWorker(fake.chrome);
  assert.notEqual(recycled, first, "回收后应是新的模块实例");
  const { doc } = await openSidepanel(fake);
  const text = textOf(doc);
  for (const finding of scan.findings) {
    assert.ok(text.includes(finding.finding_id), `SW 回收后仍应恢复条目 ${finding.finding_id}`);
  }
});

test("② 冷启动 vs SW 回收：两次恢复的可见文本**逐字一致**", async () => {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  const scan = scanAt("https://example.invalid/current.html", "2026-10-19T00:00:00.000Z");
  await worker.storeLastScan(scan);
  const cold = await openSidepanel(fake);
  await importWorker(fake.chrome); // SW 被回收 → 新实例
  const warm = await openSidepanel(fake);
  assert.equal(textOf(cold.doc), textOf(warm.doc), "冷启动与回收后恢复必须一致");
});

test("② 恢复四支显式：无记录 / 出错 / 命中黑名单 / 有结果（不静默什么都不做）", async () => {
  const none = planRestore(null, "https://example.invalid/x.html");
  assert.deepEqual(none, { kind: RESTORE_KIND.none });
  const error = planRestore({ error: "boom" }, "https://example.invalid/x.html");
  assert.equal(error.kind, RESTORE_KIND.error);
  assert.equal(error.reason, "boom");
  const blocked = planRestore({ blocked: "blocklisted", url: "https://example.invalid/x.html" }, "https://example.invalid/x.html");
  assert.equal(blocked.kind, RESTORE_KIND.blocked);
  const record = scanRecordOf(scanAt("https://other.invalid/p.html", "2026-10-19T00:00:00.000Z"));
  const scan = planRestore(record, "https://example.invalid/x.html");
  assert.equal(scan.kind, RESTORE_KIND.scan);
  assert.equal(scan.staleHost, "other.invalid", "来源主机与当前页不同 → 显式给出（不冒充当前页）");

  // DOM 侧同样要显式落到文案
  const fake = fakeChrome();
  await importWorker(fake.chrome);
  const empty = await openSidepanel(fake);
  assert.ok(textOf(empty.doc).includes(COPY.notScanned), "无记录 → 显示「尚未扫描本页」");
  fake.session[LAST_SCAN_KEY] = { error: "rule_pack_invalid" };
  const failed = await openSidepanel(fake);
  assert.ok(textOf(failed.doc).includes(COPY.scanFailed), "出错 → 显示扫描失败（不显示空结果）");
  assert.equal(textOf(failed.doc).includes(COPY.emptyResult), false);
  fake.session[LAST_SCAN_KEY] = { blocked: "blocklisted", url: "https://example.invalid/x.html" };
  const blockedUi = await openSidepanel(fake);
  assert.ok(textOf(blockedUi.doc).includes(COPY.blockedSite), "黑名单 → 明示该站点已停用");
});

test("② 陈旧结果：来源主机 ≠ 当前页 → 显示结果并显式标注（不冒充当前页）", async () => {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  await worker.storeLastScan(scanAt("https://other.invalid/p.html", "2026-10-19T00:00:00.000Z"));
  const { doc } = await openSidepanel(fake, { currentUrl: "https://example.invalid/current.html" });
  const text = textOf(doc);
  assert.ok(text.includes(COPY.staleResult), "陈旧结果必须显式标注");
  assert.ok(text.includes("other.invalid"), "应标出来源主机");
});

test("② 站点级折叠落到 DOM：同站点多次扫描 → 一个 <details open> + 其余折叠", async () => {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  await worker.storeLastScan(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:01.000Z"));
  await worker.storeLastScan(scanAt("https://example.invalid/p.html", "2026-10-19T00:00:02.000Z"));
  const { doc } = await openSidepanel(fake);
  // 注意：index.html 自身也有一个 <details id="settings">，故只按 `.scan` 类取扫描折叠块。
  const details = doc.querySelectorAll(".scan");
  assert.equal(details.length, 2, `应渲染两次扫描（实际 ${details.length}）`);
  assert.equal(details.every((node) => node.localName === "details"), true, "折叠块应是 <details>");
  const open = details.filter((node) => node.open === true);
  assert.equal(open.length, 1, "只有最新一次默认展开");
  assert.equal(open[0].dataset.scannedAt, "2026-10-19T00:00:02.000Z", "展开的必须是最新一次");
  assert.equal(doc.querySelectorAll(".site").length, 1, "同一站点折叠为一组");
});

// ── ③ 空结果文案 ───────────────────────────────────────────────────────────
test("③ 空结果文案 = 固定文案 + 扫描时间 + 节点数（不是定性结论）", async () => {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  const emptyScan = scanOf([], { url: "https://example.invalid/current.html", scannedAt: "2026-10-19T03:04:05.000Z" });
  await worker.storeLastScan(emptyScan);
  const { doc } = await openSidepanel(fake);
  const text = textOf(doc);
  assert.ok(text.includes(COPY.emptyResult), "必须含固定空态文案");
  assert.ok(text.includes("2026-10-19T03:04:05.000Z"), "必须附扫描时间");
  assert.ok(text.includes(String(emptyScan.node_count)), `必须附节点数（${emptyScan.node_count}）`);
  for (const word of COPY.bannedWords) {
    assert.equal(text.includes(word), false, `空态不得出现禁用词「${word}」`);
  }
});

test("③ sidepanel.js 不手写空态文案（文案单点 copy.js）", () => {
  assert.ok(SIDEPANEL_SOURCE.includes("COPY.emptyResult"), "空态必须引用 copy.js 的固定文案");
  assert.equal(SIDEPANEL_SOURCE.includes(COPY.emptyResult), false, "不得内联该文案字符串（会成第二份）");
});

test("可证伪性：有 finding 的扫描**不得**显示空态文案（否则空态判据是恒真的）", async () => {
  const fake = fakeChrome();
  const worker = await importWorker(fake.chrome);
  const scan = scanAt("https://example.invalid/current.html", "2026-10-19T00:00:00.000Z");
  assert.ok(scan.findings.length > 0);
  await worker.storeLastScan(scan);
  const { doc } = await openSidepanel(fake);
  assert.equal(textOf(doc).includes(COPY.emptyResult), false, "有 finding 时不得显示空态文案");
});

// ── 接线与纪律 ─────────────────────────────────────────────────────────────
test("接线：initSidepanel 可离线 import（无扩展运行时不自动启动）", async () => {
  delete globalThis.chrome;
  bust += 1;
  const module = await import(
    `${new URL(`file://${join(ROOT, "src", "sidepanel", "sidepanel.js").replace(/\\/g, "/")}`).href}?bust=${bust}`
  );
  assert.equal(typeof module.initSidepanel, "function", "初始化入口必须可导出验收");
  assert.equal(typeof module.highlightFinding, "function", "反向半程函数必须仍在");
});

test("K10：sidepanel-view.js 是纯核心（无扩展 API / DOM / 全局时钟）——剥注释后扫", () => {
  const source = stripComments(readFileSync(join(ROOT, "src", "lib", "sidepanel-view.js"), "utf8"));
  for (const needle of ["chrome", "document", "window", "Date.now"]) {
    assert.equal(source.includes(needle), false, `纯核心不得出现 ${needle}`);
  }
});

test("K11/K12：新模块已登记进拼接序与安装面白名单（dist 才不会漏装）", async () => {
  const { RUNTIME_WHITELIST } = await import("../tools/build-extension.mjs");
  assert.equal(RUNTIME_WHITELIST.includes("src/lib/sidepanel-view.js"), true, "必须登记进 RUNTIME_WHITELIST");
  const sidepanel = readFileSync(join(ROOT, "src", "sidepanel", "sidepanel.js"), "utf8");
  assert.ok(sidepanel.includes("sidepanel-view.js"), "侧边栏必须从该模块取纯逻辑");
});

test("文案纪律：sidepanel.js 无禁用词", () => {
  for (const word of COPY.bannedWords) {
    assert.equal(SIDEPANEL_SOURCE.includes(word), false, `sidepanel.js 出现禁用词「${word}」`);
  }
});
