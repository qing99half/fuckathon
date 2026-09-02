// 组局器：按当前 state 懒构建下一批卡（阶段推进的核心）
// 文案全部来自 src/data/cards.main.json（mainCopy），本文件只有逻辑
import type { Card, Option, RunState, Judge } from './types';
import type { Rng } from './rng';
import {
  HYPES, PATRONS, TITLE_TIERS, SPONSORS, JUDGES,
  getEventCard, eventToCard, mainCopy, type Sponsor, type JudgeCand,
} from './data';
import { genTeams, initialBoard } from './judge';
import { matchEnding } from './ending';

const C = (id: string, phase: Card['phase'], title: string, body: string, options: Option[], footnote?: string): Card =>
  ({ id, phase, title, body, options, footnote });
const O = (id: string, label: string, effects: Option['effects'], extra?: Partial<Option>): Option =>
  ({ id, label, effects, ...extra });
/** 主线卡：文案从 cards.main.json 取 */
const M = (id: string, phase: Card['phase'], options: Option[], vars?: Record<string, string | number>, footnote?: string): Card => {
  const c = mainCopy(id, vars);
  return C(id, phase, c.title, c.body, options, footnote);
};

const ev = (id: string): Card | null => {
  const e = getEventCard(id);
  return e ? eventToCard(e) : null;
};

// ---------- 工具 ----------
export function govRelated(s: RunState): boolean {
  return s.patronId === 'gov' || s.venueId === 'park';
}
export function hypeOf(s: RunState) { return HYPES.find(h => h.id === s.hypeId); }

export function sponsorAmt(s: RunState, sp: Sponsor): number {
  let amt = sp.money;
  if (s.flags.sponsorCut) amt *= Number(s.flags.sponsorCut);
  const h = hypeOf(s);
  if (h?.sponsorEase === 'hard') amt *= 0.8;
  if (s.rep < 25) amt *= 0.8; // 黑红状态：赞助金额打 8 折
  return Math.round(amt / 1000) * 1000;
}

function sponsorCard(s: RunState, sp: Sponsor): Card {
  const amt = sponsorAmt(s, sp);
  const opts: Option[] = [
    O('sign', `签！+¥${amt.toLocaleString()}`, {
      money: amt, buzz: 5, gov: 5, chaos: sp.chaos,
    }, { preview: `预算 +${amt / 10000}万 · 混乱 +${sp.chaos}`, desc: sp.body }),
    O('refuse', '婉拒', {}, { desc: '“我们再考虑考虑。”' }),
  ];
  if (s.conscience >= 40) {
    opts.splice(1, 0, O('ally', '结盟式谈判（金额减半，条件全免）', {
      money: Math.round(amt / 2 / 1000) * 1000, conscience: 10,
    }, { conscienceMark: true, desc: '把条件一条条划掉。对方居然笑了。' }));
  }
  return C(`SP_${sp.id}`, 'prep', `赞助商上门 · ${sp.name}`, `${sp.body}\n\n小字：${sp.footnote}`, opts);
}

function judgeEligible(s: RunState, j: JudgeCand): boolean {
  if (j.needsPatron && s.patronId !== j.needsPatron) return false;
  if (j.needsBuzz && s.buzz < j.needsBuzz) return false;
  if (j.needsConscience !== undefined && s.conscience < j.needsConscience) return false;
  if (j.needsSponsor && !s.sponsors.some(x => x.id === j.needsSponsor && !x.allied)) return false;
  return true;
}

// ---------- 序幕 ----------

function stageIntro(): Card[] {
  return [
    M('I1', 'intro', [O('next', '……', {})]),
    M('I2', 'intro', [O('next', '继续', {})]),
    M('I3', 'intro', [O('next', '开整', {})]),
  ];
}

function stageHype(s: RunState, rng: Rng): Card[] {
  const picks = rng.weighted(HYPES, 3);
  const easeLabel = { easy: '简单', mid: '中等', luck: '看命', hard: '困难' } as const;
  const opts = picks.map(h => O(`hype_${h.id}`, `${h.name}`, {}, {
    desc: `热度 ${h.heat} · 赞助难度 ${easeLabel[h.sponsorEase]}\n“${h.desc}”`,
  }));
  return [M('HYPE', 'hype', opts)];
}

