'use strict';
/* Backup: export the SQLite file, restore from a base64 upload */
const fs = require('node:fs');
const { getDb, resetDb, DB_PATH } = require('./db');

function exportDb(res) {
  /* checkpoint WAL so the .db file is complete */
  try { getDb().exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) { /* ignore */ }
  const buf = fs.readFileSync(DB_PATH);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="respaldo_shulas_${new Date().toISOString().slice(0, 10)}.db"`,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  });
  res.end(buf);
}

function restore(b) {
  const data = String(b.data || '');
  const m = data.match(/^data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('Archivo de respaldo invalido');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.slice(0, 15).toString('utf8') !== 'SQLite format 3') {
    throw new Error('El archivo no es una base de datos valida');
  }
  resetDb(); /* close current connection */
  fs.writeFileSync(DB_PATH + '.tmp', buf);
  fs.renameSync(DB_PATH + '.tmp', DB_PATH);
  try { fs.rmSync(DB_PATH + '-wal', { force: true }); fs.rmSync(DB_PATH + '-shm', { force: true }); } catch (_) {}
  getDb(); /* reopen + migrate */
  return { ok: true };
}

module.exports = { exportDb, restore };
