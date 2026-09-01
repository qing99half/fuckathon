// 内容数据装载：JSON → 类型化常量
import hypesJson from '../data/hypes.json';
import patronsJson from '../data/patrons.json';
import titlesJson from '../data/titles.json';
import sponsorsJson from '../data/sponsors.json';
import judgesJson from '../data/judges.json';
import eventCardsJson from '../data/cards.event.json';
import barragesJson from '../data/barrages.json';
import teamsJson from '../data/teams.json';
import endingsJson from '../data/endings.json';
import mainCardsJson from '../data/cards.main.json';
import type { Card, Judge } from './types';

export interface Hype {
  id: string; name: string; heat: number;
  sponsorEase: 'easy' | 'mid' | 'luck' | 'hard';
  weight: number; desc: string;
}
export interface Patron {
  id: string; name: string; money: number; buzz: number; gov: number;
  body: string; footnote: string;
}
export interface TitleTier {
  tier: number; label: string; buzz: number; expect: number; crowd: number;
  templates: string[];
}
export interface Sponsor {
  id: string; name: string; money: number; chaos: number;
  judgeSeat: boolean; namingAward: boolean; wave: number; tags: string[];
  body: string; footnote: string; awardName?: string;
}
export interface JudgeCand extends Judge {
  needsPatron?: string; needsBuzz?: number;
  needsSponsor?: string; needsConscience?: number;
}
export interface EventCardJson {
  id: string; phase: string; prob: number; must?: boolean; manual?: boolean;
  when?: string;
  probPlusIfTier3?: number; probPlusIfBuzz60?: number;
  probPlusPerSponsor?: number; probMax?: number;
  title: string; body: string;
  options: {
    id: string; label: string; desc?: string; cost?: number; preview?: string;
    effects: Record<string, number>;
    setFlags?: Record<string, string | number | boolean>;
    conscienceMark?: boolean; footnote?: string;
  }[];
}
export interface EndingJson {
  id: string; no: number; title: string; priority: number;
  when: Record<string, string | boolean>;
  text: string;
}

export const HYPES = hypesJson as Hype[];
export const PATRONS = patronsJson as Patron[];
export const TITLE_TIERS = (titlesJson as { tiers: TitleTier[] }).tiers;
export const SPONSORS = sponsorsJson as Sponsor[];
export const JUDGES = judgesJson as JudgeCand[];
export const EVENT_CARDS = eventCardsJson as EventCardJson[];
export const BARRAGES = barragesJson as {
  A: string[]; B: string[]; C: string[]; linked: Record<string, string[]>;
};
export const TEAMS = teamsJson as {
  namePrefix: string[]; nameSuffix: string[];
  projects: { name: string; desc: string }[];
};
export const ENDINGS = endingsJson as EndingJson[];
export const MAIN_CARDS = mainCardsJson as Record<string, { title: string; body: string }>;

/** 主线卡文案：{var} 占位替换 */
export function mainCopy(id: string, vars?: Record<string, string | number>): { title: string; body: string } {
  const c = MAIN_CARDS[id] ?? { title: id, body: '' };
  const sub = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''));
  return { title: sub(c.title), body: sub(c.body) };
}

/** 把 JSON 事件卡转成引擎 Card（phase 'any' 原样保留，由引擎特判） */
export function eventToCard(e: EventCardJson): Card {
  return {
    id: e.id,
    phase: e.phase as Card['phase'],
    title: e.title,
    body: e.body,
    options: e.options.map(o => ({
      id: o.id, label: o.label, desc: o.desc, cost: o.cost, preview: o.preview,
      effects: o.effects, setFlags: o.setFlags, conscienceMark: o.conscienceMark,
    })),
  };
}
/** 事件卡的 footnote 按选项存放（选后才显示） */
export function eventFootnote(e: EventCardJson, optionId: string): string | undefined {
  return e.options.find(o => o.id === optionId)?.footnote;
}
export function getEventCard(id: string): EventCardJson | undefined {
  return EVENT_CARDS.find(e => e.id === id);
}
