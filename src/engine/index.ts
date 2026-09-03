// 引擎主类：newGame / choose → ViewEvent[]，不碰 DOM
import type { Card, RunState, ViewEvent } from './types';
import { Rng, hashSeed, makeSeed } from './rng';
import { applyEffects, applyFlags } from './effects';
import { deckNext, buildE20, sponsorAmt, govRelated, DEATHS, buildDeathCard, buildE24 } from './deck';
import { matchEnding, repFinalOf } from './ending';
import { SPONSORS, PATRONS, TITLE_TIERS, JUDGES, BARRAGES, HYPES, getEventCard, eventToCard, mainCopy } from './data';

export class GameEngine {
  state: RunState;
  private rng: Rng;

  constructor(seed?: string) {
    const sd = seed || makeSeed();
    this.rng = new Rng(hashSeed(sd));
    this.state = {
      seed: sd, rngState: hashSeed(sd), phase: 'title',
      money: 0, buzz: 0, gov: 0, rep: 50, chaos: 0,
      anger: 0, risk: 0, conscience: 50, expect: 0,
      hypeId: '', titleTier: 0, titleText: '', patronId: '',
      venueId: '', mealTier: 0, wifiGood: false, lodging: '',
      sponsors: [], judges: [], judgeSlots: 0, teams: [],
      rigChoice: '', awardMode: '', exposed: false, apologized: false,
      strongTeamHandled: '', grifterAction: '',
      log: [], queue: [], firedEvents: [],
      flags: { stage: 'intro' },
    };
  }

  /** 开局：返回首批事件（含第一张卡） */
  start(): ViewEvent[] {
    const ev: ViewEvent[] = [{ kind: 'phase', phase: 'intro' }];
    this.refill(ev);
    return ev;
  }

  currentCard(): Card | null { return this.state.queue[0] ?? null; }

  choose(optionId: string): ViewEvent[] {
    const s = this.state;
    const card = s.queue[0];
    const out: ViewEvent[] = [];
    if (!card) return out;
    const opt = card.options.find(o => o.id === optionId);
    if (!opt) return out;
    if (opt.cost && opt.cost > s.money) {
      out.push({ kind: 'toast', text: '预算不足' });
      return out;
    }
    const prevPhase = card.phase;
    if (card.id === 'TITLEPICK') s.titleText = opt.label.replace(/^【[^】]*】/, '');
    s.queue.shift();
    s.log.push({ cardId: card.id, optionId });
    s.firedEvents.push(card.id);

    // 1. 通用 effects
    const deltas = applyEffects(s, opt.effects);
    applyFlags(s, opt.setFlags);
    for (const d of deltas) out.push({ kind: 'stat', key: d.key, delta: d.delta });

    // 2. 特殊逻辑
    this.special(card.id, optionId, out);

    // 3. 联动弹幕
    const linkedKey = this.linkedKeyOf(card.id, optionId);
    if (linkedKey && BARRAGES.linked[linkedKey]) {
      out.push({ kind: 'barrage', lines: BARRAGES.linked[linkedKey] });
    }

    // 4. 环境弹幕（比赛/评审期，按怨气档）
    if ((s.phase === 'hack' || s.phase === 'judge') && card.phase !== 'ending') {
      const tier = s.anger >= 70 ? 'C' : s.anger >= 40 ? 'B' : 'A';
      const n = this.rng.int(1, 2);
      const lines: string[] = [];
      for (let i = 0; i < n; i++) lines.push(this.rng.pick(BARRAGES[tier]));
      out.push({ kind: 'barrage', lines });
    }

    // 5. 翻车检定：只在本选项提升了翻车风险、或颁奖终判（E17）时触发
    //    p = risk/100（直播评委在场 ×1.5）——概率与行为强相关
    if (!s.exposed && card.id !== 'E18' && card.phase !== 'settle' && card.phase !== 'ending' && card.phase !== 'intro') {
      const riskRaised = (opt.effects?.risk ?? 0) > 0;
      const isFinalCall = card.id === 'E17';
      if (riskRaised || isFinalCall) {
        const mult = s.judges.some(j => j.streamer) ? 1.5 : 1;
        if (this.rng.next() * 100 < s.risk * mult) {
          const e18 = getEventCard('E18');
          if (e18 && !s.firedEvents.includes('E18')) {
            s.queue.unshift(eventToCard(e18));
            out.push({ kind: 'riskflash', level: 'red' });
            out.push({ kind: 'sfx', name: 'alarm' });
          }
        }
      }
    }

    // 6. 怨气预警（比赛期，最后一次补救机会）
    if (s.phase === 'hack' && s.anger >= 70 && !s.flags.warned) {
      s.flags.warned = true;
      const w = mainCopy('W01');
      s.queue.unshift({
        id: 'W01', phase: 'hack', title: w.title, body: w.body, cause: '怨气压不住的后果',
        options: [
          { id: 'a', label: '现场发补贴 · ¥3000', cost: 3000, preview: '预算 -3000', conscienceMark: true, effects: { money: -3000, anger: -15, conscience: 5 } },
          { id: 'b', label: '让主持人讲个笑话', effects: { risk: 5 }, warn: true },
        ],
      });
    }

    // 6.5 暴毙抢救窗口触发（条件满足 → 红卡插队；硬扛才 roll 死）
    this.checkDeathTriggers(card.id, optionId, out);

    // 6.6 热搜第一强制事件（risk≥80，一局一次）
    if (s.risk >= 80 && !s.flags.e24 && !s.exposed && !s.flags.deathId) {
      s.flags.e24 = true;
      s.queue.unshift(buildE24());
      out.push({ kind: 'riskflash', level: 'red' });
      out.push({ kind: 'sfx', name: 'alarm' });
    }

    // 7. 推进
    this.refill(out);

    // 8. 阶段/场景切换事件
    const cur = this.currentCard();
    if (cur && cur.phase !== prevPhase) {
      s.phase = cur.phase;
      out.push({ kind: 'phase', phase: s.phase });
      if (s.phase === 'hack') {
        out.push({ kind: 'scene', scene: 'hack' });
        out.push({ kind: 'barrage', lines: [this.rng.pick(BARRAGES.A), this.rng.pick(BARRAGES.A)] });
      }
      if (s.phase === 'settle') out.push({ kind: 'scene', scene: 'ui' });
    }
    return out;
  }

