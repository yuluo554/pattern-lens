# 00 · README 总览 — 10-19-pattern-lens（界面取证镜 pattern-lens）

> 方法论：`ai-tool-project-sprint`（装订 2026-10-18）｜布局门：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）｜**续接对话第一件事 = 跑它**｜锚点见 `AGENTS.md`

- **项目**：界面取证镜（pattern-lens）——暗黑模式**取证**浏览器扩展（Chrome/Edge Manifest V3）
- **性质**：自拟项目题 · **不参赛** · 发布 GitHub **公开仓库** · 署名 `yuluo554`
- **版本**：v1（2026-10-17 题定稿；需求侧与开源检索基准日 2026-10-17）；M0 骨架落地 2026-10-18
- **一句话定位**：点一下扩展图标，侧边栏列出当前页所有**可疑模式（待核对）**——规则名 + 原文片段 + 元素定位 + 严重度，页面上用编号徽标高亮取证，一键导出证据包。**做取证，不做打分**：无证据节点不产出结论。
- **交付形态**：**唯一形态** = Chrome/Edge MV3 扩展（侧边栏 + 按需注入 content script + service worker），纯前端、无后端、无模型、无远程代码。不设备选形态。
- **当前状态**：🟡 **M0 / M1 / M2 完成**（M2 = 规则引擎与按需注入：引擎 + 采集器 + 注入链路 + B1–B7 基准双边达标），M3–M6 未开工。台账状态列按**实际验证过的证据**翻转，未验证项保持 ⬜。

---

## 1. 文档索引

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| `plan/00-README总览.md` | 本文档：索引、决策记录、招牌动词表、提交材料实物表、承诺-证据台账、里程碑 | ✅ M0 |
| `plan/01-题目文档.md` | 十段式题面（介绍、任务、材料、评分、锚点、边界） | ✅ 已定稿（v1，不改写；勘误走决策记录） |
| `plan/02-需求解读与能力转译.md` | 痛点→能力转译、FR 清单（带优先级）、NFR、边界与非目标 | ✅ M0 |
| `plan/03-架构与技术选型.md` | MV3 架构、分层与目录、消息协议、权限白名单、构建与打包、编码纪律 | ✅ M0 |
| `plan/04-模块详设.md` | M1–M5 接口、数据结构、判定语义、失败路径、逐形态验收 | ✅ M0（按实装回填） |
| `plan/05-数据计划与基准计划.md` | fixture 计划、真值纪律、生成器纪律、基准套件与门槛口径、数值口径单点 | ✅ M0 |
| `plan/06-里程碑与每周演示.md` | 里程碑总表与状态、逐棒 DoD、每周可演示物、已知未验证项 | ✅ M0 |
| `plan/07-交付对标与发布计划.md` | 评分对标（含缺口列）、提交材料对照、M6 发布执行清单、开放项、风险登记 | ✅ M0 |
| `data/README.md` | 依据查证记录（三态）、数据源可获取性、合成数据纪律、数值口径纪律 | ✅ M0 |
| `AGENTS.md` + `tools/check-sprint-layout.mjs` | **方法论装订**：仓库锚点 + 布局门（阶段 0 第零步） | ✅ 2026-10-18 |
| `LICENSE` | MIT 许可（用户 2026-10-18 拍板，D23） | ✅ M0 |
| `plan/HANDOFF-M1.md` | **启动第 1 棒时读的交接单**（M0 收尾时写） | ✅ M0 收尾 |
| `plan/HANDOFF-M2.md` | **启动第 2 棒时读的交接单**（M1 收尾时写） | ✅ M1 收尾 |
| `plan/HANDOFF-M3.md` | **启动第 3 棒时读的交接单**（M2 收尾时写） | ✅ M2 收尾 |
| `plan/RELEASE-M6.md` | 发布留档（tag 前事实 / tag 后追加，两栏） | ⬜ 待 M6 |
| `manifest.json` + `src/` | MV3 清单与扩展源码（引擎/采集器/注入链路已接入） | 🟡 骨架 M0，引擎链路 M2，UI 待 M3–M5 |
| `rules/manifest.json` + `rules/dp-*.json` | 规则包版本/阈值（唯一数值真相源）+ 首批 12 条规则 | ✅ 数据 M0 / 引擎接入 M2 |
| `data/fixtures/` | 40 页合成 fixture + 逐页真值（`page-NN/truth.json`）+ 覆盖矩阵（`COVERAGE.md`）+ 压力页 | ✅ M1 |
| `tools/bench-rules.mjs` + `tools/fixture-page-model.mjs` | 规则基准 runner（B1–B7）与 Node 侧页面模型解析器（独立于生成器） | ✅ M2 |
| `docs/商店素材清单.md` + `assets/store/` | 商店素材清单与实物 | ⬜ 待 M5 |
| `docs/隐私声明.md` | 隐私声明文本 | ⬜ 待 M5 |
| `README.md` | 用户侧门面 | 🟡 骨架（M0），M5 定稿 |

