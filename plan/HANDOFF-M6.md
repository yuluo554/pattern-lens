# HANDOFF-M6 —— 启动第 6 棒（M6 发布）时读的交接单

> 本文档由 **M5 收尾时**写成（2026-10-19）。命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。
> **新对话的第一动作**：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）——**先跑它**，红了先修布局。

## 1. 当前进度 + 证据（M5 收尾时实测）

**M5 已完成**：导出与设置——UI 导出接线（字段完整 + 双跑字节一致）、站点黑白名单与规则开关端到端、
整轮扫描 + 导出 0 网络请求（`verify` 段转实跑 + 真实浏览器 CDP 计数）、隐私声明与商店素材齐全、README 定稿。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 6 / 状态副本 3」） |
| 导出字段与双跑（UI 路径） | `node --test tests/export-fields.test.mjs` | **8 项全通过**（字段完整含规则包版本/哈希/禁用规则列表；UI 产物与核心逐字节同源；双跑一致；禁用规则不出现；无截图/整页 HTML/用户输入字段） |
| 站点开关与规则开关 | `node --test tests/site-settings.test.mjs` | **11 项全通过**（黑名单零注入 + UI 明示 + 冷启动分支；规则开关落 `storage.local`、禁用规则不进扫描/不进导出） |
| 0 网络请求（离线） | `node --test tests/zero-network.test.mjs` | **7 项全通过**（运行面源码断言 + `src/**`/manifest 断言 + 阳性对照 + 真实 `runScan→exportArtifact` 探针零调用） |
| 商店素材对账 + 隐私声明 | `node --test tests/store-assets.test.mjs` | **14 项全通过**（清单↔实物双向对账；图标/截图尺寸；简介一致；隐私声明逐项点名五项已申请 + 全部禁用权限） |
| 图标确定性 | `npm run store:icons:check` | 4 枚图标（16/32/48/128）与重生成逐字节一致 |
| 单元与门测试 | `npm test` | **244 项全通过**（0 fail），**24** 个测试文件（逐文件登记在 `package.json`，由 `tests/test-manifest.test.mjs` 守门） |
| 全量自检 | `npm run verify` | **23 段 PASS / 0 段 not_enabled**，rc=0（共 23 段）；`export.zero_network` 转实跑，新增 `export.fields` / `site.settings` / `store.assets` 三段 |
| 构建 | `npm run build` + `npm run build:check` | `dist/` **21** 个文件 / 161,776 字节；`release/pattern-lens-0.1.0.zip` 164,266 字节；重生成逐字节一致 |
| 规则包 | `npm run rules:hash -- --check` | `ruleset_hash` 不变（`b81d12e8…`；M5 未改规则数据与阈值） |
| fixture | `npm run fixtures:check` | 124 文件位级一致（M5 未动 fixture） |
| 规则基准 | `npm run bench` | B1–B7 全达标（未受 M5 影响） |
| 浏览器冒烟（导出与网络计数） | `npm run smoke:export` | 全绿（Chrome 155）：真实导出 4 次（Markdown 1,581 字节 / JSON 2,523 字节），Blob 与离线产物逐字节同源、双跑一致；**远程请求 0 条**（页内 1 条 / 侧边栏 9 条全 `file://`） |
| 浏览器冒烟（商店截图） | `npm run smoke:export -- --shots` | `screenshot-page.png` 1000×760 / `screenshot-sidepanel.png` 420×900 |
| 浏览器冒烟（页内覆盖层） | `npm run smoke:overlay` | 全绿（M3 能力未受 M5 影响） |
| CI | **未接远端 → 从未跑过** | 本地等价校验 = CI 工作流静态自查 + 逐步骤手工复跑；**CI 待首推验证** |

**M5 落的文件与口径（都要知道）**：

1. **`src/lib/export.js` 新增 `exportArtifact(scan, manifest, format)` + `EXPORT_FORMATS`**（D39）：导出**产物单点**
   ——返回 `{format, filename, mime, text}`；`sidepanel.js` 只做 `Blob` + `<a download>`（不自己拼文本/MIME/扩展名）。
   `runExport(format, scan?, manifest?)` 是 UI 侧的接线入口（导出可用性判据走它）。