  /** 队列空 → 构建下一批卡；流程尽 → 结局 */
  private refill(out: ViewEvent[]) {
    const s = this.state;
    let guard = 0;
    while (s.queue.length === 0 && guard++ < 30) {
      if (String(s.flags.stage) === 'done') {
        const repFinal = repFinalOf(s);
        const ending = matchEnding(s, repFinal);
        s.endingId = ending.id;
        s.phase = 'ending';
        out.push({ kind: 'phase', phase: 'ending' });
        out.push({ kind: 'ending', endingId: ending.id });
        return;
      }
      const cards = deckNext(s, this.rng, repFinalOf(s));
      s.queue.push(...cards);
    }
    const cur = this.currentCard();
    if (cur) {
      // 良心 <20：良心选项（绿点）从卡面消失
      if (s.conscience < 20 && cur.options.length > 1 && cur.options.some(o => o.conscienceMark)) {
        cur.options = cur.options.filter(o => !o.conscienceMark);
      }
      // 退赛潮提示
      if (cur.id === 'JINTRO' && s.flags.withdrawalWave && !s.flags.withdrawalToasted) {
        s.flags.withdrawalToasted = true;
        out.push({ kind: 'toast', text: '退赛潮：两支队伍连夜退赛，路演缩水' });
      }
      // 卡面入场附带回响
      if (cur.id === 'SP_SUM' && s.sponsors.length === 0 && BARRAGES.linked.sponsor_0) {
        out.push({ kind: 'barrage', lines: BARRAGES.linked.sponsor_0 });
      }
      out.push({ kind: 'card', card: cur });
    }
  }

  // ---------- 特殊选项逻辑 ----------

