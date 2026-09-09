'use strict';
/* Staff: workers + time clock with signature capture */
const fs = require('node:fs');
const path = require('node:path');
const { getDb, DB_PATH } = require('./db');

const SIG_DIR = path.join(path.dirname(DB_PATH), 'signatures');

function ensureSigDir() { fs.mkdirSync(SIG_DIR, { recursive: true }); }

function listWorkers() {
  const d = getDb();
  const workers = d.prepare('SELECT * FROM workers ORDER BY active DESC, name').all();
  const today = d.prepare("SELECT date('now','localtime') AS t").get().t;
  const punches = d.prepare('SELECT * FROM time_punches WHERE date(ts)=date(?) ORDER BY ts').all(today);
  return workers.map((w) => ({ ...w, today: punches.filter((p) => p.worker_id === w.id) }));
}

function createWorker(b) {
  const name = String(b.name || '').trim();
  if (!name) throw new Error('El nombre es obligatorio');
  const d = getDb();
  const r = d.prepare('INSERT INTO workers (name,role) VALUES (?,?)').run(name, b.role ? String(b.role) : null);
  return d.prepare('SELECT * FROM workers WHERE id=?').get(Number(r.lastInsertRowid));
}

function updateWorker(id, b) {
  const d = getDb();
  const cur = d.prepare('SELECT * FROM workers WHERE id=?').get(id);
  if (!cur) throw new Error('Trabajador no encontrado');
  d.prepare('UPDATE workers SET name=?, role=?, active=? WHERE id=?')
    .run(
      b.name !== undefined ? String(b.name).trim() : cur.name,
      b.role !== undefined ? (b.role ? String(b.role) : null) : cur.role,
      b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
      id
    );
  return d.prepare('SELECT * FROM workers WHERE id=?').get(id);
}

function removeWorker(id) {
  getDb().prepare('DELETE FROM workers WHERE id=?').run(id);
}

function saveSignature(dataUrl) {
  /* dataUrl: "data:image/png;base64,...." */
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return null;
  const b64 = dataUrl.slice('data:image/png;base64,'.length);
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length || buf.length > 2 * 1024 * 1024) return null;
  ensureSigDir();
  const name = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  fs.writeFileSync(path.join(SIG_DIR, name), buf);
  return `signatures/${name}`;
}

function punch(b) {
  const d = getDb();
  const w = d.prepare('SELECT * FROM workers WHERE id=?').get(Number(b.worker_id));
  if (!w) throw new Error('Trabajador no encontrado');
  const kind = b.kind === 'out' ? 'out' : 'in';
  const today = d.prepare("SELECT date('now','localtime') AS t").get().t;
  const todays = d.prepare('SELECT * FROM time_punches WHERE worker_id=? AND date(ts)=date(?) ORDER BY ts').all(w.id, today);
  const last = todays[todays.length - 1];
  if (last && last.kind === kind) {
    throw new Error(kind === 'in' ? 'Ya marco su ENTRADA hoy' : 'Ya marco su SALIDA hoy');
  }
  const sig = saveSignature(b.signature);
  const r = d.prepare('INSERT INTO time_punches (worker_id,kind,sig_path) VALUES (?,?,?)').run(w.id, kind, sig);
  return d.prepare('SELECT * FROM time_punches WHERE id=?').get(Number(r.lastInsertRowid));
}

function today() {
  const d = getDb();
  const rows = d.prepare(`
    SELECT tp.*, w.name AS worker_name FROM time_punches tp
    JOIN workers w ON w.id=tp.worker_id
    WHERE date(tp.ts)=date('now','localtime') ORDER BY tp.ts
  `).all();
  return rows;
}

function deletePunch(id) {
  getDb().prepare('DELETE FROM time_punches WHERE id=?').run(id);
}

module.exports = { listWorkers, createWorker, updateWorker, removeWorker, punch, today, deletePunch };
