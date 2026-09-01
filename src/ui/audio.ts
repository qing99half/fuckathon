// WebAudio 程序化 8-bit：BGM 循环 + SFX，零音频文件
type Wave = OscillatorType;
interface Note { f: number; t: number; d: number; w?: Wave; v?: number; }

const N = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// 简易循环谱（音高 midi, 时值拍）
const TRACKS: Record<string, { bpm: number; seq: [number, number][]; wave: Wave; bass?: [number, number][] }> = {
  prep: { bpm: 112, wave: 'square', seq: [[72, .5], [76, .5], [79, .5], [76, .5], [74, .5], [77, .5], [81, .5], [77, .5]] },
  hack: { bpm: 96, wave: 'square', seq: [[60, 1], [63, 1], [67, 1], [65, 1]] , bass: [[36, 1], [36, 1], [41, 1], [43, 1]] },
  judge: { bpm: 72, wave: 'triangle', seq: [[57, 1], [57, 1], [60, 1], [56, 2]], bass: [[33, 2], [33, 2]] },
  award: { bpm: 120, wave: 'square', seq: [[72, .5], [72, .25], [72, .25], [76, .5], [79, .5], [84, 1], [79, .5], [76, .5]] },
  title: { bpm: 80, wave: 'triangle', seq: [[69, 1], [72, 1], [76, 1], [74, 1]] },
};

export class Audio8 {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private trackTimer: number | null = null;
  private curTrack = '';
  muted = localStorage.getItem('fuckathon.muted') === '1';

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.16;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('fuckathon.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.16;
    return this.muted;
  }

  bgm(name: keyof typeof TRACKS | string) {
    if (this.curTrack === name) return;
    this.curTrack = name;
    this.stopLoop();
    const t = TRACKS[name];
    if (!t) return;
    this.ensure();
    const beat = 60 / t.bpm;
    let i = 0, bi = 0;
    const step = () => {
      if (!this.ctx || this.muted) { i++; bi++; return; }
      const [m, d] = t.seq[i % t.seq.length];
      this.tone(N(m), d * beat, t.wave, 0.5);
      if (t.bass) {
        const [bm, bd] = t.bass[bi % t.bass.length];
        this.tone(N(bm), bd * beat, 'triangle', 0.6);
      }
      i++; bi++;
    };
    step();
    this.trackTimer = window.setInterval(step, beat * 500);
  }

  private stopLoop() {
    if (this.trackTimer) { clearInterval(this.trackTimer); this.trackTimer = null; }
  }

  private tone(freq: number, dur: number, wave: Wave, vol = 0.5) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }

  private noise(dur: number, vol = 0.4) {
    if (!this.ctx || !this.master) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    src.connect(g); g.connect(this.master);
    src.start();
  }

  sfx(name: string) {
    this.ensure();
    if (this.muted) return;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'square', 0.3); break;
      case 'flip': this.tone(440, 0.08, 'square', 0.3); this.tone(660, 0.06, 'square', 0.2); break;
      case 'pop': this.tone(1200, 0.04, 'sine', 0.25); break;
      case 'alarm':
        this.noise(0.4, 0.5);
        this.tone(220, 0.4, 'sawtooth', 0.5);
        setTimeout(() => this.tone(180, 0.5, 'sawtooth', 0.5), 250);
        break;
      case 'fanfare':
        [72, 76, 79, 84].forEach((m, i) => setTimeout(() => this.tone(N(m), 0.25, 'square', 0.5), i * 130));
        break;
      case 'unlock':
        [60, 64, 67, 72, 76].forEach((m, i) => setTimeout(() => this.tone(N(m), 0.2, 'triangle', 0.5), i * 100));
        break;
    }
  }
}
