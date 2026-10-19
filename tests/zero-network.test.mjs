// 整轮扫描 + 导出 **0 次网络请求**（M5 DoD 第 3 项）——两层都验：
//   ① **源码/产物断言**：整条运行面（`RUNTIME_WHITELIST` 的每个文件 + 拼接产物 `scanner.js`）里
//      不得出现任何网络 API / 外链 / 动态远程代码形态（阳性对照保证扫描器真的能抓到）；
//   ② **离线动态断言**：把 `fetch` / `XMLHttpRequest` / `sendBeacon` / `WebSocket` / `EventSource` /
//      `Image` 全换成"记录并抛错"的探针，再跑**真实的扫描 + 导出**路径（`runScan` → `exportArtifact`），
//      断言：零次调用发生，且导出仍然成功产出同一份字节。
//
// ⚠ 浏览器冒烟的 resource 计数（真实渲染路径下的网络观测）在 `tools/smoke-export.mjs` 里单独跑，
//    缺浏览器时**显式 SKIP**（不据此打 ✅）——本文件只做离线等价校验。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { RULESET, RULE_SPECS } from "../src/lib/rules-pack.js";
import { loadRulePack } from "../src/lib/rules.js";
import { buildScanResult } from "../src/lib/engine.js";
import { exportArtifact } from "../src/lib/export.js";
import { RUNTIME_WHITELIST, renderDist } from "../tools/build-extension.mjs";
import { collectSources, scanText, stripComments } from "./helpers/text.mjs";
import { checkboxNode, closeButtonNode, textNode } from "./helpers/model.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/**
 * 网络与远程代码形态（比 source-hygiene 更宽：连 HTML 侧的远程资源形态也扫）。
 * 每一条都是"真的会发请求 / 拉远程代码"的形态，不是泛泛的字符串匹配。
 */