---

## 2. 决策记录

### 2.1 题定稿期决策（v1，2026-10-17）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D1 | **形态 = Chrome/Edge MV3 扩展**（侧边栏取证台 + 按需注入扫描器） | ①本地 CLI；②桌面程序；③Web 服务 | 取证对象是**渲染后的 DOM**——CLI/桌面要另装浏览器自动化栈（重依赖 + 宽泛权限），"点一下就看当前页"的即时性也丢失；Web 服务要把页面内容送出本机，直接违反隐私红线。**弃 CLI/桌面/Web 服务** |
| D2 | **核心亮点 = 规则即证据模板**（`evidence_required` 门禁） | 沿用"检出即报"的启发式 | **弃"检出即报"**：暗黑模式规则的误报直接伤害工具可信度与法律安全；改为"证据节点取不到就不产出 finding"，把每条结论钉在可复核的 DOM 节点与原文上 |
| D3 | **弃"菜谱份量换算"方向** | 做食谱份量/单位换算工具 | 换算层虽 0★，但用户痛点在"去废话"而非"换算"；且 `RecipeFilter` 297★ 已占该场景注意力，正面进入无差异化 |
| D4 | **弃"表格导出"方向** | 做网页表格一键导出 | `copytables` 152★ 已占、商业品成熟、浏览器原生复制/表格识别夹击，无空白可打 |
| D5 | **弃"单位价格 / 缩水通胀"方向** | 做超市单价换算与缩水通胀计算 | 需逐站点定制抽取规则（脆弱），且无后端、无历史价数据库，做不出可信的时间序列结论 |
| D6 | **弃 ML 打分路线** | 用模型给页面打"暗黑指数" | 不可解释 + 法律风险（定性标签）+ 无远程代码约束（MV3 禁止远程模型/远程代码）。规则化是唯一能同时满足可解释、可审计、可离线复现的路线 |
| D7 | **弃宽泛权限** | 申请 `<all_urls>` + `tabs` 常驻注入 | 商店审核与用户信任双重代价；常驻注入与"未点击前零注入"的可验证承诺冲突。改 `activeTab` 按需注入 |
| D8 | **文案统一"可疑模式（待核对）"** | 直接标"暗黑模式/欺诈" | 直接定性有法律与商店审核风险；统一措辞 + 每条附规则解释与原文，是"取证"而非"判决" |
| D9 | **首期 12 条规则** | 追求全量暗黑模式分类学 | 分类学没有公认闭合清单，贪全会摊薄每条规则的证据质量；12 条覆盖紧迫/误导/障碍/价格四组，先证明"证据门禁"这条路走得通 |
| D10 | **不写会漂移的硬数字** | 题面写死测试数/代码行数 | 只写口径与门槛来源（门槛进 `rules/manifest.json`）；规模数字以末态回填 |
| D11 | **数值口径一处定义** | 各文档各写一份阈值 | 严重度分级、precision/recall 门槛、扫描超时、匹配优先级、fixture 规模只在 `rules/manifest.json` 定义；其余文档引用 |
| D12 | **规则包随包版本化，不做热更新** | 远程拉取规则包 | MV3 禁止远程代码；远程规则即远程代码。热更新需重新提交商店审核，列入 roadmap |

