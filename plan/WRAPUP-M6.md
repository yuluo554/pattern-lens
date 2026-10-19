# WRAPUP-M6 —— 界面取证镜 v0.1.0 收尾档案（M6 收尾时写）

> 本文档由 **M6 收尾时**写成（2026-10-19）。**收尾档案**：记录全项目末态、M6 落地的文件与口径、后续维护轮待办与命令速查。
> （启动第 6 棒时读的交接单是 `plan/HANDOFF-M6.md`，由 M5 收尾时写；发布留档是 `plan/RELEASE-M6.md`。）
> **M6 已 ✅，全项目 M0–M6 全部完成。**
> 命名规则（`AGENTS.md` 已声明）：`plan/HANDOFF-M<k>.md` = **启动第 k 棒时读的交接单**。

## 1. 末态 + 证据（M6 收尾时实测）

**M6 已完成**：公开仓 + `v0.1.0` annotated tag + GitHub Release（附件 = 确定性 zip，sha256 写 Release 正文）+
`plan/RELEASE-M6.md` 留档（两栏 + 阶段 7 覆盖对账表）。**发布门三模落地**（`tools/check-release.mjs`）。

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 布局门 | `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 6 / 状态副本 3」） |
| 发布终态门（终态） | `node tools/check-release.mjs --online` | **PASS 24 / FAIL 0 / SKIP 0**，rc=0 |
| 发布门形态守门 | `node --test tests/release-gate.test.mjs` | **11 项全通过**（三模语义 / SKIP≠PASS / 缺档可构造 / 结论行=汇总 / exit 2 / 脱敏豁免+阳性对照） |
| 单元与门测试 | `npm test` | **255 项全通过**（0 fail），**25** 个测试文件（逐文件登记在 `package.json`） |
| 全量自检 | `npm run verify --strict` | **24 段 PASS / 0 段 not_enabled**，rc=0（新增 `release.gate` 段） |
| 构建 | `npm run build` + `npm run build:check` | `dist/` **21** 个文件 / 161,776 字节；`release/pattern-lens-0.1.0.zip` 164,266 字节 + `SHA256SUMS`；重生成逐字节一致 |
| 脱敏四步 | `check-release.mjs` 四判据 | ① 关键词 0 命中（文件级豁免 2 份 + 阳性对照）② 提交身份 + tagger 全 noreply ③ `.gitattributes` 在位 ④ `dist/` 与 zip 无本机路径 |
| 干净环境验证 | `git clone --no-local . /d/tmp/pl-clean-clone` → 不装包 | `npm test` 255 / `npm run verify` 24 段 / `npm run build` + `--check` 逐条跑通；与主仓 zip `cmp` 逐字节一致 |
| CI 首推 | `gh run list --workflow ci.yml` | **2 次 push ↔ 2 条 run**：branch `#39200133922` / tag `#39200309016`，**两 run 各 4 矩阵全 success** |
| tag 两端一致 | `git rev-parse v0.1.0` == `gh api .../git/ref/tags/v0.1.0` | annotated tag 对象 `852a4c43af16…` → commit `6528cdfd…`，两端一致 |
| 真下载复核 | `gh release download` → `sha256sum` → `cmp` | 下载件 sha256 == `release/SHA256SUMS`；**下载件 == tag 树重建件**（逐字节一致） |

**M6 落的文件与口径（都要知道）**：

1. **`tools/check-release.mjs`（新增，M6）**：发布终态门三模——默认离线 / `--pre-tag` / `--online`。
   退出码 0 全绿 / 1 有 FAIL（发布未达成）/ 2 用法错误 / 3 **环境缺失**（gh 不在或未登录）。
   **刻意不进 CI**（发布前它本来就该红）。判据 24 项（离线 18 + 在线 6，见 `plan/RELEASE-M6.md` §四）。
2. **`tests/release-gate.test.mjs`（新增，M6）**：发布门**运行时形态**守门（K31）——**不测"当前 0 FAIL"**。
   用 `RELEASE_DOC_PATH` 环境变量把"缺档"这一瞬态变成可构造的输入（K32）。
3. **`plan/RELEASE-M6.md`（新增）**：两栏（§一 tag 前事实 / §二 tag 后追加）+ §三 阶段 7 覆盖对账表（27 行三态）+
   §四 M6 增补 K 口径（K29–K37）+ §五 本轮修掉的缺陷。**§一 不许写附件哈希**（写它这个动作会改包内容）。
