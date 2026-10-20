# RELEASE-M6 · 界面取证镜（pattern-lens）v0.1.0 发布留档

> **用途**：M6 发布三件套的留档。本文件在 **tag 之前**写就并进 tag 树，因此分两栏：
> `## 一、tag 前事实`（写文件时已发生、可当场复核）与 `## 二、tag 后追加`（tag / Release 落地后才有的对外事实）。
> **纪律**：§一 里的数字全部来自本机实跑；§二 在 tag 之前**留空占位**，不得预填（防"计划当事实"）。
> 门禁：`node tools/check-release.mjs` 要求本文件同时含两栏标题；**§一 内不许写附件 sha256**
> （写入动作会改变包内容，哈希立刻失效——哈希归 Release 正文与 §二）。
> **§一 只写复验方法，不写附件哈希**；离线项应常绿，`--online` 项接远端后复查。

## 一、tag 前事实

### 1.1 版本与单一来源

| 项 | 值 | 落点 |
| --- | --- | --- |
| 发布版本 | `0.1.0` | `package.json` 的 `version` |
| 扩展清单版本 | `0.1.0` | `manifest.json` 的 `version`（附件名由它派生） |
| 规则包版本 | `0.1.0`（`ruleset_hash` 见 §1.2） | `rules/manifest.json` 的 `ruleset_version` |
| 附件名 | `pattern-lens-0.1.0.zip` | `tools/build-extension.mjs` 的 `zipName()` |
| tag 名 | `v0.1.0` | `tools/check-release.mjs` 的 `TAG_PRESENT` / `REMOTE_TAG` 按此名查 |
| 单一来源判定 | `VERSION_SINGLE_SOURCE` PASS（`package.json` 与 `manifest.json` 一致） | `check-release.mjs` |

### 1.2 tag 前基线复测（2026-10-19，Windows + Node v24.15.0 / npm 11.12.1）

| 门 / 命令 | 结果 |
| --- | --- |
| `node tools/check-sprint-layout.mjs` | 8 项 PASS / 0 FAIL（「这轮扫到：文档 11 / 交接单 6 / 状态副本 3」） |
| `npm test` | **255 项**（0 fail），**25** 个测试文件（逐文件登记在 `package.json`，由 `tests/test-manifest.test.mjs` 守门） |
| `npm run verify --strict` | **24 段 PASS / 0 段 not_enabled**，rc=0（新增 `release.gate` 段） |
| `npm run build` + `npm run build:check` | `dist/` **21** 个文件 / 161,776 字节；`release/pattern-lens-0.1.0.zip` 164,266 字节 + `SHA256SUMS`；重生成逐字节一致 |
| `npm run rules:hash -- --check` | `ruleset_hash` 不变（`b81d12e89a43f1144b8f10d9ca1908919c247c7ee07250dd7b9f3010a642ce51`） |
| `npm run fixtures:check` | 再生成 124 个文件 == 冻结产物 124 个文件（位级一致） |
| `npm run bench` | B1–B7 全达标；压力页 5007 节点冷 130.3ms / 热 135.5ms（< 500ms 预算） |
| `node tools/check-release.mjs --pre-tag` | 见 §1.4；tag / 远端项报 SKIP，离线项全绿（`WORKTREE_CLEAN` 在提交后转 PASS） |
| 干净环境验证（`plan/07` §3.1 第 4 条） | `git clone --no-local . /d/tmp/pl-clean-clone` → **无 `node_modules`** → `npm test` **255 项** / `npm run verify` **24 段** / `npm run build` + `--check` 逐字节一致；**干净 clone 与主仓的 zip `cmp` 逐字节一致**；干净 clone 里（**先 `git tag -d v0.1.0` 删掉本地 tag，或用 `git archive` 解包无 .git 树**——tag 树自带的是修尖括号前的门，带 tag 跑会因 `IDENTITY_NOREPLY` 得 15/1/8）`check-release.mjs --pre-tag` = PASS 16 / FAIL 0 / SKIP 8（rc=0） |
| CI 工作流静态自查 | `.github/workflows/ci.yml`：**1 个 job**（`verify`）× **4 矩阵**（ubuntu/windows × node 22/24）× **9 步**；step `name` 无裸 `: `；`on:` 含 `push` / `pull_request` / `workflow_dispatch` |
| GitHub Actions（首推 `main`） | **✅ 首推 4/4 绿**（2026-10-19）：branch run `#39200133922`、tag run `#39200309016`，两 run 各 4 矩阵（ubuntu/windows × 22/24）全 success |