function stageTitlePick(s: RunState, rng: Rng): Card[] {
  const hype = hypeOf(s)?.name ?? '科技创新';
  const opts = TITLE_TIERS.map(t => {
    const tpl = rng.pick(t.templates);
    const text = tpl.replace('{hype}', hype);
    return O(`title_${t.tier}`, `【${t.label}】${text}`, {}, {
      desc: `声量 +${t.buzz} · 预计到场 ${t.crowd} 人`,
      preview: `声量 +${t.buzz}`,
    });
  });
  return [M('TITLEPICK', 'titlepick', opts)];
}

function stagePatron(): Card[] {
  const opts = PATRONS.map(p => O(`patron_${p.id}`, p.name, {}, {
    desc: p.body, preview: `预算 +${p.money / 10000}万 · 声量 +${p.buzz} · 政商 +${p.gov}`,
  }));
  return [M('PATRON', 'patron', opts)];
}

function stageConfirm(s: RunState): Card[] {
  const hype = hypeOf(s)?.name ?? '';
  const patron = PATRONS.find(p => p.id === s.patronId)?.name ?? '';
  return [M('CONFIRM', 'patron', [O('go', '开整', {})], {
    hype, title: s.titleText, patron, money: s.money.toLocaleString(),
  })];
}

// ---------- 筹备期 ----------

function stageSponsorWave(s: RunState, rng: Rng, wave: number): Card[] {
  let pool: Sponsor[] = [];
  if (wave === 1) pool = SPONSORS.filter(x => x.wave === 1);
  if (wave === 2) {
    const h = hypeOf(s);
    const n = (h && h.heat >= 85) ? 4 : 3;
    pool = rng.shuffle(SPONSORS.filter(x => x.wave === 2)).slice(0, n);
  }
  if (wave === 3) {
    if (s.buzz < 50) return [];
    pool = SPONSORS.filter(x => x.wave === 3);
  }
  if (!pool.length) return [];
  return [M(`WAVE${wave}`, 'prep', [O('next', '接见他们', {})]), ...pool.map(sp => sponsorCard(s, sp))];
}

function stageSponsorSummary(s: RunState): Card[] {
  const n = s.sponsors.length;
  return [M(n === 0 ? 'SP_SUM0' : 'SP_SUMN', 'prep', [O('next', '继续筹备', {})], { n, cm: n * 3 })];
}

function stageVenue(s: RunState): Card[] {
  const govCoupon = s.patronId === 'gov';
  return [M('VENUE', 'prep', [
    O('park', '政府产业园 · 免费', { buzz: 5, gov: 5, anger: 5, expect: 10 }, {
      desc: '容量大、有排面、领导顺路出席。\n附赠：距市区 90 分钟车程、周末中央空调关闭、外卖送不到。',
      preview: '声量 +5 · 政商 +5',
    }),
    O('cowork', '市区联合办公 · ¥30000', { money: -30000, buzz: 10 }, {
      cost: 30000, preview: '预算 -30000 · 声量 +10',
      desc: '交通方便、WiFi 稳定、楼下就是商场。\n附赠：隔壁公司在开全员会，隔音约等于没有。',
    }),
    O('school', '高校教室 · ¥2000', { money: -2000, anger: 10, expect: -5 }, {
      cost: 2000, preview: '预算 -2000',
      desc: '便宜、学生多、氛围纯真。\n附赠：桌椅固定不能拼、插座全班 4 个、晚上 10 点保安赶人。',
    }),
  ], undefined, govCoupon ? '你有管委会给的场地券，但产业园本来就免费——券留作纪念。' : undefined)];
}

