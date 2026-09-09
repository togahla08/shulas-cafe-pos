'use strict';
/* Cafe tables: list, create, rename, remove, move order between tables */
const { db } = require('./db');

function list() {
  const d = db;
  const tables = d.prepare('SELECT * FROM cafe_tables ORDER BY sort, id').all();
  const open = d.prepare(`
    SELECT o.*, t.name AS table_name,
           (SELECT COALESCE(SUM(price*qty),0) FROM order_items WHERE order_id=o.id) AS total,
           (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) AS items
    FROM orders o LEFT JOIN cafe_tables t ON t.id = o.table_id
    WHERE o.status='abierta' AND o.type='mesa'
  `).all();
  const byTable = new Map(open.map((o) => [o.table_id, o]));
  return tables.map((t) => {
    const o = byTable.get(t.id);
    return {
      ...t,
      status: o ? 'ocupada' : 'libre',
      order: o ? { id: o.id, total: o.total, items: o.items, created_at: o.created_at } : null
    };
  });
}

function create(b) {
  const name = String(b.name || '').trim();
  if (!name) throw new Error('El nombre es obligatorio');
  const d = db;
  const max = d.prepare('SELECT COALESCE(MAX(sort),-1) AS s FROM cafe_tables').get().s;
  const r = d.prepare('INSERT INTO cafe_tables (name,zone,sort) VALUES (?,?,?)')
    .run(name, b.zone || 'Salón', max + 1);
  return d.prepare('SELECT * FROM cafe_tables WHERE id=?').get(Number(r.lastInsertRowid));
}

function rename(id, b) {
  const d = db;
  const cur = d.prepare('SELECT * FROM cafe_tables WHERE id=?').get(id);
  if (!cur) throw new Error('Mesa no encontrada');
  d.prepare('UPDATE cafe_tables SET name=?, zone=? WHERE id=?')
    .run(b.name !== undefined ? String(b.name).trim() : cur.name, b.zone || cur.zone, id);
  return d.prepare('SELECT * FROM cafe_tables WHERE id=?').get(id);
}

function remove(id) {
  const d = db;
  const open = d.prepare("SELECT id FROM orders WHERE table_id=? AND status='abierta'").get(id);
  if (open) throw new Error('La mesa tiene un pedido abierto. Cóbrela o cancelela primero.');
  d.prepare('DELETE FROM cafe_tables WHERE id=?').run(id);
}

function move(fromId, b) {
  /* move the open order of table `fromId` to table b.to_id */
  const d = db;
  const to = Number(b.to_id);
  const from = Number(fromId);
  const target = d.prepare('SELECT id FROM cafe_tables WHERE id=?').get(to);
  if (!target) throw new Error('Mesa destino no encontrada');
  if (to === from) throw new Error('El pedido ya esta en esa mesa');
  const openTarget = d.prepare("SELECT id FROM orders WHERE table_id=? AND status='abierta'").get(to);
  if (openTarget) throw new Error('La mesa destino ya tiene un pedido abierto');
  const order = d.prepare("SELECT id FROM orders WHERE table_id=? AND status='abierta'").get(from);
  if (!order) throw new Error('La mesa origen no tiene pedido abierto');
  d.prepare('UPDATE orders SET table_id=? WHERE id=?').run(to, order.id);
  return { ok: true };
}

module.exports = { list, create, rename, remove, move };
