# HANDOFF-M3 —— 启动第 3 棒（M3 页内取证高亮层）时读的交接单

> 本文档由 **M2 收尾时**写成（2026-10-19）。命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。
> **新对话的第一动作**：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）——**先跑它**，红了先修布局。

## 1. 当前进度 + 证据（M2 收尾时实测）

**M2 已完成**：引擎 + 采集器 + 按需注入链路 + B1–B7 规则基准（双边达标）+ 阈值 token 门禁 + 建模缺口处置（D29/D30）+ 性能修复（D31）。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 3 / 状态副本 3」） |
| 规则基准 | `npm run bench` | **B1–B7 全达标**；12/12 规则 precision/recall 达标；双登记 40 × 12 = **480** 组合；正 48 / 负 24 / finding **48** / **误报 0** / `rejected` **8**（全为 `suppressed`） |
| 证据门禁 | 基准 B2 | 8 类证据**逐类断供**：需要它的规则零产出 + `rejected` 非空 + 不需要它的规则不掉命中；1 处**顺延归属**（可解释）；按引用还原自证；语料侧"命中但证据取不到"候选 **0 个** |
| 双跑一致 | 基准 B3 | 40 页逐页比对（含打乱输入顺序）**逐字节一致** |
| snippet / locator | 基准 B4 / B5 | 48 条逐条是 `page.html` 原样子串；**截断分支实测未走到（truncated = 0）**；48 finding + 8 rejected 全部回解到节点 |
| 超时分支 | 基准 B6 | `runScan` 真实入口：截断分支非空 + `truncated: true`；阴性对照 `truncated: false` |
| 5k 耗时 | 基准 B7 | 5007 节点：冷 **106.5ms** / 热 **114.2ms**（预算 500ms） |
| 探活（可证伪） | `tests/rules-bench.test.mjs` | **3 组全红**：引擎侧中和项短路 → precision 边；数据侧删 `nearby_absent_any` → 误报边；数据侧加不可满足 `text_all` → recall 边。每组变红后还原并**断言字节已还原** |
| 建模缺口反事实 | `tests/rules-bench.test.mjs` | 常驻 2 项：恢复缺口形态 → 误报 **85** 条（基线 0，断言 ≥ 60）+ 四条文本级规则 precision 掉到 **0.1379~0.1667**（断言 < 门槛）——证明 D29 是载荷的 |
| 阈值单点 | `tests/threshold-token.test.mjs` | 剥注释扫 `src/**` + `rules/dp-*.json` **零命中**；阳性/阴性对照齐备；豁免清单打印（豁免 3、40） |
| 采集侧 ↔ 基准侧同语义 | `tests/collector-parity.test.mjs` | 假 DOM 逐节点比对 40 页（`path/kind/text/label/nearText/attrs/style/contrast/box`）**全等**；**一上就抓出 2 个真实缺陷**（见下）；同语义自证（注入差异必报）+ 只读纪律（比对后宿主未变） |
| 注入链路 | `tests/injection-chain.test.mjs` | 假 chrome 离线跑通；黑名单 → `executeScript` **一次都没调用**；注入失败显式报错 |
| 单元与门测试 | `npm test` | **150 项全通过**（0 fail），**18** 个测试文件（逐文件登记在 `package.json`，由 `tests/test-manifest.test.mjs` 守门） |
| 全量自检 | `npm run verify` | **17 段 PASS / 3 段 not_enabled**，rc=0（共 20 段；`rules.bench` 由未启用段转为**实跑 gate**；新增 `threshold.token` / `collector.parity` / `injection.chain`） |
| 构建 | `npm run build` + `npm run build:check` | `dist/` 16 个文件 / 130,172 字节；`release/pattern-lens-0.1.0.zip` 132,038 字节；重生成逐字节一致 |
| 规则包 | `npm run rules:hash -- --check` | `ruleset_hash` **不变**（`b81d12e8…`；M2 未改规则数据与阈值） |
| fixture | `npm run fixtures:check` | 124 文件位级一致（`data/fixtures/README.md` 因口径补写而重生成，**页面与真值零变化**） |
| CI | **未接远端 → 从未跑过** | 本地等价校验 = CI 工作流静态自查 + 逐步骤手工复跑；**CI 待首推验证** |

**M2 顺手改严/改动的五处（都要知道）**：

