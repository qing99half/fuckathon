// 结局卡：1080×1440 红头文件通报版式，Canvas 绘制 + PNG 导出（卡面即分享图）
import { A, ENDING_IMG, loadImg } from './assets';
import { repFinalOf } from '../engine/ending';
import type { RunState } from '../engine/types';
import type { EndingJson } from '../engine/data';

const W = 1080, H = 1440;
const PAPER = '#F7F3EA', INK = '#1A1A1A', RED = '#C8102E', GRAY = '#8D99AE';

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

export async function drawEndingCard(state: RunState, ending: EndingJson): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;

  // 纸面
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // 细网格底纹
  ctx.strokeStyle = 'rgba(26,26,26,0.05)';
  for (let y = 0; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // 红头
  ctx.fillStyle = RED;
  ctx.font = '900 64px "Noto Serif SC", "SimSun", serif';
  ctx.textAlign = 'center';
  ctx.fillText('预制黑客松组织委员会文件', W / 2, 120);
  ctx.font = '400 30px "Noto Serif SC", serif';
  ctx.fillText(`预字〔2026〕第 ${String(ending.no).padStart(2, '0')} 号`, W / 2, 180);
  ctx.fillRect(60, 210, W - 120, 6);

  // 通报题
  ctx.fillStyle = INK;
  ctx.font = '700 40px "Noto Serif SC", serif';
  ctx.fillText(`关于「${state.titleText || '某黑客松'}」赛后情况的通报`, W / 2, 280);

  // 结局标题
  ctx.fillStyle = RED;
  ctx.font = '900 88px "Noto Serif SC", serif';
  ctx.fillText(`【${ending.title}】`, W / 2, 400);

  // 插画
  try {
    const img = await loadImg(A(`endings/${ENDING_IMG[ending.id]}`));
    const iw = 840, ih = 840 * (img.height / img.width);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (W - iw) / 2, 440, iw, ih);
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.strokeRect((W - iw) / 2, 440, iw, ih);
  } catch { /* 插画缺失不阻塞 */ }

  // 正文
  ctx.fillStyle = INK;
  ctx.font = '400 34px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'left';
  const lines = wrapText(ctx, ending.text, W - 200);
  lines.forEach((l, i) => ctx.fillText(l, 100, 1060 + i * 52));

  // 五维迷你图
  const repFinal = repFinalOf(state);
  const stats: [string, number, number][] = [
    ['声量', state.buzz, 100], ['政商', state.gov, 100], ['口碑', repFinal, 100],
    ['预算', Math.max(0, state.money), 500000], ['混乱', state.chaos, 15],
  ];
  let sx = 100;
  const sy = 1210;
  ctx.font = '400 22px "Noto Sans SC", sans-serif';
  for (const [label, v, max] of stats) {
    ctx.fillStyle = INK;
    ctx.fillText(label, sx, sy);
    ctx.fillStyle = '#e2dccb';
    ctx.fillRect(sx, sy + 10, 150, 14);
    ctx.fillStyle = RED;
    ctx.fillRect(sx, sy + 10, Math.min(150, (v / max) * 150), 14);
    sx += 190;
  }

  // 底部署名 + 伪二维码 + LOGO
  ctx.fillStyle = INK;
  ctx.font = '400 26px "Noto Serif SC", serif';
  ctx.textAlign = 'right';
  ctx.fillText('预制黑客松组织委员会', W - 220, 1320);
  ctx.fillText('2026 年 赛后即发', W - 220, 1356);
  // 伪二维码（种子驱动）
  const qrX = 80, qrY = 1280, cell = 8;
  let h = 0;
  for (const c of state.seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  ctx.fillStyle = INK;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    h = (h * 1103515245 + 12345) >>> 0;
    if (h & 0x10000) ctx.fillRect(qrX + x * cell, qrY + y * cell, cell - 1, cell - 1);
  }
  ctx.font = '400 18px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = GRAY;
  ctx.fillText('扫码查看主办方良心余额（查无此物）', qrX, qrY + 12 * cell + 26);
  try {
    const logo = await loadImg(A('ui/logo.png'));
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, W - 190, 1380 - 80, 72, 72);
    ctx.globalAlpha = 1;
  } catch { /* ignore */ }

  return cv;
}

export function exportPng(cv: HTMLCanvasElement, filename: string) {
  cv.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
}
