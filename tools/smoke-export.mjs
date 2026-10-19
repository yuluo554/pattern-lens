#!/usr/bin/env node
// M5 浏览器冒烟：**真实浏览器里的真实导出路径** + 整轮扫描/导出的**真实网络计数**（+ 可选商店截图）。
//
// 为什么单列一个脚本（D35 口径）：它需要本机有 Chrome，且自动化拉浏览器不稳（有实测史，`plan/06` §五）。
// 故口径是：能拉起 → 真跑并给证据；拉不起来 → **显式 SKIP**（rc=0 但打印 SKIP 与原因），
// 绝不静默通过、也绝不据此把"浏览器已验"写成已完成。
//
// 它验的东西（都是**假 DOM 验不到**的）：
//   · 侧边栏页面在**真实浏览器**里加载并渲染（真 CSS、真 DOM，`sidepanel.js` 真跑）；
//   · 真实渲染路径下的**整轮扫描 + 导出 0 次远程网络请求**（CDP `Network` 域逐条计数，只有 file:// 本地资源）；
//   · 导出按钮真正交给浏览器的 `Blob` 内容 = 离线 `exportArtifact()` 的字节（**UI 路径与核心同源**）；
//   · 同一 ScanResult 导出两次，交出去的 Blob 文本**逐字节一致**。
//
// `--shots` 额外产出 `assets/store/screenshot-*.png`（商店截图实物）。截图是**真实渲染**产物，
// 不做逐字节断言（浏览器渲染逐次会有像素级差异）——由 `tests/store-assets.test.mjs` 断言其存在与尺寸。
//
// 用法：
//   node tools/smoke-export.mjs           # 网络计数 + 真实导出字节
//   node tools/smoke-export.mjs --shots   # 追加产出商店截图
//   node tools/smoke-export.mjs --keep    # 保留浏览器进程便于排查

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RULESET } from "../src/lib/rules-pack.js";
import { exportArtifact } from "../src/lib/export.js";
import { buildScannerSource } from "./bundle.mjs";
import { STORE_DIR } from "./gen-store-icons.mjs";
import { cdpClient, evaluate, findBrowser, launch, skip, wait } from "./cdp.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL_PATH = join(ROOT, "src", "sidepanel", "index.html");
const FIXTURE_PATH = join(ROOT, "data", "fixtures", "page-01", "page.html");
const SHOT_PANEL = { width: 420, height: 900 };
const SHOT_PAGE = { width: 1000, height: 760 };

/** 转成 `file:///D:/...` 形态（三斜杠：Windows 盘符路径必须这样，Chrome 报的 url 也是这个形态）。 */
const fileUrl = (path) => `file:///${path.replace(/\\/g, "/")}`;

/** 探针：把拼接产物里的函数暴露到 window（**不改被测逻辑**，只加一段导出）。同 `smoke-overlay.mjs` 的口径。 */
function withProbe(source) {
  const marker = "\n})();\n";
  if (!source.endsWith(marker)) throw new Error("拼接产物结尾不是预期的 IIFE 收尾（探针无法注入）");
  const probe = [
    "",
    "  window.__plProbe = { collectPageModel, buildScanResult, loadRulePack, applyOverlay, clearOverlay, overlayState, RULESET, RULE_SPECS };",
    "})();",
    "",
  ].join("\n");
  return source.slice(0, source.length - marker.length) + "\n" + probe;
}

