# data/README.md —— 依据查证记录、数据源可获取性、合成数据纪律、数值口径纪律

> **基准日**：2026-10-17（全部检索与核验以该日为准；引用时须连同基准日一起引用，不得写成"目前/现在"）。
> 本文件是本题**证据链的唯一落点**。plan/01 的每条锚点都能在此找到对应的三态记录。
> **本文件不含任何数值阈值**——严重度分级、precision/recall 门槛、扫描超时、匹配优先级、fixture 规模，
> 全部只在 `rules/manifest.json` 定义一次（M2 落定），本文件与其余文档一律引用，不得手写第二份。

---

## 1. 依据查证记录（三态）

图例：✅ 已核对（可直连复核）｜⬜ 待核对（已登记获取路径与阻断原因）｜❌ 查证失败（已降级或弃用）

### 1.1 需求证据（HN 原话，逐条核验）

| # | 论点 | 依据（id / 分数） | 状态 | 备注 |
|---|---|---|---|---|
| K01 | 有人因拒绝上线暗黑模式被解雇 | HN item 27629543，615 分 / 53 评 | ✅ | 原话："I was let go for refusing to deploy a dark pattern" |
| K02 | 暗黑模式是长期高分议题 | HN item 17651488，1056 分 | ✅ | 标题 "Amazon Dark Patterns"；分数为抓取时点快照 |
| K03 | 同一议题的规模化讨论 | HN item 27017041，769 分 / 529 评 | ✅ | 标题 "Request for comments regarding topics to be discussed at Dark Patterns…" |
| K04 | 企业级案例被公开点名 | HN item 35142787，642 分 | ✅ | 标题 "Experian is a pile of dark pattern garbage" |
| K05 | 结账流程诱导重新勾选订阅 | HN item 19962898 | ✅ | 原话含 "dark patterns during checkout trying to trick me into opting back in" |
| K06 | 同上，另一处独立表述 | HN item 36431182 | ✅ | 原话含 "the sketchy dark patterns at checkout trying to get you to sign up again" |
| K07 | 取消订阅障碍导致用户只选 Apple 渠道 | HN item 44375396 | ✅ | 原话："only use subscriptions I can do via Apple" |
| K08 | 订阅/取消的敌意设计（2026-10，Adobe 讨论） | HN item 50011069 | ✅ | 原话："hostile dark patterns around subscriptions and cancellations" |
| K09 | 预勾选 + 难找的关闭 | HN item 29418159 | ✅ | 原话含 "hard to find close, boxes, pre-checked subscriptions" |
| K10 | 假紧迫 / 假稀缺被点名 | HN item 40935274 | ✅ | 原话含 "false urgency… real or fake temporal or quantitative limit" |
| K11 | 社区旁证（样本偏少） | r/ItEndsWithLawsuits 223 分；r/gachagaming 221 分 | ⬜ | 帖子主体为暗黑模式讨论；**链接与正文摘录未逐字复核**，入库时补 |

> **引用纪律**：K01–K10 的分数是**抓取时点快照**，不是"当前值"；题面与 README 引用时必须带基准日。
> K11 只作旁证，**不得**与 K01–K10 并列作为硬锚点。

### 1.2 开源空白（GitHub API 检索，基准日 2026-10-17）

| # | 检索式 | total_count | 头部仓库 | 状态 |
|---|---|---|---|---|
| S01 | `dark pattern browser extension` | 74 | `M-Aadhi/Ethiguard` 5★ | ⬜ 软论据 |
| S02 | `dark patterns detector chrome` | 23 | `hayattcodes/lumen` 4★ | ⬜ 软论据 |
| S03 | `dark pattern chrome extension` | 91 | `NicholasTung/dark-patterns-recognition` 31★，push 2022-01-25 | ⬜ 软论据 |
| S04 | `deceptive pattern extension` | 6 | 头部 3★ | ⬜ 软论据 |
| S05 | `deceptive design extension` | 16 | 头部 1★ | ⬜ 软论据 |
| S06 | `"dark pattern" in:name,description` | 1343 | `aruneshmathur/dark-patterns` 140★（CSCW'19 研究数据集，非扩展） | ⬜ 软论据 |
| S07 | `topic:dark-patterns` | 88 | `waitdeadai/llm-dark-patterns` 22★（prompt 套件，非扩展） | ⬜ 软论据 |
| S08 | `consent-o-matic` / `cookie consent extension` | 23 / 140 | `Consent-O-Matic` 4281★（**仅 cookie 弹窗**） | ⬜ 软论据 |

