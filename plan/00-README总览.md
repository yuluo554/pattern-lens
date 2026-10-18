# 00 · README 总览 — 10-19-pattern-lens（界面取证镜 pattern-lens）

> 方法论：`ai-tool-project-sprint`（装订 2026-10-18）｜布局门：`node tools/check-sprint-layout.mjs`（或 `npm run layout`）｜**续接对话第一件事 = 跑它**｜锚点见 `AGENTS.md`

- **项目**：界面取证镜（pattern-lens）——暗黑模式**取证**浏览器扩展（Chrome/Edge Manifest V3）
- **性质**：自拟项目题 · **不参赛** · 发布 GitHub **公开仓库** · 署名 `yuluo554`
- **版本**：v1（2026-10-17 题定稿；需求侧与开源检索基准日 2026-10-17）；M0 骨架落地 2026-10-18
- **一句话定位**：点一下扩展图标，侧边栏列出当前页所有**可疑模式（待核对）**——规则名 + 原文片段 + 元素定位 + 严重度，页面上用编号徽标高亮取证，一键导出证据包。**做取证，不做打分**：无证据节点不产出结论。
- **交付形态**：**唯一形态** = Chrome/Edge MV3 扩展（侧边栏 + 按需注入 content script + service worker），纯前端、无后端、无模型、无远程代码。不设备选形态。
- **当前状态**：🟡 **M0（计划套件 + 可运行骨架）完成**，M1–M6 未开工。台账状态列按**实际验证过的证据**翻转，未验证项保持 ⬜。

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
| `plan/HANDOFF-M1.md` | **启动第 1 棒时读的交接单**（M0 收尾时写） | ✅ M0 收尾 |
| `plan/RELEASE-M6.md` | 发布留档（tag 前事实 / tag 后追加，两栏） | ⬜ 待 M6 |
| `manifest.json` + `src/` | MV3 清单与扩展源码 | 🟡 骨架（M0） |
| `rules/manifest.json` + `rules/dp-*.json` | 规则包版本/阈值（唯一数值真相源）+ 首批 12 条规则 | 🟡 规则数据落盘（M0），引擎待 M2 |
| `data/fixtures/` + `data/fixtures/truth/` | 40 页合成 fixture 与逐页真值 | ⬜ 待 M1 |
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
| D21 | **源码卫生判据只扫剥注释后的代码**（注释不是行为） | 直接扫原文 | 判据扫原文时，注释里"本模块不碰扩展 API"这类说明文字会被判成违规（**判据张冠李戴**）。正解 = 剥离注释后再扫，并配两条自证：① 剥离后仍留代码 token（防"剥离函数吃空整段"造成假绿）；② 注入的真违规仍被抓住（阳性对照） |

---

## 3A. 招牌动词表（能力名词 → 交付态入口 → 断言基准）

> 表内每个能力名词都出自 `plan/01` 的标题或定位宣言；任一格填不出就该删词或降级为 roadmap。

| 能力名词 | 哪条交付态入口产出它 | 哪条基准/测试断言它 |
| --- | --- | --- |
| 可疑模式清单（findings） | 点击扩展图标 → sidePanel「开始扫描」（M1/M2） | `tests/rules-bench.test.mjs` 的逐规则 precision/recall 断言 |
| 规则名 + 规则解释 | 同上；文本只从 `rules/dp-*.json` 读取（M2） | `tests/explanation-single-source.test.mjs`：`finding.explanation === 规则包 explanation` |
| 原文片段（snippet） | 采集器从宿主文本节点原样截取（M2） | `tests/snippet-verbatim.test.mjs`：snippet 是宿主文本的原样子串 |
| 元素定位（locator） | 采集器为每个节点生成稳定定位串（M2） | `tests/locator-resolve.test.mjs`：locator 可回解到唯一节点 |
| 严重度（severity） | 规则包 `severity` 字段（M2） | `tests/severity-enum.test.mjs`：取值属于 `rules/manifest.json` 枚举 |
| 编号徽标高亮 | 扫描后自动注入覆盖层 / 侧边栏「在页面高亮」（M3） | `tests/overlay-dom-diff.test.mjs`：清除后页面 DOM diff = 0 |
| 侧边栏取证台（四组分组） | 点击扩展图标打开 sidePanel（M4） | `tests/sidepanel-restore.test.mjs`：冷启动与 SW 被回收后恢复一致 |
| 一键导出证据包 | 侧边栏「导出 Markdown / JSON」（M5） | `tests/export-fields.test.mjs` + 两次导出字节一致断言 |
| 零网络请求 | 扫描 + 导出全流程（M5） | `tests/zero-network.test.mjs` + 浏览器冒烟的 resource 计数断言 |
| 零注入 | 扩展安装后未点击前（M1） | `tests/no-injection-before-click.test.mjs`：manifest 无 `content_scripts`，且源码里无静态注入 |

---

## 3B. 提交材料实物表（`plan/01` §三 逐项对账）

