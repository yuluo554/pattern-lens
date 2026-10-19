#!/usr/bin/env node
// 发布终态自检门（M6，`plan/03` §二 / `plan/06` M6 DoD / `plan/07` §3.4）。三种模式：
//   默认（离线）  —— 只查仓库内文件与构建产物；远端项报 SKIP，**不报 PASS**（离线不许冒充在线）。
//   --pre-tag    —— tag 相关项报 SKIP（让本脚本能随发布预备提交进 tag 树；没有它，发布时刻手里就没有可跑的门）。
//   --online     —— 追加远端检查（仓库公开 / tag 两端一致 / CI run 对账 / Release 附件下载重算 sha256）。
// 退出码：0 全绿 / 1 有 FAIL / 2 用法错误 / 3 **环境缺失**（gh 不在或未登录——与"发布未达成"分开）。
// 刻意不进 CI：发布前它本来就该红（`plan/03` §二）。
//
// 判据按"真实发布动作序列"设计（建仓 → push main → tag → push tag → Release → 登记追加提交），
// 不按"看起来更严格"设计。`--online` 需要网络；离线项在干净 clone 里也要能跑（不读 .git 历史以外的远端事实）。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const MODE = args.has("--online") ? "online" : args.has("--pre-tag") ? "pre-tag" : "offline";

// 发布事实的单一来源（与 README / manifest / Release 同名）
const OWNER = "yuluo554";
const REPO = "pattern-lens";
const TAG = "v0.1.0";

/** 发布留档路径可用环境变量覆盖：把"缺档"这一瞬态变成可重复构造的输入（见 tests/release-gate.test.mjs）。 */
const RELEASE_DOC_PATH = process.env.RELEASE_DOC_PATH ?? "plan/RELEASE-M6.md";
/** 发布附件名由 manifest 版本派生（build-extension.mjs 的 zipName() 同口径）。 */
const ZIP_NAME = `pattern-lens-${JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version}.zip`;
const ZIP_PATH = `release/${ZIP_NAME}`;
const SUMS_PATH = "release/SHA256SUMS";

class EnvironmentMissing extends Error {}
class ReleaseNotAchieved extends Error {}

const checks = [];
const scanned = { files: 0, commits: 0, rows: 0 };
const add = (id, status, detail) => checks.push({ id, status, detail });