### 1.3 交付产物与附件口径

附件口径取 **D16**：**发布附件 = 确定性 zip（扩展打包物本身）**——不用 GitHub 自动生成的 Source code 包
（后者的 sha256 本地复算不出来），也不给源码目录压缩包。zip 由 `tools/build-extension.mjs` 用
`ZIP_STORED` + `create_system=0` + 固定时间戳（1980-01-01）+ 条目按路径排序产出，
**跨平台重生成逐字节一致**（配 `--check` 守门）；因此"附件 = 可由源码逐字节重生成的字节拷贝"可核证。

- `dist/` 与 `release/` **都不入仓**（`.gitignore`；`check-release.mjs` 的 `NO_ARTIFACTS_TRACKED` 与
  `RELEASE_DIR_IGNORED` 两条守卫）；产物由 Release 附件承载。
- 本地留档件 = `release/pattern-lens-0.1.0.zip` + `release/SHA256SUMS`（**sha256 不写进 §一**；
  §二 与 Release 正文才写——"我写的这个值会被'写它这个动作'改动吗？会就不许写进那个位置"）。

**复验方法（§一 只写方法，不写值）**：

```bash
npm run build                                        # 重生成 dist/ + zip + SHA256SUMS
node tools/build-extension.mjs --check               # 双跑逐字节一致
sha256sum -c release/SHA256SUMS                      # 本地留档件自校验
git archive --format=tar --prefix=pattern-lens/ v0.1.0 | gzip -9n > /tmp/tagtree.tar.gz   # tag 树（永不失效的正面证明）
```

### 1.4 M6 DoD 三件套

| # | 事项 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| ① | git tag（annotated）`v0.1.0`，指向发布提交，已推远端 | ✅ 2026-10-19 | 对象 `852a4c43af16…` → commit `6528cdfd…`；两端对象哈希一致（详见 §2.1） |
| ② | GitHub Release，附件 = 确定性 zip（本地留副本 + sha256 登记 **Release 正文**，不写进包内） | ✅ 2026-10-19 | 公开仓 `yuluo554/pattern-lens`；附件 164,266 字节，sha256 `180bcaea…`（详见 §2.2） |
| ③ | `plan/RELEASE-M6.md`（tag 前入库，两栏）+ 阶段 7 覆盖对账表（三态逐条） | ✅ 本文件 | tag 树里本文件已含 §一 + §三 覆盖对账表；§二 为 tag 后追加 |
| ④ | `node tools/check-release.mjs --online` 无 FAIL | ✅ 2026-10-19 | **PASS 24 / FAIL 0 / SKIP 0**，rc=0（详见 §2.3） |
| ⑤ | 发布后：干净 clone 复核 + 附件真下载 `sha256` 对齐 + tag 树重建产物 `cmp` 逐字节一致 | ✅ 2026-10-19 | 三条全做（详见 §2.4）；下载件 == tag 树重建件（`cmp` 逐字节一致） |

> **DoD 打勾只能在事实落地后**：①②④⑤ 在 tag 前保持 ⬜，落地后翻 ✅ 并指向 §二（`plan/06` §六 纪律）。

### 1.5 脱敏四步（`plan/07` §3.1 第 3 条；机器判据见 `check-release.mjs`）

| 步 | 判据 | 落点 | 实测（2026-10-19） |
| --- | --- | --- | --- |
| ① 关键词扫描（账号名 / 本机盘符 / 邮箱 / 真实站点域名） | `NO_LOCAL_PATHS` | `check-release.mjs` | **0 命中**（入库文本 222 份；`D:\ProgramData` / `C:/Users` / `ASUS` / `282769740` 全无） |
| ② 提交身份与 tagger 邮箱为 noreply | `IDENTITY_NOREPLY` | 同上 | 提交身份 **1 种** = `282769740+yuluo554@users.noreply.github.com`；tagger 在 tag 后并入同判 |
| ③ `.gitattributes` 检查（文本归一 + 冻结字节标 `-text`） | `GITATTRIBUTES` | 同上 | `* text=auto eol=lf` + `*.zip` / `*.png` / `*.ico` 标 `binary`（冻结字节 git 不许碰） |
| ④ 产物扫描（`dist/` 与 zip 内无本机路径） | `ARTIFACT_NO_LOCAL_PATHS` | 同上 | **0 命中**（`dist/` 与 zip 均干净） |

