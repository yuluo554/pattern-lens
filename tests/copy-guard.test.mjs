// 文案守门：
//   ① 禁用词扫描（阴性样本必须**不含针**，故配阳性对照：扫描器必须能抓到注入的禁用词）；
//   ② "可疑模式（待核对）"只在 src/lib/copy.js 里定义一次（文案单点，UI 不许手写第二份）；
//   ③ 空结果文案是"未发现符合规则的证据"，不是定性结论。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COPY } from "../src/lib/copy.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPY_FILE = "src/lib/copy.js";

function collectSources(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) collectSources(rel, out);
    else out.push(rel);
  }
  return out;
}

/** 扫描器（纯函数）：返回命中清单——测试用同一函数做阴性 + 阳性两侧。 */
export function scanForWords(text, words) {
  return words.filter((word) => text.includes(word));
}

const SRC_FILES = collectSources("src").filter((rel) => rel !== COPY_FILE);

test("禁用词扫描面非空（防「扫了 0 个文件」伪装成「扫干净」）", () => {
  assert.ok(SRC_FILES.length >= 10, `扫描面过小：${SRC_FILES.length}`);
  for (const rel of SRC_FILES) assert.equal(statSync(join(ROOT, rel)).isFile(), true);
});

test("src/ 里（copy.js 之外）不出现任何禁用词", () => {
  const hits = [];
  for (const rel of SRC_FILES) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const word of scanForWords(text, COPY.bannedWords)) hits.push(`${rel}: ${word}`);
  }
  assert.deepEqual(hits, [], `出现禁用词：${hits.join("；")}`);
});

test("阳性对照：同一扫描器能抓到注入的禁用词（否则上面的空结果证明不了任何事）", () => {
  const injected = `这是一段${COPY.bannedWords[0]}文本，还有${COPY.bannedWords[1]}`;
  const hits = scanForWords(injected, COPY.bannedWords);
  assert.deepEqual(hits, [COPY.bannedWords[0], COPY.bannedWords[1]]);
  assert.ok(COPY.bannedWords.length >= 5, "词表过小，阳性对照覆盖面不足");
});

test("「可疑模式（待核对）」只在 copy.js 里定义（UI 不得手写第二份文案）", () => {
  const owners = SRC_FILES.filter((rel) => readFileSync(join(ROOT, rel), "utf8").includes("可疑模式"));
  assert.deepEqual(owners, [], `这些文件里手写了固定文案：${owners.join(", ")}`);
  assert.equal(readFileSync(join(ROOT, COPY_FILE), "utf8").includes(COPY.pendingCheck), true);
});

test("空结果文案是「未发现符合规则的证据」，且不是定性结论", () => {
  assert.equal(COPY.emptyResult, "本页未发现符合规则的证据");
  for (const word of ["安全", "无风险", "正常", "没问"]) {
    assert.equal(COPY.emptyResult.includes(word), false, `空态文案不得含「${word}」`);
  }
});

test("侧边栏只从 copy.js 取文案（至少用到 COPY.* 而非裸字符串）", () => {
  const sidepanel = readFileSync(join(ROOT, "src", "sidepanel", "sidepanel.js"), "utf8");
  assert.ok(sidepanel.includes("COPY."), "sidepanel 应从 copy.js 取文案");
  const statusLine = sidepanel.includes("COPY.emptyResult");
  assert.equal(statusLine, true, "空态必须用 copy.js 的固定文案");
});
