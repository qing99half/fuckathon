// 中央反馈卡：与选项卡同款弹窗壳，屏幕正中弹出，2.2s 自动消失或点击消失，多条排队
export type FbType = 'normal' | 'good' | 'warn';

export class Feedback {
  private queue: Array<{ text: string; type: FbType }> = [];
  private showing = false;
  private timer: number | null = null;

  constructor(private host: HTMLElement) {}

  get busy() { return this.showing || this.queue.length > 0; }

  push(text: string, type: FbType = 'normal') {
    this.queue.push({ text, type });
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
    const body = document.createElement('div');
    body.className = 'card-body fb-body';
    body.textContent = item.text;
    el.append(bar, body);
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
