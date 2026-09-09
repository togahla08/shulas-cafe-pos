'use strict';
/* Inventory: items with stock, min-stock alerts, movements, sale deduction */
const { getDb } = require('./db');

function list() {
  const d = getDb();
  const items = d.prepare(`
    SELECT i.*, (SELECT COUNT(*) FROM products p WHERE p.inventory_item_id=i.id) AS linked_products
    FROM inventory_items i ORDER BY i.name
  `).all();
  return items.map((i) => ({ ...i, low: i.stock <= i.min_stock }));
}

function create(b) {
  const name = String(b.name || '').trim();
  if (!name) throw new Error('El nombre es obligatorio');
  const d = getDb();
  const r = d.prepare('INSERT INTO inventory_items (name,unit,stock,min_stock) VALUES (?,?,?,?)')
    .run(name, b.unit || 'pza', Number(b.stock) || 0, Number(b.min_stock) || 0);
  const id = Number(r.lastInsertRowid);
  const stock = Number(b.stock) || 0;
  if (stock !== 0) {
    d.prepare('INSERT INTO stock_moves (item_id,delta,reason) VALUES (?,?,?)').run(id, stock, 'inicial');
  }
  return d.prepare('SELECT * FROM inventory_items WHERE id=?').get(id);
}

function update(id, b) {
  const d = getDb();
  const cur = d.prepare('SELECT * FROM inventory_items WHERE id=?').get(id);
  if (!cur) throw new Error('Insumo no encontrado');
  d.prepare('UPDATE inventory_items SET name=?, unit=?, min_stock=? WHERE id=?')
    .run(
      b.name !== undefined ? String(b.name).trim() : cur.name,
      b.unit || cur.unit,
      b.min_stock !== undefined ? Number(b.min_stock) : cur.min_stock,
      id
    );
  return d.prepare('SELECT * FROM inventory_items WHERE id=?').get(id);
}

function remove(id) {
  const d = getDb();
  const linked = d.prepare('SELECT COUNT(*) AS n FROM products WHERE inventory_item_id=?').get(id).n;
  if (linked > 0) throw new Error('Este insumo esta vinculado a productos del menu. Desvinculelo primero.');
  d.prepare('DELETE FROM inventory_items WHERE id=?').run(id);
}

function stockMove(id, b) {
  const d = getDb();
  const cur = d.prepare('SELECT * FROM inventory_items WHERE id=?').get(id);
  if (!cur) throw new Error('Insumo no encontrado');
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || delta === 0) throw new Error('Cantidad invalida');
  const reason = ['entrada', 'salida', 'ajuste', 'merma'].includes(b.reason) ? b.reason : 'ajuste';
  try {
    d.exec('BEGIN');
    d.prepare('UPDATE inventory_items SET stock=stock+? WHERE id=?').run(delta, id);
    const after = d.prepare('SELECT stock FROM inventory_items WHERE id=?').get(id).stock;
    if (after < 0) throw new Error('El stock no puede quedar negativo');
    d.prepare('INSERT INTO stock_moves (item_id,delta,reason) VALUES (?,?,?)').run(id, delta, reason);
    d.exec('COMMIT');
    return d.prepare('SELECT * FROM inventory_items WHERE id=?').get(id);
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

function moves(id) {
  return getDb().prepare('SELECT * FROM stock_moves WHERE item_id=? ORDER BY id DESC LIMIT 200').all(id);
}

/* Called during checkout: deduct qty for a linked inventory item */
function deductBySale(itemId, qty) {
  const d = getDb();
  d.prepare('UPDATE inventory_items SET stock=stock-? WHERE id=?').run(Number(qty), itemId);
  d.prepare('INSERT INTO stock_moves (item_id,delta,reason) VALUES (?,?,?)').run(itemId, -Number(qty), 'venta');
}

function lowStock() {
  return getDb().prepare('SELECT * FROM inventory_items WHERE stock <= min_stock ORDER BY name').all();
}

module.exports = { list, create, update, remove, stockMove, moves, deductBySale, lowStock };
