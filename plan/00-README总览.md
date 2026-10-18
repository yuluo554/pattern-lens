# 00 - README 总览：界面取证镜（pattern-lens·暗黑模式取证浏览器扩展）

**仓库**：`10-19-pattern-lens`
**性质**：不参赛项目题，发布 GitHub **公开**仓库，署名 `yuluo554`
**版本**：v1（2026-10-17，题定稿 + 骨架）
**交付形态**：**唯一形态** = Chrome/Edge **Manifest V3 浏览器扩展**（侧边栏 + 按需注入 content script + service worker），纯前端、无后端、无模型、无远程代码。

一句话定位：点一下扩展图标，侧边栏列出当前页所有**可疑模式（待核对）**——规则名 + 原文片段 + 元素定位 + 严重度，页面上同步用编号徽标高亮取证，一键导出 Markdown/JSON 证据包。**做取证，不做打分**：无证据节点不产出结论。

**当前状态**：🟡 **题定稿 + 骨架已建（M0）**。M1–M6 见 §4，尚未开工。

---

## 1. 文档索引

| 编号 | 文档 | 内容 | 状态 |
|---|---|---|---|
| 00 | `plan/00-README总览.md` | 总览、文档索引、决策记录、招牌动词表、提交材料实物表、承诺-证据台账、里程碑 | ✅ 已定稿（随里程碑回写） |
| 01 | `plan/01-题目文档.md` | 十段式题面（介绍、任务、材料、评分、锚点、边界） | ✅ 已定稿 |
| 02 | `plan/02-需求解读与能力转译.md` | 痛点→能力转译、FR 清单（含优先级）、NFR、边界 | ⬜ 待 M0 收尾落盘 |
| 03 | `plan/03-架构与技术选型.md` | MV3 架构、消息协议、目录结构、权限白名单、编码纪律 | ⬜ 待 M0 收尾落盘 |
| 04 | `plan/04-模块详设.md` | 五模块接口 / 判定语义 / 冻结草案 / 逐形态验收 | ⬜ 待 M0 收尾落盘 |
| 05 | `plan/05-数据计划与基准计划.md` | fixture 计划、真值标注规范、基准套件与门槛口径 | ⬜ 待 M0 收尾落盘 |
| 06 | `plan/06-里程碑与每周演示.md` | 里程碑总表、逐棒 DoD 与演示物 | ⬜ 待 M0 收尾落盘 |
| 07 | `plan/07-交付对标与发布计划.md` | 提交材料对照、评分对策、M6 发布执行清单 | ⬜ 待 M0 收尾落盘 |
| — | `plan/HANDOFF-M1.md` | M1（数据先行）交接快照 | ⬜ 待落盘 |
| — | `plan/RELEASE-M6.md` | 发布留档（tag 时点事实 / tag 后追加事实分栏） | ⬜ 待 M6 |
| — | `data/README.md` | 查证记录、数据源可获取性、合成数据纪律、数值口径纪律 | ✅ 已定稿 |
| — | `rules/manifest.json` | 规则包版本、严重度枚举、precision/recall 门槛、扫描超时、匹配优先级（**唯一数值真相源**） | ⬜ 待 M2 |
| — | `rules/dp-*.json` | 首批 12 条规则 | ⬜ 待 M2 |
| — | `data/fixtures/` + `data/fixtures/truth/` | 40 个合成页面与逐页真值 | ⬜ 待 M1 |
| — | `docs/商店素材清单.md` + `assets/store/` | 商店素材清单与实物 | ⬜ 待 M5 |
| — | `docs/隐私声明.md` | 隐私声明文本 | ⬜ 待 M5 |
| — | `README.md` | 用户侧门面 | ⬜ 待 M5 |

---

## 2. 决策记录

### 2.1 题定稿期决策（v1，2026-10-17）

