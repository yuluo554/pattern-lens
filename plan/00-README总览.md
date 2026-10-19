# 00 · README 总览 — 10-19-pattern-lens（界面取证镜 pattern-lens）

> 方法论：`ai-tool-project-sprint`（装订 2026-10-18）｜布局门：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）｜**续接对话第一件事 = 跑它**｜锚点见 `AGENTS.md`

- **项目**：界面取证镜（pattern-lens）——暗黑模式**取证**浏览器扩展（Chrome/Edge Manifest V3）
- **性质**：自拟项目题 · **不参赛** · 发布 GitHub **公开仓库** · 署名 `yuluo554`
- **版本**：v1（2026-10-17 题定稿；需求侧与开源检索基准日 2026-10-17）；M0 骨架落地 2026-10-18
- **一句话定位**：点一下扩展图标，侧边栏列出当前页所有**可疑模式（待核对）**——规则名 + 原文片段 + 元素定位 + 严重度，页面上用编号徽标高亮取证，一键导出证据包。**做取证，不做打分**：无证据节点不产出结论。
- **交付形态**：**唯一形态** = Chrome/Edge MV3 扩展（侧边栏 + 按需注入 content script + service worker），纯前端、无后端、无模型、无远程代码。不设备选形态。
- **当前状态**：🟡 **M0 / M1 / M2 / M3 / M4 完成**（M3 = 页内取证高亮层：Shadow DOM 覆盖层 + 编号徽标 + 双向联动 + 清除后 DOM diff = 0，含真实浏览器冒烟；M4 = 侧边栏取证台：四组分组来自规则包 + `storage.session` 冷启动/SW 回收后恢复 + 站点级折叠），M5–M6 未开工。台账状态列按**实际验证过的证据**翻转，未验证项保持 ⬜。

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
| `plan/HANDOFF-M4.md` | **启动第 4 棒时读的交接单**（M3 收尾时写） | ✅ M3 收尾 |
| `plan/RELEASE-M6.md` | 发布留档（tag 前事实 / tag 后追加，两栏） | ⬜ 待 M6 |
| `manifest.json` + `src/` | MV3 清单与扩展源码（引擎/采集器/注入链路已接入） | 🟡 骨架 M0，引擎链路 M2，页内取证层 M3，侧边栏取证台 M4，导出与设置 M5 |
| `rules/manifest.json` + `rules/dp-*.json` | 规则包版本/阈值（唯一数值真相源）+ 首批 12 条规则 | ✅ 数据 M0 / 引擎接入 M2 |
| `data/fixtures/` | 40 页合成 fixture + 逐页真值（`page-NN/truth.json`）+ 覆盖矩阵（`COVERAGE.md`）+ 压力页 | ✅ M1 |
| `tools/bench-rules.mjs` + `tools/fixture-page-model.mjs` | 规则基准 runner（B1–B7）与 Node 侧页面模型解析器（独立于生成器） | ✅ M2 |
| `docs/商店素材清单.md` + `assets/store/` | 商店素材清单与实物 | ✅ M5（清单 ↔ 实物双向对账，`tests/store-assets.test.mjs`） |
| `docs/隐私声明.md` | 隐私声明文本 | ✅ M5（与权限白名单逐项一致，`tests/store-assets.test.mjs`） |
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
| D31 | **周边文本用"按需翻倍前缀"归一**（`limitNearText`），不做通篇归一 | 逐节点对**整个父容器文本**做空白归一 | **实测**：压力页（5007 节点）里一个 `<ul>` 下有 2500 行，父文本 ~25k 字符 × 2500 子节点 ≈ 6 千万字符的正则归一 → 冷启动 **1313ms**，超 `first_result_budget_ms`（500ms）预算 2.6 倍。归一只让字符串**变短**（折叠空白），故"原始前缀归一后 ≥ limit"时其前 limit 字符与"全串归一后前 limit 字符"**逐字节相同** → 语义与通篇归一等价，工作量降到 O(limit×常数)（改后 **106~175ms**，多轮实测区间）。**弃通篇归一**（超预算即 NFR-06 不达标）；**弃"直接截原始串再归一"**（会在中间截断处制造"多一个少一个空格"的语义差） |

