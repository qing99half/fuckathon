// 数值应用：纯函数，clamp 规则集中在这里
import type { Effects, RunState } from './types';

const CLAMP_100 = ['buzz', 'gov', 'rep', 'anger', 'risk', 'conscience', 'expect'] as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 应用一组 effects，返回实际发生的 delta（用于 stat 事件） */
export function applyEffects(state: RunState, fx: Effects): { key: string; delta: number }[] {
  const out: { key: string; delta: number }[] = [];
  const s = state as unknown as Record<string, number>;
  for (const [k, v] of Object.entries(fx)) {
    if (!v) continue;
    const before = s[k] ?? 0;
    let after = before + v;
    if ((CLAMP_100 as readonly string[]).includes(k)) after = clamp(after, 0, 100);
    if (k === 'chaos') after = clamp(after, 0, 15);
    s[k] = after;
    const real = after - before;
    if (real !== 0) out.push({ key: k, delta: real });
  }
  return out;
}

export function applyFlags(state: RunState, flags?: Record<string, string | number | boolean>) {
  if (!flags) return;
  for (const [k, v] of Object.entries(flags)) {
    state.flags[k] = v;
    // 结构化字段直写
    if (k === 'grifterAction') state.grifterAction = String(v);
    if (k === 'strongTeamHandled') state.strongTeamHandled = String(v);
    if (k === 'exposed') state.exposed = Boolean(v);
    if (k === 'apologized') state.apologized = Boolean(v);
    if (k === 'awardInflation') state.flags.awardInflation = Boolean(v);
  }
}
