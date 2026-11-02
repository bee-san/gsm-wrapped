import { buildSlides } from './slides.js';
import { renderShareCard } from './share.js';
import { int } from './fmt.js';

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SITE_URL = `${location.host}${location.pathname.replace(/index\.html$/, '')}`.replace(/\/$/, '');

// ------------------------------------------------------------------ worker
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.progress) {
      p.onProgress && p.onProgress(data.progress);
      return;
    }
    pending.delete(data.id);
    if (data.ok) p.resolve(data.result);
    else p.reject(new Error(data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'The worker crashed. Try Chrome, Edge, Firefox or Safari 16+.'));
    pending.clear();
    worker = null;
  };
  return worker;
}

function call(type, payload, onProgress) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, type, ...payload });
  });
}

// ------------------------------------------------------------------ screens
const screens = ['landing', 'loading', 'years', 'story'];
function show(name) {
  for (const s of screens) $(`#${s}`).hidden = s !== name;
  document.body.classList.toggle('in-story', name === 'story');
  if (name !== 'story') window.scrollTo(0, 0);
}

const setLoading = (text) => {
  $('#loading-text').textContent = text;
};

function showError(message) {
  show('landing');
  const el = $('#drop-error');
  el.innerHTML = message;
  el.hidden = false;
  $('#drop').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

// ------------------------------------------------------------------ file intake
async function isSqlite(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return new TextDecoder().decode(head) === 'SQLite format 3\u0000';
}

// Folders can be dropped too: pick gsm.db (+ -wal) from the top level.
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])].filter((i) => i.kind === 'file');
  const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (!entries.some((e) => e && e.isDirectory)) return [...dt.files];
  const out = [];
  const fileOf = (entry) => new Promise((res, rej) => entry.file(res, rej));
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.isFile) {
      out.push(await fileOf(entry));
      continue;
    }
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const child of batch) {
        if (child.isFile && /^gsm\.db(-wal)?$/i.test(child.name)) out.push(await fileOf(child));
      }
    } while (batch.length);
  }
  return out;
}

let current = { files: null, years: [], result: null, isDemo: false };