function readIfExists(rel) {
  const full = join(ROOT, rel);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

function git(gitArgs) {
  return execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** 剥掉代码块与 HTML 注释——判据读"人写的文档"时，作者为读者写的样例行不许被当成真值登记。 */
function stripProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** 扫描文本里"本机路径 / 私密身份"形态——脱敏四步第①/④步的机器判据。
 * 账号号段只在**非 noreply 形态**下算命中：`282769740+yuluo554@users.noreply.github.com`
 * 是被脱敏四步第②步明确认可的对公身份，不该被第①步当成泄露。 */
const LOCAL_PATH_PATTERNS = [
  /[A-Za-z]:[\\/]+ProgramData/i,
  /[A-Za-z]:[\\/]+Users[\\/]+/i,
  /C:[\\/]Users/i,
  /\\ASUS\\/i,
  /282769740(?!\+yuluo554@users\.noreply\.github\.com)/,
];
function findLocalPaths(text) {
  return LOCAL_PATH_PATTERNS.some((re) => re.test(text));
}

/** 扫描器与发布留档**必然含它们要扫的模式词面**——豁免必须**文件级**
 * （rev 级豁免会随收尾提交漂移并放过同 rev 内其他文件的真泄露）。 */
const SCAN_EXEMPT = new Set(["tools/check-release.mjs", "plan/RELEASE-M6.md"]);

// ── 离线项 ────────────────────────────────────────────────────────────────────

function checkRepoIdentity() {
  const readme = readIfExists("README.md") ?? "";
  const ok = readme.includes(`github.com/${OWNER}/${REPO}`) || readme.includes(`${OWNER}/${REPO}`);
  add("REPO_IDENTITY", ok ? "PASS" : "FAIL", ok ? `README 指向 ${OWNER}/${REPO}` : `README 未提 ${OWNER}/${REPO}`);
}

function checkDocsPresent() {
  const required = [
    "README.md",
    "LICENSE",
    "manifest.json",
    "package.json",
    "data/README.md",
    "AGENTS.md",
    "plan/00-README总览.md",
    "plan/06-里程碑与每周演示.md",
    "plan/07-交付对标与发布计划.md",
    "docs/隐私声明.md",
    "docs/商店素材清单.md",
  ];
  const missing = required.filter((rel) => !existsSync(join(ROOT, rel)));
  scanned.files += required.length;
  add("DOCS_PRESENT", missing.length === 0 ? "PASS" : "FAIL", missing.join(",") || `${required.length} 份齐备`);
}

/** 版本单一来源：`manifest.json.version` == `package.json.version`（tag 名 = `v` + 该版本）。 */
function checkVersionSingleSource() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  const rules = JSON.parse(readFileSync(join(ROOT, "rules/manifest.json"), "utf8"));
  const same = pkg.version === manifest.version;
  const rulesOk = /^\d+\.\d+\.\d+/.test(String(rules.ruleset_version));
  add(
    "VERSION_SINGLE_SOURCE",
    same && rulesOk ? "PASS" : "FAIL",
    `package=${pkg.version} manifest=${manifest.version} ruleset=${rules.ruleset_version} tag=${TAG}`,
  );
}

/** 构建产物与打包产物**不进 git**（`.gitignore`；发布走 Release 附件）。 */
function checkNoArtifactsTracked() {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const forbidden = tracked.filter(
    (path) => path.startsWith("dist/") || path.startsWith("release/") || path.endsWith(".zip") || path.includes("node_modules/"),
  );
  add("NO_ARTIFACTS_TRACKED", forbidden.length === 0 ? "PASS" : "FAIL", forbidden.join(",") || "0 项");
}

/** 工作树干净 = 发布预备已全部提交（tag 时点必须成立）。 */
function checkWorktreeClean() {
  const status = git(["status", "--porcelain"]).split("\n").filter(Boolean);
  add("WORKTREE_CLEAN", status.length === 0 ? "PASS" : "FAIL", status.length === 0 ? "工作树干净" : `${status.length} 项未提交`);
}

/** 脱敏第②步：提交身份与 tagger 邮箱全部为 GitHub noreply。 */
function checkIdentityNoreply() {
  const emails = new Set();
  for (const line of git(["log", "--format=%ae%n%ce"]).split("\n")) {
    if (line.trim()) emails.add(line.trim());
  }
  scanned.commits = emails.size;
  let tagger = null;
  try {
    // for-each-ref 的 %(taggeremail) 带尖括号（`<a@b>`）——剥掉再判，否则 noreply 也判成非 noreply
    tagger = git(["for-each-ref", "--format=%(taggeremail)", `refs/tags/${TAG}`]).trim().replace(/^<|>$/g, "") || null;
  } catch {
    tagger = null;
  }
  const all = [...emails, ...(tagger ? [tagger] : [])];
  const bad = all.filter((email) => !/@users\.noreply\.github\.com$/.test(email));
  const detail = `提交身份 ${emails.size} 种${tagger ? " + tagger" : "（tag 未建）"}`;
  add("IDENTITY_NOREPLY", bad.length === 0 ? "PASS" : "FAIL", bad.length === 0 ? detail : `非 noreply: ${bad.join(",")}`);
}

/** 脱敏第③步：`.gitattributes` 在位，且冻结字节的文件标 binary（git 不许碰）。 */
function checkGitAttributes() {
  const text = readIfExists(".gitattributes");
  if (text === null) {
    add("GITATTRIBUTES", "FAIL", "缺 .gitattributes");
    return;
  }
  const missing = ["*.zip binary", "*.png binary"].filter((needle) => !text.includes(needle));
  const eol = text.includes("eol=lf");
  add("GITATTRIBUTES", missing.length === 0 && eol ? "PASS" : "FAIL", missing.length ? `缺: ${missing.join("/")}` : "文本归一 + 冻结字节标 binary");
}

/** 脱敏第①步：入库文本无本机盘符 / 账号名 / 邮箱 / 私密身份。
 * 扫描器与发布留档必然含"要扫的模式词面"——按 skill 口径走**文件级豁免**（见 SCAN_EXEMPT）。 */
function checkNoLocalPaths() {
  // 阳性对照：判据自身不许是空的（否则"0 命中"证明不了任何事）
  const probe = findLocalPaths("D:\\ProgramData\\zcode\\x") && findLocalPaths("C:/Users/ASUS/x");
  if (!probe) {
    add("NO_LOCAL_PATHS", "FAIL", "阳性对照失败：判据扫不出合成的本机路径（判据是空的）");
    return;
  }
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const hits = [];
  for (const rel of tracked) {
    if (SCAN_EXEMPT.has(rel)) continue;
    if (!/\.(md|mjs|js|json|txt|html|css|yml|yaml|gitattributes|gitignore)$/.test(rel) && !rel.startsWith(".")) continue;
    const full = join(ROOT, rel);
    if (!existsSync(full) || statSync(full).size > 512 * 1024) continue;
    scanned.files += 1;
    if (findLocalPaths(readFileSync(full, "utf8"))) hits.push(rel);
  }
  add("NO_LOCAL_PATHS", hits.length === 0 ? "PASS" : "FAIL", hits.join(",") || `0 命中（豁免 ${SCAN_EXEMPT.size} 份：扫描器与留档；阳性对照通过）`);
}

/** 脱敏第④步：dist/ 与 zip 内无本机路径（产物也是要被下载的东西）。 */
function checkArtifactNoLocalPaths() {
  const hits = [];
  const dist = join(ROOT, "dist");
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(js|json|html|css)$/.test(entry.name)) {
        if (findLocalPaths(readFileSync(path, "latin1"))) hits.push(`dist/${entry.name}`);
      }
    }
  };
  walk(dist);
  const zipFull = join(ROOT, ZIP_PATH);
  if (existsSync(zipFull) && findLocalPaths(readFileSync(zipFull, "latin1"))) hits.push(ZIP_PATH);
  add("ARTIFACT_NO_LOCAL_PATHS", hits.length === 0 ? "PASS" : "FAIL", hits.join(",") || "dist/ 与 zip 均干净");
}

