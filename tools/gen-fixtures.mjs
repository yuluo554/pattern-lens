#!/usr/bin/env node
// fixture 生成器（M1 任务；M0 只留入口，**不伪造产物**）。
// 骨架期纪律：未实现的能力用显式退出码拦截，绝不静默产出空目录或假数据（plan/06 §二 M1 DoD）。
// 用法：node tools/gen-fixtures.mjs [--check]

const MESSAGE = [
  "M1 未实现：fixture 生成器尚未落地（当前是 M0 骨架）。",
  "计划与实际做法见 plan/05-数据计划与基准计划.md §三（生成器纪律）与 plan/06 §二（M1 DoD）：",
  "  1) 40 页合成页面：data/fixtures/page-NN/{page.html,style-map.json,truth.json}",
  "  2) 真值只存输入与期望（禁 observed_* 字段）；先真值后规则",
  "  3) 自研确定性 RNG（src/lib/rng.js），同种子逐字节同产物；--check 做再生成位级一致比对",
  "本命令在 M1 完成前**恒以退出码 2 收尾**（不产出任何文件）。",
].join("\n");

process.stderr.write(`${MESSAGE}\n`);
process.exitCode = 2;
