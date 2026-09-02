// WebAudio 程序化 8-bit：四层编曲器（和弦垫+主旋律+贝斯+鼓组）
// lookahead 调度（25ms tick，提前 0.12s 排音），16 小节循环，零音频文件
type Wave = OscillatorType;

const N = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// 和弦：根音 midi + 音程
interface Chord { root: number; iv: number[] }
const MAJ = [0, 4, 7], MIN = [0, 3, 7], MAJ7 = [0, 4, 7, 11], MIN7 = [0, 3, 7, 10], DOM7 = [0, 4, 7, 10];
const C = (root: number, iv: number[]): Chord => ({ root, iv });

interface Track {
  bpm: number;
  chords: Chord[];          // 8 个和弦 × 2 小节 = 16 小节
  melodyWave: Wave;
  padWave: Wave;
  melodyVol: number; padVol: number; bassVol: number; drumVol: number;
  density: number;          // 主旋律音符密度 0-1
  seed: number;             // 旋律生成种子（确定性）
  drumStyle: 'four' | 'sparse' | 'march';
}

// 五阶段调性：title 舒缓 / prep 明亮 / hack 冲刺小调 / judge 压迫 / award 凯旋
const TRACKS: Record<string, Track> = {
  title: {
    bpm: 84, melodyWave: 'triangle', padWave: 'sine', density: 0.45, seed: 11, drumStyle: 'sparse',
    melodyVol: 0.34, padVol: 0.20, bassVol: 0.30, drumVol: 0.10,
    chords: [C(60, MAJ7), C(57, MIN7), C(53, MAJ7), C(55, DOM7), C(60, MAJ7), C(57, MIN7), C(53, MAJ7), C(55, DOM7)],
  },
  prep: {
    bpm: 112, melodyWave: 'square', padWave: 'triangle', density: 0.62, seed: 23, drumStyle: 'four',
    melodyVol: 0.22, padVol: 0.14, bassVol: 0.34, drumVol: 0.16,
    chords: [C(60, MAJ), C(55, MAJ), C(57, MIN), C(53, MAJ), C(60, MAJ), C(55, MAJ), C(53, MAJ), C(55, DOM7)],
  },
  hack: {
    bpm: 126, melodyWave: 'square', padWave: 'sawtooth', density: 0.72, seed: 37, drumStyle: 'four',
    melodyVol: 0.20, padVol: 0.10, bassVol: 0.36, drumVol: 0.20,
    chords: [C(57, MIN), C(53, MAJ), C(60, MAJ), C(55, MAJ), C(57, MIN), C(53, MAJ), C(55, DOM7), C(55, DOM7)],
  },
  judge: {
    bpm: 78, melodyWave: 'triangle', padWave: 'sawtooth', density: 0.38, seed: 51, drumStyle: 'sparse',
    melodyVol: 0.28, padVol: 0.12, bassVol: 0.34, drumVol: 0.12,
    chords: [C(50, MIN), C(58, MAJ), C(55, MIN), C(57, MIN), C(50, MIN), C(58, MAJ), C(57, DOM7), C(57, DOM7)],
  },
  award: {
    bpm: 118, melodyWave: 'square', padWave: 'triangle', density: 0.68, seed: 67, drumStyle: 'march',
    melodyVol: 0.24, padVol: 0.16, bassVol: 0.32, drumVol: 0.18,
    chords: [C(60, MAJ), C(53, MAJ), C(55, MAJ), C(60, MAJ), C(57, MIN), C(53, MAJ), C(55, DOM7), C(60, MAJ)],
  },
};

// 确定性旋律生成：和弦音为主 + 五声音阶经过音，带乐句呼吸感
function buildMelody(t: Track): (number | null)[] {
  const steps = 8 * 8 * 2; // 8 和弦 × 2 小节 × 8 八分音符
  const out: (number | null)[] = new Array(steps).fill(null);
  let v = t.seed * 2654435761 >>> 0;
  const rnd = () => { v = (v * 1103515245 + 12345) >>> 0; return v / 0xffffffff; };
  let cur = 0;
  for (let ci = 0; ci < t.chords.length; ci++) {
    const tones = t.chords[ci].iv.map(i => t.chords[ci].root + 12 + i); // 高八度旋律区
    for (let bar = 0; bar < 2; bar++) {
      for (let st = 0; st < 8; st++) {
        const gi = ci * 16 + bar * 8 + st;
        const strong = st % 4 === 0;
        const phraseEnd = bar === 1 && st >= 6;
        const p = strong ? t.density + 0.25 : phraseEnd ? t.density * 0.3 : t.density;
        if (rnd() < p) {
          // 70% 和弦音，30% 级进
          if (rnd() < 0.7 || cur === 0) {
            cur = tones[Math.floor(rnd() * tones.length)];
          } else {
            cur += rnd() < 0.5 ? 2 : -2;
            if (cur < tones[0] - 3) cur = tones[0];
            if (cur > tones[tones.length - 1] + 5) cur = tones[tones.length - 1];
          }
          out[gi] = cur;
        }
      }
    }
  }
  return out;
}