1. **D29 建模缺口处置**：`label` 的自身文本回退**只对控件**生效（普通元素只取显式标签属性）。口径单点在 `src/lib/page-model.js` 的 `labelFrom()`；采集器、基准侧（`tools/fixture-page-model.mjs`）、生成器三处同调。
2. **D30 同一 locator 去重**：引擎按 `(rule_id, locator)` 去重（先到先得），被丢的候选记 `rejected[].reason = "duplicate_locator"`。**新增了一个 reject reason 取值**（`plan/04` M2 判定语义已补记）。
3. **D31 周边文本性能**：`limitNearText()` 改"按需翻倍前缀"归一（语义与通篇归一等价）；压力页冷启动 1313ms → 106.5ms。**`NEAR_TEXT_LIMIT`（200）从采集器搬到了 `src/lib/page-model.js`**（三处同调）。
4. **采集器缺陷①（parity 门抓出）**：采集器原用原生 `textContent`，会把 `<style>` 块里的 **CSS 文本**算进 `nearby-text`（`body` 的周边文本含整段样式表）→ 改为**跳过 SKIP_TAGS 子树**的 `textContentSkipping()`。**基准侧全绿也照不出这个缺陷**（基准侧走的是自己那套解析）。
5. **采集器缺陷②（parity 门抓出）**：采集器把 `contrast` 塞进了 `style` 对象，而证据登记表读的是 **`node.contrast`** → `contrast-ratio` 永远取不到，**`dp-dark-close` 在真实浏览器里永不产出**（基准侧因为直接构造节点而全绿）。改为 `styleOf()` 返回 `{style, contrast}`，顶层字段赋值。

## 2. 下一棒待办（M3：页内取证高亮层）

按 `plan/06` §二 M3 DoD 逐条做，实现落点与口径在 `plan/04` M3 段：

1. **Shadow DOM 覆盖层**：宿主页面**只多一个容器节点**；样式全在 shadow root 内（**禁**写宿主内联样式、禁 `document.head.appendChild`、禁插 `<style>` 到宿主 `document.head`）。落点 = `src/content/` 新模块 + `tools/bundle.mjs` 的 `BUNDLE_ORDER` 登记 + `tools/build-extension.mjs` 的 `RUNTIME_WHITELIST`（新增 `src/lib` 文件必须登记，否则 `tests/build.test.mjs` 红）。
2. **编号徽标**：编号与侧边栏一致（`{finding_id: badge_id}` 映射），编号由 `src/lib/ordering.js` 单点产出（**UI 不得再排序/再编号**，K5）。
3. **双向联动**：侧边栏点条目 → 滚动定位 + 闪烁徽标；点徽标 → 侧边栏高亮条目。消息名已定：`apply-overlay` / `clear-overlay` / `focus-finding`（`plan/03` §三；SW 侧转发分支**已实现**）。
4. **清除取证层** → 移除容器与全部徽标；**幂等**（重复高亮同一 finding 不产生重复徽标）。
5. **locator 失效分支**：回解不到节点（页面已变化）→ 该条目显式提示"元素已失效（页面可能已变化）"（文案单点在 `src/lib/copy.js` 的 `COPY.locatorStale`），**不静默跳过**。回解函数 `resolveLocator` 已在 `src/content/collector.js`。
6. **DOM diff = 0**：清除后断言属性集 / 节点数 / `document.styleSheets.length` **三项**（新增测试文件 → 必须登记进 `package.json` 的 `scripts.test`，K16）。
7. **浏览器冒烟**：真实点击的双向联动——**本机自动化拉浏览器不稳（有实测史）**，缺浏览器时**显式 SKIP 并记入已知未验证项**，不得据此打 ✅。
8. 收尾：`plan/00` §5 + `plan/06` §一 + `README.md` 状态行三处同改 → 写 `plan/HANDOFF-M4.md` → commit。

**M3 不要碰的东西**：`src/lib/rules-pack.js`（生成物，改规则用 `npm run rules:hash`）、阈值（只在 `rules/manifest.json`）、
`plan/01`（题面定稿不改写，勘误走 `plan/00` 决策记录）、**`data/fixtures/` 的冻结产物**（要改必须改生成器后 `npm run fixtures`）。

## 3. 既定口径清单（K 编号；"动了会打挂测试"的约定）

> 下表即本仓的 **K 口径**总表（自 M2 起冻结 K1–K28）；M2 新增的是 **K26 / K27 / K28**，K1 由"文档级纪律"升级为**机器判据**。