2. **`sidepanel.js` 支持注入 `download` sink**（`initSidepanel({doc, runtime, download})`）：离线测试传假 sink，
   就能对 **UI 导出路径真正交出去的字节** 逐字节断言（`tests/export-fields.test.mjs`）。
   **`sidepanel.js` 里不得再出现 `toMarkdown(`/`toJsonText(`/`text/markdown`/`application/json`**（枚举式断言）。
3. **`tools/cdp.mjs`（新增，M5）**：浏览器自动化底座单点（D40）——`findBrowser` / `wait` / `cdpClient` /
   `evaluate` / `launch` / `skip` / **`smokeTmpRoot()`**。`smoke-overlay.mjs` 与 `smoke-export.mjs` 复用。
4. **`tools/smoke-export.mjs`（新增）**：真实浏览器里验导出与网络计数。口径：**拉不起来 → 显式 SKIP（rc=0）**，
   不进 CI（同 D35）。`--shots` 追加产出商店截图；`--keep` 保留浏览器进程。
5. **`tools/gen-store-icons.mjs`（新增）**：自写最小 PNG 编码器（`node:zlib` deflate + 自算 CRC32）确定性产出图标；
   `--check` 逐字节比对（D41）。**图标面新增素材只改这里的 `ICON_SIZES`**，同时要更新 `manifest.icons` 与 `RUNTIME_WHITELIST`。
6. **`manifest.json` 新增 `icons`**（16/32/48/128 → `assets/store/icon-*.png`）；`RUNTIME_WHITELIST` 加了这 4 个路径。
7. **新增测试文件已登记**（K16）：`tests/export-fields.test.mjs` / `tests/site-settings.test.mjs` /
   `tests/zero-network.test.mjs` / `tests/store-assets.test.mjs`；新增 helper `tests/helpers/sidepanel.mjs`（不进 dist）。
8. **`tools/verify.mjs`**：`export.zero_network` 由 `not_enabled` 转 `tests` 段；新增 `export.fields` / `site.settings` / `store.assets` 三段。
9. **`docs/` 三个新文档**：`docs/隐私声明.md`（零采集/权限逐项/数据流向/不采集什么）、
   `docs/商店素材清单.md`（素材逐项 + 生成方式 + 脱敏）、`docs/目录结构说明.md`（目录职责 + 进包口径）。
10. **`assets/store/`**：4 枚图标（生成物）+ 2 张截图（真实渲染产物）。

## 2. 下一棒待办（M6：发布）

按 `plan/06` §二 M6 DoD 与 `plan/07` §三「M6 发布执行清单」逐条做。**注意：M6 是**收尾棒**，DoD 是"三件套 + 发布后复核"：

1. **tag 前**（`plan/07` §3.1，全部完成才允许建 tag）：
   - `plan/06` 各 DoD 逐项有证据；`plan/00` §5 + `plan/06` §一 + `README.md` 状态行**三处一致**（布局门绿）；
   - `npm run verify --strict` rc=0（**未启用段必须清零**）；`npm run build` + `--check` 双跑逐字节一致；
   - **脱敏四步**（关键词扫描 / 提交身份与 tagger 邮箱 noreply / `.gitattributes` / 产物扫描无本机路径）；
   - **干净环境验证**：`git clone --no-local <repo> <中立目录>` → 不装包 → `npm test` + `npm run verify` + `npm run build` 逐条跑通；
   - **`plan/RELEASE-M6.md` 在 tag 之前写好并入库**（两栏：tag 前事实 / tag 后追加；**包内只写复验方法，不写附件哈希**）；
   - 建仓：`gh repo create yuluo554/pattern-lens --public --source . --remote origin`。
