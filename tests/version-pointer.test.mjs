// README 版本指针守门（SI-048）。
//
// 背景（2026-10-25 实测）：`v0.2.0` 的 tag 树里 README 三处发布指针仍指 `v0.1.0` ——
//   `:23` 「当前状态：M0–M6 全部完成（v0.1.0 已发布）」
//   `:28` 「M6 起已发布（[Release v0.1.0](.../releases/tag/v0.1.0)」
//   `:48` 「方式二：从 [Release](.../releases/tag/v0.1.0) 下载 zip」
// 而 `package.json` 是 0.2.0、Release v0.2.0 确实存在（附件 pattern-lens-0.2.0.zip）。
// 用户照 `:48` 走会下载到 v0.1.0 的 zip。
//
// ⚠ 刻意**不**改 `:21`：那是里程碑历史行
//   「| M6 | 发布：公开仓库 + `v0.1.0` tag + Release（确定性 zip）+ 发布留档 | ✅ 2026-10-19 |」
// 它记的是「M6 那一刻发布了什么」（v0.1.0 时该行是 ⬜ 未开始，v0.2.0 时才打 ✅），
// 改成 v0.2.0 就是篡改历史。本门因此**显式豁免表格行**，并在负控里钉死这个豁免。
//
// 判据（定位到声明性那一行，不做全文存在性判断 —— presence ≠ correctness）：
//   ① README 里「（vX.Y.Z 已发布）」形态的**当前状态**表述 == 当前版本；
//   ② README 里「从 Release ... 下载」句式的 Release 链接 == 当前版本；
//   ③ 「M6 起已发布」句里的 Release 链接 == 当前版本；
//   ④ 负控：喂旧版本必须报错；表格里程碑行即使含旧版本也**不得**报错。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = PKG.version;

const MD_TABLE_ROW = /^\s*\|/;

/** ① 「（vX.Y.Z 已发布）」当前状态表述 */
export function auditCurrentState(text, version) {
  const problems = [];
  let found = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    if (MD_TABLE_ROW.test(line)) return; // 里程碑历史行豁免
    const matches = line.matchAll(/v(\d+\.\d+\.\d+)\s*已发布/g);
    for (const match of matches) {
      found += 1;
      if (match[1] !== version) {
        problems.push(`:${index + 1} 「v${match[1]} 已发布」期望 v${version}`);
      }
    }
  });
  if (found === 0) {
    problems.push("README 找不到「vX.Y.Z 已发布」当前状态表述（扫描面为空）");
  }
  return problems;
}

/** ② 「从 Release ... 下载」句式里的 Release 链接 */
export function auditDownloadSentence(text, version) {
  const problems = [];
  let found = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    if (MD_TABLE_ROW.test(line)) return;
    if (!/下载/.test(line)) return;
    for (const match of line.matchAll(/releases\/tag\/v(\d+\.\d+\.\d+)/g)) {
      found += 1;
      if (match[1] !== version) {
        problems.push(`:${index + 1} 下载句的 Release 链接 = v${match[1]}，期望 v${version}`);
      }
    }
  });
  if (found === 0) {
    problems.push("README 找不到「下载 … Release 链接」句式（扫描面为空）");
  }
  return problems;
}

/** ③ 「M6 起已发布」句里的 Release 链接 */
export function auditReleasedSinceSentence(text, version) {
  const problems = [];
  let found = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    if (MD_TABLE_ROW.test(line)) return;
    if (!/已发布/.test(line)) return;
    for (const match of line.matchAll(/releases\/tag\/v(\d+\.\d+\.\d+)/g)) {
      found += 1;
      if (match[1] !== version) {
        problems.push(`:${index + 1} 「已发布」句的 Release 链接 = v${match[1]}，期望 v${version}`);
      }
    }
  });
  if (found === 0) {
    problems.push("README 找不到「已发布 … Release 链接」句式（扫描面为空）");
  }
  return problems;
}

test("README 当前状态表述的版本 == package.json version", () => {
  assert.deepEqual(auditCurrentState(README, VERSION), []);
});

test("README 下载句的 Release 链接 == 当前版本", () => {
  assert.deepEqual(auditDownloadSentence(README, VERSION), []);
});

test("README「已发布」句的 Release 链接 == 当前版本", () => {
  assert.deepEqual(auditReleasedSinceSentence(README, VERSION), []);
});

test("负控：当前状态表述喂旧版本必须报错", () => {
  const stale = "> **当前状态：M0–M6 全部完成（v0.9.8 已发布）**";
  assert.notDeepEqual(auditCurrentState(stale, "0.9.9"), []);
  assert.deepEqual(auditCurrentState("（v0.9.9 已发布）", "0.9.9"), []);
});

test("负控：下载句喂旧版本必须报错", () => {
  const stale =
    "**方式二：从 [Release](https://github.com/o/r/releases/tag/v0.9.8) 下载 zip**";
  assert.notDeepEqual(auditDownloadSentence(stale, "0.9.9"), []);
  assert.deepEqual(auditDownloadSentence(stale.replace("0.9.8", "0.9.9"), "0.9.9"), []);
});

test("负控：「已发布」句喂旧版本必须报错", () => {
  const stale = "> **M6 起已发布**（[Release v0.9.8](https://x/releases/tag/v0.9.8)，";
  assert.notDeepEqual(auditReleasedSinceSentence(stale, "0.9.9"), []);
});

test("负控：里程碑表格行即使含旧版本也**不**报错（:21 是历史，不许动）", () => {
  const milestone =
    "| M6 | 发布：公开仓库 + `v0.1.0` tag + Release（确定性 zip）+ 发布留档 | ✅ 2026-10-19 |";
  assert.deepEqual(auditCurrentState(milestone, "0.2.0"), [
    "README 找不到「vX.Y.Z 已发布」当前状态表述（扫描面为空）",
  ]);
  // ↑ 表格行被豁免 ⇒ 它自己不含问题条目；「扫描面为空」是这一行的正常结论
  assert.ok(!auditCurrentState(milestone, "0.2.0").some((p) => p.includes("v0.1.0")));
});

test("负控：扫描面为空时门会红（删掉声明不能变绿）", () => {
  assert.notDeepEqual(auditCurrentState("无关内容", "0.9.9"), []);
  assert.notDeepEqual(auditDownloadSentence("无关内容", "0.9.9"), []);
  assert.notDeepEqual(auditReleasedSinceSentence("无关内容", "0.9.9"), []);
});
