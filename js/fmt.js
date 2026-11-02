export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

export const int = (n) => Math.round(n || 0).toLocaleString('en-GB');

export function compact(n) {
  n = n || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

export function hours(seconds) {
  const h = (seconds || 0) / 3600;
  if (h >= 10) return int(h);
  return h.toFixed(1).replace(/\.0$/, '');
}

export function duration(seconds) {
  const m = Math.round((seconds || 0) / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function hourLabel(h) {
  if (h === 0) return 'midnight';
  if (h === 12) return 'midday';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function hourShort(h) {
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v}${h < 12 ? 'am' : 'pm'}`;
}

export function dateLabel(isoOrTs, opts = { month: 'long', day: 'numeric' }) {
  const d = typeof isoOrTs === 'number' ? new Date(isoOrTs * 1000) : new Date(`${isoOrTs}T12:00:00`);
  return d.toLocaleDateString('en-GB', opts);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function plural(n, one, many = `${one}s`) {
  return `${int(n)} ${Math.round(n) === 1 ? one : many}`;
}

// Stable pleasant colors for cover placeholders.
const PH = [
  ['#6b3bff', '#ff4fa3'],
  ['#ff6a3d', '#ffcf3f'],
  ['#00b39b', '#2d6bff'],
  ['#e8264d', '#ff8a5b'],
  ['#2556f0', '#7ce8ff'],
  ['#9b2cff', '#ffb3d9'],
];
export function placeholderColors(title) {
  let h = 0;
  for (const ch of String(title)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PH[h % PH.length];
}

export function firstGlyph(title) {
  const t = String(title || '?').trim();
  const m = t.match(/[぀-ヿ㐀-鿿]/u);
  return m ? m[0] : [...t][0]?.toUpperCase() || '?';
}