async function handleFiles(fileList) {
  $('#drop-error').hidden = true;
  const files = [...fileList];
  if (!files.length) return showError('That folder didn’t contain a <code>gsm.db</code>. Open the GSM folder and drag <code>gsm.db</code> itself.');
  const wal = files.find((f) => /-wal$/i.test(f.name));
  const others = files.filter((f) => f !== wal && !/-(shm|journal)$/i.test(f.name));
  let dbFile = others.find((f) => /^gsm\.db$/i.test(f.name)) || others[0];
  if (!dbFile) {
    return showError(
      wal
        ? 'That’s <code>gsm.db-wal</code>, the companion file. Choose <code>gsm.db</code> as well (Ctrl/⌘-click to select both).'
        : 'Please choose <code>gsm.db</code>, not the <code>-shm</code> file.',
    );
  }
  if (!(await isSqlite(dbFile))) {
    return showError(`<code>${escapeHtml(dbFile.name)}</code> isn’t a SQLite database. Look for <code>gsm.db</code> in your GSM data folder.`);
  }
  current = { files: { db: dbFile, wal: wal && wal.size ? wal : null }, years: [], result: null, isDemo: false };
  show('loading');
  setLoading('Opening your database');
  try {
    const { years } = await call('open', { db: dbFile, wal: current.files.wal }, setLoading);
    current.years = years;
    if (!years.length) return showError('Your database opened fine but has no reading in it yet. Read something with GSM and come back!');
    if (years.length === 1) return computeYear(years[0].year);
    showYears();
  } catch (e) {
    console.error(e);
    showError(`Couldn’t read that file: ${escapeHtml(e.message)}. If GSM is running, close it and try again, or add <code>gsm.db-wal</code> too.`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showYears() {
  const list = $('#year-list');
  list.innerHTML = '';
  $('#years-sub').textContent = `Found reading in ${current.years.length} years.`;
  current.years.forEach(({ year, lines }, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `year-btn${i === 0 ? ' primary' : ''}`;
    b.innerHTML = `<b>${year}</b><span>${int(lines)} lines</span>`;
    b.addEventListener('click', () => computeYear(year));
    list.append(b);
  });
  show('years');
  list.querySelector('button').focus();
}

async function computeYear(year) {
  show('loading');
  setLoading(`Wrapping up ${year}`);
  try {
    const result = await call('compute', { year }, setLoading);
    if (result.empty) return showError(`No reading found in ${year}.`);
    current.result = result;
    startStory(result);
  } catch (e) {
    console.error(e);
    showError(`Something went wrong while crunching ${year}: ${escapeHtml(e.message)}`);
  }
}

async function startDemo() {
  show('loading');
  setLoading('Loading the demo');
  try {
    const res = await fetch('assets/demo.json');
    const result = await res.json();
    current = { files: null, years: [], result, isDemo: true };
    startStory(result);
  } catch (e) {
    showError(`Couldn’t load the demo: ${escapeHtml(e.message)}`);
  }
}

// ------------------------------------------------------------------ story
const story = { slides: [], index: 0, cardUrl: null, cardBlob: null };

function startStory(result) {
  story.slides = buildSlides(result, { isDemo: current.isDemo });
  const host = $('#slides');
  host.innerHTML = story.slides
    .map((s, i) => `<section class="slide ${s.theme} ${s.cls || ''}" data-i="${i}" aria-label="Slide ${i + 1} of ${story.slides.length}">${s.html}</section>`)
    .join('');
  $('#progress').innerHTML = story.slides.map(() => '<i></i>').join('');
  if (story.cardUrl) URL.revokeObjectURL(story.cardUrl);
  story.cardUrl = null;
  story.cardBlob = null;
  const again = $('#slides [data-action="years"]');
  if (current.isDemo) again.textContent = 'Try your own';
  else if (current.years.length <= 1) again.hidden = true;
  show('story');
  go(0);
  prepareCard(result);
}

function go(i) {
  const n = story.slides.length;
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  story.index = i;
  const slides = [...document.querySelectorAll('#slides .slide')];
  slides.forEach((el, k) => {
    el.classList.toggle('active', k === i);
    el.setAttribute('aria-hidden', k === i ? 'false' : 'true');
  });
  [...document.querySelectorAll('#progress i')].forEach((el, k) => {
    el.className = k < i ? 'done' : k === i ? 'now' : '';
  });
  $('#story-frame').classList.toggle('on-light', story.slides[i].light);
  $('#tap-hint').hidden = i !== 0;
  hideTip();
  countUp(slides[i]);
}

function countUp(slide) {
  for (const el of slide.querySelectorAll('.count')) {
    const target = Number(el.dataset.count) || 0;
    if (reduceMotion || target < 10) {
      el.textContent = int(target);
      continue;
    }
    const start = performance.now();
    const dur = 1400;
    const delay = 350;
    el.textContent = '0';
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - start - delay) / dur));
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = int(target * eased);
      if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

async function prepareCard(result) {
  try {
    const canvas = await renderShareCard(result, { siteUrl: SITE_URL, isDemo: current.isDemo });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    story.cardBlob = blob;
    story.cardUrl = URL.createObjectURL(blob);
    const slot = $('#slides .summary .summary-card');
    if (slot) slot.innerHTML = `<img src="${story.cardUrl}" alt="Summary card of your ${result.year} in GameSentenceMiner">`;
    const file = new File([blob], `gsm-wrapped-${result.year}.png`, { type: 'image/png' });
    const shareBtn = $('#slides [data-action="share"]');
    if (shareBtn && navigator.canShare && navigator.canShare({ files: [file] })) shareBtn.hidden = false;
  } catch (e) {
    console.error(e);
    const slot = $('#slides .summary .summary-card');
    if (slot) slot.innerHTML = '<p class="lead">Couldn’t draw the summary card in this browser.</p>';
  }
}

async function onAction(action) {
  const year = current.result && current.result.year;
  if (action === 'download' && story.cardUrl) {
    const a = document.createElement('a');
    a.href = story.cardUrl;
    a.download = `gsm-wrapped-${year}.png`;
    document.body.append(a);
    a.click();
    a.remove();
  } else if (action === 'share' && story.cardBlob) {
    const file = new File([story.cardBlob], `gsm-wrapped-${year}.png`, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: `My ${year} in GameSentenceMiner` });
    } catch {
      /* user cancelled */
    }
  } else if (action === 'replay') {
    go(0);
  } else if (action === 'years') {
    exitStory();
  } else if (action === 'home') {
    show('landing');
  }
}

