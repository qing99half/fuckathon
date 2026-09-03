// 契约账簿：前期的每个选择都在这里记账，到点强制兑现成必答卡
// 没有"无事发生"的选项——每笔钱都要当面还
// 文案为草稿 v1，待 owner 过审
import type { Card, Debt, DebtPhase, Option, RunState } from './types';
import type { Rng } from './rng';
import type { Sponsor } from './data';

const O = (id: string, label: string, effects: Option['effects'], extra?: Partial<Option>): Option =>
  ({ id, label, effects, ...extra });

// ---------- 记账 ----------

export function patronDebts(pid: string): Debt[] {
  if (pid === 'gov') return [{ id: 'patron_gov_speech', source: '区里数字经济专班', phase: 'opening', weight: 10 }];
  if (pid === 'corp') return [
    { id: 'patron_corp_list', source: '福报云 PR 部', phase: 'judge', weight: 8 },
    { id: 'patron_corp_api', source: '福报云 PR 部', phase: 'hack', weight: 7 },
  ];
  if (pid === 'crypto') return [{ id: 'patron_crypto_chain', source: '孙割币交所', phase: 'award', weight: 10 }];
  return [];
}

export function sponsorDebts(sp: Sponsor, allied: boolean): Debt[] {
  const out: Debt[] = [];
  const light = allied || undefined;
  if (sp.id === 'suyun') out.push({ id: 'sp_suyun_api', source: sp.name, phase: 'hack', weight: 8, light });
  if (sp.judgeSeat) out.push({ id: `sp_seat_${sp.id}`, source: sp.name, phase: 'judge', weight: 6, light });
  if (sp.id === 'pff') out.push({ id: 'sp_pff_meal', source: sp.name, phase: 'hack', weight: 8, light });
  if (sp.id === 'xuewang') out.push({ id: 'sp_xuewang_logo', source: sp.name, phase: 'judge', weight: 6, light });
  if (sp.id === 'jianli') out.push({ id: 'sp_jianli_privacy', source: sp.name, phase: 'judge', weight: 5, light });
  return out;
}

export function venueDebts(venueId: string): Debt[] {
  const names: Record<string, string> = { park: '政府产业园', cowork: '市区联合办公', school: '高校教室' };
  if (!names[venueId]) return [];
  return [{ id: `venue_${venueId}`, source: `场地「${names[venueId]}」`, phase: 'hack', weight: 6 }];
}

export function titleDebts(tier: number): Debt[] {
  return tier === 3 ? [{ id: 'title_rectify', source: '离谱 Title', phase: 'hack', weight: 7 }] : [];
}

export function rigFlipCard(): Card {
  return buildDebtCard({ id: 'rig_flip', source: '内定冠军', phase: 'judge', weight: 8 });
}

// ---------- 抽卡兑现 ----------

/** 进入某个窗口时，从账簿按权重抽 cap 张未兑现的账，标记已兑现并返回强制卡 */
export function drawDebts(s: RunState, rng: Rng, phase: DebtPhase, cap: number): Card[] {
  const due = s.debts.filter(d => d.phase === phase && !s.flags[`debt_${d.id}`]);
  if (!due.length) return [];
  const picked = rng.weighted(due, Math.min(cap, due.length));
  return picked.map(d => {
    s.flags[`debt_${d.id}`] = true;
    return buildDebtCard(d, s);
  });
}

// ---------- 强制卡构建（轻账：惩罚减半、不翻脸） ----------