| K | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| K1 | **数值阈值只在 `rules/manifest.json`**；`src/**` 与 `rules/dp-*.json` 不得出现第二份 | `rules/manifest.json` | `tests/threshold-token.test.mjs`（**M2 落地**：剥注释扫 + 阳性/阴性对照 + 两条已声明豁免：生成物镜像 `rules-pack.js`、整数 < 100 的常数） |
| K2 | `src/lib/rules-pack.js` 是**生成物**，禁手改；改规则 → `npm run rules:hash` | `tools/hash-rules.mjs` | `hash-rules --check` + `tests/rules-schema.test.mjs` |
| K3 | **证据门禁**：`evidence_required` 取不到 → 丢弃并记 `rejected`（不是降级）；**空串算"取到了"** | `src/lib/engine.js` | `tests/engine-gate.test.mjs` + 基准 B2 |
| K4 | 同一节点多规则命中 → 按 `match_priority` 先到先得，**一个节点只出一条** | `rules/manifest.json` | `tests/engine-gate.test.mjs` / `engine-order.test.mjs` |
| K5 | 排序 = severity 降序 → `dom_order` 升序；编号 `F-01…`；**UI 与导出都不得再排序** | `src/lib/ordering.js` | `tests/engine-order.test.mjs` + 基准 B3 |
| K6 | `snippet` 必须是宿主文本**原样子串**；截断只从尾部 + 标 `snippet_truncated` | `src/lib/page-model.js` | `tests/snippet-verbatim.test.mjs` + 基准 B4 |
| K7 | 导出字段顺序 = 契约（`EXPORT_TOP_FIELDS` / `EXPORT_FINDING_FIELDS`）；导出**不读时钟** | `src/lib/export.js` | `tests/export.test.mjs` |
| K8 | 权限白名单单点 + **无 `content_scripts`** + `host_permissions` 空 | `tools/permissions-whitelist.mjs` | `tests/manifest-permissions.test.mjs` + `tests/injection-chain.test.mjs` |
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
| K21 | **真值只存输入与期望**：`positives[]` / `negatives[]` 条目形态统一 = `{rule_id, selector_path, snippet_expected, note?}`；**禁 `observed_*`/`matched`/`detected` 一类字段**（含任何嵌套层级） | `data/fixtures/page-NN/truth.json` | `tests/truth-shape.test.mjs`（8 组变异） |
| K22 | **真值形态两层守门**：① 冻结产物形态 ② 再生成位级一致。改任何一处都要能被"改坏生成器"的变异打红 | `tools/gen-fixtures.mjs` / `tests/*fixtures*` | `tests/fixtures-frozen.test.mjs`（4 组变异） |
| K23 | **fixture 产物一律生成、禁手编**（含 `COVERAGE.md`、`README.md`、`stress-5k/`） | `tools/gen-fixtures.mjs` | `fixtures:check` + `tests/fixtures-frozen.test.mjs` |
| K24 | **基准侧与采集侧同语义**：定位串 `tag:nth(i)`；文本节点的路径 = 父元素路径；`nearby-text` = 父元素文本减自身；空串是合法证据 | `data/fixtures/README.md` / `src/content/collector.js` / `tools/fixture-page-model.mjs` | `tests/truth-shape.test.mjs` + 基准 B4/B5 |
| K25 | **压力页规模只在 manifest**：`thresholds.stress_node_count`；生成器与测试都读它 | `rules/manifest.json` | `tests/fixtures-frozen.test.mjs` + 基准 B7 |
| **K26** | **同一 `(rule_id, locator)` 只出一条 finding**（先到先得 = 文档序在前者胜）；被丢的候选记 `rejected[].reason = "duplicate_locator"`（**不静默**） | `src/lib/engine.js` | `tests/rules-bench.test.mjs`（B5 + 专门用例） |
| **K27** | **`label` 的自身文本回退只对控件生效**（普通元素只取 `aria-label`/`title`/`placeholder`/`alt`）；口径单点 `labelFrom()` | `src/lib/page-model.js` | `tests/rules-bench.test.mjs`（反事实对照：恢复缺口 → 误报 > 10 条） |
| **K28** | **基准段 B1–B7 一律读 `rules/manifest.json` 的门槛**，缺件即 **FAIL**（不是 SKIP）；报告必须双登记 + 声明"合成基准，非穷举真实站点"；无负样本记 `not_assessed`（不填 1.0） | `tools/bench-rules.mjs` | `tests/rules-bench.test.mjs`（17 项）+ `tests/collector-parity.test.mjs`+ `verify` 的 `rules.bench` 段 |

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-19 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24。
- `py -0p` 有 **3.8 与 3.12** 两条通道（本项目不用 Python；工具全在 Node）。
- `gh` 2.93.0 可用；**本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：
  推码失败先重试 3~4 次，或 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：
  验收中文文件走 `node -e` 读回或解析器回读。
