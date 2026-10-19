#!/usr/bin/env node
// content script 拼接器（自写，零第三方打包器 —— D14）：
//   content script 不能静态 import ESM，而把库文件暴露给网页（web_accessible_resources）可被指纹识别。
//   故按**显式声明的依赖序**把下列模块拼成一个经典 IIFE，规则包内联为字面量。
// 校验（任一不成立即抛错，绝不产出"拼了一半"的产物）：
//   ① 每个 import 的目标都在声明顺序里，且排在导入者**之前**（依赖序）；
//   ② 变换后不得残留行首 import/export；
//   ③ 顶层声明名不得重复（拼接顺序出错时会立刻暴露，而不是让后者静默覆盖前者）。
// 确定性：无时间戳、无随机、文件内容原样写入 → 双跑逐字节一致。
// 用法：node tools/bundle.mjs [--out dist/scanner.js]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 显式依赖序（拼接顺序即作用域顺序；改动这里必须重跑 npm test 的 build 段）。 */
export const BUNDLE_ORDER = [
  "src/lib/page-model.js",
  "src/lib/rules.js",
  "src/lib/rules-pack.js",
  "src/lib/ordering.js",
  "src/lib/engine.js",
  "src/lib/site-policy.js",
  "src/lib/copy.js",
  "src/content/collector.js",
  "src/content/overlay.js",
  "src/content/scanner.js",
];

const HEADER = [
  "/* pattern-lens · scanner bundle —— 由 tools/bundle.mjs 生成，禁止手改。",
  "   生成源：src/lib/** + src/content/**（依赖序见 tools/bundle.mjs 的 BUNDLE_ORDER）。",
  "   本文件是经典脚本（非 ESM）：content script 不能静态 import 模块。 */",
].join("\n");

const IMPORT_RE = /^[ \t]*import\s[^;]*?from\s+"([^"]+)";?[ \t]*\r?\n/gm;
const TOP_DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function transform(relPath, source) {
  const withoutImports = source.replace(IMPORT_RE, "");
  const withoutExports = withoutImports.replace(/^(export\s+)(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, "");
  if (/^[ \t]*import\s/m.test(withoutExports)) {
    throw new Error(`${relPath}: 变换后仍残留行首 import（拼接器只支持单行 import ... from "..."）`);
  }
  if (/^[ \t]*export\s/m.test(withoutExports)) {
    throw new Error(`${relPath}: 变换后仍残留行首 export（请用 export const/function 形态）`);
  }
  return withoutExports;
}

function assertDependencyOrder(sources, order) {
  const index = new Map(order.map((rel, position) => [rel, position]));
  for (const rel of order) {
    const source = sources.get(rel);
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) {
        throw new Error(`${rel}: 只允许相对 import（发现 ${specifier}）——扩展里不能有裸模块依赖`);
      }
      const target = relative(ROOT, resolve(ROOT, dirname(rel), specifier)).replace(/\\/g, "/");
      if (!index.has(target)) throw new Error(`${rel}: import 的 ${target} 不在 BUNDLE_ORDER 里`);
      if (index.get(target) >= index.get(rel)) {
        throw new Error(`${rel}: 依赖序错误——${target} 必须排在它之前`);
      }
    }
  }
}

function assertUniqueDeclarations(bodies, order) {
  const seen = new Map();
  order.forEach((rel, position) => {
    const body = bodies[position];
    for (const match of body.matchAll(TOP_DECL_RE)) {
      const name = match[1];
      if (seen.has(name)) {
        throw new Error(`顶层声明名重复：${name}（${seen.get(name)} 与 ${rel}）——拼接顺序或命名需要处理`);
      }
      seen.set(name, rel);
    }
  });
}

export function buildScannerSource() {
  const sources = new Map();
  for (const rel of BUNDLE_ORDER) {
    sources.set(rel, readFileSync(join(ROOT, rel), "utf8"));
  }
  assertDependencyOrder(sources, BUNDLE_ORDER);
  const bodies = BUNDLE_ORDER.map((rel) => transform(rel, sources.get(rel)));
  assertUniqueDeclarations(bodies, BUNDLE_ORDER);

  const parts = [HEADER, "(function () {", '"use strict";', ""];
  BUNDLE_ORDER.forEach((rel, position) => {
    parts.push(`// ── ${rel} ─────────────────────────────────────────────`);
    parts.push(bodies[position].replace(/\s*$/, ""));
    parts.push("");
  });
  parts.push("})();");
  parts.push("");
  return parts.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : "dist/scanner.js";
  if (outIndex >= 0 && !out) {
    process.stderr.write("用法: node tools/bundle.mjs [--out dist/scanner.js]\n");
    process.exitCode = 2;
    return;
  }
  try {
    const source = buildScannerSource();
    const target = resolve(ROOT, out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
    process.stdout.write(`已拼接 ${BUNDLE_ORDER.length} 个模块 → ${out}（${Buffer.byteLength(source)} 字节）\n`);
  } catch (error) {
    process.stderr.write(`拼接失败：${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