function stageMeal(): Card[] {
  return [M('MEAL', 'prep', [
    O('meal_15', '15 元“生命体征维持餐”', { anger: 20 }, { desc: '米饭管够，鸡腿看命。' }),
    O('meal_30', '30 元“有两块肉” · ¥8000', { money: -8000, anger: 5 }, { cost: 8000, preview: '预算 -8000', desc: '选手会拍照发朋友圈，配文：还行。' }),
    O('meal_60', '60 元轻食沙拉+现磨咖啡 · ¥20000', { money: -20000, rep: 5, anger: -10, conscience: 5 }, {
      cost: 20000, preview: '预算 -20000 · 口碑 +5', conscienceMark: true,
      desc: '有选手哭了。不是因为好吃，是因为没想到。',
    }),
  ])];
}

function stageWifi(): Card[] {
  return [M('WIFI', 'prep', [
    O('wifi_bad', '蹭园区公共 WiFi（免费）', {}, { desc: '密码贴在打印机上，打印机没墨了。' }),
    O('wifi_good', '拉专线 · ¥8000', { money: -8000 }, { cost: 8000, preview: '预算 -8000', desc: '稳。' }),
  ])];
}

function stageLodging(): Card[] {
  return [M('LODGE', 'prep', [
    O('lodge_none', '不管', { anger: 15 }, { desc: '走廊尽头的地板，睡过三代选手。' }),
    O('lodge_bag', '睡袋 50 个 · ¥2500', { money: -2500, anger: -5 }, { cost: 2500, preview: '预算 -2500', desc: '睡袋上印着赞助商的 LOGO，梦里都是赋能。' }),
    O('lodge_hotel', '协议酒店补贴 · ¥10000', { money: -10000, rep: 10, anger: -15, conscience: 5 }, {
      cost: 10000, preview: '预算 -10000 · 口碑 +10', conscienceMark: true,
      desc: '酒店距会场 3 公里，但选手觉得你把他们当人了。',
    }),
  ])];
}

function stageJudgeBuild(s: RunState, rng: Rng): Card[] {
  const seatSponsors = s.sponsors.filter(x => x.judgeSeat && !x.allied);
  const auto: Judge[] = [];
  for (const sp of seatSponsors) {
    const jid = sp.id === 'suyun' ? 'exec' : sp.id === 'yuzhou' ? 'kol' : null;
    const j = JUDGES.find(x => x.id === jid);
    if (j && !auto.some(a => a.id === j.id)) auto.push(j);
  }
  const slots = Math.min(5 + auto.length, 9);
  const offered = new Set(auto.map(j => j.id)); // 已出现的评委不再进入后续候选（排重 bug 修复）
  const autoText = auto.length ? `其中 ${auto.length} 席，赞助商已经“安排”好了。` : '全部席位你说了算。';
  const cards: Card[] = [
    M('JHEAD', 'prep', [O('next', '开始摇人', {})], { slots, auto: autoText }),
  ];
  let seatNo = auto.length;
  while (seatNo < slots) {
    let pool = rng.shuffle(JUDGES.filter(j => !j.filler && !offered.has(j.id) && judgeEligible(s, j)));
    if (pool.length < 3) {
      // 池子不够：凑数评委顶上（实习生/主持人客串）
      const fillers = rng.shuffle(JUDGES.filter(j => j.filler && !offered.has(j.id)));
      pool = [...pool, ...fillers];
    }
    const cand = pool.slice(0, 3);
    if (!cand.length) break;
    for (const j of cand) offered.add(j.id);
    seatNo++;
    cards.push(M('JD', 'prep', cand.map(j =>
      O(`judge_${j.id}`, `${j.name}｜${j.tag}`, {}, { desc: j.flavor })), { n: seatNo }));
    cards[cards.length - 1].id = `JD_${seatNo}`;
  }
  return cards;
}

function stagePrepRecap(s: RunState): Card[] {
  const out: Card[] = [];
  // D3 扒皮抢救窗口：声量≥80 且口碑≤30（筹备收官时清算）
  if (s.buzz >= 80 && s.rep <= 30 && !s.flags.fired_D3) {
    s.flags.fired_D3 = true;
    out.push(buildDeathCard(DEATHS.find(d => d.id === 'D3')!));
  }
  out.push(M('PREP_DONE', 'prep', [O('next', '开幕', {})], {
    n: s.sponsors.length, judges: s.judges.length || '待定', chaos: s.chaos,
  }));
  return out;
}