| # | 决策 | 备选方案 | 结论与弃选理由 |
|---|---|---|---|
| D1 | **形态 = Chrome/Edge MV3 扩展**（侧边栏取证台 + 按需注入扫描器） | ①本地 CLI；②桌面程序；③Web 服务 | 本题的取证对象是**渲染后的 DOM**——CLI/桌面要另装浏览器自动化栈，既有重依赖又需宽泛权限，且"点一下就看当前页"的即时性丢失。Web 服务要把页面内容送出本机，直接违反隐私红线。**弃 CLI/桌面/Web 服务**。本系列首次做浏览器扩展形态 |
| D2 | **核心亮点 = 规则即证据模板**（`evidence_required` 门禁） | 沿用"检出即报"的启发式 | **弃"检出即报"**：暗黑模式规则的误报会直接伤害工具可信度与法律安全；改为"证据节点取不到就不产出 finding"，把每条结论钉在可复核的 DOM 节点与原文上 |
| D3 | **弃"菜谱份量换算"方向** | 做食谱份量/单位换算工具 | 换算层虽 0★，但用户痛点在"去废话"而非"换算"；且 `RecipeFilter` 297★ 已占据该场景的注意力，正面进入无差异化 |
| D4 | **弃"表格导出"方向** | 做网页表格一键导出 | `copytables` 152★ 已占、商业品成熟、浏览器原生复制/表格识别夹击，无空白可打 |
| D5 | **弃"单位价格 / 缩水通胀"方向** | 做超市单价换算与缩水通胀计算 | 需逐站点定制抽取规则（脆弱），且无后端、无历史价数据库，做不出可信的时间序列结论 |
| D6 | **弃 ML 打分路线** | 用模型给页面打"暗黑指数" | 不可解释 + 法律风险（定性标签）+ 无远程代码约束（MV3 禁止远程模型/远程代码）。规则化是唯一能同时满足可解释、可审计、可离线复现的路线 |
| D7 | **弃宽泛权限** | 申请 `<all_urls>` + `tabs` 常驻注入 | 商店审核与用户信任双重代价；常驻注入与"未点击前零注入"的可验证承诺冲突。改 `activeTab` 按需注入 |
| D8 | **文案统一"可疑模式（待核对）"** | 直接标"暗黑模式/欺诈" | 直接定性有法律与商店审核风险；统一措辞 + 每条附规则解释与原文，是"取证"而非"判决" |
| D9 | **首期 12 条规则** | 追求全量暗黑模式分类学 | 分类学没有公认闭合清单，贪全会摊薄每条规则的证据质量；12 条覆盖紧迫/误导/障碍/价格四组，先证明"证据门禁"这条路走得通 |
| D10 | **不写会漂移的硬数字** | 题面写死测试数/代码行数 | 只写口径与门槛来源（门槛进 `rules/manifest.json`）；规模数字以末态回填 |
| D11 | **数值口径一处定义** | 各文档各写一份阈值 | 严重度分级、precision/recall 门槛、扫描超时、匹配优先级、fixture 规模只在 `rules/manifest.json` 定义；其余文档引用 |
| D12 | **规则包随包版本化，不做热更新** | 远程拉取规则包 | MV3 禁止远程代码；远程规则即远程代码。热更新需重新提交商店，列入 roadmap |

---

## 3A. 招牌动词表（能力名词 → 交付态入口 → 断言基准）

> 表内每个能力名词都出自 plan/01 的标题或定位宣言；任一格填不出就该删词或降级为 roadmap。

