// 入口：标题画面 → 游戏循环 → 结局卡/图鉴
import './style.css';
import { GameEngine } from './engine/index';
import { getEventCard, eventFootnote, ENDINGS } from './engine/data';
import { repFinalOf } from './engine/ending';
import type { ViewEvent, Phase } from './engine/types';
import { Hud } from './ui/hud';
import { Barrage } from './ui/barrage';
import { CardView } from './ui/card';
import { PixelScene } from './ui/pixelscene';
import { drawEndingCard, exportPng } from './ui/endingcard';
import { Audio8 } from './ui/audio';
import { Feedback } from './ui/feedback';
import type { FbType } from './ui/feedback';
import { A, ENDING_IMG, loadImg } from './ui/assets';

const DEBUG = new URLSearchParams(location.search).has('debug');
const AUTO = new URLSearchParams(location.search).has('auto');
const STOPAT = new URLSearchParams(location.search).get('stopat'); // 冒烟测试：进入某阶段后停止自动点击
const LS_ENDINGS = 'fuckathon.endings.v1';

const app = document.getElementById('app')!;
const audio = new Audio8();

let engine: GameEngine | null = null;
let hud: Hud | null = null;
let barrage: Barrage | null = null;
let cardView: CardView | null = null;
let scene: PixelScene | null = null;
let feedback: Feedback | null = null;
let debugEl: HTMLElement | null = null;
let hackCardsSeen = 0;
let hackCardsTotal = 12; // 估计值，用于昼夜推进

// ---------- 工具 ----------
function unlockedEndings(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_ENDINGS) ?? '[]'); } catch { return []; }
}
function unlockEnding(id: string) {
  const arr = unlockedEndings();
  if (!arr.includes(id)) { arr.push(id); localStorage.setItem(LS_ENDINGS, JSON.stringify(arr)); }
}

function toast(text: string, type: FbType = 'normal', deltas?: import('./ui/feedback').FbDelta[]) {
  feedback?.push(text, type, deltas);
}
/** 按文案内容推断反馈卡类型 */
function fbTypeOf(text: string): FbType {
  if (/预算不足|翻脸|尾款 ¥[\d,]+ 被取消|尾款取消/.test(text)) return 'warn';
  if (/到账|收录|续费/.test(text)) return 'good';
  return 'normal';
}

// ---------- 标题画面 ----------
async function showTitle() {
  app.innerHTML = '';
  engine = null;
  const el = document.createElement('div');
  el.className = 'title-screen';
  const logo = document.createElement('img');
  logo.className = 'title-logo';
  logo.src = A('ui/logo.png');
  logo.alt = '预制黑客松模拟器';
  const name = document.createElement('div');
  name.className = 'title-name';
  name.textContent = '预制黑客松模拟器';
  const sub = document.createElement('div');
  sub.className = 'title-sub';
  sub.textContent = '每一届黑客松，都是一道预制菜';
  const btnStart = document.createElement('button');
  btnStart.className = 'px-btn';
  btnStart.textContent = '开始办赛';
  const n = unlockedEndings().length;
  const btnGal = document.createElement('button');
  btnGal.className = 'px-btn ghost';
  btnGal.textContent = `结局图鉴 ${n}/${ENDINGS.length}`;
  const dis = document.createElement('div');
  dis.className = 'title-disclaimer';
  dis.textContent = '本游戏纯属虚构。如有雷同，说明你也办过。';
  el.append(logo, name, sub, btnStart, btnGal, dis);
  app.appendChild(el);
  btnStart.addEventListener('click', () => { audio.sfx('click'); startGame(); });
  btnGal.addEventListener('click', () => { audio.sfx('click'); showGallery(); });
  audio.bgm('title');
  if (AUTO) setTimeout(() => btnStart.click(), 400);
}

// ---------- 图鉴 ----------
function showGallery() {
  const old = document.querySelector('.gallery');
  if (old) old.remove();
  const g = document.createElement('div');
  g.className = 'gallery';
  const h = document.createElement('h2');
  h.textContent = `结局图鉴 ${unlockedEndings().length}/${ENDINGS.length}`;
  g.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  const unlocked = unlockedEndings();
  const sorted = [...ENDINGS].sort((a, b) => a.no - b.no);
  for (const e of sorted) {
    const cell = document.createElement('div');
    const has = unlocked.includes(e.id);
    cell.className = 'gallery-cell' + (has ? ' unlocked' : '');
    const no = document.createElement('div');
    no.className = 'no';
    no.textContent = `预字〔2026〕第 ${String(e.no).padStart(2, '0')} 号`;
    cell.appendChild(no);
    if (has) {
      const img = document.createElement('img');
      img.src = A(`endings/${ENDING_IMG[e.id]}`);
      img.loading = 'lazy';
      const t = document.createElement('div');
      t.textContent = `【${e.title}】`;
      t.style.color = '#1A1A1A'; t.style.fontWeight = '700';
      cell.append(img, t);
    } else {
      const q = document.createElement('div');
      q.textContent = '？？？';
      cell.appendChild(q);
    }
    grid.appendChild(cell);
  }
  g.appendChild(grid);
  const close = document.createElement('button');
  close.className = 'px-btn ghost gallery-close';
  close.textContent = '返回';
  close.addEventListener('click', () => { audio.sfx('click'); g.remove(); });
  g.appendChild(close);
  app.appendChild(g);
}