### 2.2 M0 骨架期决策（2026-10-18）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D13 | **零运行时依赖，且 devDependencies 也为空** | 引入 jsdom / playwright / 打包器 | 与"零上传、零遥测、可离线复现"的承诺同源；`git clone` 后不装包即可 `npm test`。代价 = 自写最小工具（打包拼接、确定性 RNG、HTML 轻解析），全部落在 `tools/` 与 `src/lib/` |
| D14 | **content script 走一步自写打包**（`tools/bundle.mjs`，依赖序拼接 + 规则包内联，产出 `dist/scanner.js` 经典脚本） | ①`web_accessible_resources` + 页面内动态 `import()`；②第三方打包器 | content script **不能静态 import ESM**；动态 import 需要把库文件暴露给网页（可被指纹识别）。自写拼接无第三方依赖、产物逐字节确定（M6 的 zip 附件因此可复现）。弃选两者 |
| D15 | **基准在 Node 上跑纯核心，不引入浏览器依赖** | 用 headless 浏览器跑基准 | 浏览器自动化栈在本机与 CI 都不稳定（本机拉不起浏览器有实测史），且会让"零依赖"承诺失效。正解 = 把采集与判定**分层**：判定核心是纯函数（输入 = 归一化页面模型），Node 上以自写轻量 HTML 解析器产出的模型驱动基准；**真实渲染路径**（计算样式）由可选的浏览器冒烟单独覆盖，缺浏览器时显式 SKIP 而非静默通过。限制写进 `plan/03` 与 `README` |
| D16 | **发布附件 = 确定性 zip（扩展打包物本身）** | ①GitHub 自动生成的 Source code 包；②不附产物 | 自动 Source 包的 sha256 本地复算不出来；扩展这个形态"下载即装"最省事。zip 用 `ZIP_STORED` + 固定时间戳 + 固定条目序，跨平台重生成逐字节一致（配 `--check` 守门） |
| D17 | **fixture 一律合成，绝不引入真实站点页面** | 抓真实站点页面做样本 | 真实站点原文涉及版权与名誉风险，且不可复现（页面随时间漂移）。判据 = "这份基准跑第二遍，输入变了吗？" |
| D18 | **假站点名白名单**：电商/订阅类只用"示例商城（虚构）"等，域名只用 `example.invalid` / `fixture.local` | 借用真实品牌名做样本 | 避免商标与名誉风险；白名单进 `data/README.md` §3.1，生成器断言只许用白名单内的名称 |
| D19 | **里程碑状态副本 N 处一致写进机器断言**（`tools/check-sprint-layout.mjs`） | 靠人记得同步三处 | `10-19-circuit-detective` 实测：状态副本漂移跨两个里程碑没人改。判据落"仓库内文件"，不落 git 元数据 |
| D20 | **样式条件分两档：`detect.style` = AND，`detect.style_any` = OR** | 只用单个 `style`（全部条件必须同时成立） | 实测踩坑：两条关闭类规则写成"极小 **且** 低对比 **且** 半透明" → **永不命中**（违反规则的语意），而规则数据与测试同错时不会红。加 `style_any` 后语义显式化。**这是"动了会打挂规则数据与基准"级口径**（K19） |
| D22 | **GitHub 仓库名 = `pattern-lens`**（署名 `yuluo554/pattern-lens`） | ①`ui-pattern-lens`；②`10-19-pattern-lens` | 用户 2026-10-18 拍板。纯 kebab-name 与本地目录日期标签解耦；Release 附件名沿用 `pattern-lens-<version>.zip` |
| D23 | **许可证 = MIT** | ①Apache-2.0（含专利授权条款）；②暂不添加（GitHub 默认保留所有权利） | 用户 2026-10-18 拍板：与本系列其他项目一致、短且易读。三处落点 = `LICENSE` + `package.json.license` + README §许可 |
| D24 | **基准按 D15 执行（Node 纯核心 + 浏览器冒烟可选）** | 引入 playwright / puppeteer 作为 devDependency | 用户 2026-10-18 确认：**保住「git clone 后不装包即可 `npm test`」**；真实渲染路径的缺口写进 README 局限披露与 `plan/06` §五，不冒充已验 |
| D21 | **源码卫生判据只扫剥注释后的代码**（注释不是行为） | 直接扫原文 | 判据扫原文时，注释里"本模块不碰扩展 API"这类说明文字会被判成违规（**判据张冠李戴**）。正解 = 剥离注释后再扫，并配两条自证：① 剥离后仍留代码 token（防"剥离函数吃空整段"造成假绿）；② 注入的真违规仍被抓住（阳性对照） |

