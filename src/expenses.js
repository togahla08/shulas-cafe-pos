'use strict';
/* Expenses: quick capture of business costs */
const { db } = require('./db');

const CATS = ['insumos', 'servicios', 'salarios', 'renta', 'mantenimiento', 'otros'];

function list(q) {
  const d = db;
  const from = q.get('from');
  const to = q.get('to');
  let sql = 'SELECT * FROM expenses';
  const where = [];
  const args = [];
  if (from) { where.push('date >= date(?)'); args.push(from); }
  if (to) { where.push('date <= date(?)'); args.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY date DESC, id DESC LIMIT 500';
  return d.prepare(sql).all(...args);
}

function create(b) {
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto invalido');
  const cat = CATS.includes(b.category) ? b.category : 'otros';
  const d = db;
  const date = b.date || d.prepare("SELECT date('now','localtime') AS t").get().t;
  const r = d.prepare('INSERT INTO expenses (category,amount,note,date) VALUES (?,?,?,?)')
    .run(cat, amount, b.note ? String(b.note) : null, date);
  return d.prepare('SELECT * FROM expenses WHERE id=?').get(Number(r.lastInsertRowid));
}

function update(id, b) {
  const d = db;
  const cur = d.prepare('SELECT * FROM expenses WHERE id=?').get(id);
  if (!cur) throw new Error('Gasto no encontrado');
  const amount = b.amount !== undefined ? Number(b.amount) : cur.amount;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto invalido');
  d.prepare('UPDATE expenses SET category=?, amount=?, note=?, date=? WHERE id=?')
    .run(
      b.category !== undefined ? (CATS.includes(b.category) ? b.category : 'otros') : cur.category,
      amount,
      b.note !== undefined ? (b.note ? String(b.note) : null) : cur.note,
      b.date || cur.date,
      id
    );
  return d.prepare('SELECT * FROM expenses WHERE id=?').get(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM expenses WHERE id=?').run(id);
}

module.exports = { list, create, update, remove, CATS };
