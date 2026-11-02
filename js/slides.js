import { MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_JP, int, compact, hours, duration, hourLabel, hourShort, dateLabel, esc, plural, placeholderColors, firstGlyph } from './fmt.js';

const LIGHT = new Set(['t-lime', 't-orange', 't-cream', 't-pink', 't-mint']);
const KANJI_DIGITS = '〇一二三四五六七八九';
const kanjiYear = (y) => String(y).replace(/\d/g, (d) => KANJI_DIGITS[d]);
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

export const PERSONA_THEME = {
  nightOwl: 't-navy',
  earlyBird: 't-orange',
  weekendWarrior: 't-red',
  marathoner: 't-teal',
  devotee: 't-pink',
  explorer: 't-blue',
  miner: 't-lime',
  everyday: 't-mint',
  bookworm: 't-violet',
};

function coverHtml(g, cls = '') {
  if (g.cover) return `<div class="cover ${cls}"><img src="${esc(g.cover)}" alt="" decoding="async"></div>`;
  const [a, b] = placeholderColors(g.title);
  return `<div class="cover ph ${cls}" style="background:linear-gradient(135deg,${a},${b})" aria-hidden="true">${esc(firstGlyph(g.title))}</div>`;
}

const count = (n) => `<span class="count" data-count="${Math.round(n)}">${int(n)}</span>`;
const d = (i) => `style="--d:${i}"`;

function shapes(list) {
  return list
    .map(([x, y, size, color, radius = '50%', rot = 0]) => `<span class="shape" style="left:${x}cqw;top:${y}cqh;width:${size}cqw;height:${size}cqw;background:${color};border-radius:${radius};transform:rotate(${rot}deg)"></span>`)
    .join('');
}

// Rounded-top bars anchored to the baseline; one hue, peak emphasized.
function barChart({ values, labels, highlight, tips, height = 140, labelEvery = 1, peakLabel }) {
  const W = 320;
  const n = values.length;
  const gap = n > 12 ? 3 : 7;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(...values, 1);
  const top = 22;
  const r = Math.min(4, bw / 2);
  let out = '';
  values.forEach((v, i) => {
    const x = i * (bw + gap);
    const h = v > 0 ? Math.max(3, (v / max) * (height - top)) : 0;
    const y = height - h;
    const rr = Math.min(r, h);
    const path = h
      ? `M${x},${height}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + bw - rr}Q${x + bw},${y} ${x + bw},${y + rr}V${height}Z`
      : '';
    out += `<rect class="hit" x="${x - gap / 2}" y="0" width="${bw + gap}" height="${height + 18}" data-i="${i}" data-tip="${esc(tips[i])}"></rect>`;
    if (path) out += `<path class="bar${i === highlight ? ' hi' : ''}" data-i="${i}" style="--i:${i}" d="${path}"></path>`;
    if (labels && labels[i] && i % labelEvery === 0) out += `<text class="axis" x="${x + bw / 2}" y="${height + 16}" text-anchor="middle">${esc(labels[i])}</text>`;
    if (i === highlight && peakLabel) {
      const anchor = i < n * 0.15 ? 'start' : i > n * 0.85 ? 'end' : 'middle';
      const tx = anchor === 'start' ? x : anchor === 'end' ? x + bw : x + bw / 2;
      out += `<text class="lab" x="${tx}" y="${y - 7}" text-anchor="${anchor}">${esc(peakLabel)}</text>`;
    }
  });
  out += `<line class="base" x1="0" x2="${W}" y1="${height + 0.5}" y2="${height + 0.5}"></line>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height + 22}" role="img" aria-label="${esc(tips.filter(Boolean).join('; '))}">${out}</svg></div>`;
}

const argmax = (arr) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);

