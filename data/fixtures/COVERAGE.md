# fixture 覆盖矩阵（生成物 · 禁止手编）

> 生成命令 `npm run fixtures`；再生成位级比对 `npm run fixtures:check`。
> 本文件由 `tools/gen-fixtures.mjs` 从各页 `truth.json` 汇总生成——手工编辑会被 `fixtures:check` 判为不一致。
> 正样本 = `truth.json` 的 `positives`（规则应命中）；负样本 = `negatives`（看起来像但按规则不成立）。
> 每规则最少用例数、fixture 规模、压力页节点数只在 `rules/manifest.json` 定义，本文件不写第二份数字。

## 逐规则覆盖

| rule_id | 规则名 | 正样本 | 负样本 | 覆盖判定 |
| --- | --- | ---: | ---: | --- |
| dp-prechecked-optin | 预勾选（默认勾选） | 4 | 2 | 达标 |
| dp-hidden-close | 隐形关闭（关闭控件不可见或极小） | 4 | 2 | 达标 |
| dp-countdown-pressure | 倒计时施压 | 4 | 2 | 达标 |
| dp-fake-scarcity | 稀缺表述且无可核对来源 | 4 | 2 | 达标 |
| dp-confirmshaming | 确认羞辱（把拒绝写成贬损选项） | 4 | 2 | 达标 |
| dp-anchored-discount | 锚定折扣（划线价无可核对来源） | 4 | 2 | 达标 |
| dp-default-addon | 默认加购（附加项默认选中） | 4 | 2 | 达标 |
| dp-exit-retention | 退出挽留文案 | 4 | 2 | 达标 |
| dp-subscription-trap | 订阅取消渠道受限（仅电话/客服） | 4 | 2 | 达标 |
| dp-hidden-fee | 费用后置（结账阶段才出现费用） | 4 | 2 | 达标 |
| dp-forced-signup | 强迫注册（须注册/登录才能继续） | 4 | 2 | 达标 |
| dp-dark-close | 低对比关闭控件 | 4 | 2 | 达标 |

## 逐页索引

| 页 | 站点 | 正样本规则 | 负样本规则 |
| --- | --- | --- | --- |
| page-01 | 示例商城（虚构） | dp-prechecked-optin、dp-forced-signup | dp-forced-signup |
| page-02 | 样例电器（虚构） | dp-prechecked-optin、dp-forced-signup | dp-fake-scarcity |
| page-03 | 演示票务（虚构） | dp-prechecked-optin、dp-forced-signup | （无） |
| page-04 | 演示订阅（虚构） | dp-prechecked-optin、dp-forced-signup | dp-forced-signup |
| page-05 | 样例会员（虚构） | dp-hidden-close、dp-dark-close | dp-confirmshaming |
| page-06 | 示例商城（虚构） | dp-hidden-close、dp-dark-close | （无） |
| page-07 | 样例电器（虚构） | dp-hidden-close、dp-dark-close | dp-dark-close |
| page-08 | 演示票务（虚构） | dp-hidden-close、dp-dark-close | dp-confirmshaming |
| page-09 | 演示订阅（虚构） | dp-countdown-pressure | （无） |
| page-10 | 样例会员（虚构） | dp-countdown-pressure | dp-dark-close |
| page-11 | 示例商城（虚构） | dp-countdown-pressure | dp-anchored-discount |
| page-12 | 样例电器（虚构） | dp-countdown-pressure | （无） |
| page-13 | 演示票务（虚构） | dp-fake-scarcity | （无） |
| page-14 | 演示订阅（虚构） | dp-fake-scarcity | dp-anchored-discount |
| page-15 | 样例会员（虚构） | dp-fake-scarcity | （无） |
| page-16 | 示例商城（虚构） | dp-fake-scarcity | （无） |
| page-17 | 样例电器（虚构） | dp-confirmshaming | dp-default-addon |
| page-18 | 演示票务（虚构） | dp-confirmshaming | （无） |
| page-19 | 演示订阅（虚构） | dp-confirmshaming | （无） |
| page-20 | 样例会员（虚构） | dp-confirmshaming | dp-default-addon |
| page-21 | 示例商城（虚构） | dp-anchored-discount | dp-prechecked-optin |
| page-22 | 样例电器（虚构） | dp-anchored-discount | （无） |
| page-23 | 演示票务（虚构） | dp-anchored-discount | dp-exit-retention |
| page-24 | 演示订阅（虚构） | dp-anchored-discount | dp-prechecked-optin |
| page-25 | 样例会员（虚构） | dp-default-addon | （无） |
| page-26 | 示例商城（虚构） | dp-default-addon | dp-exit-retention |
| page-27 | 样例电器（虚构） | dp-default-addon | dp-hidden-close |
| page-28 | 演示票务（虚构） | dp-default-addon | （无） |
| page-29 | 演示订阅（虚构） | dp-exit-retention | dp-subscription-trap |
| page-30 | 样例会员（虚构） | dp-exit-retention | dp-hidden-close |
| page-31 | 示例商城（虚构） | dp-exit-retention | （无） |
| page-32 | 样例电器（虚构） | dp-exit-retention | dp-subscription-trap |
| page-33 | 演示票务（虚构） | dp-subscription-trap | dp-countdown-pressure |
| page-34 | 演示订阅（虚构） | dp-subscription-trap | （无） |
| page-35 | 样例会员（虚构） | dp-subscription-trap | dp-hidden-fee |
| page-36 | 示例商城（虚构） | dp-subscription-trap | dp-countdown-pressure |
| page-37 | 样例电器（虚构） | dp-hidden-fee | （无） |
| page-38 | 演示票务（虚构） | dp-hidden-fee | dp-hidden-fee |
| page-39 | 演示订阅（虚构） | dp-hidden-fee | dp-fake-scarcity |
| page-40 | 样例会员（虚构） | dp-hidden-fee | （无） |

## 合计

- 页面：40（`rules/manifest.json` → `thresholds.fixture_page_count`）
- 规则：12
- 正样本：48
- 负样本：24
- 覆盖弱规则：（无）
