// 强制兑现卡冒烟测试：gov 金主 + 离谱 title + 产业园场地，应见到对应 DBT 卡
import { GameEngine } from '../src/engine/index';

const g = new GameEngine('DEBT-TEST-1');
g.start();
const seen = new Set<string>();
let steps = 0;
while (steps++ < 300 && !g.state.endingId) {
  const card = g.currentCard();
  if (!card) break;
  seen.add(card.id);
  let opt = card.options[0].id;
  if (card.id === 'TITLEPICK') opt = 'title_3';
  if (card.id === 'VENUE') opt = 'park';
  g.choose(opt);
}
console.log('debt cards fired:', [...seen].filter(x => x.startsWith('DBT')));
console.log('debt ledger flags:', Object.keys(g.state.flags).filter(k => k.startsWith('debt_')));
console.log('patron:', g.state.patronId, 'venue:', g.state.venueId, 'titleTier:', g.state.titleTier);
console.log('ending:', g.state.endingId, 'steps:', steps);