2. **tag 与 Release**（`plan/07` §3.2）：
   - annotated tag `git tag -a v0.1.0 -m "..."` → 核对 tag 对象两端一致；
   - `git push origin main` → 等 CI 全绿（**push 数 = run 数逐条配对**；branch run 与 tag run 两条都要绿）；
   - `gh release create v0.1.0 <zip> --notes-file <路径>`（`gh` 不认 `/tmp/...`）→ **sha256 写入 Release 正文**（不动仓库树）；
   - 真下载复核：`gh release download` → `sha256sum -c` → 从 tag 树重建产物与之 `cmp` **逐字节一致**。
3. **tag 后**（`plan/07` §3.3，只允许文档面追加）：`git diff --name-only v0.1.0..HEAD` **只含 `plan/`、`README.md`**；
   `plan/RELEASE-M6.md` §二 回填真实事实（run id / 下载 sha256 / 复核结论）。
4. **`plan/RELEASE-M6.md` 的阶段 7 覆盖对账表**（`plan/07` §3.4，**三态逐条不许留空**）——该表**在 tag 之前就要填满**。
5. 收尾：写 `plan/WRAPUP-M6.md`（或 `RELEASE-M6.md` 满足布局门的 `LAYOUT.RELEASE` 判据）。

**M6 不要碰的东西**：`src/**` 与 `rules/**` 的**行为面**（tag 之后只允许文档面追加；`plan/07` §3.3 第 12 条）；
阈值（只在 `rules/manifest.json`）；`data/fixtures/` 冻结产物；`src/lib/rules-pack.js`（生成物）。

## 3. 既定口径清单（K 编号；"动了会打挂测试"的约定）

> 下表即本仓的 **K 口径**总表（自 M2 起冻结 K1–K28；M3 新增 D32–D35，**M4 新增 D36–D38**，**M5 新增 D39–D42**；K 编号未变）。

