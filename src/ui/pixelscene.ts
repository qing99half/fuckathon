// 像素会场：精修像素插画铺底 + 实体层（小人/NPC/横幅/昼夜/CRT 暗角）
// 坐标系：归一化 0-1，画布固定 768×480
import { A, SPRITES, PLAYER_PROTOS, SPRITE_CELL, BANNER_OF, BANNER_CELL, loadImg, getImg } from './assets';
import type { RunState } from '../engine/types';

const W = 768, H = 480;
const SPRITE_H = 60; // 小人基准渲染高度（按 y 伪深度缩放）

interface VenueLayout {
  bg: string;
  seats: [number, number][];      // 选手固定位（桌前）
  walk: [number, number, number, number]; // 可走区域 x0,y0,x1,y1
  stage: [number, number];        // 领导/讲台位
  bannerY: number;                // 横幅条 y
}

const LAYOUTS: Record<string, VenueLayout> = {
  school: {
    bg: 'ui/bg_school.png',
    seats: [
      [0.16, 0.56], [0.30, 0.56], [0.46, 0.57], [0.62, 0.56], [0.78, 0.57],
      [0.20, 0.66], [0.36, 0.67], [0.52, 0.66], [0.68, 0.67], [0.84, 0.66],
      [0.14, 0.78], [0.30, 0.79], [0.48, 0.78], [0.64, 0.79], [0.80, 0.78],
      [0.22, 0.90], [0.40, 0.91], [0.58, 0.90], [0.74, 0.90],
    ],
    walk: [0.06, 0.60, 0.94, 0.96],
    stage: [0.62, 0.47],
    bannerY: 0.02,
  },
  cowork: {
    bg: 'ui/bg_cowork.png',
    seats: [
      [0.30, 0.56], [0.40, 0.55], [0.50, 0.56], [0.60, 0.55], [0.70, 0.56],
      [0.34, 0.66], [0.46, 0.67], [0.58, 0.66], [0.70, 0.67],
      [0.16, 0.86], [0.30, 0.88], [0.46, 0.86],
      [0.62, 0.80], [0.76, 0.82], [0.88, 0.80],
    ],
    walk: [0.08, 0.58, 0.92, 0.96],
    stage: [0.50, 0.44],
    bannerY: 0.02,
  },
  park: {
    bg: 'ui/bg_park.png',
    seats: [
      [0.10, 0.66], [0.18, 0.70], [0.26, 0.74], [0.10, 0.78], [0.18, 0.82], [0.26, 0.86],
      [0.74, 0.66], [0.82, 0.70], [0.90, 0.74], [0.74, 0.78], [0.82, 0.82], [0.90, 0.86],
      [0.08, 0.90], [0.24, 0.94], [0.76, 0.90], [0.92, 0.94],
    ],
    walk: [0.36, 0.64, 0.64, 0.96],
    stage: [0.50, 0.56],
    bannerY: 0.02,
  },
};

interface Person {
  proto: string; x: number; y: number; tx: number; ty: number;
  state: 'code' | 'sleep' | 'walk' | 'stand';
  frame: number; frameT: number; homeX: number; homeY: number; speed: number;
  npc?: 'leader' | 'photographer' | 'volunteer' | 'sponsor' | 'delivery';
  flashT?: number;
}

