# HANDOFF-M5 —— 启动第 5 棒（M5 导出与设置）时读的交接单

> 本文档由 **M4 收尾时**写成（2026-10-19）。命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。
> **新对话的第一动作**：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）——**先跑它**，红了先修布局。

## 1. 当前进度 + 证据（M4 收尾时实测）

**M4 已完成**：侧边栏取证台（四组分组来自规则包 + `chrome.storage.session` 冷启动/SW 回收后恢复 + 站点级折叠 + 空态文案），
并把 `verify` 的 `sidepanel.restore` 段由 not_enabled 转**实跑**。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 5 / 状态副本 3」） |
| 侧边栏测试 | `node --test tests/sidepanel-restore.test.mjs` | **24 项全通过**；① 分组顺序 = 规则包 `categories`（倒序 categories → 顺序跟着变，可证伪）② 冷启动 + SW 回收后重开恢复**逐字一致** ③ 空态文案 = 固定文案 + 扫描时间 + 节点数 ④ `LastScan` 三字段 + 乱序到达不顶掉最新 ⑤ 站点级折叠（`<details open>` 只展开最新） |
| 单元与门测试 | `npm test` | **201 项全通过**（0 fail），**20** 个测试文件（逐文件登记在 `package.json`，由 `tests/test-manifest.test.mjs` 守门） |
| 全量自检 | `npm run verify` | **19 段 PASS / 1 段 not_enabled**，rc=0（共 20 段）；`sidepanel.restore` 由 not_enabled 转**实跑段** |
| 构建 | `npm run build` + `npm run build:check` | `dist/` **17** 个文件 / 158,206 字节；`release/pattern-lens-0.1.0.zip` 160,198 字节；重生成逐字节一致 |
| 规则包 | `npm run rules:hash -- --check` | `ruleset_hash` **不变**（`b81d12e8…`；M4 未改规则数据与阈值） |
| fixture | `npm run fixtures:check` | 124 文件位级一致（M4 未动 fixture） |
| 规则基准 | `npm run bench` | B1–B7 全达标（未受 M4 影响；压力页 5007 节点冷 113.5ms / 热 122.5ms） |
| 浏览器冒烟 | `npm run smoke:overlay` | 全绿（Chrome 155 真实渲染路径）：30 节点 / 2 finding / 6ms；真实点击双向联动 + 三项判据归零 |
| CI | **未接远端 → 从未跑过** | 本地等价校验 = CI 工作流静态自查 + 逐步骤手工复跑；**CI 待首推验证** |

**M4 落的文件与口径（都要知道）**：

1. **`src/lib/sidepanel-view.js`**（新增，已登记进 `RUNTIME_WHITELIST`）：侧边栏**纯逻辑唯一实现处**——
   落盘记录形态 / 站点级折叠 / 四组分组 / 恢复决策。**纯函数**（K10：不碰扩展 API / DOM / 时钟），故可离线验收（D38）。
   导出 `LAST_SCAN_KEY` / `HISTORY_KEY` / `HISTORY_MAX` / `RESTORE_KIND` / `isScanRecord` / `scanRecordOf` /
   `appendHistory` / `latestScanOf` / `groupByCategory` / `planSiteGroups` / `staleHostOf` / `planRestore`。
   **它不进 `BUNDLE_ORDER`**（content script 用不到；同 `src/lib/export.js`）。
2. **`LastScan` 字段名已收敛为 `scan_result`**（D36）：`storeLastScan()`（SW）存 `{url, scanned_at, scan_result}`；
   `LastScan` 取**最新一次**（按扫描时间，不按写入顺序）。**改字段名只改 `scanRecordOf()` + 测试**。
   `tests/injection-chain.test.mjs` 与 `tests/sidepanel-restore.test.mjs` 双侧断言。
3. **新增第二个 session 键 `ScanHistory`**（D37）：站点级折叠用；扫描时间倒序、按 `(url, scanned_at)` 去重、上限 20。
   SW 落盘、sidepanel **只读**（不各存一份）；SW 加了 `get-scan-history` 消息分支。
