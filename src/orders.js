'use strict';
/* Orders: open orders for tables/takeaway, items, cancel, and checkout */
const { getDb } = require('./db');
const inventory = require('./inventory');

function rowTotal(items) {
  return items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
}

function listOpen() {
  const d = getDb();
  return d.prepare(`
    SELECT o.*, t.name AS table_name,
           (SELECT COALESCE(SUM(price*qty),0) FROM order_items WHERE order_id=o.id) AS total,
           (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) AS items
    FROM orders o LEFT JOIN cafe_tables t ON t.id=o.table_id
    WHERE o.status='abierta'
    ORDER BY o.created_at
  `).all();
}

function get(id) {
  const d = getDb();
  const o = d.prepare(`
    SELECT o.*, t.name AS table_name FROM orders o
    LEFT JOIN cafe_tables t ON t.id=o.table_id WHERE o.id=?
  `).get(id);
  if (!o) return null;
  o.items = d.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
  o.total = rowTotal(o.items);
  return o;
}

function create(b) {
  const d = getDb();
  let tableId = null;
  const type = b.type === 'llevar' ? 'llevar' : 'mesa';
  if (type === 'mesa') {
    tableId = Number(b.table_id);
    const t = d.prepare('SELECT id FROM cafe_tables WHERE id=?').get(tableId);
    if (!t) throw new Error('Mesa no encontrada');
    const open = d.prepare("SELECT id FROM orders WHERE table_id=? AND status='abierta'").get(tableId);
    if (open) throw new Error('La mesa ya tiene un pedido abierto');
  }
  const r = d.prepare("INSERT INTO orders (table_id,type,status) VALUES (?,?,'abierta')").run(tableId, type);
  return get(Number(r.lastInsertRowid));
}

function addItems(id, b) {
  const d = getDb();
  const o = d.prepare("SELECT * FROM orders WHERE id=? AND status='abierta'").get(id);
  if (!o) throw new Error('El pedido no esta abierto');
  const items = Array.isArray(b.items) ? b.items : [b];
  const ins = d.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty,note) VALUES (?,?,?,?,?,?)');
  const out = [];
  for (const it of items) {
    const pid = it.product_id ? Number(it.product_id) : null;
    let name = String(it.name || '').trim();
    let price = Number(it.price);
    if (pid) {
      const p = d.prepare('SELECT * FROM products WHERE id=?').get(pid);
      if (!p) throw new Error('Producto no encontrado');
      name = name || p.name;
      price = Number.isFinite(price) && price >= 0 ? price : p.price;
    }
    if (!name) throw new Error('Falta el nombre del producto');
    if (!Number.isFinite(price) || price < 0) throw new Error('Precio invalido');
    const qty = Number.isFinite(Number(it.qty)) && Number(it.qty) > 0 ? Number(it.qty) : 1;
    const r = ins.run(id, pid, name, price, qty, it.note ? String(it.note) : null);
    out.push({ id: Number(r.lastInsertRowid) });
  }
  return get(id);
}

function updateItem(itemId, b) {
  const d = getDb();
  const cur = d.prepare('SELECT oi.*, o.status FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=?').get(itemId);
  if (!cur) throw new Error('Partida no encontrada');
  if (cur.status !== 'abierta') throw new Error('El pedido ya fue cobrado');
  const qty = b.qty !== undefined ? Number(b.qty) : cur.qty;
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Cantidad invalida');
  const note = b.note !== undefined ? (b.note ? String(b.note) : null) : cur.note;
  d.prepare('UPDATE order_items SET qty=?, note=? WHERE id=?').run(qty, note, itemId);
  return get(cur.order_id);
}

function removeItem(itemId) {
  const d = getDb();
  const cur = d.prepare('SELECT oi.*, o.status FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=?').get(itemId);
  if (!cur) throw new Error('Partida no encontrada');
  if (cur.status !== 'abierta') throw new Error('El pedido ya fue cobrado');
  d.prepare('DELETE FROM order_items WHERE id=?').run(itemId);
  return get(cur.order_id);
}

function cancel(id) {
  const d = getDb();
  const o = d.prepare("SELECT * FROM orders WHERE id=? AND status='abierta'").get(id);
  if (!o) throw new Error('El pedido no esta abierto');
  d.prepare("DELETE FROM orders WHERE id=?").run(id);
  return { ok: true };
}

function pay(id, b) {
  const d = getDb();
  const o = get(id);
  if (!o) throw new Error('Pedido no encontrado');
  if (o.status !== 'abierta') throw new Error('El pedido ya fue cobrado');
  if (!o.items.length) throw new Error('El pedido no tiene productos');
  const method = ['efectivo', 'tarjeta', 'transferencia'].includes(b.pay_method) ? b.pay_method : 'efectivo';
  let received = null, change = null;
  if (method === 'efectivo' && b.cash_received !== undefined && b.cash_received !== null && b.cash_received !== '') {
    received = Number(b.cash_received);
    if (!Number.isFinite(received)) throw new Error('Efectivo recibido invalido');
    if (received + 1e-9 < o.total) throw new Error('El efectivo recibido es menor que el total');
    change = Math.round((received - o.total) * 100) / 100;
  }
  try {
    d.exec('BEGIN');
    const folio = (d.prepare('SELECT COALESCE(MAX(folio),0)+1 AS f FROM sales').get().f);
    const r = d.prepare(`
      INSERT INTO sales (folio,order_id,type,table_name,subtotal,total,pay_method,cash_received,cash_change,status)
      VALUES (?,?,?,?,?,?,?,?,?,'cobrada')
    `).run(folio, o.id, o.type, o.table_name || null, o.total, o.total, method, received, change);
    const saleId = Number(r.lastInsertRowid);
    const ins = d.prepare('INSERT INTO sale_items (sale_id,name,price,qty,note) VALUES (?,?,?,?,?)');
    for (const it of o.items) {
      ins.run(saleId, it.name, it.price, it.qty, it.note);
      if (it.product_id) {
        const p = d.prepare('SELECT inventory_item_id FROM products WHERE id=?').get(it.product_id);
        if (p && p.inventory_item_id) inventory.deductBySale(p.inventory_item_id, it.qty);
      }
    }
    d.prepare("UPDATE orders SET status='cobrada', closed_at=datetime('now','localtime') WHERE id=?").run(o.id);
    d.exec('COMMIT');
    return saleDetail(saleId);
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

function saleDetail(saleId) {
  const d = getDb();
  const s = d.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
  if (!s) throw new Error('Venta no encontrada');
  s.items = d.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id').all(saleId);
  return s;
}

/* Takeaway sale in one shot (no persistent open order) */
function takeaway(b) {
  const d = getDb();
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw new Error('Agregue al menos un producto');
  const tmp = create({ type: 'llevar' });
  addItems(tmp.id, { items });
  return pay(tmp.id, { pay_method: b.pay_method || 'efectivo', cash_received: b.cash_received });
}

module.exports = { listOpen, get, create, addItems, updateItem, removeItem, cancel, pay, saleDetail, takeaway };
