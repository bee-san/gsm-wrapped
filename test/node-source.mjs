// Node helpers: open a gsm.db through the same read-only VFS the browser uses.
import fs from 'node:fs';
import path from 'node:path';
import sqlite3InitModule from '../vendor/sqlite-wasm/node.mjs';
import { installReadOnlyVfs, chunkedSource } from '../js/blobvfs.js';
import { openGsmDb } from '../js/dbopen.js';

export function fileSource(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const size = fs.fstatSync(fd).size;
  return chunkedSource(size, (offset, length) => {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, offset);
    return new Uint8Array(buf.buffer, buf.byteOffset, n);
  });
}

export async function openFromDisk(dbPath, { useWal = true } = {}) {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: console.error });
  const sources = new Map([['gsm.db', fileSource(dbPath)]]);
  const walPath = `${dbPath}-wal`;
  if (useWal && fs.existsSync(walPath) && fs.statSync(walPath).size > 0) {
    sources.set('gsm.db-wal', fileSource(walPath));
  }
  installReadOnlyVfs(sqlite3, 'gsmro', sources);
  return { sqlite3, db: openGsmDb(sqlite3, 'gsmro', sources.has('gsm.db-wal')), name: path.basename(dbPath) };
}