/** 构建确定性：dist/ 与 zip 可由源码逐字节重生成（发布附件的合法性来源）。 */
function checkArtifactDeterminism() {
  if (!existsSync(join(ROOT, "dist")) || !existsSync(join(ROOT, ZIP_PATH))) {
    add("ARTIFACT_DETERMINISM", "FAIL", "缺 dist/ 或 zip（先 npm run build）");
    return;
  }
  try {
    execFileSync(process.execPath, [join(ROOT, "tools/build-extension.mjs"), "--check"], { cwd: ROOT, stdio: "pipe" });
    add("ARTIFACT_DETERMINISM", "PASS", "dist/ 与 zip 逐字节可由源码重生成");
  } catch (error) {
    add("ARTIFACT_DETERMINISM", "FAIL", `重生成不一致：${String(error.stdout ?? "").trim().split("\n")[0]}`);
  }
}

/** `release/` 是本地留档目录（附件副本 + SHA256SUMS），**不入仓**（K13；发布走 Release 附件）。 */
function checkReleaseDirIgnored() {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const leaked = tracked.filter((path) => path.startsWith("release/"));
  let ignored = false;
  try {
    git(["check-ignore", "-q", "release/SHA256SUMS"]);
    ignored = true;
  } catch {
    ignored = false;
  }
  const ok = leaked.length === 0 && ignored;
  add("RELEASE_DIR_IGNORED", ok ? "PASS" : "FAIL", !ignored ? "release/ 未被 .gitignore 忽略" : leaked.length ? `release/ 入库了: ${leaked.join(",")}` : "release/ 未入库且被忽略（本地留档件）");
}

