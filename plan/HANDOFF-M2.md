# HANDOFF-M2 —— 启动第 2 棒（M2 规则引擎与按需注入）时读的交接单

> 本文档由 **M1 收尾时**写成（2026-10-19）。命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。
> **新对话的第一动作**：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）——**先跑它**，红了先修布局。

## 1. 当前进度 + 证据（M1 收尾时实测）

**M1 已完成**：40 页合成 fixture + 逐页真值（正/负样本两栏）+ 覆盖矩阵 + 5k 压力页 + 确定性生成器（两层守门 + 变异自证）。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 2 / 状态副本 3」） |
| fixture 生成 | `npm run fixtures` | 页面 **40** / 规则 12 / 正样本 **48**（每规则 4）/ 负样本 **24**（每规则 2）/ 文件 **124**；压力页 2500 行 / **5007 节点** |
| 再生成位级一致 | `npm run fixtures:check` | 再生成 124 文件 == 冻结产物 124 文件，逐字节相同 |
| 单元与门测试 | `npm test` | **114 项全通过**（0 fail），14 个测试文件（新增 `tests/truth-shape.test.mjs`、`tests/fixtures-frozen.test.mjs`，逐文件登记在 `package.json`） |
| 全量自检 | `npm run verify` | **13 段 PASS / 4 段 not_enabled**，rc=0（`fixtures.frozen` 已从 not_enabled 换成实跑；新增 `fixtures.check` 门段） |
| 规则包哈希 | `npm run rules:hash -- --check` | `ruleset_hash=b81d12e89a43f1144b8f10d9ca1908919c247c7ee07250dd7b9f3010a642ce51`（12 条规则 / **8 项阈值**） |
| 构建 | `npm run build` + `build:check` | `dist/` 16 文件 / 120,479 字节；`release/pattern-lens-0.1.0.zip` 122,345 字节；重生成逐字节一致 |
| 变异验证（两层守门） | `tests/fixtures-frozen.test.mjs` | 4 组全红：手工改 `page.html` → 第②层红；改坏生成器 → 第②层红；注入 `observed_*` → 第①层红；少一页 → 第①层红 |
| 变异验证（真值形态） | `tests/truth-shape.test.mjs` | 8 组全报出 + 覆盖下限变异 1 组（抽掉某规则负样本 → 覆盖门红） |
| 覆盖矩阵 | `data/fixtures/COVERAGE.md` | 由真值汇总生成；守门测试逐规则计数 + 合计与真值复算逐条一致（正 48 / 负 24） |
| CI | **未接远端 → 从未跑过** | 本地等价校验 = CI 工作流静态自查 + 逐步骤手工复跑；**CI 待首推验证** |

**M1 顺手改严的两处（都要知道）**：

1. `rules/manifest.json` 新增阈值 **`thresholds.stress_node_count`（5000）**，并同步加进 `src/lib/rules.js` 的 `REQUIRED_THRESHOLD_KEYS`
   → `ruleset_hash` 因此变化（跑过 `npm run rules:hash`）。理由：`plan/05` §六 定"fixture 规模只在 manifest"，压力页节点数写进生成器就是第二份数字（D27）。
2. 真值形态定为 **`{page, site, url, positives[], negatives[]}`**（D26）：两类条目形态**统一**为
   `{rule_id, selector_path, snippet_expected, note?}`（正/负由数组决定）；**任何层级禁止 `observed_*` / `matched` / `detected` 一类字段**。
   真值落在**页目录内**（D25，统一了 `plan/01`/`plan/05` 与 `plan/04`/HANDOFF 的写法差异）。

## 2. 下一棒待办（M2：规则引擎与按需注入）

按 `plan/06` §二 M2 DoD 逐条做，实现落点与口径在 `plan/04` M2 段：