4. **`sidepanel.js` 现在支持依赖注入**（`initSidepanel({doc, runtime})`，D38）：纯逻辑在 lib，DOM 侧靠
   假 DOM + 假 chrome 运行时验收。**`sidepanel.js` 里不得再出现分组名 / 分组顺序表**（`tests/sidepanel-restore.test.mjs` 枚举式断言）。
   自启动守卫仍是"有扩展运行时且 `typeof document !== "undefined"`"——离线测试**保留 `globalThis.chrome`**
   （SW 消息路由器要靠它读 storage），Node 里没有 `document` 故不会误启动。
5. **`tests/helpers/fake-dom.mjs` 补了 `createTextNode`**（sidepanel 的规则开关渲染要用）——文本节点最小形态。

## 2. 下一棒待办（M5：导出与设置）

按 `plan/06` §二 M5 DoD 逐条做，实现落点与口径在 `plan/04` M5 段：

1. **导出 UI 接线**（M5 DoD 第 1 项）：`sidepanel.js` 里 `export-md` / `export-json` 已接线（Blob + `<a download>`）；
   M5 要补的是**字段完整性**与**禁用规则列表**在 UI 侧的可复核（导出核心 `src/lib/export.js` 已定稿）。
2. **同一 `ScanResult` 导出两次字节一致**（M5 DoD 第 2 项）：`tests/export.test.mjs` 已有（M0 起）；M5 要把它接到 UI 导出路径。
3. **整轮扫描 + 导出 0 次网络请求**（M5 DoD 第 3 项）：`verify` 的 `export.zero_network` 段目前是 **not_enabled**——
   M5 要把它转**实跑**（源码断言 + 浏览器冒烟 resource 计数；缺浏览器时如实标注）。
   新增测试文件（如 `tests/export-zero-network.test.mjs`）→ **必须登记进 `package.json` 的 `scripts.test`**（K16）。
4. **站点黑名单命中 → 不注入（且 UI 明示"该站点已停用"）**（M5 DoD 第 4 项）：SW 侧与 UI 侧已在（`COPY.blockedSite`）；
   M5 补断言。**规则开关生效**（M5 DoD 第 5 项）：禁用规则不参与扫描、不出现在导出（`disabled_rule_ids` 已在 `ScanResult`）。
5. **`docs/商店素材清单.md` + `assets/store/` 实物逐项对账；`docs/隐私声明.md` 与权限白名单一致**（M5 DoD 第 6 项）。
6. **`README.md` 定稿**（M5 DoD 第 7 项）：安装、使用、规则说明、隐私承诺、局限披露。
7. 收尾：`plan/00` §5 + `plan/06` §一 + `README.md` 状态行三处同改 → 写 `plan/HANDOFF-M6.md` → commit。

**M5 不要碰的东西**：`src/lib/rules-pack.js`（生成物）、阈值（只在 `rules/manifest.json`）、`plan/01`（题面定稿）、
`data/fixtures/` 的冻结产物、`src/content/overlay.js` 的编号搬运口径（D33）、**`src/lib/sidepanel-view.js` 的落盘形态**
（D36/D37——导出字段顺序由 `src/lib/export.js` 单点决定，别在 UI 里再排一次）。

## 3. 既定口径清单（K 编号；"动了会打挂测试"的约定）

> 下表即本仓的 **K 口径**总表（自 M2 起冻结 K1–K28；M3 新增 D32–D35，**M4 新增 D36–D38**；K 编号未变）。

