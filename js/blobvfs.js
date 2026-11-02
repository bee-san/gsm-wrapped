// Read-only SQLite VFS over random-access byte sources, so a multi-GB gsm.db is
// queried page-by-page instead of being copied into WASM memory.
//
// A source is { size: number, read(offset, length) => Uint8Array }.
// Files SQLite creates itself (temp files) live in memory.

class MemFile {
  constructor() {
    this.buf = new Uint8Array(0);
    this.size = 0;
  }
  read(offset, length) {
    const end = Math.min(this.size, offset + length);
    return offset >= end ? new Uint8Array(0) : this.buf.subarray(offset, end);
  }
  write(bytes, offset) {
    const end = offset + bytes.length;
    if (end > this.buf.length) {
      const next = new Uint8Array(Math.max(end, this.buf.length * 2, 65536));
      next.set(this.buf.subarray(0, this.size));
      this.buf = next;
    }
    this.buf.set(bytes, offset);
    this.size = Math.max(this.size, end);
  }
  truncate(size) {
    this.size = Math.min(this.size, size);
  }
}

export function installReadOnlyVfs(sqlite3, vfsName, sources) {
  const { capi, wasm } = sqlite3;
  const openFiles = new Map(); // pFile -> { name, src?, mem?, flags }
  const memFiles = new Map(); // name -> MemFile
  let tempCounter = 0;
  let lastError = null;

  const norm = (name) => name.replace(/^\/+/, '');

  const io = {
    xCheckReservedLock(pFile, pOut) {
      wasm.poke32(pOut, 0);
      return 0;
    },
    xClose(pFile) {
      const f = openFiles.get(pFile);
      openFiles.delete(pFile);
      if (f && f.mem && f.flags & capi.SQLITE_OPEN_DELETEONCLOSE) memFiles.delete(f.name);
      return 0;
    },
    xDeviceCharacteristics() {
      return capi.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
    },
    xFileControl() {
      return capi.SQLITE_NOTFOUND;
    },
    xFileSize(pFile, pSz64) {
      const f = openFiles.get(pFile);
      wasm.poke64(pSz64, BigInt(f.src ? f.src.size : f.mem.size));
      return 0;
    },
    xLock() {
      return 0;
    },
    xRead(pFile, pDest, n, offset64) {
      const f = openFiles.get(pFile);
      const dest = Number(pDest);
      try {
        const bytes = (f.src || f.mem).read(Number(offset64), n);
        const heap = wasm.heap8u();
        heap.set(bytes, dest);
        if (bytes.length < n) {
          heap.fill(0, dest + bytes.length, dest + n);
          return capi.SQLITE_IOERR_SHORT_READ;
        }
        return 0;
      } catch (e) {
        lastError = e;
        return capi.SQLITE_IOERR_READ;
      }
    },
    xSectorSize() {
      return 4096;
    },
    xSync() {
      return 0;
    },
    xTruncate(pFile, sz64) {
      const f = openFiles.get(pFile);
      if (!f.mem) return capi.SQLITE_READONLY;
      f.mem.truncate(Number(sz64));
      return 0;
    },
    xUnlock() {
      return 0;
    },
    xWrite(pFile, pSrc, n, offset64) {
      const f = openFiles.get(pFile);
      // The uploaded database is never modified.
      if (!f.mem) return capi.SQLITE_READONLY;
      const src = Number(pSrc);
      f.mem.write(wasm.heap8u().slice(src, src + n), Number(offset64));
      return 0;
    },
  };

  const ioMethods = new capi.sqlite3_io_methods();
  ioMethods.$iVersion = 1;
  sqlite3.vfs.installVfs({ io: { struct: ioMethods, methods: io } });

  const vfsMethods = {
    xAccess(pVfs, zName, flags, pOut) {
      const name = norm(wasm.cstrToJs(zName));
      wasm.poke32(pOut, sources.has(name) || memFiles.has(name) ? 1 : 0);
      return 0;
    },
    xCurrentTime(pVfs, pOut) {
      wasm.poke(pOut, 2440587.5 + Date.now() / 864e5, 'double');
      return 0;
    },
    xCurrentTimeInt64(pVfs, pOut) {
      wasm.poke(pOut, 0xbfc83e532200 + Date.now(), 'i64');
      return 0;
    },
    xDelete(pVfs, zName) {
      memFiles.delete(norm(wasm.cstrToJs(zName)));
      return 0;
    },
    xFullPathname(pVfs, zName, nOut, pOut) {
      return wasm.cstrncpy(pOut, zName, nOut) < nOut ? 0 : capi.SQLITE_CANTOPEN;
    },
    xGetLastError(pVfs, nOut, pOut) {
      if (lastError) {
        const msg = String(lastError.message || lastError).slice(0, Math.max(0, nOut - 1));
        const scope = wasm.scopedAllocPush();
        try {
          wasm.cstrncpy(pOut, wasm.scopedAllocCString(msg), nOut);
        } finally {
          wasm.scopedAllocPop(scope);
        }
      }
      return 0;
    },
    xOpen(pVfs, zName, pFile, flags, pOutFlags) {
      const name = zName && wasm.peek8(zName) ? norm(wasm.cstrToJs(zName)) : `temp-${++tempCounter}`;
      let entry;
      if (sources.has(name)) {
        entry = { name, src: sources.get(name), flags };
        flags = (flags & ~(capi.SQLITE_OPEN_READWRITE | capi.SQLITE_OPEN_CREATE)) | capi.SQLITE_OPEN_READONLY;
      } else if (memFiles.has(name) || flags & capi.SQLITE_OPEN_CREATE) {
        if (!memFiles.has(name)) memFiles.set(name, new MemFile());
        entry = { name, mem: memFiles.get(name), flags };
      } else {
        return capi.SQLITE_CANTOPEN;
      }
      openFiles.set(pFile, entry);
      const file = new capi.sqlite3_file(pFile);
      file.$pMethods = ioMethods.pointer;
      file.dispose();
      if (pOutFlags) wasm.poke32(pOutFlags, flags);
      return 0;
    },
    xRandomness(pVfs, nOut, pOut) {
      const heap = wasm.heap8u();
      const p = Number(pOut);
      for (let i = 0; i < nOut; i++) heap[p + i] = (Math.random() * 256) & 255;
      return nOut;
    },
    xSleep() {
      return 0;
    },
  };

  const vfs = new capi.sqlite3_vfs();
  vfs.$iVersion = 2;
  vfs.$szOsFile = capi.sqlite3_file.structInfo.sizeof;
  vfs.$mxPathname = 1024;
  vfs.addOnDispose((vfs.$zName = wasm.allocCString(vfsName)));
  sqlite3.vfs.installVfs({ vfs: { struct: vfs, methods: vfsMethods } });
  return vfs;
}

