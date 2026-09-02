// 像素会场：精修像素插画铺底 + 一体式工位（桌+椅+电脑+人）+ NPC 固定折线路径 + 程序化横幅
// 坐标系：归一化 0-1，画布固定 768×480
import { A, SPRITES, SPRITE_CELL, STATION_CELL, STATION_COUNT, STATION_FRAME, loadImg, getImg } from './assets';
import type { RunState } from '../engine/types';

const W = 768, H = 480;
const STATION_H = 88;   // 工位基准渲染高度
const NPC_H = 60;       // NPC 基准渲染高度

interface VenueLayout {
  bg: string;
  seats: [number, number][];        // 工位摆放位（锚点=脚底中心）
  stage: [number, number];          // 领导/讲台位
  sponsorSpot: [number, number];    // 赞助商站台位
  paths: Record<string, [number, number][]>; // NPC 固定折线路径（往返）
  bannerY: number;
}

const LAYOUTS: Record<string, VenueLayout> = {
  school: {
    bg: 'ui/bg_school.png',
    seats: [
      [0.16, 0.56], [0.30, 0.56], [0.46, 0.57], [0.62, 0.56], [0.78, 0.57],
      [0.20, 0.68], [0.36, 0.69], [0.52, 0.68], [0.68, 0.69], [0.84, 0.68],
      [0.14, 0.80], [0.30, 0.81], [0.48, 0.80], [0.64, 0.81], [0.80, 0.80],
      [0.22, 0.92], [0.40, 0.93], [0.58, 0.92], [0.74, 0.92],
    ],
    stage: [0.68, 0.46],
    sponsorSpot: [0.80, 0.47],
    paths: {
      photographer: [[0.10, 0.62], [0.90, 0.62], [0.90, 0.94], [0.10, 0.94]],
      volunteer: [[0.08, 0.90], [0.92, 0.90]],
      delivery: [[0.98, 0.86], [0.50, 0.72]],
    },
    bannerY: 0.02,
  },
  cowork: {
    bg: 'ui/bg_cowork.png',
    seats: [
      [0.22, 0.56], [0.34, 0.55], [0.46, 0.56], [0.58, 0.55], [0.70, 0.56], [0.82, 0.55],
      [0.26, 0.68], [0.40, 0.69], [0.54, 0.68], [0.68, 0.69], [0.82, 0.68],
      [0.16, 0.82], [0.32, 0.84], [0.48, 0.82], [0.64, 0.84], [0.80, 0.82],
      [0.28, 0.94], [0.50, 0.95], [0.72, 0.94],
    ],
    stage: [0.72, 0.45],
    sponsorSpot: [0.84, 0.46],
    paths: {
      photographer: [[0.08, 0.60], [0.92, 0.60], [0.92, 0.92], [0.08, 0.92]],
      volunteer: [[0.10, 0.88], [0.90, 0.88]],
      delivery: [[0.98, 0.84], [0.50, 0.70]],
    },
    bannerY: 0.02,
  },
  park: {
    bg: 'ui/bg_park.png',
    seats: [
      [0.16, 0.62], [0.30, 0.64], [0.44, 0.62], [0.58, 0.64], [0.72, 0.62], [0.86, 0.64],
      [0.20, 0.76], [0.36, 0.78], [0.52, 0.76], [0.68, 0.78], [0.84, 0.76],
      [0.16, 0.90], [0.34, 0.92], [0.52, 0.90], [0.70, 0.92], [0.88, 0.90],
    ],
    stage: [0.50, 0.42],
    sponsorSpot: [0.63, 0.43],
    paths: {
      photographer: [[0.10, 0.66], [0.90, 0.66], [0.90, 0.94], [0.10, 0.94]],
      volunteer: [[0.08, 0.88], [0.92, 0.88]],
      delivery: [[0.98, 0.84], [0.50, 0.70]],
    },
    bannerY: 0.02,
  },
};

type StationState = 'code' | 'sleep' | 'stand' | 'phone';

interface Station {
  style: number;            // 0-7 造型，-1 = 空位
  x: number; y: number;
  state: StationState;
  frameT: number;           // 状态剩余时间
}