| 能力名词 | 哪条交付态入口产出它 | 哪条基准/测试断言它 |
|---|---|---|
| 可疑模式清单（findings） | 点击扩展图标 → sidePanel「开始扫描」（M1/M2） | `tests/rules_bench.spec.js` 的逐规则 precision/recall 断言 |
| 规则名 + 规则解释 | 同上；文本只从 `rules/dp-*.json` 读取（M2） | `tests/rules_schema.spec.js`：`finding.explanation === 规则包 explanation` |
| 原文片段（snippet） | 扫描器从宿主文本节点截取（M2） | `tests/snippet_verbatim.spec.js`：snippet 必须是宿主文本的原样子串 |
| 元素定位（locator） | 扫描器为每个 finding 生成稳定定位（M2） | `tests/locator_resolve.spec.js`：locator 可回解到唯一节点 |
| 严重度（severity） | 规则包 `severity` 字段（M2） | `tests/severity_enum.spec.js`：取值属于 `rules/manifest.json` 枚举 |
| 编号徽标高亮 | 扫描后自动注入覆盖层 / 侧边栏「在页面高亮」（M3） | `tests/overlay_dom_diff.spec.js`：清除后页面 DOM diff = 0 |
| 侧边栏取证台（四组分组） | 点击扩展图标打开 sidePanel（M4） | `tests/sidepanel_restore.spec.js`：冷启动与 SW 被杀后恢复一致 |
| 一键导出证据包 | 侧边栏「导出 Markdown / JSON」（M5） | `tests/export_fields.spec.js` + 两次导出字节一致断言 |
| 零网络请求 | 扫描 + 导出全流程（M5） | `tests/zero_network.spec.js`：拦截并断言请求数为 0 |
| 零注入 | 扩展安装后未点击前（M1） | `tests/no_injection_before_click.spec.js`：页面无 scanner 脚本 |

---

## 3B. 提交材料实物表（plan/01 §三 逐项对账）

| 承诺项 | 应存在的文件路径 | 由哪个里程碑产出 | 用哪条命令核对 |
|---|---|---|---|
| Manifest V3 清单 | `manifest.json` | M2 | `git ls-files manifest.json` + `tests/permissions_whitelist.spec.js` |
| 扩展源码 | `src/background/service-worker.js`、`src/content/scanner.js`、`src/sidepanel/`、`src/lib/` | M1/M3/M4 | `git ls-files src` |
| 目录结构说明 | `docs/目录结构说明.md` | M5 | `git ls-files docs/目录结构说明.md` |
| 规则包 | `rules/dp-*.json` + `rules/manifest.json` | M2 | `git ls-files rules` |
| 合成 fixture 与真值 | `data/fixtures/` + `data/fixtures/truth/` | M1 | `git ls-files data/fixtures` |
| 商店素材清单与实物 | `docs/商店素材清单.md` + `assets/store/` | M5 | `git ls-files docs/商店素材清单.md assets/store` |
| 隐私声明 | `docs/隐私声明.md` | M5 | `git ls-files docs/隐私声明.md` |
| 测试套件 | `tests/` | M2–M5 | `git ls-files tests` + `npm test` |
| README | `README.md` | M5 | `git ls-files README.md` |
| 发布留档 | `plan/RELEASE-M6.md` | M6 | `git cat-file -e v0.1.0:plan/RELEASE-M6.md` |

> **纪律**：上表任一行在 M6 指不到实物，该项从 plan/01 §三 与评分表同时删除，不得留成无主承诺。

---

## 3. 承诺-证据台账（全项目唯一一份）