### 2.5 M3 页内取证层期决策（2026-10-19）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D32 | **覆盖层宿主用一个自定义元素名 `pattern-lens-overlay` + `id`，徽标/样式全在 `attachShadow({mode:"open"})` 内** | ①普通 `div` + 内联样式；②`web_accessible_resources` + iframe | M3 的三项 diff 判据（节点数 / 属性集 / `document.styleSheets.length`）要求"宿主只多一个容器节点、样式不进宿主"。**弃①**：普通 div 仍会把徽标作为宿主子节点（节点数会 +N，不是 +1），且内联样式会污染宿主属性集。**弃②**：iframe 与 `web_accessible_resources` 会把扩展资源暴露给网页（可指纹识别），且跨 frame 定位/点击链路复杂。真实浏览器实测（Chrome 155）：容器 +1、`host.children.length = 0`、`styleSheets` 不变 |
| D33 | **编号只由 `src/lib/ordering.js` 产出；覆盖层把 `finding_id` 当编号搬运工**（`{finding_id: badge_id}` 即徽标 `textContent`/`dataset`） | 覆盖层内按 severity/DOM 序**再排一次**并自己编号 | K5 已声明"排序与编号是单点，UI 不得再排序/再编号"。若覆盖层自排，页内徽标编号与侧边栏编号会各自漂移（同一 finding 两处编号不同，用户按编号对不上）。**弃"再排一次"**：会立刻打挂"一一对应"判据（`tests/overlay-dom-diff.test.mjs` 传入顺序与编号顺序相反，自排即红） |
| D34 | **`focus-finding` 双向半程靠 SW 区分来源**：带 `sender.tab`（页内徽标点击）→ 回 `{status:"from_content"}` **不转发**；无 `sender.tab`（侧边栏发起）→ 转发给当前标签页 | 不区分来源，一律转发给当前标签页 | 页内徽标点击也发 `focus-finding`（反向半程）；SW 若一律转发，会把这条消息**再送回同一页面**，等于"点一次闪两下"。侧边栏是扩展页（`sender.tab` 为空），故以"有无 `sender.tab`"区分方向是可靠判据。**弃"不区分"**：真实浏览器里表现为重复闪烁（`tests/injection-chain.test.mjs` 用否定性事实断言页内来源零转发） |
| D35 | **浏览器冒烟单列脚本 `tools/smoke-overlay.mjs`，**不进 CI**；能拉起 → 真跑，拉不起 → 显式 SKIP（rc=0）** | ①把冒烟塞进 `npm test`；②本机确认拉不起浏览器 → 只 SKIP | 本机实测 **Chrome 155 可用且 CDP（零依赖 WebSocket）可驱动**，故不该直接 SKIP——真实点击双向联动是假 DOM 验不到的。**弃①**：CI（ubuntu/windows 无浏览器）会红，且拉浏览器不稳会污染 `npm test` 的确定性。**弃②**：那是"没试就说做不到"。口径：脚本自身**拉不起来时 SKIP**（把不稳这件事留在脚本里，而不是留在报告里） |

