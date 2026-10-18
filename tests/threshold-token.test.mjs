// 阈值 token 门禁（M2 补门；K1 的机器判据，`plan/05` §六）：
//   数值阈值只在 `rules/manifest.json` 定义——`src/**` 与 `rules/dp-*.json` 里**不得出现第二份数值**。
//   做法：把 manifest.thresholds 的每个数值当作**禁用 token**（带边界）扫代码（剥注释后扫，注释不是行为）。
//
// 已声明豁免（写死在门禁里，并在输出里列出——豁免不许静默）：
//   ① `src/lib/rules-pack.js`：它是 manifest 的**生成物镜像**（`tools/hash-rules.mjs` 产出、`--check` 守门），
//      是"单点"的载体而不是第二份真相源；本文件另配断言证明它逐键等于 manifest 的阈值；
//   ② **整数且 < 100** 的 token（如 `Math.max(2, …)` 的 2）：本项目里这类小整数是 `slice` 宽度、
//      枚举行数、精度常数，不是可调阈值；判定口径与理由写在这条豁免里，不靠"人工记得"。
//
// 自证：① 扫描面非空；② 阳性对照（把 0.9 / 5000 写进被测文本 → 必须报出）；
//       ③ 阴性对照（小整数 3 与"长数字里的一段"500 → 不得误报）；④ 豁免必须真的对应生成物。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectSources, stripComments } from "./helpers/text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "rules", "manifest.json"), "utf8"));
const THRESHOLD_VALUES = Object.values(MANIFEST.thresholds);

/** 豁免①：生成物镜像（manifest 在 `src/` 下的唯一合法载体）。 */
export const MIRROR_FILE = "src/lib/rules-pack.js";
/** 豁免②：整数且小于此值（小整数常数，不是阈值）。 */
export const SMALL_INT_EXEMPT_BELOW = 100;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 找出文本里出现的禁用 token（带数字/单词边界；`1500` 里的 `500` 不算）。 */
export function thresholdTokens(text, values = THRESHOLD_VALUES) {
  const hits = [];
  for (const value of values) {
    if (Number.isInteger(value) && Math.abs(value) < SMALL_INT_EXEMPT_BELOW) continue;
    const pattern = new RegExp(`(^|[^0-9A-Za-z_.])${escape(String(value))}([^0-9A-Za-z_]|$)`);
    if (pattern.test(text)) hits.push(String(value));
  }
  return hits;
}

function collectAll(dir, out = []) {
  return collectSources(ROOT, dir, out);
}

const SRC_FILES = collectAll("src");
const RULE_FILES = readdirSync(join(ROOT, "rules"))
  .filter((name) => name.startsWith("dp-") && name.endsWith(".json"))
  .map((name) => `rules/${name}`)
  .sort();

test("扫描面非空：src/** 与 rules/dp-*.json 都真的扫到了文件", () => {
  assert.ok(SRC_FILES.length >= 12, `src 文件过少：${SRC_FILES.length}`);
  assert.equal(RULE_FILES.length, MANIFEST.rule_files.length, `规则文件数 ${RULE_FILES.length} ≠ manifest.rule_files`);
  assert.ok(THRESHOLD_VALUES.length >= 8, `阈值项过少：${THRESHOLD_VALUES.length}`);
});

test("src/** 与 rules/dp-*.json 内不得出现第二份阈值数字（豁免：生成物镜像 + 小整数）", () => {
  const hits = [];
  for (const rel of [...SRC_FILES, ...RULE_FILES]) {
    if (rel === MIRROR_FILE) continue;
    const raw = readFileSync(join(ROOT, rel), "utf8");
    const text = rel.endsWith(".js") ? stripComments(raw) : raw;
    for (const token of thresholdTokens(text)) hits.push(`${rel}: 出现阈值 token ${token}`);
  }
  assert.deepEqual(hits, [], `阈值散落成第二份真相源：${hits.join("；")}`);
});

test("豁免①有据：rules-pack.js 逐键等于 manifest.thresholds（它是镜像，不是第二份）", () => {
  const source = readFileSync(join(ROOT, MIRROR_FILE), "utf8");
  const problems = [];
  for (const [key, value] of Object.entries(MANIFEST.thresholds)) {
    if (!source.includes(`"${key}": ${JSON.stringify(value)}`)) problems.push(`镜像缺 ${key}=${value}`);
  }
  assert.deepEqual(problems, [], `豁免对象不是 manifest 的镜像：${problems.join("；")}`);
  assert.ok(thresholdTokens(source).length > 0, "镜像里应当出现阈值 token（否则豁免理由不成立）");
});

test("阳性对照：写进被测文本的阈值 token 必须被报出（否则「零命中」证明不了任何事）", () => {
  const injected = "const recall = 0.8;\nif (nodes.length >= 5000) {}\nconst budget = 500;";
  const hits = thresholdTokens(injected);
  for (const token of ["0.8", "5000", "500"]) assert.ok(hits.includes(token), `漏报 ${token}：${hits.join(",")}`);
});

test("阴性对照：小整数与「长数字里的一段」不得误报（判据不能靠宁滥勿缺）", () => {
  assert.deepEqual(thresholdTokens("const width = Math.max(2, digits);\narr.slice(0, 3);"), []);
  assert.deepEqual(thresholdTokens("const t = 1500;\nconst u = 5000x;"), [], "1500 不该被读成 500、5000x 不是 5000");
  assert.deepEqual(thresholdTokens("const name = 'page-40x';"), [], "40x 不是阈值 40");
  assert.deepEqual(thresholdTokens("const price = 1600;"), [], "1600 不是阈值 160");
});

test("豁免②口径：只豁免小于 100 的整数，且豁免清单必须打印出来（不许静默）", (t) => {
  const exempted = THRESHOLD_VALUES.filter(
    (value) => Number.isInteger(value) && Math.abs(value) < SMALL_INT_EXEMPT_BELOW,
  ).map(String);
  const covered = THRESHOLD_VALUES.map(String).filter((token) => !exempted.includes(token));
  t.diagnostic(`被豁免的阈值 token（小整数）：${exempted.join(", ") || "（无）"}`);
  t.diagnostic(`受 token 门禁约束的阈值：${covered.join(", ")}`);
  assert.ok(covered.length >= THRESHOLD_VALUES.length - 2, `豁免面过大：豁免 ${exempted.length} 项 / 共 ${THRESHOLD_VALUES.length} 项`);
  for (const token of exempted) assert.match(token, /^\d+$/, `豁免清单里出现非整数 token ${token}`);
  for (const token of covered) {
    assert.deepEqual(thresholdTokens(`const x = ${token};`), [token], `阈值 ${token} 必须被扫出`);
  }
});
