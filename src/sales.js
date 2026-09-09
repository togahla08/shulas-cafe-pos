'use strict';
/* Sales history: list with filters, detail, void */
const { getDb } = require('./db');
const ordersMod = require('./orders');

function list(q) {
  const d = getDb();
  const from = q.get('from');
  const to = q.get('to');
  const limit = Math.min(Number(q.get('limit')) || 100, 500);
  let sql = 'SELECT * FROM sales';
  const where = [];
  const args = [];
  if (from) { where.push('date(created_at) >= date(?)'); args.push(from); }
  if (to) { where.push('date(created_at) <= date(?)'); args.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT ?';
  args.push(limit);
  return d.prepare(sql).all(...args);
}

function detail(id) { return ordersMod.saleDetail(id); }

function void_(id) {
  const d = getDb();
  const s = d.prepare("SELECT * FROM sales WHERE id=? AND status='cobrada'").get(id);
  if (!s) throw new Error('Venta no encontrada o ya anulada');
  d.prepare("UPDATE sales SET status='anulada' WHERE id=?").run(id);
  return { ok: true };
}

module.exports = { list, detail, void_, void: (id) => void_(id), takeaway: (b) => ordersMod.takeaway(b) };
