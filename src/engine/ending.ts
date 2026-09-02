// 结局引擎：按 priority 顺序匹配 when 条件
import type { RunState } from './types';
import { ENDINGS, type EndingJson } from './data';

function checkCond(actual: unknown, cond: string | boolean): boolean {
  if (typeof cond === 'boolean') return Boolean(actual) === cond;
  if (typeof cond === 'string') {
    const m = cond.match(/^(>=|<=|>|<)(\d+)$/);
    if (m) {
      const v = Number(actual ?? 0);
      const n = Number(m[2]);
      switch (m[1]) {
        case '>=': return v >= n;
        case '<=': return v <= n;
        case '>': return v > n;
        case '<': return v < n;
      }
    }
    return String(actual ?? '') === cond;
  }
  return false;
}

/** 匹配结局。repFinal 已含落差公式。 */
export function matchEnding(state: RunState, repFinal: number): EndingJson {
  const ctx: Record<string, unknown> = {
    deathId: String(state.flags.deathId ?? ''),
    exposed: state.exposed,
    apologized: state.apologized,
    conscience: state.conscience,
    rep: repFinal,
    money: state.money,
    buzz: state.buzz,
    gov: state.gov,
    awardMode: state.awardMode,
    rigChoice: state.rigChoice,
    sponsorCount: state.sponsors.length,
    awardInflation: Boolean(state.flags.awardInflation),
    grifterAction: state.grifterAction,
  };
  // 坏结局锁：口碑破产时只允许 nobody / prefab / exposed（暴毙结局已在触发时直接进）
  const locked = repFinal <= 10 && !state.flags.deathId;
  const pool = locked ? ENDINGS.filter(e => ['nobody', 'prefab', 'exposed'].includes(e.id)) : ENDINGS;
  const sorted = [...pool].sort((a, b) => a.priority - b.priority);
  for (const e of sorted) {
    const ok = Object.entries(e.when).every(([k, cond]) => checkCond(ctx[k], cond));
    if (ok) return e;
  }
  return ENDINGS.find(e => e.id === 'smooth') ?? sorted[sorted.length - 1]; // 兜底：圆满交差
}

export function repFinalOf(state: RunState): number {
  return Math.max(0, Math.min(100,
    state.rep + Math.round((100 - state.anger - state.expect) / 5)));
}
