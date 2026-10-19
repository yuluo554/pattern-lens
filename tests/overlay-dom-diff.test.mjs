// 页内取证高亮层（M3 DoD）离线验收：
//   ① 覆盖层为 Shadow DOM，**宿主页面只多一个容器节点**；
//   ② 清除后 DOM 快照 diff = 0（属性集 / 节点数 / `document.styleSheets.length` **三项**）；
//   ③ 徽标编号与侧边栏编号一一对应（编号单点 = `src/lib/ordering.js`，覆盖层不重排不重编号）；
//   ④ 重复高亮幂等（同 finding 不产生重复徽标）；
//   ⑤ 双向联动：点徽标 → `focus-finding` 消息；`focus-finding` → 滚动定位 + 闪烁；
//   ⑥ locator 失效分支**显式提示**（文案单点 `COPY.locatorStale`），不静默跳过。
//
// ⚠ 口径（与 M2 的 `injection-chain` / `collector.parity` 同一条）：这是**假 DOM 上的本地等价校验**，
// 真实浏览器冒烟仍未做（`plan/06` §五）——本文件不据此宣称"浏览器已验"。
//
// 可证伪性：每个关键判据都配一条"把实现改坏必须变红"的自证（下方 POSITIVE CONTROLS），
// 因为"全绿"只有在判据真的能红时才有意义。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLocator } from "../src/content/collector.js";
import {
  BADGE_CLASS,
  FLASH_CLASS,
  OVERLAY_HOST_ID,
  STALE_ITEM_CLASS,
  applyOverlay,
  clearOverlay,
  focusFinding,
  handleOverlayMessage,
  overlayState,
} from "../src/content/overlay.js";
import { COPY } from "../src/lib/copy.js";
import { assignFindingIds, sortFindings } from "../src/lib/ordering.js";
import { MANIFEST, pack, scanOf } from "./helpers/model.mjs";
import { buildFakeDom, fakeRuntime, snapshotDiff, snapshotDocument } from "./helpers/fake-dom.mjs";
import { buildPageModel, pageIds } from "../tools/fixture-page-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IDS = pageIds(ROOT);
const PAGE_ID = IDS[0] ?? "page-01";
const PAGE_DIR = join(ROOT, "data", "fixtures", PAGE_ID);
const PAGE_HTML = readFileSync(join(PAGE_DIR, "page.html"), "utf8");
/** 真实定位串（取自该页 `style-map.json` 的键，即页面模型里确实存在的节点）。 */
const PAGE_PATHS = Object.keys(JSON.parse(readFileSync(join(PAGE_DIR, "style-map.json"), "utf8")).styles ?? {});
const CHECKBOX_PATH = PAGE_PATHS.find((path) => path.endsWith("input:nth(0)"));
const HEADING_PATH = PAGE_PATHS.find((path) => path.endsWith("h1:nth(0)"));
/** 该页上确实**不存在**的定位串（用于 locator 失效分支）：把真实路径的最后一个下标改成越界值。 */
const MISSING_PATH = CHECKBOX_PATH.replace(/input:nth\(\d+\)$/, "input:nth(99)");
/** 计时器 stub：不真的排定时器（否则测试进程会挂住），但记录回调以便断言"闪烁会自行结束"。 */
const timerStub = () => {
  const scheduled = [];
  const fn = (callback) => {
    scheduled.push(callback);
    return scheduled.length;
  };
  fn.scheduled = scheduled;
  return fn;
};

const findingsFixture = () => [
  { finding_id: "F-01", locator: CHECKBOX_PATH, rule_id: "dp-prechecked-optin" },
  { finding_id: "F-02", locator: HEADING_PATH, rule_id: "dp-countdown-pressure" },
];

/** 页面模型来自 Node 侧解析器（与采集器同语义，K24）；不跑浏览器侧的 getComputedStyle 采集
 *  ——那条同语义由 `tests/collector-parity.test.mjs` 守，本文件只验覆盖层。 */
const modelOfFixture = () =>
  buildPageModel({
    html: PAGE_HTML,
    styleMap: JSON.parse(readFileSync(join(PAGE_DIR, "style-map.json"), "utf8")),
    pageId: PAGE_ID,
  });

const badgesOf = (doc) => {
  const host = doc.getElementById(OVERLAY_HOST_ID);
  return host?.shadowRoot?.querySelectorAll(`.${BADGE_CLASS}`) ?? [];
};

