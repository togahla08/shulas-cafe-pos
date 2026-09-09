'use strict';
/* Menu: categories + products (fully editable from the screen) */
const { getDb } = require('./db');

function list(db) {
  const d = db || getDb();
  const cats = d.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  const prods = d.prepare('SELECT * FROM products ORDER BY sort, id').all();
  return cats.map((c) => ({
    ...c,
    products: prods.filter((p) => p.category_id === c.id)
  }));
}

function createCategory(b) {
  const name = String(b.name || '').trim();
  if (!name) throw new Error('El nombre es obligatorio');
  const d = getDb();
  const max = d.prepare('SELECT COALESCE(MAX(sort),-1) AS s FROM categories').get().s;
  const r = d.prepare('INSERT INTO categories (name,color,sort) VALUES (?,?,?)')
    .run(name, b.color || '#E8734A', max + 1);
  return d.prepare('SELECT * FROM categories WHERE id=?').get(Number(r.lastInsertRowid));
}

function updateCategory(id, b) {
  const d = getDb();
  const cur = d.prepare('SELECT * FROM categories WHERE id=?').get(id);
  if (!cur) throw new Error('Categoria no encontrada');
  d.prepare('UPDATE categories SET name=?, color=? WHERE id=?')
    .run(b.name !== undefined ? String(b.name).trim() : cur.name, b.color || cur.color, id);
  return d.prepare('SELECT * FROM categories WHERE id=?').get(id);
}

function reorderCategories(b) {
  if (!Array.isArray(b.ids)) throw new Error('ids requerido');
  const d = getDb();
  const st = d.prepare('UPDATE categories SET sort=? WHERE id=?');
  b.ids.forEach((id, i) => st.run(i, Number(id)));
}

function deleteCategory(id) {
  const d = getDb();
  const n = d.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id=?').get(id).n;
  if (n > 0) throw new Error('Mueva o elimine los productos de esta categoria primero');
  d.prepare('DELETE FROM categories WHERE id=?').run(id);
}

function createProduct(b) {
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name) throw new Error('El nombre es obligatorio');
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio invalido');
  const d = getDb();
  const cat = d.prepare('SELECT id FROM categories WHERE id=?').get(Number(b.category_id));
  if (!cat) throw new Error('Categoria no encontrada');
  const max = d.prepare('SELECT COALESCE(MAX(sort),-1) AS s FROM products WHERE category_id=?').get(cat.id).s;
  const r = d.prepare('INSERT INTO products (category_id,name,price,active,sort,inventory_item_id) VALUES (?,?,?,?,?,?)')
    .run(cat.id, name, price, b.active === 0 ? 0 : 1, max + 1, b.inventory_item_id ? Number(b.inventory_item_id) : null);
  return d.prepare('SELECT * FROM products WHERE id=?').get(Number(r.lastInsertRowid));
}

function updateProduct(id, b) {
  const d = getDb();
  const cur = d.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!cur) throw new Error('Producto no encontrado');
  const price = b.price !== undefined ? Number(b.price) : cur.price;
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio invalido');
  d.prepare('UPDATE products SET category_id=?, name=?, price=?, active=?, inventory_item_id=? WHERE id=?')
    .run(
      b.category_id !== undefined ? Number(b.category_id) : cur.category_id,
      b.name !== undefined ? String(b.name).trim() : cur.name,
      price,
      b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
      b.inventory_item_id !== undefined ? (b.inventory_item_id ? Number(b.inventory_item_id) : null) : cur.inventory_item_id,
      id
    );
  return d.prepare('SELECT * FROM products WHERE id=?').get(id);
}

function reorderProducts(b) {
  if (!Array.isArray(b.ids)) throw new Error('ids requerido');
  const d = getDb();
  const st = d.prepare('UPDATE products SET sort=? WHERE id=?');
  b.ids.forEach((id, i) => st.run(i, Number(id)));
}

function deleteProduct(id) {
  getDb().prepare('DELETE FROM products WHERE id=?').run(id);
}

module.exports = {
  list, createCategory, updateCategory, reorderCategories, deleteCategory,
  createProduct, updateProduct, reorderProducts, deleteProduct
};
