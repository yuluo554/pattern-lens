// 测试共享的源码扫描工具（**不进 dist**；只服务 node --test）。
// 单点理由：`stripComments` 是"判据只看代码、不看注释"这条口径的唯一实现——
// 它被 `source-hygiene`（零网络/纯核心/只读纪律）与 `threshold-token`（阈值 token 门禁）共用；
// 抄第二份就会让两条判据在"剥注释"这件事上各自漂移（K 口径纪律：同一判据只许一处实现）。

import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 判据只看**代码**，不看注释与字符串外的说明文字：
 * 注释里写"本模块不碰 chrome API"不该被判成违规（判据要收窄到被测的那件事）。
 */
export function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      // 行内 `//`（不处理字符串里的 // —— 本项目源码里没有这种形态，故不需要引号感知）
      const index = line.indexOf("//");
      return index >= 0 ? line.slice(0, index) : line;
    })
    .join("\n");
}

/** 递归收集 `root/<dir>` 下的文件（返回相对 `root` 的 POSIX 风格路径，顺序稳定）。 */
export function collectSources(root, dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) collectSources(root, rel, out);
    else out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

/** 命中即返回模式名（用于把"违规"变成可点名的清单）。 */
export function scanText(text, patterns) {
  return patterns.filter(({ re }) => re.test(text)).map(({ name }) => name);
}