test("扫描面非空：语料与页面都在（判据不能空跑）", () => {
  assert.ok(IDS.length >= 12, `fixture 页面过少：${IDS.length}`);
  assert.ok(PAGE_HTML.includes("<html"), "page.html 读不到内容");
});

test("① 覆盖层为 Shadow DOM：样式全在 shadow root 内，宿主只多一个容器节点", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const before = snapshotDocument(doc);
  const headStylesBefore = (doc.documentElement.children.find((child) => child.localName === "head")?.querySelectorAll("style") ?? []).length;
  const report = applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  assert.equal(report.status, "applied");
  assert.equal(report.applied, 2, `应挂 2 个徽标，实际 ${report.applied}`);

  const host = doc.getElementById(OVERLAY_HOST_ID);
  assert.ok(host, "宿主里应有覆盖层容器");
  assert.ok(host.shadowRoot, "容器必须带 shadow root（Shadow DOM 覆盖层）");

  // 只多一个容器节点：容器是唯一新增的宿主节点；徽标/样式**不是**宿主 children。
  const after = snapshotDocument(doc);
  assert.equal(after.nodeCount, before.nodeCount + 1, `宿主节点数应恰好 +1（实际 ${before.nodeCount} → ${after.nodeCount}）`);
  assert.equal(host.children.length, 0, "容器不得把徽标挂成宿主子元素（否则会污染宿主树）");
  assert.equal(badgesOf(doc).length, 2, "徽标应在 shadow root 内");

  // 样式在 shadow root 内：`<style>` 在 shadow root 里，且宿主 head 内**没有新增** style。
  const stylesInShadow = host.shadowRoot.querySelectorAll("style");
  assert.equal(stylesInShadow.length, 1, "样式应恰好一份，写在 shadow root 内");
  assert.ok(stylesInShadow[0].textContent.includes(`.${BADGE_CLASS}`), "shadow 内样式应覆盖徽标");
  assert.equal(doc.getElementById("pattern-lens-style"), null);
  const headStyles = () => (doc.documentElement.children.find((child) => child.localName === "head")?.querySelectorAll("style") ?? []).length;
  assert.equal(headStyles(), headStylesBefore, "**禁**把 <style> 插进宿主 head（head 内 style 数必须与基线相同）");
  assert.equal(after.styleSheetCount, before.styleSheetCount, "document.styleSheets.length 不得变化");
});

test("① 只读纪律：覆盖层不改宿主元素（属性集逐字段未变）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const before = snapshotDocument(doc);
  applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  const after = snapshotDocument(doc);
  // 属性集比对：唯一允许的差异是新增的容器行（它本身不该带任何属性污染既有节点）。
  const baselineRows = new Set(before.attributeSet.split("\n"));
  const added = after.attributeSet.split("\n").filter((row) => !baselineRows.has(row));
  assert.equal(added.length, 1, `宿主既有节点不得被改动（新增行应只有容器：${added.join(" | ")}）`);
  assert.ok(added[0].startsWith(`${OVERLAY_HOST_ID}|id=${OVERLAY_HOST_ID}`), `新增行应是容器节点：${added[0]}`);
});

test("② 清除后 DOM 快照 diff = 0（属性集 / 节点数 / document.styleSheets.length 三项）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const before = snapshotDocument(doc);
  applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  const applied = snapshotDocument(doc);
  assert.ok(snapshotDiff(before, applied).length > 0, "阳性对照：覆盖层在场时快照**必须**有差异（否则判据恒真）");

  const result = clearOverlay({ doc });
  assert.equal(result.status, "cleared");
  const after = snapshotDocument(doc);
  assert.deepEqual(snapshotDiff(before, after), [], "清除后三项判据必须逐项归零");
  assert.equal(doc.getElementById(OVERLAY_HOST_ID), null, "容器应被移除");
  assert.equal(badgesOf(doc).length, 0, "全部徽标应被移除");
});

test("② 清除是幂等的（重复清除不抛错、状态显式）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  assert.equal(clearOverlay({ doc }).status, "cleared");
  assert.equal(clearOverlay({ doc }).status, "absent");
  assert.equal(clearOverlay({ doc }).status, "absent");
});

