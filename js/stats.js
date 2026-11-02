// Year-in-review stats computed from a GSM database (sqlite-wasm oo1 handle).
// Character counts and reading time mirror GSM's own stats code so the numbers
// line up with the GSM dashboard:
//   - GameSentenceMiner/util/database/db.py      clean_text_for_stats
//   - GameSentenceMiner/web/stats.py             calculate_actual_reading_time
//   - GameSentenceMiner/util/stats/stats_util.py adaptive caps / card counting

export const SESSION_GAP_SECONDS = 1800;

const MAX_SEC_PER_CHAR = 3.0;
const ABSOLUTE_CEILING = 300.0;
const MIN_CHARS_FOR_SPEED = 5;
const MIN_GAP_FOR_SPEED = 1.0;
const ADAPTIVE_FLOOR_SECONDS = 2.0;
const ADAPTIVE_TOLERANCE = 2.5;

const PUNCT_RE = /[\p{P}\p{S}\p{Z}]/gu;
const KANJI_RE = /[㐀-䶿一-鿿\u{20000}-\u{2A6DF}]/gu;

export function cleanText(text) {
  if (!text) return '';
  return String(text).replace(PUNCT_RE, '').trim();
}

export function codePointLength(s) {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) n--;
  }
  return n;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sessionMedianCps(gaps) {
  const speeds = [];
  for (const [gap, chars] of gaps) {
    if (chars < MIN_CHARS_FOR_SPEED || !Number.isFinite(gap)) continue;
    if (gap < MIN_GAP_FOR_SPEED || gap > ABSOLUTE_CEILING) continue;
    speeds.push(chars / gap);
  }
  return median(speeds);
}

function adaptiveCap(chars, medianCps) {
  if (chars <= 0) return 0;
  const cap =
    Number.isFinite(medianCps) && medianCps > 0
      ? Math.max(ADAPTIVE_FLOOR_SECONDS, (chars / medianCps) * ADAPTIVE_TOLERANCE)
      : Math.max(ADAPTIVE_FLOOR_SECONDS, chars * MAX_SEC_PER_CHAR);
  return Math.min(cap, ABSOLUTE_CEILING);
}

// Credited seconds per gap; gaps are [gapSeconds, charsOfEarlierLine, lineIndex].
export function creditSession(gaps) {
  const m = sessionMedianCps(gaps);
  return gaps.map(([gap, chars]) => Math.min(gap, adaptiveCap(chars, m)));
}

export function countCards(noteIds, screenshotInAnki, audioInAnki) {
  if (noteIds != null) {
    const raw = String(noteIds).trim();
    if (raw && raw !== '[]' && raw !== 'null') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.length) return parsed.length;
        } else if (parsed) {
          return 1;
        }
      } catch {
        const parts = raw.split(',').filter((p) => p.trim());
        if (parts.length) return parts.length;
      }
    }
  }
  const has = (v) => v != null && String(v).trim() !== '';
  return has(screenshotInAnki) || has(audioInAnki) ? 1 : 0;
}

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yearStart = (y) => new Date(y, 0, 1).getTime() / 1000;

function tableInfo(db) {
  const tables = new Set(db.selectValues("SELECT name FROM sqlite_master WHERE type='table'"));
  const cols = (t) => (tables.has(t) ? new Set(db.selectArrays(`PRAGMA table_info(${t})`).map((r) => r[1])) : new Set());
  return { tables, cols };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    console.warn('[gsm-wrapped]', e);
    return fallback;
  }
}

export function listYears(db) {
  const { tables } = tableInfo(db);
  if (!tables.has('game_lines')) throw new Error('This file has no game_lines table. Is it a GameSentenceMiner gsm.db?');
  const counts = new Map();
  // Bucket by UTC hour; converting each bucket to local time keeps year edges right.
  db.exec({
    sql: 'SELECT CAST(timestamp / 3600 AS INTEGER) h, COUNT(*) FROM game_lines WHERE timestamp IS NOT NULL GROUP BY h',
    rowMode: 'array',
    callback: ([h, n]) => {
      const y = new Date(h * 3600 * 1000 + 1800 * 1000).getFullYear();
      if (y > 2000 && y < 2200) counts.set(y, (counts.get(y) || 0) + n);
    },
  });
  return [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([year, lines]) => ({ year, lines }));
}