// ---------- 游戏主循环 ----------
function startGame() {
  app.innerHTML = '';
  engine = new GameEngine();
  hackCardsSeen = 0;

  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  hud = new Hud(app);
  app.insertBefore(hud.el, stage);
  hud.muteBtn.textContent = audio.muted ? '×' : '♪';
  hud.muteBtn.addEventListener('click', () => {
    hud!.muteBtn.textContent = audio.toggleMute() ? '×' : '♪';
  });

  scene = new PixelScene(stage);
  barrage = new Barrage(stage);
  cardView = new CardView(stage);
  feedback = new Feedback(stage);

  const flash = document.createElement('div');
  flash.className = 'riskflash';
  stage.appendChild(flash);

  if (DEBUG) {
    debugEl = document.createElement('div');
    debugEl.className = 'debug-panel';
    stage.appendChild(debugEl);
  }

  // rAF 驱动弹幕与像素场景
  let last = performance.now();
  let probeFrames = 0, probeDt = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    probeFrames++; probeDt += dt;
    if (engine) {
      barrage?.tick(dt, engine.state.phase === 'hack' || engine.state.phase === 'judge', engine.state.anger, engine.state.phase);
      scene?.tick(dt, engine.state.anger);
      if (debugEl) {
        const s = engine.state;
        debugEl.textContent = `seed ${s.seed}\nstage ${s.flags.stage}\ncard ${engine.currentCard()?.id ?? '-'}\nanger ${s.anger} risk ${s.risk}\nconsc ${s.conscience} expect ${s.expect}\nqueue ${s.queue.length}\nprobe frames=${probeFrames} dt=${probeDt.toFixed(1)} alive=${document.querySelectorAll('.barrage-item').length}`;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  hud.update(engine.state);
  processEvents(engine.start());
}

function processEvents(events: ViewEvent[]) {
  if (!engine) return;
  const s = engine.state;
  for (const ev of events) {
    switch (ev.kind) {
      case 'stat':
        hud?.statPulse(ev.key, ev.delta);
        break;
      case 'barrage':
        barrage?.push(ev.lines, { cTier: s.anger >= 70 });
        break;
      case 'toast':
        toast(ev.text, fbTypeOf(ev.text));
        break;
      case 'riskflash': {
        const f = document.querySelector('.riskflash');
        if (f) { f.classList.remove('on'); void (f as HTMLElement).offsetWidth; f.classList.add('on'); }
        break;
      }
      case 'sfx':
        audio.sfx(ev.name);
        break;
      case 'scene':
        if (ev.scene === 'hack') {
          document.querySelector('.stage')?.classList.add('hack');
          scene?.enter(s).then(() => {
            scene?.setProgress(0);
            // 冒烟测试预热：快进弹幕/场景到稳态，便于截图验证
            if (AUTO) {
              for (let i = 0; i < 240; i++) {
                barrage?.tick(1 / 30, true, s.anger, 'hack');
                scene?.tick(1 / 30, s.anger);
              }
            }
          });
          audio.bgm('hack');
        } else {
          document.querySelector('.stage')?.classList.remove('hack');
          scene?.exit();
        }
        break;
      case 'phase':
        onPhase(ev.phase);
        break;
      case 'ending':
        onEnding(ev.endingId);
        break;
      case 'card':
        showCard();
        break;
    }
  }
  hud?.update(s);
}

function onPhase(phase: Phase) {
  switch (phase) {
    case 'prep': audio.bgm('prep'); break;
    case 'judge': audio.bgm('judge'); break;
    case 'award': audio.bgm('award'); break;
    case 'hack': hackCardsSeen = 0; break;
  }
}

function showCard() {
  if (!engine || !cardView) return;
  const card = engine.currentCard();
  if (!card) return;
  if (card.phase === 'hack') {
    hackCardsSeen++;
    scene?.setProgress(hackCardsSeen / hackCardsTotal);
    scene?.notify(card.id);
  }
  if (card.phase === 'judge') audio.bgm('judge');
  const autoMs = card.id.startsWith('DEMO_') ? 2600 : undefined;
  cardView.show(card, engine.state.money, (optionId) => {
    const opt = card.options.find(o => o.id === optionId);
    // 分级演出：大单（≥1万）或红标惩罚选项 → 震屏 + 重音
    const heavy = (opt?.cost ?? 0) >= 10000 || !!opt?.warn;
    if (heavy) {
      const st = document.querySelector('.stage');
      if (st) { st.classList.remove('shake'); void (st as HTMLElement).offsetWidth; st.classList.add('shake'); }
      audio.sfx('thud');
    } else {
      audio.sfx('flip');
    }
    // 选前快照 → 立即结算 → 数值变动行
    const before = { ...engine!.state };
    const events = engine!.choose(optionId);
    processEvents(events);
    const after = engine!.state;
    const deltas = (['money', 'buzz', 'gov', 'rep', 'chaos'] as const)
      .map(k => ({ label: { money: '预算', buzz: '声量', gov: '政商', rep: '口碑', chaos: '混乱' }[k], delta: (after[k] as number) - (before[k] as number), money: k === 'money' }))
      .filter(d => d.delta !== 0);
    // 选后 footnote + 数值变动 → 中央反馈卡（与选项卡同款 UI）
    const ej = getEventCard(card.id);
    const fn = ej ? (eventFootnote(ej, optionId) ?? '') : '';
    if (fn || deltas.length) {
      toast(fn, fn ? fbTypeOf(fn) : 'normal', deltas.length ? deltas : undefined);
    }
  }, autoMs);
  // ?auto=1 冒烟测试：自动随机点击选项
  if (AUTO) {
    setTimeout(() => {
      if (!engine || engine.currentCard()?.id !== card.id || engine.state.endingId) return;
      if (STOPAT && engine.state.phase === STOPAT) return; // 停在指定阶段供截图
      const eng = engine;
      const pool = card.options.filter(o => !o.cost || o.cost <= eng.state.money);
      const pick = pool[Math.floor(Math.random() * pool.length)] ?? card.options[0];
      const btns = document.querySelectorAll<HTMLButtonElement>(`.card[data-card-id="${card.id}"] .opt`);
      const idx = card.options.findIndex(o => o.id === pick.id);
      (btns[idx] ?? btns[0])?.click();
    }, 420);
  }
}

// ---------- 结局 ----------
async function onEnding(endingId: string) {
  if (!engine) return;
  const ending = ENDINGS.find(e => e.id === endingId);
  if (!ending) return;
  const isNew = !unlockedEndings().includes(endingId);
  unlockEnding(endingId);
  audio.sfx(isNew ? 'unlock' : 'fanfare');
  cardView?.clear();

  const wrap = document.createElement('div');
  wrap.className = 'ending-wrap';
  const loading = document.createElement('div');
  loading.textContent = '正在打印通报（手写的）……';
  loading.style.color = '#8D99AE';
  wrap.appendChild(loading);
  app.appendChild(wrap);

  const cv = await drawEndingCard(engine.state, ending);
  cv.className = 'ending-canvas';
  wrap.innerHTML = '';
  wrap.appendChild(cv);

  const actions = document.createElement('div');
  actions.className = 'ending-actions';
  const save = document.createElement('button');
  save.className = 'px-btn';
  save.textContent = '保存结局卡';
  save.addEventListener('click', () => {
    audio.sfx('click');
    exportPng(cv, `预制黑客松-${ending.title}-${engine!.state.seed}.png`);
  });
  const again = document.createElement('button');
  again.className = 'px-btn ghost';
  again.textContent = '再办一届';
  again.addEventListener('click', () => { audio.sfx('click'); startGame(); });
  const gal = document.createElement('button');
  gal.className = 'px-btn plain';
  gal.textContent = `图鉴 ${unlockedEndings().length}/${ENDINGS.length}`;
  gal.addEventListener('click', () => { audio.sfx('click'); showGallery(); });
  const home = document.createElement('button');
  home.className = 'px-btn plain';
  home.textContent = '回标题';
  home.addEventListener('click', () => { audio.sfx('click'); showTitle(); });
  actions.append(save, again, gal, home);
  wrap.appendChild(actions);
  if (isNew) setTimeout(() => toast(`新结局收录：【${ending.title}】`, 'good'), 400);
}

// ---------- 启动 ----------
(async function boot() {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = '<div>正在给领导写讲话稿（第 9 个首先）……</div>';
  app.appendChild(loading);
  try {
    await Promise.all([loadImg(A('ui/logo.png')), loadImg(A('ui/title_bg.png')), loadImg(A('icons_1.png'))]);
  } catch { /* 资源缺失不阻塞 */ }
  loading.remove();
  showTitle();
})();
