// Open gsm.db read-only via the custom VFS.
// With a -wal file, exclusive locking lets SQLite replay it from heap memory
// (no shared-memory file needed). Without one, immutable=1 skips WAL entirely.
export function openGsmDb(sqlite3, vfsName, hasWal) {
  const { capi, oo1 } = sqlite3;
  const filename = hasWal ? 'file:gsm.db?mode=ro' : 'file:gsm.db?immutable=1';
  const db = new oo1.DB({ filename, flags: 'r', vfs: vfsName });
  capi.sqlite3_db_config(db.pointer, capi.SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, 1, 0);
  if (hasWal) db.exec('PRAGMA locking_mode=EXCLUSIVE');
  db.exec('PRAGMA temp_store=MEMORY; PRAGMA cache_size=-65536;');
  // Force the first read now so a bad file fails here, not mid-story.
  db.selectValue('SELECT count(*) FROM sqlite_master');
  return db;
}