interface Npc {
  proto: 'npc_leader' | 'npc_photographer' | 'npc_volunteer' | 'npc_sponsor' | 'npc_delivery';
  x: number; y: number;
  path: [number, number][]; // 固定折线（往返）
  wp: number;               // 当前目标路点
  dir: 1 | -1;              // 往返方向
  speed: number;
  moving: boolean;
  flashT?: number;
}

export class PixelScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stations: Station[] = [];
  private npcs: Npc[] = [];
  private layout: VenueLayout = LAYOUTS.school;
  private bgImg: HTMLImageElement | null = null;
  private stationImgs: HTMLImageElement[] = [];
  private spriteImgs = new Map<string, HTMLImageElement>();
  private bannerNames: string[] = [];
  private nightAlpha = 0;
  private hackProgress = 0;
  private active = false;
  private animT = 0;
  private leaderOn = false;
  private bloat = false;
  private deliverySent = false;

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
    this.bannerNames = state.sponsors.filter(s => !s.allied).map(s => s.name);
    this.leaderOn = state.patronId === 'gov' || state.venueId === 'park';
    this.bloat = state.chaos >= 4;
    this.deliverySent = false;

    const jobs: Promise<HTMLImageElement>[] = [loadImg(A(this.layout.bg))];
    for (let i = 0; i < STATION_COUNT; i++) jobs.push(loadImg(A(`sprites/station_${i}.png`)));
    for (const n of ['npc_leader', 'npc_photographer', 'npc_volunteer', 'npc_sponsor', 'npc_delivery']) {
      jobs.push(loadImg(A(`sprites/${n}.png`)));
    }
    await Promise.all(jobs);
    this.bgImg = getImg(A(this.layout.bg))!;
    this.stationImgs = [];
    for (let i = 0; i < STATION_COUNT; i++) this.stationImgs.push(getImg(A(`sprites/station_${i}.png`))!);
    for (const n of ['npc_leader', 'npc_photographer', 'npc_volunteer', 'npc_sponsor', 'npc_delivery']) {
      this.spriteImgs.set(n, getImg(A(`sprites/${n}.png`))!);
    }
    this.spawn(state);
    this.active = true;
  }

  exit() { this.active = false; this.stations = []; this.npcs = []; }
  setProgress(p: number) { this.hackProgress = Math.max(0, Math.min(1, p)); }

  notify(cardId: string) {
    if (cardId === 'E12' && !this.deliverySent) {
      this.deliverySent = true;
      const path = this.layout.paths.delivery;
      this.npcs.push({
        proto: 'npc_delivery', x: path[0][0], y: path[0][1],
        path, wp: 1, dir: 1, speed: 0.10, moving: true,
      });
    }
  }

  /** 种子稳定的洗牌（同工位造型不相邻） */
  private shuffledStyles(seed: string, n: number): number[] {
    let v = 0;
    for (const c of seed) v = (v * 31 + c.charCodeAt(0)) >>> 0;
    const base = Array.from({ length: STATION_COUNT }, (_, i) => i);
    for (let i = base.length - 1; i > 0; i--) {
      v = (v * 1103515245 + 12345) >>> 0;
      const j = v % (i + 1);
      [base[i], base[j]] = [base[j], base[i]];
    }
    return Array.from({ length: n }, (_, i) => base[i % STATION_COUNT]);
  }

  private spawn(state: RunState) {
    this.stations = [];
    this.npcs = [];
    const seats = this.layout.seats;
    const crowd = Math.min(seats.length, Number(state.flags.crowd ?? 15));
    const styles = this.shuffledStyles(state.seed, crowd);
    for (let i = 0; i < seats.length; i++) {
      const occupied = i < crowd;
      this.stations.push({
        style: occupied ? styles[i] : -1,
        x: seats[i][0], y: seats[i][1],
        state: 'code', frameT: 1 + Math.random() * 3,
      });
    }
    const [sx, sy] = this.layout.stage;
    if (this.leaderOn) {
      this.npcs.push({ proto: 'npc_leader', x: sx, y: sy, path: [[sx, sy]], wp: 0, dir: 1, speed: 0, moving: false });
    }
    if (state.sponsors.length) {
      const [px, py] = this.layout.sponsorSpot;
      this.npcs.push({ proto: 'npc_sponsor', x: px, y: py, path: [[px, py]], wp: 0, dir: 1, speed: 0, moving: false });
    }
    // 摄影师：固定环形折线
    const phPath = this.layout.paths.photographer;
    this.npcs.push({
      proto: 'npc_photographer', x: phPath[0][0], y: phPath[0][1],
      path: phPath, wp: 1, dir: 1, speed: 0.07, moving: true, flashT: 0,
    });
    // 志愿者：底部固定巡逻线
    if (state.flags.volunteers) {
      const vPath = this.layout.paths.volunteer;
      for (let i = 0; i < 3; i++) {
        const t = 0.2 + i * 0.3;
        const x = vPath[0][0] + (vPath[1][0] - vPath[0][0]) * t;
        this.npcs.push({
          proto: 'npc_volunteer', x, y: vPath[0][1],
          path: vPath, wp: i % 2, dir: i % 2 ? -1 : 1, speed: 0.08 + i * 0.01, moving: true,
        });
      }
    }
  }

  /** 怨气驱动的工位状态转移 */
  private nextStationState(st: Station, anger: number) {
    const r = Math.random();
    const sleepP = anger >= 70 ? 0.32 : anger >= 40 ? 0.15 : 0.04;
    const phoneP = anger >= 70 ? 0.24 : anger >= 40 ? 0.18 : 0.10;
    const standP = anger >= 85 ? 0.14 : anger >= 70 ? 0.06 : 0.01; // 高怨气：站起来理论
    if (r < sleepP) { st.state = 'sleep'; st.frameT = 2.5 + Math.random() * 3; }
    else if (r < sleepP + phoneP) { st.state = 'phone'; st.frameT = 2 + Math.random() * 2.5; }
    else if (r < sleepP + phoneP + standP) { st.state = 'stand'; st.frameT = 1.2 + Math.random() * 1.5; }
    else { st.state = 'code'; st.frameT = 2.5 + Math.random() * 3.5; }
  }

  tick(dt: number, anger: number) {
    if (!this.active || !this.bgImg) return;
    this.animT += dt;
    this.nightAlpha += ((this.hackProgress * 0.35) - this.nightAlpha) * Math.min(1, dt * 0.5);

    for (const st of this.stations) {
      if (st.style < 0) continue;
      st.frameT -= dt;
      if (st.frameT <= 0) this.nextStationState(st, anger);
    }
    for (const n of this.npcs) {
      if (n.proto === 'npc_photographer') {
        n.flashT = Math.max(0, (n.flashT ?? 0) - dt);
        if (Math.random() < dt * 0.15) n.flashT = 0.25;
      }
      if (!n.moving || n.path.length < 2) continue;
      const [tx, ty] = n.path[n.wp];
      const dx = tx - n.x, dy = ty - n.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.006) {
        n.x += (dx / dist) * n.speed * dt;
        n.y += (dy / dist) * n.speed * dt;
      } else {
        // 到达路点：往返推进（delivery 到终点后停下）
        if (n.proto === 'npc_delivery' && n.wp === n.path.length - 1) { n.moving = false; continue; }
        let next = n.wp + n.dir;
        if (next >= n.path.length || next < 0) { n.dir = (n.dir * -1) as 1 | -1; next = n.wp + n.dir; }
        n.wp = next;
      }
    }
    this.render(anger);
  }

  private shadow(x: number, y: number, w: number) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.28)';
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, w, w * 0.28, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawBanner(name: string, x: number, y: number): number {
    const { ctx } = this;
    ctx.font = 'bold 11px "Noto Sans SC", sans-serif';
    const tw = ctx.measureText(name).width;
    const bw = tw + 16, bh = 18;
    // 红绸横幅 + 金色包边
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#8B0A20';
    ctx.fillRect(x, y + bh - 3, bw, 3);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x, y, bw, 1);
    // 两端挂绳
    ctx.fillStyle = '#5c5c5c';
    ctx.fillRect(x + 2, y - 4, 1, 4);
    ctx.fillRect(x + bw - 3, y - 4, 1, 4);
    ctx.fillStyle = '#FFE9A8';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 8, y + bh / 2 + 0.5);
    return bw;
  }

  private render(anger: number) {
    const { ctx } = this;
    ctx.clearRect(0, 0, W, H);
    // 1. 插画铺底
    ctx.drawImage(this.bgImg!, 0, 0, W, H);

    // 2. 实体层（工位 + NPC 按 y 排序）
    type Ent = { y: number; draw: () => void };
    const ents: Ent[] = [];
    for (const st of this.stations) {
      ents.push({
        y: st.y,
        draw: () => {
          const img = this.stationImgs[st.style < 0 ? (Math.abs(Math.floor(st.x * 100)) % STATION_COUNT) : st.style];
          const frame = st.style < 0 ? STATION_FRAME.empty : STATION_FRAME[st.state];
          const h = STATION_H * (0.72 + st.y * 0.45);
          const w = h; // 方形 cell
          const px = st.x * W, py = st.y * H;
          this.shadow(px, py + 2, w * 0.32);
          ctx.drawImage(img, frame * STATION_CELL, 0, STATION_CELL, STATION_CELL, px - w / 2, py - h + 4, w, h);
        },
      });
    }
    for (const n of this.npcs) {
      ents.push({
        y: n.y,
        draw: () => {
          const meta = SPRITES[n.proto];
          const img = this.spriteImgs.get(n.proto);
          if (!img || !meta) return;
          const frames = n.moving ? meta.walk : meta.stand;
          let idx = frames[Math.floor(this.animT * 4 + n.x * 10) % frames.length];
          if (n.proto === 'npc_photographer' && (n.flashT ?? 0) > 0) idx = 1;
          if (n.proto === 'npc_leader') idx = this.animT % 1.2 < 0.6 ? 0 : 1;
          const h = NPC_H * (0.72 + n.y * 0.45);
          const px = n.x * W, py = n.y * H;
          this.shadow(px, py + 2, h * 0.26);
          ctx.drawImage(img, idx * SPRITE_CELL, 0, SPRITE_CELL, SPRITE_CELL, px - h / 2, py - h + 4, h, h);
        },
      });
    }
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    // 摄影师闪光灯
    const ph = this.npcs.find(n => n.proto === 'npc_photographer');
    if (ph && (ph.flashT ?? 0) > 0) {
      ctx.fillStyle = 'rgba(255,255,230,0.20)';
      ctx.fillRect(0, 0, W, H);
    }

    // 3. 程序化赞助商横幅（顶部红绸条，超过 5 个换两行）
    const names = this.bannerNames.slice(0, 10);
    const rows = names.length > 5 ? [names.slice(0, Math.ceil(names.length / 2)), names.slice(Math.ceil(names.length / 2))] : [names];
    ctx.textBaseline = 'middle';
    rows.forEach((rowNames, ri) => {
      ctx.font = 'bold 11px "Noto Sans SC", sans-serif';
      const widths = rowNames.map(n => ctx.measureText(n).width + 16);
      const totalW = widths.reduce((a, b) => a + b, 0) + (rowNames.length - 1) * 8;
      let x = W / 2 - totalW / 2;
      const y = this.layout.bannerY * H + ri * 24 + 6;
      rowNames.forEach((n, i) => {
        this.drawBanner(n, x, y);
        x += widths[i] + 8;
      });
    });

    // 4. 昼夜叠加（入夜加深 + 敲代码工位屏幕荧光）
    if (this.nightAlpha > 0.01) {
      ctx.fillStyle = `rgba(8,16,32,${this.nightAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      if (this.nightAlpha > 0.12) {
        ctx.fillStyle = 'rgba(76,201,240,0.10)';
        for (const st of this.stations) {
          if (st.style >= 0 && st.state === 'code') {
            const h = STATION_H * (0.72 + st.y * 0.45);
            ctx.fillRect(st.x * W - h * 0.20, st.y * H - h * 0.68, h * 0.4, h * 0.26);
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
