#!/usr/bin/env node
// 规则包哈希与 ESM 生成物（单点）：
//   rules/*.json ──► 计算 ruleset_hash ──► 写回 rules/manifest.json
//                                        └─► 生成 src/lib/rules-pack.js（**生成物，禁止手编**）
// 用法：
//   node tools/hash-rules.mjs            重新生成（写盘）
//   node tools/hash-rules.mjs --check    只核对（不写盘；不一致 → exit 1，逐项报出差异）
// 退出码：0 一致 / 1 不一致 / 2 用法或数据错误

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonText, orderedJsonText } from "../src/lib/serialize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RULES_DIR = join(ROOT, "rules");
const MANIFEST_PATH = join(RULES_DIR, "manifest.json");
const PACK_PATH = join(ROOT, "src", "lib", "rules-pack.js");

const PACK_HEADER = [
  "// 生成物：由 tools/hash-rules.mjs 产出，禁止手改。",
  "// 内容 = rules/manifest.json 与 rules/dp-*.json 的原样副本；核对命令：npm run rules:hash -- --check",
  "",
].join("\n");

function computeHash(manifest, specs) {
  // 哈希面 = 规则文件内容（按文件名排序的规范化 JSON）+ 影响判定的 manifest 字段。
  // 刻意**排除** ruleset_hash 自身（自指会让哈希永远算不出来）。
  const parts = specs.map((spec) => canonicalJsonText(spec));
  const judged = {
    severity_levels: manifest.severity_levels,
    categories: manifest.categories,
    thresholds: manifest.thresholds,
    match_priority: manifest.match_priority,
    sort: manifest.sort,
    evidence_kinds: manifest.evidence_kinds,
    detect_keys: manifest.detect_keys,
    style_keys: manifest.style_keys,
  };
  parts.push(canonicalJsonText(judged));
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

function readRules() {
  if (!existsSync(MANIFEST_PATH)) throw new Error("缺 rules/manifest.json");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(manifest.rule_files) || manifest.rule_files.length === 0) {
    throw new Error("rules/manifest.json 的 rule_files 为空");
  }
  const specs = manifest.rule_files.map((file) => {
    const path = join(RULES_DIR, file);
    if (!existsSync(path)) throw new Error(`缺规则文件 rules/${file}`);
    return JSON.parse(readFileSync(path, "utf8"));
  });
  return { manifest, specs };
}

function renderManifest(manifest, hash) {
  return orderedJsonText({ ...manifest, ruleset_hash: hash }, 2);
}

function renderPack(manifest, specs) {
  const lines = [PACK_HEADER];
  lines.push(`export const RULESET = ${JSON.stringify(manifest, null, 2)};`);
  lines.push("");
  lines.push(`export const RULE_SPECS = ${JSON.stringify(specs, null, 2)};`);
  lines.push("");
  return lines.join("\n");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write(`用法: node tools/hash-rules.mjs [--check]\n`);
    process.exitCode = 2;
    return;
  }

  let manifest;
  let specs;
  try {
    ({ manifest, specs } = readRules());
  } catch (error) {
    process.stderr.write(`数据错误：${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const hash = computeHash(manifest, specs);
  const nextManifestText = renderManifest(manifest, hash);
  const nextPackText = renderPack({ ...manifest, ruleset_hash: hash }, specs);

  const currentManifestText = readFileSync(MANIFEST_PATH, "utf8");
  const currentPackText = existsSync(PACK_PATH) ? readFileSync(PACK_PATH, "utf8") : "";

  const diffs = [];
  if (currentManifestText !== nextManifestText) diffs.push("rules/manifest.json（ruleset_hash 或格式）");
  if (currentPackText !== nextPackText) diffs.push("src/lib/rules-pack.js（生成物过期）");

  if (checkOnly) {
    process.stdout.write(`规则包哈希（重算）：${hash}\n`);
    process.stdout.write(`扫到规则 ${specs.length} 条 / 阈值 ${Object.keys(manifest.thresholds ?? {}).length} 项\n`);
    if (diffs.length > 0) {
      process.stdout.write(`不一致：${diffs.join("；")}——跑 npm run rules:hash 重新生成\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write("一致：manifest 与 rules-pack.js 与规则文件逐字节对应\n");
    return;
  }

  mkdirSync(dirname(PACK_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, nextManifestText);
  writeFileSync(PACK_PATH, nextPackText);
  process.stdout.write(`已写入 ruleset_hash=${hash}\n`);
  process.stdout.write(`已生成 src/lib/rules-pack.js（${specs.length} 条规则）\n`);
}

main();