export class Audio8 {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private schedTimer: number | null = null;
  private nextT = 0;
  private step = 0;
  private curTrack = '';
  private melody: (number | null)[] = [];
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
    this.melody = buildMelody(t);
    this.step = 0;
    this.nextT = this.ctx!.currentTime + 0.06;
    // lookahead 调度：25ms 检查一次，提前 120ms 排音，无 setInterval 抖动
    this.schedTimer = window.setInterval(() => this.schedule(t), 25);
  }

  private schedule(t: Track) {
    if (!this.ctx) return;
    const stepDur = (60 / t.bpm) / 2; // 八分音符
    while (this.nextT < this.ctx.currentTime + 0.12) {
      if (!this.muted) this.playStep(t, this.step, this.nextT, stepDur);
      this.step = (this.step + 1) % (8 * 16);
      this.nextT += stepDur;
    }
  }

  private playStep(t: Track, step: number, at: number, stepDur: number) {
    const chord = t.chords[Math.floor(step / 16) % t.chords.length];
    const inBar = step % 8;
    // 1. 和弦垫：每小节第 1 拍触发，持续 1 小节
    if (inBar === 0) {
      for (const iv of chord.iv) {
        this.tone(N(chord.root + iv), stepDur * 8 * 0.95, t.padWave, t.padVol, at);
      }
    }
    // 2. 贝斯：强拍根音，弱拍五音/八度
    const bassNote = inBar === 0 ? chord.root - 12
      : inBar === 4 ? chord.root - 12 + 7
      : (inBar === 6 && t.drumStyle !== 'sparse') ? chord.root
      : null;
    if (bassNote !== null) this.tone(N(bassNote), stepDur * 1.6, 'triangle', t.bassVol, at);
    // 3. 主旋律
    const m = this.melody[step];
    if (m !== null && m !== undefined) {
      const len = this.melody[step + 1] != null ? stepDur * 0.9 : stepDur * 1.7;
      this.tone(N(m), len, t.melodyWave, t.melodyVol, at);
    }
    // 4. 鼓组
    const dv = t.drumVol;
    if (t.drumStyle === 'four') {
      if (inBar % 2 === 0) this.kick(at, dv);                       // 四踩
      if (inBar === 2 || inBar === 6) this.snare(at, dv * 0.9);     // 军鼓 2/4
      this.hat(at, dv * 0.5);                                       // 八分踩镲
    } else if (t.drumStyle === 'march') {
      if (inBar === 0 || inBar === 4) this.kick(at, dv);
      if (inBar % 2 === 1) this.hat(at, dv * 0.4);
      if (inBar === 6) this.snare(at, dv);
    } else {
      if (inBar === 0) this.kick(at, dv * 0.7);
      if (inBar === 4) this.hat(at, dv * 0.4);
    }
  }

  private stopLoop() {
    if (this.schedTimer) { clearInterval(this.schedTimer); this.schedTimer = null; }
  }

  private tone(freq: number, dur: number, wave: Wave, vol = 0.5, at?: number) {
    if (!this.ctx || !this.master) return;
    const t0 = at ?? this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur);
  }

  private kick(at: number, vol: number) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.09);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
    o.connect(g); g.connect(this.master);
    o.start(at); o.stop(at + 0.12);
  }

  private hat(at: number, vol: number) { this.noiseAt(0.03, vol, at, 6000); }
  private snare(at: number, vol: number) {
    this.noiseAt(0.09, vol, at, 1800);
    this.tone(190, 0.07, 'triangle', vol * 0.5, at);
  }

  private noiseAt(dur: number, vol: number, at: number, hp = 4000) {
    if (!this.ctx || !this.master) return;
    const buf = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(at);
  }

  private noise(dur: number, vol = 0.4) {
    if (!this.ctx) return;
    this.noiseAt(dur, vol, this.ctx.currentTime, 800);
  }

  sfx(name: string) {
    this.ensure();
    if (this.muted) return;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'square', 0.3); break;
      case 'flip': this.tone(440, 0.08, 'square', 0.3); this.tone(660, 0.06, 'square', 0.2); break;
      case 'thud':
        // 重音：大单/惩罚选项的落地声
        this.tone(98, 0.28, 'square', 0.6);
        this.tone(65, 0.32, 'triangle', 0.5);
        this.noise(0.18, 0.3);
        break;
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