### 1.6 已知未验证项（不得写成已完成）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| CI 实跑 | ⬜ 未做 | **首推前一次 CI 都没跑过**；§一 不预填 run id，§二 首推后据实回填（`plan/06` §六 第 3 条：未达成写"偏差说明"，不把 ⬜ 改 ✅） |
| 干净环境验证 | ✅ 已做 | `git clone --no-local` → 不装包 → `npm test` + `npm run verify` + `npm run build` 逐条跑通（见 §1.2 末两行）；zip 与主仓逐字节一致 |
| 浏览器冒烟覆盖 | 🟡 只覆盖 `page-01` | `smoke:overlay` / `smoke:export` 真实浏览器全绿，但只冒烟一页；且不进 CI（CI 无浏览器，D35） |
| 商店提交 | ⬜ 不在首期 | 只准备素材不提交（Q5 默认①） |
| `storage.session` 浏览器重启后语义 | ⬜ 未验 | 平台语义，非本项目可改（同 M4/M5 登记） |

### 1.7 tag / Release 执行步骤（本棒逐条执行；结果见 §二）

```bash
# 0) 前置：§一 与版本收口已 commit，工作树干净
node tools/check-release.mjs --pre-tag     # tag 前：离线项全绿，tag/远端项报 SKIP
node tools/check-release.mjs               # 离线：同上（RELEASE_DOC 已 PASS）

# 1) 建仓（公开）并推 main
gh repo create yuluo554/pattern-lens --public --source . --remote origin \
  --description "界面取证镜：暗黑模式取证浏览器扩展（MV3）——只做取证不做打分，无证据节点不产出结论"
git push -u origin main                    # 推送成功的判据 = 远端 sha == 本地 sha

# 2) tag（annotated）并推 tag
git tag -a v0.1.0 -m "界面取证镜 v0.1.0"
git push origin v0.1.0

# 3) Release（附件 = 确定性 zip；sha256 写进正文，不写包内）
gh release create v0.1.0 release/pattern-lens-0.1.0.zip \
  --title "界面取证镜 v0.1.0" --notes-file C:/path/to/notes.md

# 4) 终态复核（无 FAIL；exit 3 = 环境缺失，既非 PASS 也非 FAIL）
node tools/check-release.mjs --online

# 5) 附件自证：真下载 → sha256 对齐 → tag 树重建产物 cmp 逐字节一致
gh release download v0.1.0 --repo yuluo554/pattern-lens -D /d/tmp/rel-verify
sha256sum -c release/SHA256SUMS
git clone --no-local --branch v0.1.0 . /d/tmp/tagtree && (cd /d/tmp/tagtree && npm run build)
cmp release/pattern-lens-0.1.0.zip /d/tmp/tagtree/release/pattern-lens-0.1.0.zip
```

> 建仓、push、tag、Release 都是**对外动作**，须**用户明确确认后**执行。
> **本机环境坑（本轮实测）**：`api.github.com` 与 `ssh.github.com:443` 可达，但 **`github.com:443` 被网络阻断**
> （`git push` 报 `Failed to connect to github.com port 443`，`curloptResolve` 也不通）。正解 = **SSH-over-443**：
> `git push ssh://git@ssh.github.com:443/yuluo554/pattern-lens.git main`（本轮三次 push 均经此通道成功）。
> **推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。

## 二、tag 后追加

> 本节在 tag / Release 落地后填写；tag 之前**留空**，不得预填（防"计划当事实"）。
> 本节的提交**必然在 `v0.1.0` 之后**（tag 树里这一栏是空占位）；只允许文档面追加（`plan/07` §3.3）。

### 2.1 本地 tag

| 项 | 值 |
| --- | --- |
| tag 名 | `v0.1.0` |
| 类型 | annotated（`git cat-file -t v0.1.0` = `tag`） |
| tag 对象 | `852a4c43af16d0c857036f292040cffd01977118` |
| 指向 commit | `6528cdfdcb1577d7773877709f49cb9d8f6cadc4`（"M6 补记：干净环境验证实测……"） |
| 远端 | 已推（`git push origin v0.1.0`）；**对象哈希两端一致** = `852a4c43af16…`（本地 `rev-parse` == 远端 `git/ref/tags/v0.1.0` 的 `object.sha`） |

### 2.2 GitHub Release