| K | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| K1 | **数值阈值只在 `rules/manifest.json`**；`src/**` 与 `rules/dp-*.json` 不得出现第二份 | `rules/manifest.json` | `tests/threshold-token.test.mjs`（豁免：生成物镜像、整数 < 100 的常数——`HISTORY_MAX=20` 在此豁免面内） |
| K2 | `src/lib/rules-pack.js` 是**生成物**，禁手改；改规则 → `npm run rules:hash` | `tools/hash-rules.mjs` | `hash-rules --check` + `tests/rules-schema.test.mjs` |
| K3 | **证据门禁**：`evidence_required` 取不到 → 丢弃并记 `rejected`；**空串算"取到了"** | `src/lib/engine.js` | `tests/engine-gate.test.mjs` + 基准 B2 |
| K4 | 同一节点多规则命中 → 按 `match_priority` 先到先得，一个节点只出一条 | `rules/manifest.json` | `tests/engine-gate.test.mjs` / `engine-order.test.mjs` |
| K5 | 排序 = severity 降序 → `dom_order` 升序；编号 `F-01…`；**UI 与导出都不得再排序** | `src/lib/ordering.js` | `tests/engine-order.test.mjs` + 基准 B3 + `tests/overlay-dom-diff.test.mjs` |
| K6 | `snippet` 必须是宿主文本**原样子串**；截断只从尾部 + 标 `snippet_truncated` | `src/lib/page-model.js` | `tests/snippet-verbatim.test.mjs` + 基准 B4 |
| K7 | 导出字段顺序 = 契约；导出**不读时钟** | `src/lib/export.js` | `tests/export.test.mjs` + `tests/export-fields.test.mjs` |
| K8 | 权限白名单单点 + **无 `content_scripts`** + `host_permissions` 空 | `tools/permissions-whitelist.mjs` | `tests/manifest-permissions.test.mjs` + `tests/injection-chain.test.mjs` |
| K9 | 文案单点 `src/lib/copy.js`；禁用词表 `COPY.bannedWords`（含阳性对照）。M3 加 `COPY.locatorStale`；M4 起侧边栏空态也走 `COPY.emptyResult` | `src/lib/copy.js` | `tests/copy-guard.test.mjs` + `tests/sidepanel-restore.test.mjs` |
| K10 | `src/lib/**` 是**纯核心**：不得出现 `chrome`/`document`/`window`；lib 间只允许相对 import | `src/lib/*` | `tests/source-hygiene.test.mjs` + `tests/sidepanel-restore.test.mjs`（K10 项） |
| K11 | 拼接顺序单点 = `BUNDLE_ORDER`（`tools/bundle.mjs`）；新增模块必须登记 | `tools/bundle.mjs` | `tests/build.test.mjs`（断言 `src/content/**` 全部登记） |
| K12 | 安装面白名单 = `RUNTIME_WHITELIST`；新增 `src/lib` 文件必须登记。**M5 加 4 枚图标路径** | `tools/build-extension.mjs` | `tests/build.test.mjs` + `tests/store-assets.test.mjs` |
| K13 | `dist/` 与 `release/*.zip` 是构建产物（**不进 git**）；zip = stored + 固定时间戳 + `create_system=0` | `.gitignore` / `tools/build-extension.mjs` | `build-extension --check` + `tests/build.test.mjs` |
| K14 | 交接单命名：`plan/HANDOFF-M<k>.md` = 启动第 k 棒时读；M0 豁免；收尾棒要 `HANDOFF-M6` | `AGENTS.md` | `tools/check-sprint-layout.mjs` |
| K15 | 里程碑状态副本**三处**：`plan/00` §5、`plan/06` §一、`README.md` 状态行（同一次提交改完） | 三处 | 布局门 `LAYOUT.STATUS` |
| K16 | 测试文件必须登记进 `package.json` 的 `scripts.test`（逐文件列出） | `package.json` | `tests/test-manifest.test.mjs` |
| K17 | 未实现能力用**显式退出码**拦截，**不伪造产物**；`verify` 里列 `not_enabled` 段 | `tools/verify.mjs` | `verify` 输出 + `--strict` |
| K18 | 里程碑 DoD 里的 CI 项：未推送只能写"本地等价校验（未接远端，CI 待首推验证）" | `plan/06` | 人工（诚实性纪律） |
| K19 | 样式条件分两档：`detect.style` = AND，`detect.style_any` = OR | `rules/dp-*.json` / `src/lib/page-model.js` | `tests/rules-schema.test.mjs` |
| K20 | 每条规则必须有非空 `limits`；缺它即拒绝加载 | `rules/dp-*.json` | `tests/rules-schema.test.mjs` |
| K21 | **真值只存输入与期望**：`{rule_id, selector_path, snippet_expected, note?}`；**禁 `observed_*`/`matched`/`detected`** | `data/fixtures/page-NN/truth.json` | `tests/truth-shape.test.mjs` |
| K22 | **真值形态两层守门**：① 冻结产物形态 ② 再生成位级一致 | `tools/gen-fixtures.mjs` / `tests/*fixtures*` | `tests/fixtures-frozen.test.mjs` |
| K23 | **fixture 产物一律生成、禁手编**（含 `COVERAGE.md`、`README.md`、`stress-5k/`） | `tools/gen-fixtures.mjs` | `fixtures:check` + `tests/fixtures-frozen.test.mjs` |
| K24 | **基准侧与采集侧同语义**：定位串 `tag:nth(i)`；文本节点路径 = 父元素路径；`nearby-text` = 父元素文本减自身 | `data/fixtures/README.md` / `src/content/collector.js` / `tools/fixture-page-model.mjs` | `tests/truth-shape.test.mjs` + 基准 B4/B5 + `tests/collector-parity.test.mjs` |
| K25 | **压力页规模只在 manifest**：`thresholds.stress_node_count` | `rules/manifest.json` | `tests/fixtures-frozen.test.mjs` + 基准 B7 |
| K26 | **同一 `(rule_id, locator)` 只出一条 finding**；被丢的候选记 `rejected[].reason = "duplicate_locator"` | `src/lib/engine.js` | `tests/rules-bench.test.mjs` |
| K27 | **`label` 的自身文本回退只对控件生效**；口径单点 `labelFrom()` | `src/lib/page-model.js` | `tests/rules-bench.test.mjs` |
| K28 | **基准段 B1–B7 一律读 `rules/manifest.json` 的门槛**，缺件即 **FAIL**；报告必须双登记 | `tools/bench-rules.mjs` | `tests/rules-bench.test.mjs` + `tests/collector-parity.test.mjs` + `verify` 的 `rules.bench` 段 |

