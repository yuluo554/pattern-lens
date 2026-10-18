// 权限白名单单点：manifest.json 与断言共用这一份（plan/03 §四）。
// 只申请这五项；`host_permissions` 必须为空；不得声明 `content_scripts`（未点击前零注入）。

export const PERMISSIONS_WHITELIST = ["activeTab", "scripting", "sidePanel", "storage", "contextMenus"];

export const FORBIDDEN_PERMISSIONS = [
  "<all_urls>",
  "tabs",
  "cookies",
  "webRequest",
  "webRequestBlocking",
  "history",
  "clipboardRead",
  "clipboardWrite",
  "downloads",
  "management",
  "proxy",
  "debugger",
];