/** 侧边栏页面注入的假 chrome 运行时 + Blob 捕获（**不改被测逻辑**，只加"能看到它交出去什么"的探针）。 */
const PANEL_PROBE = `
window.__sent = [];
const __session = {};
const __local = { settings: { site_policy: { mode: "blocklist", hosts: [] }, disabled_rule_ids: [] } };
window.chrome = {
  runtime: {
    id: "smoke-extension-id",
    sendMessage: (message) => {
      window.__sent.push(message);
      if (message.type === "current-url") return Promise.resolve({ url: "https://example.invalid/p.html" });
      if (message.type === "get-last-scan") return Promise.resolve({ LastScan: __session.LastScan });
      if (message.type === "get-scan-history") return Promise.resolve({ ScanHistory: __session.ScanHistory });
      return Promise.resolve({ status: "ok" });
    },
    onMessage: { addListener: (fn) => { window.__onMessage = fn; } },
  },
  storage: {
    local: { get: async (key) => ({ [key]: __local[key] }), set: async (items) => Object.assign(__local, items) },
    session: { get: async (key) => ({ [key]: __session[key] }), set: async (items) => Object.assign(__session, items) },
  },
};
// 捕获 UI 真正交给浏览器的 Blob（即 download() 里 new Blob([text]) 的那份）。
window.__captured = [];
const __origCreateObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => { window.__captured.push(blob); return __origCreateObjectURL(blob); };
window.__anchors = [];
const __origClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () { window.__anchors.push({ download: this.download, href: this.href }); };
`;

/** 在给定 target 上取一条 page 的 CDP 客户端（含 Runtime/Page/Network 使能）。 */
async function attach(port, url) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page" && item.url === url);
  if (!target) return null;
  const client = cdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Network.enable");
  return client;
}

/**
 * 侧边栏页面：假 chrome 必须在 **文档加载前** 装好——`sidepanel.js` 的自启动守卫要求
 * `chrome.runtime.id` 存在，晚一步注入就根本不会启动（实测踩坑：晚注入 → `window.__onMessage` 不是函数）。
 */
async function preparePanel(client) {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: PANEL_PROBE });
  await client.send("Page.reload");
  await wait(900);
}

async function openTarget(port, url) {
  // `/json/new?<url>` 的 url **不做 percent-encode**（实测：编码后 target 不会被创建）。
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: "PUT" });
  return response.ok;
}

const remoteRequests = (client) =>
  client.events
    .filter((event) => event.method === "Network.requestWillBeSent")
    .map((event) => event.params?.request?.url ?? "")
    .filter((url) => /^(https?|ws|wss):/i.test(url));