// ---------- 比赛期 ----------

function stageHackOpen(s: RunState, rng: Rng): Card[] {
  const cards: Card[] = [];
  if (govRelated(s)) {
    cards.push(M('E07', 'hack', [
      O('a', '上台提醒', { gov: -5, anger: -5 }),
      O('b', '装死', { gov: 5, anger: 20 }),
      O('c', '宣布“致辞计入开发时间，体现抗压能力”', { buzz: 10, anger: 30, risk: 15 }),
    ]));
  } else {
    cards.push(M('OPEN', 'hack', [O('next', '宣布开赛', {})]));
  }
  if (s.flags.noVolunteers && rng.chance(0.4)) {
    cards.push(M('E06B', 'hack', [O('next', '硬着头皮上', { anger: 10 })]));
  }
  return cards;
}

function stageHackEvents(s: RunState, rng: Rng): Card[] {
  const out: Card[] = [];
  const push = (id: string, p: number) => {
    if (s.firedEvents.includes(id)) return;
    if (rng.chance(p)) { const c = ev(id); if (c) out.push(c); }
  };
  if (s.chaos >= 4) { const c = ev('E19'); if (c) out.push(c); }                     // 环节膨胀必出
  if (!s.wifiGood) push('E08', 0.6);                                                // 断网 60%
  push('E09', s.buzz >= 60 ? 0.8 : 0.5);                                            // 刷奖团
  { const c = ev('E10'); if (c) out.push(c); }                                      // 真神必出
  if (s.sponsors.length > 0) push('E11', Math.min(0.3 + 0.1 * s.sponsors.length, 0.7));
  const badLiving = s.lodging === 'none' || s.mealTier === 15;
  if (badLiving) push('E12', 0.7);
  // D5 盒饭中毒抢救窗口：15 元盒饭 + 35% 发作
  if (s.mealTier === 15 && !s.flags.fired_D5 && rng.chance(0.35)) {
    s.flags.fired_D5 = true;
    out.push(buildDeathCard(DEATHS.find(d => d.id === 'D5')!));
  }
  return out;
}

function stageDeadline(): Card[] {
  return [M('DEADLINE', 'hack', [O('next', '进入评审', {})])];
}

// ---------- 评审期 ----------

function stageJudgeIntro(s: RunState): Card[] {
  const lines = s.judges.map(j => `【${j.name}】“${j.line}”`).join('\n');
  return [M('JINTRO', 'judge', [O('next', '开始路演', {})], { lines })];
}

function stageDemos(s: RunState, rng: Rng): Card[] {
  const total = s.teams.length;
  return s.teams.map((t, i) => {
    const line = rng.chance(0.5)
      ? rng.pick(['作品完成度不错，就看评委懂不懂了', '这队黑眼圈比代码行数多'])
      : rng.pick(['路演顺序好像是按充值排序的', 'PPT 字体统一，教授狂喜']);
    const j = s.judges.length ? rng.pick(s.judges) : null;
    const card = M('DEMO', 'judge', [O('next', i === total - 1 ? '进入评审' : '下一队', {})], {
      i: i + 1, total, team: t.name, project: t.project, desc: t.projectDesc,
      barr: line, judge: j ? `\n${j.name}：“${j.line}”` : '',
    });
    card.id = `DEMO_${i}`;
    return card;
  });
}