### 2.3 M1 数据先期决策（2026-10-19）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D25 | **真值落在页目录内**：`data/fixtures/page-NN/truth.json`（+ 同目录 `style-map.json`） | ①集中目录 `data/fixtures/truth/page-NN.json` | `plan/01` §三 与 `plan/05` §一 G3 原写"`data/fixtures/truth/`"，而 `plan/04` M1 与 `plan/HANDOFF-M1.md` §2 写的是页目录三件套。**统一为页目录三件套**（真值与它描述的页面同目录，改页面必须同改真值，`fixtures:check` 立刻发现）；`plan/01` 属题面定稿不改写，本条即其勘误，判据以本条为准 |
| D26 | **真值文档形态 = `{page, site, url, positives[], negatives[]}`**，两类条目形态**统一** = `{rule_id, selector_path, snippet_expected, note?}`（正/负由所在数组决定，不靠额外字段） | ①单数组（只装正样本）②正负条目各自一套字段（负样本不带 `snippet_expected`） | 负样本（"看起来像但按规则不成立"）必须**可数可复算**，否则覆盖矩阵的"负样本计数"只能手编（`plan/05` §二.4 要求它存在）。弃"两套字段"：统一后守门对两类条目用**同一个校验器**（键白名单 / snippet 原样 / 独立回解），少一套特例，且 `snippet_expected` 对负样本同样是可复核的锚点。**任何层级禁止 `observed_*` / `matched` / `detected` 一类字段**（冻结观测会让基准退化成比对两份预先算好的答案） |
| D27 | **压力页规格入 manifest**：`thresholds.stress_node_count`（新增，值 5000） | 在生成器里写常量 5000 | `plan/05` §六 已定"fixture 规模只在 `rules/manifest.json`"；压力页节点数同属 fixture 规模，写进生成器就是**第二份数字**。新增键后重算 `ruleset_hash`（`npm run rules:hash`），并把键加进 `src/lib/rules.js` 的 `REQUIRED_THRESHOLD_KEYS`（缺了即拒绝加载） |
| D28 | **"声明样式子集"只放非默认样式**：`style-map.json` 逐节点给出全部声明，HTML 只在**非默认**时写 `style="…"` | 每个元素都写一遍完整 `style` 属性 | 逐元素写全量 `style` 让产物膨胀数倍且噪声淹没真正可疑的那几处（6×6 关闭按钮、前景≈背景的按钮）。默认值单点在生成器 `BASE_STYLE`，模型侧缺失即取默认——`style-map.json` 仍是"声明样式子集"的完整落点 |

