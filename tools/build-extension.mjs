#!/usr/bin/env node
// 组装可 Load unpacked 的扩展树 + 确定性 zip（M6 的发布附件）。
// 安装面白名单：dist 只含**运行必需**文件（plan/ 与 data/ 与 tests/ 与 tools/ 与 docs/ 一律不进）。
// zip 确定性口径（plan/03 §五）：ZIP_STORED + create_system=0 + 固定时间戳 (1980-01-01) + 条目按路径排序
//   —— 跨平台（Windows 生成 / ubuntu CI 重生成）逐字节一致，故配 --check 守门。
// 用法：node tools/build-extension.mjs [--check]

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildScannerSource, ROOT } from "./bundle.mjs";

export const DIST_DIR = join(ROOT, "dist");
export const RELEASE_DIR = join(ROOT, "release");

/** 固定清单：新增 src/lib 文件必须同时加到这里（tests/build.test.mjs 会核对，别指望"自动"）。 */
export const RUNTIME_WHITELIST = [
  "manifest.json",
  "scanner.js",
  "src/background/service-worker.js",
  "src/lib/copy.js",
  "src/lib/engine.js",
  "src/lib/export.js",
  "src/lib/ordering.js",
  "src/lib/page-model.js",
  "src/lib/rng.js",
  "src/lib/rules-pack.js",
  "src/lib/rules.js",
  "src/lib/serialize.js",
  "src/lib/site-policy.js",
  "src/sidepanel/index.html",
  "src/sidepanel/sidepanel.css",
  "src/sidepanel/sidepanel.js",
];

/** 不进 dist 的源码目录（content/* 已被拼接进 scanner.js）。 */
export const BUNDLED_ONLY_DIRS = ["src/content"];

const ZIP_TIME = 0; // 00:00:00
const ZIP_DATE = ((1980 - 1980) << 9) | (1 << 5) | 1; // 1980-01-01

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 最小的 ZIP 写入器（stored，无压缩，无扩展字段）——避免任何平台相关的字节。 */
export function buildZip(entries) {
  const items = [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const item of items) {
    const name = Buffer.from(item.name, "utf8");
    const data = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // method = stored
    local.writeUInt16LE(ZIP_TIME, 10);
    local.writeUInt16LE(ZIP_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4); // version made by：高字节 create_system = 0（MS-DOS）
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(ZIP_TIME, 12);
    directory.writeUInt16LE(ZIP_DATE, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38); // external attrs 固定 0
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(items.length, 8);
  eocd.writeUInt16LE(items.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, eocd]);
}

export function extensionVersion() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  return manifest.version;
}

export function zipName() {
  return `pattern-lens-${extensionVersion()}.zip`;
}

/** 产出 dist 的完整文件集合（路径 → 内容 Buffer）。 */
export function renderDist() {
  const files = new Map();
  files.set("scanner.js", Buffer.from(buildScannerSource(), "utf8"));
  for (const rel of RUNTIME_WHITELIST) {
    if (rel === "scanner.js") continue;
    const path = join(ROOT, rel);
    if (!existsSync(path)) throw new Error(`安装面白名单里的文件不存在：${rel}`);
    files.set(rel, readFileSync(path));
  }
  const listed = new Set(RUNTIME_WHITELIST);
  for (const file of readdirSync(join(ROOT, "src", "lib"))) {
    if (!file.endsWith(".js")) continue;
    const rel = `src/lib/${file}`;
    if (!listed.has(rel)) throw new Error(`新增了 ${rel} 但没加进 RUNTIME_WHITELIST（安装面必须显式）`);
  }
  return files;
}

function writeTree(dir, files) {
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, data] of files) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
}

function readTree(dir) {
  const out = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.set(relative(dir, path).replace(/\\/g, "/"), readFileSync(path));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function compare(name, expected, actual) {
  const diffs = [];
  for (const [rel, data] of expected) {
    if (!actual.has(rel)) diffs.push(`${rel}: 缺失`);
    else if (!actual.get(rel).equals(data)) diffs.push(`${rel}: 字节不同`);
  }
  for (const rel of actual.keys()) {
    if (!expected.has(rel)) diffs.push(`${rel}: 多余`);
  }
  if (diffs.length > 0) {
    process.stdout.write(`${name} 不一致（${diffs.length} 处）：\n- ${diffs.join("\n- ")}\n`);
    return false;
  }
  const bytes = [...expected.values()].reduce((sum, data) => sum + data.length, 0);
  process.stdout.write(`${name} 一致：${expected.size} 个文件 / ${bytes} 字节\n`);
  return true;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write("用法: node tools/build-extension.mjs [--check]\n");
    process.exitCode = 2;
    return;
  }

  let files;
  try {
    files = renderDist();
  } catch (error) {
    process.stderr.write(`组装失败：${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  const zip = buildZip([...files].map(([name, data]) => ({ name, data })));

  if (!checkOnly) {
    writeTree(DIST_DIR, files);
    mkdirSync(RELEASE_DIR, { recursive: true });
    writeFileSync(join(RELEASE_DIR, zipName()), zip);
    process.stdout.write(`已产出 dist/（${files.size} 个文件）与 release/${zipName()}（${zip.length} 字节）\n`);
    return;
  }

  const zipPath = join(RELEASE_DIR, zipName());
  const diskZip = existsSync(zipPath) ? new Map([[zipName(), readFileSync(zipPath)]]) : new Map();
  const okTree = compare("dist/", files, readTree(DIST_DIR));
  const okZip = compare("zip", new Map([[zipName(), zip]]), diskZip);
  if (!okTree || !okZip) {
    process.stdout.write("结论：产物与重生成结果不一致（跑 npm run build 重新生成）\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write("结论：dist/ 与 zip 均可由源码逐字节重生成（确定性成立）\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
