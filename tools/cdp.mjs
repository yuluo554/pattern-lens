// 浏览器自动化的共享底座（**零依赖**：Node 自带 WebSocket + `fetch` 拉 `/json`）。
//
// 单点理由（仓库纪律：同一判据只许一处实现）：`smoke-overlay.mjs`（M3）与 `smoke-export.mjs`（M5）
// 都要"拉起本机浏览器 → CDP 驱动 → 真实点击/真实渲染"。抄第二份 CDP 客户端会让"怎么拉浏览器、
// 怎么判就绪、怎么发真实点击"在三处各自漂移。故浏览器发现、就绪等待、CDP 客户端、`evaluate`
// 全部收敛到本模块；两个冒烟脚本只写各自**要验的事**。
//
// 口径（D35，M3 已声明，M5 复用）：**能拉起 → 真跑并给证据；拉不起来 → 显式 SKIP（rc=0）**，
// 绝不静默通过、也绝不据此把"浏览器已验"写成已完成。

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 浏览器临时 profile 的落点：**仓库内的 `tmp/`（已在 `.gitignore`）**，而不是系统临时目录。
 * 理由（实测踩坑）：本机系统临时目录在 **C 盘**，Chrome profile 每个约 20~26MB；反复冒烟会把 C 盘塞满
 * （实测爆过一次）。放进仓库所在盘即可（D 盘），且脚本退出时清理。
 * 可用环境变量 `PL_TMP_DIR` 覆盖。
 */
export function smokeTmpRoot() {
  const root = process.env.PL_TMP_DIR || join(ROOT, "tmp");
  mkdirSync(root, { recursive: true });
  return root;
}

export const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * 删 profile 目录（**带重试**）：Windows 上浏览器退出后句柄可能还没释放（`EPERM`/`EBUSY`），
 * 单次 `rmSync` 会把 20+MB 的目录留在盘上（实测：反复冒烟会攒垃圾）。故重试几次 + 间隔。
 * 仍失败不抛（清理失败不影响结论），但会打印一行提示，避免"以为清干净了"。
 */
export async function removeProfile(profile) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch {
      await wait(200);
    }
  }
  process.stdout.write(`（提示：临时目录未清干净（句柄未释放），可稍后手动删：${profile}）\n`);
}

export function findBrowser() {
  return CHROME_CANDIDATES.find((path) => existsSync(path)) ?? null;
}

/** 极简 CDP 客户端（零依赖：Node 24 自带 WebSocket）。 */
export function cdpClient(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  const events = [];
  const listeners = [];
  let nextId = 0;
  const ready = new Promise((done, fail) => {
    ws.onopen = () => done();
    ws.onerror = (event) => fail(new Error(`CDP 连接失败：${event?.message ?? "unknown"}`));
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    if (message.method) {
      events.push(message);
      for (const listener of listeners) listener(message);
    }
  };
  return {
    ready,
    events,
    onEvent: (listener) => listeners.push(listener),
    close: () => ws.close(),
    send(method, params = {}) {
      return new Promise((done) => {
        const id = (nextId += 1);
        pending.set(id, done);
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

/** 页面内求值（抛出页面内异常，不静默吞掉）。 */
export async function evaluate(client, expression, awaitPromise = false) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (response.result?.exceptionDetails) {
    throw new Error(
      `页面内异常：${response.result.exceptionDetails.text ?? ""} ${response.result.exceptionDetails.exception?.description ?? ""}`,
    );
  }
  return response.result?.result?.value;
}

/**
 * 拉起无头浏览器并连上第一个 `file:` 页面 target。
 * @param {{browser: string, pageUrl: string, port?: number, extraArgs?: string[], windowSize?: string}} options
 * @returns {Promise<{child: object, profile: string, port: number, client: object, version: object, target: object, cleanup: Function}>}
 */
export async function launch(options) {
  const { browser, pageUrl, extraArgs = [], windowSize } = options;
  const port = options.port ?? 9700 + Math.floor(Math.random() * 200);
  const profile = mkdtempSync(join(smokeTmpRoot(), "pl-smoke-"));
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--allow-file-access-from-files",
  ];
  if (windowSize) args.push(`--window-size=${windowSize}`);
  args.push(...extraArgs, pageUrl);
  const child = spawn(browser, args, { stdio: "ignore" });

  let version = null;
  for (let attempt = 0; attempt < 60 && !version; attempt += 1) {
    await wait(250);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) version = await response.json();
    } catch {
      /* 还没起来，继续等 */
    }
  }
  if (!version) {
    return {
      child,
      profile,
      port,
      version: null,
      client: null,
      target: null,
      cleanup: async () => {
        child.kill();
        await wait(400);
        await removeProfile(profile);
      },
    };
  }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page" && item.url.startsWith("file:"));
  const client = target ? cdpClient(target.webSocketDebuggerUrl) : null;
  if (client) {
    await client.ready;
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await wait(500); // 等页面脚本/布局稳定
  }
  return {
    child,
    profile,
    port,
    version,
    client,
    target,
    cleanup: async () => {
      client?.close();
      child.kill();
      await wait(400);
      await removeProfile(profile);
    },
  };
}

/** 统一的 SKIP 输出（口径：拉不起来 → 显式 SKIP，rc=0，不据此打 ✅）。 */
export function skip(name, reason) {
  process.stdout.write(`SKIP  ${name}（${reason}）\n`);
  process.stdout.write("口径：本机拉不起浏览器 → 显式 SKIP，记入已知未验证项（plan/06 §五）；**不据此打 ✅**。\n");
  process.exitCode = 0;
}