### 2.4 M2 引擎与基准期决策（2026-10-19）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D29 | **`label` 的自身文本回退只对控件生效**；普通元素只取显式标签属性（`aria-label`/`title`/`placeholder`/`alt`），**不取 `textContent`** | ①普通元素也用 `textContent` 回退（M1 遗留的建模缺口）②引擎侧按 `(rule_id, locator)` 去重来兜住重复命中 | **实测（反事实对照，断言常驻）**：缺口原样时 40 页基准产出 **133 条 finding / 85 条误报**——"允许 element 的文本级规则"（`dp-countdown-pressure`/`dp-anchored-discount`/`dp-exit-retention`/`dp-hidden-fee`）在每个祖先容器上重复命中，连 `html`/`body` 都命中（`body.label` = 整页文本），四条规则 precision 掉到 **0.1379~0.1667**，B1 双边门必红。**弃①**（会把误报写进模型层，且"文本的取证点"本就落在文本节点上）；**弃②作为唯一手段**（去重只在**同一 locator** 上生效，跨 locator 的祖先重复命中它挡不住）。口径**单点**落在 `src/lib/page-model.js` 的 `labelFrom()`，采集器/基准侧/生成器三处同调；反事实对照见 `tests/rules-bench.test.mjs`（常驻 2 项：恢复缺口形态 → 误报 ≥ 60 条 + 四条文本级规则 precision 必须掉到门槛以下） |
| D30 | **同一 `(rule_id, locator)` 只出一条 finding**（先到先得 = 文档序在前者胜），被丢弃的候选记 `rejected[].reason = "duplicate_locator"` | 允许同一 locator 出多条（同规则重复计数） | 定位串 `tag:nth(i)` 的约定是"**文本节点的路径 = 其父元素路径**"（K24），于是文本节点与其宿主**控件**共用同一个 locator：若两条都产出，同一条证据在清单里出现两次（用户看到重复条目、导出也重复）。**弃"允许重复"**：清单要能当证据用，重复条目会让"几条证据"这个数失真。**丢弃必须可观测**（与 K3 的证据门禁同一纪律：丢弃 ≠ 静默跳过），故进 `rejected` 而不是直接 continue |
| D31 | **周边文本用"按需翻倍前缀"归一**（`limitNearText`），不做通篇归一 | 逐节点对**整个父容器文本**做空白归一 | **实测**：压力页（5007 节点）里一个 `<ul>` 下有 2500 行，父文本 ~25k 字符 × 2500 子节点 ≈ 6 千万字符的正则归一 → 冷启动 **1313ms**，超 `first_result_budget_ms`（500ms）预算 2.6 倍。归一只让字符串**变短**（折叠空白），故"原始前缀归一后 ≥ limit"时其前 limit 字符与"全串归一后前 limit 字符"**逐字节相同** → 语义与通篇归一等价，工作量降到 O(limit×常数)（改后 **106.5ms**）。**弃通篇归一**（超预算即 NFR-06 不达标）；**弃"直接截原始串再归一"**（会在中间截断处制造"多一个少一个空格"的语义差） |

---

## 3A. 招牌动词表（能力名词 → 交付态入口 → 断言基准）

> 表内每个能力名词都出自 `plan/01` 的标题或定位宣言；任一格填不出就该删词或降级为 roadmap。

| 能力名词 | 哪条交付态入口产出它 | 哪条基准/测试断言它 |
| --- | --- | --- |
| 可疑模式清单（findings） | 点击扩展图标 → sidePanel「开始扫描」（M2 引擎已通；UI 待 M4） | `tests/rules-bench.test.mjs` 的逐规则 precision/recall 断言（12/12 达标） |
| 规则名 + 规则解释 | 同上；文本只从 `rules/dp-*.json` 读取（M2 已通） | `tests/rules-schema.test.mjs`（规则解释无越界词）+ 引擎逐字取规则包 `explanation` |
| 原文片段（snippet） | 采集器从宿主文本节点原样截取（M2 已通） | `tests/snippet-verbatim.test.mjs` + 基准 B4（48 条逐条在 `page.html` 里） |
| 元素定位（locator） | 采集器为每个节点生成稳定定位串（M2 已通） | 基准 B5：48 条 finding + 8 条 rejected 全部回解到节点；同一 `(rule_id, locator)` 只出一条（D30） |
| 严重度（severity） | 规则包 `severity` 字段（M2 已通） | `tests/rules-schema.test.mjs`：取值属于 `rules/manifest.json` 枚举 |
| 编号徽标高亮 | 扫描后自动注入覆盖层 / 侧边栏「在页面高亮」（M3） | `tests/overlay-dom-diff.test.mjs`：清除后页面 DOM diff = 0 |
| 侧边栏取证台（四组分组） | 点击扩展图标打开 sidePanel（M4） | `tests/sidepanel-restore.test.mjs`：冷启动与 SW 被回收后恢复一致 |
| 一键导出证据包 | 侧边栏「导出 Markdown / JSON」（M5） | `tests/export-fields.test.mjs` + 两次导出字节一致断言 |
| 零网络请求 | 扫描 + 导出全流程（M5） | `tests/zero-network.test.mjs` + 浏览器冒烟的 resource 计数断言 |
| 零注入 | 扩展安装后未点击前（M2 已通） | `tests/injection-chain.test.mjs`：manifest 无 `content_scripts`；黑名单站点 `executeScript` **一次都没被调用** |

