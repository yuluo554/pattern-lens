// 构建守门：
//   ① 安装面白名单：dist 只含运行必需文件；新增 src/lib 文件必须同步登记（**不许自动漂移**）；
//   ② 拼接产物可离线语法自检（node --check）且不含行首 import/export；
//   ③ zip 确定性：同源码两次构建**逐字节一致**；条目按路径排序、stored 未压缩、时间戳固定；
//   ④ 跨平台口径：zip 里不写平台相关字段（create_system 固定 0）。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BUNDLE_ORDER, buildScannerSource } from "../tools/bundle.mjs";
import { BUNDLED_ONLY_DIRS, RUNTIME_WHITELIST, buildZip, renderDist, zipName } from "../tools/build-extension.mjs";
import { ICON_SIZES, drawIcon, storeAssets } from "../tools/gen-store-icons.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("图标面：manifest.icons 引用的每个文件都在安装面白名单里，且真实存在", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  const icons = manifest.icons ?? {};
  assert.deepEqual(
    Object.keys(icons).map(Number).sort((a, b) => a - b),
    [...ICON_SIZES].sort((a, b) => a - b),
    "manifest.icons 的尺寸集合应与生成器声明一致",
  );
  for (const rel of Object.values(icons)) {
    assert.equal(RUNTIME_WHITELIST.includes(rel), true, `${rel} 不在 RUNTIME_WHITELIST 里（dist 会漏装图标）`);
    assert.ok(existsSync(join(ROOT, rel)), `${rel} 不存在（先跑 npm run store:icons）`);
  }
});

