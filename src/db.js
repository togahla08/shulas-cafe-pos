'use strict';
/* Database bootstrap: schema + seed data for Shulas Cafe */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.SHULAS_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'shulas.db');

function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_items (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    unit     TEXT NOT NULL DEFAULT 'pza',
    stock    REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#E8734A',
    sort  INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    price       REAL NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    sort        INTEGER NOT NULL DEFAULT 0,
    inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS cafe_tables (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    zone     TEXT NOT NULL DEFAULT 'Salon',
    sort     INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id   INTEGER REFERENCES cafe_tables(id) ON DELETE SET NULL,
    type       TEXT NOT NULL DEFAULT 'mesa',
    status     TEXT NOT NULL DEFAULT 'abierta',
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    closed_at  TEXT
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name      TEXT NOT NULL,
    price     REAL NOT NULL,
    qty       REAL NOT NULL DEFAULT 1,
    note      TEXT
  );
  CREATE TABLE IF NOT EXISTS sales (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    folio       INTEGER NOT NULL,
    order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    type        TEXT NOT NULL DEFAULT 'mesa',
    table_name  TEXT,
    subtotal    REAL NOT NULL,
    total       REAL NOT NULL,
    pay_method  TEXT NOT NULL,
    cash_received REAL,
    cash_change   REAL,
    status      TEXT NOT NULL DEFAULT 'cobrada',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS sale_items (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id  INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    price    REAL NOT NULL,
    qty      REAL NOT NULL,
    note     TEXT
  );
  CREATE TABLE IF NOT EXISTS stock_moves (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id  INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    delta    REAL NOT NULL,
    reason   TEXT NOT NULL DEFAULT 'ajuste',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'otros',
    amount   REAL NOT NULL,
    note     TEXT,
    date     TEXT NOT NULL DEFAULT (date('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS workers (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    role      TEXT,
    active    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS time_punches (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    kind      TEXT NOT NULL CHECK (kind IN ('in','out')),
    ts        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    sig_path  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_punches_worker ON time_punches(worker_id, ts);
  `);

  seed(db);
}

function seed(db) {
  const has = db.prepare('SELECT COUNT(*) AS n FROM settings').get().n > 0;
  if (has) return;
  const set = db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
  set.run('name', 'Shulas Café');
  set.run('tagline', 'Café · Restaurante');
  set.run('ticket_footer', '¡Gracias por su visita!');

  const cat = db.prepare('INSERT INTO categories (name,color,sort) VALUES (?,?,?)');
  const catIds = {};
  [['Cafés y Bebidas', '#E8734A'], ['Comida', '#3E7C4F'], ['Postres', '#C9773B'], ['Extras', '#8B5E3C']].forEach(([n, c], i) => {
    const r = cat.run(n, c, i);
    catIds[n] = Number(r.lastInsertRowid);
  });
  const prod = db.prepare('INSERT INTO products (category_id,name,price,sort) VALUES (?,?,?,?)');
  [
    ['Cafés y Bebidas', [['Café de olla', 35], ['Café americano', 30], ['Capuchino', 45], ['Chocolate caliente', 40], ['Té', 25], ['Agua mineral', 25], ['Refresco', 30], ['Jugo natural', 40]]],
    ['Comida', [['Mollete', 45], ['Chilaquiles', 75], ['Huevos al gusto', 65], ['Panini', 70], ['Ensalada', 80], ['Sopa del día', 55], ['Hamburguesa', 95], ['Quesadillas (3)', 60]]],
    ['Postres', [['Gelatina', 25], ['Flan', 35], ['Pay de limón', 45], ['Brownie', 40], ['Pastel del día', 50]]],
    ['Extras', [['Pan dulce', 20], ['Bolillo', 10], ['Orden de papas', 45]]]
  ].forEach(([catName, items]) => {
    items.forEach(([n, p], i) => prod.run(catIds[catName], n, p, i));
  });

  const tbl = db.prepare('INSERT INTO cafe_tables (name,zone,sort) VALUES (?,?,?)');
  for (let i = 1; i <= 12; i++) {
    const zone = i <= 8 ? 'Salón' : 'Terraza';
    tbl.run(`Mesa ${i}`, zone, i);
  }
}

/* Shared connection singleton */
let _db = null;
function getDb() {
  if (!_db) _db = openDb();
  return _db;
}

function resetDb() {
  /* close current connection only; caller replaces the file, then getDb() reopens */
  try { if (_db) _db.close(); } catch (_) { /* ignore */ }
  _db = null;
}

/* Live proxy: always forwards to the current connection (survives restore) */
const dbProxy = new Proxy({}, {
  get(_t, prop) {
    const inst = getDb();
    const v = inst[prop];
    return typeof v === 'function' ? v.bind(inst) : v;
  }
});

module.exports = { openDb, getDb, resetDb, db: dbProxy, DB_PATH };
