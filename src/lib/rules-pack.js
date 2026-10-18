// 生成物：由 tools/hash-rules.mjs 产出，禁止手改。
// 内容 = rules/manifest.json 与 rules/dp-*.json 的原样副本；核对命令：npm run rules:hash -- --check

export const RULESET = {
  "ruleset_version": "0.1.0",
  "ruleset_hash": "0b5805c7088db4799453191093925023d0a7149f453d302f93a2a2c29c106aed",
  "rule_files": [
    "dp-01-prechecked-optin.json",
    "dp-02-hidden-close.json",
    "dp-03-countdown-pressure.json",
    "dp-04-fake-scarcity.json",
    "dp-05-confirmshaming.json",
    "dp-06-anchored-discount.json",
    "dp-07-default-addon.json",
    "dp-08-exit-retention.json",
    "dp-09-subscription-trap.json",
    "dp-10-hidden-fee.json",
    "dp-11-forced-signup.json",
    "dp-12-dark-close.json"
  ],
  "severity_levels": [
    "low",
    "medium",
    "high"
  ],
  "categories": [
    "urgency",
    "misleading",
    "obstacle",
    "price"
  ],
  "thresholds": {
    "precision_min": 0.9,
    "recall_min": 0.8,
    "min_cases_per_rule": 3,
    "scan_timeout_ms": 2000,
    "first_result_budget_ms": 500,
    "fixture_page_count": 40,
    "snippet_max_len": 160
  },
  "match_priority": [
    "dp-hidden-close",
    "dp-prechecked-optin",
    "dp-subscription-trap",
    "dp-hidden-fee",
    "dp-dark-close",
    "dp-confirmshaming",
    "dp-default-addon",
    "dp-fake-scarcity",
    "dp-countdown-pressure",
    "dp-exit-retention",
    "dp-anchored-discount",
    "dp-forced-signup"
  ],
  "sort": {
    "primary": "severity_desc",
    "secondary": "dom_order"
  },
  "output": {
    "json_indent": 2,
    "eol": "lf",
    "trailing_newline": true
  },
  "evidence_kinds": [
    "text",
    "label-text",
    "nearby-text",
    "checked-state",
    "box-size",
    "contrast-ratio",
    "style-color",
    "style-background-color",
    "style-display",
    "style-opacity",
    "style-font-size",
    "dom-path"
  ],
  "detect_keys": [
    "node_kinds",
    "text_any",
    "text_all",
    "near_text_any",
    "nearby_absent_any",
    "attrs",
    "style",
    "style_any",
    "neutralizers"
  ],
  "style_keys": [
    "max_size_px",
    "color_equals_background",
    "opacity_max",
    "contrast_below",
    "min_font_size_px"
  ]
};

