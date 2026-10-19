// 按需注入链路（M2 DoD）：
//   SW `start-scan` → 读站点开关（storage.local）→ 命中黑名单**不注入**并回 `blocked-site` →
//   否则 `chrome.scripting.executeScript({ target: { tabId }, files: ["scanner.js"] })`；
//   结果回传 `scan-result` → 落 `storage.session.LastScan`；注入失败 / 规则包失败 → **显式报错**（不显示"未发现"）。
//
// 本机无浏览器（自动拉浏览器不稳，有实测史）→ 这里用**假 chrome 运行时**把链路跑成离线可验收的断言。
// 口径：**这只是本地等价校验**，真实浏览器冒烟仍未做（`plan/06` §五 已知未验证项），不据此打"浏览器已验"。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MANIFEST } from "./helpers/model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_PATH = join(ROOT, "src", "background", "service-worker.js");

/** 假 chrome：把每个调用记进 `calls`，便于断言"没注入"这类**否定性**事实。 */
function fakeChrome({ settings = {}, executeScriptError = null } = {}) {
  const calls = [];
  const session = {};
  const local = { settings };
  const listeners = { installed: [], action: [], menu: [], message: [] };
  const chrome = {
    runtime: {
      id: "fake-extension-id",
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
    },
    action: { onClicked: { addListener: (fn) => listeners.action.push(fn) } },
    contextMenus: {
      create: (options) => calls.push({ fn: "contextMenus.create", options }),
      onClicked: { addListener: (fn) => listeners.menu.push(fn) },
    },
    sidePanel: { open: async (options) => calls.push({ fn: "sidePanel.open", options }) },
    tabs: {
      query: async (query) => {
        calls.push({ fn: "tabs.query", query });
        return [{ id: 42, windowId: 3, url: "https://example.invalid/current.html" }];
      },
      sendMessage: async (tabId, message) => calls.push({ fn: "tabs.sendMessage", tabId, message }),
    },
    storage: {
      local: { get: async (key) => ({ [key]: local[key] }) },
      session: {
        set: async (items) => {
          calls.push({ fn: "storage.session.set", items });
          Object.assign(session, items);
        },
        get: async (key) => ({ [key]: session[key] }),
      },
    },
    scripting: {
      executeScript: async (options) => {
        calls.push({ fn: "scripting.executeScript", options });
        if (executeScriptError) throw new Error(executeScriptError);
        return [{ result: "ok" }];
      },
    },
  };
  return { chrome, calls, listeners, session };
}

