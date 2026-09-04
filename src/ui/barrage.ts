// 弹幕引擎：B 站式不重叠滚动弹幕。rAF 逐帧驱动，轨道防重叠（追车不等式），
// 同屏目标 18-22 条（评审期 12-16），C 档加速 20% 带火焰，联动弹幕插队高亮，一局内不重复
import { A, ICON, ICON_COLS, ICON_CELL, loadImg } from './assets';
import { BARRAGES } from '../engine/data';

const LANE_H = 22;
const POOL_MAX = 24;
const BASE_SPEED = 105;      // px/s
const SPEED_JITTER = 45;

interface Live {
  el: HTMLElement; x: number; w: number; v: number; lane: number; busy: boolean;
}
interface Queued { text: string; cls: string; }

export class Barrage {
  private box: HTMLElement;
  private pool: Live[] = [];
  private lanes: { count: number; top: number[] } = { count: 8, top: [] };
  private queueLinked: Queued[] = [];
  private queueNormal: Queued[] = [];
  private ambient: string[] = [];   // 本局氛围弹幕墙（洗牌遍历，不重复）
  private ambientIdx = 0;
  private ambientTier = '';
  private fireIcon: HTMLCanvasElement | null = null;
  private ro: ResizeObserver;

  constructor(private stage: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'barrage-box';
    stage.appendChild(this.box);
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(stage);
    this.measure();
    loadImg(A('icons_1.png')).then(im => {
      const cv = document.createElement('canvas');
      cv.width = 14; cv.height = 14;
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, (ICON.chaos % ICON_COLS) * ICON_CELL, Math.floor(ICON.chaos / ICON_COLS) * ICON_CELL, ICON_CELL, ICON_CELL, 0, 0, 14, 14);
      this.fireIcon = cv;
    });
  }

  private measure() {
    const h = this.stage.clientHeight || 600;
    const usable = Math.floor(h * 0.62); // 弹幕占上部 62%，不压底部选项卡
    const count = Math.max(6, Math.min(14, Math.floor(usable / LANE_H)));
    this.lanes = { count, top: Array.from({ length: count }, (_, i) => 6 + i * LANE_H) };
  }

  /** 事件弹幕入队。linked 插队优先 */
  push(lines: string[], opts?: { linked?: boolean; cTier?: boolean }) {
    for (const t of lines) {
      const q: Queued = { text: t, cls: opts?.linked ? 'linked' : opts?.cTier ? 'c' : '' };
      (opts?.linked ? this.queueLinked : this.queueNormal).push(q);
    }
  }

  /** 每帧驱动。active=false 时不再发射新弹，但存量继续滚出屏幕（阶段切换不清屏、不定格） */
  tick(dt: number, active: boolean, anger = 0, phase = '') {
    const W = this.box.clientWidth || 400;

    // 1. 推进 & 回收（无论是否 active 都执行，弹幕自然滚尽）
    for (const it of this.pool) {
      if (!it.busy) continue;
      it.x -= it.v * dt;
      if (it.x + it.w < -8) { it.busy = false; it.el.style.display = 'none'; }
      else it.el.style.transform = `translate3d(${it.x}px,0,0)`;
    }
    if (!active) return;

    // 2. 发射：联动 > 事件 > 氛围补弹
    const target = phase === 'judge' ? 14 : 20;
    const alive = this.pool.filter(i => i.busy).length;
    let deficit = Math.max(0, target - alive);

    this.ensureAmbient(anger);
    while (deficit > 0) {
      let q: Queued | undefined = this.queueLinked.shift() ?? this.queueNormal.shift();
      const fromQueue = q !== undefined;
      if (!q && deficit >= 2) q = this.nextAmbient() ?? undefined; // 欠 2 条以上才补氛围弹
      if (!q) break;
      if (!this.trySpawn(q, W)) {
        if (fromQueue) (q.cls === 'linked' ? this.queueLinked : this.queueNormal).unshift(q);
        break;
      }
      deficit--;
    }
  }

  private ensureAmbient(anger: number) {
    const tier = anger >= 70 ? 'C' : anger >= 40 ? 'B' : 'A';
    if (tier !== this.ambientTier || this.ambientIdx >= this.ambient.length) {
      this.ambientTier = tier;
      this.ambient = [...BARRAGES[tier]].sort(() => Math.random() - 0.5);
      this.ambientIdx = 0;
    }
  }

  private nextAmbient(): Queued | null {
    if (this.ambientIdx >= this.ambient.length) return null;
    const text = this.ambient[this.ambientIdx++];
    return { text, cls: this.ambientTier === 'C' ? 'c' : '' };
  }

  /** 追车不等式：新弹不会在旧弹出屏前追上它 */
  private laneFree(lane: number, v: number, W: number): boolean {
    const tail = [...this.pool].reverse().find(i => i.busy && i.lane === lane);
    if (!tail) return true;
    const tailBack = tail.x + tail.w;
    if (tailBack >= W - 4) return false; // 队尾还没完全入屏
    if (v <= tail.v) return true;
    const tCatch = (W - tailBack) / (v - tail.v);
    const tExit = tailBack / tail.v;
    return tCatch > tExit;
  }

  private trySpawn(q: Queued, W: number): boolean {
    const v = (BASE_SPEED + Math.random() * SPEED_JITTER) * (q.cls === 'c' ? 1.2 : 1);
    // 随机试 6 条轨道
    for (let t = 0; t < 6; t++) {
      const lane = Math.floor(Math.random() * this.lanes.count);
      if (!this.laneFree(lane, v, W)) continue;
      let it = this.pool.find(i => !i.busy);
      if (!it) {
        if (this.pool.length >= POOL_MAX) return false;
        const el = document.createElement('div');
        this.box.appendChild(el);
        it = { el, x: 0, w: 0, v: 0, lane, busy: false };
        this.pool.push(it);
      }
      const el = it.el;
      el.className = `barrage-item ${q.cls}`;
      el.textContent = q.text;
      if (q.cls === 'c' && this.fireIcon) {
        const f = document.createElement('canvas');
        f.width = 14; f.height = 14; f.className = 'fire';
        f.getContext('2d')!.drawImage(this.fireIcon, 0, 0);
        el.prepend(f);
      }
      el.style.top = `${this.lanes.top[lane]}px`;
      el.style.display = 'flex';
      el.style.transform = `translate3d(${W}px,0,0)`;
      it.w = el.offsetWidth || q.text.length * 15 + 20;
      it.x = W; it.v = v; it.lane = lane; it.busy = true;
      return true;
    }
    return false;
  }

  clear() {
    this.queueLinked.length = 0;
    this.queueNormal.length = 0;
    this.ambientIdx = 0;
    for (const i of this.pool) { i.busy = false; i.el.style.display = 'none'; }
  }
}
