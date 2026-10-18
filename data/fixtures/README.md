# data/fixtures —— 合成 fixture（生成物）

由 `tools/gen-fixtures.mjs` 生成：`npm run fixtures` 重生成，`npm run fixtures:check` 做再生成位级比对。
**手工修改 fixture 必须同步改同目录 `truth.json`**，否则 `fixtures:check` 失败。

## 目录

- `page-NN/page.html` —— 合成页面（站点名与域名只用 `data/README.md` §3.1 白名单，生成器断言）
- `page-NN/style-map.json` —— **声明样式子集**：`selector_path` → `display/color/backgroundColor/opacity/fontSizePx`（+ 可选的 `widthPx/heightPx`）
- `page-NN/truth.json` —— 逐页真值（只存**输入与期望**）
- `stress-5k/page.html` + `stress-5k/meta.json` —— 压力页（节点规模见 `rules/manifest.json` → `thresholds.stress_node_count`）
- `COVERAGE.md` —— 逐规则正/负样本计数（由真值汇总生成）

## truth.json 形态（真值纪律，plan/05 §二）

```json
{
  "page": "page-01",
  "site": "示例商城（虚构）",
  "url": "https://example.invalid/page-01.html",
  "positives": [{ "rule_id": "dp-countdown-pressure", "selector_path": "html:nth(0)>…", "snippet_expected": "限时 02:45 结束", "note": "…" }],
  "negatives": [{ "rule_id": "dp-fake-scarcity", "selector_path": "html:nth(0)>…", "snippet_expected": "即将售罄", "note": "…" }]
}
```

- **只存输入与期望**：`positives` = 规则**应命中**的节点；`negatives` = **看起来像但按规则不成立**的节点（期望不产出）；两类条目形态**一致**：`{rule_id, selector_path, snippet_expected, note?}`——正负由所在数组决定，不靠额外字段。
- **禁止 `observed_*` / `matched` / `detected` 一类字段**：冻结「观测」会让基准退化成「比对两份预先算好的答案」（引擎全坏也全绿）。
- `snippet_expected` 必须是 `page.html` 的**原样子串**（生成期逐条断言；`tests/truth-shape.test.mjs` 独立复算）。
- 真值**先于规则**、且与规则数据的一致性由生成期断言把关：每条正样本在规则数据下必须归属到声明的 `rule_id`，每条负样本必须不归属任何规则。

## 页面模型口径（与 `src/content/collector.js` 同语义）

- 定位串：`tag:nth(i)>tag:nth(i)`，`i` = 同标签兄弟中的下标；文本节点的路径 = 其父元素路径。
- 文本节点：`text` 为宿主文本**原样**（仅去首尾空白），空白文本节点不产出。
- `nearby-text`（周边文本）= **父元素文本内容减去本节点文本内容**（归一空白）；空串是合法证据（`nearby_absent_any` 判据依赖它）。
- 控件标签优先级：`aria-label` / `title` / `placeholder` / `alt` → 自身文本 → `value`。
- `checked` 布尔属性归一为字符串 `true` / `false`。
- 样式来自本目录 `style-map.json`（**声明的样式子集**，不是浏览器计算样式——该缺口在 `plan/03` §六 与 README 局限披露里写明）。