1. **Node 侧页面模型解析器**：把 `data/fixtures/page-NN/page.html` + `style-map.json` 解析成 `PageModel`，
   与 `src/content/collector.js` **同语义**（口径见 `data/fixtures/README.md`：定位串 / 文本原样去首尾空白 / `nearby-text` = 父元素文本减自身 / 控件标签优先级 / `checked` 归一）。
   `tests/helpers/fixtures.mjs` 已有**自写轻量解析**（可复用其解析思路，但它是"独立复算"用途，别把基准判据绑在它上面）。
2. **⚠ 先解决已知建模缺口**：容器元素的 `label` 取 `textContent`，会让"允许 element 的文本级规则"
   （`dp-03`/`dp-06`/`dp-08`/`dp-10`，以及 `dp-02`/`dp-12` 的控件分支之外的形态）在**每个祖先容器**上重复命中，
   连 `body`/`html` 都会命中（`body.label` = 整页文本，截断 200 字）。M1 的真值只对**控件/文本节点**对账（生成期一致性断言即按此口径）。
   处置二选一并写进决策记录：① 采集器只对**控件**用 `textContent` 回退，普通元素不取 `label`；② 引擎按
   `(rule_id, locator)` 去重（同一 locator 只出一条）。**不处理会让 B1 的 precision 直接崩**。
3. **基准 B1–B7**（`plan/05` §四）：逐规则 precision/recall（分母 = 40 页 × 12 规则，**逐样本点名**）、
   双边门（误报边 + 检出边）、证据门禁零产出、排序编号双跑、snippet 截断、locator 回解唯一、超时部分结果、5k 耗时。
   门槛一律读 `rules/manifest.json`；某规则无负样本时 `precision` 记 `not_assessed`（**不填 1.0**）。
4. **探活（可证伪）**：往引擎注入一个已知缺陷（如把某规则的证据门禁短路）→ B1 必须报未达标；变红后立即还原并**断言字节已还原**。
5. **阈值 token 门禁**：`src/**` 与 `rules/dp-*.json` 内不得出现第二份阈值数字（K1 的 M2 补门）。
6. **按需注入链路**：SW `start-scan` → 站点开关 → `chrome.scripting.executeScript`（M1 已断言 manifest 无 `content_scripts`）。
7. **5k 耗时**：`data/fixtures/stress-5k/page.html`（5007 节点）点击到出结果 < `thresholds.first_result_budget_ms`。
8. 收尾：`plan/00` §5 + `plan/06` §一 + `README.md` 状态行三处同改 → 写 `plan/HANDOFF-M3.md` → commit。

**M2 不要碰的东西**：`src/lib/rules-pack.js`（生成物，改规则用 `npm run rules:hash`）、
阈值（只在 `rules/manifest.json`）、`plan/01`（题面定稿不改写，勘误走 `plan/00` 决策记录）、
**`data/fixtures/` 的冻结产物**（要改必须改生成器后 `npm run fixtures`）。

## 3. 既定口径清单（K 编号；"动了会打挂测试"的约定）

