'use strict';
const REGIONS = ['非洲', '大洋洲', '欧洲', '美洲', '亚洲'];
const NEWS = {
  boom: { name: '地区旺季', description: '相关地区城市租金增加15%，每笔最多增加3000。' },
  slowdown: { name: '地区淡季', description: '相关地区城市租金减少15%，每笔最多减少3000。' },
  construction: { name: '建设优惠季', description: '每位玩家每轮首次成功建房优惠15%，最多2000。' },
  aviation: { name: '航空促销', description: '付费机票优惠30%，机场通行费不变。' },
  stable: { name: '市场平稳期', description: '市场平稳，已选机遇继续按条件生效。' },
};
const NEWS_V2={
 boom:{name:'地区旺季',description:'相关地区城市租金增加30%，每笔最多增加6000。'},
 slowdown:{name:'地区淡季',description:'相关地区城市租金减少30%，每笔最多减少6000。'},
 construction:{name:'建设优惠季',description:'每位玩家每轮首次成功建房优惠标准费用25%，最多3000；总优惠上限及远程150%底价仍有效。'},
 aviation:{name:'航空促销',description:'付费机票优惠40%；与飞行常客、任务券合计最多60%，机场通行费不变。'},
 stable:{name:'订单扶持期',description:'实际收到经营订单款时额外奖励10%，每次最多150；取消、未收款和封盘不奖励。'}
};
const catalogForWorld=s=>s.worldRevision==='world-news-v2'?NEWS_V2:NEWS;
const OPPORTUNITIES = [
 ['H1','地产','远程施工','每圈一次，等待掷骰时给自有非抵押城市建一级房，无需到达；支付实际费用。'],
 ['H2','地产','标准化施工','每圈首次成功建房优惠原费用10%，最多1500。'],
 ['H3','地产','连锁经营','拥有至少两座同色非抵押城市时，每圈首次合格建房优惠10%，最多1500；所有色组共享一次。'],
 ['H4','投资','稳健股息','实收基础股息额外奖励20%，每圈最多1000；不含城主保留收益。'],
 ['H5','投资','分散投资','起点结算持有三座已归属非抵押城市、每城至少一股，奖励2000。'],
 ['H6','投资','股东礼遇','向本人持股的他人城市付租金减免10%，每笔最多1000，每圈最多2000。'],
 ['H7','航线','飞行常客','每圈首次付费机票优惠原费用20%，最多1500；免费航班不耗次数。'],
 ['H8','航线','环球旅人','选中后骰子首次直接落到每个机场奖励2000，每机场本局一次；不含飞行和机会位移。'],
 ['H9','航线','航空联营','起点结算每组自有机场和对应非抵押邻城奖励1500，每次最多3000。'],
 ['H10','现金与防御','轻资产经营','起点结算拥有不超过两座城市奖励2000，抵押城市也计数。'],
 ['H11','现金与防御','风险准备金','每圈首次正额城市租金，在股东礼遇后再减20%，最多2000；不含机场费或罚金。'],
 ['H12','现金与防御','应急资金','本阶段全体选择结束后一次性奖励6000。'],
].map(([id,direction,name,description])=>Object.freeze({id,direction,name,description}));
const BY_ID = Object.fromEntries(OPPORTUNITIES.map(o=>[o.id,o]));
const DESCRIPTIONS_V2 = [
 '每圈首次主动建设优惠标准建房费15个百分点，与其他建设优惠共用30个百分点上限。',
 '每圈前2次受惠建设优惠标准费用10%，每次最高2000；与其他建设优惠共用总上限。',
 '拥有至少两座同色非抵押城市，建设该组城市每次优惠10%，最高2000；共用建设优惠总上限。',
 '实收基础股息额外奖励50%，每圈最多3000；不含城主保留收益。',
 '起点持股至少2座已归属非抵押城市，每座奖励1000，最高4000。',
 '向本人持股的他人城市付租金减25%，每笔最高2000，每圈最高4000。',
 '每圈前2次受惠付费机票减40%，每次最高3000；与航空资讯合计最多减60%，免费航班不耗次数。',
 '骰子直接到达或主动飞抵机场，每机场每圈奖励1500；选中后本局首次到访另奖1500，换路线不重置。',
 '起点每座自有机场奖励1000，有对应非抵押邻城再加1500，总额最高5000。',
 '起点拥有不超过两座城市奖励3000，抵押城市也计数。',
 '每圈前2次正额城市租金，在股东礼遇后再减30%，每次最高3000；不含机场费或罚金。',
 '一次性奖励10000；初始全员选完后发放，后续换入确认后发放，本局只领一次。',
];
const OPPORTUNITIES_V2=OPPORTUNITIES.map((o,i)=>Object.freeze({...o,description:DESCRIPTIONS_V2[i]}));
const BY_ID_V2=Object.fromEntries(OPPORTUNITIES_V2.map(o=>[o.id,o]));
const OPPORTUNITIES_V4=OPPORTUNITIES_V2.map(o=>o.id==='H1'?Object.freeze({...o,description:'每圈首次受惠远程建设减标准建房费15个百分点，优惠合计最多30个百分点、实付最低150%；一级房已在下限时不耗优惠。远程建设成功后需经过起点3次，且不能连续建设同一城市。'}):o);
const BY_ID_V4=Object.fromEntries(OPPORTUNITIES_V4.map(o=>[o.id,o]));
const STOCK_INVESTMENT=Object.freeze({revision:'stock-investment-v2',totalShares:10,ownerCap:2,externalCap:4,rentalPercent:20,bankPercent:40,ordinaryExitPercent:90,clearExitPercent:50,playerSaleFeePercent:2,offerSeconds:20,turnLimit:{shares:2,cities:1},goLimit:{shares:4,cities:3,perCity:2}});
const catalogFor=s=>require('./managementRules').balanced(s)?BY_ID_V4:require('./managementRules').modern(s)?BY_ID_V2:BY_ID;
module.exports = { STOCK_INVESTMENT, REGIONS, NEWS, NEWS_V2, catalogForWorld, OPPORTUNITIES, BY_ID, OPPORTUNITIES_V2, BY_ID_V2, OPPORTUNITIES_V4, BY_ID_V4, catalogFor };