function stageRigTable(s: RunState, boardTop: { name: string; score: number }[]): Card[] {
  const debts = s.sponsors.filter(x => x.judgeSeat && !x.allied);
  const boardText = boardTop.map((r, i) => `${i + 1}. ${r.name}（评委分 ${r.score}）`).join('\n');
  const debtText = debts.length
    ? debts.map(d => `· ${d.name}：我家队伍必须夺冠`).join('\n')
    : '（暂无）';
  const opts: Option[] = [
    O('rig_fair', '按分数来', { rep: 15, risk: -10, conscience: 25 }, {
      conscienceMark: true, preview: '口碑 +15',
      desc: '第 7 队夺冠。债主会翻脸，但弹幕会过年。',
    }),
  ];
  if (debts.length > 0) {
    opts.push(O('rig_rigged', `内定：${debts.length >= 2 ? '债主之一' : debts[0].name + '的队伍'}夺冠`, { risk: 40, rep: -5, conscience: -30 }, {
      desc: debts.length >= 2 ? '两位债主在后台同时看着你。' : '人情债，用冠军还。',
    }));
  } else if (s.grifterAction === 'allied') {
    opts.push(O('rig_rigged', '内定：刷奖团夺冠', { risk: 40, rep: -5, conscience: -30 }, { desc: '你答应过他们的。' }));
  }
  opts.push(O('rig_water', '端水：批发奖项 · ¥10000', { money: -10000, rep: -10, chaos: 2, risk: 20, conscience: -10 }, {
    cost: 10000, preview: '预算 -10000 · 口碑 -10',
    desc: '人人都有奖，等于人人都没奖。',
  }));
  return [M('RIG', 'judge', opts, { board: boardText, debts: debtText })];
}

function stageE20(s: RunState): Card[] {
  const debts = s.sponsors.filter(x => x.judgeSeat && !x.allied);
  if (debts.length < 2) return [];
  const [a, b] = debts;
  return [M('E20', 'judge', [
    O('e20_a', `满足${a.name}`, { gov: -15, risk: 15 }, { desc: `${b.name}当场宣布“重新评估合作”。` }),
    O('e20_b', `满足${b.name}`, { gov: -15, risk: 15 }, { desc: `${a.name}发朋友圈：《现在的年轻人，办赛不讲武德》。` }),
    O('e20_c', '都不得罪：设双冠军 · ¥10000', { money: -10000, rep: -10, chaos: 2, risk: 20 }, {
      cost: 10000, preview: '预算 -10000 · 口碑 -10',
      desc: '“总冠军（商业组）”与“总冠军（生态组）”诞生。',
    }),
  ], { a: a.name, b: b.name })];
}

// ---------- 颁奖期 ----------

function stageAward(s: RunState, rng: Rng): Card[] {
  const out: Card[] = [];
  // D2 孙割跑路抢救窗口：币圈金主 + 混乱≥5（颁奖前清算）
  if (s.patronId === 'crypto' && s.chaos >= 5 && !s.flags.fired_D2) {
    s.flags.fired_D2 = true;
    out.push(buildDeathCard(DEATHS.find(d => d.id === 'D2')!));
  }
  if (s.patronId === 'crypto' && !s.flags.cryptoCrash && !s.flags.deathId && rng.chance(0.3)) {
    out.push(M('E23', 'award', [O('next', '……', { money: -60000 })], undefined));
  }
  const naming = s.sponsors.filter(x => x.namingAward && !x.allied).length;
  if (naming >= 3) { const c = ev('E22'); if (c) out.push(c); }
  out.push(M('E16', 'award', [
    O('transfer', '当场转账 · ¥60000', { money: -60000, anger: -10, rep: 15, conscience: 10 }, {
      cost: 60000, preview: '预算 -60000 · 口碑 +15', conscienceMark: true,
      desc: '弹幕集体起立。',
    }),
    O('process', '“走流程”（6 个月）', { anger: 20, rep: -10, risk: 5 }, { desc: '获奖群名改为“讨债群”。' }),
    O('token', '等值代币', { anger: 15, rep: -10, risk: 30 }, { desc: '三个月后价值归零。你们都对，这就是 Web3。' }),
    O('cert', '证书 + 与领导合影', { anger: 15, rep: -15, risk: 10 }, { desc: '证书编号是手写的，合影里领导在中间。' }),
  ]));
  out.push(M('E17', 'award', [
    O('champion', '冠军队', { gov: -5, rep: 5, conscience: 5 }, { conscienceMark: true, preview: '口碑 +5 · 政商 -5', desc: '领导脸上笑，心里记账。' }),
    O('leader', '领导', { gov: 10 }, { preview: '政商 +10', desc: '通稿配图完美。选手在第三排，露出半个头。' }),
    O('ceo', '赞助商 CEO', { gov: 5, rep: -5 }, { preview: '政商 +5 · 口碑 -5', desc: 'CEO 当场决定明年续费。' }),
  ]));
  return out;
}

