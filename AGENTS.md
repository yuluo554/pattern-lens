# AGENTS.md — 界面取证镜（pattern-lens）仓库锚点

本仓库遵循 **`ai-tool-project-sprint`** 方法论（装订日期：2026-10-18）。

## 任何新对话的第一件事

```bash
node tools/check-sprint-layout.mjs     # 或 npm run layout —— 布局门；必须绿，红了先修布局再干活
```

- **续接对话**：读 `plan/HANDOFF-M<k>.md`（那是**启动第 k 棒时读的交接单**，由第 k−1 棒收尾时写），**先跑上面这条门**。
- **接手对话**（无 HANDOFF 可读）：先读 `plan/00`、`plan/06`、`plan/07` 与各 `plan/HANDOFF-*.md`，
  重建"当前状态 + K 口径清单"，先汇报再动手。
- **门红了 → 先修布局，再干别的**；**门不存在 = 本项目没装订**（先补第零步三件：本文件 + 布局门 + `plan/00` 顶部装订行）。

## 强制布局（`tools/check-sprint-layout.mjs` 逐条断言）

| 项 | 位置 | 判据 |
| --- | --- | --- |
| 计划套件 | `plan/00`–`plan/07` + `data/README.md` | 存在且各含必需小节（标题关键词） |
| 数据台账 | `data/README.md` | 「依据查证记录」（三态）+「数值口径」在位 |
| 交接单 | `plan/HANDOFF-M<k>.md` | **每个 ✅ 里程碑 k**（k<6）必须有 `HANDOFF-M<k+1>`；收尾棒必须有 `HANDOFF-M<6>`；六节齐（格式冻结从 M3 起） |
| 状态副本一致 | `plan/00` 里程碑表 / `plan/06` 状态表 / `README.md` 状态行 | **逐处一致**（枚举式断言，不靠人肉 grep） |
| 缺口列 | `plan/07` 的「缺口」列 | 不得再提已 ✅ 的里程碑 |
| 发布留档 | `plan/RELEASE-M6.md` | 两栏（tag 前事实 / tag 后追加）+ 阶段 7 覆盖对账表（三态逐条）；**仅当 M6 ✅ 时才要求**（M0 已声明：未到收尾棒） |
| CI 步骤 | `.github/workflows/ci.yml` | 有一条跑布局门 |

> 更细的项（测试清单、规则包白名单、零网络、DOM diff…）在各自的门里，**不在这里重复**——
> 同一判据只许一处实现。发布终态门 `tools/check-release.mjs` **刻意不进 CI**（发布前它本来就该红）。

**已声明的豁免（门必须复用，不许另立更严的一套）**：
- `plan/HANDOFF-M0` 不需存在——M0 的收尾记录就是计划套件本身；
- `plan/RELEASE-M6.md` 只在 M6 ✅ 后才要求；
- HANDOFF 六节齐从 M3 起要求（M1/M2 是早期补记，节可少）。

## 本仓交付与验证面（速记）

```bash
npm test                 # 单元 + 门（逐文件列出，node --test）
npm run verify           # 一条命令全量自检（rc=0 全绿）
npm run layout           # 布局门（本文件上方那条）
npm run rules:hash       # 重算规则包内容哈希（写进 rules/manifest.json）
npm run fixtures         # 生成 40 页合成 fixture + 真值（M1）
npm run fixtures:check   # 再生成位级一致自证（M1）
npm run bench            # 规则基准 B1–B7：12 规则 × 40 页逐样本点名（M2；rc=0 全达标）
npm run build            # → dist/（可 Load unpacked 的扩展树 + 确定性 zip）
node tools/check-release.mjs           # 发布终态自检（离线）
node tools/check-release.mjs --online  # 终态（需远端，M6 用）
```

**零依赖**：`dependencies` 与 `devDependencies` 均为空，`git clone` 后无需 `npm install`。
**零构建才能跑**不成立：扩展的 content script 不能直接 import ESM，故有一步**自写打包**（`tools/bundle.mjs`，依赖序拼接，无第三方打包器）。

## 环境事实与禁忌（实测，带日期）

- Node **v24.15.0** / npm 11.12.1（`engines` 写 `>=22`；CI 矩阵跑 22 / 24）；`py -0p` 有 3.8 与 3.12；`gh` 2.93.0（2026-10-18 实测）。
- **本机 `github.com:443` 可能间歇不通**，`api.github.com` 正常：推码失败先重试 3~4 次，
  或用 `git -c http.curloptResolve=github.com:443:<ip>`；**推送成功的判据 = 远端 sha == 本地 sha**，不是 push 的退出码。
- Git Bash 里 `grep`/`sed` 打印 UTF-8 中文文件会乱码（**显示问题，不是文件坏了**）：验收中文文件走 `node -e` 读回或解析器回读。
- 批量改文件用 `node -e`，改完**回读确认**。
- **禁忌**：把"未执行"写成已完成（`⬜` 不许预填 ✅）；tag 之后改 `src/` 或 `rules/` 代码面；
  数值阈值在 `rules/manifest.json` 之外再写一份（见 `data/README.md` §4 数值口径纪律）。