| K | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| K1 | **数值阈值只在 `rules/manifest.json`**；`src/**` 与 `rules/dp-*.json` 不得出现第二份 | `rules/manifest.json` | `tests/rules-schema.test.mjs` + `plan/05` §六门禁（M2 补 token 扫描） |
| K2 | `src/lib/rules-pack.js` 是**生成物**，禁手改；改规则 → `npm run rules:hash` | `tools/hash-rules.mjs` | `hash-rules --check` + `tests/rules-schema.test.mjs` |
| K3 | **证据门禁**：`evidence_required` 取不到 → 丢弃并记 `rejected`（不是降级）；**空串算"取到了"** | `src/lib/engine.js` | `tests/engine-gate.test.mjs` |
| K4 | 同一节点多规则命中 → 按 `match_priority` 先到先得，**一个节点只出一条** | `rules/manifest.json` | `tests/engine-gate.test.mjs` / `engine-order.test.mjs` |
| K5 | 排序 = severity 降序 → `dom_order` 升序；编号 `F-01…`；**UI 与导出都不得再排序** | `src/lib/ordering.js` | `tests/engine-order.test.mjs` |
| K6 | `snippet` 必须是宿主文本**原样子串**；截断只从尾部 + 标 `snippet_truncated` | `src/lib/page-model.js` | `tests/snippet-verbatim.test.mjs` |
| K7 | 导出字段顺序 = 契约（`EXPORT_TOP_FIELDS` / `EXPORT_FINDING_FIELDS`）；导出**不读时钟** | `src/lib/export.js` | `tests/export.test.mjs` |
| K8 | 权限白名单单点 + **无 `content_scripts`** + `host_permissions` 空 | `tools/permissions-whitelist.mjs` | `tests/manifest-permissions.test.mjs` |
| K9 | 文案单点 `src/lib/copy.js`；禁用词表 `COPY.bannedWords`（扫描 src/ 其余文件，**含阳性对照**） | `src/lib/copy.js` | `tests/copy-guard.test.mjs` |
| K10 | `src/lib/**` 是**纯核心**：不得出现 `chrome`/`document`/`window`；lib 间只允许相对 import | `src/lib/*` | `tests/source-hygiene.test.mjs` |
| K11 | 拼接顺序单点 = `BUNDLE_ORDER`（`tools/bundle.mjs`）；新增模块必须登记 | `tools/bundle.mjs` | `tests/build.test.mjs` |
| K12 | 安装面白名单 = `RUNTIME_WHITELIST`（`tools/build-extension.mjs`）；新增 `src/lib` 文件必须登记 | `tools/build-extension.mjs` | `tests/build.test.mjs` |
| K13 | `dist/` 与 `release/*.zip` 是构建产物（**不进 git**）；zip = stored + 固定时间戳 + `create_system=0` | `.gitignore` / `tools/build-extension.mjs` | `build-extension --check` + `tests/build.test.mjs` |
| K14 | 交接单命名：`plan/HANDOFF-M<k>.md` = 启动第 k 棒时读；M0 豁免；收尾棒要 `HANDOFF-M6` | `AGENTS.md` | `tools/check-sprint-layout.mjs` |
| K15 | 里程碑状态副本**三处**：`plan/00` §5、`plan/06` §一、`README.md` 状态行（同一次提交改完） | 三处 | 布局门 `LAYOUT.STATUS` |
| K16 | 测试文件必须登记进 `package.json` 的 `scripts.test`（逐文件列出；`node --test tests/` 目录形式会挂） | `package.json` | `tests/test-manifest.test.mjs` |
| K17 | 未实现能力用**显式退出码**拦截，**不伪造产物**；`verify` 里列 `not_enabled` 段 | `tools/verify.mjs` | `verify` 输出 + `--strict` |
| K18 | 里程碑 DoD 里的 CI 项：未推送只能写"本地等价校验（未接远端，CI 待首推验证）" | `plan/06` | 人工（诚实性纪律） |
| K19 | 样式条件分两档：`detect.style` = AND，`detect.style_any` = OR | `rules/dp-*.json` / `src/lib/page-model.js` | `tests/rules-schema.test.mjs` |
| K20 | 每条规则必须有非空 `limits`（显式声明本工具不判断什么）；缺它即拒绝加载 | `rules/dp-*.json` | `tests/rules-schema.test.mjs` |
| **K21** | **真值只存输入与期望**：`positives[]`（应命中）与 `negatives[]`（看起来像但不成立）**条目形态统一** = `{rule_id, selector_path, snippet_expected, note?}`；**禁 `observed_*`/`matched`/`detected` 一类字段**（含任何嵌套层级） | `data/fixtures/page-NN/truth.json` | `tests/truth-shape.test.mjs`（8 组变异） |
| **K22** | **真值形态两层守门**：① 冻结产物形态（直接读盘 + 独立复算，不复用生成器内部结构）② 再生成位级一致（`npm run fixtures:check`）。改任何一处都要能被"改坏生成器"的变异打红 | `tools/gen-fixtures.mjs` / `tests/*fixtures*` | `tests/fixtures-frozen.test.mjs`（4 组变异） |
| **K23** | **fixture 产物一律生成、禁手编**：`data/fixtures/**`（含 `COVERAGE.md`、`README.md`、`stress-5k/`）；手工改页面必须改生成器后 `npm run fixtures` | `tools/gen-fixtures.mjs` | `fixtures:check` + `tests/fixtures-frozen.test.mjs` |
| **K24** | **基准侧与采集侧同语义**：定位串 `tag:nth(i)`（i = 同标签兄弟下标）；文本节点的路径 = 父元素路径；`nearby-text` = 父元素文本减自身；空串是合法证据 | `data/fixtures/README.md`（契约）/ `src/content/collector.js`（实装） | `tests/truth-shape.test.mjs`（独立回解）+ M2 基准 |
| **K25** | **压力页规模只在 manifest**：`thresholds.stress_node_count`；生成器与测试都读它 | `rules/manifest.json` | `tests/fixtures-frozen.test.mjs` |

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-19 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24。
- `py -0p` 有 **3.8 与 3.12** 两条通道（本项目不用 Python；工具全在 Node）。
- `gh` 2.93.0 可用；**本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：
  推码失败先重试 3~4 次，或 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：
  验收中文文件走 `node -e` 读回或解析器回读。
