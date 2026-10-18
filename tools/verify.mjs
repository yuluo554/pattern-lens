#!/usr/bin/env node
// 一条命令全量自检：分段跑，逐段给结论。**未启用段不冒充通过**（打印 not_enabled + 原因，
// 并在 `--strict` 下以退出码 1 收尾——M6 之前允许非严格模式，因为未启用段确实还没实现）。
// 用法：node tools/verify.mjs [--strict] [--only a,b]
// 退出码：0 全绿 / 1 有 FAIL（或 strict 下有未启用段）/ 2 用法错误。

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 段定义：`kind` = gate（跑脚本）/ tests（跑 node --test）/ not_enabled（阶段未就绪）。 */
const SEGMENTS = [
  { name: "layout", kind: "gate", script: "tools/check-sprint-layout.mjs", note: "方法论装订（布局门）" },
  { name: "rules.hash", kind: "gate", script: "tools/hash-rules.mjs", args: ["--check"], note: "规则包哈希与生成物一致" },
  { name: "manifest", kind: "tests", files: ["tests/manifest-permissions.test.mjs"], note: "权限白名单 / 零静态注入" },
  { name: "rules.schema", kind: "tests", files: ["tests/rules-schema.test.mjs"], note: "12 条规则字段与枚举" },
  { name: "engine.gate", kind: "tests", files: ["tests/engine-gate.test.mjs"], note: "证据门禁（取不到即丢弃）" },
  { name: "engine.order", kind: "tests", files: ["tests/engine-order.test.mjs"], note: "排序与编号稳定" },
  { name: "snippet.verbatim", kind: "tests", files: ["tests/snippet-verbatim.test.mjs"], note: "snippet 原样子串" },
  { name: "export", kind: "tests", files: ["tests/export.test.mjs"], note: "导出字段与双跑字节一致" },
  { name: "copy.guard", kind: "tests", files: ["tests/copy-guard.test.mjs"], note: "文案单点 + 禁用词" },
  { name: "source.hygiene", kind: "tests", files: ["tests/source-hygiene.test.mjs"], note: "零外链 / 零网络 API / 只读纪律" },
  { name: "build", kind: "tests", files: ["tests/build.test.mjs"], note: "扩展树白名单 + zip 确定性" },
  { name: "fixtures.frozen", kind: "tests", files: ["tests/truth-shape.test.mjs", "tests/fixtures-frozen.test.mjs"], note: "40 页 fixture 与真值（冻结形态 + 独立复算）" },
  { name: "fixtures.check", kind: "gate", script: "tools/gen-fixtures.mjs", args: ["--check"], note: "fixture 再生成位级一致" },
  { name: "rules.bench", kind: "not_enabled", milestone: "M2", note: "逐规则 precision/recall 双边门" },
  { name: "overlay.diff", kind: "not_enabled", milestone: "M3", note: "清除覆盖层后 DOM diff = 0" },
  { name: "sidepanel.restore", kind: "not_enabled", milestone: "M4", note: "冷启动 / SW 回收后恢复" },
  { name: "export.zero_network", kind: "not_enabled", milestone: "M5", note: "整轮扫描 + 导出 0 网络请求" },
];

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? String(args[onlyIndex + 1] ?? "").split(",").filter((name) => name.length > 0) : null;
  const unknown = args.filter((arg, index) => !arg.startsWith("--") && (onlyIndex < 0 || index !== onlyIndex + 1));
  if (unknown.length > 0 || (onlyIndex >= 0 && !only?.length)) {
    process.stderr.write("用法: node tools/verify.mjs [--strict] [--only seg1,seg2]\n");
    process.exitCode = 2;
    return;
  }

  const selected = only ? SEGMENTS.filter((segment) => only.includes(segment.name)) : SEGMENTS;
  if (only) {
    const missing = only.filter((name) => !SEGMENTS.some((segment) => segment.name === name));
    if (missing.length > 0) {
      process.stdout.write(`未知名段：${missing.join(",")}（**报 FAIL，不静默跳过**）\n`);
      process.exitCode = 1;
      return;
    }
  }

  const results = [];
  for (const segment of selected) {
    if (segment.kind === "not_enabled") {
      results.push({ segment, status: "not_enabled" });
      process.stdout.write(`SKIP  ${segment.name.padEnd(18)} not_enabled（${segment.milestone} 未实现：${segment.note}）\n`);
      continue;
    }
    try {
      if (segment.kind === "gate") {
        const script = join(ROOT, segment.script);
        if (!existsSync(script)) throw new Error(`缺脚本 ${segment.script}`);
        run(process.execPath, [script, ...(segment.args ?? [])]);
      } else {
        for (const file of segment.files) {
          if (!existsSync(join(ROOT, file))) throw new Error(`缺测试文件 ${file}（未启用请改成 not_enabled 段，不许留空壳）`);
        }
        run(process.execPath, ["--test", ...segment.files]);
      }
      results.push({ segment, status: "pass" });
      process.stdout.write(`PASS  ${segment.name.padEnd(18)} ${segment.note}\n`);
    } catch (error) {
      const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      results.push({ segment, status: "fail", output });
      process.stdout.write(`FAIL  ${segment.name.padEnd(18)} ${segment.note}\n`);
      if (output.trim().length > 0) {
        process.stdout.write(
          output
            .split("\n")
            .filter((line) => /^(not ok|# fail|✖|Error|AssertionError|.*Error:)/.test(line.trim()))
            .slice(0, 8)
            .map((line) => `      ${line.trim()}`)
            .join("\n") + "\n",
        );
      }
    }
  }

  const failed = results.filter((result) => result.status === "fail").length;
  const skipped = results.filter((result) => result.status === "not_enabled").length;
  const passed = results.filter((result) => result.status === "pass").length;
  process.stdout.write("-".repeat(64) + "\n");
  process.stdout.write(`这轮扫到：${selected.length} 段（启用 ${passed + failed} / 未启用 ${skipped}）\n`);
  process.stdout.write(`通过 ${passed} / 失败 ${failed} / 未启用 ${skipped}\n`);
  process.stdout.write(`未启用段（**未启用 ≠ 通过**）：${results.filter((r) => r.status === "not_enabled").map((r) => `${r.segment.name}(${r.segment.milestone})`).join("、") || "（无）"}\n`);
  process.stdout.write(`结论: ${failed > 0 ? "有 FAIL" : skipped > 0 && strict ? "未启用段未清零（strict）" : "全绿"}\n`);
  process.exitCode = failed > 0 || (strict && skipped > 0) ? 1 : 0;
}

main();