export function buildSlides(r, { isDemo = false } = {}) {
  const t = r.totals;
  const now = new Date();
  const soFar = r.year === now.getFullYear();
  const slides = [];
  const add = (theme, html, extra = {}) => slides.push({ theme, light: LIGHT.has(theme), html, ...extra });

  // 1 · intro
  add(
    't-violet',
    `${shapes([[60, 12, 52, 'rgba(255,255,255,.10)'], [-16, 44, 34, 'rgba(200,240,49,.85)', '28%', 18], [72, 58, 18, '#ff4fa3', '50%']])}
     <span class="wm">年</span>
     <p class="kicker-jp rv">${kanjiYear(r.year)}年の読書</p>
     <h1 class="big xl rv" ${d(1)}>${r.year}</h1>
     <p class="headline rv" ${d(2)}>Your year in GameSentenceMiner${soFar ? ' <span style="opacity:.7">(so far)</span>' : ''}</p>
     <div class="spacer"></div>
     <p class="lead rv" ${d(3)}>${isDemo ? 'This is a demo with made-up data. ' : ''}Every line you read, every card you mined. Let’s look back.</p>`,
  );

  // 2 · characters
  const ln = t.chars / 100000;
  const lnText = ln >= 10 ? int(ln) : ln >= 1 ? ln.toFixed(1).replace(/\.0$/, '') : null;
  add(
    't-lime',
    `${shapes([[66, 6, 46, 'rgba(83,38,242,.14)', '30%', 20], [-10, 80, 30, 'rgba(255,255,255,.45)']])}
     <span class="wm">字</span>
     <p class="kicker-jp rv">読んだ文字数</p>
     <p class="kicker rv" ${d(1)}>${soFar ? 'So far this year' : 'This year'} you read</p>
     <p class="big rv" ${d(2)}>${count(t.chars)}</p>
     <p class="lead rv" ${d(3)}>characters of Japanese.</p>
     <div class="equivs">
       ${lnText ? `<div class="equiv rv" ${d(4)}><span class="ico">本</span><p>That’s about <b>${lnText}</b> light novel${lnText === '1' ? '' : 's'}</p></div>` : ''}
       <div class="equiv rv" ${d(5)}><span class="ico">稿</span><p>or <b>${int(Math.ceil(t.chars / 400))}</b> sheets of <span class="jp">原稿用紙</span> manuscript paper</p></div>
       <div class="equiv rv" ${d(6)}><span class="ico">行</span><p>across <b>${int(t.lines)}</b> lines</p></div>
     </div>
     ${r.thirdParty && r.thirdParty.chars ? `<div class="chips rv" ${d(7)}><span class="chip">+ ${int(r.thirdParty.chars)} more logged from other sources</span></div>` : ''}
     <p class="foot-note rv" ${d(7)}>Punctuation isn’t counted, same as GSM. Light novel ≈ 100,000 characters.</p>`,
  );

  // 3 · time
  if (t.seconds > 0) {
    const h = t.seconds / 3600;
    add(
      't-navy',
      `${shapes([[58, 58, 60, 'rgba(45,107,255,.45)'], [-12, 10, 26, 'rgba(124,232,255,.35)', '35%', 30]])}
       <span class="wm">時</span>
       <p class="kicker-jp rv">読書時間</p>
       <p class="kicker rv" ${d(1)}>You spent</p>
       <p class="big xl rv" ${d(2)}>${h >= 1 ? `${count(Math.round(h))}<small> hours</small>` : `${count(Math.round(t.seconds / 60))}<small> min</small>`}</p>
       <p class="lead rv" ${d(3)}>reading in Japanese. That’s <b>${int(t.seconds / 60)} minutes</b> of story.</p>
       <div class="stat-row">
         <div class="stat rv" ${d(4)}><b>${int(t.activeDays)}</b><span>days active</span></div>
         <div class="stat rv" ${d(5)}><b>${int(t.sessions)}</b><span>sessions</span></div>
         <div class="stat rv" ${d(6)}><b>${duration(t.avgSessionSeconds)}</b><span>avg session</span></div>
       </div>
       <p class="foot-note rv" ${d(7)}>Reading time uses GSM’s adaptive estimate, so idle gaps don’t count.</p>`,
    );
  }

  // 4 · #1 title
  const top = r.games[0];
  if (top) {
    const share = t.chars ? top.chars / t.chars : 0;
    add(
      't-ink',
      `${shapes([[54, 8, 58, 'rgba(255,79,163,.28)'], [-18, 70, 44, 'rgba(107,59,255,.45)', '30%', 15]])}
       <p class="kicker-jp rv">今年の一番</p>
       <p class="kicker rv" ${d(1)}>Your #1 title of ${r.year}</p>
       <div class="rv pop" ${d(2)}>${coverHtml(top, 'hero-cover')}</div>
       <p class="title-jp rv" ${d(3)}>${esc(top.title)}</p>
       ${top.subtitle ? `<p class="title-sub rv" ${d(3)}>${esc(top.subtitle)}</p>` : ''}
       <div class="stat-row">
         <div class="stat rv" ${d(4)}><b>${compact(top.chars)}</b><span>characters</span></div>
         <div class="stat rv" ${d(5)}><b>${hours(top.seconds)}h</b><span>reading</span></div>
         <div class="stat rv" ${d(6)}><b>${top.cards ? int(top.cards) : int(top.days)}</b><span>${top.cards ? 'cards mined' : 'days'}</span></div>
       </div>
       ${r.games.length > 1 ? `<p class="lead rv" ${d(7)}>That’s <b>${pct(share)}</b> of everything you read this year.</p>` : ''}`,
    );
  }

  // 5 · top list
  if (r.games.length >= 2) {
    add(
      't-red',
      `${shapes([[62, 70, 50, 'rgba(255,138,91,.5)'], [-10, 4, 22, 'rgba(255,230,109,.5)', '30%', -12]])}
       <span class="wm">愛</span>
       <p class="kicker-jp rv">よく読んだ作品</p>
       <p class="headline rv" ${d(1)}>Your top titles</p>
       <ol class="top-list">
         ${r.games
           .map(
             (g, i) => `<li class="rv" ${d(2 + i)}><span class="rank">${i + 1}</span>${coverHtml(g)}<div class="t"><b>${esc(g.title)}</b><span>${compact(g.chars)} chars · ${hours(g.seconds)}h${g.isNew ? ' · new' : ''}</span></div></li>`,
           )
           .join('')}
       </ol>
       <p class="foot-note rv" ${d(8)}>${plural(t.games, 'title')} read this year${t.newGames ? `, ${int(t.newGames)} of them new to you` : ''}.</p>`,
    );
  }

  // 6 · months
  const activeMonths = r.months.filter((m) => m.chars > 0);
  if (activeMonths.length >= 2) {
    const pm = r.peakMonth;
    add(
      't-teal',
      `${shapes([[60, 4, 40, 'rgba(25,224,192,.55)', '50%'], [-16, 76, 36, 'rgba(11,31,75,.5)', '28%', 25]])}
       <span class="wm">月</span>
       <p class="kicker-jp rv">月ごとの記録</p>
       <p class="kicker rv" ${d(1)}>Month by month</p>
       <p class="headline rv" ${d(2)}>${MONTHS[pm.month]} was your biggest month</p>
       <p class="lead rv" ${d(3)}><b>${int(pm.chars)}</b> characters over ${plural(pm.days, 'day')}${pm.seconds ? `, ${hours(pm.seconds)} hours` : ''}.</p>
       <div class="rv" ${d(4)}>${barChart({
         values: r.months.map((m) => m.chars),
         labels: MONTHS_SHORT.map((m) => m[0]),
         highlight: pm.month,
         peakLabel: compact(pm.chars),
         tips: r.months.map((m) => `${MONTHS[m.month]}: ${int(m.chars)} chars`),
         height: 170,
       })}</div>
       <p class="foot-note rv" ${d(5)}>Active in ${plural(activeMonths.length, 'month')} of ${soFar ? now.getMonth() + 1 : 12}.</p>`,
    );
  }

  // 7 · rhythm
  if (t.chars > 0) {
    const ph = argmax(r.hours);
    const wd = argmax(r.weekdays);
    add(
      't-blue',
      `${shapes([[64, 66, 48, 'rgba(124,232,255,.35)'], [-12, 6, 30, 'rgba(26,42,140,.55)', '32%', 20]])}
       <span class="wm">夜</span>
       <p class="kicker-jp rv">読書のリズム</p>
       <p class="kicker rv" ${d(1)}>Your reading clock</p>
       <p class="headline rv" ${d(2)}>You read most around ${hourLabel(ph)}</p>
       <div class="rv" ${d(3)}>${barChart({
         values: r.hours,
         labels: r.hours.map((_, h) => (h % 6 === 0 ? hourShort(h) : '')),
         highlight: ph,
         peakLabel: hourShort(ph),
         tips: r.hours.map((c, h) => `${hourShort(h)}: ${int(c)} chars`),
         height: 120,
       })}</div>
       <p class="lead rv" ${d(4)}>Favourite day: <b>${WEEKDAYS[wd]}</b> <span class="jp">(${WEEKDAYS_JP[wd]}曜日)</span></p>
       <div class="rv" ${d(5)}>${barChart({
         values: r.weekdays,
         labels: WEEKDAYS.map((w) => w.slice(0, 3)),
         highlight: wd,
         tips: r.weekdays.map((c, i) => `${WEEKDAYS[i]}: ${int(c)} chars`),
         height: 70,
       })}</div>`,
    );
  }

  // 8 · records
  if (r.biggestDay) {
    const ls = r.longestSession;
    const st = r.longestStreak;
    add(
      't-orange',
      `${shapes([[62, 4, 44, 'rgba(255,207,63,.7)', '50%'], [-14, 78, 34, 'rgba(242,63,106,.45)', '30%', -20]])}
       <span class="wm">記</span>
       <p class="kicker-jp rv">自己ベスト</p>
       <p class="headline rv" ${d(1)}>Personal records</p>
       <div class="records">
         <div class="record rv" ${d(2)}><span class="ico">日</span><div><small>Biggest day</small><b>${int(r.biggestDay.chars)} chars</b><span>${dateLabel(r.biggestDay.date)} · <span class="jp">${esc(r.biggestDay.game)}</span></span></div></div>
         ${ls && ls.seconds > 0 ? `<div class="record rv" ${d(3)}><span class="ico">長</span><div><small>Longest session</small><b>${duration(ls.seconds)}</b><span>${int(ls.chars)} chars · ${dateLabel(ls.start, { month: 'short', day: 'numeric' })} · <span class="jp">${esc(ls.game)}</span></span></div></div>` : ''}
         ${st.length > 1 ? `<div class="record rv" ${d(4)}><span class="ico">連</span><div><small>Longest streak</small><b>${st.length} days in a row</b><span>${dateLabel(st.start, { month: 'short', day: 'numeric' })} – ${dateLabel(st.end, { month: 'short', day: 'numeric' })}</span></div></div>` : ''}
       </div>`,
    );
  }

  // 9 · speed
  if (t.seconds >= 3600 && t.speed > 0) {
    const g = r.speedGrowth;
    const sm = r.months.filter((m) => m.speed > 0);
    let story = '';
    if (g && g.pct >= 5) story = `From <b>${MONTHS[g.from.month]}</b> to <b>${MONTHS[g.to.month]}</b> you got <b>${Math.round(g.pct)}% faster</b>.`;
    else if (r.fastestMonth) story = `Your fastest month was <b>${MONTHS[r.fastestMonth.month]}</b> at ${int(r.fastestMonth.speed)} characters an hour.`;
    add(
      't-pink',
      `${shapes([[58, 62, 54, 'rgba(255,255,255,.35)'], [-8, 4, 24, 'rgba(61,27,209,.25)', '30%', 30]])}
       <span class="wm">速</span>
       <p class="kicker-jp rv">読書スピード</p>
       <p class="kicker rv" ${d(1)}>Your average reading speed</p>
       <p class="big rv" ${d(2)}>${count(t.speed)}</p>
       <p class="lead rv" ${d(3)}>characters per hour.</p>
       ${story ? `<p class="lead rv" ${d(4)}>${story}</p>` : ''}
       ${sm.length >= 2 ? `<div class="rv" ${d(5)}>${barChart({
         values: r.months.map((m) => m.speed),
         labels: MONTHS_SHORT.map((m) => m[0]),
         highlight: r.fastestMonth ? r.fastestMonth.month : -1,
         peakLabel: r.fastestMonth ? `${compact(r.fastestMonth.speed)}/h` : '',
         tips: r.months.map((m) => (m.speed ? `${MONTHS[m.month]}: ${int(m.speed)} chars/hour` : `${MONTHS[m.month]}: under an hour read`)),
         height: 120,
       })}</div>` : ''}
       <p class="foot-note rv" ${d(6)}>Months with less than an hour of reading are left out.</p>`,
    );
  }

  // 10 · kanji
  if (r.kanji.unique > 0) {
    const [k0, c0] = r.kanji.top[0];
    const fresh = r.kanji.fresh;
    add(
      't-cream',
      `${shapes([[64, 8, 40, 'rgba(232,38,77,.16)', '50%'], [-12, 82, 30, 'rgba(255,233,168,.9)', '30%', 15]])}
       <p class="kicker-jp rv">漢字</p>
       <p class="kicker rv" ${d(1)}>Your most-seen kanji</p>
       <div class="kanji-hero rv pop" ${d(2)}><span class="kanji-big">${esc(k0)}</span><p><b>${int(c0)}×</b>this year</p></div>
       <p class="lead rv" ${d(3)}>You met <b>${int(r.kanji.unique)}</b> different kanji${fresh && fresh.count ? `, and <b>${int(fresh.count)}</b> of them were new to you` : ''}.</p>
       <div class="kanji-grid rv" ${d(4)}>${r.kanji.top
         .slice(1, 13)
         .map(([k, c]) => `<div title="${esc(k)}: ${int(c)}">${esc(k)}</div>`)
         .join('')}</div>
       ${fresh && fresh.top.length ? `<p class="lead rv" ${d(5)}>New faces this year:</p><div class="chips rv" ${d(5)}>${fresh.top.map(([k]) => `<span class="chip jp">${esc(k)}</span>`).join('')}</div>` : ''}`,
    );
  }

  // 11 · words
  if (r.words && r.words.top.length >= 3) {
    const showNew = r.kanji.hasHistory && r.words.newWords;
    add(
      't-violet',
      `${shapes([[66, 70, 44, 'rgba(255,79,163,.4)'], [-10, 0, 26, 'rgba(200,240,49,.55)', '30%', -18]])}
       <span class="wm">語</span>
       <p class="kicker-jp rv">今年の言葉</p>
       <p class="headline rv" ${d(1)}>Words of your year</p>
       <ol class="word-list">${r.words.top
         .slice(0, 7)
         .map(([w, c], i) => `<li class="rv" ${d(2 + Math.min(i, 5))}><span class="n">${i + 1}</span><span class="w">${esc(w)}</span><span class="c">${int(c)}×</span></li>`)
         .join('')}</ol>
       <p class="foot-note rv" ${d(8)}><b>${int(r.words.unique)}</b> different words this year${showNew ? ` · <b>${int(r.words.newWords)}</b> seen for the first time` : ''}.</p>`,
    );
  }

  // 12 · anki
  if (r.anki.mined > 0 || r.anki.reviews) {
    const per10k = t.chars ? (r.anki.mined / t.chars) * 10000 : 0;
    add(
      't-mint',
      `${shapes([[60, 6, 46, 'rgba(15,118,110,.16)', '30%', 20], [-14, 76, 36, 'rgba(254,240,138,.9)']])}
       <span class="wm">札</span>
       <p class="kicker-jp rv">文マイニング</p>
       <p class="kicker rv" ${d(1)}>You mined</p>
       <p class="big xl rv" ${d(2)}>${count(r.anki.mined)}</p>
       <p class="lead rv" ${d(3)}>Anki cards from the things you read${per10k >= 0.5 ? `, about <b>${per10k.toFixed(1)}</b> for every 10,000 characters` : ''}.</p>
       <div class="records">
         ${r.anki.topGame ? `<div class="record rv" ${d(4)}><span class="ico">掘</span><div><small>Richest vein</small><b>${int(r.anki.topGame.cards)} cards</b><span class="jp">${esc(r.anki.topGame.title)}</span></div></div>` : ''}
         ${r.anki.reviews ? `<div class="record rv" ${d(5)}><span class="ico">復</span><div><small>Anki reviews</small><b>${int(r.anki.reviews.count)} reviews</b><span>${r.anki.reviews.seconds ? `${hours(r.anki.reviews.seconds)} hours of reviewing` : 'synced from Anki'}</span></div></div>` : ''}
       </div>`,
    );
  }

  // 13 · flavor
  // Adult tags stay out of something people will screenshot and share.
  const genres = r.genres.filter((g) => !/nsfw|hentai|adult|ecchi|eroge|18\+|r-?18/i.test(g.name)).slice(0, 5);
  const typedAll = r.types.reduce((a, x) => a + x.chars, 0) || 1;
  const types = r.types.filter((x) => x.chars / typedAll >= 0.01);
  if (types.length || genres.length) {
    const typed = typedAll;
    const lead = types[0] ? types[0].name : genres[0].name;
    add(
      't-teal',
      `${shapes([[62, 64, 50, 'rgba(255,207,63,.35)'], [-16, 8, 34, 'rgba(25,224,192,.5)', '30%', 22]])}
       <span class="wm">種</span>
       <p class="kicker-jp rv">ジャンル</p>
       <p class="kicker rv" ${d(1)}>Your flavour of ${r.year}</p>
       <p class="headline rv" ${d(2)}>Mostly ${esc(lead)}</p>
       ${types.length ? `<div class="split">${types
         .slice(0, 4)
         .map((x, i) => `<div class="split-row rv" style="--d:${3 + i};--w:${Math.max(2, (x.chars / typed) * 100)}%"><div class="lbl">${esc(x.name)}<span>${pct(x.chars / typed)}</span></div><div class="track"><div class="fill"></div></div></div>`)
         .join('')}</div>` : ''}
       ${genres.length ? `<p class="lead rv" ${d(7)}>Top genres</p><div class="chips rv" ${d(7)}>${genres.map((g) => `<span class="chip">${esc(g.name)}</span>`).join('')}</div>` : ''}`,
    );
  }

  // 14 · finished
  if (r.finished.length) {
    add(
      't-orange',
      `${shapes([[64, 4, 40, 'rgba(255,255,255,.35)'], [-14, 80, 32, 'rgba(242,63,106,.4)', '30%', 12]])}
       <span class="wm">完</span>
       <p class="kicker-jp rv">読了</p>
       <p class="headline rv" ${d(1)}>Finished and read this year</p>
       <p class="lead rv" ${d(2)}>${plural(r.finished.length, 'title')} you’ve marked complete in GSM.</p>
       <div class="finished-grid">${r.finished
         .slice(0, 6)
         .map((g, i) => `<figure class="rv pop" ${d(3 + i)}><div style="position:relative">${coverHtml(g)}<span class="stamp">完</span></div><figcaption>${esc(g.title)}</figcaption></figure>`)
         .join('')}</div>`,
    );
  }

  // 15 · first / last line
  if (r.firstLine) {
    add(
      't-ink',
      `${shapes([[60, 6, 50, 'rgba(176,24,95,.4)'], [-16, 74, 40, 'rgba(75,31,168,.55)', '30%', 18]])}
       <span class="wm">始</span>
       <p class="kicker-jp rv">最初の一行</p>
       <p class="kicker rv" ${d(1)}>Your first line of ${r.year}</p>
       <figure class="quote rv" ${d(2)}><blockquote lang="ja">${esc(r.firstLine.text)}</blockquote><figcaption><span class="jp">${esc(r.firstLine.game)}</span> · ${dateLabel(r.firstLine.ts)}</figcaption></figure>
       ${r.lastLine ? `<p class="kicker rv" ${d(3)} style="margin-top:4cqh">…and your most recent</p><figure class="quote alt rv" ${d(4)}><blockquote lang="ja">${esc(r.lastLine.text)}</blockquote><figcaption><span class="jp">${esc(r.lastLine.game)}</span> · ${dateLabel(r.lastLine.ts)}</figcaption></figure>` : ''}`,
    );
  }

  // 16 · persona
  const p = r.persona;
  const pTheme = PERSONA_THEME[p.key] || 't-violet';
  const facts = {
    nightOwl: `${pct(p.stats.night)} read after 10pm`,
    earlyBird: `${pct(p.stats.morning)} read before 9am`,
    weekendWarrior: `${pct(p.stats.weekend)} read on weekends`,
    marathoner: `${duration(t.avgSessionSeconds)} average session`,
    devotee: top ? `${pct(p.stats.topShare)} spent on one title` : '',
    explorer: `${plural(t.games, 'title')} this year`,
    miner: `${p.stats.cardsPer10k.toFixed(1)} cards per 10k characters`,
    everyday: `${plural(t.activeDays, 'day')} active · ${r.longestStreak.length}-day streak`,
    bookworm: `${compact(t.chars)} characters read`,
  };
  add(
    pTheme,
    `${shapes([[56, 4, 60, 'rgba(255,255,255,.16)'], [-18, 70, 46, 'rgba(255,255,255,.12)', '30%', 20]])}
     <p class="kicker-jp rv">あなたの読書タイプ</p>
     <p class="kicker rv" ${d(1)}>Your reading personality is</p>
     <p class="persona-jp rv pop" style="--d:2;font-size:${Math.min(15, 84 / [...p.jp].length).toFixed(2)}cqw">${esc(p.jp)}</p>
     <p class="persona-en rv" ${d(3)}>${esc(p.name)}</p>
     <p class="lead rv" ${d(4)}>${esc(p.blurb)}</p>
     <div class="chips rv" ${d(5)}>${[facts[p.key], `${hours(t.seconds)} hours`, `${compact(t.chars)} chars`]
       .filter((x, i, a) => x && a.indexOf(x) === i)
       .map((x) => `<span class="chip">${esc(x)}</span>`)
       .join('')}</div>`,
  );

  // 17 · summary (card injected by app.js)
  add(
    't-ink',
    `<div class="summary-card rv" ${d(0)}><p class="lead">Drawing your card…</p></div>
     <div class="summary-actions rv" ${d(1)}>
       <button class="btn primary" type="button" data-action="download">Save image</button>
       <button class="btn" type="button" data-action="share" hidden>Share</button>
       <button class="btn" type="button" data-action="replay">Replay</button>
       <button class="btn" type="button" data-action="years">Another year</button>
     </div>`,
    { summary: true, cls: 'summary' },
  );

  return slides;
}
