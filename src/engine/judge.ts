// 队伍生成 + 评委初榜计算
import type { Judge, RunState, Team } from './types';
import type { Rng } from './rng';
import { TEAMS } from './data';

/** 生成 8 支队伍：第 7 队（index 6）固定真神 q=95；每个评委席位债主有一支 q40-55 的关系队 */
export function genTeams(state: RunState, rng: Rng): Team[] {
  const debtSponsors = state.sponsors.filter(s => s.judgeSeat && !s.allied);
  const projects = rng.shuffle(TEAMS.projects);
  const teams: Team[] = [];
  for (let i = 0; i < 8; i++) {
    const name = rng.pick(TEAMS.namePrefix) + rng.pick(TEAMS.nameSuffix);
    const proj = projects[i % projects.length];
    const t: Team = {
      id: i, name, project: proj.name, projectDesc: proj.desc,
      q: rng.int(60, 85),
    };
    if (i === 6) { t.q = 95; t.isStrong = true; }
    teams.push(t);
  }
  // 债主队：放在非第 7 队的位置
  const slots = [0, 1, 2, 3, 4, 5, 7];
  debtSponsors.forEach((s, k) => {
    const idx = slots[k];
    if (idx === undefined) return;
    teams[idx].q = rng.int(40, 55);
    teams[idx].debtOf = s.id;
  });
  // 刷奖团：第 3 队（index 2）若未被债主占用
  if (!teams[2].debtOf) teams[2].isGrifter = true;
  else teams[5].isGrifter = true;
  return teams;
}

export interface BoardRow { team: Team; score: number; }

/**
 * 评委初榜：base=q
 *  较真评委(strictness>=0.8)：强队 +10，债主队 -10
 *  可控评委(controllable>=0.6)：债主队每人 +12
 *  VC/币圈(strictness<=0.1 且可控>=0.7)：随机一队 ±20（看天花板）
 *  直播评委：随机搅局 ±10
 */
export function initialBoard(teams: Team[], judges: Judge[], rng: Rng): BoardRow[] {
  const scores = new Map<number, number>();
  for (const t of teams) scores.set(t.id, t.q);
  for (const j of judges) {
    if (j.strictness >= 0.8) {
      for (const t of teams) {
        if (t.isStrong) scores.set(t.id, scores.get(t.id)! + 10);
        if (t.debtOf) scores.set(t.id, scores.get(t.id)! - 10);
      }
    }
    if (j.controllable >= 0.6) {
      for (const t of teams) {
        if (t.debtOf) scores.set(t.id, scores.get(t.id)! + 12);
      }
    }
    if (j.strictness <= 0.1 && j.controllable >= 0.7) {
      const t = rng.pick(teams);
      scores.set(t.id, scores.get(t.id)! + rng.int(-20, 20));
    }
    if (j.streamer) {
      const t = rng.pick(teams);
      scores.set(t.id, scores.get(t.id)! + rng.int(-10, 10));
    }
  }
  return teams
    .map(t => ({ team: t, score: Math.round(scores.get(t.id)!) }))
    .sort((a, b) => b.score - a.score);
}

/** 暗箱结果 → 冠军队 */
export function pickChampion(state: RunState, board: BoardRow[]): Team {
  if (state.rigChoice === 'fair') {
    return state.teams.find(t => t.isStrong)!;
  }
  if (state.rigChoice === 'water') {
    return state.teams.find(t => t.isStrong)!; // 总冠军仍给最强的，但人人有奖
  }
  // rigged：目标是债主队（E20 已确定 rigTarget 为 sponsorId）
  const target = state.teams.find(t => t.debtOf && t.debtOf === state.rigTarget)
    ?? state.teams.find(t => t.debtOf)
    ?? state.teams.find(t => t.isGrifter)
    ?? board[0].team;
  return target;
}
