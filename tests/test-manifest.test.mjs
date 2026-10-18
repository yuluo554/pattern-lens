// 测试清单守门：`npm test` 的显式文件列表必须覆盖 tests/ 下**全部** `*.test.mjs`。
// 理由（纯 JS 项目的既有坑）：`node --test tests/` 目录形式在 Git Bash + Node 24 与 CI 上都会挂
// MODULE_NOT_FOUND，所以测试文件是**逐个列出**的——那么"新增测试文件忘了登记"就会静默漏跑。
// 本守门把"漏跑"变成红灯（这是清单类文件，不是文档）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listedTests() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const script = pkg.scripts?.test ?? "";
  return new Set(
    script
      .split(/\s+/)
      .filter((token) => token.startsWith("tests/") && token.endsWith(".test.mjs"))
      .map((token) => token.replace(/\\/g, "/")),
  );
}

function onDiskTests() {
  return readdirSync(join(ROOT, "tests"))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => `tests/${file}`)
    .sort();
}

test("tests/ 下的每个测试文件都在 npm test 的显式清单里（漏登记 = 静默漏跑）", () => {
  const listed = listedTests();
  const disk = onDiskTests();
  const missing = disk.filter((file) => !listed.has(file));
  assert.deepEqual(missing, [], `未登记进 package.json 的 scripts.test：${missing.join(", ")}`);
});

test("清单里的每个测试文件都真实存在（防重命名后清单指向空气）", () => {
  const listed = listedTests();
  const disk = new Set(onDiskTests());
  const dangling = [...listed].filter((file) => !disk.has(file));
  assert.deepEqual(dangling, [], `npm test 指向不存在的文件：${dangling.join(", ")}`);
});

test("非空跑自证：清单与磁盘两侧都真的扫到了文件", () => {
  assert.ok(listedTests().size >= 8, `清单过少（${listedTests().size}）——判据可能失效`);
  assert.ok(onDiskTests().length >= 8, `磁盘测试文件过少（${onDiskTests().length}）`);
});