function stageSettle(s: RunState, repFinal: number): Card[] {
  const comments: string[] = [];
  if (s.buzz >= 80) comments.push('声量 ≥80：全网都知道了。是不是好事另说。');
  if (repFinal <= 30) comments.push('口碑 ≤30：选手群名改成了“避雷信息共享群”。');
  if (s.money < 0) comments.push('预算为负：你为梦想窒息了，字面意思。');
  if (s.gov >= 90) comments.push('政商 ≥90：领导记下了你的名字。这既是好事，也是坏事。');
  // 结局锐评（文案清单批次 6 冻结版）
  const ending = matchEnding(s, repFinal);
  if (ending.comments) comments.push(ending.comments);
  if (!comments.length) comments.push('各方面都很平庸——这在黑客松行业算夸奖。');
  return [M('SETTLE', 'settle', [O('next', '查看结局', {})], {
    money: s.money.toLocaleString(), buzz: s.buzz, gov: s.gov, rep: repFinal,
    comments: comments.join('\n'),
  })];
}

// ---------- 暴毙抢救窗口（D 系列红卡） ----------

interface DeathDef {
  id: string;           // D2~D10
  deathId: string;      // 对应结局 id
  cause: string;        // 溯源标注
  payCost: number; payLabel: string; payFx: Option['effects'];
  submitLabel: string; submitFx: Option['effects'];
  dieRate: number;      // 硬扛死亡率
}

export const DEATHS: DeathDef[] = [
  { id: 'D2', deathId: 'die_sunge', cause: '拿孙割钱的后果', payCost: 40000, payLabel: '自掏腰包垫付 · ¥40000', payFx: { money: -40000 }, submitLabel: '颁奖典礼改食堂举行', submitFx: { buzz: -20 }, dieRate: 0.6 },
  { id: 'D3', deathId: 'die_cognition', cause: '通稿吹过头的后果', payCost: 20000, payLabel: '花钱删帖 · ¥20000', payFx: { money: -20000 }, submitLabel: '发声明"统计口径存在认知偏差"', submitFx: { rep: -10 }, dieRate: 0.6 },
  { id: 'D4', deathId: 'die_runaway', cause: '怨气压不住的后果', payCost: 10000, payLabel: '全场夜宵+打车补贴 · ¥10000', payFx: { money: -10000, anger: -20 }, submitLabel: '广播承诺天亮就发补助', submitFx: { anger: -20, conscience: -10 }, dieRate: 0.7 },
  { id: 'D5', deathId: 'die_meal', cause: '15 元盒饭的报应', payCost: 15000, payLabel: '全场升级 60 元餐标 · ¥15000', payFx: { money: -15000, anger: -20 }, submitLabel: '宣布"明日升级餐标"', submitFx: { anger: -15 }, dieRate: 0.5 },
  { id: 'D6', deathId: 'die_power', cause: '让选手用热点的后果', payCost: 12000, payLabel: '加钱拉专线 · ¥12000', payFx: { money: -12000, anger: -15 }, submitLabel: '强制一半队伍回酒店办公', submitFx: { rep: -15 }, dieRate: 0.65 },
  { id: 'D7', deathId: 'die_leader', cause: '领导面前出洋相的后果', payCost: 8000, payLabel: '立刻清场整改+工作餐叙旧 · ¥8000', payFx: { money: -8000, chaos: -2 }, submitLabel: '解释"这是黑客文化"', submitFx: { gov: -15 }, dieRate: 0.7 },
  { id: 'D8', deathId: 'die_fight', cause: '评委席失控的后果', payCost: 6000, payLabel: '中场茶歇+红包安抚 · ¥6000', payFx: { money: -6000 }, submitLabel: '宣布"评审采用民主集中制"——你一个人集中', submitFx: { rep: -10 }, dieRate: 0.6 },
  { id: 'D9', deathId: 'die_screen', cause: '内定痕迹太多的后果', payCost: 10000, payLabel: '连夜召回+重做全部物料 · ¥10000', payFx: { money: -10000, risk: -20 }, submitLabel: '宣布增加三个"特别奖"平衡', submitFx: { conscience: -10 }, dieRate: 0.65 },
  { id: 'D10', deathId: 'die_ban', cause: '直播放飞的后果', payCost: 15000, payLabel: '关闭直播+公关声明 · ¥15000', payFx: { money: -15000, buzz: -10 }, submitLabel: '主播含泪下播', submitFx: { buzz: -20 }, dieRate: 0.6 },
];

