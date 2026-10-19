#!/usr/bin/env node
// 浏览器冒烟（M3 DoD 第 4 项）：**真实浏览器里的真实点击**双向联动 + 真实渲染路径下的 DOM diff = 0。
//
// 为什么单独一个脚本（不进 `npm test` / 不进 CI）：它需要本机有 Chrome，且**本机自动化拉浏览器不稳**（有实测史，
// `plan/06` §五）。故口径是：能拉起 → 真跑并给证据；拉不起来 → **显式 SKIP**（rc=0 但打印 SKIP 与原因），
// 绝不静默通过、也绝不据此把"浏览器已验"写成已完成。
//
// 它验的东西（都是**假 DOM 验不到**的）：
//   · 真实渲染路径：`getComputedStyle` / `getBoundingClientRect` 来自真浏览器；
//   · Shadow DOM 在真浏览器里的形态：宿主只多一个容器、`document.styleSheets.length` 不变；
//   · **真实鼠标点击**（CDP `Input.dispatchMouseEvent`）点徽标 → 发出 `focus-finding`（双向联动反向半程）；
//   · 清除后宿主快照三项判据逐项归零（真浏览器里）。
//
// 被验的代码 = `tools/bundle.mjs` 产出的**真实拼接产物**（`npm run build` 的 scanner.js 源），
// 只在末尾追加一段"把内部函数暴露到 window"的探针（探针不改任何被测逻辑）。
//
// 用法：node tools/smoke-overlay.mjs [--keep]   # --keep 保留浏览器进程便于排查

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildScannerSource, ROOT } from "./bundle.mjs";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function findBrowser() {
  return CHROME_CANDIDATES.find((path) => existsSync(path)) ?? null;
}

/** 探针：把拼接产物里的覆盖层函数暴露到 window（**不改被测逻辑**，只加一段导出）。 */
function withProbe(source) {
  const marker = "\n})();\n";
  if (!source.endsWith(marker)) throw new Error("拼接产物结尾不是预期的 IIFE 收尾（探针无法注入）");
  const probe = [
    "",
    "  let __plProbeRuntime = null;",
    "  window.__plProbe = {",
    "    collectPageModel, applyOverlay, clearOverlay, focusFinding, overlayState, handleOverlayMessage,",
    "    buildScanResult, loadRulePack, RULESET, RULE_SPECS,",
    "    setRuntime: (runtime) => { __plProbeRuntime = runtime; },",
    "    getRuntime: () => __plProbeRuntime,",
    "  };",
    "})();",
    "",
  ].join("\n");
  return source.slice(0, source.length - marker.length) + "\n" + probe;
}