| K | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| K1 | **数值阈值只在 `rules/manifest.json`**；`src/**` 与 `rules/dp-*.json` 不得出现第二份 | `rules/manifest.json` | `tests/threshold-token.test.mjs`（豁免：生成物镜像、整数 < 100 的常数——`HISTORY_MAX=20` 在此豁免面内） |
| K2 | `src/lib/rules-pack.js` 是**生成物**，禁手改；改规则 → `npm run rules:hash` | `tools/hash-rules.mjs` | `hash-rules --check` + `tests/rules-schema.test.mjs` |
| K3 | **证据门禁**：`evidence_required` 取不到 → 丢弃并记 `rejected`；**空串算"取到了"** | `src/lib/engine.js` | `tests/engine-gate.test.mjs` + 基准 B2 |
| K4 | 同一节点多规则命中 → 按 `match_priority` 先到先得，一个节点只出一条 | `rules/manifest.json` | `tests/engine-gate.test.mjs` / `engine-order.test.mjs` |
| K5 | 排序 = severity 降序 → `dom_order` 升序；编号 `F-01…`；**UI 与导出都不得再排序** | `src/lib/ordering.js` | `tests/engine-order.test.mjs` + 基准 B3 + `tests/overlay-dom-diff.test.mjs` |
| K6 | `snippet` 必须是宿主文本**原样子串**；截断只从尾部 + 标 `snippet_truncated` | `src/lib/page-model.js` | `tests/snippet-verbatim.test.mjs` + 基准 B4 |
| K7 | 导出字段顺序 = 契约；导出**不读时钟** | `src/lib/export.js` | `tests/export.test.mjs` |
| K8 | 权限白名单单点 + **无 `content_scripts`** + `host_permissions` 空 | `tools/permissions-whitelist.mjs` | `tests/manifest-permissions.test.mjs` + `tests/injection-chain.test.mjs` |
| K9 | 文案单点 `src/lib/copy.js`；禁用词表 `COPY.bannedWords`（含阳性对照）。M3 加 `COPY.locatorStale`；**M4 起侧边栏空态也走 `COPY.emptyResult`（不内联）** | `src/lib/copy.js` | `tests/copy-guard.test.mjs` + `tests/sidepanel-restore.test.mjs` |
| K10 | `src/lib/**` 是**纯核心**：不得出现 `chrome`/`document`/`window`；lib 间只允许相对 import。**M4 起 `sidepanel-view.js` 同受此约束** | `src/lib/*` | `tests/source-hygiene.test.mjs` + `tests/sidepanel-restore.test.mjs`（K10 项） |
| K11 | 拼接顺序单点 = `BUNDLE_ORDER`（`tools/bundle.mjs`）；新增模块必须登记 | `tools/bundle.mjs` | `tests/build.test.mjs`（断言 `src/content/**` 全部登记） |
| K12 | 安装面白名单 = `RUNTIME_WHITELIST`；新增 `src/lib` 文件必须登记。**M4 加 `src/lib/sidepanel-view.js`** | `tools/build-extension.mjs` | `tests/build.test.mjs` + `tests/sidepanel-restore.test.mjs`（K11/K12 项） |
| K13 | `dist/` 与 `release/*.zip` 是构建产物（**不进 git**）；zip = stored + 固定时间戳 + `create_system=0` | `.gitignore` / `tools/build-extension.mjs` | `build-extension --check` + `tests/build.test.mjs` |
| K14 | 交接单命名：`plan/HANDOFF-M<k>.md` = 启动第 k 棒时读；M0 豁免；收尾棒要 `HANDOFF-M6` | `AGENTS.md` | `tools/check-sprint-layout.mjs` |
| K15 | 里程碑状态副本**三处**：`plan/00` §5、`plan/06` §一、`README.md` 状态行（同一次提交改完） | 三处 | 布局门 `LAYOUT.STATUS` |
| K16 | 测试文件必须登记进 `package.json` 的 `scripts.test`（逐文件列出；`node --test tests/` 目录形式会挂） | `package.json` | `tests/test-manifest.test.mjs` |
| K17 | 未实现能力用**显式退出码**拦截，**不伪造产物**；`verify` 里列 `not_enabled` 段 | `tools/verify.mjs` | `verify` 输出 + `--strict` |
| K18 | 里程碑 DoD 里的 CI 项：未推送只能写"本地等价校验（未接远端，CI 待首推验证）" | `plan/06` | 人工（诚实性纪律） |
| K19 | 样式条件分两档：`detect.style` = AND，`detect.style_any` = OR | `rules/dp-*.json` / `src/lib/page-model.js` | `tests/rules-schema.test.mjs` |
| K20 | 每条规则必须有非空 `limits`；缺它即拒绝加载 | `rules/dp-*.json` | `tests/rules-schema.test.mjs` |
| K21 | **真值只存输入与期望**：`{rule_id, selector_path, snippet_expected, note?}`；**禁 `observed_*`/`matched`/`detected` 一类字段** | `data/fixtures/page-NN/truth.json` | `tests/truth-shape.test.mjs`（8 组变异） |
| K22 | **真值形态两层守门**：① 冻结产物形态 ② 再生成位级一致 | `tools/gen-fixtures.mjs` / `tests/*fixtures*` | `tests/fixtures-frozen.test.mjs`（4 组变异） |
| K23 | **fixture 产物一律生成、禁手编**（含 `COVERAGE.md`、`README.md`、`stress-5k/`） | `tools/gen-fixtures.mjs` | `fixtures:check` + `tests/fixtures-frozen.test.mjs` |
| K24 | **基准侧与采集侧同语义**：定位串 `tag:nth(i)`；文本节点路径 = 父元素路径；`nearby-text` = 父元素文本减自身；空串是合法证据 | `data/fixtures/README.md` / `src/content/collector.js` / `tools/fixture-page-model.mjs` | `tests/truth-shape.test.mjs` + 基准 B4/B5 + `tests/collector-parity.test.mjs` |
| K25 | **压力页规模只在 manifest**：`thresholds.stress_node_count` | `rules/manifest.json` | `tests/fixtures-frozen.test.mjs` + 基准 B7 |
| K26 | **同一 `(rule_id, locator)` 只出一条 finding**；被丢的候选记 `rejected[].reason = "duplicate_locator"`（不静默） | `src/lib/engine.js` | `tests/rules-bench.test.mjs` |
| K27 | **`label` 的自身文本回退只对控件生效**；口径单点 `labelFrom()` | `src/lib/page-model.js` | `tests/rules-bench.test.mjs`（反事实对照） |
| K28 | **基准段 B1–B7 一律读 `rules/manifest.json` 的门槛**，缺件即 **FAIL**；报告必须双登记 | `tools/bench-rules.mjs` | `tests/rules-bench.test.mjs` + `tests/collector-parity.test.mjs` + `verify` 的 `rules.bench` 段 |

