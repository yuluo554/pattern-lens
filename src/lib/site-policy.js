// 站点开关（纯函数）：黑名单 = 永不在该站注入；白名单 = 仅在这些站启用。
// 设置存 chrome.storage.local；本模块不碰 chrome（可离线单测）。

export const SITE_POLICY_MODES = ["allowlist", "blocklist"];

export const DEFAULT_SETTINGS = {
  site_policy: { mode: "blocklist", hosts: [] },
  disabled_rule_ids: [],
};

export function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const policy = source.site_policy && typeof source.site_policy === "object" ? source.site_policy : {};
  const mode = SITE_POLICY_MODES.includes(policy.mode) ? policy.mode : DEFAULT_SETTINGS.site_policy.mode;
  const hosts = Array.isArray(policy.hosts)
    ? [...new Set(policy.hosts.map((host) => String(host).trim().toLowerCase()).filter((host) => host.length > 0))].sort()
    : [];
  const disabled = Array.isArray(source.disabled_rule_ids)
    ? [...new Set(source.disabled_rule_ids.map(String))].sort()
    : [];
  return { site_policy: { mode, hosts }, disabled_rule_ids: disabled };
}

export function hostOf(url) {
  try {
    return new URL(String(url)).host.toLowerCase();
  } catch {
    return "";
  }
}

/** 该站点是否应被扫描。返回 `{enabled, reason}`——reason 供 UI 明示（不静默跳过）。 */
export function isSiteEnabled(url, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const host = hostOf(url);
  const { mode, hosts } = settings.site_policy;
  if (host.length === 0) return { enabled: false, reason: "url_unparsable" };
  if (mode === "blocklist" && hosts.includes(host)) return { enabled: false, reason: "blocklisted" };
  if (mode === "allowlist" && !hosts.includes(host)) return { enabled: false, reason: "not_allowlisted" };
  return { enabled: true, reason: "enabled" };
}

/** 过滤掉被禁用的规则 id（未知 id 保留在集合里，由规则包校验另行报错）。 */
export function activeRuleIds(allRuleIds, rawSettings) {
  const disabled = new Set(normalizeSettings(rawSettings).disabled_rule_ids);
  return allRuleIds.filter((id) => !disabled.has(id));
}