/** 极简 CDP 客户端（零依赖：Node 24 自带 WebSocket）。 */
function cdpClient(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 0;
  const ready = new Promise((done, fail) => {
    ws.onopen = () => done();
    ws.onerror = (event) => fail(new Error(`CDP 连接失败：${event?.message ?? "unknown"}`));
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const settle = pending.get(message.id);
    if (!settle) return;
    pending.delete(message.id);
    settle(message);
  };
  return {
    ready,
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

async function evaluate(client, expression, awaitPromise = false) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (response.result?.exceptionDetails) {
    throw new Error(`页面内异常：${response.result.exceptionDetails.text ?? ""} ${response.result.exceptionDetails.exception?.description ?? ""}`);
  }
  return response.result?.result?.value;
}

function skip(reason) {
  process.stdout.write(`SKIP  浏览器冒烟（${reason}）\n`);
  process.stdout.write("口径：本机拉不起浏览器 → 显式 SKIP，记入已知未验证项（plan/06 §五）；**不据此打 ✅**。\n");
  process.exitCode = 0;
}

async function main() {
  const keep = process.argv.includes("--keep");
  const browser = findBrowser();
  if (!browser) {
    skip("本机未找到 Chrome / Edge");
    return;
  }

  const pageId = "page-01";
  const pagePath = join(ROOT, "data", "fixtures", pageId, "page.html");
  if (!existsSync(pagePath)) {
    skip(`缺 ${pageId}/page.html（先跑 npm run fixtures）`);
    return;
  }
  const source = withProbe(buildScannerSource());
  const profile = mkdtempSync(join(tmpdir(), "pl-smoke-"));
  const port = 9700 + Math.floor(Math.random() * 200);
  const child = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--allow-file-access-from-files",
      `file://${pagePath.replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" },
  );

  const problems = [];
  let client = null;
  let browserVersion = null;
  try {
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
    browserVersion = version;
    if (!version) {
      skip("浏览器未在时限内就绪（拉浏览器不稳的既有实测史）");
      return;
    }
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((item) => item.type === "page" && item.url.startsWith("file:"));
    if (!target) {
      skip("没找到打开的 fixture 页面");
      return;
    }
    client = cdpClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await wait(500); // 等页面脚本/布局稳定

    // ── 1. 注入真实拼接产物 + 探针 ─────────────────────────────────────────
    await evaluate(client, source);
    const injected = await evaluate(client, "typeof window.__plProbe === 'object'");
    if (injected !== true) {
      problems.push("拼接产物注入后探针不可用（产物可能被改坏）");
      return finish(problems, browserVersion);
    }

    // ── 2. 真实渲染路径扫描（真 getComputedStyle / getBoundingClientRect）──
    const scanSummary = await evaluate(
      client,
      `(() => {
        const probe = window.__plProbe;
        const pack = probe.loadRulePack(probe.RULESET, probe.RULE_SPECS);
        const started = Date.now();
        const { nodes, truncated } = probe.collectPageModel(document, { deadline: started + 2000, now: () => Date.now() });
        const scan = probe.buildScanResult({
          url: location.href, scannedAt: new Date(started).toISOString(), nodes, pack,
          elapsedMs: Math.max(0, Date.now() - started), truncated,
        });
        window.__plScan = scan;
        return { nodes: nodes.length, findings: scan.findings.length, truncated: scan.truncated, elapsed: scan.elapsed_ms };
      })()`,
    );
    if (!(scanSummary.nodes > 0)) problems.push("真实浏览器里采集到 0 个节点");
    if (!(scanSummary.findings > 0)) problems.push(`${pageId} 在真实浏览器里没扫出 finding（阳性对照失败）`);

    // ── 3. Shadow DOM 形态 + 宿主快照（真浏览器）────────────────────────────
    const snapshotExpr = `(() => {
      const rows = [];
      const walk = (el) => {
        rows.push(el.localName + '|' + [...el.attributes].map((a) => a.name + '=' + a.value).sort().join(','));
        for (const child of el.children) walk(child);
      };
      walk(document.documentElement);
      return JSON.stringify({ nodeCount: rows.length, attrs: rows.join('\\n'), styleSheets: document.styleSheets.length });
    })()`;
    const before = JSON.parse(await evaluate(client, snapshotExpr));

    const applied = await evaluate(
      client,
      `(() => {
        const probe = window.__plProbe;
        probe.setRuntime({ runtime: { id: 'smoke', sendMessage: (m) => { window.__plSent = (window.__plSent || []).concat([m]); return Promise.resolve({}); } } });
        const report = probe.applyOverlay(window.__plScan.findings, { runtime: probe.getRuntime() });
        const host = document.getElementById('pattern-lens-overlay');
        return { report, hostChildren: host ? host.children.length : -1, hasShadow: Boolean(host && host.shadowRoot) };
      })()`,
    );
    const after = JSON.parse(await evaluate(client, snapshotExpr));
    if (applied.hasShadow !== true) problems.push("真实浏览器里覆盖层不是 Shadow DOM");
    if (after.nodeCount !== before.nodeCount + 1) {
      problems.push(`宿主节点数应恰好 +1（真实浏览器：${before.nodeCount} → ${after.nodeCount}）`);
    }
    if (applied.hostChildren !== 0) problems.push(`容器不得把徽标挂成宿主子元素（实际 ${applied.hostChildren}）`);
    if (after.styleSheets !== before.styleSheets) {
      problems.push(`document.styleSheets.length 变了（${before.styleSheets} → ${after.styleSheets}）`);
    }

    // ── 4. **真实鼠标点击**徽标 → 发 focus-finding（双向联动反向半程）────────
    const badgeInfo = await evaluate(
      client,
      `(() => {
        const host = document.getElementById('pattern-lens-overlay');
        const badge = host.shadowRoot.querySelector('.pl-badge');
        const rect = badge.getBoundingClientRect();
        return { id: badge.textContent, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), w: rect.width, h: rect.height };
      })()`,
    );
    if (!(badgeInfo.w > 0 && badgeInfo.h > 0)) problems.push(`徽标在真实浏览器里尺寸为 0（${badgeInfo.w}x${badgeInfo.h}）`);
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: badgeInfo.x, y: badgeInfo.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: badgeInfo.x, y: badgeInfo.y, button: "left", clickCount: 1 });
    await wait(120);
    const clicked = await evaluate(
      client,
      `(() => ({
        sent: (window.__plSent || []).filter((m) => m.type === 'focus-finding').map((m) => m.finding_id),
        flashed: Boolean(document.getElementById('pattern-lens-overlay').shadowRoot.querySelector('.pl-flash')),
      }))()`,
    );
    if (!clicked.sent.includes(badgeInfo.id)) {
      problems.push(`真实点击徽标未发出 focus-finding（点击编号 ${badgeInfo.id}，收到 ${JSON.stringify(clicked.sent)}）`);
    }
    if (clicked.flashed !== true) problems.push("真实点击徽标后未闪烁（.pl-flash 不在场）");

    // ── 5. 反向半程：`focus-finding` 消息 → 滚动定位（真 scrollIntoView）──────
    const focused = await evaluate(
      client,
      `(() => {
        const id = window.__plScan.findings[window.__plScan.findings.length - 1].finding_id;
        const outcome = window.__plProbe.handleOverlayMessage({ type: 'focus-finding', finding_id: id });
        return { id, status: outcome.status };
      })()`,
    );
    if (focused.status !== "focused") problems.push(`focus-finding 未成功定位（status=${focused.status}）`);

    // ── 6. 清除 → 三项判据归零（真浏览器）──────────────────────────────────
    await evaluate(client, "window.__plProbe.clearOverlay()");
    const cleared = JSON.parse(await evaluate(client, snapshotExpr));
    if (cleared.nodeCount !== before.nodeCount) problems.push(`清除后节点数未归零（${before.nodeCount} → ${cleared.nodeCount}）`);
    if (cleared.attrs !== before.attrs) problems.push("清除后属性集未归零（宿主被改动过）");
    if (cleared.styleSheets !== before.styleSheets) problems.push("清除后 document.styleSheets.length 未归零");

    return finish(problems, browserVersion, { scanSummary, applied, clicked, focused });
  } catch (error) {
    problems.push(`冒烟异常：${error.message}`);
    return finish(problems, browserVersion);
  } finally {
    client?.close();
    if (!keep) {
      child.kill();
      await wait(400);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Windows 上浏览器可能还占着句柄：清理失败不影响结论 */
      }
    }
  }
}

function finish(problems, version, detail = {}) {
  process.stdout.write("浏览器冒烟（真实浏览器 · 真实点击）\n");
  process.stdout.write("=".repeat(64) + "\n");
  process.stdout.write(`浏览器：${version?.Browser ?? "（未取到版本）"}\n`);
  if (detail.scanSummary) {
    process.stdout.write(`真实渲染路径扫描：${detail.scanSummary.nodes} 节点 / ${detail.scanSummary.findings} finding / ${detail.scanSummary.elapsed}ms\n`);
  }
  if (detail.applied?.report) {
    process.stdout.write(`覆盖层：applied=${detail.applied.report.applied} stale=${JSON.stringify(detail.applied.report.stale)} shadow=${detail.applied.hasShadow}\n`);
  }
  if (detail.clicked) process.stdout.write(`真实点击徽标：发出 focus-finding=${JSON.stringify(detail.clicked.sent)} 闪烁=${detail.clicked.flashed}\n`);
  if (detail.focused) process.stdout.write(`focus-finding 回解：${detail.focused.id} → ${detail.focused.status}\n`);
  process.stdout.write("=".repeat(64) + "\n");
  if (problems.length > 0) {
    for (const problem of problems) process.stdout.write(`FAIL  ${problem}\n`);
    process.stdout.write(`结论: ${problems.length} 项 FAIL（浏览器已拉起，问题真实存在）\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("结论: 全绿（真实浏览器 · Shadow DOM 单容器 · 清除后三项判据归零 · 真实点击双向联动）\n");
  process.exitCode = 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