export const RULE_SPECS = [
  {
    "rule_id": "dp-prechecked-optin",
    "name": "预勾选（默认勾选）",
    "category": "misleading",
    "severity": "high",
    "detect": {
      "node_kinds": [
        "control"
      ],
      "attrs": {
        "type": "checkbox",
        "checked": "true"
      },
      "near_text_any": [
        "订阅",
        "续订",
        "会员",
        "保价",
        "加购",
        "推荐服务"
      ],
      "neutralizers": [
        "取消订阅",
        "不再需要",
        "退订"
      ]
    },
    "evidence_required": [
      "checked-state",
      "label-text"
    ],
    "locator_strategy": "checkbox 元素：优先 name/id，缺失时用文档序路径（tag:index 链）",
    "explanation": "该复选框在页面加载时即为勾选状态，其标签文字指向订阅/续订/会员/保价等非必需项。本条只记录「加载即勾选 + 标签原文」两处证据，不判断勾选是否为用户本意。",
    "limits": [
      "工具不点击、不改变勾选状态，因此无法核对用户之前是否已取消过该勾选"
    ],
    "remediation_hint": "把非必需项改为默认不勾选，或把勾选状态与用户显式操作绑定"
  },
  {
    "rule_id": "dp-hidden-close",
    "name": "隐形关闭（关闭控件不可见或极小）",
    "category": "obstacle",
    "severity": "high",
    "detect": {
      "node_kinds": [
        "control"
      ],
      "near_text_any": [
        "关闭",
        "取消",
        "跳过",
        "稍后"
      ],
      "style_any": [
        {
          "max_size_px": 8
        },
        {
          "color_equals_background": true
        }
      ]
    },
    "evidence_required": [
      "box-size",
      "style-color",
      "style-background-color",
      "label-text"
    ],
    "locator_strategy": "可点击控件元素：优先 aria-label/title 文本，其次 id/name，缺失时用文档序路径",
    "explanation": "该「关闭/取消/跳过」控件的可点击尺寸极小，或前景色与背景色相同（视觉上无法辨认）。本条只记录几何尺寸与前景/背景色值两处证据。",
    "limits": [
      "尺寸与颜色取自渲染后的计算样式；若站点在扫描后又改变了样式，证据可能与当前画面不一致"
    ],
    "remediation_hint": "关闭控件应达到可点击的最小尺寸，并与背景保持可辨认的对比"
  },
  {
    "rule_id": "dp-countdown-pressure",
    "name": "倒计时施压",
    "category": "urgency",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "text",
        "element"
      ],
      "text_any": [
        "\\d{1,2}\\s*[:：]\\s*\\d{2}",
        "倒计时",
        "仅剩\\s*\\d+\\s*(分钟|秒|小时)",
        "限时\\s*\\d+"
      ],
      "neutralizers": [
        "距活动开始",
        "活动回顾"
      ]
    },
    "evidence_required": [
      "text"
    ],
    "locator_strategy": "承载该文本的节点：文档序路径 + 文本前后各 20 字上下文",
    "explanation": "页面上出现倒计时形态的文本（时分秒、仅剩 N 分钟、限时 N 等）。本条只取证该文本本身，不核对倒计时是否真实（本工具不等待、不刷新）。",
    "limits": [
      "倒计时是否真实到期，需要人工复核或二次访问；本条不判断真伪"
    ],
    "remediation_hint": "如倒计时与真实截止时间无关，应移除或改为不施压的表述"
  },
  {
    "rule_id": "dp-fake-scarcity",
    "name": "稀缺表述且无可核对来源",
    "category": "urgency",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "text"
      ],
      "text_any": [
        "仅剩\\s*\\d+\\s*件",
        "只剩\\s*\\d+\\s*件",
        "仅余\\s*\\d+",
        "库存仅",
        "即将售罄"
      ],
      "nearby_absent_any": [
        "库存来源",
        "实时库存",
        "库存数据来源",
        "仓库余量"
      ]
    },
    "evidence_required": [
      "text",
      "nearby-text"
    ],
    "locator_strategy": "承载该文本的节点：文档序路径 + 周边文本（父容器内其余文本）",
    "explanation": "页面出现「仅剩 N 件」这类数量稀缺表述，而其周边区域没有任何可核对的数量来源。本条记录原文与周边文本两处证据，不判断该数量真伪。",
    "limits": [
      "数量是否真实取决于站点后台数据，本工具无法访问；本条只指出「无可核对来源」这一事实"
    ],
    "remediation_hint": "若数量来自真实库存，应在同一区域标明来源与更新时间"
  },
  {
    "rule_id": "dp-confirmshaming",
    "name": "确认羞辱（把拒绝写成贬损选项）",
    "category": "misleading",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "control",
        "text"
      ],
      "text_any": [
        "不[，,]?(要)?\\s*(省|优惠|折扣|免费)",
        "放弃\\s*.{0,6}(优惠|折扣|赠品)",
        "继续\\s*.{0,6}(原价|全价)",
        "我(不想|不需要)\\s*.{0,8}(省|变强|变好)"
      ]
    },
    "evidence_required": [
      "text",
      "label-text"
    ],
    "locator_strategy": "承载该文案的节点（控件优先取其标签文本）：文档序路径 + 原文",
    "explanation": "该按钮/文本把「拒绝」写成了带贬损或诱导意味的表述（如「不，我不要优惠」）。本条记录原文与其所在控件两处证据，不对站点动机下结论。",
    "limits": [
      "表述是否构成贬损，最终由人工复核判断；本条只做形态识别"
    ],
    "remediation_hint": "拒绝选项应使用中性表述（如「不用了，谢谢」）"
  },
  {
    "rule_id": "dp-anchored-discount",
    "name": "锚定折扣（划线价无可核对来源）",
    "category": "price",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "text",
        "element"
      ],
      "text_all": [
        "(原价|划线价|日常价)",
        "(现价|优惠价|到手价|券后)"
      ],
      "nearby_absent_any": [
        "历史价格",
        "价格来源",
        "比价",
        "价格说明"
      ]
    },
    "evidence_required": [
      "text",
      "nearby-text"
    ],
    "locator_strategy": "价格区节点：文档序路径 + 周边文本",
    "explanation": "同一区域内并列出现「原价/划线价」与「现价/到手价」，而周边没有价格来源或历史价格说明。本条记录两处文本证据，不判断折扣是否真实。",
    "limits": [
      "历史价格需要跨时间采集，本工具只做单次页面取证"
    ],
    "remediation_hint": "若使用划线价对比，应在同一区域给出价格来源与适用期间"
  },
  {
    "rule_id": "dp-default-addon",
    "name": "默认加购（附加项默认选中）",
    "category": "misleading",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "control"
      ],
      "attrs": {
        "type": "checkbox",
        "checked": "true"
      },
      "near_text_any": [
        "延保",
        "服务包",
        "附加",
        "一起买",
        "顺带",
        "加购"
      ]
    },
    "evidence_required": [
      "checked-state",
      "label-text"
    ],
    "locator_strategy": "checkbox 元素：优先 name/id，缺失时用文档序路径",
    "explanation": "该附加项（延保/服务包/搭售）在页面加载时即为勾选状态。本条记录勾选状态与标签原文两处证据，不判断是否属于用户此前的显式选择。",
    "limits": [
      "与「预勾选（默认勾选）」规则形态相近，同一节点命中多条时按规则包 match_priority 归属"
    ],
    "remediation_hint": "附加项应默认不勾选，由用户显式选择"
  },
  {
    "rule_id": "dp-exit-retention",
    "name": "退出挽留文案",
    "category": "obstacle",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "text",
        "element"
      ],
      "text_any": [
        "确定要离开",
        "确定放弃",
        "再想想",
        "放弃\\s*.{0,4}(优惠|购物车|订单)",
        "留下\\s*.{0,6}优惠"
      ]
    },
    "evidence_required": [
      "text",
      "nearby-text"
    ],
    "locator_strategy": "承载该文案的节点：文档序路径 + 周边文本",
    "explanation": "页面出现挽留型文案（确定要离开吗、放弃优惠、再想想）。本条记录原文与周边文本，用于人工复核挽留环节的层数与强度。",
    "limits": [
      "「多层挽留」需要在交互过程中才能观察到；本工具不点击、不代替用户操作，故本条只取证当前可见层"
    ],
    "remediation_hint": "退出流程应一次可完成，不叠加挽留步骤"
  },
  {
    "rule_id": "dp-subscription-trap",
    "name": "订阅取消渠道受限（仅电话/客服）",
    "category": "obstacle",
    "severity": "high",
    "detect": {
      "node_kinds": [
        "text"
      ],
      "text_any": [
        "(电话|致电|客服热线|门店).{0,16}(取消|退订|解约)",
        "(取消|退订|解约).{0,16}(电话|客服热线|门店)"
      ],
      "nearby_absent_any": [
        "在线取消",
        "自助取消",
        "一键取消",
        "管理订阅",
        "账户设置"
      ]
    },
    "evidence_required": [
      "text",
      "nearby-text"
    ],
    "locator_strategy": "承载该文案的节点：文档序路径 + 周边文本",
    "explanation": "页面把取消/退订指向电话或客服，且同一区域未提供在线自助取消入口。本条记录原文与周边文本两处证据，不判断站点是否真的没有在线取消路径。",
    "limits": [
      "在线入口可能位于登录后的其他页面；本条只覆盖当前页可见内容"
    ],
    "remediation_hint": "取消应与订阅同样便捷，并提供在线自助入口"
  },
  {
    "rule_id": "dp-hidden-fee",
    "name": "费用后置（结账阶段才出现费用）",
    "category": "price",
    "severity": "high",
    "detect": {
      "node_kinds": [
        "text",
        "element"
      ],
      "text_any": [
        "(服务费|处理费|手续费|配送费|平台费|包装费).{0,10}(¥|￥|\\d)",
        "费用.{0,8}(将在|于).{0,10}(下一步|结算|提交后|支付时)"
      ]
    },
    "evidence_required": [
      "text",
      "nearby-text"
    ],
    "locator_strategy": "承载该文本的节点：文档序路径 + 周边文本",
    "explanation": "页面在结算阶段出现附加费用文案，或明确写明费用将在下一步/支付时才计入。本条记录原文与其所在区域两处证据，不判断该费用是否应当事先披露。",
    "limits": [
      "「后置」是流程位置概念；本工具只取证当前页文本与位置，不做跨步骤流程复原"
    ],
    "remediation_hint": "费用应在报价阶段一次性给出，避免在提交前才出现"
  },
  {
    "rule_id": "dp-forced-signup",
    "name": "强迫注册（须注册/登录才能继续）",
    "category": "obstacle",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "control",
        "text"
      ],
      "text_any": [
        "注册\\s*.{0,8}(后|才能|即可)\\s*.{0,6}(查看|浏览|购买|继续)",
        "登录\\s*.{0,8}后\\s*.{0,8}(查看|浏览|购买|继续)",
        "仅\\s*.{0,4}(会员|注册用户)\\s*.{0,4}(可见|可看|可购)"
      ]
    },
    "evidence_required": [
      "text",
      "label-text"
    ],
    "locator_strategy": "承载该文案的节点（控件优先取其标签文本）：文档序路径 + 原文",
    "explanation": "页面文案要求先注册或登录才能继续查看/购买。本条记录原文与其所在控件两处证据，不判断该要求是否必要。",
    "limits": [
      "是否存在可绕过入口（如「跳过」）需人工复核，本工具不点击"
    ],
    "remediation_hint": "非必要环节不应以注册为前置条件"
  },
  {
    "rule_id": "dp-dark-close",
    "name": "低对比关闭控件",
    "category": "misleading",
    "severity": "medium",
    "detect": {
      "node_kinds": [
        "control"
      ],
      "near_text_any": [
        "关闭",
        "取消",
        "跳过"
      ],
      "style_any": [
        {
          "contrast_below": 2
        },
        {
          "opacity_max": 0.35
        }
      ]
    },
    "evidence_required": [
      "contrast-ratio",
      "style-color",
      "style-background-color",
      "label-text"
    ],
    "locator_strategy": "可点击控件元素：优先 aria-label/title，其次 id/name，缺失时用文档序路径",
    "explanation": "该「关闭/取消/跳过」控件的前景与背景对比度偏低，或整体透明度很高，使其在视觉上难以辨认。本条记录对比度与颜色值两处证据。",
    "limits": [
      "对比度按 WCAG 相对亮度公式在本机计算；与「隐形关闭」形态相近，同一节点命中多条时按规则包 match_priority 归属"
    ],
    "remediation_hint": "关闭控件应与正文保持可辨认的对比度"
  }
];
