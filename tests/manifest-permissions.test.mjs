// 权限白名单 / 零静态注入 / MV3 必需字段：逐项比对 manifest.json（白名单单点在 tools/permissions-whitelist.mjs）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_PERMISSIONS, PERMISSIONS_WHITELIST } from "../tools/permissions-whitelist.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

test("权限集合与白名单**逐项相等**（多一项少一项都红）", () => {
  const actual = [...(manifest.permissions ?? [])].sort();
  const expected = [...PERMISSIONS_WHITELIST].sort();
  assert.deepEqual(actual, expected, `manifest.permissions = ${actual.join(",")}`);
});

test("禁用权限一个都不许出现（含 <all_urls> / tabs / cookies / webRequest）", () => {
  const declared = new Set([...(manifest.permissions ?? []), ...(manifest.host_permissions ?? []), ...(manifest.optional_permissions ?? [])]);
  const hit = FORBIDDEN_PERMISSIONS.filter((permission) => declared.has(permission));
  assert.deepEqual(hit, [], `出现了禁用权限：${hit.join(",")}`);
});

test("host_permissions 为空或不存在（不申请任何常驻主机访问）", () => {
  const hosts = manifest.host_permissions ?? [];
  assert.deepEqual(hosts, [], `host_permissions = ${hosts.join(",")}`);
});

test("不声明 content_scripts（未点击前零注入的 manifest 侧证据）", () => {
  assert.equal("content_scripts" in manifest, false, "manifest 里出现了 content_scripts —— 违背零注入承诺");
});

test("MV3 必需字段齐备，且引用的文件真实存在", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.minimum_chrome_version, "缺 minimum_chrome_version（sidePanel 需要 116+）");
  assert.ok(
    Number(manifest.minimum_chrome_version) >= 116,
    "minimum_chrome_version 必须 >= 116：service-worker.js 调 chrome.sidePanel.open()，该 API @since Chrome 116（低版本上点图标会 TypeError 静默失败）",
  );
  assert.equal(manifest.background?.type, "module");
  assert.ok(existsSync(join(ROOT, manifest.background.service_worker)), `缺 ${manifest.background.service_worker}`);
  assert.ok(existsSync(join(ROOT, manifest.side_panel.default_path)), `缺 ${manifest.side_panel.default_path}`);
  assert.deepEqual(manifest.web_accessible_resources ?? [], [], "不得把扩展文件暴露给网页");
});

test("action 有入口但**没有** popup（点击走 onActionClick → 开侧边栏）", () => {
  assert.ok(manifest.action, "缺 action 入口");
  assert.equal("default_popup" in manifest.action, false, "不得设置 popup（会抢掉 onClicked）");
});