### 2.6 M4 侧边栏取证台期决策（2026-10-19）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D36 | **`LastScan` 字段名收敛为 `scan_result`**（实装侧改字段；`plan/06` M4 DoD 第 4 项的口径即实装） | ①改文档把 `plan/06` DoD 第 4 项写成 `scan`；②两侧各留一份 | M0–M3 实装写的是 `scan`，而 DoD 与 `plan/03` §三 要求 `scan_result`——**两侧各写一份即口径漂移**（登记在 `plan/HANDOFF-M4.md` §2 第 4 条）。**弃①**：DoD 是题面承诺，改它等于把验收口径往实装迁就；**弃②**：正是要消灭的漂移。收敛落点 = `src/lib/sidepanel-view.js` 的 `scanRecordOf()`（唯一产出处，改字段只改这里 + 测试）；`tests/injection-chain.test.mjs` 与 `tests/sidepanel-restore.test.mjs` 双侧断言 |
| D37 | **站点级折叠用第二个 session 键 `ScanHistory`**（`LastScan` 仍保留最新一次）；历史**扫描时间倒序**、按 `(url, scanned_at)` 去重、上限 20 | ①只存内存（关掉 sidepanel 即丢）；②不实现折叠（M4 只做 4 项 DoD，里程碑行措辞收敛） | 里程碑行（三处状态副本）写的是「四组分组 + `storage.session` 恢复 + **站点级折叠**」，而 M4 DoD 只列 4 项（不含折叠）。**弃②**：会让状态表里的承诺在 M4 ✅ 时仍无实现（"写了却没做"）；**弃①**：折叠要求"关掉侧边栏再开，多次扫描仍按时间倒序折叠"，纯内存做不到。故新增 `ScanHistory`（SW 落盘、sidepanel 只读，**不各存一份**）；`HISTORY_MAX = 20` 是小整数常数（K1 豁免面内，不进 manifest） |
| D38 | **侧边栏纯逻辑单列 `src/lib/sidepanel-view.js`，`sidepanel.js` 只做 DOM 接线并支持依赖注入**（`initSidepanel({doc, runtime})`） | ①纯逻辑留在 `sidepanel.js`（靠全局 `document`/`chrome`）；②只做纯函数、不验 DOM 侧 | 分组/折叠/恢复/空态文案这些判据**必须能离线验收**——但 `sidepanel.js` 依赖宿主 `document`，写在一起就只能"跑扩展"才能验。**弃①**：等于把 M4 DoD 的 4 项判据全押在"有没有浏览器"上（与 D15 的分层口径相悖）；**弃②**：DOM 侧接线（`<details open>` 只展开最新、恢复落到文案）同样是 DoD 判据，不验就只是"函数对了"。故纯逻辑进 `src/lib/**`（K10：不碰扩展 API / DOM / 时钟），DOM 侧靠假 DOM + 假 chrome 运行时验收（同 injection-chain / overlay 的做法） |

### 2.7 M5 导出与设置期决策（2026-10-19）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D39 | **导出产物单点 = `src/lib/export.js` 的 `exportArtifact(scan, manifest, format)`**（返回 `{format, filename, mime, text}`；`sidepanel.js` 只做 `Blob` + `<a download>`，**不自己拼文本/MIME/扩展名**） | ①UI 里直接调 `toMarkdown` / `toJsonText` 并自己拼 MIME；②UI 侧自留一份字段顺序 | M5 DoD 第 1/2 项要求"导出字段完整 + 双跑字节一致"，而这两条要在**UI 导出路径**上复核——但 `sidepanel.js` 依赖宿主 `document`，写在一起就只能"跑扩展"才验（同 D38 的分层理由）。**弃①**：`text/markdown`、`application/json`、扩展名会在 UI 里成为第二份真相（改格式要改两处）；**弃②**：字段顺序已是 K7 契约（单点 `export.js`），UI 再排一次即漂移。故"取哪份文本 / 叫什么名 / 什么 MIME"抽成纯函数 → 离线可对**同一条路径**逐字节断言，真实浏览器侧由 `npm run smoke:export` 捕获 UI 交出去的 `Blob` 与离线产物比对 |
| D40 | **浏览器自动化底座单点 = `tools/cdp.mjs`**（浏览器发现 / 就绪等待 / CDP 客户端 / `evaluate` / `launch` / SKIP 口径）；`smoke-overlay.mjs`（M3）与 `smoke-export.mjs`（M5）复用 | 各自抄一份 CDP 客户端 | 两个冒烟脚本都要"拉起本机浏览器 → CDP 驱动 → 真实点击/真实渲染"。**弃"各抄一份"**：抄第二份会让"怎么拉浏览器、怎么判就绪、怎么发真实点击"在两处各自漂移（K 口径纪律：同一判据只许一处实现）。故收敛到 `cdp.mjs`；两脚本只写各自**要验的事**（M3 验页内覆盖层，M5 验导出与网络计数） |
| D41 | **商店素材（图标 / 截图）一律生成、禁手编**：图标由 `tools/gen-store-icons.mjs` 用**自写最小 PNG 编码器**（`node:zlib` deflate + 自算 CRC32）确定性产出（`--check` 逐字节比对）；截图由 `tools/smoke-export.mjs --shots` 在真实浏览器里渲染产出 | ①手工放位图素材；②引入图像库生成 | 仓库纪律是"产物一律生成、禁手编"（同 K23）。**弃①**：位图手编不可复现、改一处不知道改哪；**弃②**：会引入第三方依赖，与"零依赖"承诺冲突。故图标走自写编码器（无依赖、逐字节确定、可 `--check`）；截图是真实渲染产物，**不做逐字节断言**（浏览器渲染逐次有像素级差异），只断言存在与尺寸 |
| D42 | **浏览器临时 profile 落点改到仓库内 `tmp/`（已在 `.gitignore`），不用系统临时目录** | 继续用 `os.tmpdir()` | **实测踩坑**：本机系统临时目录在 **C 盘**，Chrome profile 每个约 20~26MB，反复冒烟把 C 盘塞满（实测爆过一次、机器卡死）。**弃"继续用系统临时目录"**：冒烟脚本会反复跑，落点在仓库所在盘更安全，且脚本退出时清理。可用环境变量 `PL_TMP_DIR` 覆盖 |

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
| 编号徽标高亮 | 扫描后自动注入覆盖层 / 侧边栏「在页面高亮」（M3） | `tests/overlay-dom-diff.test.mjs`：清除后页面 DOM diff = 0；**浏览器冒烟**（真实点击双向联动） | ✅ M3 |
| 侧边栏取证台（四组分组） | 点击扩展图标打开 sidePanel（M4） | `tests/sidepanel-restore.test.mjs`：四组分组顺序/归属来自规则包；冷启动与 SW 被回收后恢复一致；站点级折叠 | ✅ M4 |
| 一键导出证据包 | 侧边栏「导出 Markdown / JSON」（M5） | ✅ M5：`tests/export-fields.test.mjs`（UI 导出路径上验字段完整 + 双跑字节一致）+ `npm run smoke:export`（真实浏览器里导出的 Blob 与离线产物同源） |
| 零网络请求 | 扫描 + 导出全流程（M5） | ✅ M5：`tests/zero-network.test.mjs`（运行面源码断言 + 离线动态探针）+ `npm run smoke:export`（CDP `Network` 域计数，远程请求 0） |
| 零注入 | 扩展安装后未点击前（M2 已通） | `tests/injection-chain.test.mjs`：manifest 无 `content_scripts`；黑名单站点 `executeScript` **一次都没被调用** |

