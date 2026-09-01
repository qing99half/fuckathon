// 种子随机数：mulberry32，可复现
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeSeed(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rand = mulberry32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  const pick = () => chars[Math.floor(rand() * chars.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private f: () => number;
  constructor(public state: number) { this.f = mulberry32(state); }
  next(): number { const v = this.f(); return v; }
  /** 概率检定：p 为 0-1 */
  chance(p: number): boolean { return this.next() < p; }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** 从池中按权重抽 n 个不重复 */
  weighted<T extends { weight?: number }>(pool: T[], n: number): T[] {
    const a = [...arr0(pool)]; const out: T[] = [];
    while (out.length < n && a.length) {
      const total = a.reduce((s, x) => s + (x.weight ?? 1), 0);
      let r = this.next() * total;
      let idx = 0;
      for (let i = 0; i < a.length; i++) { r -= a[i].weight ?? 1; if (r <= 0) { idx = i; break; } }
      out.push(a.splice(idx, 1)[0]);
    }
    return out;
  }
}
function arr0<T>(x: T[]) { return x; }