export function buildDeathCard(def: DeathDef): Card {
  const c = mainCopy(def.id);
  return {
    id: def.id, phase: 'any' as Card['phase'], title: c.title, body: c.body,
    cause: def.cause, deathRisk: def.dieRate,
    options: [
      { id: 'pay', label: def.payLabel, cost: def.payCost, effects: def.payFx, preview: `预算 -${def.payCost}`, warn: true },
      { id: 'submit', label: def.submitLabel, effects: def.submitFx, warn: true, desc: '认怂。破财免灾的穷人版。' },
      { id: 'hard', label: '硬扛', effects: {}, warn: true, desc: `死亡率 ${Math.round(def.dieRate * 100)}%。弹幕会记住你的。` },
    ],
  };
}

/** 热搜第一强制事件（risk≥80） */
export function buildE24(): Card {
  const c = mainCopy('E24');
  return {
    id: 'E24', phase: 'any' as Card['phase'], title: c.title, body: c.body, cause: '风险值爆表的后果',
    options: [
      { id: 'apologize', label: '发道歉声明+公关 · ¥20000', cost: 20000, effects: { money: -20000, risk: -30, conscience: 10 }, preview: '预算 -20000', conscienceMark: true },
      { id: 'dead', label: '装死', effects: { rep: -30 }, warn: true, desc: '评论区会替你发言的。' },
      { id: 'lawyer', label: '律师函警告', effects: {}, warn: true, desc: '50% 翻盘，50% 被锤得更死。' },
    ],
  };
}

// ---------- 阶段推进主入口 ----------