function imageDataUri(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('data:image/')) return s;
  if (/^https?:\/\//.test(s)) return null; // remote covers would leak the visit; skip
  const mime = s.startsWith('/9j/')
    ? 'image/jpeg'
    : s.startsWith('iVBOR')
      ? 'image/png'
      : s.startsWith('R0lGOD')
        ? 'image/gif'
        : s.startsWith('UklGR')
          ? 'image/webp'
          : null;
  return mime ? `data:${mime};base64,${s}` : null;
}

function parseJsonList(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((x) => (typeof x === 'string' ? x : x && (x.name || x.title))).filter(Boolean);
  } catch {
    return [];
  }
}

const truthy = (v) => v === 1 || v === true || ['1', 'true', 'True', 'TRUE'].includes(String(v ?? '').trim());

// Grammar and filler that would otherwise crowd out the interesting words.
const WORD_STOPLIST = new Set(
  (
    'する いる ある なる 言う いう 思う 見る 来る くる 行く いく やる くれる もらう おる できる ない ' +
    'こと もの よう それ これ あれ どれ そう こう ああ どう ここ そこ あそこ どこ 何 なに なん ' +
    'ん の さん ちゃん くん 君 様 たち 達 方 ほう 中 時 とき 事 物 為 ため 前 後 上 下 今 一 二 ' +
    'ところ 所 わけ はず まま 感じ 気 自分 みんな 皆 他 ほか 的 等 ら さ ね よ な か わ ぞ ぜ ' +
    'ちょっと もう まだ また すごい いい 良い よい 本当 ほんと だけ ばかり くらい ぐらい'
  ).split(/\s+/),
);
// Words with kanji or katakana read as "yours"; pure-kana hits are mostly grammar.
const INTERESTING_WORD_RE = /[\u3400-\u9FFF\u30A1-\u30FA]/;
const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞', '形状詞']);

/**
 * Compute everything the story needs for one calendar year (local time).
 * `onProgress(label)` is called between phases.
 */