/** 本地留档件：release/SHA256SUMS 登记附件 sha256，且与实际 zip 对齐（`sha256sum -c` 用）。 */
function checkSha256Local() {
  const sums = readIfExists(SUMS_PATH);
  if (sums === null) {
    // 干净 clone 里 release/ 本就不存在（本地留档件）——报 SKIP 不报 PASS（离线不许冒充通过）。
    add("SHA256_LOCAL", "SKIP", `无 ${SUMS_PATH}（本地留档件；发布时刻须存在并 npm run build）`);
    return;
  }
  if (!existsSync(join(ROOT, ZIP_PATH))) {
    add("SHA256_LOCAL", "FAIL", `有 ${SUMS_PATH} 但缺 ${ZIP_PATH}`);
    return;
  }
  const actual = sha256(join(ROOT, ZIP_PATH));
  // sha256sum 三种合法形态：`sha256: <hex>  <name>` / `<hex>  <name>` / `<hex>  *<name>`（二进制读取加 *）
  const line = sums.split("\n").find((row) => row.includes(basename(ZIP_PATH)));
  const digest = /([0-9a-f]{64})/.exec(line ?? "")?.[1];
  const ok = digest === actual;
  add("SHA256_LOCAL", ok ? "PASS" : "FAIL", ok ? `${ZIP_NAME} sha256 与留档件一致` : `留档件 ${digest ?? "(缺行)"} ≠ 实际 ${actual}`);
}

/** 每条已交付命令在 CI 里有离线冒烟（`plan/07` §3.4）；且发布门**刻意不进 CI**。 */
function checkCiSteps() {
  const text = readIfExists(".github/workflows/ci.yml");
  if (text === null) {
    add("CI_STEPS", "FAIL", "缺 .github/workflows/ci.yml");
    return;
  }
  const required = [
    "node tools/check-sprint-layout.mjs",
    "node tools/hash-rules.mjs --check",
    "npm test",
    "npm run build",
    "node tools/build-extension.mjs --check",
    "npm run verify",
  ];
  const missing = required.filter((needle) => !text.includes(needle));
  const leaked = text.includes("check-release");
  const ok = missing.length === 0 && !leaked;
  add("CI_STEPS", ok ? "PASS" : "FAIL", missing.length ? `缺步骤: ${missing.join(" / ")}` : leaked ? "发布门混进了 CI（应刻意不进）" : `${required.length} 条核心步骤齐 + 发布门未进 CI`);
}

/** 发布留档两栏（`plan/RELEASE-M6.md`）：tag 前事实 / tag 后追加。 */
function checkReleaseDoc() {
  const text = readIfExists(RELEASE_DOC_PATH);
  if (text === null) {
    if (MODE === "pre-tag") add("RELEASE_DOC", "SKIP", "tag 前尚未创建");
    else add("RELEASE_DOC", "FAIL", `${RELEASE_DOC_PATH} 缺失（发布留档必须在 tag 前入库）`);
    return;
  }
  const before = /^##\s*一、tag 前事实/m.test(text);
  const after = /^##\s*二、tag 后追加/m.test(text);
  add("RELEASE_DOC", before && after ? "PASS" : "FAIL", `两栏: ${before}/${after}`);
}

/** 包内文档**不许**在 §一（tag 前事实，即进 tag 树的那半）写附件 sha256——
 * 写入动作会改变包内容，哈希立刻失效。§二（tag 后追加）不受限：那半不进 tag 树（`plan/07` §3.3）。 */