- **未接远端**：`git remote -v` 为空 → **一次 CI 都没跑过**；`plan/06` 里的 CI 项一律写"待首推验证"。
- **`fixtures:check` 是重量级门**（要重新生成 124 个文件）：它已进 `verify`，别在循环里反复调；
  本机实测 `node tools/gen-fixtures.mjs --check` 约 2.1s（`npm run fixtures:check` 约 3.2s，多出来的是 npm/node 启动开销）；
  `tests/fixtures-frozen.test.mjs` 的两组变异要在临时目录里复制整棵 `data/`，整个测试文件约 10s。
- **本机自动化拉浏览器不稳**（有实测史）→ M2 的浏览器冒烟缺浏览器时**显式 SKIP**，不得据此打 ✅。

## 5. DoD 逐项 checklist（M1）

- [x] 40 页 fixture（`page.html` + `style-map.json` + `truth.json`）
- [x] 真值只存输入与期望（正/负两栏，条目形态统一；无任何"观测"字段）
- [x] `snippet_expected` 逐字出现在 `page.html`（生成期断言 + 守门独立复算，48/48）
- [x] 站点名/域名白名单断言（生成器内 + 守门测试；页面零外链、零真实号段）
- [x] 每规则 ≥ `min_cases_per_rule` 正样本（4/规则）+ 负样本覆盖"看起来像但不成立"（2/规则）
- [x] `COVERAGE.md` 由真值汇总生成，计数与真值实测一致
- [x] `npm run fixtures:check` 位级一致（124 文件）
- [x] 两层守门都在 + 变异：改坏生成器 → 至少一层红（实测 4 组全红）
- [x] 压力页（5007 节点，规模读 manifest）
- [ ] M2–M5 的功能与基准 —— 见 §2（本棒不做）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，不需要 npm install）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify -- --strict             # 未启用段 → 以退码 1 收尾（M6 用）
npm run fixtures                       # 生成/覆盖 data/fixtures/（40 页 + 真值 + 覆盖矩阵 + 压力页）
npm run fixtures:check                 # 再生成位级一致（冻结产物 vs 重生成）
npm run rules:hash                     # 重新生成 ruleset_hash 与 src/lib/rules-pack.js
npm run rules:hash -- --check          # 只核对（不一致即 exit 1）
npm run build                          # dist/ + release/pattern-lens-<version>.zip
npm run build:check                    # 重生成逐字节一致自检
```

**收尾实测（M1 同轮补记）**：见 `plan/06` §三「M1 出口证据」；本文件不预填未跑出的数字。
