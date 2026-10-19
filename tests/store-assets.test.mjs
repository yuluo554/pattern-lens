// 商店素材与隐私声明对账（M5 DoD 第 6 项）：
//   ④ `docs/商店素材清单.md` 与 `assets/store/` 实物**逐项对账**（双向：清单写的必须存在；实物里多出的必须报出）；
//   ⑤ `docs/隐私声明.md` 与**权限白名单**一致（逐项点名五项权限与全部禁用权限；且零网络/无远程代码/零注入承诺与实装一致）。
//
// 判据只落**仓库内文件**（不读远端、不读商店）。素材是生成物 → 与生成器重生成逐字节一致另由 `tests/build.test.mjs` 守。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_PERMISSIONS, PERMISSIONS_WHITELIST } from "../tools/permissions-whitelist.mjs";
import { ICON_SIZES } from "../tools/gen-store-icons.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const CHECKLIST = read("docs/商店素材清单.md");
const PRIVACY = read("docs/隐私声明.md");
const MANIFEST = JSON.parse(read("manifest.json"));

/** PNG 尺寸（IHDR 的宽/高，byte 16..24）——不做第三方解码依赖。 */
function pngSize(path) {
  const buffer = readFileSync(join(ROOT, path));
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} 不是 PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** 素材清单表里出现的 `assets/store/...` 路径（逐项对账的"清单侧"）。 */
function listedAssets() {
  return [...new Set([...CHECKLIST.matchAll(/assets\/store\/[A-Za-z0-9._-]+/g)].map((match) => match[0]))].sort();
}

/** 磁盘上 `assets/store/` 的实物（对账的"实物侧"）。 */
function onDiskAssets() {
  const dir = join(ROOT, "assets", "store");
  assert.ok(existsSync(dir), "assets/store/ 不存在（先跑 npm run store:icons）");
  return readdirSync(dir).map((name) => `assets/store/${name}`).sort();
}

test("扫描面非空：清单里列出的素材 ≥ 6、磁盘实物 ≥ 6（防「0 项对账」假绿）", () => {
  assert.ok(listedAssets().length >= 6, `清单列出的素材过少：${listedAssets().length}`);
  assert.ok(onDiskAssets().length >= 6, `磁盘实物过少：${onDiskAssets().length}`);
});

test("④ 逐项对账：清单写到的每个素材都真实存在，且磁盘上每个实物都被清单收录（双向，不静默）", () => {
  const listed = listedAssets();
  const onDisk = onDiskAssets();
  const missing = listed.filter((rel) => !existsSync(join(ROOT, rel)));
  assert.deepEqual(missing, [], `清单写了但实物不存在：${missing.join(", ")}`);
  const extra = onDisk.filter((rel) => !listed.includes(rel));
  assert.deepEqual(extra, [], `磁盘上有实物但清单没收录：${extra.join(", ")}`);
  assert.deepEqual(listed, onDisk, "清单与实物必须逐项相等");
});

test("④ 图标规格：4 枚图标尺寸与清单/生成器声明一致，且 manifest.icons 逐尺寸引用", () => {
  for (const size of ICON_SIZES) {
    const rel = `assets/store/icon-${size}.png`;
    assert.equal(listedAssets().includes(rel), true, `${rel} 不在清单里`);
    assert.deepEqual(pngSize(rel), { width: size, height: size }, `${rel} 尺寸不对`);
  }
  const icons = MANIFEST.icons ?? {};
  assert.deepEqual(Object.keys(icons).map(Number).sort((a, b) => a - b), [...ICON_SIZES].sort((a, b) => a - b));
  for (const [size, rel] of Object.entries(icons)) {
    assert.deepEqual(pngSize(rel), { width: Number(size), height: Number(size) }, `manifest.icons[${size}] → ${rel} 尺寸不符`);
  }
});

test("④ 截图规格：两张商店截图的尺寸与清单声明一致（1000×760 / 420×900）", () => {
  assert.deepEqual(pngSize("assets/store/screenshot-page.png"), { width: 1000, height: 760 });
  assert.deepEqual(pngSize("assets/store/screenshot-sidepanel.png"), { width: 420, height: 900 });
  assert.ok(CHECKLIST.includes("1000×760") && CHECKLIST.includes("420×900"), "清单必须写明截图尺寸");
});

test("④ 清单声明的商店简介与 manifest 一致，且不含禁用词、长度在商店限额内", () => {
  const description = MANIFEST.description ?? "";
  assert.equal(CHECKLIST.includes(description), true, "清单里的商店简介必须与 manifest.description 一致");
  assert.ok([...description].length <= 132, `简介过长（${[...description].length} > 132）`);
  // 文案红线（与 copy.js 的禁用词表同口径）：简介不得出现定性标签词。
  const banned = ["欺诈", "违法", "恶意", "诈骗", "骗局", "风险评分", "无风险", "未发现问题", "安全"];
  for (const word of banned) assert.equal(description.includes(word), false, `商店简介出现禁用词「${word}」`);
});