| 承诺项 | 素材来源 | 交付物内可达性 | 核验方式 | 状态 |
|---|---|---|---|---|
| 12 条规则可解释、可逐条开关 | 自建规则包 `rules/dp-*.json`（素材来源 = 公开讨论中的具体手法描述，见 plan/01 §1.1） | 扩展内打包，随包版本化 | `tests/rules_schema.spec.js` + 侧边栏规则开关 | ⬜ 待 M2 |
| 无证据节点不产出 finding | 规则包 `evidence_required` 字段 | 扫描器内置门禁 | `tests/evidence_gate.spec.js`：去掉证据节点后 finding 归零 | ⬜ 待 M2 |
| 单规则 precision ≥ 0.90 / recall ≥ 0.80 | 40 页合成 fixture + 植入真值 | 基准脚本随仓 | `npm run bench`（门槛读 `rules/manifest.json`） | ⬜ 待 M2 |
| 未点击前零注入 | `activeTab` + `scripting` 按需注入 | manifest 无 `content_scripts` | `tests/no_injection_before_click.spec.js` | ⬜ 待 M1 |
| 点击到出结果 < 500ms（5k 节点页） | 合成 5k 节点页面 | 扫描器单遍遍历 | `tests/latency_5k.spec.js`（阈值读 `rules/manifest.json`） | ⬜ 待 M2 |
| 权限最小化 | manifest 白名单 | 交付物即 manifest | `tests/permissions_whitelist.spec.js` 逐项比对 | ⬜ 待 M2 |
| 取证层清除后 DOM diff = 0 | Shadow DOM 覆盖层 | content script | `tests/overlay_dom_diff.spec.js` | ⬜ 待 M3 |
| 侧边栏冷启动 / SW 被杀后恢复 | `chrome.storage.session` | sidePanel + SW | `tests/sidepanel_restore.spec.js` | ⬜ 待 M4 |
| 导出 Markdown/JSON 字段完整且字节稳定 | Blob + `<a download>` | sidePanel 导出按钮 | `tests/export_fields.spec.js` | ⬜ 待 M5 |
| 整轮扫描 + 导出 0 次网络请求 | 只读 DOM，无 fetch | 全链路 | `tests/zero_network.spec.js` | ⬜ 待 M5 |
| 文案统一"可疑模式（待核对）" | UI 文案表 | sidePanel + 导出 | `tests/copy_guard.spec.js`：grep 禁用词 | ⬜ 待 M5 |
| 隐私声明与零采集一致 | `docs/隐私声明.md` | 文档 + 代码 | 人工对账 + 权限白名单断言 | ⬜ 待 M5 |

---

## 4. 里程碑初稿

| 里程碑 | 内容 | DoD（完成判据） | 状态 |
|---|---|---|---|
| **M1 数据先行** | 40 个合成 fixture 页面 + 逐页真值标注 + 假站点名白名单；规则素材从 plan/01 §1.1 的公开原话逐条转写为可判定条件 | 40 页全部落库；每页真值含 `rule_id` 与证据节点路径；`npm run fixture:check` 通过 | ⬜ |
| **M2 规则引擎** | `rules/manifest.json`（版本 + 阈值 + 枚举）+ 12 条规则包 + 扫描器 + 按需注入链路 | 单规则 precision ≥ 0.90 / recall ≥ 0.80；证据门禁测试通过；权限白名单断言通过；未点击前零注入 | ⬜ |
| **M3 高亮层** | Shadow DOM 覆盖层 + 编号徽标 + 双向联动 | 清除后 DOM diff = 0；宿主 `styleSheets` 数量不变；编号一一对应 | ⬜ |
| **M4 侧边栏** | 四组分组取证台 + `storage.session` 恢复 + 站点级折叠 | 冷启动恢复一致；SW 被杀后恢复一致；分组与排序断言通过 | ⬜ |
| **M5 导出与设置** | Markdown/JSON 导出 + 站点黑白名单 + 规则开关 + README/隐私声明/商店素材 | 导出字段完整且字节稳定；0 网络请求；`docs/商店素材清单.md` 与 `assets/store/` 实物对账 | ⬜ |
| **M6 发布** | 公开仓库 + v0.1.0 发布 | **git tag `v0.1.0` + GitHub Release（附产物：扩展打包 zip，本地留副本 + sha256）+ `plan/RELEASE-M6.md` 发布留档（tag 时点事实 / tag 后追加事实分栏）**；`scripts/check_release.py` 无 FAIL | ⬜ |

> **DoD 只加不减**：M6 行的"附产物"三个字不得在重写里程碑表时省略或改写；要减必须在 §2 决策记录留一行理由。
> **tag 时点口径**：`plan/RELEASE-M6.md` 必须在 tag **之前**写好并进 tag 树；发布后才产生的事实（Release 附件 sha256、真下载复核）作为 tag 后追加提交，在该文档里分栏写。