export class PixelScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private persons: Person[] = [];
  private layout: VenueLayout = LAYOUTS.school;
  private bgImg: HTMLImageElement | null = null;
  private bannerImgs: HTMLImageElement[] = [];
  private spriteImgs = new Map<string, HTMLImageElement>();
  private banners: string[] = [];
  private nightAlpha = 0;
  private hackProgress = 0;
  private active = false;
  private animT = 0;
  private leaderOn = false;
  private showDelivery = false;
  private bloat = false;

  constructor(private stage: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scene-canvas';
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    stage.insertBefore(this.canvas, stage.firstChild);
  }

  async enter(state: RunState) {
    this.layout = LAYOUTS[state.venueId] ?? LAYOUTS.school;
    this.banners = state.sponsors.filter(s => !s.allied).map(s => s.id);
    this.leaderOn = state.patronId === 'gov' || state.venueId === 'park';
    this.showDelivery = false;
    this.bloat = state.chaos >= 4;

    const jobs: Promise<HTMLImageElement>[] = [
      loadImg(A(this.layout.bg)), loadImg(A('banners_1.png')), loadImg(A('banners_2.png')),
    ];
    for (const p of PLAYER_PROTOS) jobs.push(loadImg(A(`sprites/${p}.png`)));
    for (const n of ['npc_leader', 'npc_photographer', 'npc_volunteer', 'npc_sponsor', 'npc_delivery']) {
      jobs.push(loadImg(A(`sprites/${n}.png`)));
    }
    await Promise.all(jobs);
    this.bgImg = getImg(A(this.layout.bg))!;
    this.bannerImgs = [getImg(A('banners_1.png'))!, getImg(A('banners_2.png'))!];
    for (const p of [...PLAYER_PROTOS, 'npc_leader', 'npc_photographer', 'npc_volunteer', 'npc_sponsor', 'npc_delivery']) {
      this.spriteImgs.set(p, getImg(A(`sprites/${p}.png`))!);
    }
    this.spawnPeople(state);
    this.active = true;
  }

  exit() { this.active = false; this.persons = []; }
  setProgress(p: number) { this.hackProgress = Math.max(0, Math.min(1, p)); }

  notify(cardId: string) {
    if (cardId === 'E12') this.showDelivery = true;
  }

  private randWalk(): [number, number] {
    const [x0, y0, x1, y1] = this.layout.walk;
    return [x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0)];
  }

  private spawnPeople(state: RunState) {
    this.persons = [];
    const seats = this.layout.seats;
    const crowd = Number(state.flags.crowd ?? 15);
    const n = Math.min(seats.length, crowd + (state.seed.length % 3) - 1);
    for (let i = 0; i < n; i++) {
      const home = seats[i % seats.length];
      this.persons.push({
        proto: PLAYER_PROTOS[i % PLAYER_PROTOS.length],
        x: home[0], y: home[1], tx: home[0], ty: home[1],
        homeX: home[0], homeY: home[1],
        state: 'code', frame: 0, frameT: Math.random(), speed: 0.10 + Math.random() * 0.06,
      });
    }
    const [sx, sy] = this.layout.stage;
    if (this.leaderOn) {
      this.persons.push({ proto: 'npc_leader', x: sx, y: sy, tx: sx, ty: sy, homeX: sx, homeY: sy, state: 'stand', frame: 0, frameT: 0, speed: 0, npc: 'leader' });
    }
    this.persons.push({ proto: 'npc_photographer', x: 0.2, y: 0.7, tx: 0.2, ty: 0.7, homeX: 0.2, homeY: 0.7, state: 'walk', frame: 0, frameT: 0, speed: 0.08, npc: 'photographer', flashT: 0 });
    if (state.sponsors.length) {
      this.persons.push({ proto: 'npc_sponsor', x: sx + 0.08, y: sy, tx: sx + 0.08, ty: sy, homeX: sx + 0.08, homeY: sy, state: 'stand', frame: 0, frameT: 0, speed: 0, npc: 'sponsor' });
    }
    if (state.flags.volunteers) {
      for (let i = 0; i < 3; i++) {
        const wx = 0.15 + i * 0.3;
        this.persons.push({ proto: 'npc_volunteer', x: wx, y: 0.9, tx: wx, ty: 0.9, homeX: wx, homeY: 0.9, state: 'walk', frame: 0, frameT: 0, speed: 0.09, npc: 'volunteer' });
      }
    }
    if (this.showDelivery) {
      this.persons.push({ proto: 'npc_delivery', x: 0.5, y: 0.95, tx: 0.5, ty: 0.8, homeX: 0.5, homeY: 0.8, state: 'walk', frame: 0, frameT: 0, speed: 0.12, npc: 'delivery' });
    }
  }

  /** main 在每帧调用 */
  tick(dt: number, anger: number) {
    if (!this.active || !this.bgImg) return;
    this.animT += dt;
    this.nightAlpha += ((this.hackProgress * 0.35) - this.nightAlpha) * Math.min(1, dt * 0.5);

    for (const p of this.persons) {
      if (p.npc === 'leader') { p.frame = this.animT % 1.2 < 0.6 ? 0 : 1; continue; }
      p.frameT -= dt;
      if (p.npc) {
        this.wander(p, dt);
        if (p.npc === 'photographer') {
          p.flashT = Math.max(0, (p.flashT ?? 0) - dt);
          if (Math.random() < dt * 0.15) p.flashT = 0.25;
        }
        continue;
      }
      // 选手：怨气驱动趴桌比例
      if (p.frameT <= 0) {
        const r = Math.random();
        const sleepP = anger >= 70 ? 0.5 : anger >= 40 ? 0.25 : 0.08;
        const walkP = 0.18;
        if (r < sleepP) { p.state = 'sleep'; p.frameT = 2 + Math.random() * 3; }
        else if (r < sleepP + walkP) {
          p.state = 'walk'; p.frameT = 1 + Math.random() * 2;
          const c = this.randWalk(); p.tx = c[0]; p.ty = c[1];
        }
        else if (r < sleepP + walkP + 0.12) { p.state = 'stand'; p.frameT = 1 + Math.random() * 2; }
        else { p.state = 'code'; p.frameT = 2 + Math.random() * 3; p.tx = p.homeX; p.ty = p.homeY; }
      }
      if (p.state === 'walk') this.wander(p, dt);
    }

    this.render(anger);
  }

  private wander(p: Person, dt: number) {
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.005) {
      p.x += (dx / dist) * p.speed * dt;
      p.y += (dy / dist) * p.speed * dt;
      p.state = 'walk';
    } else if (p.npc) {
      const c = this.randWalk(); p.tx = c[0]; p.ty = c[1];
      p.frameT = 1 + Math.random() * 3;
      p.state = 'walk';
    } else if (p.state === 'walk' && p.frameT <= 0) {
      p.state = 'stand';
    }
  }

  private render(anger: number) {
    const { ctx } = this;
    ctx.clearRect(0, 0, W, H);
    // 1. 插画铺底
    ctx.drawImage(this.bgImg!, 0, 0, W, H);

    // 2. 实体层（按 y 排序制造前后关系）
    const sorted = [...this.persons].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      const meta = SPRITES[p.proto];
      const img = this.spriteImgs.get(p.proto);
      if (!img || !meta) continue;
      const frames = meta[p.state] ?? meta.stand;
      let idx = frames[Math.floor(this.animT * 3 + p.homeX * 10) % frames.length];
      if (p.npc === 'photographer' && (p.flashT ?? 0) > 0) idx = 1;
      if (p.npc === 'leader') idx = p.frame;
      const h = SPRITE_H * (0.72 + p.y * 0.45); // 伪深度：越近越大
      ctx.drawImage(img, idx * SPRITE_CELL, 0, SPRITE_CELL, SPRITE_CELL,
        p.x * W - h / 2, p.y * H - h + 4, h, h);
      if (p.npc === 'photographer' && (p.flashT ?? 0) > 0) {
        ctx.fillStyle = 'rgba(255,255,230,0.22)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    // 3. 赞助商横幅条（顶部）
    const bw = BANNER_CELL.w * 1.5, bh = BANNER_CELL.h * 1.5;
    const list = this.banners.slice(0, 8);
    const totalW = list.length * (bw + 10) - 10;
    list.forEach((sp, i) => {
      const b = BANNER_OF[sp];
      if (!b) return;
      const img = this.bannerImgs[b.sheet - 1];
      ctx.drawImage(img, 0, b.idx * BANNER_CELL.h, BANNER_CELL.w, BANNER_CELL.h,
        W / 2 - totalW / 2 + i * (bw + 10), this.layout.bannerY * H, bw, bh);
    });

    // 4. 昼夜叠加（入夜加深 + 屏幕荧光）
    if (this.nightAlpha > 0.01) {
      ctx.fillStyle = `rgba(8,16,32,${this.nightAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      if (this.nightAlpha > 0.12) {
        ctx.fillStyle = 'rgba(76,201,240,0.10)';
        for (const p of this.persons) {
          if (p.state === 'code') {
            const h = SPRITE_H * (0.72 + p.y * 0.45);
            ctx.fillRect(p.x * W - h * 0.22, p.y * H - h * 0.72, h * 0.44, h * 0.3);
          }
        }
      }
    }

    // 5. CRT 暗角
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 6. 环节膨胀彩蛋：底部红色滚动字幕
    if (this.bloat) {
      ctx.fillStyle = '#C8102E';
      ctx.fillRect(0, H - 20, W, 20);
      ctx.fillStyle = '#F7F3EA';
      ctx.font = '12px sans-serif';
      const msg = '热烈祝贺本届大会圆满成功 · 感谢各赞助商鼎力支持 · 领导致辞进行中 · ';
      const off = (this.animT * 60) % (ctx.measureText(msg).width + W);
      ctx.fillText(msg, W - off, H - 6);
    }
  }
}