function exitStory() {
  if (current.isDemo || current.years.length <= 1) show('landing');
  else showYears();
}

// tooltips for charts
const tip = document.createElement('div');
tip.className = 'tip';
tip.hidden = true;
function hideTip() {
  tip.hidden = true;
  document.querySelectorAll('.chart .bar.hover').forEach((b) => b.classList.remove('hover'));
}
function showTipFor(hit) {
  const frame = $('#story-frame');
  if (!tip.isConnected) frame.append(tip);
  const svg = hit.ownerSVGElement;
  const bar = svg.querySelector(`.bar[data-i="${hit.dataset.i}"]`);
  document.querySelectorAll('.chart .bar.hover').forEach((b) => b.classList.remove('hover'));
  if (bar) bar.classList.add('hover');
  const fr = frame.getBoundingClientRect();
  const hr = hit.getBoundingClientRect();
  const br = bar ? bar.getBoundingClientRect() : hr;
  tip.textContent = hit.dataset.tip;
  tip.hidden = false;
  const x = Math.min(Math.max(hr.left + hr.width / 2 - fr.left, 70), fr.width - 70);
  tip.style.left = `${x}px`;
  tip.style.top = `${(bar ? br.top : hr.top + hr.height / 2) - fr.top}px`;
}

// ------------------------------------------------------------------ wiring
function init() {
  const input = $('#file');
  const drop = $('#drop');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files.length) handleFiles(input.files);
    input.value = '';
  });

  // The whole landing page is a drop target.
  let depth = 0;
  const landingVisible = () => !$('#landing').hidden;
  window.addEventListener('dragenter', (e) => {
    if (!landingVisible() || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    depth += 1;
    document.body.classList.add('dragging');
    drop.classList.add('dragging');
  });
  window.addEventListener('dragover', (e) => {
    if (!landingVisible()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) {
      document.body.classList.remove('dragging');
      drop.classList.remove('dragging');
    }
  });
  window.addEventListener('drop', async (e) => {
    if (!landingVisible()) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    drop.classList.remove('dragging');
    try {
      handleFiles(await filesFromDrop(e.dataTransfer));
    } catch {
      handleFiles(e.dataTransfer.files);
    }
  });

  $('#demo-btn').addEventListener('click', startDemo);
  document.querySelectorAll('[data-action="home"]').forEach((b) => b.addEventListener('click', () => show('landing')));

  const frame = $('#story-frame');
  frame.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      e.stopPropagation();
      onAction(actionEl.dataset.action);
      return;
    }
    if (e.target.closest('#story-close')) return exitStory();
    if (e.target.closest('.chart, .summary-actions, a, button')) return;
    const rect = frame.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) go(story.index - 1);
    else go(story.index + 1);
  });
  frame.addEventListener('pointermove', (e) => {
    const hit = e.target.closest && e.target.closest('.chart .hit');
    if (hit) showTipFor(hit);
    else hideTip();
  });
  frame.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest && e.target.closest('.chart .hit');
    if (hit) showTipFor(hit);
  });
  frame.addEventListener('pointerleave', hideTip);

  window.addEventListener('keydown', (e) => {
    if ($('#story').hidden) return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault();
      go(story.index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      go(story.index - 1);
    } else if (e.key === 'Escape') {
      exitStory();
    }
  });

  // Point Mac and Linux visitors at their own instructions.
  const ua = navigator.userAgent;
  const os = /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : /Linux/i.test(ua) && !/Android/i.test(ua) ? 'linux' : 'windows';
  document.querySelectorAll('.os-tab').forEach((tab) => {
    tab.addEventListener('click', () => selectOs(tab.dataset.os));
  });
  selectOs(os);

  if (location.hash === '#demo') startDemo();
}

function selectOs(os) {
  document.querySelectorAll('.os-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.os === os)));
  document.querySelectorAll('[data-os-panel]').forEach((p) => {
    p.hidden = p.dataset.osPanel !== os;
  });
}

init();
