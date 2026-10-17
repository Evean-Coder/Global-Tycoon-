'use strict';
// Generated from src/gameplayCatalog.js; run scripts/build-rules-catalog.js.
window.RULES_CATALOG = {
  "managementEconomy": {
    "revision": "management-economy-v1",
    "order": {
      "advancePercent": 10,
      "minAdvance": 1000,
      "maxAdvance": 2000,
      "profitPercent": 100,
      "firstProfitPercent": 25
    },
    "competition": {
      "minBid": 100,
      "maxBid": 3000,
      "bidStep": 100,
      "surchargePercent": 15,
      "surchargeCap": 3000,
      "hits": 2,
      "rounds": 4,
      "periodRounds": 4
    }
  },
  "stockInvestment": {
    "revision": "stock-investment-v2",
    "totalShares": 10,
    "ownerCap": 2,
    "externalCap": 4,
    "rentalPercent": 20,
    "bankPercent": 40,
    "ordinaryExitPercent": 90,
    "clearExitPercent": 50,
    "playerSaleFeePercent": 2,
    "offerSeconds": 20,
    "turnLimit": {
      "shares": 2,
      "cities": 1
    },
    "goLimit": {
      "shares": 4,
      "cities": 3,
      "perCity": 2
    }
  },
  "regions": [
    "非洲",
    "大洋洲",
    "欧洲",
    "美洲",
    "亚洲"
  ],
  "news": {
    "boom": {
      "name": "地区旺季",
      "description": "相关地区城市租金增加30%，每笔最多增加6000。"
    },
    "slowdown": {
      "name": "地区淡季",
      "description": "相关地区城市租金减少30%，每笔最多减少6000。"
    },
    "construction": {
      "name": "建设优惠季",
      "description": "每位玩家每轮首次成功建房优惠标准费用25%，最多3000；总优惠上限及远程150%底价仍有效。"
    },
    "aviation": {
      "name": "航空促销",
      "description": "付费机票优惠40%；与飞行常客、任务券合计最多60%，机场通行费不变。"
    },
    "stable": {
      "name": "订单扶持期",
      "description": "实际收到经营订单款时额外奖励10%，每次最多150；取消、未收款和封盘不奖励。"
    }
  },
  "opportunities": [
    {
      "id": "H1",
      "direction": "地产",
      "name": "远程施工",
      "description": "每圈首次受惠远程建设减标准建房费15个百分点，优惠合计最多30个百分点、实付最低150%；一级房已在下限时不耗优惠。远程建设成功后需经过起点3次，且不能连续建设同一城市。"
    },
    {
      "id": "H2",
      "direction": "地产",
      "name": "标准化施工",
      "description": "每圈前2次受惠建设优惠标准费用10%，每次最高2000；与其他建设优惠共用总上限。"
    },
    {
      "id": "H3",
      "direction": "地产",
      "name": "连锁经营",
      "description": "拥有至少两座同色非抵押城市，建设该组城市每次优惠10%，最高2000；共用建设优惠总上限。"
    },
    {
      "id": "H4",
      "direction": "投资",
      "name": "稳健股息",
      "description": "实收基础股息额外奖励50%，每圈最多3000；不含城主保留收益。"
    },
    {
      "id": "H5",
      "direction": "投资",
      "name": "分散投资",
      "description": "起点持股至少2座已归属非抵押城市，每座奖励1000，最高4000。"
    },
    {
      "id": "H6",
      "direction": "投资",
      "name": "股东礼遇",
      "description": "向本人持股的他人城市付租金减25%，每笔最高2000，每圈最高4000。"
    },
    {
      "id": "H7",
      "direction": "航线",
      "name": "飞行常客",
      "description": "每圈前2次受惠付费机票减40%，每次最高3000；与航空资讯合计最多减60%，免费航班不耗次数。"
    },
    {
      "id": "H8",
      "direction": "航线",
      "name": "环球旅人",
      "description": "骰子直接到达或主动飞抵机场，每机场每圈奖励1500；选中后本局首次到访另奖1500，换路线不重置。"
    },
    {
      "id": "H9",
      "direction": "航线",
      "name": "航空联营",
      "description": "起点每座自有机场奖励1000，有对应非抵押邻城再加1500，总额最高5000。"
    },
    {
      "id": "H10",
      "direction": "现金与防御",
      "name": "轻资产经营",
      "description": "起点拥有不超过两座城市奖励3000，抵押城市也计数。"
    },
    {
      "id": "H11",
      "direction": "现金与防御",
      "name": "风险准备金",
      "description": "每圈前2次正额城市租金，在股东礼遇后再减30%，每次最高3000；不含机场费或罚金。"
    },
    {
      "id": "H12",
      "direction": "现金与防御",
      "name": "应急资金",
      "description": "一次性奖励10000；初始全员选完后发放，后续换入确认后发放，本局只领一次。"
    }
  ]
};
