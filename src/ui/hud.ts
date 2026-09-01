// HUD：五明面数值 + 半透明怨气条（无数字）+ 热搜温度计
import { A, ICON, ICON_COLS, ICON_CELL, loadImg } from './assets';

const LABELS: Record<string, string> = {
  money: '预算', buzz: '声量', gov: '政商', rep: '口碑', chaos: '混乱',
};
const ICON_OF: Record<string, number> = {
  money: ICON.money, buzz: ICON.buzz, gov: ICON.gov, rep: ICON.rep, chaos: ICON.chaos,
};

export class Hud {
  el: HTMLElement;
  private vals = new Map<string, HTMLElement>();
  private items = new Map<string, HTMLElement>();
  private angerBar!: HTMLElement;
  private thermo!: HTMLCanvasElement;
  private iconsImg: HTMLImageElement | null = null;
  muteBtn!: HTMLButtonElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    parent.appendChild(this.el);
    loadImg(A('icons_1.png')).then(im => { this.iconsImg = im; this.renderIcons(); });
    for (const k of ['money', 'buzz', 'gov', 'rep', 'chaos']) {
      const item = document.createElement('span');
      item.className = 'hud-item';
      const ic = document.createElement('canvas');
      ic.className = 'ic'; ic.width = 18; ic.height = 18;
      const col = document.createElement('span');
      col.className = 'hud-col';
      const v = document.createElement('span');
      v.className = 'v'; v.textContent = '0';
      const lab = document.createElement('span');
      lab.className = 'hud-label'; lab.textContent = LABELS[k];
      col.append(v, lab);
      item.append(ic, col);
      this.el.appendChild(item);
      this.vals.set(k, v); this.items.set(k, item);
      ic.dataset.icon = String(ICON_OF[k]);
    }
    // 怨气条（永不显示数字）
    const anger = document.createElement('div');
    anger.className = 'hud-anger'; anger.title = '选手怨气（感觉）';
    this.angerBar = document.createElement('i');
    anger.appendChild(this.angerBar);
    this.el.appendChild(anger);
    // 温度计
    const th = document.createElement('span');
    th.className = 'hud-thermo'; th.title = '热搜温度计';
    this.thermo = document.createElement('canvas');
    this.thermo.className = 'ic'; this.thermo.width = 18; this.thermo.height = 18;
    this.thermo.dataset.icon = String(ICON.thermoGreen);
    th.appendChild(this.thermo);
    this.el.appendChild(th);
    // 静音
    this.muteBtn = document.createElement('button');
    this.muteBtn.className = 'hud-mute'; this.muteBtn.textContent = '♪';
    this.el.appendChild(this.muteBtn);
    // seed
    const seed = document.createElement('span');
    seed.className = 'hud-seed';
    this.el.appendChild(seed);
    this.seedEl = seed;
  }
  private seedEl: HTMLElement;

  private renderIcons() {
    if (!this.iconsImg) return;
    const draw = (cv: HTMLCanvasElement) => {
      const idx = Number(cv.dataset.icon);
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 18, 18);
      ctx.drawImage(this.iconsImg!, (idx % ICON_COLS) * ICON_CELL, Math.floor(idx / ICON_COLS) * ICON_CELL, ICON_CELL, ICON_CELL, 0, 0, 18, 18);
    };
    this.el.querySelectorAll<HTMLCanvasElement>('canvas.ic').forEach(draw);
  }

  update(s: { money: number; buzz: number; gov: number; rep: number; chaos: number; anger: number; risk: number; seed: string }) {
    const set = (k: string, v: string) => { const el = this.vals.get(k); if (el && el.textContent !== v) el.textContent = v; };
    set('money', s.money >= 10000 ? `¥${(s.money / 10000).toFixed(1)}万` : `¥${s.money}`);
    set('buzz', String(s.buzz)); set('gov', String(s.gov));
    set('rep', String(s.rep)); set('chaos', String(s.chaos));
    this.angerBar.style.width = `${Math.min(100, s.anger)}%`;
    const th = s.risk >= 70 ? ICON.thermoRed : s.risk >= 40 ? ICON.thermoYellow : ICON.thermoGreen;
    if (this.thermo.dataset.icon !== String(th)) {
      this.thermo.dataset.icon = String(th);
      this.renderIcons();
    }
    this.seedEl.textContent = s.seed;
  }

  statPulse(key: string, delta: number) {
    const item = this.items.get(key);
    if (!item) return;
    item.classList.remove('up', 'down');
    void item.offsetWidth;
    item.classList.add(delta > 0 ? 'up' : 'down');
  }
}