| 项 | 值 |
| --- | --- |
| 仓库 | https://github.com/yuluo554/pattern-lens （公开） |
| Release URL | https://github.com/yuluo554/pattern-lens/releases/tag/v0.1.0 |
| 状态 | 已发布（`draft=false`） |
| 附件 | `pattern-lens-0.1.0.zip` — 164,266 字节，sha256 `180bcaea57bb06b90383ea07249add04aeb2ade3d70aad8c14dc5e3827172af2` |
| 下载后重算 sha256 | ✅ 与 `release/SHA256SUMS` 逐字节一致（`gh release download` → `sha256sum` → `cmp`） |
| 正文 | 含附件 sha256 对照表；口径与验证结论 |

### 2.3 `check-release.mjs --online` 终态

```text
PASS 25 / FAIL 0 / SKIP 0   （rc=0；tag 时点基线，本留档已在树里）
```

| 项 | 值 |
| --- | --- |
| 汇总 | **PASS 25 / FAIL 0 / SKIP 0**，rc=0 |
| `REPO_PUBLIC` | PASS（`https://github.com/yuluo554/pattern-lens` PUBLIC） |
| `REMOTE_TAG` | PASS（两端一致 `852a4c43af16`） |
| `CI_RUNS` | PASS（3 条 push run；发布提交 branch run `#39200133922` 与 tag run `#39200309016` 均 success） |
| `REMOTE_RELEASE` | PASS（`v0.1.0` draft=false assets=`pattern-lens-0.1.0.zip`） |
| `RELEASE_NOTES_SHA` / `RELEASE_ASSET_SHA` | PASS（正文含 sha256；远端附件 digest 与本地一致） |
| `POST_TAG_SCOPE` / `DELIVERABLE_UNCHANGED` | PASS（7 项 tag 后改动全在非交付面；交付面零差异） |

> 至此 **M6 三件套（tag / Release / 留档）全部落地**，离线门与在线门均无 FAIL。
> **门自变留痕**：本栏的 `PASS 25` 是**留档已入库 + 收尾提交之后**测的（§三 覆盖对账表与收尾提交让检查项从 23 增到 25）；
> §一 的 tag 前数字与这里的差异，是"留档进了判据面 / 收尾提交进了树"这件事造成的，不是门变了（skill "门自变"条）。

### 2.4 首推后回写

- [x] CI 首推：**push 数 = run 数对账**——**截至 `870bf8d` 共 4 = 4**（4 次 push ↔ 4 条 push run，按
      `event/headBranch/headSha/conclusion` 逐条配对）；**此后文档面提交恒 1 push = 1 run**（口径 = 写快照点 + 停止信号）。
      发布提交 branch run `#39200133922` 与 tag run `#39200309016` **两条都必须绿**（其余历史 run 只登记不判红）。
- [x] 干净 clone 复核：`git clone --no-local . /d/tmp/pl-clean-clone` → **无 `node_modules`** → `npm test`（255 项）+
      `npm run verify`（24 段）+ `npm run build` 逐条跑通；干净 clone 与主仓 zip `cmp` 逐字节一致。
- [x] 真下载复核：`gh release download v0.1.0 -D /d/tmp/rel-verify` → sha256 与 `release/SHA256SUMS` 一致；
      **从 tag 树重建**（`git clone --no-local --branch v0.1.0` → `npm run build`）与之 `cmp` **逐字节一致**。
- [x] `plan/00` §5 + `plan/06` §一 + `README.md` 状态行三处同一次提交翻 ✅（布局门 `LAYOUT.STATUS`）。

### 2.5 tag 后追加的事实（只允许非交付面提交）

tag 之后本棒只做了**追加类提交**（提交信息用"追加/补记/对账"语义词），交付面（`src/`、`rules/`、
`manifest.json`、`assets/store/`）**零差异**——`POST_TAG_SCOPE` 与 `DELIVERABLE_UNCHANGED` 两条机器判据守之。

| 缺陷（发布门自测时扫出） | 症状 | 处理 |
| --- | --- | --- |
| `%(taggeremail)` 带尖括号 | `IDENTITY_NOREPLY` 把 `282769740+yuluo554@users.noreply.github.com`（**正确的 noreply 身份**）判成非 noreply | 剥掉 `<`/`>` 再判（`plan/07` §3.4 脱敏条：tagger 邮箱同查） |
| `gh api` 瞬时断连未重试 | `REMOTE_TAG` 报 `wsarecv: forcibly closed`——本机 `github.com:443` 间歇不通（AGENTS.md 实测），**网络抖动被当成发布未达成** | `gh()` 对瞬时错误（`wsarecv`/`ECONNRESET`/`timeout`/`TLS`/`EOF`）重试 3 次；非瞬时错误不重试 |
| tag 后范围判据过窄 | 初版 `POST_TAG_DOC_ONLY` 只认 `plan/`、`README.md`——但本棒的发布门修正落在 `tools/`，会被误判越界 | 改为**非交付面**口径（`plan/ tests/ tools/ docs/ README AGENTS`）+ 独立第二条 `DELIVERABLE_UNCHANGED`（交付面零差异） |