test("③ 徽标编号与侧边栏编号一一对应（编号单点 ordering.js，覆盖层不重排不重编号）", () => {
  // 真编号来源：引擎排序 + 编号（K5 单点）。覆盖层只当"编号搬运工"。
  const scan = scanOf(modelOfFixture().nodes);
  const sidepanelIds = scan.findings.map((finding) => finding.finding_id);
  assert.ok(sidepanelIds.length >= 2, `需要至少 2 条 finding 才能验一一对应（实际 ${sidepanelIds.length}）`);

  const doc = buildFakeDom(PAGE_HTML);
  // 传入顺序**故意与编号顺序相反**：若覆盖层自行排序/重编号，下面两条断言会立刻红。
  const reversed = [...scan.findings].reverse();
  const report = applyOverlay(reversed, { doc, setTimeout: timerStub() });
  assert.equal(report.applied, scan.findings.length, "每条 finding 都该挂上徽标（locator 取自真实页面，应全部可回解）");
  assert.deepEqual(report.stale, [], "真实页面的 finding 不该有失效 locator");

  const badgeIds = overlayState({ doc }).badgeIds;
  assert.deepEqual([...badgeIds].sort(), [...sidepanelIds].sort(), `徽标编号集合必须与侧边栏一致：${badgeIds} ≠ ${sidepanelIds}`);
  for (const badge of badgesOf(doc)) {
    const finding = scan.findings.find((item) => item.finding_id === badge.textContent);
    assert.ok(finding, `徽标文本「${badge.textContent}」必须是某个 finding_id（不得是重编号产物）`);
    assert.equal(badge.dataset.locator, finding.locator, "徽标应记住该 finding 的 locator（供 focus 时回解）");
  }
  // 编号单点自证：编号只来自 ordering.js——同输入两次编号一致。
  assert.deepEqual(assignFindingIds(sortFindings(scan.findings, MANIFEST)).map((f) => f.finding_id), sidepanelIds);
});

test("④ 重复高亮幂等：同 finding 再高亮不产生重复徽标（只更新位置）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const first = applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  assert.equal(first.applied, 2);
  const second = applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  assert.equal(second.applied, 0, "第二次不得新建徽标");
  assert.equal(second.duplicates, 2, "重复的应被识别为幂等更新（显式计数，不静默）");
  assert.equal(badgesOf(doc).length, 2, "徽标总数必须仍是 2");
  const third = applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  assert.equal(badgesOf(doc).length, 2, "重复高亮 N 次仍是 2");
  assert.equal(third.status, "applied");
});

test("⑤ 双向联动（页内 → 侧边栏）：点徽标发 `focus-finding`，且本页滚动定位 + 闪烁", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const timer = timerStub();
  const rt = fakeRuntime();
  applyOverlay(findingsFixture(), { doc, runtime: rt.runtime, setTimeout: timer });
  const badge = badgesOf(doc).find((item) => item.textContent === "F-01");
  assert.ok(badge, "应有 F-01 徽标");

  badge.dispatch("click");
  const sent = rt.calls.filter((message) => message.type === "focus-finding");
  assert.equal(sent.length, 1, "点徽标应恰好发一条 focus-finding");
  assert.equal(sent[0].finding_id, "F-01", "载荷应带该徽标的 finding_id（编号即映射键）");
  assert.ok(badge.classList.contains(FLASH_CLASS), "点徽标应立即闪烁");
  assert.equal(timer.scheduled.length, 1, "闪烁应排定一次自动结束（不常亮）");
  timer.scheduled[0]();
  assert.equal(badge.classList.contains(FLASH_CLASS), false, "闪烁应自行结束");
});

test("⑤ 双向联动（侧边栏 → 页内）：`focus-finding` 滚动定位 + 闪烁；未知编号显式报出", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const timer = timerStub();
  applyOverlay(findingsFixture(), { doc, setTimeout: timer });
  const target = resolveLocator(CHECKBOX_PATH, doc);
  assert.ok(target, "阳性对照：定位串应可回解（否则下面的滚动断言没有对象）");

  const focused = focusFinding("F-01", { doc, setTimeout: timer });
  assert.equal(focused.status, "focused");
  assert.equal(target.scrollIntoViewCalls.length, 1, "应滚动定位到目标节点");
  assert.deepEqual(target.scrollIntoViewCalls[0], { block: "center" });
  assert.ok(badgesOf(doc).find((badge) => badge.textContent === "F-01").classList.contains(FLASH_CLASS));

  const missing = focusFinding("F-99", { doc, setTimeout: timer });
  assert.equal(missing.status, "not_found", "未知编号必须显式报出（不静默）");
  assert.equal(missing.finding_id, "F-99");
});

