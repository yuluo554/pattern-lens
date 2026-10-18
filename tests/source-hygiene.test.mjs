// 源码卫生（只读纪律 + 零网络 + 零远程代码）：
//   ① src/** 不得出现外链、网络 API、动态代码执行；
//   ② src/lib/** 是**纯核心**：不得出现 chrome / document / window（否则无法离线基准，M1/M2 会骗人）；
//   ③ src/content/** 不得写宿主页面（innerHTML / document.head / style 赋值 / 点击）；
//   ④ lib 内部只允许相对 import，且目标真实存在（拼接器的依赖序前提）；
//   ⑤ 阳性对照：同一扫描器能抓到注入的违规串。
//
// ⚠ 判据只落仓库内文件，且扫描面要报出"扫了几个文件"（防假绿）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectSources, scanText, stripComments } from "./helpers/text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const NETWORK_PATTERNS = [
  { name: "外链 http://", re: /http:\/\// },
  { name: "外链 https://", re: /https:\/\// },
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /XMLHttpRequest/ },
  { name: "sendBeacon", re: /sendBeacon/ },
  { name: "WebSocket", re: /new\s+WebSocket/ },
  { name: "eval(", re: /\beval\s*\(/ },
  { name: "new Function", re: /new\s+Function\s*\(/ },
  { name: "动态脚本注入", re: /createElement\(\s*["']script["']\s*\)/ },
];

const CORE_PURITY_PATTERNS = [
  { name: "chrome API", re: /\bchrome\b/ },
  { name: "document", re: /\bdocument\b/ },
  { name: "window", re: /\bwindow\b/ },
];

const READ_ONLY_PATTERNS = [
  { name: "innerHTML 赋值", re: /\.innerHTML\s*=/ },
  { name: "outerHTML 赋值", re: /\.outerHTML\s*=/ },
  { name: "写宿主 head", re: /document\.head\s*\./ },
  { name: "document.write", re: /document\.write\s*\(/ },
  { name: "setAttribute", re: /\.setAttribute\s*\(/ },
  { name: "style 属性赋值", re: /\.style\.[A-Za-z]+\s*=/ },
  { name: "程序化点击", re: /\.click\s*\(/ },
  { name: "现代剪贴板 API", re: /navigator\.clipboard/ },
];

const SRC_FILES = collectSources(ROOT, "src");
const LIB_FILES = SRC_FILES.filter((rel) => rel.startsWith("src/lib/"));
const CONTENT_FILES = SRC_FILES.filter((rel) => rel.startsWith("src/content/"));

const readRaw = (rel) => readFileSync(join(ROOT, rel), "utf8");
const read = (rel) => stripComments(readRaw(rel));

test("扫描面非空：src/lib 与 src/content 都真的扫到了文件", () => {
  assert.ok(SRC_FILES.length >= 12, `src 文件过少：${SRC_FILES.length}`);
  assert.ok(LIB_FILES.length >= 8, `src/lib 文件过少：${LIB_FILES.length}`);
  assert.ok(CONTENT_FILES.length >= 2, `src/content 文件过少：${CONTENT_FILES.length}`);
});

test("零外链 / 零网络 API / 零动态代码（MV3 无远程代码硬约束）", () => {
  const hits = [];
  for (const rel of SRC_FILES) {
    for (const name of scanText(read(rel), NETWORK_PATTERNS)) hits.push(`${rel}: ${name}`);
  }
  assert.deepEqual(hits, [], `违规：${hits.join("；")}`);
});

test("src/lib/** 是纯核心（无 chrome / document / window）", () => {
  const hits = [];
  for (const rel of LIB_FILES) {
    for (const name of scanText(read(rel), CORE_PURITY_PATTERNS)) hits.push(`${rel}: ${name}`);
  }
  assert.deepEqual(hits, [], `纯核心被污染：${hits.join("；")}`);
});

test("src/content/** 只读宿主页面（不写 DOM、不点击）", () => {
  const hits = [];
  for (const rel of CONTENT_FILES) {
    for (const name of scanText(read(rel), READ_ONLY_PATTERNS)) hits.push(`${rel}: ${name}`);
  }
  assert.deepEqual(hits, [], `违反只读纪律：${hits.join("；")}`);
});

test("src/lib/** 之间只允许相对 import，且目标文件真实存在", () => {
  const problems = [];
  for (const rel of LIB_FILES) {
    const source = read(rel);
    for (const match of source.matchAll(/^[ \t]*import\s[^;]*?from\s+"([^"]+)";?/gm)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) {
        problems.push(`${rel}: 非相对 import（${specifier}）`);
        continue;
      }
      const target = resolve(ROOT, dirname(rel), specifier);
      if (!existsSync(target)) problems.push(`${rel}: import 目标不存在（${specifier}）`);
    }
  }
  assert.deepEqual(problems, [], problems.join("；"));
});

test("阳性对照：同一扫描器能抓到注入的违规串（否则「零命中」证明不了任何事）", () => {
  const injected = "const url = 'https://evil.invalid/x'; fetch(url); document.head.append(1); el.innerHTML = 'x';";
  const hits = scanText(injected, [...NETWORK_PATTERNS, ...READ_ONLY_PATTERNS]);
  assert.ok(hits.length >= 4, `阳性对照命中过少：${hits.join(",")}`);
  assert.ok(scanText("const text = 'chrome';", CORE_PURITY_PATTERNS).includes("chrome API"));
});

test("剥注释不改判定力：剥离后仍是代码，且注入的真违规仍被抓住（剥离函数自证）", () => {
  for (const rel of SRC_FILES.filter((file) => file.endsWith(".js"))) {
    const stripped = read(rel);
    assert.ok(
      stripped.includes("export ") || stripped.includes("function ") || stripped.includes("const "),
      `${rel}: 剥离注释后没有代码了（剥离函数吃空整段 → 判据会假绿）`,
    );
  }
  assert.ok(scanText(stripComments("const x = runtimeOf(chrome);\n// 这里提一句 chrome"), CORE_PURITY_PATTERNS).includes("chrome API"));
  assert.deepEqual(scanText(stripComments("// 只在注释里提 chrome\nconst a = 1;"), CORE_PURITY_PATTERNS), []);
});

test("manifest 与内容脚本的注入面一致：只按需注入，无声明式 content_scripts", () => {
  const manifest = JSON.parse(readRaw("manifest.json"));
  assert.equal("content_scripts" in manifest, false);
  const worker = read("src/background/service-worker.js");
  assert.ok(worker.includes("chrome.scripting.executeScript"), "SW 应按需注入");
  assert.equal(/content_scripts/.test(worker), false);
});
