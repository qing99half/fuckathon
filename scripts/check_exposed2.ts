// 诊断 2：模拟"普通玩家"——有钱就签、看心情点（第一选项/随机），统计曝光率与 risk 来源
import { GameEngine } from '../src/engine/index';

function play(seed: string, mode: 'first' | 'random' | 'signall') {
  const g = new GameEngine(seed);
  g.start();
  let steps = 0;
  let rolls = 0;
  while (steps++ < 300 && !g.state.endingId) {
    const card = g.currentCard();
    if (!card) break;
    let opts = card.options;
    let opt;
    if (mode === 'signall' && card.id.startsWith('SP_')) opt = opts.find(o => o.id === 'sign') ?? opts[0];
    else if (mode === 'random') opt = opts[Math.floor(Math.random() * opts.length)];
    else opt = opts[0];
    if (opt.cost && opt.cost > g.state.money) opt = [...opts].reverse().find(o => !o.cost || o.cost <= g.state.money) ?? opts[0];
    const riskBefore = g.state.risk;
    const raised = (opt.effects?.risk ?? 0) > 0;
    g.choose(opt.id);
    if (raised) rolls++;
    void riskBefore;
  }
  return { ending: g.state.endingId ?? 'none', exposed: g.state.exposed, rolls, risk: g.state.risk };
}

for (const mode of ['first', 'random', 'signall'] as const) {
  let ex = 0, die = 0, rollSum = 0, riskSum = 0;
  const N = 200;
  const endings: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const r = play(`P-${mode}-${i}`, mode);
    if (r.exposed) ex++;
    if (r.ending.startsWith('die_')) die++;
    rollSum += r.rolls; riskSum += r.risk;
    endings[r.ending] = (endings[r.ending] ?? 0) + 1;
  }
  console.log(`\n[${mode}] 曝光 ${(ex / N * 100).toFixed(0)}% 暴毙 ${(die / N * 100).toFixed(0)}% 平均每局 risk+ 选项数 ${(rollSum / N).toFixed(1)} 结局时平均 risk ${(riskSum / N).toFixed(0)}`);
  console.log('  结局分布:', Object.entries(endings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}
