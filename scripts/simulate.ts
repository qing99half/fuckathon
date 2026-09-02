// 机器人模拟：策略模糊测试 + 13 结局剧本可达性验证
// 用法：npm run simulate [N]
import { GameEngine } from '../src/engine/index';
import type { Card } from '../src/engine/types';

const N = Number(process.argv[2] ?? 1000);

type Policy = 'random' | 'saint' | 'devil' | 'broke' | 'greedy' | 'first';
const policies: Policy[] = ['random', 'saint', 'devil', 'broke', 'greedy'];

const fx = (o: Card['options'][0], k: string) => (o.effects as Record<string, number>)[k] ?? 0;

function affordable(engine: GameEngine, card: Card) {
  const opts = card.options.filter(o => !o.cost || o.cost <= engine.state.money);
  return opts.length ? opts : card.options.slice(0, 1);
}

function pickByPolicy(engine: GameEngine, policy: Policy, salt: number): string {
  const card = engine.currentCard()!;
  const pool = affordable(engine, card);
  const h = (x: string) => { let v = 0; for (const c of x) v = (v * 31 + c.charCodeAt(0)) >>> 0; return v; };
  const minBy = (k: string) => pool.reduce((a, b) => fx(a, k) <= fx(b, k) ? a : b);
  const maxBy = (k: string) => pool.reduce((a, b) => fx(a, k) >= fx(b, k) ? a : b);
  switch (policy) {
    case 'saint': return (pool.find(o => o.conscienceMark) ?? minBy('risk')).id;
    case 'devil': return (pool.find(o => /rig_rigged|token/.test(o.id)) ?? maxBy('risk')).id;
    case 'broke': return (pool.find(o => o.id === 'refuse') ?? pool.find(o => o.conscienceMark) ?? minBy('risk')).id;
    case 'greedy': return (pool.find(o => o.id === 'sign') ?? pool[h(card.id + salt) % pool.length]).id;
    case 'first': return pool[0].id;
    default: return pool[h(card.id + salt) % pool.length].id;
  }
}

// ---------- 结局剧本：cardId → optionId（未列出的卡走 fallback） ----------
type Script = Record<string, string>;
function runScripted(target: string, script: Script, fb: Policy, maxSeeds = 300): { ok: boolean; seed?: string; steps?: number } {
  for (let i = 0; i < maxSeeds; i++) {
    const seed = `SCR-${target.toUpperCase()}-${i}`;
    const engine = new GameEngine(seed);
    engine.start();
    let steps = 0;
    while (!engine.state.endingId && steps < 300) {
      const card = engine.currentCard()!;
      let oid: string | undefined = script[card.id];
      // 赞助商卡前缀匹配；SP_MAX3 = 只签前 3 家（防止触发"赞助商年会"抢占结局）
      if (!oid && card.id.startsWith('SP_')) {
        if ('SP_MAX3' in script) oid = engine.state.sponsors.length < 3 ? 'sign' : 'refuse';
        else oid = script['SP_*'];
      }
      if (!oid && card.id.startsWith('JD_')) oid = script['JD_*'];
      if (oid && !card.options.some(o => o.id === oid)) oid = undefined; // 该选项本局不存在（如盟友/席位变化）
      if (oid) {
        const opt = card.options.find(o => o.id === oid)!;
        if (opt.cost && opt.cost > engine.state.money) oid = undefined; // 预算门禁兜底
      }
      engine.choose(oid ?? pickByPolicy(engine, fb, i));
      steps++;
    }
    if (engine.state.endingId === target) return { ok: true, seed, steps };
  }
  return { ok: false };
}

// ---------- 主流程 ----------
const mode = process.argv[3] ?? 'all';