function buildDebtCard(d: Debt, s?: RunState): Card {
  const cause = `${d.source}带来的必然后果`;
  const L = d.light; // 轻账
  switch (d.id) {
    case 'patron_gov_speech':
      return {
        id: 'DBT_GOV', phase: 'hack', cause,
        title: '领导致辞（进行时）',
        body: '领导拿着三页纸上台了。四十分钟过去，第一页还没讲完。台下选手的电脑电量和耐心同步下降。\n通稿里"新质生产力"已出现五次——要求是三次，超发的两次是领导现场加的。',
        options: [
          O('a', '让他讲完，掌声要热烈', { anger: 8, buzz: 5, gov: 5 }, { desc: '领导很满意，说要"年年办"。' }),
          O('b', '主持人掐表救场', { gov: -15, risk: 5, anger: -3 }, { warn: true, desc: '领导的笑容凝固在第 41 分钟。' }),
        ],
      };
    case 'patron_corp_list':
      return {
        id: 'DBT_CORP', phase: 'judge', cause,
        title: '获奖名单"统筹考虑"',
        body: '福报云 PR 部发来一份"建议获奖名单"，附件 12MB。名单上全是自家生态的项目，懂？',
        options: [
          O('a', '按名单来', { risk: 10, conscience: -10 }, { warn: true, desc: '公平这两个字，先从字典里统筹掉。' }),
          O('b', '婉拒', { money: -8000, gov: -10, risk: -5 }, { preview: '预算 -8000', desc: '对方回了一个"好的"。你仿佛听见了尾款粉碎的声音。' }),
        ],
      };
    case 'patron_corp_api': {
      const cut = Math.round(64000 * 0.1);
      return {
        id: 'DBT_CORP_API', phase: 'hack', cause,
        title: '赛题云绑定',
        body: '福报云 PR 部跟进赛题进度，合同第 1 条加粗标红：必须用他们家云 API。选手问为什么必须用，你说不出话。',
        options: [
          O('a', '坚持绑定', { anger: 8, buzz: -2 }, { desc: 'PR 部发来一面电子锦旗：《优秀合作伙伴》。' }),
          O('b', '悄悄放开限制', { money: -cut, risk: -5 }, { preview: `预算 -${cut}`, warn: true, desc: '对方"注意到了"。扣款通知比感谢信来得快。' }),
        ],
      };
    }
    case 'patron_crypto_chain':
      return {
        id: 'DBT_CRYPTO', phase: 'award', cause,
        title: '上链时刻',
        body: '孙割币交所的人堵在后台："宣布吧——所有获奖项目将部署到本链。"稿子替你写好了，还附赠一版英文的。',
        options: [
          O('a', '宣布', { buzz: 10, risk: 15, conscience: -15 }, { warn: true, desc: '直播间弹幕齐刷"RUN"。' }),
          O('b', '装死', { risk: 10, buzz: -5 }, { desc: '对方当场发推："合作方临时怯场，生态依然繁荣。"' }),
        ],
      };
    case 'sp_suyun_api': {
      const cut = Math.round(40000 * 0.3);
      return {
        id: 'DBT_SUYUN', phase: 'hack', cause,
        title: '赛题绑定投诉',
        body: '选手发现赛题必须调鹅厂云 API，工单群炸了："这是黑客松还是 SDK 培训？"有人把赛题文档挂上了小红书。',
        options: [
          O('a', '坚持绑定', { anger: L ? 5 : 10, buzz: -3 }, { desc: '市场总监发来大拇指表情。' }),
          L
            ? O('b', '悄悄放开限制', { buzz: -3 }, { desc: '结盟方睁一只眼闭一只眼。' })
            : O('b', '悄悄放开限制', { money: -cut, risk: -5 }, { preview: `预算 -${cut}`, warn: true, desc: '总监把大拇指收回去了。' }),
        ],
      };
    }
    case 'sp_seat_suyun':
    case 'sp_seat_yuzhou':
      return {
        id: `DBT_SEAT_${d.id}`, phase: 'judge', cause,
        title: '"关照一下"',
        body: `${d.source}的评委把你拉到一边："7 号队是我们生态的，提问环节，你懂的。"`,
        options: [
          O('a', '安排', { risk: L ? 4 : 8, conscience: -8 }, { warn: true, desc: '公平又往后挪了一位。' }),
          L
            ? O('b', '拒绝', { risk: 2 }, { desc: '结盟方耸耸肩："行吧，试试就试试。"' })
            : O('b', '拒绝', { risk: 6 }, { desc: '对方冷笑："尾款的事，再说。"' }),
        ],
      };
    case 'sp_pff_meal':
      return {
        id: 'DBT_PFF', phase: 'hack', cause,
        title: '满 25 减 2',
        body: '丑团外卖的"独家供餐"落地了：全场满 25 减 2。选手算账发现比原价还贵 1 块 5，截图已经 200 转。',
        options: [
          O('a', '自掏腰包补差价 · ¥2000', { money: -2000, anger: -5, risk: -2 }, { cost: 2000, preview: '预算 -2000', conscienceMark: true, desc: '选手第一次觉得主办方像个人。' }),
          O('b', '装死', { anger: L ? 4 : 8, buzz: -5 }, { desc: '"满 25 减 2"成了本届赛事的吉祥物。' }),
        ],
      };
    case 'sp_xuewang_logo':
      return {
        id: 'DBT_XUEWANG', phase: 'judge', cause,
        title: 'LOGO 检查',
        body: '拼夕夕的人拿着清单挨个检查路演 PPT 首页的 LOGO。有三支队没放。对方看向你。',
        options: [
          O('a', '强制执行', { anger: L ? 3 : 6 }, { desc: '三支队伍的 PPT 首页 now featuring 砍一刀。' }),
          L
            ? O('b', '放过他们', { buzz: -2 }, { desc: '结盟方说"下次一定"，语气还算真诚。' })
            : O('b', '放过他们', { money: -3200 }, { preview: '预算 -3200', warn: true, desc: '对方说"下次一定"的时候，眼神像在说"没有下次"。' }),
        ],
      };
    case 'sp_jianli_privacy':
      return {
        id: 'DBT_JIANLI', phase: 'judge', cause,
        title: '收货地址门',
        body: '有选手发现报名时填的收货地址，出现在了狗东物流的营销短信里。当事人正在现场直播维权。\n你望向角落的"快递驿站"——当时你真以为那是个便民设施。',
        options: [
          O('a', '道歉 + 当场销毁数据 · ¥1000', { money: -1000, buzz: -3, anger: -5, risk: -5 }, { cost: 1000, preview: '预算 -1000', conscienceMark: true, desc: '直播标题从"维权"改成了"后续"。' }),
          O('b', '装死', { risk: L ? 5 : 10 }, { warn: true, desc: '直播标题从"维权"改成了"维权（二）"。' }),
        ],
      };
    case 'venue_park':
      return {
        id: 'DBT_VENUE_PARK', phase: 'hack', cause,
        title: '汗蒸模式',
        body: '周末的产业园，中央空调按政策关闭。六十台笔记本的散热扇和六十个选手一起哀嚎。最近的外卖在 9 公里外。',
        options: [
          O('a', '租移动空调 + 冰饮 · ¥3000', { money: -3000, anger: -8 }, { cost: 3000, preview: '预算 -3000', conscienceMark: true, desc: '冷气来的那一刻，你听到了欢呼。' }),
          O('b', '发藿香正气水', { anger: 6, buzz: -2 }, { desc: '预制黑客松，预制中暑。' }),
        ],
      };
    case 'venue_cowork':
      return {
        id: 'DBT_VENUE_COWORK', phase: 'hack', cause,
        title: '隔壁全员会',
        body: '联合办公的隔壁公司在开季度全员会，CEO 的咆哮穿过石膏板墙："今年不盈利就都别干了！"选手们表示感同身受。',
        options: [
          O('a', '租降噪耳机 · ¥2000', { money: -2000, anger: -5 }, { cost: 2000, preview: '预算 -2000', desc: '世界安静了，除了隔壁 CEO 的余音。' }),
          O('b', '忍着', { anger: 6 }, { desc: '有选手把咆哮声采样进了自己的项目演示。' }),
        ],
      };
    case 'venue_school':
      return {
        id: 'DBT_VENUE_SCHOOL', phase: 'hack', cause,
        title: '保安赶人',
        body: '晚上十点，教学楼保安准时出现："锁门了锁门了。"黑客松才刚刚进入状态。',
        options: [
          O('a', '给保安塞加班费 · ¥1500', { money: -1500, anger: -3 }, { cost: 1500, preview: '预算 -1500', conscienceMark: true, desc: '保安大叔表示理解，并分享了他儿子的考研焦虑。' }),
          O('b', '转移到大厅继续', { anger: 8 }, { desc: '大厅的插座比教室还少。' }),
        ],
      };
    case 'title_rectify':
      return {
        id: 'DBT_TITLE', phase: 'hack', cause,
        title: '整改通知',
        body: '网信办来电：你们的比赛名字"过于夸张"，建议整改。电话那头的语气很克制——克制的意思是已经截图了。',
        options: [
          O('a', '连夜改名', { buzz: -8 }, { desc: '新名字朴素得像一份会议纪要。' }),
          O('b', '硬扛', { risk: 12 }, { warn: true, desc: '你把这通电话当成了诈骗。' }),
        ],
      };
    case 'rig_flip':
      return {
        id: 'DBT_RIG', phase: 'judge', cause,
        title: '内定队路演翻车',
        body: '内定冠军队上台了。PPT 第三页卡住，demo 闪退，主讲人开始背稿——背的是另一份稿。全场冷场，评委低头玩手机。',
        options: [
          O('a', '硬颁', { risk: 15 }, { warn: true, desc: '公平是奢侈品，你已经戒了。' }),
          O('b', '临时换冠军', { gov: -10, risk: 10 }, { warn: true, desc: '电话那头沉默了很久。' }),
        ],
      };
    default:
      return { id: `DBT_${d.id}`, phase: 'hack', cause, title: '账单到了', body: '前期的选择来收账了。', options: [O('a', '认账', {})] };
  }
}

/** 账簿概览（结算页/调试可用） */
export function debtSummary(s: RunState): string {
  const total = s.debts.length;
  const fired = s.debts.filter(d => s.flags[`debt_${d.id}`]).length;
  return `${fired}/${total}`;
}
