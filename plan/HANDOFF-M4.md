# HANDOFF-M4 —— 启动第 4 棒（M4 侧边栏取证台）时读的交接单

> 本文档由 **M3 收尾时**写成（2026-10-19）。命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。
> **新对话的第一动作**：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）——**先跑它**，红了先修布局。

## 1. 当前进度 + 证据（M3 收尾时实测）

**M3 已完成**：页内取证高亮层（Shadow DOM 覆盖层 + 编号徽标 + 双向联动 + 幂等清除 + locator 失效分支），
并**首次跑通真实浏览器冒烟**（本机 Chrome 155 可用，CDP 零依赖驱动）。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 4 / 状态副本 3」） |
| 覆盖层测试 | `node --test tests/overlay-dom-diff.test.mjs` | **21 项全通过**；Shadow DOM 单容器 + diff=0 + 编号一一对应 + 幂等 + 双向联动 + 失效分支 + 3 组可证伪自证 |
| 单元与门测试 | `npm test` | **174 项全通过**（0 fail），**19** 个测试文件（逐文件登记在 `package.json`，由 `tests/test-manifest.test.mjs` 守门） |
| **浏览器冒烟** | `npm run smoke:overlay` | **全绿**（Chrome 155 真实渲染路径）：30 节点 / 2 finding / 3ms；覆盖层 applied=2 stale=[] shadow=true；**真实鼠标点击**徽标 → 发出 `focus-finding` + 闪烁；`focus-finding` 回解 F-02 → focused；清除后三项判据归零 |
| 冒烟可证伪 | 变异 `layer.append(badge)` → 宿主 body | **2 项 FAIL**（节点数 25→28 非 +1；徽标取不到）——证明冒烟判据真的会红；还原后逐字节复位 |
| 全量自检 | `npm run verify` | **18 段 PASS / 2 段 not_enabled**，rc=0（共 20 段）；`overlay.diff` 由 not_enabled 转为**实跑段** |
| 注入链路（含方向纪律） | `tests/injection-chain.test.mjs` | 侧边栏来源的 apply/clear/focus 三条**逐条转发**；**页内来源的 focus-finding 零转发**（否定性事实）+ 不触发注入 |
| 构建 | `npm run build` + `npm run build:check` | `dist/` 16 个文件 / 145,831 字节；`release/pattern-lens-0.1.0.zip` 147,697 字节；重生成逐字节一致 |
| 规则包 | `npm run rules:hash -- --check` | `ruleset_hash` **不变**（`b81d12e8…`；M3 未改规则数据与阈值） |
| fixture | `npm run fixtures:check` | 124 文件位级一致（M3 未动 fixture） |
| 规则基准 | `npm run bench` | B1–B7 全达标（未受 M3 影响；压力页冷 131.9ms / 热 137.1ms） |
| CI | **未接远端 → 从未跑过** | 本地等价校验 = CI 工作流静态自查 + 逐步骤手工复跑；**CI 待首推验证** |

**M3 落的文件与口径（都要知道）**：

1. **`src/content/overlay.js`**（新增，已登记进 `BUNDLE_ORDER`）：覆盖层唯一实现处。宿主 = 自定义元素 `pattern-lens-overlay`，
   样式**只在 shadow root 内**（D32）。导出 `applyOverlay` / `clearOverlay` / `focusFinding` / `handleOverlayMessage` / `overlayState`。
2. **编号是搬运工不是产出者**（D33）：覆盖层**不排序、不重编号**，`finding_id` 由 `src/lib/ordering.js` 单点产出（K5）；
   徽标 `textContent` 与 `dataset.findingId` 都取该编号 → 页内徽标与侧边栏条目**天然一一对应**。
3. **SW 加了方向纪律**（D34）：`src/background/service-worker.js` 里 `apply/clear/focus` 三条消息，
   **带 `sender.tab`（页内发起）→ 回 `{status:"from_content"}` 不转发**；无 `sender.tab`（侧边栏发起）→ 转发给当前标签页。
   否则点徽标会"闪两下"。**改 SW 时别把这层判断删掉**。
4. **侧边栏反向半程**（`src/sidepanel/sidepanel.js` 的 `highlightFinding()` + `sidepanel.css` 的 `.finding.is-focused`）：
   收到 `focus-finding` → 按 `data-finding-id` 高亮条目并滚进视野。M4 渲染条目时**必须保留 `data-finding-id`**（否则反向联动断链）。
5. **`tools/smoke-overlay.mjs`**（新增，`npm run smoke:overlay`）：真实浏览器冒烟，**刻意不进 CI / 不进 `npm test`**（D35）。
   它把 `tools/bundle.mjs` 的**真实拼接产物**注入页面 + 末尾加探针；拉不起浏览器时**显式 SKIP（rc=0）**。

## 2. 下一棒待办（M4：侧边栏取证台）