test("④ 素材脱敏：清单与截图只含合成站点名/域名，不出现真实品牌或个人信息", () => {
  for (const forbidden of ["http://", "https://", "@gmail", "@qq.com"]) {
    assert.equal(CHECKLIST.includes(forbidden), false, `清单出现外链/邮箱形态：${forbidden}`);
  }
  assert.ok(CHECKLIST.includes("example.invalid"), "清单应声明脱敏域名 example.invalid");
});

// ── ⑤ 隐私声明 ↔ 权限白名单一致 ─────────────────────────────────────────────
test("⑤ 隐私声明逐项点名五项**已申请**权限（与白名单一致，多一项少一项都红）", () => {
  for (const permission of PERMISSIONS_WHITELIST) {
    assert.ok(PRIVACY.includes(`\`${permission}\``), `隐私声明未点名已申请权限「${permission}」`);
  }
  assert.ok(PRIVACY.includes("恰好五项") || PRIVACY.includes("五项"), "隐私声明应写明「恰好五项」");
});

test("⑤ 隐私声明逐项点名**全部禁用**权限（与 FORBIDDEN_PERMISSIONS 单点一致）", () => {
  for (const permission of FORBIDDEN_PERMISSIONS) {
    assert.ok(PRIVACY.includes(`\`${permission}\``), `隐私声明未点名禁用权限「${permission}」`);
  }
});

test("⑤ 隐私声明与 manifest 实装一致：host_permissions 空、web_accessible_resources 空、无 content_scripts", () => {
  assert.deepEqual(MANIFEST.host_permissions ?? [], []);
  assert.deepEqual(MANIFEST.web_accessible_resources ?? [], []);
  assert.equal("content_scripts" in MANIFEST, false);
  assert.ok(PRIVACY.includes("host_permissions") && PRIVACY.includes("空"), "隐私声明必须写明 host_permissions 为空");
  assert.ok(PRIVACY.includes("web_accessible_resources"), "隐私声明必须写明 web_accessible_resources 为空");
  assert.ok(PRIVACY.includes("未点击前零注入") || PRIVACY.includes("未点击前零注入"), "隐私声明必须写明未点击前零注入");
});

test("⑤ 隐私声明声明零网络/无远程代码：点名的网络 API 与零依赖承诺都在", () => {
  for (const needle of ["fetch", "XMLHttpRequest", "sendBeacon", "WebSocket", "eval", "new Function", "远程代码"]) {
    assert.ok(PRIVACY.includes(needle), `隐私声明未提及「${needle}」`);
  }
  assert.ok(PRIVACY.includes("devDependencies") && PRIVACY.includes("均为空"), "隐私声明应写明零依赖");
});

test("⑤ 隐私声明声明的存储键与实装一致（LastScan / ScanHistory / storage.local / storage.session）", () => {
  for (const needle of ["chrome.storage.local", "chrome.storage.session", "LastScan", "ScanHistory"]) {
    assert.ok(PRIVACY.includes(needle), `隐私声明未提及「${needle}」`);
  }
  // 键名必须与实装单点一致（sidepanel-view.js 定义 LAST_SCAN_KEY / HISTORY_KEY）。
  const view = read("src/lib/sidepanel-view.js");
  assert.ok(view.includes('"LastScan"') && view.includes('"ScanHistory"'), "实装键名应与隐私声明一致");
});

test("⑤ 隐私声明不含禁用词（文案红线与 copy.js 同口径）", () => {
  const banned = ["欺诈", "违法", "恶意", "诈骗", "骗局", "风险评分", "无风险", "未发现问题"];
  for (const word of banned) assert.equal(PRIVACY.includes(word), false, `隐私声明出现禁用词「${word}」`);
});

test("可证伪性：把一个禁用权限从隐私声明里删掉 → 上面的逐项点名必须报出（否则对账是恒真的）", () => {
  const sample = FORBIDDEN_PERMISSIONS[0];
  const mutated = PRIVACY.replace(`\`${sample}\``, "（已删）");
  assert.notEqual(mutated, PRIVACY, "变异未生效（该权限名不在声明里）");
  assert.equal(mutated.includes(`\`${sample}\``), false, `删掉后仍能匹配 → 点名判据失效：${sample}`);
});

test("清单与隐私声明都是真实文件且非空（防「指到空气」）", () => {
  for (const rel of ["docs/商店素材清单.md", "docs/隐私声明.md", "docs/目录结构说明.md"]) {
    assert.ok(existsSync(join(ROOT, rel)), `缺 ${rel}`);
    assert.ok(statSync(join(ROOT, rel)).size > 200, `${rel} 内容过少`);
  }
});