let bust = 0;
async function importWorker(chrome) {
  if (chrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = chrome;
  bust += 1;
  return import(`${new URL(`file://${WORKER_PATH.replace(/\\/g, "/")}`).href}?bust=${bust}`);
}

test("模块可离线 import：没有扩展运行时时不挂监听、不抛错（本机无浏览器也要能验收）", async () => {
  const worker = await importWorker(undefined);
  assert.equal(typeof worker.startScan, "function", "SW 必须导出可单独验收的函数");
  assert.equal(typeof worker.storeLastScan, "function");
});

test("站点开关命中黑名单 → **不注入**（否定性事实：executeScript 一次都没被调用）", async () => {
  const { chrome, calls, listeners } = fakeChrome({
    settings: { site_policy: { mode: "blocklist", hosts: ["example.invalid"] }, disabled_rule_ids: [] },
  });
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.deepEqual(outcome, { status: "blocked", reason: "blocklisted" });
  assert.deepEqual(
    calls.filter((call) => call.fn === "scripting.executeScript"),
    [],
    "黑名单站点不得注入",
  );
  assert.equal(listeners.message.length, 1, "消息路由必须挂上（扫描入口只有一条）");
});

test("站点开关放行 → 按需注入 scanner.js（target.tabId 指当前标签页）", async () => {
  const { chrome, calls } = fakeChrome();
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.equal(outcome.status, "injected");
  assert.equal(outcome.ruleset_version, MANIFEST.ruleset_version);
  const injections = calls.filter((call) => call.fn === "scripting.executeScript");
  assert.equal(injections.length, 1, "放行站点必须且只能注入一次");
  assert.deepEqual(injections[0].options, { target: { tabId: 7 }, files: ["scanner.js"] });
});

test("白名单模式：不在名单里的站点不注入（reason 显式，不静默）", async () => {
  const { chrome, calls } = fakeChrome({
    settings: { site_policy: { mode: "allowlist", hosts: ["fixture.local"] }, disabled_rule_ids: [] },
  });
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.deepEqual(outcome, { status: "blocked", reason: "not_allowlisted" });
  assert.deepEqual(calls.filter((call) => call.fn === "scripting.executeScript"), []);
});

test("注入失败 → 显式报错（不装作「未发现」）", async () => {
  const { chrome } = fakeChrome({ executeScriptError: "Cannot access contents of the page" });
  const worker = await importWorker(chrome);
  const outcome = await worker.startScan(7, "https://example.invalid/p.html");
  assert.equal(outcome.status, "error");
  assert.match(outcome.reason, /^inject_failed: /);
});

test("scan-result → 落 storage.session.LastScan（url / scanned_at / scan 三件）", async () => {
  const { chrome, calls } = fakeChrome();
  const worker = await importWorker(chrome);
  const scan = { url: "https://example.invalid/p.html", scanned_at: "1970-01-01T00:00:00.000Z", findings: [] };
  await worker.storeLastScan(scan);
  const written = calls.find((call) => call.fn === "storage.session.set");
  assert.deepEqual(written.items, {
    LastScan: { url: scan.url, scanned_at: scan.scanned_at, scan },
  });
});

test("消息路由：start-scan（站点放行）→ injected；scan-result → stored；get-last-scan 回读同一份", async () => {
  const { chrome, listeners, session } = fakeChrome();
  await importWorker(chrome);
  const onMessage = listeners.message[0];
  const send = (message, sender = { tab: { id: 42, url: "https://example.invalid/current.html" } }) =>
    new Promise((done) => {
      const kept = onMessage(message, sender, done);
      assert.equal(kept, true, "异步响应必须 return true（否则通道提前关闭）");
    });

  assert.equal((await send({ type: "start-scan" })).status, "injected");
  const scan = { url: "https://example.invalid/current.html", scanned_at: "1970-01-01T00:00:00.000Z", findings: [] };
  assert.deepEqual(await send({ type: "scan-result", outcome: { scan } }), { status: "stored" });
  assert.deepEqual(session.LastScan, { url: scan.url, scanned_at: scan.scanned_at, scan });
  assert.deepEqual(await send({ type: "get-last-scan" }), { LastScan: session.LastScan });
});

test("消息路由：黑名单站点 → blocked（并把原因落 session，UI 才能明示「该站点已停用」）", async () => {
  const { chrome, listeners, session } = fakeChrome({
    settings: { site_policy: { mode: "blocklist", hosts: ["example.invalid"] }, disabled_rule_ids: [] },
  });
  await importWorker(chrome);
  const onMessage = listeners.message[0];
  const outcome = await new Promise((done) =>
    onMessage({ type: "start-scan" }, { tab: { id: 42, url: "https://example.invalid/x.html" } }, done),
  );
  assert.deepEqual(outcome, { status: "blocked", reason: "blocklisted" });
  assert.equal(session.LastScan.blocked, "blocklisted");
});

test("覆盖层消息：**侧边栏来源**（无 sender.tab）→ 转发给当前标签页（apply / clear / focus 三条）", async () => {
  const { chrome, calls, listeners } = fakeChrome();
  await importWorker(chrome);
  const onMessage = listeners.message[0];
  const send = (message, sender = {}) =>
    new Promise((done) => {
      assert.equal(onMessage(message, sender, done), true, "异步响应必须 return true");
    });

  for (const message of [
    { type: "apply-overlay", findings: [] },
    { type: "clear-overlay" },
    { type: "focus-finding", finding_id: "F-01" },
  ]) {
    const outcome = await send(message);
    assert.deepEqual(outcome, { status: "forwarded" }, `${message.type} 应被转发`);
  }
  const forwarded = calls.filter((call) => call.fn === "tabs.sendMessage");
  assert.deepEqual(
    forwarded.map((call) => call.message.type),
    ["apply-overlay", "clear-overlay", "focus-finding"],
    "三条覆盖层消息应逐条转发给页内脚本",
  );
  assert.equal(forwarded.every((call) => call.tabId === 42), true, "应转发到当前活动标签页");
});

test("覆盖层消息：**页内来源**（带 sender.tab）→ 不转回页面（否则点一次徽标会闪两下）", async () => {
  const { chrome, calls, listeners } = fakeChrome();
  await importWorker(chrome);
  const onMessage = listeners.message[0];
  const outcome = await new Promise((done) =>
    onMessage({ type: "focus-finding", finding_id: "F-01" }, { tab: { id: 42, url: "https://example.invalid/p.html" } }, done),
  );
  assert.deepEqual(outcome, { status: "from_content" }, "页内发起的 focus 必须显式识别（不静默）");
  assert.deepEqual(
    calls.filter((call) => call.fn === "tabs.sendMessage"),
    [],
    "页内来源的 focus-finding 不得被转回页面（否定性事实：一次都没转发）",
  );
  assert.deepEqual(
    calls.filter((call) => call.fn === "scripting.executeScript"),
    [],
    "处理覆盖层消息不得触发注入",
  );
});

test("manifest 侧口径复核：无 content_scripts（未点击前零注入）", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  assert.equal("content_scripts" in manifest, false);
  assert.equal("host_permissions" in manifest && (manifest.host_permissions ?? []).length > 0, false);
});