> **为什么不重打 tag**：缺陷落在"**你刚发出去的那道门**"上（发布门自身），而非交付物；
> 附件 zip 与 tag 树逐字节同源已验，交付面零差异。按 skill "已发布窗口关闭后的缺陷处置"条，
> **不重写 tag**，走追加提交 + 本栏登记（重打更便宜只在"窗口未关 + 没登记过哈希"时成立，本仓已登记）。

追加登记（2026-10-20 二次迭代）：交接物目录 `update/` 用**本地 `.git/info/exclude`** 排除（不进版本控制），
使其与 `WORKTREE_CLEAN` 共存——不写 `.gitignore`（改受版本控制文件会触发 `POST_TAG_SCOPE` 越界，已实测）。
- **当前测试数登记**：`npm test` = **256 项**（`tests/counts.test.mjs` 计数守门锚点；新增/删除测试必须同步本行）

## 三、阶段 7 出口门覆盖对账（三态逐条，不许留空）

> `plan/01` §三 与 skill 阶段 7 的每条出口门在此给一个归宿。三态 = **实现** / **不适用**（须给理由）/
> **待首推**（tag 后才产生的对外事实）。这张表**在 tag 之前就填满**，随 tag 树入库。

| 出口门 | 归宿 | 依据 |
| --- | --- | --- |
| 发布物本体已验（真下载 + 中立目录） | 实现 | §2.4 第 3 条（`gh release download` 到 `/d/tmp/rel-verify`；sha256 与本地留档件一致） |
| 入仓工具在无 `.git` 树里也能跑 | 实现 | 发布门与构建器均不读 git 历史以外事实；`npm run build` / `check-release.mjs` 离线项在干净 clone 跑通（§2.4 第 2 条） |
| 附件与 tag 树逐字节同源 | 实现 | §2.4 第 3 条（`git clone --no-local --branch v0.1.0` → `npm run build` → 与下载件 `cmp` 逐字节一致） |
| 源码包自足（`MANIFEST.in` 白名单覆盖数据目录） | 不适用 | 本项目不发行 Python 源码包；附件 = 扩展 zip（D16） |
| README 提到的附件名必须真在 Release 里 | 实现 | `check-release.mjs` 的 `REMOTE_RELEASE`（按 `ZIP_NAME` 查 assets，实测 `assets=pattern-lens-0.1.0.zip`） |
| 对外附带样例产物在中立示意目录生成 | 不适用 | 无此类样例产物；fixture 与商店截图都是仓库内生成物 |
| 附件口径四选一择一留档 | 实现 | §1.3 写明取 D16（构建产物本身）；合法性 = 干净 clone 重生成逐字节 `cmp` 一致 |
| 附件 sha256 写 Release 正文（不写包内） | 实现 | §1.3 复验方法 + §2.2；`RELEASE_DOC_NO_DIGEST` 守"§一 无哈希" |
| tag 后追加提交（tag 树不变 → 包字节不变） | 实现 | §2.5 为 tag 后追加栏；`POST_TAG_SCOPE` 守"只含非交付面" |
| 已发布窗口关闭后的缺陷处置 | 实现 | §2.5（缺陷落在发布门自身；不重写 tag，走追加提交 + 登记"为什么不重打"） |
| DoD 打勾只能在事实落地后 | 实现 | §1.4 三件套在 tag 前为 ⬜，落地后翻 ✅ 并指向 §二 |
| tag 之后只允许文档面提交 | 实现 | `check-release.mjs` 的 `POST_TAG_SCOPE`（非交付面：`plan/ tests/ tools/ docs/ README AGENTS`）+ `DELIVERABLE_UNCHANGED`（交付面零差异） |
| annotated tag 两端一致 = 对象哈希一致 | 实现 | `check-release.mjs` 的 `REMOTE_TAG`（本地 `rev-parse v0.1.0` == 远端 `git/ref/tags/v0.1.0` 的 `object.sha`，实测 `852a4c43af16`） |
| push 数 = run 数对账 | 实现 | `check-release.mjs` 的 `CI_RUNS`（2 次 push ↔ 2 条 push run；branch run `#39200133922` 与 tag run `#39200309016` 两条都 success） |
| 四矩阵同点全红 = CI 步骤接线缺陷非平台差异 | 实现 | CI 矩阵 `os × node` = 4（ubuntu/windows × 22/24）；两 run 各 4 矩阵全绿，无同点全红 |
| 多平台冻结产物原生构建 + 原生冒烟 | 不适用 | 无跨平台编译产物；zip 由 Node 生成且跨平台重生成逐字节一致（`build-extension --check`） |
| 每条已交付命令都有离线 CI 冒烟 | 实现 | CI 步骤：`layout / hash-rules --check / npm test / npm run build / build-extension --check / npm run verify`；`check-release.mjs` 的 `CI_STEPS` 守之 |
| 发布门可复跑（离线 + `--online` + `--pre-tag`） | 实现 | `tools/check-release.mjs` 三模（`--pre-tag` 让门能随预备提交进 tag 树） |
| 离线模式报 SKIP 不报 PASS | 实现 | `tests/release-gate.test.mjs` 断言远端项离线一律 SKIP、绝不 PASS |
| 门要自己数"这轮扫到了几个" | 实现 | `check-release.mjs` 打印"检查项 / 入库文本 / 提交身份 / 覆盖对账行"四计数 |
| 发布门不进 CI | 实现 | `CI_STEPS` 断言 CI 工作流不含 `check-release`（发布前本门该红） |
| 「发布未达成」与「环境缺失」两个退出码语义 | 实现 | `ReleaseNotAchieved`（exit 1）vs `EnvironmentMissing`（exit 3）两类异常分离 |
| 脱敏：提交身份 + tagger 邮箱 | 实现 | `check-release.mjs` 的 `IDENTITY_NOREPLY`（提交身份 + tag 对象 tagger 一并查） |
| 干净环境按 README 逐条跑通 | 实现 | §2.4 第 2 条（`git clone --no-local` → 不装包逐条跑：test 255 / verify 24 段 / build + --check） |
| 随包 README 状态行不承载"发布到哪一步" | 实现 | 附件 zip 的安装面白名单（`RUNTIME_WHITELIST`）**不含 `README.md`**——随包文档里根本没有状态行可落后；仓库 README 的状态表受布局门 `LAYOUT.STATUS` 约束（三处一致），tag 时诚实地写 M6 ⬜、落地后转 ✅（`plan/07` §3.3 只允许文档面追加） |
| 门读"人写的文档"时剥注释/代码块 | 实现 | `check-release.mjs` 的 `stripProse()`（判据先剥 ``` 代码块与 `<!-- -->` 注释，防作者样例行被当值登记） |
| 校验和清单三种合法形态都认 | 实现 | `check-release.mjs` 的 `SHA256_LOCAL` 正则收 `<hex> <name>` / `<hex> *<name>` / `sha256: <hex> <name>` |
| 判据按"真实发布动作序列"设计 | 实现 | 计数单位取 `(提交, 事件来源)`：branch run 与 tag run 同 sha 两条合法、两条都要求绿（`CI_RUNS`） |

## 四、M6 增补口径（K 编号，接 `plan/HANDOFF-M6.md` §3 的 K1–K28 + D36–D42）

| 编号 | 口径 | 落点 |
| --- | --- | --- |
| **K29** | 发布附件口径 = **确定性 zip（构建产物本身）**；sha256 登记在 **Release 正文**（不写进 §一 / tag 树）；本地留 `release/SHA256SUMS`（**不入仓**） | `tools/build-extension.mjs` / `tools/check-release.mjs` / 本文件 §1.3 |
| **K30** | 发布门三模：离线（远端项 SKIP）/ `--pre-tag`（tag 项 SKIP，让门能随预备提交进 tag 树）/ `--online`（查远端）；**刻意不进 CI** | `tools/check-release.mjs` / `tests/release-gate.test.mjs` |
| **K31** | 发布门的**常驻测试只测门的运行时形态**（三模语义 / SKIP≠PASS / 缺档可构造），**不测"当前 0 FAIL"**——否则发布前 CI 必红、发布后随留档入库翻转 | `tests/release-gate.test.mjs` |
| **K32** | 发布留档路径由 `RELEASE_DOC_PATH` 决定（默认 `plan/RELEASE-M6.md`）；该变量是**测试用 seam**，让"缺档报 SKIP / 报 FAIL"两条模式语义在留档存在之后仍可构造与断言 | `tools/check-release.mjs` / `tests/release-gate.test.mjs` |
| **K33** | `release/SHA256SUMS` 是**生成物**（由 `npm run build` 产出，随 `--check` 逐字节比对），形态取 `<hex>  *<name>` | `tools/build-extension.mjs` |
| **K34** | tag 后范围判据 = **非交付面**（`plan/ tests/ tools/ docs/ README AGENTS`）+ 独立第二条 `DELIVERABLE_UNCHANGED`（`src/ rules/ manifest.json assets/store/` 零差异）；两条都过才算"tag 后只允许非交付面提交" | `tools/check-release.mjs` |
| **K35** | 发布门对**瞬时网络错误**（`wsarecv` / `ECONNRESET` / `timeout` / `TLS` / `EOF`）重试 3 次；**非瞬时错误不重试**（避免把判据错误拖成 3 倍耗时）。本机 `github.com:443` 间歇不通是已登记环境事实 | `tools/check-release.mjs` 的 `gh()` |
| **K36** | 脱敏扫描走**文件级豁免**（仅 `tools/check-release.mjs` + `plan/RELEASE-M6.md` 两份，必然含模式词面）+ **阳性对照**（合成本机路径必被扫出，否则"0 命中"证明不了任何事） | `tools/check-release.mjs` 的 `SCAN_EXEMPT` / `findLocalPaths` |
| **K37** | `IDENTITY_NOREPLY` 判定前须剥掉 `%(taggeremail)` 的尖括号（`<a@b>` → `a@b`），否则正确的 noreply 身份会被判成泄露 | `tools/check-release.mjs` |

## 五、本轮修掉的缺陷

| 缺陷 | 症状 | 处理 |
| --- | --- | --- |
| **`release/` 未被 `.gitignore` 忽略** | 本轮发现 `release/` 目录只被 `*.zip` 间接忽略，`SHA256SUMS` 会进仓（违反"产物不入仓"）。M6 建仓前扫出 | `.gitignore` 加 `release/`；`check-release.mjs` 新增 `RELEASE_DIR_IGNORED` 守卫（判据落机器，不靠人记得） |
| **`SHA256SUMS` 曾手写** | 初版把 digest 手工 `sha256sum > SHA256SUMS`——违反"产物一律生成、禁手编"（K23 同族） | 改由 `tools/build-extension.mjs` 的 `renderSums()` 生成，`--check` 纳入逐字节比对（K33） |
| **发布门 `RELEASE_DOC_NO_DIGEST` 判据面过宽** | 初版对整份留档扫哈希——但 skill 允许 §二（tag 后追加，不进 tag 树）登记哈希 | 判据收窄到 §一（tag 树那半）；§二 不受限（`plan/07` §3.3） |
| **发布门 git 子进程 stderr 未吞** | 无 tag 时 `fatal: Not a valid object name` 直接漏到 stdout，污染报告 | `git()` 统一 `stdio: ["ignore","pipe","pipe"]` |
| **脱敏扫描器自引用命中** | `NO_LOCAL_PATHS` 一上就红：**扫描器与留档必然含它们要扫的模式词面**（`D:\ProgramData`、`C:/Users`、`ASUS`）——这是"判据自伤"族 | 按 skill 口径改**文件级豁免**（`SCAN_EXEMPT` 仅 2 份：扫描器与留档；不用 rev 级豁免——那会随收尾提交漂移并放过同 rev 内其他文件的真泄露）；并给判据加**阳性对照**（合成一个本机路径必被扫出，否则"0 命中"证明不了任何事） |
| **覆盖对账表定位张冠李戴** | `COVERAGE_TABLE` 按"行里含『覆盖对账』"定位，先命中 §1.4 散文里那句"阶段 7 覆盖对账表"，把状态表行误读成对账行 → 报 3 行非三态 | 锚到**小节标题**（`^#{2,4}.*覆盖对账`），不再扫自由文本（同布局门 `STATUS_LINE` 的"判据张冠李戴"教训） |

