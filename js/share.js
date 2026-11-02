// Draws the shareable 1080×1920 summary card on a canvas.
import { int, compact, hours, esc, placeholderColors, firstGlyph } from './fmt.js';

const W = 1080;
const H = 1920;
const DISPLAY = '"Bricolage Grotesque", "Zen Kaku Gothic New", system-ui, sans-serif';
const JP = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
const MINCHO = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';

const PERSONA_COLORS = {
  nightOwl: ['#0b1f4b', '#2d6bff', '#7ce8ff'],
  earlyBird: ['#3a1408', '#ff6a3d', '#ffcf3f'],
  weekendWarrior: ['#3d0716', '#e8264d', '#ffe66d'],
  marathoner: ['#00302a', '#009e8a', '#ffcf3f'],
  devotee: ['#3a0b2a', '#ff4fa3', '#c8f031'],
  explorer: ['#0d1a5c', '#2556f0', '#c8f031'],
  miner: ['#0f1a05', '#3f7d14', '#c8f031'],
  everyday: ['#05261d', '#0f766e', '#b9f5d8'],
  bookworm: ['#1a0d4a', '#5326f2', '#ff4fa3'],
};

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

async function loadImage(src) {
  if (!src) return null;
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// Wraps by words when there are spaces, otherwise by characters (Japanese).
function wrap(ctx, text, maxWidth, maxLines) {
  const tokens = /\s/.test(text) ? text.split(/(\s+)/) : [...text];
  const lines = [];
  let line = '';
  for (const tok of tokens) {
    const test = line + tok;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
      continue;
    }
    lines.push(line.trim());
    line = tok.trimStart();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line.trim());
  if (lines.length === maxLines && lines.join('').length < text.replace(/\s+/g, '').length + lines.length) {
    let last = lines[maxLines - 1];
    const consumed = lines.join('').replace(/\s+/g, '').length;
    if (consumed < text.replace(/\s+/g, '').length) {
      while (last && ctx.measureText(`${last}…`).width > maxWidth) last = [...last].slice(0, -1).join('');
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines.slice(0, maxLines);
}

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = [...text];
  while (s.length && ctx.measureText(`${s.join('')}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.join('')}…`;
}

function blob(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export async function renderShareCard(r, { siteUrl, isDemo = false } = {}) {
  const top = r.games[0];
  const sample = [r.persona.jp, ...(r.games || []).map((g) => g.title), r.kanji.top.map(([k]) => k).join('')].join('');
  if (document.fonts) {
    await withTimeout(
      Promise.all([
        document.fonts.load(`800 100px "Bricolage Grotesque"`),
        document.fonts.load(`600 40px "Bricolage Grotesque"`),
        document.fonts.load(`900 60px "Zen Kaku Gothic New"`, sample),
        document.fonts.load(`700 40px "Zen Kaku Gothic New"`, sample),
        document.fonts.load(`800 200px "Shippori Mincho B1"`, r.kanji.top[0] ? r.kanji.top[0][0] : '読'),
      ]).catch(() => {}),
      4000,
    );
  }
  const [icon, cover] = await Promise.all([loadImage('assets/gsm-icon.png'), loadImage(top && top.cover)]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [base, mid, pop] = PERSONA_COLORS[r.persona.key] || PERSONA_COLORS.bookworm;

  // background
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  blob(ctx, 980, 120, 760, `${mid}cc`);
  blob(ctx, 60, 1500, 700, `${mid}88`);
  blob(ctx, 900, 1700, 420, `${pop}40`);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#fff';
  ctx.font = `800 900px ${MINCHO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('読', 380, 1240);
  ctx.restore();

  const PAD = 72;
  ctx.textBaseline = 'alphabetic';

  // brand row
  if (icon) {
    ctx.save();
    rr(ctx, PAD, 78, 64, 64, 16);
    ctx.clip();
    ctx.drawImage(icon, PAD, 78, 64, 64);
    ctx.restore();
  }
  ctx.fillStyle = '#fff';
  ctx.font = `800 36px ${DISPLAY}`;
  ctx.fillText('GSM Wrapped', PAD + 84, 124);
  ctx.textAlign = 'right';
  ctx.font = `700 30px ${JP}`;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText(isDemo ? 'DEMO' : '今年の読書', W - PAD, 122);
  ctx.textAlign = 'left';

  // title
  ctx.fillStyle = '#fff';
  ctx.font = `800 190px ${DISPLAY}`;
  ctx.fillText(String(r.year), PAD - 8, 370);
  ctx.font = `700 50px ${DISPLAY}`;
  ctx.fillStyle = pop;
  const soFar = r.year === new Date().getFullYear();
  ctx.fillText(`My year in Japanese${soFar ? ' (so far)' : ''}`, PAD, 446);

  // hero: #1 title
  const heroY = 500;
  const cw = 270;
  const ch = 360;
  if (top) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    rr(ctx, PAD, heroY, cw, ch, 28);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, PAD, heroY, cw, ch, 28);
    ctx.clip();
    if (cover) {
      const s = Math.max(cw / cover.width, ch / cover.height);
      const dw = cover.width * s;
      const dh = cover.height * s;
      ctx.drawImage(cover, PAD + (cw - dw) / 2, heroY + (ch - dh) / 2, dw, dh);
    } else {
      const [a, b] = placeholderColors(top.title);
      const g = ctx.createLinearGradient(PAD, heroY, PAD + cw, heroY + ch);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      ctx.fillRect(PAD, heroY, cw, ch);
      ctx.fillStyle = '#fff';
      ctx.font = `900 180px ${JP}`;
      ctx.textAlign = 'center';
      ctx.fillText(firstGlyph(top.title), PAD + cw / 2, heroY + ch / 2 + 64);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    const tx = PAD + cw + 48;
    const tw = W - PAD - tx;
    ctx.fillStyle = pop;
    ctx.font = `800 30px ${DISPLAY}`;
    ctx.fillText('#1 TITLE', tx, heroY + 44);
    ctx.fillStyle = '#fff';
    ctx.font = `900 56px ${JP}`;
    const lines = wrap(ctx, top.title, tw, 3);
    lines.forEach((l, i) => ctx.fillText(l, tx, heroY + 120 + i * 70));
    const after = heroY + 120 + lines.length * 70;
    ctx.font = `600 34px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.fillText(`${compact(top.chars)} chars · ${hours(top.seconds)}h`, tx, after + 10);
    if (r.games.length > 1) {
      ctx.fillText(`${Math.round((top.chars / r.totals.chars) * 100)}% of my year`, tx, after + 58);
    }
  }

  // stat grid
  const t = r.totals;
  const tiles = [
    [compact(t.chars), 'characters read'],
    [hours(t.seconds), 'hours reading'],
    [int(r.anki.mined), 'cards mined'],
    [int(t.activeDays), 'days active'],
    [int(r.kanji.unique), 'kanji seen'],
    [t.speed ? compact(t.speed) : '–', 'chars per hour'],
  ];
  const gy = 905;
  const gap = 20;
  const tw3 = (W - PAD * 2 - gap * 2) / 3;
  const th = 160;
  tiles.forEach(([v, label], i) => {
    const x = PAD + (i % 3) * (tw3 + gap);
    const y = gy + Math.floor(i / 3) * (th + gap);
    rr(ctx, x, y, tw3, th, 30);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 72px ${DISPLAY}`;
    ctx.fillText(fit(ctx, v, tw3 - 56), x + 28, y + 88);
    ctx.font = `600 28px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText(label, x + 28, y + 130);
  });

  // top titles 2–5 + top kanji
  const ly = gy + th * 2 + gap + 66;
  const kw = 250;
  const listW = W - PAD * 2 - kw - 40;
  ctx.fillStyle = pop;
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillText('TOP TITLES', PAD, ly);
  const rest = r.games.slice(1, 5);
  if (!rest.length) {
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = `600 34px ${DISPLAY}`;
    ctx.fillText('One story, all year.', PAD, ly + 64);
  }
  rest.forEach((g, i) => {
    const y = ly + 60 + i * 58;
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = `800 36px ${DISPLAY}`;
    ctx.fillText(String(i + 2), PAD, y);
    ctx.fillStyle = '#fff';
    ctx.font = `700 36px ${JP}`;
    const valueText = compact(g.chars);
    ctx.save();
    ctx.font = `700 30px ${DISPLAY}`;
    const vw = ctx.measureText(valueText).width;
    ctx.restore();
    ctx.fillText(fit(ctx, g.title, listW - 60 - vw - 20), PAD + 50, y);
    ctx.font = `700 30px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.textAlign = 'right';
    ctx.fillText(valueText, PAD + listW, y);
    ctx.textAlign = 'left';
  });

  if (r.kanji.top[0]) {
    const kx = W - PAD - kw;
    const ky = ly - 38;
    rr(ctx, kx, ky, kw, 290, 34);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.fillStyle = base;
    ctx.font = `800 30px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('TOP KANJI', kx + kw / 2, ky + 52);
    ctx.font = `800 170px ${MINCHO}`;
    ctx.fillText(r.kanji.top[0][0], kx + kw / 2, ky + 234);
    ctx.textAlign = 'left';
  }

  // persona banner
  const py = 1622;
  rr(ctx, PAD, py, W - PAD * 2, 180, 36);
  ctx.fillStyle = pop;
  ctx.fill();
  ctx.fillStyle = base;
  ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillText('READING PERSONALITY', PAD + 40, py + 52);
  ctx.font = `900 64px ${JP}`;
  ctx.fillText(fit(ctx, r.persona.jp, 460), PAD + 40, py + 134);
  ctx.textAlign = 'right';
  ctx.font = `800 44px ${DISPLAY}`;
  ctx.fillText(fit(ctx, r.persona.name, 380), W - PAD - 40, py + 130);
  ctx.textAlign = 'left';

  // footer
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.font = `600 30px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText(siteUrl || 'GSM Wrapped', W / 2, 1868);
  ctx.textAlign = 'left';

  return canvas;
}

export { esc };
