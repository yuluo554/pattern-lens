// 规则包校验与读取：**缺字段/枚举越界/未知键一律拒绝加载**（列出全部缺项，不静默放过一条）。
// 阈值/枚举/优先级只从 rules/manifest.json（生成物 src/lib/rules-pack.js 里是它的原样副本）读取。

export const REQUIRED_RULE_FIELDS = [
  "rule_id",
  "name",
  "category",
  "severity",
  "detect",
  "evidence_required",
  "locator_strategy",
  "explanation",
];

export const REQUIRED_THRESHOLD_KEYS = [
  "precision_min",
  "recall_min",
  "min_cases_per_rule",
  "scan_timeout_ms",
  "first_result_budget_ms",
  "fixture_page_count",
  "stress_node_count",
  "snippet_max_len",
];

export class RulePackError extends Error {
  constructor(errors) {
    super(`规则包校验失败（${errors.length} 项）：\n- ${errors.join("\n- ")}`);
    this.name = "RulePackError";
    this.errors = errors;
  }
}

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** 校验规则包，返回错误清单（空数组 = 通过）。 */
export function validateRulePack(manifest, specs) {
  const errors = [];
  if (!isPlainObject(manifest)) return ["manifest 不是对象"];
  if (!Array.isArray(specs)) return ["specs 不是数组"];

  if (typeof manifest.ruleset_version !== "string" || manifest.ruleset_version.length === 0) {
    errors.push("manifest.ruleset_version 缺失");
  }
  if (typeof manifest.ruleset_hash !== "string" || manifest.ruleset_hash.length === 0) {
    errors.push("manifest.ruleset_hash 缺失");
  } else if (manifest.ruleset_hash.includes("TBD")) {
    errors.push(`manifest.ruleset_hash 仍是占位值（${manifest.ruleset_hash}）——跑 npm run rules:hash`);
  }
  for (const key of REQUIRED_THRESHOLD_KEYS) {
    if (typeof manifest.thresholds?.[key] !== "number") errors.push(`manifest.thresholds.${key} 缺失或非数值`);
  }
  for (const key of ["severity_levels", "categories", "match_priority", "rule_files", "evidence_kinds", "detect_keys", "style_keys"]) {
    if (!Array.isArray(manifest[key]) || manifest[key].length === 0) errors.push(`manifest.${key} 缺失或为空`);
  }
  if (errors.length > 0) return errors;

  const severityLevels = new Set(manifest.severity_levels);
  const categories = new Set(manifest.categories);
  const evidenceKinds = new Set(manifest.evidence_kinds);
  const detectKeys = new Set(manifest.detect_keys);
  const styleKeys = new Set(manifest.style_keys);
  const seen = new Set();

  for (const spec of specs) {
    const label = spec?.rule_id ?? "<无 rule_id 的规则>";
    if (!isPlainObject(spec)) {
      errors.push(`${label}: 规则不是对象`);
      continue;
    }
    for (const field of REQUIRED_RULE_FIELDS) {
      const value = spec[field];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim().length === 0) ||
        (Array.isArray(value) && value.length === 0);
      if (empty) errors.push(`${label}: 缺字段 ${field}`);
    }
    if (seen.has(spec.rule_id)) errors.push(`${label}: rule_id 重复`);
    seen.add(spec.rule_id);

    if (!severityLevels.has(spec.severity)) errors.push(`${label}: severity=${spec.severity} 不在 manifest.severity_levels`);
    if (!categories.has(spec.category)) errors.push(`${label}: category=${spec.category} 不在 manifest.categories`);

    for (const kind of spec.evidence_required ?? []) {
      if (!evidenceKinds.has(kind)) errors.push(`${label}: evidence_required 含未知证据类型 ${kind}`);
    }
    if (isPlainObject(spec.detect)) {
      for (const key of Object.keys(spec.detect)) {
        if (!detectKeys.has(key)) errors.push(`${label}: detect 含未知键 ${key}（未知键会让规则静默永不命中，故拒绝加载）`);
      }
      for (const key of Object.keys(spec.detect.style ?? {})) {
        if (!styleKeys.has(key)) errors.push(`${label}: detect.style 含未知键 ${key}`);
      }
      for (const group of spec.detect.style_any ?? []) {
        for (const key of Object.keys(group)) {
          if (!styleKeys.has(key)) errors.push(`${label}: detect.style_any 含未知键 ${key}`);
        }
      }
    } else {
      errors.push(`${label}: detect 不是对象`);
    }
    if (!Array.isArray(spec.limits) || spec.limits.length === 0) {
      errors.push(`${label}: 缺 limits（每条规则必须显式声明"本工具不判断什么"）`);
    }
  }

  if (Array.isArray(manifest.rule_files) && manifest.rule_files.length !== specs.length) {
    errors.push(`manifest.rule_files ${manifest.rule_files.length} 个 ≠ 实际规则 ${specs.length} 条`);
  }
  const priority = manifest.match_priority ?? [];
  for (const id of priority) {
    if (!seen.has(id)) errors.push(`manifest.match_priority 含不存在的规则 ${id}`);
  }
  for (const id of seen) {
    if (!priority.includes(id)) errors.push(`manifest.match_priority 漏掉了规则 ${id}（同一节点多命中时的归属必须唯一确定）`);
  }
  if (priority.length !== new Set(priority).size) errors.push("manifest.match_priority 有重复项");
  return errors;
}

/** 校验并返回可用的规则包；不通过即抛错（**绝不部分加载**）。 */
export function loadRulePack(manifest, specs) {
  const errors = validateRulePack(manifest, specs);
  if (errors.length > 0) throw new RulePackError(errors);
  const byId = new Map(specs.map((spec) => [spec.rule_id, spec]));
  const order = manifest.match_priority.map((id) => byId.get(id));
  return { manifest, specs, byId, order };
}

/** 严重度位次（越大越严重）；未知等级抛错。 */
export function severityRank(manifest, severity) {
  const index = manifest.severity_levels.indexOf(severity);
  if (index < 0) throw new Error(`未知严重度: ${severity}`);
  return index + 1;
}

/** 分组顺序（紧迫/误导/障碍/价格）由 manifest.categories 决定，UI 不写死。 */
export function categoryOrder(manifest) {
  return [...manifest.categories];
}