/** 根据 state.flags.stage 构建下一批卡。返回 [] 表示流程结束。 */
export function deckNext(s: RunState, rng: Rng, repFinal: number): Card[] {
  const stage = String(s.flags.stage ?? 'intro');
  switch (stage) {
    case 'intro': s.flags.stage = 'hype'; return stageIntro();
    case 'hype': s.flags.stage = 'titlepick'; return stageHype(s, rng);
    case 'titlepick': s.flags.stage = 'patron'; return stageTitlePick(s, rng);
    case 'patron': s.flags.stage = 'confirm'; return stagePatron();
    case 'confirm': s.flags.stage = 'wave1'; return stageConfirm(s);
    case 'wave1': s.flags.stage = 'e01'; return stageSponsorWave(s, rng, 1);
    case 'e01': {
      s.flags.stage = 'wave2';
      if (rng.chance(0.4)) { const c = ev('E01'); return c ? [c] : []; }
      return [];
    }
    case 'wave2': s.flags.stage = 'e02'; return stageSponsorWave(s, rng, 2);
    case 'e02': {
      s.flags.stage = 'wave3';
      const p = 0.3 + (s.titleTier === 3 ? 0.2 : 0);
      if (rng.chance(p)) { const c = ev('E02'); return c ? [c] : []; }
      return [];
    }
    case 'wave3': s.flags.stage = 'spsum'; return stageSponsorWave(s, rng, 3);
    case 'spsum': s.flags.stage = 'e03'; return stageSponsorSummary(s);
    case 'e03': { s.flags.stage = 'e04'; const c = ev('E03'); return c ? [c] : []; }
    case 'e04': { s.flags.stage = 'venue'; const c = ev('E04'); return c ? [c] : []; }
    case 'venue': s.flags.stage = 'e05'; return stageVenue(s);
    case 'e05': {
      s.flags.stage = 'meal';
      if (govRelated(s)) { const c = ev('E05'); return c ? [c] : []; }
      return [];
    }
    case 'meal': s.flags.stage = 'wifi'; return stageMeal();
    case 'wifi': s.flags.stage = 'lodge'; return stageWifi();
    case 'lodge': s.flags.stage = 'e06'; return stageLodging();
    case 'e06': { s.flags.stage = 'judges'; const c = ev('E06'); return c ? [c] : []; }
    case 'judges': s.flags.stage = 'recap'; return stageJudgeBuild(s, rng);
    case 'recap': s.flags.stage = 'hackopen'; return stagePrepRecap(s);
    case 'hackopen': s.flags.stage = 'hackevents'; return stageHackOpen(s, rng);
    case 'hackevents': s.flags.stage = 'deadline'; return stageHackEvents(s, rng);
    case 'deadline': s.flags.stage = 'jintro'; return stageDeadline();
    case 'jintro': {
      s.flags.stage = 'demos';
      // 进入评审期：生成队伍 + 计算评委初榜并缓存
      buildTeams(s, rng);
      // 退赛潮：被挂且未道歉 → 路演队伍 -2（惩罚 ladder）
      if (s.exposed && !s.apologized && s.teams.length > 3) {
        const sorted = [...s.teams].sort((a, b) => a.q - b.q);
        const drop = new Set(sorted.slice(0, 2).map(t => t.id));
        s.teams = s.teams.filter(t => !drop.has(t.id));
        s.flags.withdrawalWave = true;
      }
      // D9 名单危机抢救窗口：怨气≥85 + 内定痕迹≥2
      const traces = [s.grifterAction === 'allied', s.strongTeamHandled === 'bought',
        s.sponsors.some(x => x.judgeSeat && !x.allied), Boolean(s.flags.bribed)].filter(Boolean).length;
      if (s.anger >= 85 && traces >= 2 && !s.flags.fired_D9) {
        s.flags.fired_D9 = true;
        const d9 = buildDeathCard(DEATHS.find(d => d.id === 'D9')!);
        const board0 = initialBoard(s.teams, s.judges, rng);
        s.flags.__board = board0.map(r => ({ name: r.team.name, score: r.score, id: r.team.id })) as unknown as string;
        return [d9, ...stageJudgeIntro(s)];
      }
      const board = initialBoard(s.teams, s.judges, rng);
      s.flags.__board = board.map(r => ({ name: r.team.name, score: r.score, id: r.team.id })) as unknown as string;
      return stageJudgeIntro(s);
    }
    case 'demos': s.flags.stage = 'e13'; return stageDemos(s, rng);
    case 'e13': { s.flags.stage = 'e14'; const c = ev('E13'); return c ? [c] : []; }
    case 'e14': {
      s.flags.stage = 'e15';
      const hasKol = s.judges.some(j => j.id === 'kol');
      if (hasKol && rng.chance(0.3)) { const c = ev('E14'); return c ? [c] : []; }
      return [];
    }
    case 'e15': {
      s.flags.stage = 'e21';
      const hasStreamer = s.judges.some(j => j.streamer);
      if (hasStreamer && rng.chance(0.4)) { const c = ev('E15'); return c ? [c] : []; }
      return [];
    }
    case 'e21': {
      s.flags.stage = 'rig';
      if (s.chaos >= 6) { const c = ev('E21'); return c ? [c] : []; }
      return [];
    }
    case 'rig': {
      s.flags.stage = s.sponsors.filter(x => x.judgeSeat && !x.allied).length >= 2 ? 'e20wait' : 'award';
      const board = (s.flags.__board ?? []) as unknown as { name: string; score: number }[];
      return stageRigTable(s, board.slice(0, 3));
    }
    case 'e20wait': s.flags.stage = 'award'; return []; // E20 由 choose() 在选 rig_rigged 时插入
    case 'award': s.flags.stage = 'settle'; return stageAward(s, rng);
    case 'settle': s.flags.stage = 'done'; return stageSettle(s, repFinal);
    default: return [];
  }
}

/** E20 卡导出给引擎 choose() 用 */
export function buildE20(s: RunState): Card[] { return stageE20(s); }
/** 队伍生成导出 */
export function buildTeams(s: RunState, rng: Rng) {
  s.teams = genTeams(s, rng);
  return s.teams;
}