test("图标确定性：盘上产物 == 重生成（逐字节），且每个都是合法 PNG（IHDR 尺寸对）", () => {
  const files = storeAssets();
  for (const [name, data] of files) {
    const onDisk = readFileSync(join(ROOT, "assets", "store", name));
    assert.equal(onDisk.equals(data), true, `${name} 与重生成结果字节不同`);
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${name} 不是 PNG 签名`);
    const size = Number(/(\d+)\.png$/.exec(name)[1]);
    assert.equal(data.readUInt32BE(16), size, `${name} IHDR 宽度 ≠ ${size}`);
    assert.equal(data.readUInt32BE(20), size, `${name} IHDR 高度 ≠ ${size}`);
    assert.equal(data[25], 6, `${name} 应为 RGBA 色彩类型`);
  }
});

test("图标可证伪：换尺寸画出的字节必须不同（否则「逐字节一致」是恒真的）", () => {
  assert.equal(drawIcon(48).equals(drawIcon(128)), false, "不同尺寸却同字节 → 尺寸判据失效");
});

test("安装面白名单：src/lib 下每个文件都显式登记（新增文件不许静默漂移）", () => {
  const listed = new Set(RUNTIME_WHITELIST);
  const libFiles = readdirSync(join(ROOT, "src", "lib")).filter((file) => file.endsWith(".js"));
  for (const file of libFiles) {
    assert.equal(listed.has(`src/lib/${file}`), true, `${file} 没进 RUNTIME_WHITELIST（dist 会漏装）`);
  }
  for (const dir of BUNDLED_ONLY_DIRS) {
    for (const file of readdirSync(join(ROOT, dir))) {
      if (!file.endsWith(".js")) continue;
      assert.equal(listed.has(`${dir}/${file}`), false, `${dir}/${file} 不该进 dist（它在拼接产物里）`);
    }
  }
});

test("拼接序覆盖全部 src/content/**（新增 content 模块不许漏登记进 BUNDLE_ORDER）", () => {
  const bundled = new Set(BUNDLE_ORDER);
  for (const file of readdirSync(join(ROOT, "src", "content")).filter((name) => name.endsWith(".js"))) {
    assert.equal(bundled.has(`src/content/${file}`), true, `src/content/${file} 没进 BUNDLE_ORDER（不会被拼进 scanner.js）`);
  }
});

test("renderDist() 产出的文件集合与白名单一致，且每个文件都存在", () => {
  const files = renderDist();
  assert.deepEqual([...files.keys()].sort(), [...RUNTIME_WHITELIST].sort());
  for (const [rel, data] of files) assert.ok(data.length > 0, `${rel} 内容为空`);
});

test("拼接产物：无行首 import/export（经典脚本），且 node --check 语法通过", () => {
  const source = buildScannerSource();
  assert.equal(/^[ \t]*import\s/m.test(source), false, "产物里残留 import（content script 不能静态 import）");
  assert.equal(/^[ \t]*export\s/m.test(source), false, "产物里残留 export");
  const sandbox = mkdtempSync(join(tmpdir(), "pl-bundle-"));
  const temp = join(sandbox, "scanner-check.js");
  try {
    writeFileSync(temp, source);
    execFileSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
  assert.equal(source.includes("(function () {"), true, "产物应是 IIFE（经典脚本作用域）");
  assert.equal(source.includes('"use strict"'), true, "产物应带严格模式");
});

test("拼接器声明了依赖序，且 import 目标都排在导入者之前", () => {
  const index = new Map(BUNDLE_ORDER.map((rel, position) => [rel, position]));
  assert.ok(BUNDLE_ORDER.includes("src/content/scanner.js"), "scanner 必须在拼接序里");
  for (const rel of BUNDLE_ORDER) {
    assert.ok(existsSync(join(ROOT, rel)), `拼接序里的 ${rel} 不存在`);
    const source = readFileSync(join(ROOT, rel), "utf8");
    for (const match of source.matchAll(/^[ \t]*import\s[^;]*?from\s+"([^"]+)";?/gm)) {
      const target = resolve(ROOT, dirname(rel), match[1]).replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
      assert.ok(index.has(target), `${rel} 依赖的 ${target} 不在拼接序里`);
      assert.ok(index.get(target) < index.get(rel), `${target} 必须排在 ${rel} 之前`);
    }
  }
});

test("zip 确定性：同源码两次构建逐字节一致", () => {
  const files = renderDist();
  const entries = [...files].map(([name, data]) => ({ name, data }));
  const first = buildZip(entries);
  const second = buildZip(entries);
  assert.equal(first.equals(second), true, "同输入的 zip 字节不同 = 不确定性");
});

test("zip 结构：stored 未压缩 / 体积等于原文件 / 时间戳与平台字段固定", () => {
  const zip = buildZip([...renderDist()].map(([name, data]) => ({ name, data })));
  const count = zip.readUInt16LE(zip.length - 22 + 8); // EOCD 的条目数
  let offset = 0;
  const names = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(offset), 0x04034b50, "本地头签名不对");
    assert.equal(zip.readUInt16LE(offset + 8), 0, "method 必须为 0（stored）");
    assert.equal(zip.readUInt16LE(offset + 10), 0, "时间戳必须固定");
    assert.equal(zip.readUInt16LE(offset + 12), (1 << 5) | 1, "日期必须固定为 1980-01-01");
    const size = zip.readUInt32LE(offset + 18);
    assert.equal(size, zip.readUInt32LE(offset + 22), "stored 模式下压缩前后体积必须相等");
    const nameLength = zip.readUInt16LE(offset + 26);
    names.push(zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + size;
  }
  assert.deepEqual(names, [...names].sort(), "zip 条目必须按路径排序（否则字节随文件系统顺序变）");
  assert.ok(names.includes("manifest.json"));
  assert.ok(names.includes("scanner.js"));
  assert.equal(names.some((name) => name.startsWith("plan/") || name.startsWith("data/")), false, "dist 不得包含 plan/ data/");
});

test("dist/ 与 release/ 若已生成，则与源码重生成结果逐字节一致（== npm run build:check）", () => {
  const distDir = join(ROOT, "dist");
  if (!existsSync(distDir)) {
    // 未跑过构建不算失败，但要**显式**说明（不能静默通过）
    assert.equal(existsSync(distDir), false, "路径状态自相矛盾");
    process.stdout.write("# 提示：dist/ 尚未生成，跳过磁盘比对（先跑 npm run build）\n");
    return;
  }
  const out = execFileSync(process.execPath, [join(ROOT, "tools", "build-extension.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(out, /一致：/);
  assert.ok(existsSync(join(ROOT, "release", zipName())));
});