async function main() {
  const keep = process.argv.includes("--keep");
  const shots = process.argv.includes("--shots");
  const browser = findBrowser();
  if (!browser) {
    skip("浏览器冒烟（导出/网络计数）", "本机未找到 Chrome / Edge");
    return;
  }

  const launched = await launch({ browser, pageUrl: fileUrl(FIXTURE_PATH) });
  const { port, version, cleanup } = launched;
  const problems = [];
  let detail = {};
  try {
    if (!version) {
      skip("浏览器冒烟（导出/网络计数）", "浏览器未在时限内就绪（拉浏览器不稳的既有实测史）");
      return;
    }
    await openTarget(port, fileUrl(PANEL_PATH));
    await wait(900);

    const fixture = await attach(port, fileUrl(FIXTURE_PATH));
    const panel = await attach(port, fileUrl(PANEL_PATH));
    if (!fixture || !panel) {
      problems.push("没能连上 fixture 页面或侧边栏页面 target");
      return finish(problems, version, detail);
    }

    // ── 1. 真实渲染路径下跑一轮扫描（页内脚本 = 真实拼接产物）──────────────────
    // 先 reload 一次：fixture 是本进程的初始页面，它的加载请求发生在 attach 之前；
    // reload 后 Network 域才真正**记全**这一轮的请求（否则"页内 0 条"是判据没生效，不是真的零）。
    await fixture.send("Page.reload");
    await wait(900);
    await evaluate(fixture, withProbe(buildScannerSource()));
    const scan = await evaluate(
      fixture,
      `(() => {
        const probe = window.__plProbe;
        const pack = probe.loadRulePack(probe.RULESET, probe.RULE_SPECS);
        const started = Date.now();
        const { nodes, truncated } = probe.collectPageModel(document, { deadline: started + 2000, now: () => Date.now() });
        const scan = probe.buildScanResult({ url: location.href, scannedAt: new Date(started).toISOString(), nodes, pack,
          elapsedMs: Math.max(0, Date.now() - started), truncated, disabledRuleIds: ["dp-fake-scarcity"] });
        window.__plScan = scan;
        return scan;
      })()`,
    );
    if (!(scan?.findings?.length > 0)) problems.push("真实浏览器里扫描产出 0 条 finding（阳性对照失败）");
    if (!(scan?.node_count > 0)) problems.push("真实浏览器里采集到 0 个节点");

    // ── 2. 侧边栏：文档加载前装假运行时 + Blob 捕获，再喂入扫描结果 ───────────
    await preparePanel(panel);
    await evaluate(panel, `typeof window.__onMessage === "function"`);
    await evaluate(panel, `window.__onMessage(${JSON.stringify({ type: "scan-result", outcome: { scan } })})`);
    await wait(200);
    const rendered = await evaluate(
      panel,
      `(() => ({
        findingCards: document.querySelectorAll(".finding").length,
        groups: document.querySelectorAll(".group").length,
        body: document.body.textContent,
        hasDisabledHint: document.body.textContent.includes("dp-fake-scarcity"),
      }))()`,
    );
    if (rendered.findingCards !== scan.findings.length) {
      problems.push(`侧边栏条目数 ${rendered.findingCards} ≠ 扫描 finding 数 ${scan.findings.length}`);
    }
    if (rendered.groups < 1) problems.push("侧边栏没渲染任何分组");
    if (!rendered.hasDisabledHint) problems.push("侧边栏未显示「已禁用规则」提示");

    // ── 3. 真实导出：点按钮 → 捕获 Blob 文本 → 与离线 exportArtifact 逐字节比对 ──
    const clickExport = (id) => evaluate(panel, `document.getElementById("${id}").click()`);
    await clickExport("export-md");
    await clickExport("export-json");
    await clickExport("export-md"); // 第二次：验双跑
    await clickExport("export-json");
    await wait(200);
    const captured = await evaluate(panel, `Promise.all(window.__captured.map((blob) => blob.text()))`, true);
    const anchors = await evaluate(panel, `window.__anchors.map((a) => a.download)`);
    detail.exportCount = Array.isArray(captured) ? captured.length : 0;

    const expectedMd = exportArtifact(scan, RULESET, "markdown");
    const expectedJson = exportArtifact(scan, RULESET, "json");
    if (!Array.isArray(captured) || captured.length !== 4) {
      problems.push(`应有 4 次导出（md/json 各两次），实际 ${Array.isArray(captured) ? captured.length : "非数组"}`);
    } else {
      const [md1, json1, md2, json2] = captured;
      if (md1 !== expectedMd.text) problems.push("Markdown 导出与离线产物不逐字一致（UI 路径 ≠ 核心）");
      if (json1 !== expectedJson.text) problems.push("JSON 导出与离线产物不逐字一致（UI 路径 ≠ 核心）");
      if (Buffer.from(md1).equals(Buffer.from(md2)) === false) problems.push("Markdown 双跑导出字节不一致");
      if (Buffer.from(json1).equals(Buffer.from(json2)) === false) problems.push("JSON 双跑导出字节不一致");
      detail.mdBytes = Buffer.byteLength(md1);
      detail.jsonBytes = Buffer.byteLength(json1);
      const names = Array.isArray(anchors) ? anchors : [];
      if (!names.some((name) => String(name).endsWith(".md"))) problems.push("导出的 <a download> 文件名未以 .md 结尾");
      if (!names.some((name) => String(name).endsWith(".json"))) problems.push("导出的 <a download> 文件名未以 .json 结尾");
    }

    // ── 4. 真实网络计数：整轮扫描 + 导出期间**零远程请求**（只有 file:// 本地资源）──
    const fixtureRemote = remoteRequests(fixture);
    const panelRemote = remoteRequests(panel);
    detail.fixtureRequests = fixture.events.filter((e) => e.method === "Network.requestWillBeSent").length;
    detail.panelRequests = panel.events.filter((e) => e.method === "Network.requestWillBeSent").length;
    if (fixtureRemote.length > 0) problems.push(`页内扫描出现远程请求：${fixtureRemote.join(", ")}`);
    if (panelRemote.length > 0) problems.push(`侧边栏导出出现远程请求：${panelRemote.join(", ")}`);

    // ── 5. 可选：产出商店截图（真实渲染）──────────────────────────────────────
    if (shots) {
      mkdirSync(STORE_DIR, { recursive: true });
      // 页内截图前先应用一次覆盖层：让截图展示"编号徽标高亮"这个招牌能力（截图完再清掉）。
      const applied = await evaluate(
        fixture,
        `(() => {
          const report = window.__plProbe.applyOverlay(window.__plScan.findings, {
            runtime: { id: "smoke", sendMessage: () => Promise.resolve({}) },
          });
          return { applied: report.applied, badges: document.getElementById("pattern-lens-overlay")?.shadowRoot?.querySelectorAll(".pl-badge").length ?? 0 };
        })()`,
      );
      await wait(300);
      const pageShot = await captureShot(fixture, SHOT_PAGE);
      await evaluate(fixture, `window.__plProbe.clearOverlay()`);
      const panelShot = await captureShot(panel, SHOT_PANEL);
      if (!pageShot || !panelShot) {
        problems.push("商店截图未能产出（captureScreenshot 失败）");
      } else {
        writeFileSync(join(STORE_DIR, "screenshot-page.png"), pageShot);
        writeFileSync(join(STORE_DIR, "screenshot-sidepanel.png"), panelShot);
        detail.shots = [pageShot.length, panelShot.length];
        detail.badges = applied?.badges ?? 0;
      }
    }

    return finish(problems, version, detail);
  } catch (error) {
    problems.push(`冒烟异常：${error.message}`);
    return finish(problems, version, detail);
  } finally {
    if (!keep) await cleanup();
    else process.stdout.write("（--keep：浏览器进程保留）\n");
  }
}