> 与 M5 那批同源：**不是靠人复查，而是门禁/测试当场红**（前两条是 M6 建仓前扫出，后两条是发布门自测时扫出）。

## 六、v0.2.0 追加发布（2026-10-20 二次迭代，DEC2=A 不动 v0.1.0）

> 缘起：二次迭代诊断出 D1（P1）——`manifest.json` 写 `minimum_chrome_version: "114"`，而
> `src/background/service-worker.js` 调 `chrome.sidePanel.open()`（@since Chrome 116），114/115 上点图标
> 抛 TypeError 且无捕获（点图标无任何反应）。修此缺陷必须改交付面（`manifest.json`）→ 按 K34 口径
> 升版本号重发 0.2.0。**v0.1.0 的 tag / Release / 附件一字不动**（DEC2=A；其附件 sha256 见 §2.2）。

### 6.1 v0.2.0 tag 前事实（全部本机实跑；附件哈希只写 Release 正文，§6.3 落地后补）

| 项 | 值 |
| --- | --- |
| 发布版本 | `0.2.0`（`package.json` 与 `manifest.json` 同步；`ruleset_version` 不动——规则未改） |
| 修复面 | `manifest.json`（minimum_chrome_version 114→116 + version）+ 五处「114+」文案（README ×2、plan/02、plan/03、测试提示语）+ 测试强化（`>=116` 断言）+ 新增能力探测测试（假 `sidePanel` 无 `open` → 显式 TypeError）+ `tests/counts.test.mjs` 计数守门 |
| 文档面 | `plan/RELEASE-M6.md`（254→255、16/0/8 加「无 tag」前提、本节）、`plan/06`（跨平台 zip 证据口径一行）、`update/` 走 `.git/info/exclude` |
| 发布门 | `tools/check-release.mjs` 的 `TAG` 常量 v0.1.0→**v0.2.0**（门只验当前版；v0.1.0 的发布事实以 §二 为历史留档） |
| 测试 | `npm test` = **256 项**（较 255 净增 1：能力探测测试；计数守门改为独立门 `tools/check-test-count.mjs`，挂 `verify` 的 `test.count` 段——2026-10-20 CI 实测嵌套 spawn 全量在 node22 递归误判 + 与 bench 抢资源超时，故移出 node:test） |
| 构建 | `npm run build` → `pattern-lens-0.2.0.zip` + `SHA256SUMS`；`build:check` 三件套逐字节一致；`fixtures:check` 124 文件位级一致；`rules:hash --check` 一致；`verify` = **25 段**（24 + 新增 `test.count`）全绿 |
| 复验方法 | 从 tag 树 `git clone --no-local --branch v0.2.0` → `npm run build` → zip 与 Release 附件 `cmp` 逐字节一致（发布后补记实测值） |
| tag / Release / 附件上传 | **由用户本人执行**（提示词 §六 第 2 条）；tag 名 `v0.2.0`（annotated） |