- **未接远端**：`git remote -v` 为空 → **一次 CI 都没跑过**；`plan/06` 里的 CI 项一律写"待首推验证"。
- **`fixtures:check` 是重量级门**（要重新生成 124 个文件，约 3.2s）；它已进 `verify`，别在循环里反复调。
- **`npm test` 现在约 9s**（M2 新增 `tests/rules-bench.test.mjs`：3 组探活要在临时目录里复制整棵仓库，约 5s）；
  跑单文件更快：`node --test tests/rules-bench.test.mjs`（或 `tests/collector-parity.test.mjs`，约 50ms）。
- **`tools/bench-rules.mjs` 的 B7 是墙钟测量**：本机 106~137ms 有波动，但离 500ms 预算余量充足；
  它**只测量、不进任何产物**（产物里的 `elapsed_ms` 由调用方注入，基准里固定为 0 → 双跑字节一致）。
- **本机自动化拉浏览器不稳**（有实测史）→ M3 的浏览器冒烟缺浏览器时**显式 SKIP**，不得据此打 ✅。
- **`src/background/service-worker.js` 现在有 `HAS_RUNTIME` 守卫**：没有扩展运行时时不挂监听，模块可被离线单测 import
  （`tests/injection-chain.test.mjs` 依赖这一点）。改动 SW 时别把监听挂回顶层。

## 5. DoD 逐项 checklist（M2）

- [x] `rules/manifest.json` 含版本、阈值、枚举、匹配优先级、fixture 规模（唯一数值真相源）
- [x] 12 条规则全部含 `rule_id`/`name`/`category`/`severity`/`detect`/`evidence_required`/`locator_strategy`/`explanation`（+ `limits`）
- [x] 逐规则 precision ≥ `thresholds.precision_min`、recall ≥ `thresholds.recall_min`（双边门 + 逐样本点名；12/12 达标）
- [x] 无证据节点的规则**零产出**（按类断供证据 8 类 + 反向对照 + 按引用还原自证）
- [x] 同一页面同一规则包 findings 排序稳定（40 页双跑逐字节一致）
- [x] 5k 节点页面：解析 + 判定 < `thresholds.first_result_budget_ms`（冷 106.5ms / 热 114.2ms）
- [x] 超时 → 部分结果 + `truncated: true`（走 `runScan` 真实入口 + 阴性对照）
- [x] manifest 无 `content_scripts`；权限白名单断言通过（`host_permissions` 为空）+ 黑名单站点零注入
- [x] 阈值 token 门禁：`src/**` 与 `rules/dp-*.json` 内无第二份阈值数字（两条已声明豁免）
- [ ] **浏览器冒烟**（真实渲染路径 / 注入时序）——本棒**未做**，已登记 `plan/06` §五（不据此打 ✅）
- [ ] M3–M5 的功能与基准 —— 见 §2（本棒不做）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，不需要 npm install；18 个文件，约 9s）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify -- --strict             # 未启用段 → 以退码 1 收尾（M6 用）
npm run bench                          # 规则基准 B1–B7（逐样本点名报告；rc=0 全达标）
npm run bench -- --json                # 同上，附机器可读汇总
npm run fixtures                       # 生成/覆盖 data/fixtures/（40 页 + 真值 + 覆盖矩阵 + 压力页）
npm run fixtures:check                 # 再生成位级一致（冻结产物 vs 重生成）
npm run rules:hash                     # 重新生成 ruleset_hash 与 src/lib/rules-pack.js
npm run rules:hash -- --check          # 只核对（不一致即 exit 1）
npm run build                          # dist/ + release/pattern-lens-<version>.zip
npm run build:check                    # 重生成逐字节一致自检
```

**收尾实测（M2 同轮补记）**：见 `plan/06` §三之二「M2 出口证据」；本文件不预填未跑出的数字。