---

## 3B. 提交材料实物表（`plan/01` §三 逐项对账）

| 承诺项 | 应存在的文件路径 | 由哪个里程碑产出 | 用哪条命令核对 |
| --- | --- | --- | --- |
| Manifest V3 清单 | `manifest.json` | M0（骨架）/ M2（定稿） | `git ls-files manifest.json` + `npm test -- tests/permissions-whitelist.test.mjs` |
| 扩展源码 | `src/background/service-worker.js`、`src/content/scanner.js`、`src/content/overlay.js`、`src/sidepanel/`、`src/lib/` | M1/M3/M4/M5 | `git ls-files src` |
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
| 12 条规则可解释、可逐条开关 | 自建规则包 `rules/dp-*.json`（素材来源 = 公开讨论中的具体手法描述，见 `plan/01` §1.1） | 扩展内打包，随包版本化 | `tests/rules-schema.test.mjs` + `tests/site-settings.test.mjs`（规则开关端到端：禁用规则不进扫描/不进导出） | ✅ M5（数据与引擎 M0/M2；开关 M5 端到端验收） |
| 无证据节点不产出 finding | 规则包 `evidence_required` 字段 | 判定核心内置门禁 | `tests/engine-gate.test.mjs` + 基准 B2（8 类证据逐类断供 → 零产出 + `rejected` 非空 + 反向对照） | ✅ M2（语料侧此类候选实测 0 个，故用断供注入可证伪） |
| 单规则 precision ≥ 0.90 / recall ≥ 0.80 | 40 页合成 fixture + 植入真值 | 基准脚本随仓 | `npm run bench` / `npm run verify`（门槛读 `rules/manifest.json`） | ✅ M2：12/12 规则达标（正 48 / 负 24 / finding 48 / 误报 0）+ 3 组探活全红 |
| 未点击前零注入 | `activeTab` + `scripting` 按需注入 | manifest 无 `content_scripts` | `tests/injection-chain.test.mjs`（含否定性事实：黑名单站点零注入） | ✅ M2（浏览器冒烟仍未做，见 `plan/06` §五） |
| 点击到出结果 < 500ms（5k 节点页） | 合成 5k 节点页面（`data/fixtures/stress-5k/page.html`） | 单遍遍历 | 基准 B7（阈值读 `rules/manifest.json`） | ✅ M2：5007 节点冷 106~175ms / 热 114~178ms（多轮区间；口径见 D31） |
| 权限最小化 | manifest 白名单 | 交付物即 manifest | `tests/manifest-permissions.test.mjs` 逐项比对 | ✅ M2（白名单不变，M0 起常驻） |
| 取证层清除后 DOM diff = 0 | Shadow DOM 覆盖层 | content script | `tests/overlay-dom-diff.test.mjs` + `npm run smoke:overlay`（真实浏览器三项判据） | ✅ M3（假 DOM 离线 + 真实浏览器冒烟双侧） |
| 侧边栏冷启动 / SW 被回收后恢复 | `chrome.storage.session` | sidePanel + SW | `tests/sidepanel-restore.test.mjs` | ✅ M4（冷启动 + SW 回收后重开双侧一致；站点级折叠同段验） |
| 导出 Markdown/JSON 字段完整且字节稳定 | Blob + `<a download>` | sidePanel 导出按钮 | `tests/export.test.mjs` + `tests/export-fields.test.mjs`（UI 路径）+ 基准 B3（40 页双跑字节一致） | ✅ M5（UI 导出路径字段完整 + 双跑字节一致；真实浏览器侧同源） |
| 整轮扫描 + 导出 0 次网络请求 | 只读 DOM，无 fetch | 全链路 | `tests/zero-network.test.mjs` + `npm run smoke:export`（真实浏览器 CDP 计数） | ✅ M5（离线探针 + 真实浏览器远程请求 0） |
| 文案统一「可疑模式（待核对）」 | 文案单点 `src/lib/copy.js` | sidePanel + 导出 | `tests/copy-guard.test.mjs`：禁用词扫描 + 阳性对照 | ✅ M5：侧边栏空态与导出文案都走 copy 单点 + 禁用词扫描（含阳性对照） |
| 隐私声明与零采集一致 | `docs/隐私声明.md` | 文档 + 代码 | `tests/store-assets.test.mjs`（权限逐项点名 + 零网络 + 无远程代码 + 零注入与实装一致） | ✅ M5 |
| **零远程代码**（MV3 硬约束） | 无 CDN、无 fetch、规则随包 | 全链路 | `tests/source-hygiene.test.mjs`：源码与产物无 `http(s)://` 外链、无 `eval` | ✅ 扫描常驻（M0 起，M2 增阈值 token 门禁） |

