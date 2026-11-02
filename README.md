# Your Year in GameSentenceMiner

A Spotify Wrapped-style year in review for [GameSentenceMiner](https://github.com/bpwhelan/GameSentenceMiner) (GSM).
Drop your `gsm.db` onto the page and get a story of your year in Japanese: characters read, hours,
your top titles, kanji, words, cards mined, records, reading speed, your first line of the year and a
reading personality, finishing with a shareable summary card.

**Live site:** https://bee-san.github.io/gsm-wrapped/

## Your data stays on your device

Nothing is uploaded. The page is static: the database is opened in a Web Worker with SQLite compiled
to WebAssembly and queried in your browser tab. The worker reads the file lazily (page by page via
`FileReaderSync`), so multi-gigabyte databases open in seconds without being copied into memory.

## Finding `gsm.db`

1. Find the GSM icon in your system tray (the slime in a hard hat).
2. Right-click it and choose **Open GSM Folder**.
3. Find `gsm.db` (Windows may show it as `gsm`, type *Data Base File*).
4. Drag it onto the page. You can also drop the whole folder.

Default locations: `%APPDATA%\GameSentenceMiner\gsm.db` on Windows,
`~/.config/GameSentenceMiner/gsm.db` on macOS and Linux.

If GSM is still running, also drop `gsm.db-wal` so recent reading is included; the site replays the
write-ahead log read-only.

## How the numbers are calculated

The stats mirror GSM's own code so they line up with the GSM dashboard:

- **Characters** strip punctuation, symbols and whitespace (`clean_text_for_stats`).
- **Reading time** uses GSM's adaptive estimate: lines are grouped into sessions split by gaps over
  30 minutes, and each gap is capped at 2.5× the session's median pace (`calculate_actual_reading_time`).
  Explicit reading pauses are respected.
- **Cards mined** count `note_ids`, falling back to the screenshot/audio flags (`count_cards_from_line`).
- **Archived games** (GSM's text-free archive) are included.
- **Words of the year** come from GSM's daily tokenisation rollups, so they need tokenisation enabled.
- Days and hours use your browser's time zone.

## Development

No build step. Serve the folder and open it:

```sh
npm run serve   # python3 -m http.server 8642
```

| Path | What it does |
| --- | --- |
| `js/blobvfs.js` | Read-only SQLite VFS over `File`/`Blob` (or any random-access source) |
| `js/dbopen.js` | Opens `gsm.db` immutably, or with the WAL replayed in exclusive mode |
| `js/stats.js` | All year-in-review calculations |
| `js/worker.js` | Module worker that owns SQLite |
| `js/slides.js`, `js/share.js` | Story slides and the 1080×1920 share card |
| `test/` | Node harness that runs the same code against a database on disk |

Run the stats against a real database from Node:

```sh
node test/run.mjs ~/.config/GameSentenceMiner/gsm.db 2026
```

Regenerate the demo (made-up titles and text):

```sh
npm run demo
```

`vendor/sqlite-wasm` is an unmodified copy of `@sqlite.org/sqlite-wasm` (see its `NOTICE.md`).