function checkReleaseDocNoDigest() {
  const text = readIfExists(RELEASE_DOC_PATH);
  if (text === null) {
    add("RELEASE_DOC_NO_DIGEST", "SKIP", "留档不存在");
    return;
  }
  const tagTree = stripProse(text.split(/^##\s*二、tag 后追加/m)[0] ?? text);
  const registered = (tagTree.match(/^\s*sha256:\s*[0-9a-f]{64}\s+\S+/gm) ?? []).length;
  add("RELEASE_DOC_NO_DIGEST", registered === 0 ? "PASS" : "FAIL", registered === 0 ? "tag 树那半（§一）无附件哈希" : `${registered} 行附件哈希混进 §一（tag 树）`);
}

/** 阶段 7 覆盖对账表（`plan/07` §3.4）：三态逐条不许留空。 */
function checkCoverageTable() {
  const text = readIfExists(RELEASE_DOC_PATH);
  if (text === null) {
    add("COVERAGE_TABLE", "SKIP", "留档不存在");
    return;
  }
  const lines = text.split("\n");
  // 锚到**小节标题**（不是"行里含覆盖对账"——§1.4 的散文里也提到"覆盖对账表"，会张冠李戴）
  const start = lines.findIndex((line) => /^#{2,4}.*覆盖对账/.test(line));
  if (start < 0) {
    add("COVERAGE_TABLE", "FAIL", "留档缺「覆盖对账」小节标题");
    return;
  }
  const rows = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2 || /^:?-+/.test(cells[0])) continue;
    if (/出口门|状态|归宿/.test(cells[0])) continue; // 表头
    rows.push(cells);
  }
  scanned.rows = rows.length;
  const bad = rows.filter((cells) => !/^(实现|不适用|待首推)/.test(cells[1] ?? ""));
  const ok = rows.length >= 12 && bad.length === 0;
  add(
    "COVERAGE_TABLE",
    ok ? "PASS" : "FAIL",
    bad.length ? `归宿列留空/非三态: ${bad.map((cells) => cells[0]).join(",")}` : `${rows.length} 行三态齐备`,
  );
}

/** annotated tag 在本地（`git cat-file -t` = tag）。 */
function checkTagPresent() {
  if (MODE === "pre-tag") {
    add("TAG_PRESENT", "SKIP", "pre-tag 模式不查 tag");
    return;
  }
  try {
    const type = git(["cat-file", "-t", TAG]).trim();
    const target = git(["rev-parse", `${TAG}^{commit}`]).trim();
    add("TAG_PRESENT", type === "tag" ? "PASS" : "FAIL", type === "tag" ? `本地 tag ${TAG} → ${target.slice(0, 12)}` : `${TAG} 不是 annotated（type=${type}）`);
  } catch {
    add("TAG_PRESENT", "FAIL", `本地无 ${TAG} tag`);
  }
}

/** tag 之后只允许**非交付面**提交（文档 / 测试 / 发布期工具），交付面（src/、rules/、manifest.json、
 * assets/store/）一律不许动——动了就得升版本号重发。口径按本仓实况写（见 `plan/RELEASE-M6.md` §二/§三）。 */
const POST_TAG_ALLOWED_PREFIX = ["plan/", "tests/", "tools/", "docs/"];
const POST_TAG_ALLOWED_FILE = ["README.md", "AGENTS.md"];
const DELIVERABLE_PREFIX = ["src/", "rules/", "assets/store/"];
const DELIVERABLE_FILE = ["manifest.json"];
function checkPostTagScope() {
  if (MODE === "pre-tag") {
    add("POST_TAG_SCOPE", "SKIP", "pre-tag 模式不查 tag 后差异");
    add("DELIVERABLE_UNCHANGED", "SKIP", "pre-tag 模式不查 tag 后差异");
    return;
  }
  try {
    git(["rev-parse", TAG]);
  } catch {
    add("POST_TAG_SCOPE", "SKIP", "tag 未建，无可比对");
    add("DELIVERABLE_UNCHANGED", "SKIP", "tag 未建，无可比对");
    return;
  }
  // 中文路径八进制转义会击穿 startswith 白名单判定 → core.quotepath=false + strip('"') 双保险
  const names = git(["-c", "core.quotepath=false", "diff", "--name-only", `${TAG}..HEAD`])
    .split("\n")
    .map((name) => name.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
  const allowed = (name) => POST_TAG_ALLOWED_PREFIX.some((p) => name.startsWith(p)) || POST_TAG_ALLOWED_FILE.includes(name);
  const bad = names.filter((name) => !allowed(name));
  add("POST_TAG_SCOPE", bad.length === 0 ? "PASS" : "FAIL", bad.length ? `越界: ${bad.join(",")}` : `${names.length} 项全在非交付面（plan/ tests/ tools/ docs/ README AGENTS）`);
  // 第二条独立判据：**交付面**必须零差异（tag 之后任何 src/rules/manifest/图标改动都须升版本号重发）
  const deliverable = names.filter((name) => DELIVERABLE_PREFIX.some((p) => name.startsWith(p)) || DELIVERABLE_FILE.includes(name));
  add("DELIVERABLE_UNCHANGED", deliverable.length === 0 ? "PASS" : "FAIL", deliverable.length ? `交付面被改动: ${deliverable.join(",")}（须升版本号重发）` : "交付面（src/ rules/ manifest.json assets/store/）tag 后零差异");
}

// ── 在线项（--online 才查）────────────────────────────────────────────────────

function gh(ghArgs) {
  // 本机 `github.com:443` 可能间歇不通（AGENTS.md 实测）——重试 3 次再判，别把网络抖动当发布未达成。
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return execFileSync("gh", ghArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      lastError = error;
      const message = `${error.stderr ?? ""}${error.message ?? ""}`;
      if (/command not found|not logged|authentication|no oauth token|gh: 未登录/i.test(message)) {
        throw new EnvironmentMissing(`gh 不可用或未登录：${message.split("\n")[0]}`);
      }
      if (/HTTP 404|Not Found/i.test(message)) {
        throw new ReleaseNotAchieved(`远端对象 404（还没建仓/建 tag/发 Release）：${message.split("\n")[0]}`);
      }
      if (!/wsarecv|forcibly closed|ECONNRESET|timeout|TLS|EOF/i.test(message)) break; // 非瞬时错误不重试
    }
  }
  const message = `${lastError?.stderr ?? ""}${lastError?.message ?? ""}`;
  throw new ReleaseNotAchieved(message.split("\n")[0]);
}

function skipRemote(id) {
  add(id, "SKIP", `${MODE} 模式不查远端`);
}

function checkRepoPublic() {
  if (MODE !== "online") return skipRemote("REPO_PUBLIC");
  const json = gh(["repo", "view", `${OWNER}/${REPO}`, "--json", "visibility,url"]);
  const data = JSON.parse(json);
  add("REPO_PUBLIC", data.visibility === "PUBLIC" ? "PASS" : "FAIL", `${data.url} ${data.visibility}`);
}

/** annotated tag 两端一致 = **对象哈希**一致（只对齐 commit sha 会漏 message/tagger 漂移）。 */
function checkRemoteTag() {
  if (MODE !== "online") return skipRemote("REMOTE_TAG");
  const local = git(["cat-file", "-t", TAG]).trim() === "tag" ? git(["rev-parse", TAG]).trim() : null;
  const ref = JSON.parse(gh(["api", `repos/${OWNER}/${REPO}/git/ref/tags/${TAG}`]));
  const remote = ref.object?.sha;
  const ok = local && remote && local === remote;
  add("REMOTE_TAG", ok ? "PASS" : "FAIL", ok ? `两端一致 ${local.slice(0, 12)}` : `本地 ${local?.slice(0, 12) ?? "(无 tag)"} vs 远端 ${remote?.slice(0, 12) ?? "(无)"}`);
}

/** push 数 = run 数对账（权威 = run list 逐条配对；Events API 高频丢弃只作旁证）。 */
function checkCiRuns() {
  if (MODE !== "online") return skipRemote("CI_RUNS");
  const runs = JSON.parse(gh(["run", "list", "--workflow", "ci.yml", "--limit", "100", "--json", "event,headBranch,headSha,conclusion,databaseId"]));
  const pushes = runs.filter((run) => run.event === "push");
  const releaseCommit = git(["rev-parse", `${TAG}^{commit}`]).trim();
  const branchRun = pushes.find((run) => run.headBranch === "main" && run.headSha === releaseCommit);
  const tagRun = pushes.find((run) => run.headBranch === TAG);
  const ok = branchRun?.conclusion === "success" && tagRun?.conclusion === "success";
  add(
    "CI_RUNS",
    ok ? "PASS" : "FAIL",
    ok
      ? `${pushes.length} 条 push run；发布提交 branch run #${branchRun.databaseId} 与 tag run #${tagRun.databaseId} 均 success`
      : `发布提交 branch run=${branchRun?.conclusion ?? "缺"} / tag run=${tagRun?.conclusion ?? "缺"}（push run 共 ${pushes.length} 条）`,
  );
}

function checkRemoteRelease() {
  if (MODE !== "online") return skipRemote("REMOTE_RELEASE");
  const data = JSON.parse(gh(["release", "view", TAG, "--repo", `${OWNER}/${REPO}`, "--json", "isDraft,assets,tagName"]));
  const assets = (data.assets ?? []).map((asset) => asset.name);
  const ok = !data.isDraft && assets.includes(ZIP_NAME);
  add("REMOTE_RELEASE", ok ? "PASS" : "FAIL", `${data.tagName} draft=${data.isDraft} assets=${assets.join(",") || "(无)"}`);
}

/** 附件 sha256 写进 Release 正文（不写包内）——两条不动点之一，最省事的那种。 */
function checkReleaseNotesDigest() {
  if (MODE !== "online") return skipRemote("RELEASE_NOTES_SHA");
  const body = gh(["release", "view", TAG, "--repo", `${OWNER}/${REPO}`, "--json", "body", "--jq", ".body"]);
  const digest = sha256(join(ROOT, ZIP_PATH));
  const ok = body.includes(digest);
  add("RELEASE_NOTES_SHA", ok ? "PASS" : "FAIL", ok ? `Release 正文含 ${ZIP_NAME} sha256` : "Release 正文未登记附件 sha256");
}

/** 真下载复核：附件下载回来重算 sha256 与本地留档件一致（发布物本体已验）。 */
function checkRemoteAssetSha() {
  if (MODE !== "online") return skipRemote("RELEASE_ASSET_SHA");
  const raw = gh(["release", "view", TAG, "--repo", `${OWNER}/${REPO}`, "--json", "assets", "--jq", `.assets[] | select(.name=="${ZIP_NAME}") | .digest`]);
  const remoteDigest = raw.trim().replace(/^sha256:/, "");
  const localDigest = sha256(join(ROOT, ZIP_PATH));
  const ok = remoteDigest === localDigest;
  add("RELEASE_ASSET_SHA", ok ? "PASS" : "FAIL", ok ? `远端附件 digest 与本地一致` : `远端 ${remoteDigest || "(无 digest)"} ≠ 本地 ${localDigest}`);
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

const OFFLINE_CHECKS = [
  checkRepoIdentity,
  checkDocsPresent,
  checkVersionSingleSource,
  checkNoArtifactsTracked,
  checkWorktreeClean,
  checkIdentityNoreply,
  checkGitAttributes,
  checkNoLocalPaths,
  checkArtifactNoLocalPaths,
  checkArtifactDeterminism,
  checkReleaseDirIgnored,
  checkSha256Local,
  checkCiSteps,
  checkReleaseDoc,
  checkReleaseDocNoDigest,
  checkCoverageTable,
  checkTagPresent,
  checkPostTagScope,
];

const ONLINE_CHECKS = [
  checkRepoPublic,
  checkRemoteTag,
  checkCiRuns,
  checkRemoteRelease,
  checkReleaseNotesDigest,
  checkRemoteAssetSha,
];

function report() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const check of checks) counts[check.status] += 1;
  process.stdout.write(`发布终态自检（M6） · 模式=${MODE}\n`);
  process.stdout.write("=".repeat(64) + "\n");
  for (const check of checks) process.stdout.write(`${check.status.padEnd(4)}  ${check.id.padEnd(24)} ${check.detail}\n`);
  process.stdout.write("=".repeat(64) + "\n");
  process.stdout.write(`这轮扫到：检查项 ${checks.length} / 入库文本 ${scanned.files} / 提交身份 ${scanned.commits} 种 / 覆盖对账行 ${scanned.rows}\n`);
  process.stdout.write(`PASS ${counts.PASS} / FAIL ${counts.FAIL} / SKIP ${counts.SKIP}\n`);
  process.stdout.write("SKIP 不计入 PASS；发布前本门允许红。\n");
}

function main() {
  if ([...args].some((arg) => !["--online", "--pre-tag"].includes(arg))) {
    process.stderr.write("用法: node tools/check-release.mjs [--pre-tag | --online]\n");
    process.exitCode = 2;
    return;
  }

  for (const run of OFFLINE_CHECKS) {
    try {
      run();
    } catch (error) {
      // 检查自身炸了也计 FAIL（不能静默跳过——否则 rc=1 但一条结论都没跑完）
      add(run.name.replace(/^check/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase(), "FAIL", error.message.split("\n")[0]);
    }
  }

  for (const run of ONLINE_CHECKS) {
    try {
      run();
    } catch (error) {
      if (error instanceof EnvironmentMissing) {
        add("ENVIRONMENT", "SKIP", error.message);
        report();
        process.exitCode = 3;
        return;
      }
      add(run.name.replace(/^check/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase(), "FAIL", error.message.split("\n")[0]);
    }
  }

  report();
  const failed = checks.filter((check) => check.status === "FAIL");
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
