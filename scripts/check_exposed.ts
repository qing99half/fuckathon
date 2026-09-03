// 诊断：全程选 risk 增量最小的"怂"玩法，看曝光率和 risk 轨迹
import { GameEngine } from '../src/engine/index';

let exposed = 0, died = 0, total = 200;
const riskAtJudge: number[] = [];
const riskAtEnd: number[] = [];
for (let i = 0; i < total; i++) {
  const g = new GameEngine(`SAFE-${i}`);
  g.start();
  let steps = 0;
  let judgeRiskLogged = false;
  while (steps++ < 300 && !g.state.endingId) {
    const card = g.currentCard();
    if (!card) break;
    // 怂策略：选 risk 增量最小、其次 cost 最小的选项
    const sorted = [...card.options].sort((a, b) =>
      ((a.effects?.risk ?? 0) - (b.effects?.risk ?? 0)) || ((a.cost ?? 0) - (b.cost ?? 0)));
    let opt = sorted[0];
    if (opt.cost && opt.cost > g.state.money) {
      opt = sorted.find(o => !o.cost || o.cost <= g.state.money) ?? card.options[card.options.length - 1];
    }
    g.choose(opt.id);
    if (!judgeRiskLogged && g.state.phase === 'judge') { riskAtJudge.push(g.state.risk); judgeRiskLogged = true; }
  }
  riskAtEnd.push(g.state.risk);
  if (g.state.endingId === 'exposed' || g.state.exposed) exposed++;
  if (g.state.endingId?.startsWith('die_')) died++;
}
const avg = (a: number[]) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
console.log(`怂玩法 ${total} 局：曝光 ${exposed}（${(exposed / total * 100).toFixed(1)}%），暴毙 ${died}`);
console.log(`进入评审期时平均 risk = ${avg(riskAtJudge)}，结局时平均 risk = ${avg(riskAtEnd)}`);