**M4 新增的 D 口径（动了会打挂测试）**：

| D | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| D36 | `LastScan` = `{url, scanned_at, scan_result}`（**`scan` 已收敛**）；`LastScan` 取最新一次（按扫描时间） | `src/lib/sidepanel-view.js` 的 `scanRecordOf()` | `tests/injection-chain.test.mjs` + `tests/sidepanel-restore.test.mjs` |
| D37 | 站点级折叠用第二个 session 键 `ScanHistory`；时间倒序、按 `(url, scanned_at)` 去重、上限 `HISTORY_MAX=20` | `src/lib/sidepanel-view.js` + SW | `tests/sidepanel-restore.test.mjs`（⑤ 组） |
| D38 | 侧边栏纯逻辑单列 `src/lib/sidepanel-view.js`；`sidepanel.js` 只做接线 + 依赖注入 | `src/sidepanel/sidepanel.js` | `tests/sidepanel-restore.test.mjs`（分组无硬编码 + K10 + 接线） |

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-19 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24。
- `gh` 2.93.0 可用；**本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：
  推码失败先重试 3~4 次，或 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：验收中文文件走 `node -e` 读回或解析器回读。
- **未接远端**：`git remote -v` 为空 → **一次 CI 都没跑过**；`plan/06` 里的 CI 项一律写"待首推验证"。
- **`fixtures:check` 是重量级门**（重新生成 124 个文件，约 3.2s）；别在循环里反复调。
- **`npm test` 现在约 8s**（20 个文件；`tests/rules-bench.test.mjs` 的 3 组探活要复制整棵仓库，约 5s）。
  跑单文件更快：`node --test tests/sidepanel-restore.test.mjs`（约 0.2s）。