  private special(cardId: string, optionId: string, out: ViewEvent[]) {
    const s = this.state;

    if (cardId === 'HYPE') {
      s.hypeId = optionId.replace('hype_', '');
      const h = HYPES.find(x => x.id === s.hypeId);
      if (h) {
        if (h.heat >= 85) this.fx(out, { buzz: 10 });
        if (h.id === 'metaverse') this.fx(out, { buzz: -10 });
      }
      return;
    }
    if (cardId === 'TITLEPICK') {
      const tier = Number(optionId.replace('title_', ''));
      const t = TITLE_TIERS.find(x => x.tier === tier);
      if (t) {
        s.titleTier = tier;
        s.flags.crowd = t.crowd;
        this.fx(out, { buzz: t.buzz, expect: t.expect });
      }
      return;
    }
    if (cardId === 'PATRON') {
      const pid = optionId.replace('patron_', '');
      s.patronId = pid;
      const p = PATRONS.find(x => x.id === pid);
      if (p) this.fx(out, { money: p.money, buzz: p.buzz, gov: p.gov });
      if (pid === 'crypto') s.flags.cryptoTail = true;
      return;
    }
    if (cardId.startsWith('SP_')) {
      const sp = SPONSORS.find(x => `SP_${x.id}` === cardId);
      if (!sp) return;
      if (optionId === 'refuse') {
        s.flags.refused = Number(s.flags.refused ?? 0) + 1; // 连拒 3 家：第 3 波不再上门
        return;
      }
      const amt = sponsorAmt(s, sp);
      const allied = optionId === 'ally';
      const deal = {
        id: sp.id, name: sp.name, money: allied ? Math.round(amt * 0.6 / 1000) * 1000 : amt,
        chaos: allied ? 1 : sp.chaos, demands: [],
        judgeSeat: allied ? false : sp.judgeSeat,
        namingAward: allied ? false : sp.namingAward,
        allied,
      };
      s.sponsors.push(deal);
      const n = s.sponsors.length;
      if (n === 3 && BARRAGES.linked.sponsor_3) out.push({ kind: 'barrage', lines: BARRAGES.linked.sponsor_3 });
      if (n === 5 && BARRAGES.linked.sponsor_5) out.push({ kind: 'barrage', lines: BARRAGES.linked.sponsor_5 });
      return;
    }
    if (cardId.startsWith('JD_')) {
      if (optionId === 'judge_none') { s.flags.emptySeats = Number(s.flags.emptySeats ?? 0) + 1; return; }
      const found = JUDGES.find(x => `judge_${x.id}` === optionId);
      let j = found && !s.judges.some(x => x.id === found.id) ? found : undefined; // 防重复：换第一个未被选的可用人
      if (!j) {
        const pool = JUDGES.filter(x => !s.judges.some(y => y.id === x.id)
          && !(x.needsPatron && x.needsPatron !== s.patronId)
          && !(x.needsBuzz && x.needsBuzz > s.buzz)
          && !(x.needsConscience !== undefined && x.needsConscience > s.conscience)
          && !(x.needsSponsor && !s.sponsors.some(sp => sp.id === x.needsSponsor && !sp.allied)));
        j = pool[0];
      }
      if (j) s.judges.push(j);
      return;
    }
    if (cardId === 'VENUE') s.venueId = optionId;
    if (cardId === 'MEAL') {
      s.mealTier = optionId === 'meal_15' ? 15 : optionId === 'meal_30' ? 30 : 60;
      return;
    }
    if (cardId === 'WIFI') { s.wifiGood = optionId === 'wifi_good'; return; }
    if (cardId === 'LODGE') { s.lodging = optionId.replace('lodge_', ''); return; }

    if (cardId === 'E11' && optionId === 'c') {
      // 尾款 50% 概率取消
      if (this.rng.chance(0.5) && s.sponsors.length) {
        const cut = Math.round(s.sponsors.reduce((sum, x) => sum + x.money, 0) * 0.3 / 1000) * 1000;
        this.fx(out, { money: -cut });
        out.push({ kind: 'toast', text: `尾款 ¥${cut.toLocaleString()} 被取消` });
      }
      return;
    }

    if (cardId === 'RIG') {
      s.rigChoice = optionId === 'rig_fair' ? 'fair' : optionId === 'rig_rigged' ? 'rigged' : 'water';
      const debts = s.sponsors.filter(x => x.judgeSeat && !x.allied);
      if (optionId === 'rig_fair') {
        for (const d of debts) {
          if (this.rng.chance(0.5)) {
            this.fx(out, { gov: -15 });
            out.push({ kind: 'toast', text: `${d.name} 翻脸：政商 -15` });
          } else {
            const cut = Math.round(d.money * 0.3 / 1000) * 1000;
            this.fx(out, { money: -cut });
            out.push({ kind: 'toast', text: `${d.name} 尾款 ¥cut 取消`.replace('¥cut', `¥${cut.toLocaleString()}`) });
          }
        }
        if (!debts.length) out.push({ kind: 'toast', text: '没有债主。公正来得很轻松。' });
      }
      if (optionId === 'rig_rigged') {
        if (debts.length >= 2) {
          s.queue.unshift(...buildE20(s));
        } else {
          s.rigTarget = debts[0]?.id ?? 'grifter';
        }
      }
      if (optionId === 'rig_water') s.flags.awardInflation = true;
      return;
    }

    if (cardId === 'E20') {
      const debts = s.sponsors.filter(x => x.judgeSeat && !x.allied);
      const [a, b] = debts;
      if (optionId === 'e20_a' && a && b) {
        s.rigTarget = a.id;
        const cut = Math.round(b.money * 0.3 / 1000) * 1000;
        this.fx(out, { money: -cut });
      } else if (optionId === 'e20_b' && a && b) {
        s.rigTarget = b.id;
        const cut = Math.round(a.money * 0.3 / 1000) * 1000;
        this.fx(out, { money: -cut });
      } else {
        s.rigTarget = 'both';
        s.flags.awardInflation = true;
      }
      return;
    }

    if (cardId === 'E16') {
      s.awardMode = optionId; // transfer / process / token / cert
      if (optionId === 'process') s.flags.delayedPay = true;
      return;
    }
    if (cardId === 'E23') s.flags.cryptoCrash = true;

    // 暴毙抢救卡结算
    const dDef = DEATHS.find(d => d.id === cardId);
    if (dDef) {
      if (optionId === 'hard') {
        if (this.rng.next() < dDef.dieRate) {
          // 死亡：清空队列直接进结局
          s.flags.deathId = dDef.deathId;
          s.queue.length = 0;
          s.flags.stage = 'done';
          out.push({ kind: 'riskflash', level: 'red' });
          out.push({ kind: 'sfx', name: 'alarm' });
        } else {
          this.fx(out, { rep: 5, buzz: 5 });
          out.push({ kind: 'toast', text: '你赌赢了。这次。' });
        }
      } else {
        out.push({ kind: 'toast', text: optionId === 'pay' ? '破财免灾。钱没了，命还在。' : '认怂保平安。姿态放低，事情就过去了。' });
      }
      return;
    }

    // 热搜第一：律师函 50/50
    if (cardId === 'E24' && optionId === 'lawyer') {
      if (this.rng.chance(0.5)) {
        this.fx(out, { rep: 10, buzz: 5, risk: -40 });
        out.push({ kind: 'toast', text: '对方删帖道歉。律师函居然有用。' });
      } else {
        this.fx(out, { rep: -20, risk: 10 });
        out.push({ kind: 'toast', text: '律师函被做成表情包，转发 3 万。' });
      }
      return;
    }
  }

