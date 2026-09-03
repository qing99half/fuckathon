// 强制绑定冒烟测试：corp 金主 → 自动占 2 席 + DBT_CORP_API；pff 全签 → MEAL 被锁
import { GameEngine } from '../src/engine/index';

function run(seed: string, script: Record<string, string>) {
  const g = new GameEngine(seed);
  g.start();
  const seen = new Set<string>();
  let steps = 0;
  while (steps++ < 300 && !g.state.endingId) {
    const card = g.currentCard();
    if (!card) break;
    seen.add(card.id);
    let opt = script[card.id] ?? (card.id.startsWith('SP_') ? (script['SP_*'] || card.options[0].id) : card.options[0].id);
    if (!card.options.some(o => o.id === opt)) opt = card.options[0].id;
    // 预算不足时换第一个买得起的选项
    const chosen = card.options.find(o => o.id === opt);
    if (chosen?.cost && chosen.cost > g.state.money) {
      opt = (card.options.find(o => !o.cost || o.cost <= g.state.money) ?? card.options[0]).id;
    }
    const before = card.id;
    g.choose(opt);
    if (g.currentCard()?.id === before) { console.log('STUCK at', before, 'opt', opt, 'stage', g.state.flags.stage); break; }
  }
  return { g, seen };
}

// corp 金主线
const r1 = run('BIND-CORP-1', { PATRON: 'patron_corp', 'SP_*': 'refuse' });
console.log('== corp 金主 ==');
console.log('自动占位评委:', r1.g.state.judges.filter(j => ['exec', 'intern'].includes(j.id)).map(j => j.id));
console.log('DBT 卡:', [...r1.seen].filter(x => x.startsWith('DBT')));
console.log('ending:', r1.g.state.endingId);

// pff 独家供餐线（全签，撞到 pff 才会锁）
let locked = false;
for (let i = 0; i < 20 && !locked; i++) {
  const r = run(`BIND-PFF-${i}`, { PATRON: 'patron_corp', 'SP_*': 'sign' });
  if (r.seen.has('MEAL_PFF')) {
    locked = true;
    console.log('== pff 独家供餐 ==');
    console.log('MEAL 卡已被替换为 MEAL_PFF, mealTier =', r.g.state.mealTier, ', pffLocked =', r.g.state.flags.pffLocked);
    console.log('DBT_PFF 出现:', r.seen.has('DBT_PFF'));
  }
}
if (!locked) console.log('== pff 20 局未摇到（门控正常但无法验证锁定）==');