| 承诺项 | 应存在的文件路径 | 由哪个里程碑产出 | 用哪条命令核对 |
| --- | --- | --- | --- |
| Manifest V3 清单 | `manifest.json` | M0（骨架）/ M2（定稿） | `git ls-files manifest.json` + `npm test -- tests/permissions-whitelist.test.mjs` |
| 扩展源码 | `src/background/service-worker.js`、`src/content/scanner.js`、`src/sidepanel/`、`src/lib/` | M1/M3/M4 | `git ls-files src` |
| 目录结构说明 | `docs/目录结构说明.md` | M5 | `git ls-files docs/目录结构说明.md` |
| 规则包 | `rules/dp-*.json` + `rules/manifest.json` | M0（数据）/ M2（引擎） | `git ls-files rules` |
| 合成 fixture 与真值 | `data/fixtures/` + `data/fixtures/truth/` | M1 | `git ls-files data/fixtures` |
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
| 12 条规则可解释、可逐条开关 | 自建规则包 `rules/dp-*.json`（素材来源 = 公开讨论中的具体手法描述，见 `plan/01` §1.1） | 扩展内打包，随包版本化 | `tests/rules-schema.test.mjs` + 侧边栏规则开关 | 🟡 规则数据已落盘（M0），开关待 M5 |
| 无证据节点不产出 finding | 规则包 `evidence_required` 字段 | 判定核心内置门禁 | `tests/evidence-gate.test.mjs`：去掉证据节点后 finding 归零、进 `rejected[]` | 🟡 门禁骨架已通（M0），全量待 M2 |
| 单规则 precision ≥ 0.90 / recall ≥ 0.80 | 40 页合成 fixture + 植入真值 | 基准脚本随仓 | `npm run verify`（门槛读 `rules/manifest.json`） | ⬜ 待 M2 |
| 未点击前零注入 | `activeTab` + `scripting` 按需注入 | manifest 无 `content_scripts` | `tests/no-injection-before-click.test.mjs` | 🟡 骨架断言在（M0） |
| 点击到出结果 < 500ms（5k 节点页） | 合成 5k 节点页面 | 单遍遍历 | `tests/latency-5k.test.mjs`（阈值读 `rules/manifest.json`） | ⬜ 待 M2 |
| 权限最小化 | manifest 白名单 | 交付物即 manifest | `tests/permissions-whitelist.test.mjs` 逐项比对 | 🟡 骨架断言在（M0） |
| 取证层清除后 DOM diff = 0 | Shadow DOM 覆盖层 | content script | `tests/overlay-dom-diff.test.mjs` | ⬜ 待 M3 |
| 侧边栏冷启动 / SW 被回收后恢复 | `chrome.storage.session` | sidePanel + SW | `tests/sidepanel-restore.test.mjs` | ⬜ 待 M4 |
| 导出 Markdown/JSON 字段完整且字节稳定 | Blob + `<a download>` | sidePanel 导出按钮 | `tests/export-fields.test.mjs` + 双跑字节一致 | 🟡 导出核心 + 双跑断言在（M0），UI 待 M5 |
| 整轮扫描 + 导出 0 次网络请求 | 只读 DOM，无 fetch | 全链路 | `tests/zero-network.test.mjs` + 浏览器冒烟 | ⬜ 待 M5 |
| 文案统一"可疑模式（待核对）" | 文案单点 `src/ui/copy.js` | sidePanel + 导出 | `tests/copy-guard.test.mjs`：禁用词扫描 + 阳性对照 | 🟡 扫描在（M0），UI 待 M4/M5 |
| 隐私声明与零采集一致 | `docs/隐私声明.md` | 文档 + 代码 | 人工对账 + 权限白名单断言 | ⬜ 待 M5 |
| **零远程代码**（MV3 硬约束） | 无 CDN、无 fetch、规则随包 | 全链路 | `tests/source-hygiene.test.mjs`：源码与产物无 `http(s)://` 外链、无 `eval` | 🟡 扫描在（M0） |

---

## 5. 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| **M0 计划与可运行骨架** | 装订三件 + `plan/00`–`07` + `data/README` + 规则数据 + 骨架代码/测试/门/CI | ✅ 2026-10-18 |
| **M1 数据先行** | 40 页合成 fixture + 逐页真值 + 覆盖矩阵 + 确定性生成器（`--check`） | ⬜ 未开始 |
| **M2 规则引擎与按需注入** | `rules/manifest.json` 落地 + 12 条规则引擎 + 采集器 + 注入链路 + 基准达标 | ⬜ 未开始 |
| **M3 页内取证高亮层** | Shadow DOM 覆盖层 + 编号徽标 + 双向联动 + 清除后 DOM diff = 0 | ⬜ 未开始 |
| **M4 侧边栏取证台** | 四组分组 + `storage.session` 恢复 + 站点级折叠 | ⬜ 未开始 |
| **M5 导出与设置** | Markdown/JSON 导出 + 黑白名单 + 规则开关 + README/隐私声明/商店素材 | ⬜ 未开始 |
| **M6 发布** | 公开仓库 + `v0.1.0` tag + Release + `plan/RELEASE-M6.md` 留档 | ⬜ 未开始 |

> **DoD 只加不减**：M6 行的"附产物"三个字不得在重写里程碑表时省略或改写；要减必须在 §2 决策记录留一行理由。
> **状态副本一致性**：上表 + `plan/06` 状态表 + `README.md` 状态行三处由 `tools/check-sprint-layout.mjs` 逐处比对，任一处不一致即布局门红。
> **tag 时点口径**：`plan/RELEASE-M6.md` 必须在 tag **之前**写好并进 tag 树；发布后才产生的事实（Release 附件 sha256、真下载复核）作为 tag 后追加提交，在该文档里分栏写。
