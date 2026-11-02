// Compute assets/demo.json from a demo database: node test/make-demo.mjs path/to/gsm.db 2025
import fs from 'node:fs';
import { openFromDisk } from './node-source.mjs';
import { computeWrapped } from '../js/stats.js';
const [p, y] = process.argv.slice(2);
const { db } = await openFromDisk(p);
const r = computeWrapped(db, Number(y));
r.generatedAt = 0;
fs.writeFileSync(new URL('../assets/demo.json', import.meta.url), JSON.stringify(r));
console.log(JSON.stringify({ totals: r.totals, persona: r.persona.key, games: r.games.map((g) => [g.title, g.chars]), words: r.words && r.words.top.slice(0, 5), first: r.firstLine, streak: r.longestStreak, growth: r.speedGrowth && Math.round(r.speedGrowth.pct) }, null, 1));