**M4 新增的 D 口径**：

| D | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| D36 | `LastScan` = `{url, scanned_at, scan_result}`；`LastScan` 取最新一次（按扫描时间） | `src/lib/sidepanel-view.js` 的 `scanRecordOf()` | `tests/injection-chain.test.mjs` + `tests/sidepanel-restore.test.mjs` |
| D37 | 站点级折叠用第二个 session 键 `ScanHistory`；时间倒序、按 `(url, scanned_at)` 去重、上限 `HISTORY_MAX=20` | `src/lib/sidepanel-view.js` + SW | `tests/sidepanel-restore.test.mjs`（⑤ 组） |
| D38 | 侧边栏纯逻辑单列 `src/lib/sidepanel-view.js`；`sidepanel.js` 只做接线 + 依赖注入 | `src/sidepanel/sidepanel.js` | `tests/sidepanel-restore.test.mjs` |

**M5 新增的 D 口径（动了会打挂测试）**：

| D | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| D39 | 导出产物单点 = `exportArtifact(scan, manifest, format)` → `{format, filename, mime, text}`；**UI 只做 Blob + `<a download>`** | `src/lib/export.js` + `src/sidepanel/sidepanel.js` | `tests/export-fields.test.mjs`（UI 路径逐字节）+ `npm run smoke:export` |
| D40 | 浏览器自动化底座单点 = `tools/cdp.mjs`；两个冒烟脚本复用 | `tools/cdp.mjs` | `npm run smoke:overlay` / `npm run smoke:export` |
| D41 | 商店素材一律生成、禁手编：图标 = 自写 PNG 编码器（`--check` 逐字节）；截图 = 真实渲染（只断言存在/尺寸） | `tools/gen-store-icons.mjs` + `tools/smoke-export.mjs --shots` | `npm run store:icons:check` + `tests/build.test.mjs` + `tests/store-assets.test.mjs` |
| D42 | 浏览器临时 profile 落点 = 仓库内 `tmp/`（`.gitignore`），**不用系统临时目录**（C 盘会爆） | `tools/cdp.mjs` 的 `smokeTmpRoot()` | 人工（环境纪律）+ 脚本退出清理 |

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-19 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24。
- `gh` 2.93.0 可用；**本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：
  推码失败先重试 3~4 次，或 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：验收中文文件走 `node -e` 读回或解析器回读。
- **未接远端**：`git remote -v` 为空 → **一次 CI 都没跑过**；`plan/06` 里的 CI 项一律写"待首推验证"。
- **`fixtures:check` 是重量级门**（重新生成 124 个文件，约 3.2s）；别在循环里反复调。
- **`npm test` 现在约 9s**（24 个文件；`tests/rules-bench.test.mjs` 的 3 组探活要复制整棵仓库，约 5s）。
  跑单文件更快：`node --test tests/export-fields.test.mjs`（约 0.2s）。