---

## 3B. 提交材料实物表（`plan/01` §三 逐项对账）

| 承诺项 | 应存在的文件路径 | 由哪个里程碑产出 | 用哪条命令核对 |
| --- | --- | --- | --- |
| Manifest V3 清单 | `manifest.json` | M0（骨架）/ M2（定稿） | `git ls-files manifest.json` + `npm test -- tests/permissions-whitelist.test.mjs` |
| 扩展源码 | `src/background/service-worker.js`、`src/content/scanner.js`、`src/sidepanel/`、`src/lib/` | M1/M3/M4 | `git ls-files src` |
| 目录结构说明 | `docs/目录结构说明.md` | M5 | `git ls-files docs/目录结构说明.md` |
| 规则包 | `rules/dp-*.json` + `rules/manifest.json` | M0（数据）/ M2（引擎） | `git ls-files rules` |
| 合成 fixture 与真值 | `data/fixtures/page-NN/{page.html,style-map.json,truth.json}` + `data/fixtures/COVERAGE.md` | M1 | `git ls-files data/fixtures` + `npm run fixtures:check` |
| 商店素材清单与实物 | `docs/商店素材清单.md` + `assets/store/` | M5 | `git ls-files docs/商店素材清单.md assets/store` |
| 隐私声明 | `docs/隐私声明.md` | M5 | `git ls-files docs/隐私声明.md` |
| 测试套件 | `tests/` | M0–M5 | `git ls-files tests` + `npm test` |
| README | `README.md` | M0（骨架）/ M5（定稿） | `git ls-files README.md` |
| 发布留档 | `plan/RELEASE-M6.md` | M6 | `git cat-file -e v0.1.0:plan/RELEASE-M6.md` |

> **纪律**：上表任一行在 M6 指不到实物，该项从 `plan/01` §三 与评分表同时删除，不得留成无主承诺。

---

## 4. 承诺-证据台账（全项目唯一一份）