---

## 5. 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| **M0 计划与可运行骨架** | 装订三件 + `plan/00`–`07` + `data/README` + 规则数据 + 骨架代码/测试/门/CI | ✅ 2026-10-18 |
| **M1 数据先行** | 40 页合成 fixture + 逐页真值 + 覆盖矩阵 + 确定性生成器（`--check`） | ✅ 2026-10-19 |
| **M2 规则引擎与按需注入** | `rules/manifest.json` 落地 + 12 条规则引擎 + 采集器 + 注入链路 + 基准达标 | ✅ 2026-10-19 |
| **M3 页内取证高亮层** | Shadow DOM 覆盖层 + 编号徽标 + 双向联动 + 清除后 DOM diff = 0 | ✅ 2026-10-19 |
| **M4 侧边栏取证台** | 四组分组 + `storage.session` 恢复 + 站点级折叠 | ✅ 2026-10-19 |
| **M5 导出与设置** | Markdown/JSON 导出 + 黑白名单 + 规则开关 + README/隐私声明/商店素材 | ✅ 2026-10-19 |
| **M6 发布** | 公开仓库 + `v0.1.0` tag + Release + `plan/RELEASE-M6.md` 留档 | ⬜ 未开始 |

> **DoD 只加不减**：M6 行的"附产物"三个字不得在重写里程碑表时省略或改写；要减必须在 §2 决策记录留一行理由。
> **状态副本一致性**：上表 + `plan/06` 状态表 + `README.md` 状态行三处由 `tools/check-sprint-layout.mjs` 逐处比对，任一处不一致即布局门红。
> **tag 时点口径**：`plan/RELEASE-M6.md` 必须在 tag **之前**写好并进 tag 树；发布后才产生的事实（Release 附件 sha256、真下载复核）作为 tag 后追加提交，在该文档里分栏写。