### 6.2 v0.1.0 的历史事实登记（DEC2=A：tag 不动，差异随 0.2.0 带出）

- **D2**：`v0.1.0` 的 tag 树 README 仍写「M0–M5 完成，M6（发布）未开工」、`plan/06` 的 M6 行仍 ⬜——
  发布物自带过期自述。zip 内不含 README（运行面白名单不含它），用户无感；但 `git checkout v0.1.0` 的读者
  会读到「未发布」。**本节随 0.2.0 入 tag 树即视为修正**，v0.1.0 不重打。
- **D4**：`plan/RELEASE-M6.md:28` 写「254 项」而实测 255（同页 §一 干净环境行写 255，自相矛盾）——§一 数字已随
  0.2.0 修正（255 为 tag 前实测事实；当前计数守门锚点见 §2.5 追加登记）。
- **D5**：§一「干净 clone 里 `--pre-tag` = PASS 16 / FAIL 0 / SKIP 8」只在**删掉本地 tag 的 clone**里成立
  （tag 树自带修尖括号前的门，带 tag 跑为 15/1/8）——前提已补进该行。

### 6.3 v0.2.0 tag / Release 落地后追加（tag 之后填）

- [ ] 本地 tag `v0.2.0`（annotated）：对象 `待填` → commit `待填`
- [ ] 远端已推；对象哈希两端一致
- [ ] GitHub Release `v0.2.0`（draft=false）+ 附件 `pattern-lens-0.2.0.zip`（`164266 字节`，sha256 见 Release 正文与 `release/SHA256SUMS`）
- [ ] 从 tag 树重建 zip 与附件逐字节一致（实测于 `待填`）
- [ ] `check-release --online` = PASS N / FAIL 0 / SKIP 0（实测于 `待填`）
