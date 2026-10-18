# HANDOFF-M1 —— 启动第 1 棒（M1 数据先行）时读的交接单

> 本文档由 **M0 收尾时**写成（2026-10-18）。命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。
> **新对话的第一动作**：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）——**先跑它**，红了先修布局。

## 1. 当前进度 + 证据（M0 收尾时实测）

**M0 已完成**：装订三件 + `plan/00`–`07` + `data/README.md` + 12 条规则数据 + 判定核心骨架 + 导出核心 + 构建 + 门 + CI 预置。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 1 / 状态副本 3」） |
| 单元与门测试 | `npm test` | **86 项全通过**（0 fail），12 个测试文件（含布局门变异 6 组 / 规则包校验变异 7 组 / CI 工作流阳性对照） |
| 全量自检 | `npm run verify` | **11 段 PASS / 5 段 not_enabled**，rc=0（M1–M5 未实现，**显式列出、不冒充通过**） |
| 规则包哈希 | `npm run rules:hash -- --check` | `ruleset_hash=0b5805c7…`，`src/lib/rules-pack.js` 与 `rules/*.json` 逐字节一致 |
| 构建 | `npm run build` + `--check` | `dist/`（16 文件 / 120,371 字节）+ `release/pattern-lens-0.1.0.zip`（122,237 字节），重生成逐字节一致 |
| 变异验证（布局门） | 6 组（缺 AGENTS.md / 单副本翻状态 / 缺交接单 / 删装订行 / 删缺口表头 / 删 CI 步骤） | 6 组全红，还原后全绿（常驻在 `tests/sprint-layout.test.mjs`） |
| 变异验证（规则包校验） | 7 组（缺字段 / 未知 detect 键 / 未知 style_any 样式键 / 未知严重度 / 未知证据类型 / id 重复 / 优先级漏项 / 占位哈希） | 全被拒绝（常驻在 `tests/rules-schema.test.mjs`） |
| CI | **未接远端 → 从未跑过** | 本地等价校验 = CI 工作流静态自查（job/step 计数 + 步骤顺序 + 裸冒号对照，`tests/ci-workflow.test.mjs`）+ 逐步骤手工复跑；**CI 待首推验证** |

**本轮修掉的一个真实缺陷（布局门首个真实收获）**：`plan/06` 的「每周可演示物」表首格写的是 `M1`…`M6`，
与**状态表**同形 → 布局门把它读成"状态行"，于是 M1–M6 既像 done 又像 pending，报出 4 项 FAIL（含连带的
缺口列与交接单误判）。处置 = 把该表首格改成 `第 1 棒`…（**判据不改**：判据是"表格行且首格就是里程碑号"，
歧义来自文档自身的写法）。这条正是 methodology-binding §二「布局门自己的假门族⑤（扫自由文本/张冠李戴）」的同族形态。

**M0 收尾补记（用户拍板，2026-10-18）**

- 仓库名 = **`yuluo554/pattern-lens`**（ D22）；许可证 = **MIT**（D23，落点 =  +  + README §许可）；
- 基准按 **D15/D24**（Node 纯核心 + 浏览器冒烟可选）执行——M1/M2 不得为此引入第三方依赖；
-  §四 Q1–Q3 **已关闭**；Q4（ 是否入仓）/ Q5（是否提交商店）**未拍板**，按默认口径（①不进仓 / ①只准备不提交）执行，不阻塞 M1–M5；
- 仍未做：**建远端仓与首推 CI**（用户未指示）——在此之前一切 CI 项保持"本地等价校验，待首推验证"。
## 2. 下一棒待办（M1：数据先行）

按 `plan/06` §二 M1 DoD 逐条做，实现落点与口径在 `plan/05` §一–§三：

1. `tools/gen-fixtures.mjs`：把当前的"阶段未就绪"占位（exit 2）换成真生成器
   —— 40 页 `data/fixtures/page-NN/{page.html,style-map.json,truth.json}` + `data/fixtures/stress-5k/page.html`；
2. **真值先于规则**：`truth.json` 只存 `{rule_id, selector_path, snippet_expected, note?}`，
   **禁 `observed_*` 一类字段**（守门 `tests/truth-shape.test.mjs` 要一起写）；