按 `plan/06` §二 M4 DoD 逐条做，实现落点与口径在 `plan/04` M4 段：

1. **四组分组顺序与条目归属来自规则包**（`RULESET.categories` / 规则 `category`），**UI 不写死**（M4 DoD 第 1 项）。骨架已在 `sidepanel.js` 的 `renderGroups()`。
2. **冷启动恢复一致 + SW 被回收后重开仍可恢复**（M4 DoD 第 2 项）：结果读 `chrome.storage.session.LastScan`；
   落点 = `sidepanel.js` 的 `loadLastScan()` + SW 的 `storeLastScan()`。新增测试文件 `tests/sidepanel-restore.test.mjs`（假 chrome 运行时离线验）→ **必须登记进 `package.json` 的 `scripts.test`**（K16），并把 `verify` 的 `sidepanel.restore` 段由 not_enabled 转实跑。
3. **空结果文案 = "本页未发现符合规则的证据" + 扫描时间 + 节点数**（M4 DoD 第 3 项）；文案单点 `src/lib/copy.js`（K9）；禁用词扫描须过（`tests/copy-guard.test.mjs`）。
4. **`LastScan` 结构含 `url` / `scanned_at` / `scan_result`**（M4 DoD 第 4 项）：注意当前 SW 存的是 `{url, scanned_at, scan}`（`plan/03` §三 写的是 `scan_result`）——**先对齐口径再落测试**（要么改文档、要么改字段，别两边各写一份）。
5. 收尾：`plan/00` §5 + `plan/06` §一 + `README.md` 状态行三处同改 → 写 `plan/HANDOFF-M5.md` → commit。

**M4 不要碰的东西**：`src/lib/rules-pack.js`（生成物）、阈值（只在 `rules/manifest.json`）、`plan/01`（题面定稿）、
`data/fixtures/` 的冻结产物、**`src/content/overlay.js` 的编号搬运口径**（D33——UI 也不得再排序/再编号，K5 对两侧都成立）。

## 3. 既定口径清单（K 编号；"动了会打挂测试"的约定）

> 下表即本仓的 **K 口径**总表（自 M2 起冻结 K1–K28；M3 未新增 K，只新增 **D32–D35** 四条决策）。

| K | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| K1 | **数值阈值只在 `rules/manifest.json`**；`src/**` 与 `rules/dp-*.json` 不得出现第二份 | `rules/manifest.json` | `tests/threshold-token.test.mjs`（豁免：生成物镜像、整数 < 100 的常数） |
| K2 | `src/lib/rules-pack.js` 是**生成物**，禁手改；改规则 → `npm run rules:hash` | `tools/hash-rules.mjs` | `hash-rules --check` + `tests/rules-schema.test.mjs` |
| K3 | **证据门禁**：`evidence_required` 取不到 → 丢弃并记 `rejected`；**空串算"取到了"** | `src/lib/engine.js` | `tests/engine-gate.test.mjs` + 基准 B2 |
| K4 | 同一节点多规则命中 → 按 `match_priority` 先到先得，一个节点只出一条 | `rules/manifest.json` | `tests/engine-gate.test.mjs` / `engine-order.test.mjs` |
| K5 | 排序 = severity 降序 → `dom_order` 升序；编号 `F-01…`；**UI 与导出都不得再排序**（M3 起覆盖层同样遵守，D33） | `src/lib/ordering.js` | `tests/engine-order.test.mjs` + 基准 B3 + `tests/overlay-dom-diff.test.mjs`（编号一一对应） |
| K6 | `snippet` 必须是宿主文本**原样子串**；截断只从尾部 + 标 `snippet_truncated` | `src/lib/page-model.js` | `tests/snippet-verbatim.test.mjs` + 基准 B4 |
| K7 | 导出字段顺序 = 契约；导出**不读时钟** | `src/lib/export.js` | `tests/export.test.mjs` |
| K8 | 权限白名单单点 + **无 `content_scripts`** + `host_permissions` 空 | `tools/permissions-whitelist.mjs` | `tests/manifest-permissions.test.mjs` + `tests/injection-chain.test.mjs` |
| K9 | 文案单点 `src/lib/copy.js`；禁用词表 `COPY.bannedWords`（含阳性对照）。**M3 新增**：失效文案 `COPY.locatorStale` 也只此一处 | `src/lib/copy.js` | `tests/copy-guard.test.mjs` + `tests/overlay-dom-diff.test.mjs`（不内联失效文案） |
| K10 | `src/lib/**` 是**纯核心**：不得出现 `chrome`/`document`/`window`；lib 间只允许相对 import | `src/lib/*` | `tests/source-hygiene.test.mjs` |
| K11 | 拼接顺序单点 = `BUNDLE_ORDER`（`tools/bundle.mjs`）；新增模块必须登记 | `tools/bundle.mjs` | `tests/build.test.mjs`（M3 加严：断言 `src/content/**` 全部登记） |
| K12 | 安装面白名单 = `RUNTIME_WHITELIST`；新增 `src/lib` 文件必须登记 | `tools/build-extension.mjs` | `tests/build.test.mjs` |
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

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-19 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24。
- `py -0p` 有 **3.8 与 3.12** 两条通道（本项目不用 Python；工具全在 Node）。
- `gh` 2.93.0 可用；**本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：
  推码失败先重试 3~4 次，或 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：验收中文文件走 `node -e` 读回或解析器回读。
