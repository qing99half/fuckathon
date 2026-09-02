// 抉择卡组件：弹窗壳 + 选项（预算置灰/良心绿点/预览）
import type { Card } from '../engine/types';

export class CardView {
  private wrap: HTMLElement;
  private onPick: (id: string) => void = () => {};
  private autoTimer: number | null = null;

  constructor(private stage: HTMLElement) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'card-wrap';
    stage.appendChild(this.wrap);
  }

  show(card: Card, money: number, onPick: (id: string) => void, autoMs?: number) {
    this.clear();
    this.onPick = onPick;
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;

    const bar = document.createElement('div');
    bar.className = 'card-titlebar';
    bar.innerHTML = `<span>${escapeHtml(card.title)}</span><span class="dots"><i></i><i></i><i></i></span>`;
    el.appendChild(bar);

    // 溯源标注：本卡是前面某个选择带来的后果（红条提示）
    if (card.cause) {
      const cz = document.createElement('div');
      cz.className = 'card-cause';
      cz.textContent = `▲ ${card.cause}`;
      el.appendChild(cz);
    }

    // 暴毙卡：死亡率明示
    if (card.deathRisk != null) {
      const dr = document.createElement('div');
      dr.className = 'card-deathrisk';
      dr.textContent = `危机事件：处理不好，本届直接暴毙（硬扛死亡率 ${Math.round(card.deathRisk * 100)}%）`;
      el.appendChild(dr);
    }

    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = card.body;
    el.appendChild(body);

    if (card.footnote) {
      const fn = document.createElement('div');
      fn.className = 'card-footnote';
      fn.textContent = card.footnote;
      el.appendChild(fn);
    }

    const opts = document.createElement('div');
    opts.className = 'card-options';
    for (const o of card.options) {
      const b = document.createElement('button');
      b.className = 'opt' + (card.options.length === 1 ? ' single' : '');
      const locked = !!o.cost && o.cost > money;
      if (locked) b.classList.add('locked');
      // 受前面选择影响而产生的惩罚性选项：红边红底重点提示
      if (o.warn) b.classList.add('warn');
      const label = document.createElement('span');
      label.textContent = o.label;
      b.appendChild(label);
      if (o.desc) {
        const d = document.createElement('span');
        d.className = 'desc'; d.textContent = o.desc;
        b.appendChild(d);
      }
      if (o.preview) {
        const p = document.createElement('span');
        p.className = 'preview'; p.textContent = o.preview;
        b.appendChild(p);
      }
      if (o.conscienceMark && !locked) {
        const g = document.createElement('i');
        g.className = 'green-dot';
        b.appendChild(g);
      }
      if (!locked) {
        b.addEventListener('click', () => {
          if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
          this.onPick(o.id);
        }, { once: true });
      }
      opts.appendChild(b);
    }
    el.appendChild(opts);
    this.wrap.appendChild(el);

    // 路演蒙太奇：自动推进
    if (autoMs && card.options.length === 1) {
      this.autoTimer = window.setTimeout(() => {
        this.autoTimer = null;
        this.onPick(card.options[0].id);
      }, autoMs);
    }
  }

  clear() {
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
    this.wrap.innerHTML = '';
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
