// 侧边栏离线验收的共享脚手架（**不进 dist**；只服务 node --test）。
//
// 为什么单列一个 helper：M5 有三条判据都要在**侧边栏的真实导出/设置路径**上验收
// （导出字段与字节一致、黑名单明示、规则开关），而每条都重复造一遍假 chrome 运行时
// 会让"这条路径"在三份脚手架里各自漂移。口径与 `tests/sidepanel-restore.test.mjs` 同源：
// **假 DOM + 假 chrome 运行时上的本地等价校验**（不是浏览器实证——真实渲染路径见 `tools/smoke-*.mjs`）。

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildFakeDom } from "./fake-dom.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const INDEX_HTML = readFileSync(join(ROOT, "src", "sidepanel", "index.html"), "utf8");
const WORKER_PATH = join(ROOT, "src", "background", "service-worker.js");
const SIDEPANEL_PATH = join(ROOT, "src", "sidepanel", "sidepanel.js");

const fileUrl = (path) => new URL(`file://${path.replace(/\\/g, "/")}`).href;

let bust = 0;

/**
 * 假 chrome 运行时（SW 侧）：把每次调用记进 `calls`，`storage.session` 当共享真相源。
 * `settings` 为 `storage.local` 的内容（站点开关 / 规则开关）。
 */
export function fakeChrome({ settings = {}, executeScriptError = null } = {}) {
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
    contextMenus: { create: () => {}, onClicked: { addListener: (fn) => listeners.menu.push(fn) } },
    sidePanel: { open: async () => {} },
    tabs: {
      query: async () => [{ id: 42, windowId: 3, url: "https://example.invalid/current.html" }],
      sendMessage: async () => {},
    },
    storage: {
      local: {
        get: async (key) => ({ [key]: local[key] }),
        set: async (items) => {
          calls.push({ fn: "storage.local.set", items });
          Object.assign(local, items);
        },
      },
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
  return { chrome, calls, listeners, session, local };
}

/** 重新 import SW（新实例 = 模拟"SW 被回收"；共享同一份 storage.session）。 */
export async function importWorker(chrome) {
  if (chrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = chrome;
  bust += 1;
  return import(`${fileUrl(WORKER_PATH)}?bust=${bust}`);
}

/**
 * 侧边栏侧假运行时：`sendMessage` 由给定 SW 实例的消息路由器应答
 * （SW 被回收 = 换实例，`storage.session` 不变）。
 */
export function sidepanelRuntime(fake, currentUrl = "https://example.invalid/current.html") {
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
      local: {
        get: async () => ({ settings: fake.local?.settings }),
        set: async (items) => {
          // 与 SW 侧共用同一份 `storage.local`（`fake.calls` 里也记一笔，便于断言"设置真的落盘了"）。
          fake.calls.push({ fn: "storage.local.set", items, side: "sidepanel" });
          Object.assign(fake.local, items);
        },
      },
      session: { get: async (key) => ({ [key]: fake.session[key] }) },
    },
  };
}

/**
 * 打开侧边栏：每次取**全新模块实例**（真实里每次打开是新文档）。
 * 保留 `globalThis.chrome`（SW 消息路由器要靠它读 storage）；sidepanel 自启动守卫还要求
 * `typeof document !== "undefined"`（Node 里为 false），故不会误启动。
 * @returns {{module: object, doc: object, downloads: Array, runtime: object}}
 */
export async function openSidepanel(fake, options = {}) {
  bust += 1;
  const module = await import(`${fileUrl(SIDEPANEL_PATH)}?bust=${bust}`);
  const doc = buildFakeDom(INDEX_HTML);
  const downloads = [];
  const download = (text, filename, mime) => downloads.push({ text, filename, mime });
  const runtime = sidepanelRuntime(fake, options.currentUrl);
  await module.initSidepanel({ doc, runtime, download });
  return { module, doc, downloads, runtime };
}

export const textOf = (doc) => doc.body.textContent;