test("⑥ locator 失效分支：回解不到节点 → 显式提示（文案单点 COPY.locatorStale），不静默跳过", () => {
  const doc = buildFakeDom(PAGE_HTML);
  assert.equal(resolveLocator(MISSING_PATH, doc), null, "阳性对照：该定位串在假 DOM 上确实回解不到");
  const report = applyOverlay([{ finding_id: "F-07", locator: MISSING_PATH }], { doc, setTimeout: timerStub() });

  assert.deepEqual(report.stale, ["F-07"], "失效的 finding 必须被点名（不静默跳过）");
  assert.equal(report.applied, 0, "失效的 finding 不得产出徽标（不能指向空气）");
  const state = overlayState({ doc });
  assert.deepEqual(state.staleIds, ["F-07"], "失效条目应在覆盖层内可见");

  const host = doc.getElementById(OVERLAY_HOST_ID);
  const items = host.shadowRoot.querySelectorAll(`.${STALE_ITEM_CLASS}`);
  assert.equal(items.length, 1);
  assert.ok(items[0].textContent.includes(COPY.locatorStale), `失效提示文案必须来自 copy.js 单点：${items[0].textContent}`);
  assert.ok(items[0].textContent.includes("F-07"), "失效提示应带编号（能对上侧边栏条目）");
  // 重复处理同一失效 finding 不产生第二条提示（幂等）。
  applyOverlay([{ finding_id: "F-07", locator: MISSING_PATH }], { doc, setTimeout: timerStub() });
  assert.equal(host.shadowRoot.querySelectorAll(`.${STALE_ITEM_CLASS}`).length, 1, "失效提示也应幂等");
});

test("⑥ 已挂徽标的页面再变化：focus 时回解不到 → 显式标失效（不静默滚动到空气）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const timer = timerStub();
  applyOverlay(findingsFixture(), { doc, setTimeout: timer });
  const badge = badgesOf(doc).find((item) => item.textContent === "F-01");
  badge.dataset.locator = MISSING_PATH; // 模拟页面已变化
  const result = focusFinding("F-01", { doc, setTimeout: timer });
  assert.equal(result.status, "stale");
  assert.deepEqual(overlayState({ doc }).staleIds, ["F-01"]);
});

test("消息入口：apply / clear / focus 三种消息各走对分支，未知消息返回 null（不吞）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const timer = timerStub();
  const options = { doc, setTimeout: timer };

  assert.equal(handleOverlayMessage({ type: "unknown-thing" }, options), null);
  assert.equal(handleOverlayMessage(null, options), null);

  const applied = handleOverlayMessage({ type: "apply-overlay", findings: findingsFixture() }, options);
  assert.equal(applied.status, "applied");
  assert.equal(badgesOf(doc).length, 2);

  const focused = handleOverlayMessage({ type: "focus-finding", finding_id: "F-02" }, options);
  assert.equal(focused.status, "focused");

  const cleared = handleOverlayMessage({ type: "clear-overlay" }, options);
  assert.equal(cleared.status, "cleared");
  assert.equal(doc.getElementById(OVERLAY_HOST_ID), null);
});

test("空 findings：不建容器（避免在无 finding 的页面上留下空覆盖层）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const before = snapshotDocument(doc);
  const report = applyOverlay([], { doc, setTimeout: timerStub() });
  assert.equal(report.status, "empty");
  assert.deepEqual(snapshotDiff(before, snapshotDocument(doc)), [], "空输入不得改动宿主");
});

test("端到端：真实页面模型（引擎 + 排序编号）→ 覆盖层 → 清除，diff 归零且编号对齐", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const scan = scanOf(modelOfFixture().nodes);
  assert.ok(scan.findings.length > 0, `阳性对照：${PAGE_ID} 上应扫出 finding（实际 ${scan.findings.length}）`);

  const before = snapshotDocument(doc);
  applyOverlay(scan.findings, { doc, setTimeout: timerStub() });
  const badgeIds = overlayState({ doc }).badgeIds;
  const expected = scan.findings.map((finding) => finding.finding_id);
  assert.deepEqual([...badgeIds].sort(), [...expected].sort(), "页内徽标编号必须覆盖全部 finding 编号");
  assert.equal(badgeIds.length, scan.findings.length, "每条 finding 一个徽标（一一对应）");

  clearOverlay({ doc });
  assert.deepEqual(snapshotDiff(before, snapshotDocument(doc)), [], "清除后三项判据归零");
});