4. **`.gitignore` 加 `release/`**：`dist/` 与 `release/` 都不入仓；发布走 Release 附件。
5. **`tools/build-extension.mjs` 新增 `renderSums()`**：`release/SHA256SUMS` 由 `npm run build` **生成**
   （形态 `<hex>  *<name>`），并纳入 `--check` 逐字节比对（K33）。
6. **`tools/verify.mjs` 新增 `release.gate` 段**；**`package.json` 的 `scripts.test` 登记 `tests/release-gate.test.mjs`**（K16）。
7. **`README.md` 新增两条命令**（`node tools/check-release.mjs` 离线 / `--online`），状态行转正。

## 2. 下一棒待办（维护轮 / 后续版本）

**M6 是本项目收尾棒，M0–M6 已全部完成。** 后续维护与再发布：

1. **再发布（升版本）**：改 `manifest.json` 的 `version` → `npm run build` → 更新 `release/SHA256SUMS` →
   `git tag -a v<x.y.z>` → `gh release create`（附件 = 新 zip，sha256 写正文）。
   改 `src/` / `rules/` / `manifest.json` / `assets/store/` **必须升版本号重发**（K34 的 `DELIVERABLE_UNCHANGED` 守之）。
2. **规则包演进**：改 `rules/dp-*.json` 或阈值 → `npm run rules:hash`（重算 `ruleset_hash` + `src/lib/rules-pack.js`）→
   `npm run bench`（B1–B7 双边门必须仍达标）→ 版本号升位。
3. **发布门复跑**：任何对外动作前后跑 `node tools/check-release.mjs`（离线）/ `--online`；红了先看它读的是
   tag 树还是工作树。
4. **缓议项**：商店提交（Q5 只准备不提交）；规则包热更新 / 多语言 / PDF 导出（roadmap）；浏览器冒烟扩到更多 fixture 页。

**维护轮不要碰的东西**：`data/fixtures/` 冻结产物（改要走 `npm run fixtures` 重生成并提交）；`src/lib/rules-pack.js`（生成物）；
tag `v0.1.0`（**已发布窗口关闭，不重写 tag**；缺陷走追加提交 + `plan/RELEASE-M6.md` §二登记）。

## 3. 既定口径清单（K 编号；"动了会打挂测试"的约定）

> K1–K28 见 `plan/HANDOFF-M6.md` §3（M2 冻结）；D32–D42 见各棒 HANDOFF。**M6 新增 K29–K37**：

| K | 口径 | 落点 | 谁在守 |
| --- | --- | --- | --- |
| K29 | 发布附件 = **确定性 zip**（构建产物本身）；sha256 登记 **Release 正文**（不写 §一 / tag 树）；本地留 `release/SHA256SUMS`（**不入仓**） | `tools/build-extension.mjs` / `tools/check-release.mjs` | `SHA256_LOCAL` / `RELEASE_DOC_NO_DIGEST` / `NO_ARTIFACTS_TRACKED` |
| K30 | 发布门三模：离线（远端项 SKIP）/ `--pre-tag`（tag 项 SKIP）/ `--online`（查远端）；**刻意不进 CI** | `tools/check-release.mjs` | `CI_STEPS`（断言 CI 不含 `check-release`） |
| K31 | 发布门常驻测试**只测门的运行时形态**，**不测"当前 0 FAIL"** | `tests/release-gate.test.mjs` | 该测试自身（缺档态可构造） |
| K32 | 发布留档路径由 `RELEASE_DOC_PATH` 决定（默认 `plan/RELEASE-M6.md`）——测试用 seam | `tools/check-release.mjs` | `tests/release-gate.test.mjs` |
| K33 | `release/SHA256SUMS` 是**生成物**（`npm run build` 产出，随 `--check` 逐字节比对） | `tools/build-extension.mjs` | `build:check` |
| K34 | tag 后范围判据 = **非交付面**（`plan/ tests/ tools/ docs/ README AGENTS`）+ 独立第二条 `DELIVERABLE_UNCHANGED`（交付面零差异） | `tools/check-release.mjs` | `POST_TAG_SCOPE` / `DELIVERABLE_UNCHANGED` |
| K35 | 发布门对**瞬时网络错误**（`wsarecv`/`ECONNRESET`/`timeout`/`TLS`/`EOF`）重试 3 次；**非瞬时错误不重试** | `tools/check-release.mjs` 的 `gh()` | 人工（环境纪律） |
| K36 | 脱敏扫描走**文件级豁免**（仅扫描器 + 留档两份）+ **阳性对照** | `tools/check-release.mjs` 的 `SCAN_EXEMPT` | `NO_LOCAL_PATHS` 自证 |
| K37 | `IDENTITY_NOREPLY` 判定前须剥掉 `%(taggeremail)` 的尖括号 | `tools/check-release.mjs` | `IDENTITY_NOREPLY` |

