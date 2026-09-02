// 全部引擎类型定义
export interface Effects {
  money?: number; buzz?: number; gov?: number; rep?: number; chaos?: number;
  anger?: number; risk?: number; conscience?: number; expect?: number;
}

export interface Option {
  id: string;
  label: string;
  desc?: string;          // 选项下小字
  cost?: number;          // 预算硬约束：cost > money 时置灰
  preview?: string;       // 明面数值预览文案（只含四维）
  effects: Effects;
  setFlags?: Record<string, string | number | boolean>;
  conscienceMark?: boolean; // 良心绿点
  warn?: boolean;         // 危险选项：红边红底
}

export interface Card {
  id: string;
  phase: Phase;
  title: string;
  body: string;
  footnote?: string;      // 小字梗
  options: Option[];
  speaker?: string;       // 用于评委亮相等
  cause?: string;         // 后果溯源标注："签下 3 家冠名的后果"
  deathRisk?: number;     // 暴毙抢救卡：硬扛死亡率（0-1）
}

export type Phase =
  | 'title' | 'intro' | 'hype' | 'titlepick' | 'patron'
  | 'prep' | 'hack' | 'judge' | 'award' | 'settle' | 'ending';

export interface SponsorDeal {
  id: string; name: string; money: number; chaos: number;
  demands: string[];      // judge_seat / naming_award / ad_slot 等
  judgeSeat: boolean; namingAward: boolean;
  allied?: boolean;       // 结盟式谈判
  tailPaid?: boolean;
}

export interface Judge {
  id: string; name: string; tag: string;
  controllable: number; strictness: number; streamer: boolean;
  flavor: string; line: string;
  fee?: number;          // 出场费（¥，0=情怀免费）
}

export interface Team {
  id: number; name: string; project: string; projectDesc: string;
  q: number;              // 真实质量分（隐藏）
  debtOf?: string;        // 债主 sponsor id
  isStrong?: boolean;     // 第 7 队
  isGrifter?: boolean;
}

export interface RunState {
  seed: string;
  rngState: number;
  phase: Phase;
  // 明面
  money: number; buzz: number; gov: number; rep: number; chaos: number;
  // 隐藏
  anger: number; risk: number; conscience: number; expect: number;
  // 结构
  hypeId: string; titleTier: number; titleText: string; patronId: string;
  venueId: string; mealTier: number; wifiGood: boolean; lodging: string;
  sponsors: SponsorDeal[];
  judges: Judge[];
  judgeSlots: number;
  teams: Team[];
  rigChoice: '' | 'fair' | 'rigged' | 'water';
  rigTarget?: string;
  awardMode: string;
  exposed: boolean; apologized: boolean;
  strongTeamHandled: string; // noted / ignored / bought
  grifterAction: string;     // '' / expelled / ignored / allied
  log: { cardId: string; optionId: string }[];
  queue: Card[];
  firedEvents: string[];
  flags: Record<string, string | number | boolean>;
  endingId?: string;
}

export type ViewEvent =
  | { kind: 'card'; card: Card }
  | { kind: 'stat'; key: string; delta: number }
  | { kind: 'barrage'; lines: string[] }
  | { kind: 'scene'; scene: 'hack' | 'ui' }
  | { kind: 'phase'; phase: Phase }
  | { kind: 'ending'; endingId: string }
  | { kind: 'riskflash'; level: 'green' | 'yellow' | 'red' }
  | { kind: 'toast'; text: string }
  | { kind: 'sfx'; name: string };