// Chunked LRU reader: few large reads beat thousands of 4 KiB ones.
export function chunkedSource(size, readRaw, { chunkSize = 256 * 1024, maxChunks = 256 } = {}) {
  const cache = new Map();
  const getChunk = (idx) => {
    let chunk = cache.get(idx);
    if (chunk) {
      cache.delete(idx);
      cache.set(idx, chunk);
      return chunk;
    }
    const start = idx * chunkSize;
    chunk = readRaw(start, Math.min(chunkSize, size - start));
    cache.set(idx, chunk);
    if (cache.size > maxChunks) cache.delete(cache.keys().next().value);
    return chunk;
  };
  return {
    size,
    read(offset, length) {
      const end = Math.min(size, offset + length);
      if (offset >= end) return new Uint8Array(0);
      const first = Math.floor(offset / chunkSize);
      const last = Math.floor((end - 1) / chunkSize);
      if (first === last) {
        const base = first * chunkSize;
        return getChunk(first).subarray(offset - base, end - base);
      }
      const out = new Uint8Array(end - offset);
      for (let i = first; i <= last; i++) {
        const base = i * chunkSize;
        const chunk = getChunk(i);
        const from = Math.max(offset, base) - base;
        const to = Math.min(end, base + chunk.length) - base;
        out.set(chunk.subarray(from, to), base + from - offset);
      }
      return out;
    },
  };
}