/** 固定视口截一张 PNG（确定性视口，非确定性像素——不做逐字节断言）。 */
async function captureShot(client, size) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait(250);
  const response = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  await client.send("Emulation.clearDeviceMetricsOverride");
  const data = response.result?.data ?? "";
  return data ? Buffer.from(data, "base64") : null;
}

function finish(problems, version, detail) {
  process.stdout.write("M5 浏览器冒烟（真实导出路径 + 真实网络计数）\n");
  process.stdout.write("=".repeat(64) + "\n");
  process.stdout.write(`浏览器：${version?.Browser ?? "（未取到版本）"}\n`);
  if (detail.exportCount !== undefined) {
    process.stdout.write(`导出捕获：${detail.exportCount} 次（Markdown ${detail.mdBytes ?? "?"} 字节 / JSON ${detail.jsonBytes ?? "?"} 字节）\n`);
  }
  if (detail.fixtureRequests !== undefined) {
    process.stdout.write(`网络计数：页内 ${detail.fixtureRequests} 条（全 file://）/ 侧边栏 ${detail.panelRequests} 条（全 file://）→ 远程 0\n`);
  }
  if (detail.shots) process.stdout.write(`商店截图：screenshot-page.png ${detail.shots[0]} 字节 / screenshot-sidepanel.png ${detail.shots[1]} 字节\n`);
  process.stdout.write("=".repeat(64) + "\n");
  if (problems.length > 0) {
    for (const problem of problems) process.stdout.write(`FAIL  ${problem}\n`);
    process.stdout.write(`结论: ${problems.length} 项 FAIL（浏览器已拉起，问题真实存在）\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("结论: 全绿（真实浏览器 · 真实导出 Blob 与离线产物同字节 · 双跑一致 · 整轮扫描+导出远程请求 0）\n");
  process.exitCode = 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