- **改了 `src/**` 之后 `tests/build.test.mjs` 会红**（`dist/` 是上次构建的快照）——先 `npm run build` 再 `npm test`。
- **`tools/bench-rules.mjs` 的 B7 是墙钟测量**：本机实测有波动（M3 轮 131.9/137.1ms、M4 轮 113.5/122.5ms），离 500ms 预算余量充足；**它只测量、不进任何产物**。
- **本机 Chrome 可用且可自动化**（2026-10-19 实测 **Chrome 155.0.8059.80**）：
  `tools/smoke-overlay.mjs` 用 `--headless=new --remote-debugging-port=<port>` + CDP over **Node 自带 WebSocket**（零依赖）驱动，
  `Input.dispatchMouseEvent` 可发**真实点击**。**口径**：脚本自带"拉不起来 → 显式 SKIP（rc=0）"，故本机/CI 都不会假红。
  - 坑①：Windows 上 Chrome 退出后 `rmSync(profile)` 可能 `EPERM`（句柄未释放）→ 脚本已 `try/catch` 吞掉。
  - 坑②：`--headless=new` 下 `chrome://newtab` 等 UI 目标会出现，选 target 要按 `type === "page" && url.startsWith("file:")` 过滤。
  - 坑③：探针要把函数名**写进 window 对象字面量**；先 `let` 后 `window.xxx = () => ...` 的形态在页面内会 `is not a function`。
  - **坑④（M4 新增）**：`npm run smoke:overlay` **只覆盖页内覆盖层**，**不覆盖侧边栏**——侧边栏的 DOM 侧验收只有假 DOM。
- **`src/background/service-worker.js` 有 `HAS_RUNTIME` 守卫**：没有扩展运行时不挂监听（`tests/injection-chain.test.mjs` 依赖它）。
  改动 SW 时别把监听挂回顶层；**SW 现在用 `storage.session.get(HISTORY_KEY)` 读历史再写回**（落 `LastScan` + `ScanHistory` 两个键）。
- **离线验收侧边栏时要保留 `globalThis.chrome`**（`tests/sidepanel-restore.test.mjs` 的踩坑）：
  假 SW 的消息路由器靠它读 `storage.session`；若把全局删掉，`get-last-scan` 会返回空 → 恢复判据假红。
  侧边栏**不会误启动**（自启动守卫还要求 `typeof document !== "undefined"`，Node 里为 false）。
- **`tests/helpers/fake-dom.mjs` 的 `querySelectorAll` 只支持 `tag` / `.class` / `#id` / `.class[data-x="y"]`**；
  `index.html` 自身有一个 `<details id="settings">`，测扫描折叠块要按 `.scan` 类取（别用裸 `details`）。

## 5. DoD 逐项 checklist（M4）

- [x] 四组分组顺序与条目归属来自规则包（改规则包 → UI 跟着变，UI 无硬编码；倒序 categories 可证伪）
- [x] 冷启动恢复一致；SW 被回收后重开仍可恢复（新模块实例、共享 `storage.session`；两次恢复逐字一致）
- [x] 空结果文案 = "本页未发现符合规则的证据" + 扫描时间 + 节点数（禁用词扫描通过；文案走 copy 单点）
- [x] 结果落 `chrome.storage.session`，`LastScan` 结构含 `url`/`scanned_at`/`scan_result`（字段名已收敛，D36）
- [x] 站点级折叠：同站点多次扫描按时间倒序折叠，默认展开最新一次（里程碑行承诺；D37）
- [x] `verify` 的 `sidepanel.restore` 段由 not_enabled 转实跑
- [ ] M5–M6 的功能与素材 —— 见 §2（本棒不做）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，20 个文件，约 8s）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify -- --strict             # 未启用段 → 以退码 1 收尾（M6 用）
npm run smoke:overlay                  # 真实浏览器冒烟（页内覆盖层真实点击；缺浏览器显式 SKIP）
npm run bench                          # 规则基准 B1–B7（逐样本点名报告；rc=0 全达标）
npm run fixtures                       # 生成/覆盖 data/fixtures/（40 页 + 真值 + 覆盖矩阵 + 压力页）
npm run fixtures:check                 # 再生成位级一致（冻结产物 vs 重生成）
npm run rules:hash                     # 重新生成 ruleset_hash 与 src/lib/rules-pack.js
npm run rules:hash -- --check          # 只核对（不一致即 exit 1）
npm run build                          # dist/ + release/pattern-lens-<version>.zip
npm run build:check                    # 重生成逐字节一致自检
```

**收尾实测（M4 同轮补记）**：见 `plan/06` §三之四「M4 出口证据」；本文件不预填未跑出的数字。