export function computeWrapped(db, year, { onProgress = () => {}, sessionGap = SESSION_GAP_SECONDS, archived = [] } = {}) {
  const { tables, cols } = tableInfo(db);
  const start = yearStart(year);
  const end = yearStart(year + 1);

  // ---- games metadata --------------------------------------------------
  onProgress('Reading your library');
  const gameCols = cols('games');
  const games = new Map();
  if (tables.has('games')) {
    const want = ['id', 'title_original', 'title_romaji', 'title_english', 'type', 'genres', 'completed', 'status', 'obs_scene_name'];
    const select = want.map((c) => (gameCols.has(c) ? c : `NULL AS ${c}`)).join(', ');
    for (const g of db.selectObjects(`SELECT ${select} FROM games`)) {
      games.set(g.id, {
        id: g.id,
        title: g.title_original || g.title_romaji || g.title_english || g.obs_scene_name || '',
        subtitle: g.title_english && g.title_english !== g.title_original ? g.title_english : g.title_romaji || '',
        type: (g.type || '').trim(),
        genres: parseJsonList(g.genres),
        completed: truthy(g.completed) || String(g.status || '').toLowerCase() === 'completed',
      });
    }
  }

  const breaks = tables.has('stats_reading_breaks')
    ? safe(
        () =>
          db
            .selectValues('SELECT CAST(timestamp AS REAL) FROM stats_reading_breaks WHERE timestamp >= ? AND timestamp < ? ORDER BY 1', [start, end])
            .filter(Number.isFinite),
        [],
      )
    : [];

  // ---- per-line pass over the year -----------------------------------
  onProgress('Counting every character');
  let ts = [];
  let charsArr = [];
  let gameIdx = [];
  let cardsArr = [];
  const gameKeys = [];
  const gameKeyIndex = new Map();
  const gameNames = [];
  const kanjiCounts = new Map();
  let firstLine = null;
  let lastLine = null;
  const JP_RE = /[぀-ヿ㐀-鿿]/;

  const gameIndexFor = (gid, gname) => {
    const key = gid && String(gid).trim() ? String(gid) : `name:${gname || 'Unknown'}`;
    let gi = gameKeyIndex.get(key);
    if (gi === undefined) {
      gi = gameKeys.length;
      gameKeys.push(key);
      gameKeyIndex.set(key, gi);
      gameNames.push(gname || '');
    }
    return gi;
  };
  const addLine = (t, gi, n, cards) => {
    ts.push(t);
    charsArr.push(n);
    gameIdx.push(gi);
    cardsArr.push(cards);
  };

  db.exec({
    sql: `SELECT CAST(timestamp AS REAL), game_id, game_name, line_text, note_ids, screenshot_in_anki, audio_in_anki
          FROM game_lines WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp`,
    bind: [start, end],
    rowMode: 'array',
    callback: ([t, gid, gname, text, noteIds, shot, audio]) => {
      if (!Number.isFinite(t)) return;
      const gi = gameIndexFor(gid, gname);
      const cleaned = cleanText(text);
      const n = codePointLength(cleaned);
      addLine(t, gi, n, countCards(noteIds, shot, audio));
      if (n) {
        for (const m of cleaned.matchAll(KANJI_RE)) kanjiCounts.set(m[0], (kanjiCounts.get(m[0]) || 0) + 1);
      }
      if (n >= 6 && JP_RE.test(cleaned)) {
        const line = { text: String(text).trim().replace(/\s*\n\s*/g, ' ').slice(0, 140), ts: t, game: gi };
        if (!firstLine) firstLine = line;
        lastLine = line;
      }
    },
  });

  // GSM can archive old games: their lines become text-free reading events.
  if (archived.length) {
    for (const day of archived) {
      const gi = gameIndexFor(day.gameId, day.gameName);
      let inYear = false;
      for (const [t, n, cards] of day.events) {
        if (!(t >= start && t < end)) continue;
        inYear = true;
        addLine(t, gi, Number(n) || 0, Number(cards) || 0);
      }
      if (inYear) for (const [k, c] of Object.entries(day.kanji || {})) kanjiCounts.set(k, (kanjiCounts.get(k) || 0) + (Number(c) || 0));
    }
    const order = ts.map((_, i) => i).sort((a, b) => ts[a] - ts[b]);
    ts = order.map((i) => ts[i]);
    charsArr = order.map((i) => charsArr[i]);
    gameIdx = order.map((i) => gameIdx[i]);
    cardsArr = order.map((i) => cardsArr[i]);
  }

  let totalChars = 0;
  let totalCards = 0;
  const cardsByGame = gameKeys.map(() => 0);
  for (let i = 0; i < ts.length; i++) {
    totalChars += charsArr[i];
    totalCards += cardsArr[i];
    cardsByGame[gameIdx[i]] += cardsArr[i];
  }

  const lineCount = ts.length;
  if (!lineCount) return { year, empty: true };

  // ---- sessions & reading time ---------------------------------------
  onProgress('Timing your sessions');
  const credit = new Float64Array(lineCount); // seconds credited to line i (gap to i+1)
  const sessions = [];
  let sessStart = 0;
  let gaps = [];
  let bi = 0;
  const flushSession = (endIdx) => {
    const credited = creditSession(gaps);
    let secs = 0;
    gaps.forEach(([, , i], k) => {
      credit[i] = credited[k];
      secs += credited[k];
    });
    let chars = 0;
    const perGame = new Map();
    for (let i = sessStart; i <= endIdx; i++) {
      chars += charsArr[i];
      perGame.set(gameIdx[i], (perGame.get(gameIdx[i]) || 0) + charsArr[i]);
    }
    let topGame = gameIdx[sessStart];
    let topChars = -1;
    for (const [g, c] of perGame) if (c > topChars) [topGame, topChars] = [g, c];
    sessions.push({ start: ts[sessStart], end: ts[endIdx], seconds: secs, chars, lines: endIdx - sessStart + 1, game: topGame });
    gaps = [];
  };
  for (let i = 0; i < lineCount - 1; i++) {
    const gap = ts[i + 1] - ts[i];
    if (gap > sessionGap) {
      flushSession(i);
      sessStart = i + 1;
      continue;
    }
    while (bi < breaks.length && breaks[bi] < ts[i]) bi++;
    if (bi < breaks.length && breaks[bi] < ts[i + 1]) continue; // gap spans an explicit pause
    gaps.push([gap, charsArr[i], i]);
  }
  flushSession(lineCount - 1);

  // ---- breakdowns ------------------------------------------------------
  onProgress('Finding your rhythm');
  const months = Array.from({ length: 12 }, () => ({ chars: 0, seconds: 0, lines: 0, cards: 0, days: new Set() }));
  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const days = new Map(); // dayKey -> {chars, seconds, lines, games: Map}
  const perGame = gameKeys.map(() => ({ chars: 0, seconds: 0, lines: 0, first: Infinity, last: -Infinity, days: new Set() }));
  let totalSeconds = 0;

  for (let i = 0; i < lineCount; i++) {
    const d = new Date(ts[i] * 1000);
    const dk = dayKey(d);
    const c = charsArr[i];
    const s = credit[i];
    const g = gameIdx[i];
    totalSeconds += s;
    const mo = months[d.getMonth()];
    mo.chars += c;
    mo.seconds += s;
    mo.lines += 1;
    mo.days.add(dk);
    hours[d.getHours()] += c;
    weekdays[d.getDay()] += c;
    let day = days.get(dk);
    if (!day) days.set(dk, (day = { chars: 0, seconds: 0, lines: 0, games: new Map() }));
    day.chars += c;
    day.seconds += s;
    day.lines += 1;
    day.games.set(g, (day.games.get(g) || 0) + c);
    const pg = perGame[g];
    pg.chars += c;
    pg.seconds += s;
    pg.lines += 1;
    pg.first = Math.min(pg.first, ts[i]);
    pg.last = Math.max(pg.last, ts[i]);
    pg.days.add(dk);
  }

  // ---- games ranking ---------------------------------------------------
  const allTimeFirst = new Map();
  safe(() => {
    db.exec({
      sql: 'SELECT game_id, game_name, MIN(timestamp) FROM game_lines GROUP BY game_id, game_name',
      rowMode: 'array',
      callback: ([gid, gname, t]) => {
        const key = gid && String(gid).trim() ? String(gid) : `name:${gname || 'Unknown'}`;
        if (Number.isFinite(t) && (!allTimeFirst.has(key) || t < allTimeFirst.get(key))) allTimeFirst.set(key, t);
      },
    });
  });

  const gameList = gameKeys.map((key, i) => {
    const meta = games.get(key);
    const pg = perGame[i];
    return {
      key,
      title: (meta && meta.title) || gameNames[i] || 'Unknown',
      subtitle: (meta && meta.subtitle) || '',
      type: (meta && meta.type) || '',
      genres: (meta && meta.genres) || [],
      completed: !!(meta && meta.completed),
      chars: pg.chars,
      seconds: pg.seconds,
      lines: pg.lines,
      cards: cardsByGame[i],
      days: pg.days.size,
      first: pg.first,
      last: pg.last,
      isNew: (allTimeFirst.get(key) ?? pg.first) >= start,
    };
  });
  const ranked = gameList.map((g, i) => ({ ...g, idx: i })).sort((a, b) => b.chars - a.chars);
  const rankedGames = ranked.filter((g) => g.chars > 0);

  // Covers only for games that are shown.
  const finished = rankedGames.filter((g) => g.completed);
  const coverKeys = new Set([...rankedGames.slice(0, 5), ...finished.slice(0, 12)].map((g) => g.key).filter((k) => games.has(k)));
  const covers = {};
  if (coverKeys.size && gameCols.has('image')) {
    safe(() => {
      const ids = [...coverKeys];
      const rows = db.selectArrays(`SELECT id, image FROM games WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      for (const [id, img] of rows) {
        const uri = imageDataUri(img);
        if (uri) covers[id] = uri;
      }
    });
  }
  const shapeGame = (g) => ({
    title: g.title,
    subtitle: g.subtitle,
    type: g.type,
    chars: g.chars,
    seconds: g.seconds,
    lines: g.lines,
    cards: g.cards,
    days: g.days,
    first: g.first,
    last: g.last,
    isNew: g.isNew,
    completed: g.completed,
    cover: covers[g.key] || null,
  });

  // ---- records -----------------------------------------------------------
  const dayEntries = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let biggestDay = null;
  for (const [k, v] of dayEntries) if (!biggestDay || v.chars > biggestDay.chars) biggestDay = { date: k, ...v };
  if (biggestDay) {
    let tg = null;
    let tc = -1;
    for (const [g, c] of biggestDay.games) if (c > tc) [tg, tc] = [g, c];
    biggestDay = { date: biggestDay.date, chars: biggestDay.chars, seconds: biggestDay.seconds, lines: biggestDay.lines, game: gameList[tg].title };
  }

  let longestStreak = { length: 0, start: null, end: null };
  let run = 0;
  let runStart = null;
  let prev = null;
  for (const [k] of dayEntries) {
    const d = new Date(`${k}T12:00:00`);
    if (prev && Math.round((d - prev) / 864e5) === 1) run += 1;
    else {
      run = 1;
      runStart = k;
    }
    if (run > longestStreak.length) longestStreak = { length: run, start: runStart, end: k };
    prev = d;
  }

  const longestSession = sessions.reduce((a, b) => (b.seconds > a.seconds ? b : a), sessions[0]);
  const sessionsWithTime = sessions.filter((s) => s.seconds > 0);

  // ---- speed -------------------------------------------------------------
  const speed = totalSeconds > 0 ? totalChars / (totalSeconds / 3600) : 0;
  const monthList = months.map((m, i) => ({
    month: i,
    chars: m.chars,
    seconds: m.seconds,
    lines: m.lines,
    days: m.days.size,
    speed: m.seconds >= 3600 ? m.chars / (m.seconds / 3600) : 0,
  }));
  const speedMonths = monthList.filter((m) => m.speed > 0);
  const speedGrowth =
    speedMonths.length >= 2
      ? {
          from: speedMonths[0],
          to: speedMonths[speedMonths.length - 1],
          pct: (speedMonths[speedMonths.length - 1].speed / speedMonths[0].speed - 1) * 100,
        }
      : null;
  const fastestMonth = speedMonths.reduce((a, b) => (!a || b.speed > a.speed ? b : a), null);
  const peakMonth = monthList.reduce((a, b) => (b.chars > a.chars ? b : a), monthList[0]);

  // ---- kanji -------------------------------------------------------------
  onProgress('Sorting your kanji');
  const topKanji = [...kanjiCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  let newKanji = null;
  let priorLines = 0;
  safe(() => {
    priorLines = db.selectValue('SELECT COUNT(*) FROM game_lines WHERE timestamp < ?', [start]) || 0;
    const seenBefore = new Set();
    if (tables.has('archived_game_days')) {
      db.exec({
        sql: 'SELECT kanji FROM archived_game_days WHERE date < ?',
        bind: [`${year}-01-01`],
        rowMode: 'array',
        callback: ([raw]) => {
          priorLines += 1;
          try {
            for (const k of Object.keys(JSON.parse(raw) || {})) seenBefore.add(k);
          } catch {
            /* ignore malformed archive rows */
          }
        },
      });
    }
    if (!priorLines) return;
    db.exec({
      sql: 'SELECT line_text FROM game_lines WHERE timestamp < ?',
      bind: [start],
      rowMode: 'array',
      callback: ([text]) => {
        if (!text) return;
        for (const m of String(text).matchAll(KANJI_RE)) seenBefore.add(m[0]);
      },
    });
    const fresh = [...kanjiCounts.entries()].filter(([k]) => !seenBefore.has(k)).sort((a, b) => b[1] - a[1]);
    newKanji = { count: fresh.length, top: fresh.slice(0, 8) };
  });

  // ---- words (needs GSM tokenization) -------------------------------------
  onProgress('Picking your words of the year');
  let words = null;
  if (tables.has('daily_stats_rollup') && cols('daily_stats_rollup').has('word_frequency_data')) {
    words = safe(() => {
      const freq = new Map();
      db.exec({
        sql: "SELECT word_frequency_data FROM daily_stats_rollup WHERE date >= ? AND date < ? AND word_frequency_data NOT IN ('', '{}')",
        bind: [`${year}-01-01`, `${year + 1}-01-01`],
        rowMode: 'array',
        callback: ([raw]) => {
          let obj;
          try {
            obj = JSON.parse(raw);
          } catch {
            return;
          }
          for (const [w, c] of Object.entries(obj || {})) freq.set(w, (freq.get(w) || 0) + (Number(c) || 0));
        },
      });
      if (!freq.size) return null;
      const candidates = [...freq.entries()]
        .filter(([w]) => !WORD_STOPLIST.has(w) && codePointLength(w) >= 2 && INTERESTING_WORD_RE.test(w))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 400);
      let pos = new Map();
      if (tables.has('words') && candidates.length) {
        const ws = candidates.map(([w]) => w);
        pos = new Map(db.selectArrays(`SELECT word, pos FROM words WHERE word IN (${ws.map(() => '?').join(',')})`, ws));
      }
      const top = candidates.filter(([w]) => !pos.size || CONTENT_POS.has(pos.get(w))).slice(0, 10);
      let newWords = null;
      if (tables.has('words') && cols('words').has('first_seen')) {
        newWords = db.selectValue('SELECT COUNT(*) FROM words WHERE CAST(first_seen AS REAL) >= ? AND CAST(first_seen AS REAL) < ?', [start, end]);
      }
      return { unique: freq.size, top, newWords };
    }, null);
  }

  // ---- anki ----------------------------------------------------------------
  onProgress('Tallying your Anki cards');
  let reviews = null;
  if (tables.has('anki_reviews')) {
    reviews = safe(() => {
      const [count, ms] = db.selectArray(
        'SELECT COUNT(*), SUM(CAST(time_taken AS INTEGER)) FROM anki_reviews WHERE CAST(review_time AS INTEGER) >= ? AND CAST(review_time AS INTEGER) < ?',
        [start * 1000, end * 1000],
      );
      return count ? { count, seconds: (ms || 0) / 1000 } : null;
    }, null);
  }
  const topMinedGame = [...rankedGames].sort((a, b) => b.cards - a.cards)[0];

  // ---- media types & genres -------------------------------------------------
  const typeTotals = new Map();
  const genreTotals = new Map();
  for (const g of rankedGames) {
    if (g.type) typeTotals.set(g.type, (typeTotals.get(g.type) || 0) + g.chars);
    for (const genre of g.genres) genreTotals.set(genre, (genreTotals.get(genre) || 0) + g.chars);
  }
  const sortTotals = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, chars]) => ({ name, chars }));

  // ---- other sources ----------------------------------------------------------
  let thirdParty = null;
  if (tables.has('third_party_stats')) {
    thirdParty = safe(() => {
      const [c, s] = db.selectArray(
        'SELECT SUM(CAST(characters_read AS INTEGER)), SUM(CAST(time_read_seconds AS REAL)) FROM third_party_stats WHERE date >= ? AND date < ?',
        [`${year}-01-01`, `${year + 1}-01-01`],
      );
      return c || s ? { chars: c || 0, seconds: s || 0 } : null;
    }, null);
  }

  const result = {
    year,
    empty: false,
    generatedAt: Date.now(),
    totals: {
      chars: totalChars,
      lines: lineCount,
      seconds: totalSeconds,
      cards: totalCards,
      activeDays: days.size,
      sessions: sessions.length,
      games: rankedGames.length,
      newGames: rankedGames.filter((g) => g.isNew).length,
      speed,
      avgSessionSeconds: sessionsWithTime.length ? sessionsWithTime.reduce((a, s) => a + s.seconds, 0) / sessionsWithTime.length : 0,
    },
    months: monthList,
    hours,
    weekdays,
    biggestDay,
    longestStreak,
    longestSession: longestSession && {
      start: longestSession.start,
      end: longestSession.end,
      seconds: longestSession.seconds,
      chars: longestSession.chars,
      game: gameList[longestSession.game].title,
    },
    speedGrowth,
    fastestMonth,
    peakMonth,
    games: rankedGames.slice(0, 5).map(shapeGame),
    finished: finished.slice(0, 12).map(shapeGame),
    kanji: { unique: kanjiCounts.size, top: topKanji, fresh: newKanji, hasHistory: priorLines > 0 },
    words,
    anki: { mined: totalCards, reviews, topGame: topMinedGame && topMinedGame.cards ? { title: topMinedGame.title, cards: topMinedGame.cards } : null },
    types: sortTotals(typeTotals),
    genres: sortTotals(genreTotals).slice(0, 8),
    thirdParty,
    firstLine: firstLine && { text: firstLine.text, ts: firstLine.ts, game: gameList[firstLine.game].title },
    lastLine: lastLine && lastLine !== firstLine ? { text: lastLine.text, ts: lastLine.ts, game: gameList[lastLine.game].title } : null,
  };
  result.persona = pickPersona(result);
  return result;
}

// ---- persona ---------------------------------------------------------------
export const PERSONAS = {
  nightOwl: { name: 'The Night Owl', jp: '夜更かし読書家', blurb: 'The best lines hit different after midnight. Most of your reading happened between 10pm and 4am.' },
  earlyBird: { name: 'The Early Bird', jp: '早起き読書家', blurb: 'Coffee, sunrise, kanji. You did a huge share of your reading before 9am.' },
  weekendWarrior: { name: 'The Weekend Warrior', jp: '週末の戦士', blurb: 'Weekdays are for surviving. Weekends are for reading, and you went all in.' },
  marathoner: { name: 'The Marathoner', jp: '長距離ランナー', blurb: 'You don’t dip in, you dive. Your sessions were long, deep and uninterrupted.' },
  devotee: { name: 'The Devotee', jp: '一途な読者', blurb: 'One story had your heart. Most of your year went into a single title.' },
  explorer: { name: 'The Explorer', jp: '冒険家', blurb: 'So many worlds, so little time. You hopped between more titles than most people start.' },
  miner: { name: 'The Miner', jp: '採掘王', blurb: 'Every unknown word is an ore vein. You mined cards at an impressive rate.' },
  everyday: { name: 'The Daily Reader', jp: '毎日コツコツ', blurb: 'Consistency is your superpower. Japanese was part of your days, again and again.' },
  bookworm: { name: 'The Bookworm', jp: '本の虫', blurb: 'Steady, curious and always mid-story. Reading Japanese is simply what you do.' },
};

export function pickPersona(r) {
  const t = r.totals;
  const sum = (arr, idx) => idx.reduce((a, i) => a + arr[i], 0);
  const night = t.chars ? sum(r.hours, [22, 23, 0, 1, 2, 3]) / t.chars : 0;
  const morning = t.chars ? sum(r.hours, [5, 6, 7, 8]) / t.chars : 0;
  const weekend = t.chars ? (r.weekdays[0] + r.weekdays[6]) / t.chars : 0;
  const topShare = r.games.length && t.chars ? r.games[0].chars / t.chars : 0;
  const cardsPer10k = t.chars ? (t.cards / t.chars) * 10000 : 0;
  const yearDays = r.year === new Date().getFullYear() ? Math.max(1, dayOfYear(new Date())) : 365;
  const scores = {
    nightOwl: night / 0.4,
    earlyBird: morning / 0.3,
    weekendWarrior: weekend / 0.5,
    marathoner: t.avgSessionSeconds / (75 * 60),
    devotee: r.games.length > 1 ? topShare / 0.7 : 0,
    explorer: t.games / 10,
    miner: cardsPer10k / 8,
    everyday: Math.max(t.activeDays / yearDays / 0.6, r.longestStreak.length / 45),
  };
  let best = 'bookworm';
  let bestScore = 1;
  for (const [k, v] of Object.entries(scores)) if (v > bestScore) [best, bestScore] = [k, v];
  return { key: best, ...PERSONAS[best], stats: { night, morning, weekend, topShare, cardsPer10k } };
}

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1;
}

// Archived days store reading events as zlib-compressed JSON; inflate them up front.
export async function loadArchivedDays(db, year) {
  const { tables } = tableInfo(db);
  if (!tables.has('archived_game_days')) return [];
  const rows = db.selectArrays('SELECT game_id, game_name, events, kanji FROM archived_game_days WHERE date >= ? AND date <= ?', [
    `${year - 1}-12-31`,
    `${year + 1}-01-01`,
  ]);
  const out = [];
  for (const [gameId, gameName, blob, kanji] of rows) {
    try {
      const bytes = typeof blob === 'string' ? new TextEncoder().encode(blob) : blob;
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      const events = JSON.parse(await new Response(stream).text());
      let kanjiMap = {};
      try {
        kanjiMap = JSON.parse(kanji || '{}') || {};
      } catch {
        /* keep empty */
      }
      out.push({ gameId, gameName, events, kanji: kanjiMap });
    } catch (e) {
      console.warn('[gsm-wrapped] skipped archived day', e);
    }
  }
  return out;
}