- **未接远端**：`git remote -v` 为空 → **一次 CI 都没跑过**；`plan/06` 里的 CI 项一律写"待首推验证"。
- **`fixtures:check` 是重量级门**（重新生成 124 个文件，约 3.2s）；别在循环里反复调。
- **`npm test` 现在约 7s**（19 个文件；`tests/rules-bench.test.mjs` 的 3 组探活要复制整棵仓库，约 5s）。
  跑单文件更快：`node --test tests/overlay-dom-diff.test.mjs`（约 0.15s）。
- **`tools/bench-rules.mjs` 的 B7 是墙钟测量**：本机实测有波动（M3 轮 131.9ms / 137.1ms），离 500ms 预算余量充足；
  它**只测量、不进任何产物**。
- **本机 Chrome 可用且可自动化**（2026-10-19 实测 **Chrome 155.0.8059.80**）：
  `tools/smoke-overlay.mjs` 用 `--headless=new --remote-debugging-port=<port>` + CDP over **Node 自带 WebSocket**（零依赖）驱动，
  `Input.dispatchMouseEvent` 可发**真实点击**。**口径**：脚本自带"拉不起来 → 显式 SKIP（rc=0）"，故本机/CI 都不会假红。
  - 坑①：Windows 上 Chrome 退出后 `rmSync(profile)` 可能 `EPERM`（句柄未释放）→ 脚本已 `try/catch` 吞掉，不影响结论。
  - 坑②：`--headless=new` 下 `chrome://newtab` 等 UI 目标会出现，选 target 要按 `type === "page" && url.startsWith("file:")` 过滤。
  - 坑③：探针要把函数名**写进 window 对象字面量**；先 `let` 后 `window.xxx = () => ...` 的形态在页面内会 `is not a function`。
- **`src/background/service-worker.js` 现在有 `HAS_RUNTIME` 守卫**：没有扩展运行时时不挂监听（`tests/injection-chain.test.mjs` 依赖这一点）。改动 SW 时别把监听挂回顶层。
- **`src/content/scanner.js` 现在挂了一个 `chrome.runtime.onMessage` 监听**（覆盖层消息入口）：它**同步**返回结果，故 **不需要 `return true`**。若以后加异步分支，记得补 `return true`。

## 5. DoD 逐项 checklist（M3）

- [x] 覆盖层为 Shadow DOM，宿主页面只多一个容器节点（假 DOM 节点数恰好 +1 + 真实浏览器复核）
- [x] 清除后 DOM 快照 diff = 0（属性集 / 节点数 / `document.styleSheets.length` 三项；假 DOM + 真实浏览器双侧）
- [x] 徽标编号与侧边栏编号一一对应；重复高亮幂等（第 2 次起 `applied=0`，徽标数不变）
- [x] 双向联动可用（真实浏览器真实点击；SW 按来源区分方向，页内来源零转发）
- [x] locator 失效分支显式提示，不静默跳过（`COPY.locatorStale` 单点；失效不出徽标、出提示、幂等）
- [x] 冒烟可证伪（变异 → 2 项 FAIL，还原后逐字节复位）
- [ ] M4–M5 的功能与基准 —— 见 §2（本棒不做）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，19 个文件，约 7s）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify -- --strict             # 未启用段 → 以退码 1 收尾（M6 用）
npm run smoke:overlay                  # 真实浏览器冒烟（真实点击双向联动；缺浏览器显式 SKIP）
npm run bench                          # 规则基准 B1–B7（逐样本点名报告；rc=0 全达标）
npm run fixtures                       # 生成/覆盖 data/fixtures/（40 页 + 真值 + 覆盖矩阵 + 压力页）
npm run fixtures:check                 # 再生成位级一致（冻结产物 vs 重生成）
npm run rules:hash                     # 重新生成 ruleset_hash 与 src/lib/rules-pack.js
npm run rules:hash -- --check          # 只核对（不一致即 exit 1）
npm run build                          # dist/ + release/pattern-lens-<version>.zip
npm run build:check                    # 重生成逐字节一致自检
```

**收尾实测（M3 同轮补记）**：见 `plan/06` §三之三「M3 出口证据」；本文件不预填未跑出的数字。