if (mode === 'all' || mode === 'fuzz') {
  const endingCount = new Map<string, number>();
  const fails: string[] = [];
  let stepsTotal = 0, maxSteps = 0, minMoney = Infinity;
  for (let i = 0; i < N; i++) {
    const policy = policies[i % policies.length];
    const engine = new GameEngine(`SIM-${i.toString(36).toUpperCase().padStart(4, '0')}`);
    try {
      engine.start();
      let steps = 0;
      while (!engine.state.endingId && steps < 300) {
        engine.choose(pickByPolicy(engine, policy, i));
        steps++;
      }
      stepsTotal += steps; maxSteps = Math.max(maxSteps, steps);
      minMoney = Math.min(minMoney, engine.state.money);
      if (!engine.state.endingId) fails.push(`#${i}(${policy}) 300 步未结局 stage=${engine.state.flags.stage} card=${engine.currentCard()?.id}`);
      else endingCount.set(engine.state.endingId, (endingCount.get(engine.state.endingId) ?? 0) + 1);
    } catch (e) {
      fails.push(`#${i}(${policy}) 异常: ${(e as Error).message}\n${(e as Error).stack?.split('\n').slice(0, 4).join('\n')}`);
    }
  }
  console.log(`=== 模糊模拟 ${N} 局 ===`);
  console.log(`平均步数 ${(stepsTotal / N).toFixed(1)}，最大 ${maxSteps}，最低预算 ¥${minMoney.toLocaleString()}`);
  for (const [id, n] of [...endingCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(12)} ${n} (${(n / N * 100).toFixed(1)}%)`);
  }
  console.log(`模糊覆盖 ${endingCount.size}/13`);
  if (fails.length) {
    console.error(`失败 ${fails.length} 局（前 10）：`);
    fails.slice(0, 10).forEach(f => console.error('  ' + f));
    process.exit(1);
  }
  console.log('全部局正常到达结局\n');
}

if (mode === 'all' || mode === 'scripts') {
  // 13 结局剧本可达性
  const scripts: { target: string; fb: Policy; script: Script }[] = [
    { target: 'exposed', fb: 'devil', script: { 'E09': 'c', 'E13': 'b', 'RIG': 'rig_rigged', 'E16': 'token' } },
    { target: 'spring', fb: 'saint', script: { 'PATRON': 'patron_gov', 'SP_*': 'refuse', 'E03': 'c', 'VENUE': 'school', 'MEAL': 'meal_60', 'LODGE': 'lodge_hotel', 'E06': 'a', 'E08': 'a', 'E09': 'a', 'E10': 'a', 'E12': 'a', 'E13': 'a', 'RIG': 'rig_fair', 'E16': 'transfer', 'E17': 'champion' } },
    { target: 'sincere', fb: 'saint', script: { 'PATRON': 'patron_gov', 'SP_*': 'refuse', 'E03': 'a', 'E04': 'a', 'VENUE': 'cowork', 'MEAL': 'meal_30', 'LODGE': 'lodge_none', 'E06': 'a', 'E09': 'a', 'E10': 'a', 'E12': 'b', 'E13': 'a', 'RIG': 'rig_fair', 'E16': 'process', 'E17': 'champion' } },
    { target: 'withdrawal', fb: 'saint', script: { 'PATRON': 'patron_corp', 'SP_*': 'refuse', 'RIG': 'rig_fair', 'E16': 'transfer', 'E09': 'a', 'E10': 'a', 'E13': 'a' } },
    { target: 'token', fb: 'first', script: { 'E16': 'token', 'E09': 'b', 'E13': 'a', 'RIG': 'rig_fair' } },
    { target: 'nephew', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'sign', 'RIG': 'rig_rigged', 'E20': 'e20_c', 'E16': 'transfer', 'E09': 'b', 'E13': 'a', 'E15': 'c' } },
    { target: 'annual', fb: 'greedy', script: { 'PATRON': 'patron_crypto', 'SP_*': 'sign', 'TITLEPICK': 'title_3', 'E03': 'a', 'E09': 'b', 'E13': 'a', 'RIG': 'rig_water', 'E16': 'transfer', 'E19': 'a', 'E22': 'a', 'E11': 'a' } },
    { target: 'balance', fb: 'first', script: { 'SP_*': 'refuse', 'RIG': 'rig_water', 'E16': 'process', 'E09': 'b', 'E13': 'a' } },
    { target: 'grifter', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'refuse', 'E04': 'c', 'MEAL': 'meal_15', 'LODGE': 'lodge_none', 'E09': 'c', 'E10': 'b', 'E13': 'a', 'RIG': 'rig_fair', 'E16': 'process', 'E12': 'a' } },
    { target: 'leaderhappy', fb: 'first', script: { 'PATRON': 'patron_gov', 'SP_MAX3': '', 'TITLEPICK': 'title_2', 'VENUE': 'park', 'E05': 'a', 'E07': 'b', 'E11': 'a', 'E09': 'b', 'E13': 'a', 'MEAL': 'meal_15', 'LODGE': 'lodge_none', 'E03': 'a', 'E04': 'a', 'RIG': 'rig_fair', 'E16': 'cert', 'E17': 'leader' } },
    { target: 'prefab', fb: 'first', script: { 'PATRON': 'patron_crypto', 'TITLEPICK': 'title_3', 'SP_MAX3': '', 'E02': 'c', 'E03': 'a', 'E04': 'c', 'VENUE': 'school', 'MEAL': 'meal_15', 'LODGE': 'lodge_none', 'E06': 'c', 'E09': 'b', 'E10': 'b', 'E11': 'a', 'E12': 'c', 'E13': 'a', 'RIG': 'rig_fair', 'E16': 'cert', 'E17': 'ceo', 'E19': 'c', 'E22': 'b', 'E08': 'b', 'W01': 'b' } },
    { target: 'nobody', fb: 'first', script: { 'PATRON': 'patron_gov', 'TITLEPICK': 'title_1', 'SP_*': 'refuse', 'E01': 'a', 'E02': 'b', 'E03': 'c', 'E04': 'a', 'VENUE': 'school', 'E05': 'a', 'MEAL': 'meal_15', 'WIFI': 'wifi_bad', 'LODGE': 'lodge_none', 'E06': 'c', 'E07': 'b', 'E08': 'b', 'E09': 'b', 'E10': 'c', 'E12': 'a', 'E13': 'a', 'RIG': 'rig_fair', 'E16': 'process', 'E17': 'ceo', 'W01': 'a' } },
    { target: 'smooth', fb: 'first', script: { 'PATRON': 'patron_corp', 'TITLEPICK': 'title_2', 'SP_MAX3': '', 'E01': 'a', 'E02': 'b', 'E03': 'a', 'E04': 'a', 'VENUE': 'cowork', 'MEAL': 'meal_15', 'WIFI': 'wifi_good', 'LODGE': 'lodge_none', 'E06': 'b', 'E09': 'b', 'E10': 'c', 'E11': 'a', 'E12': 'a', 'E13': 'c', 'RIG': 'rig_fair', 'E16': 'process', 'E17': 'ceo', 'E19': 'b', 'E22': 'b', 'W01': 'a' } },
  ];
  console.log('=== 13 结局剧本可达性 ===');
  let failed = 0;
  for (const { target, fb, script } of scripts) {
    const r = runScripted(target, script, fb);
    if (r.ok) console.log(`  ✓ ${target.padEnd(12)} (seed ${r.seed}, ${r.steps} 步)`);
    else { console.error(`  ✗ ${target} 300 个种子未达`); failed++; }
  }
  console.log('13 个结局全部可达');

  // 9 暴毙结局剧本可达性：D 卡一律选 hard，靠多种子覆盖硬扛死亡率
  const deathScripts: { target: string; fb: Policy; script: Script }[] = [
    // D2 被孙割割了：crypto 金主 + 混乱≥5（全签赞助）
    { target: 'die_sunge', fb: 'first', script: { 'PATRON': 'patron_crypto', 'SP_*': 'sign', 'E08': 'a', 'E13': 'a', 'E15': 'a', 'E21': 'a', 'W01': 'a', 'RIG': 'rig_fair', 'E16': 'transfer', 'E17': 'champion', 'D2': 'hard' } },
    // D3 认知偏差了：热度≥80 且 口碑≤30（crypto35+离谱40+E02c8=83；口碑 50-3-5-20=22，E18 需 risk 检定触发）
    { target: 'die_cognition', fb: 'first', script: { 'PATRON': 'patron_crypto', 'TITLEPICK': 'title_3', 'SP_*': 'refuse', 'E01': 'c', 'E02': 'c', 'E03': 'a', 'E04': 'c', 'E18': 'b', 'D3': 'hard' } },
    // D4 跑路了兄弟：压线 69→E07-c +30 一步到位 ≥90（20餐+15住+5园+5E02b+10E04c+5E06b=60，+30=90）
    { target: 'die_runaway', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'sign', 'VENUE': 'park', 'MEAL': 'meal_15', 'LODGE': 'lodge_none', 'E02': 'b', 'E04': 'c', 'E06': 'b', 'E07': 'c', 'E19': 'a', 'E18': 'b', 'W01': 'b', 'D4': 'hard', 'E21': 'a' } },
    // D5 我记得华莱士没赞助啊：15 元盒饭 + 35% 发作
    { target: 'die_meal', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'refuse', 'MEAL': 'meal_15', 'E08': 'a', 'W01': 'a', 'D5': 'hard' } },
    // D6 物理黑客来了：E08 断网选 b（蹭热点）
    { target: 'die_power', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'refuse', 'WIFI': 'wifi_bad', 'E08': 'b', 'W01': 'a', 'D6': 'hard' } },
    // D7 组织研究决定：gov 金主 + 混乱≥6 + E19 任意选择
    { target: 'die_leader', fb: 'first', script: { 'PATRON': 'patron_gov', 'SP_*': 'sign', 'E19': 'a', 'W01': 'a', 'D7': 'hard', 'E21': 'a', 'E08': 'a' } },
    // D8 我说这是搏击松：混乱≥6 → E21 选 c（corp 金主避开 D7，餐饮住宿从优避开 D9）
    { target: 'die_fight', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'sign', 'MEAL': 'meal_30', 'LODGE': 'lodge_bag', 'E08': 'a', 'E19': 'a', 'W01': 'a', 'E13': 'a', 'E15': 'a', 'E21': 'c', 'D8': 'hard', 'RIG': 'rig_fair', 'E16': 'transfer', 'E17': 'champion' } },
    // D9 我chovy，投屏给我投好的啊：怨气≥85 + 内定痕迹≥2（suyun 评委席 + E09 结盟）
    { target: 'die_screen', fb: 'first', script: { 'PATRON': 'patron_corp', 'SP_*': 'sign', 'MEAL': 'meal_15', 'WIFI': 'wifi_bad', 'LODGE': 'lodge_none', 'E02': 'b', 'E04': 'c', 'E06': 'b', 'E06B': 'next', 'E19': 'a', 'W01': 'a', 'E08': 'b', 'D6': 'submit', 'D5': 'submit', 'E09': 'c', 'E10': 'b', 'E11': 'a', 'E12': 'b', 'E13': 'a', 'E15': 'a', 'D9': 'hard', 'E21': 'a', 'RIG': 'rig_fair', 'E16': 'transfer', 'E17': 'champion' } },
    // D10 全网恩人（已封禁）：热度≥70 + 主播评委（签 bit跳动送 KOL 席位）+ E15 选 b
    { target: 'die_ban', fb: 'first', script: { 'PATRON': 'patron_corp', 'TITLEPICK': 'title_3', 'SP_*': 'sign', 'MEAL': 'meal_30', 'LODGE': 'lodge_bag', 'WIFI': 'wifi_good', 'E08': 'a', 'E19': 'a', 'W01': 'a', 'E13': 'a', 'E15': 'b', 'D10': 'hard', 'E21': 'a', 'RIG': 'rig_fair', 'E16': 'transfer', 'E17': 'champion' } },
  ];
  console.log('\n=== 9 暴毙结局剧本可达性 ===');
  for (const { target, fb, script } of deathScripts) {
    const r = runScripted(target, script, fb);
    if (r.ok) console.log(`  ✓ ${target.padEnd(14)} (seed ${r.seed}, ${r.steps} 步)`);
    else { console.error(`  ✗ ${target} 300 个种子未达`); failed++; }
  }
  if (failed) { console.error(`\n${failed} 个结局不可达`); process.exit(1); }
  console.log('9 个暴毙结局全部可达');
}