> **软论据定位**：以上为"检索式 + 基准日 + total_count"的**可回溯快照**，不是官方原文核对。
> 引用时**不得**写成"全球没有同类产品"，只能写"公开仓库检索未见 ≥50★ 的成熟同类扩展"。
> 星数与推送时间是检索时点值，会漂移；发布 README 引用时须重新取快照并更新基准日。

### 1.3 商业侧：未核验（⬜，不得断言）

| # | 事项 | 状态 | 阻断原因 |
|---|---|---|---|
| C01 | Chrome 应用商店同类扩展的安装量 / 评分 / 更新状态 | ⬜ 未核验 | 基准日 2026-10-17 本机访问商店**不可达** |
| C02 | Edge 加载项商店同类扩展 | ⬜ 未核验 | 同上 |

> **纪律**：商业侧任何表述（"没有成熟商业品""商店里没人做"）**一律禁止**。
> 题面、README、商店描述中涉及商业侧时，只能写"未核验"或省略。
> M1 若有条件补核，须登记渠道、检索式与新的基准日，并在 plan/00 决策记录留行。

### 1.4 技术可行性（✅ 按平台约束推演）

| # | 约束 | 状态 | 依据 |
|---|---|---|---|
| T01 | MV3 禁止远程代码 → 规则集必须打包进扩展 | ✅ | 平台约束（无远程代码），规则放 `rules/` 随包 |
| T02 | Service worker 可被回收 → 扫描全在 content script，结果落 `storage.session` | ✅ | 平台约束（SW 生命周期） |
| T03 | `chrome.sidePanel` 需 Chrome 114+ | ✅ | 平台 API 版本要求；README 写明最低版本 |
| T04 | 权限最小化：`activeTab` + `scripting` + `sidePanel` + `storage` + `contextMenus` | ✅ | 设计约束；`tests/permissions_whitelist.spec.js` 断言 |
| T05 | 只读 DOM 即可取证（文本节点 + 计算样式 + 元素几何） | ✅ | 无需网络、无需登录态、无需 cookies |

### 1.5 合规风险（✅ 定性）

| # | 风险 | 处置 |
|---|---|---|
| R01 | 直接贴"欺诈"标签有法律与商店审核风险 | 文案统一"**可疑模式（待核对）**"；每条附规则解释与原文；不给单一"欺诈分" |
| R02 | 平台 ToS | 只读渲染后 DOM；不自动化交易；不绕付费墙；不自动点击 |
| R03 | 个人数据 | 不采集、不上传、零遥测；不读登录态；结果只存本机 |
| R04 | 误报伤害可信度 | 无证据节点不产出 finding；fixture 逐规则 precision/recall 门槛 |

---

## 2. 数据源可获取性记录

| 数据源 | 用途 | 可获取性 | 获取路径 / 阻断原因 |
|---|---|---|---|
| 自建合成 fixture 页面 | 规则基准的真值来源 | ✅ 可自制 | `data/fixtures/`，由 `tools/gen_fixtures`（M1）程序化生成，带逐页真值 |
| 规则素材（手法描述） | 12 条规则的判定条件来源 | ✅ 已有 | 从 §1.1 的 HN 原话转写为可判定条件；**不引用任何真实站点截图或原文** |
| 公开讨论页（HN item） | 需求证据 | ✅ 可直连 | 见 §1.1 链接 |
| Reddit 帖子 | 旁证 | ⬜ 待补 | 正文与链接未逐字复核（K11） |
| Chrome 应用商店 | 商业侧现状 | ⬜ 不可达（基准日） | C01；不作底座，不作断言 |
| 真实站点页面 | 演示用 | ⬜ 不纳入 | **不进仓**：真实站点原文涉及版权与名誉风险；演示只用合成页 |

