// Module worker: owns SQLite and does all the number crunching off the UI thread.
// Files are read lazily with FileReaderSync, so nothing is uploaded or fully buffered.
import sqlite3InitModule from '../vendor/sqlite-wasm/index.mjs';
import { installReadOnlyVfs, chunkedSource } from './blobvfs.js';
import { openGsmDb } from './dbopen.js';
import { listYears, computeWrapped, loadArchivedDays } from './stats.js';

const sqlite3Ready = sqlite3InitModule({ print: () => {}, printErr: () => {} });
let db = null;
let opened = 0;

function blobSource(blob) {
  const reader = new FileReaderSync();
  return chunkedSource(blob.size, (offset, length) => new Uint8Array(reader.readAsArrayBuffer(blob.slice(offset, offset + length))));
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  const progress = (label) => self.postMessage({ id, progress: label });
  try {
    if (type === 'open') {
      progress('Warming up SQLite');
      const sqlite3 = await sqlite3Ready;
      if (db) db.close();
      db = null;
      const sources = new Map([['gsm.db', blobSource(data.db)]]);
      const hasWal = !!(data.wal && data.wal.size > 0);
      if (hasWal) sources.set('gsm.db-wal', blobSource(data.wal));
      // A fresh VFS per file keeps state from a previous file out of the way.
      const vfsName = `gsm-ro-${++opened}`;
      installReadOnlyVfs(sqlite3, vfsName, sources);
      progress(hasWal ? 'Replaying recent changes' : 'Opening your database');
      db = openGsmDb(sqlite3, vfsName, hasWal);
      self.postMessage({ id, ok: true, result: { years: listYears(db) } });
    } else if (type === 'compute') {
      if (!db) throw new Error('No database is open.');
      progress('Unpacking archived games');
      const archived = await loadArchivedDays(db, data.year);
      const result = computeWrapped(db, data.year, { archived, onProgress: progress });
      self.postMessage({ id, ok: true, result });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String((e && e.message) || e) });
  }
};