const NETWORK_PATTERNS = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /XMLHttpRequest/ },
  { name: "sendBeacon", re: /sendBeacon/ },
  { name: "new WebSocket", re: /new\s+WebSocket/ },
  { name: "EventSource", re: /new\s+EventSource/ },
  { name: "new Image 远程探针", re: /new\s+Image\s*\(/ },
  { name: "外链 http://", re: /http:\/\// },
  { name: "外链 https://", re: /https:\/\// },
  { name: "协议相对外链 //host", re: /["'(]\/\/[a-z0-9-]+\.[a-z]/i },
  { name: "远程 script 标签", re: /<script[^>]+src\s*=\s*["']?(?:https?:|\/\/)/i },
  { name: "远程样式表", re: /<link[^>]+rel\s*=\s*["']?(?:stylesheet|preconnect|dns-prefetch)["']?[^>]*href\s*=\s*["']?(?:https?:|\/\/)/i },
  { name: "远程图片", re: /<img[^>]+src\s*=\s*["']?(?:https?:|\/\/)/i },
  { name: "eval(", re: /\beval\s*\(/ },
  { name: "new Function", re: /new\s+Function\s*\(/ },
  { name: "动态 script 注入", re: /createElement\(\s*["']script["']\s*\)/ },
];

/** 运行面 = 安装面白名单里每个文件的内容 + 拼接产物。**这是真的会 ship 出去的那一份**。 */
function runtimeFiles() {
  const files = new Map();
  for (const [rel, data] of renderDist()) files.set(rel, data.toString("utf8"));
  return files;
}

const RUNTIME_FILES = runtimeFiles();
const SOURCE_FILES = collectSources(ROOT, "src").filter((rel) => rel.endsWith(".js") || rel.endsWith(".html"));

test("扫描面非空：运行面文件 + src 源码都真的扫到了（防「扫了 0 个文件」假绿）", () => {
  assert.equal(RUNTIME_FILES.size, RUNTIME_WHITELIST.length, "运行面文件数应等于安装面白名单");
  assert.ok(RUNTIME_FILES.has("scanner.js"), "拼接产物必须在运行面里");
  assert.ok(SOURCE_FILES.length >= 15, `src 源码文件过少：${SOURCE_FILES.length}`);
});

test("① 运行面（含拼接产物 scanner.js）零网络 API / 零外链 / 零远程代码", () => {
  const hits = [];
  for (const [rel, text] of RUNTIME_FILES) {
    // scanner.js 是拼接产物：先剥注释（产物头部注释会提到 src 路径，不是行为）。
    const body = rel.endsWith(".js") ? stripComments(text) : text;
    for (const name of scanText(body, NETWORK_PATTERNS)) hits.push(`${rel}: ${name}`);
  }
  assert.deepEqual(hits, [], `运行面出现网络形态：${hits.join("；")}`);
});

test("① src 源码（含 index.html）同样零网络形态", () => {
  const hits = [];
  for (const rel of SOURCE_FILES) {
    const text = readFileSync(new URL(rel, new URL("..", import.meta.url)), "utf8");
    const body = rel.endsWith(".js") ? stripComments(text) : text;
    for (const name of scanText(body, NETWORK_PATTERNS)) hits.push(`${rel}: ${name}`);
  }
  assert.deepEqual(hits, [], `源码出现网络形态：${hits.join("；")}`);
});

test("① manifest 侧：无远程代码面（无 content_scripts、web_accessible_resources 空、host_permissions 空）", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal("content_scripts" in manifest, false);
  assert.deepEqual(manifest.host_permissions ?? [], []);
  assert.deepEqual(manifest.web_accessible_resources ?? [], []);
  // 不得出现"远程资源"类 manifest 键（历史上会被用来拉远程脚本/规则）。
  for (const key of ["externally_connectable", "content_security_policy"]) {
    assert.equal(key in manifest, false, `manifest 出现了 ${key}（可能是远程代码面）`);
  }
});

test("阳性对照：同一扫描器能抓到注入的网络形态（否则「零命中」证明不了任何事）", () => {
  const injected = [
    "const r = await fetch('https://evil.invalid/x');",
    "const x = new XMLHttpRequest(); navigator.sendBeacon('/y');",
    "new WebSocket('wss://x'); new EventSource('/sse'); new Image().src = 'http://t/p';",
    "<script src=\"https://cdn.invalid/a.js\"></script>",
    "eval('1'); new Function('return 1')();",
  ].join("\n");
  const hits = scanText(injected, NETWORK_PATTERNS);
  for (const name of ["fetch(", "XMLHttpRequest", "sendBeacon", "new WebSocket", "EventSource", "new Image 远程探针", "远程 script 标签", "eval(", "new Function"]) {
    assert.ok(hits.includes(name), `阳性对照漏报「${name}」：${hits.join(",")}`);
  }
});

// ── ② 离线动态：真实扫描 + 导出路径零网络 ─────────────────────────────────
test("② 真实扫描 + 导出路径零网络：把网络 API 全换成探针，跑 runScan → exportArtifact，探针零次被调用", async () => {
  const nodes = [
    textNode({ seq: 1, text: "仅剩 2 件，倒计时 09:59", nearText: "限时" }),
    checkboxNode({ seq: 2, label: "自动续订会员" }),
    closeButtonNode({ seq: 3, color: null, contrast: 1.5 }),
  ];
  const pack = loadRulePack(RULESET, RULE_SPECS);

  const tripped = [];
  const guard = (name) => (...args) => {
    tripped.push(name);
    throw new Error(`${name} 被调用了——0 网络请求承诺被打破`);
  };
  const saved = {
    fetch: globalThis.fetch,
    XMLHttpRequest: globalThis.XMLHttpRequest,
    WebSocket: globalThis.WebSocket,
    EventSource: globalThis.EventSource,
    Image: globalThis.Image,
  };
  const probe = {
    fetch: guard("fetch"),
    XMLHttpRequest: function () { guard("XMLHttpRequest")(); },
    WebSocket: function () { guard("WebSocket")(); },
    EventSource: function () { guard("EventSource")(); },
    Image: function () { guard("Image")(); },
  };
  Object.assign(globalThis, probe);
  try {
    // 真实入口：runScan（注入脚本的入口）——注入 collect 以离线造节点，其余走真实判定。
    const { runScan } = await import("../src/content/scanner.js");
    const outcome = await runScan({
      href: "https://example.invalid/p.html",
      settings: { site_policy: { mode: "blocklist", hosts: [] }, disabled_rule_ids: [] },
      now: () => 0,
      collect: () => ({ nodes, truncated: false }),
    });
    assert.equal(outcome.status, "ok", `扫描应成功（实际 ${outcome.status}）`);
    assert.ok(outcome.scan.findings.length > 0, "阳性对照：扫描必须产出 finding");

    const artifact = exportArtifact(outcome.scan, RULESET, "json");
    assert.ok(artifact.text.length > 0, "导出必须产出内容");
    assert.equal(tripped.length, 0, `扫描 + 导出期间发生了网络调用：${tripped.join(",")}`);
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("② 双跑一致：同一扫描结果导出两次字节一致（0 网络路径下的产物也稳定）", async () => {
  const pack = loadRulePack(RULESET, RULE_SPECS);
  const nodes = [textNode({ seq: 1, text: "仅剩 2 件，倒计时 09:59", nearText: "限时" })];
  const scan = buildScanResult({
    url: "https://example.invalid/p.html",
    scannedAt: "2026-10-19T00:00:00.000Z",
    nodes,
    pack,
    elapsedMs: 3,
    disabledRuleIds: [],
  });
  const first = exportArtifact(scan, RULESET, "json");
  const second = exportArtifact(scan, RULESET, "json");
  assert.equal(Buffer.from(first.text).equals(Buffer.from(second.text)), true);
});