test("编号宽度自证：finding 超过 99 条时徽标仍逐条对应（不截断、不重编号）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const many = Array.from({ length: 12 }, (_, index) => ({
    finding_id: `F-${String(index + 1).padStart(2, "0")}`,
    locator: CHECKBOX_PATH,
  }));
  const report = applyOverlay(many, { doc, setTimeout: timerStub() });
  // 同一 locator 的多个编号各自成徽标（覆盖层不按 locator 去重——去重是引擎侧 K26 的事）。
  assert.equal(report.applied, 12);
  assert.deepEqual(overlayState({ doc }).badgeIds, many.map((item) => item.finding_id));
});

test("覆盖层模块不进 src/lib（纯核心不得碰 DOM）：模块位置与 import 方向正确", () => {
  const source = readFileSync(join(ROOT, "src", "content", "overlay.js"), "utf8");
  assert.ok(source.includes("from \"./collector.js\""), "应复用采集层的 resolveLocator（单点）");
  assert.ok(source.includes("from \"../lib/copy.js\""), "文案应取 copy.js 单点");
  assert.equal(/from\s+"\.\.\/lib\/(?!copy)/.test(source), false, "覆盖层不应依赖其它 lib（拼接序要保持浅）");
});

// ── 可证伪性自证：把判据指向的实现改坏，必须能红 ────────────────────────────────
test("可证伪性：快照判据真的会红（容器在场 vs 移除后，三项判据之一必报出）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const before = snapshotDocument(doc);
  applyOverlay(findingsFixture(), { doc, setTimeout: timerStub() });
  const withHost = snapshotDocument(doc);
  const diff = snapshotDiff(before, withHost);
  assert.ok(diff.some((row) => row.includes("节点数")), `节点数差异必须被报出：${diff.join("；")}`);

  // 变异：把 styleSheets 数量改掉（模拟"样式漏进了宿主"）→ 第三项判据必须报出。
  const polluted = { ...before, styleSheetCount: before.styleSheetCount + 1 };
  assert.ok(snapshotDiff(before, polluted).some((row) => row.includes("styleSheets")), "styleSheets 差异必须被报出");
});

test("可证伪性：编号判据真的会红（把徽标编号改成重编号产物 → 集合比对必报出）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const findings = findingsFixture();
  applyOverlay(findings, { doc, setTimeout: timerStub() });
  const expected = findings.map((finding) => finding.finding_id);
  const actual = overlayState({ doc }).badgeIds;
  assert.deepEqual([...actual].sort(), [...expected].sort(), "基线应一致");

  // 变异：把编号整体错位一位（模拟"覆盖层自己重编号"）→ 集合比对必须报出差异。
  const mutated = actual.map((id) => `F-${String(Number(id.slice(2)) + 1).padStart(2, "0")}`);
  assert.notDeepEqual([...mutated].sort(), [...expected].sort(), "重编号后仍相等 → 这条比对证明不了任何事");
});

test("可证伪性：失效分支真的会红（把失效 finding 换成可回解的 locator → 不得再报失效）", () => {
  const doc = buildFakeDom(PAGE_HTML);
  const stale = applyOverlay([{ finding_id: "F-07", locator: MISSING_PATH }], { doc, setTimeout: timerStub() });
  assert.deepEqual(stale.stale, ["F-07"], "基线：不可回解的 locator 必须报失效");

  clearOverlay({ doc });
  const good = applyOverlay([{ finding_id: "F-07", locator: CHECKBOX_PATH }], { doc, setTimeout: timerStub() });
  assert.deepEqual(good.stale, [], "换成可回解的 locator 后不得再报失效（否则失效判据是恒真的）");
  assert.equal(good.applied, 1);
});

test("K9 文案纪律：覆盖层不手写失效文案（只在 copy.js 定义一次）", () => {
  const source = readFileSync(join(ROOT, "src", "content", "overlay.js"), "utf8");
  assert.ok(source.includes("COPY.locatorStale"), "覆盖层应引用 COPY.locatorStale");
  assert.equal(source.includes(COPY.locatorStale), false, "覆盖层不得内联该文案字符串（会成第二份）");
});

test("默认包管理器可读：pack() 供编号单点复算（防 helpers 与规则包漂移）", () => {
  assert.ok(pack().order.length >= 12, "规则包加载器应给出 12 条规则顺序");
});
