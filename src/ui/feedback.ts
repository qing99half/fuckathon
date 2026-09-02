// 中央反馈卡：与选项卡同款弹窗壳，屏幕正中弹出，2.2s 自动消失或点击消失，多条排队
// 支持数值变动行（红绿数字），让"选择的后果"直接可见
export type FbType = 'normal' | 'good' | 'warn';
export interface FbDelta { label: string; delta: number; money?: boolean }

export class Feedback {
  private queue: Array<{ text: string; type: FbType; deltas?: FbDelta[] }> = [];
  private showing = false;
  private timer: number | null = null;

  constructor(private host: HTMLElement) {}

  get busy() { return this.showing || this.queue.length > 0; }

  push(text: string, type: FbType = 'normal', deltas?: FbDelta[]) {
    this.queue.push({ text, type, deltas });
    if (!this.showing) this.next();
  }

  private next() {
    const item = this.queue.shift();
    if (!item) { this.showing = false; return; }
    this.showing = true;

    const wrap = document.createElement('div');
    wrap.className = 'fb-wrap';
    const el = document.createElement('div');
    el.className = `card fb ${item.type}`;
    const bar = document.createElement('div');
    bar.className = 'card-titlebar';
    const title = item.type === 'good' ? '事态发展' : item.type === 'warn' ? '突发状况' : '后续影响';
    bar.innerHTML = `<span>${title}</span><span class="dots"><i></i><i></i><i></i></span>`;
    el.append(bar);
    if (item.text) {
      const body = document.createElement('div');
      body.className = 'card-body fb-body';
      body.textContent = item.text;
      el.appendChild(body);
    }
    // 数值变动行：红跌绿涨，等宽像素字体
    if (item.deltas?.length) {
      const dl = document.createElement('div');
      dl.className = 'fb-deltas';
      for (const d of item.deltas) {
        const row = document.createElement('span');
        row.className = 'fb-delta ' + (d.delta > 0 ? 'up' : 'down');
        const abs = d.money ? `¥${Math.abs(d.delta).toLocaleString()}` : String(Math.abs(d.delta));
        row.textContent = `${d.label} ${d.delta > 0 ? '+' : '-'}${abs}`;
        dl.appendChild(row);
      }
      el.appendChild(dl);
    }
    wrap.appendChild(el);
    this.host.appendChild(wrap);

    const dismiss = () => {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      wrap.classList.add('out');
      setTimeout(() => { wrap.remove(); this.next(); }, 140);
    };
    wrap.addEventListener('click', dismiss, { once: true });
    this.timer = window.setTimeout(dismiss, 2200);
  }
}