| 承诺项 | 素材来源 | 交付物内可达性 | 核验方式 | 状态 |
| --- | --- | --- | --- | --- |
| 12 条规则可解释、可逐条开关 | 自建规则包 `rules/dp-*.json`（素材来源 = 公开讨论中的具体手法描述，见 `plan/01` §1.1） | 扩展内打包，随包版本化 | `tests/rules-schema.test.mjs` + 侧边栏规则开关 | ✅ 数据与引擎（M0/M2），开关待 M5 |
| 无证据节点不产出 finding | 规则包 `evidence_required` 字段 | 判定核心内置门禁 | `tests/engine-gate.test.mjs` + 基准 B2（8 类证据逐类断供 → 零产出 + `rejected` 非空 + 反向对照） | ✅ M2（语料侧此类候选实测 0 个，故用断供注入可证伪） |
| 单规则 precision ≥ 0.90 / recall ≥ 0.80 | 40 页合成 fixture + 植入真值 | 基准脚本随仓 | `npm run bench` / `npm run verify`（门槛读 `rules/manifest.json`） | ✅ M2：12/12 规则达标（正 48 / 负 24 / finding 48 / 误报 0）+ 3 组探活全红 |
| 未点击前零注入 | `activeTab` + `scripting` 按需注入 | manifest 无 `content_scripts` | `tests/injection-chain.test.mjs`（含否定性事实：黑名单站点零注入） | ✅ M2（浏览器冒烟仍未做，见 `plan/06` §五） |
| 点击到出结果 < 500ms（5k 节点页） | 合成 5k 节点页面（`data/fixtures/stress-5k/page.html`） | 单遍遍历 | 基准 B7（阈值读 `rules/manifest.json`） | ✅ M2：5007 节点冷 106.5ms / 热 114.2ms（口径见 D31） |
| 权限最小化 | manifest 白名单 | 交付物即 manifest | `tests/manifest-permissions.test.mjs` 逐项比对 | ✅ M2（白名单不变，M0 起常驻） |
| 取证层清除后 DOM diff = 0 | Shadow DOM 覆盖层 | content script | `tests/overlay-dom-diff.test.mjs` | ⬜ 待 M3 |
| 侧边栏冷启动 / SW 被回收后恢复 | `chrome.storage.session` | sidePanel + SW | `tests/sidepanel-restore.test.mjs` | ⬜ 待 M4 |
| 导出 Markdown/JSON 字段完整且字节稳定 | Blob + `<a download>` | sidePanel 导出按钮 | `tests/export.test.mjs` + 基准 B3（40 页双跑字节一致） | 🟡 导出核心 + 双跑断言在（M0），UI 待 M5 |
| 整轮扫描 + 导出 0 次网络请求 | 只读 DOM，无 fetch | 全链路 | `tests/zero-network.test.mjs` + 浏览器冒烟 | ⬜ 待 M5 |
| 文案统一「可疑模式（待核对）」 | 文案单点 `src/lib/copy.js` | sidePanel + 导出 | `tests/copy-guard.test.mjs`：禁用词扫描 + 阳性对照 | 🟡 扫描在（M0），UI 待 M4/M5 |
| 隐私声明与零采集一致 | `docs/隐私声明.md` | 文档 + 代码 | 人工对账 + 权限白名单断言 | ⬜ 待 M5 |
| **零远程代码**（MV3 硬约束） | 无 CDN、无 fetch、规则随包 | 全链路 | `tests/source-hygiene.test.mjs`：源码与产物无 `http(s)://` 外链、无 `eval` | ✅ 扫描常驻（M0 起，M2 增阈值 token 门禁） |

---

## 5. 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| **M0 计划与可运行骨架** | 装订三件 + `plan/00`–`07` + `data/README` + 规则数据 + 骨架代码/测试/门/CI | ✅ 2026-10-18 |
| **M1 数据先行** | 40 页合成 fixture + 逐页真值 + 覆盖矩阵 + 确定性生成器（`--check`） | ✅ 2026-10-19 |
| **M2 规则引擎与按需注入** | `rules/manifest.json` 落地 + 12 条规则引擎 + 采集器 + 注入链路 + 基准达标 | ✅ 2026-10-19 |
| **M3 页内取证高亮层** | Shadow DOM 覆盖层 + 编号徽标 + 双向联动 + 清除后 DOM diff = 0 | ⬜ 未开始 |
| **M4 侧边栏取证台** | 四组分组 + `storage.session` 恢复 + 站点级折叠 | ⬜ 未开始 |
| **M5 导出与设置** | Markdown/JSON 导出 + 黑白名单 + 规则开关 + README/隐私声明/商店素材 | ⬜ 未开始 |
| **M6 发布** | 公开仓库 + `v0.1.0` tag + Release + `plan/RELEASE-M6.md` 留档 | ⬜ 未开始 |

> **DoD 只加不减**：M6 行的"附产物"三个字不得在重写里程碑表时省略或改写；要减必须在 §2 决策记录留一行理由。
> **状态副本一致性**：上表 + `plan/06` 状态表 + `README.md` 状态行三处由 `tools/check-sprint-layout.mjs` 逐处比对，任一处不一致即布局门红。
> **tag 时点口径**：`plan/RELEASE-M6.md` 必须在 tag **之前**写好并进 tag 树；发布后才产生的事实（Release 附件 sha256、真下载复核）作为 tag 后追加提交，在该文档里分栏写。