## 4. 本机环境坑（只写实测过的）

- Node **v24.15.0** / npm 11.12.1（2026-10-19 实测）；`engines` 写 `>=22`，CI 矩阵跑 22 / 24（**首推 4/4 绿**）。
- **本机 `github.com:443` 可能间歇不通**（`api.github.com` 正常）：`gh api` 会报
  `wsarecv: An existing connection was forcibly closed`——**发布门已对瞬时错误重试 3 次**（K35）。
  推码失败先重试 3~4 次，或用 `git -c http.curloptResolve=github.com:443:<ip>`；
  **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- **`git for-each-ref --format=%(taggeremail)` 返回带尖括号的 `<a@b>`**（M6 实测踩坑）：判 noreply 前必须剥 `<`/`>`。
- **Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码**（显示问题，不是文件坏了）：验收中文文件走 `node -e` 读回。
- **浏览器临时 profile 落点在仓库内 `tmp/`**（`.gitignore`，D42）——不要落 C 盘（实测会爆）。
- **`fixtures:check` 是重量级门**（重生成 124 个文件，约 3.2s）；别在循环里反复调。
- **`npm test` 现在约 9s**（25 个文件；`tests/rules-bench.test.mjs` 的探活要复制整棵仓库）。
- **`gh` 是原生程序，`/tmp/...` 路径它不认**（`--notes-file` / 附件参数要写 `C:/...` 或 `D:/...`）。
- **本机 Chrome 可用且可自动化**（Chrome 155）：两个冒烟脚本用 `--headless=new --remote-debugging-port=<port>`
  + CDP over Node 自带 WebSocket（零依赖）；**拉不起来 → 显式 SKIP（rc=0）**，**刻意不进 CI**（D35）。

## 5. DoD 逐项 checklist（M6）

- [x] git tag（annotated）`v0.1.0`，指向发布提交，已推远端（对象 `852a4c43af16…` → commit `6528cdfd…`）
- [x] GitHub Release，附件 = 确定性 zip（sha256 登记 **Release 正文**，不写包内）
- [x] `plan/RELEASE-M6.md`（tag 前入库，两栏）+ 阶段 7 覆盖对账表（三态逐条，27 行）
- [x] `node tools/check-release.mjs --online` 无 FAIL（PASS 24 / FAIL 0 / SKIP 0）
- [x] 发布后：干净 clone 复核 + 附件真下载 `sha256` 对齐 + tag 树重建产物 `cmp` 逐字节一致
- [x] 脱敏四步 + 干净环境验证（`plan/07` §3.1 第 3/4 条）
- [x] 三处状态副本（`plan/00` §5 / `plan/06` §一 / `README.md` 状态行）同一次提交翻 ✅（布局门绿）

## 6. 关键命令速查

```bash
node tools/check-sprint-layout.mjs     # 布局门（任何新对话的第一动作）
npm test                               # 全部测试（零依赖，25 个文件，约 9s）
npm run verify                         # 分段全量自检；未启用段显式列出
npm run verify:strict                  # 未启用段 → 以退码 1 收尾
npm run build                          # dist/ + release/<zip> + SHA256SUMS
npm run build:check                    # 重生成逐字节一致自检
node tools/check-release.mjs           # 发布终态自检（离线；tag/远端项报 SKIP）
node tools/check-release.mjs --pre-tag # tag 前冒烟（tag 项报 SKIP，门能随预备提交进 tag 树）
node tools/check-release.mjs --online  # 终态（需远端；exit 3 = 环境缺失）
npm run smoke:overlay                  # 真实浏览器冒烟：页内覆盖层真实点击（缺浏览器显式 SKIP）
npm run smoke:export                   # 真实浏览器冒烟：导出字节 + 网络计数
npm run bench                          # 规则基准 B1–B7（rc=0 全达标）
```

**发布留档**：`plan/RELEASE-M6.md`（两栏 + 覆盖对账表）。**发布页**：
https://github.com/yuluo554/pattern-lens/releases/tag/v0.1.0