- **改了 `src/**` 之后 `tests/build.test.mjs` 会红**（`dist/` 是上次构建的快照）——先 `npm run build` 再 `npm test`。
- **`tools/bench-rules.mjs` 的 B7 是墙钟测量**：本机实测有波动，离预算余量充足；**它只测量、不进任何产物**。
- **本机 Chrome 可用且可自动化**（2026-10-19 实测 **Chrome 155.0.8059.80**）：两个冒烟脚本都用
  `--headless=new --remote-debugging-port=<port>` + CDP over **Node 自带 WebSocket**（零依赖）驱动。
  **口径**：脚本自带"拉不起来 → 显式 SKIP（rc=0）"，故本机/CI 都不会假红；**刻意不进 CI**（CI 无浏览器）。
  - 坑①：Windows 上 Chrome 退出后 `rmSync(profile)` 可能 `EPERM`（句柄未释放）→ 脚本已 `try/catch` 吞掉。
  - 坑②：`--headless=new` 下 `chrome://newtab` 等 UI 目标会出现，选 target 要按 `type === "page" && url.startsWith("file:")` 过滤。
  - 坑③：探针要把函数名**写进 window 对象字面量**；先 `let` 后 `window.xxx = () => ...` 的形态在页面内会 `is not a function`。
  - **坑④（M4）**：`npm run smoke:overlay` **只覆盖页内覆盖层**，不覆盖侧边栏。
  - **坑⑤（M5）**：CDP `/json/new?<url>` 的 url **不做 percent-encode**（编码后 target 不会被创建）。
  - **坑⑥（M5）**：Windows 盘符的 file URL 是 **三斜杠** `file:///D:/...`；`file://D:/...` 与 Chrome 报的 url 不一致 → target 匹配不上。
  - **坑⑦（M5）**：侧边栏页面的假 `chrome` 必须在**文档加载前**装（`Page.addScriptToEvaluateOnNewDocument` + `Page.reload`），
    否则 `sidepanel.js` 的自启动守卫（要 `chrome.runtime.id`）不满足 → 根本不启动（实测：晚注入 → `window.__onMessage` 不是函数）。
  - **坑⑧（M5）**：**Chrome profile 每个约 20~26MB，别落在 C 盘**（实测把 C 盘塞满、机器卡死）。
    脚本已改用仓库内 `tmp/`（`smokeTmpRoot()`，D42）；手工调试也要落 D 盘。
- **`src/background/service-worker.js` 有 `HAS_RUNTIME` 守卫**：没有扩展运行时不挂监听；改动 SW 时别把监听挂回顶层。
- **离线验收侧边栏时要保留 `globalThis.chrome`**（SW 的消息路由器靠它读 `storage.session`）；
  侧边栏不会误启动（自启动守卫还要求 `typeof document !== "undefined"`）。
- **`tests/helpers/fake-dom.mjs` 的 `querySelectorAll` 只支持 `tag` / `.class` / `#id` / `.class[data-x="y"]`**；
  `index.html` 自身有一个 `<details id="settings">`，测扫描折叠块要按 `.scan` 类取。

## 5. DoD 逐项 checklist（M5）

- [x] Markdown 与 JSON 导出字段完整（含规则包版本与哈希、禁用规则列表；UI 导出路径上验收）
- [x] 同一 `ScanResult` 导出两次**字节一致**（UI 路径 + 真实浏览器）
- [x] 整轮扫描 + 导出 **0 次网络请求**（`verify` 段转实跑 + 真实浏览器 CDP 计数）
- [x] 站点黑名单命中 → 不注入（且 UI 明示"该站点已停用"）
- [x] 规则开关生效：禁用规则不参与扫描、不出现在导出
- [x] `docs/商店素材清单.md` 与 `assets/store/` 实物逐项对账；`docs/隐私声明.md` 与权限白名单一致
- [x] `README.md` 定稿（安装、使用、规则说明、隐私承诺、局限披露）
- [ ] M6 发布三件套 —— 见 §2（本棒不做）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，24 个文件，约 9s）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify -- --strict             # 未启用段 → 以退码 1 收尾（M6 用）
npm run smoke:overlay                  # 真实浏览器冒烟：页内覆盖层真实点击（缺浏览器显式 SKIP）
npm run smoke:export                   # 真实浏览器冒烟：导出字节 + 网络计数（缺浏览器显式 SKIP）
npm run smoke:export -- --shots        # 追加产出商店截图
npm run store:icons                    # 生成 assets/store/ 图标；store:icons:check 重生成比对
npm run bench                          # 规则基准 B1–B7（逐样本点名报告；rc=0 全达标）
npm run fixtures                       # 生成/覆盖 data/fixtures/
npm run fixtures:check                 # 再生成位级一致
npm run rules:hash                     # 重新生成 ruleset_hash 与 src/lib/rules-pack.js
npm run rules:hash -- --check          # 只核对
npm run build                          # dist/ + release/pattern-lens-<version>.zip
npm run build:check                    # 重生成逐字节一致自检
```

**收尾实测（M5 同轮补记）**：见 `plan/06` §三之五「M5 出口证据」；本文件不预填未跑出的数字。