  /** 暴毙抢救窗口触发（选项驱动型：D4/D6/D7/D8/D10） */
  private checkDeathTriggers(cardId: string, optionId: string, out: ViewEvent[]) {
    const s = this.state;
    if (s.flags.deathId) return;
    const pushD = (id: string) => {
      if (s.flags[`fired_${id}`]) return;
      s.flags[`fired_${id}`] = true;
      const def = DEATHS.find(d => d.id === id)!;
      s.queue.unshift(buildDeathCard(def));
      out.push({ kind: 'riskflash', level: 'yellow' });
      out.push({ kind: 'sfx', name: 'alarm' });
    };
    if (cardId === 'W01' && optionId === 'b' && s.anger >= 90) pushD('D4');
    if (cardId === 'E08' && optionId === 'b') pushD('D6');
    if (cardId === 'E19' && s.patronId === 'gov' && s.chaos >= 6) pushD('D7');
    if (cardId === 'E21' && optionId === 'c' && s.chaos >= 6) pushD('D8');
    if (cardId === 'E15' && optionId === 'b' && s.buzz >= 70) pushD('D10');
  }
  /** 联动弹幕键映射 */
  private linkedKeyOf(cardId: string, optionId: string): string | null {
    if (cardId === 'MEAL' && optionId === 'meal_15') return 'meal_15';
    if (cardId === 'MEAL' && optionId === 'meal_60') return 'meal_60';
    if (cardId === 'WIFI' && optionId === 'wifi_bad') return 'wifi_bad';
    if (cardId === 'LODGE' && optionId === 'lodge_none') return 'lodge_none';
    if (cardId === 'E07' && optionId === 'b') return 'speech_dead';
    if (cardId === 'E08' && optionId === 'b') return 'wifi_hotspot';
    if (cardId === 'E16' && optionId === 'token') return 'award_token';
    if (cardId === 'RIG') return optionId; // rig_fair / rig_rigged / rig_water
    if (cardId === 'E19') return optionId === 'b' ? 'bloat_cut' : 'bloat';
    if (cardId === 'E22' && optionId === 'a') return 'inflation';
    if (/^D\d+$/.test(cardId) && optionId === 'hard') return 'hard_carry';
    return null;
  }

  private fx(out: ViewEvent[], effects: Parameters<typeof applyEffects>[1]) {
    const deltas = applyEffects(this.state, effects);
    for (const d of deltas) out.push({ kind: 'stat', key: d.key, delta: d.delta });
  }
}

export { makeSeed, repFinalOf, matchEnding, govRelated };