3. 覆盖矩阵 `data/fixtures/COVERAGE.md` **由真值汇总生成**（不是手编），每规则正/负样本计数；
4. 两层守门：① 冻结产物形态（40 页齐、字段齐、无 `observed_*`）；② 再生成位级一致（`--check`）；
5. 白名单断言：站点名/域名只用 `data/README.md` §3.1 的白名单（生成器内断言，越界即报错）；
6. 落地后：`tools/verify.mjs` 的 `fixtures.frozen` 段从 `not_enabled` 换成 `tests` 段；
7. 收尾：`plan/00` §5 + `plan/06` §一 + `README.md` 状态行三处同改 → 写 `plan/HANDOFF-M2.md` → commit。

**M1 不要碰的东西**：`src/lib/rules-pack.js`（生成物，改规则用 `npm run rules:hash`）、
阈值（只在 `rules/manifest.json`）、`plan/01`（题面定稿不改写，勘误走 `plan/00` 决策记录）。

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
| K17 | 未实现能力用**显式退出码**拦截（如 `tools/gen-fixtures.mjs` exit 2），**不伪造产物**；`verify` 里列 `not_enabled` 段 | `tools/verify.mjs` | `verify` 输出 + `--strict` |
| K18 | 里程碑 DoD 里的 CI 项：未推送只能写"本地等价校验（未接远端，CI 待首推验证）" | `plan/06` | 人工（诚实性纪律） |
| K19 | 样式条件分两档：`detect.style` = AND，`detect.style_any` = OR；两个外观特征同时要求还是任一即可必须写清 | `rules/dp-*.json` / `src/lib/page-model.js` | `tests/rules-schema.test.mjs`（含 style_any 未知键变异） |
| K20 | 每条规则必须有非空 `limits`（显式声明本工具不判断什么）；缺它即拒绝加载 | `rules/dp-*.json` | `tests/rules-schema.test.mjs` |

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-18 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24。
- `py -0p` 有 **3.8 与 3.12** 两条通道（本项目不用 Python；工具全在 Node）。
- `gh` 2.93.0 可用；**本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：
  推码失败先重试 3~4 次，或 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：
  验收中文文件走 `node -e` 读回或解析器回读（本项目改完 `.md` 一律用 node 读回核对计数）。
- 本机自动化拉浏览器不稳（有实测史）→ 浏览器冒烟在缺浏览器时**显式 SKIP**，不得据此打 ✅。
- **未接远端**：`git remote -v` 为空 → **一次 CI 都没跑过**；`plan/06` 里的 CI 项一律写"待首推验证"。

## 5. DoD 逐项 checklist（M0）

- [x] `AGENTS.md`（仓库锚点）+ `tools/check-sprint-layout.mjs`（布局门）+ `plan/00` 顶部装订行
- [x] `plan/00`–`07` 落盘，各含门要求的必需小节
- [x] `data/README.md` 台账（依据查证三态 + 合成数据纪律 + 数值口径纪律）
- [x] 12 条规则数据 + `rules/manifest.json`（唯一数值真相源）+ 生成物 `src/lib/rules-pack.js`
- [x] 判定核心骨架（`scanNodes` / `buildScanResult`）+ 证据门禁 + 排序编号 + 导出核心
- [x] 采集器骨架 + 按需注入链路（SW）+ 侧边栏骨架（四组分组 / 导出 / 规则开关 / 站点策略）
- [x] 构建：自写拼接 + 扩展树 + 确定性 zip（`--check` 双跑逐字节一致）
- [x] 测试 11 个文件（含布局门变异 6 组、规则包校验变异 7 组）
- [x] `tools/verify.mjs` 分段自检（未启用段显式列出）
- [x] CI 预置（`.github/workflows/ci.yml`，含布局门步骤）——**未推远端，CI 待首推验证**
- [ ] M1–M5 的功能与基准 —— 见 §2（本棒不做）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，不需要 npm install）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify -- --strict             # 未启用段 → 以退码 1 收尾（M6 用）
npm run rules:hash                     # 重新生成 ruleset_hash 与 src/lib/rules-pack.js
npm run rules:hash -- --check          # 只核对（不一致即 exit 1）
npm run build                          # dist/ + release/pattern-lens-<version>.zip
npm run build:check                    # 重生成逐字节一致自检
npm run fixtures                       # M1 前恒 exit 2（"阶段未就绪"，不伪造产物）
```

**收尾实测（M0 同轮补记）**：见 `plan/06` §三 与提交信息；本文件不预填未跑出的数字。