> **判定**：本题的**唯一底座 = 自建合成 fixture**。真实站点数据不参与基准、不进仓、不截图。
> 因此任何"检出率/准确率"表述的分母都是合成基准，**不得**包装成真实站点统计。

---

## 3. 合成数据纪律

### 3.1 假站点名白名单（`data/fixtures/` 必须使用）

| 用途 | 允许使用的名称 |
|---|---|
| 电商类 fixture | **示例商城（虚构）**、**样例电器（虚构）**、**演示票务（虚构）** |
| 订阅类 fixture | **演示订阅（虚构）**、**样例会员（虚构）** |
| 域名 | 仅 `example.invalid` 与 `fixture.local` 两个保留域；**禁止**任何真实域名 |

**纪律**：
- fixture 页面中的商品名、价格、库存数字、倒计时文字**全部为合成值**，不得抄录真实站点原文；
- 不使用真实品牌名、真实商标、真实客服电话；电话只用保留号段 `19900000000` 类；
- 页面内如出现人名/邮箱，一律使用 `user@example.invalid` 类保留地址；
- 每个 fixture 目录下必须有 `truth.json`，标注该页植入的每条可疑模式（`rule_id` + 证据节点路径 + 期望 snippet）。

### 3.2 真值标注纪律

- **真值先于规则**：先写 `truth.json` 再写规则，避免"规则能测什么就标什么"（真值跟着实现漂移）；
- **每条真值必须能指到节点**：`truth.json` 里的每项须含 `selector_path`（或等价的节点定位串）与 `snippet_expected`；
- **负样本必须存在**：40 页里必须有页面"看起来像但按规则不成立"（如真实库存来源可查的"仅剩 2 件"、可一键取消的订阅），用于压 precision；
- **偏科检查**：12 条规则每条至少覆盖若干正样本与若干负样本，覆盖矩阵进 `data/fixtures/COVERAGE.md`（M1）；
  某规则若样本不足，须在 COVERAGE 里显式标注"覆盖弱"，**不得**用其他规则的样本充数。

### 3.3 生成器纪律

- fixture 由脚本生成（M1），生成结果与真值同一次落库；
- 生成器输出必须**确定性**：同种子 → 同文件内容（`fixture:check` 做内容哈希比对）；
- 手工修改 fixture 必须同步修改 `truth.json`，否则 `fixture:check` 失败。

---

## 4. 数值口径纪律

| 口径项 | 唯一定义处 | 引用方 |
|---|---|---|
| 严重度枚举与分级 | `rules/manifest.json` | 规则包、侧边栏、导出、README |
| 单规则 precision / recall 门槛 | `rules/manifest.json` | 基准脚本、plan/01、README |
| 扫描超时阈值 | `rules/manifest.json` | 扫描器、侧边栏（`truncated` 提示） |
| 规则匹配优先级 | `rules/manifest.json` | 规则引擎 |
| fixture 规模与覆盖矩阵 | `rules/manifest.json`（规模）+ `data/fixtures/COVERAGE.md`（覆盖） | 基准脚本 |
| 规则包版本号与内容哈希 | `rules/manifest.json` | 导出证据包、README |

**纪律**：
- 任何文档、UI 文案、测试里**不得**出现第二份阈值数字；需要时写"阈值见 `rules/manifest.json`"；
- 门槛是**数据不是代码**：调整门槛只改 manifest，不改引擎；
- 本文件与 plan/01 中出现的"12 条规则""40 页 fixture""< 500ms"是**题面承诺口径**，其可执行值以 `rules/manifest.json` 为准；
  若实现期调整，须在 plan/00 决策记录留行并同步三处（题面 / manifest / README），不得只改一处。
