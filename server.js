'use strict';
/* Shulas Cafe POS — zero-dependency API server on node:http */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { db } = require('./src/db');
const menu = require('./src/menu');
const tables = require('./src/tables');
const orders = require('./src/orders');
const sales = require('./src/sales');
const reports = require('./src/reports');
const inventory = require('./src/inventory');
const expenses = require('./src/expenses');
const staff = require('./src/staff');
const settings = require('./src/settings');
const backup = require('./src/backup');

const PORT = (parseInt(process.env.PORT, 10) || 5178) === 0 ? 5178 : (parseInt(process.env.PORT, 10) || 5178);
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ---------- helpers ---------- */
function send(res, code, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) { reject(new Error('Datos demasiado grandes')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('JSON invalido')); }
    });
    req.on('error', reject);
  });
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function notFound(res) { send(res, 404, { error: 'No encontrado' }); }

/* Routes: [method, regex, handler(req,res,params,db,body,url)] */
function buildRoutes() {
  const r = [];
  const add = (method, pattern, handler) => r.push({ method, pattern, handler });

  /* ---- menu ---- */
  add('GET', /^\/api\/menu$/, (req, res) => send(res, 200, menu.list(db)));
  add('POST', /^\/api\/categories$/, (req, res, p, b) => send(res, 201, menu.createCategory(b)));
  add('PUT', /^\/api\/categories\/reorder$/, (req, res, p, b) => { menu.reorderCategories(b); send(res, 200, { ok: true }); });
  add('PUT', /^\/api\/categories\/(\d+)$/, (req, res, p, b) => send(res, 200, menu.updateCategory(p[0], b)));
  add('DELETE', /^\/api\/categories\/(\d+)$/, (req, res, p) => { menu.deleteCategory(p[0]); send(res, 200, { ok: true }); });
  add('POST', /^\/api\/products$/, (req, res, p, b) => send(res, 201, menu.createProduct(b)));
  add('PUT', /^\/api\/products\/reorder$/, (req, res, p, b) => { menu.reorderProducts(b); send(res, 200, { ok: true }); });
  add('PUT', /^\/api\/products\/(\d+)$/, (req, res, p, b) => send(res, 200, menu.updateProduct(p[0], b)));
  add('DELETE', /^\/api\/products\/(\d+)$/, (req, res, p) => { menu.deleteProduct(p[0]); send(res, 200, { ok: true }); });

  /* ---- tables ---- */
  add('GET', /^\/api\/tables$/, (req, res) => send(res, 200, tables.list()));
  add('POST', /^\/api\/tables$/, (req, res, p, b) => send(res, 201, tables.create(b)));
  add('PUT', /^\/api\/tables\/(\d+)$/, (req, res, p, b) => send(res, 200, tables.rename(p[0], b)));
  add('DELETE', /^\/api\/tables\/(\d+)$/, (req, res, p) => { tables.remove(p[0]); send(res, 200, { ok: true }); });
  add('POST', /^\/api\/tables\/(\d+)\/move$/, (req, res, p, b) => send(res, 200, tables.move(p[0], b)));

  /* ---- orders ---- */
  add('GET', /^\/api\/orders\/open$/, (req, res) => send(res, 200, orders.listOpen()));
  add('POST', /^\/api\/orders$/, (req, res, p, b) => send(res, 201, orders.create(b)));
  add('GET', /^\/api\/orders\/(\d+)$/, (req, res, p) => {
    const o = orders.get(p[0]);
    if (!o) throw new ApiError(404, 'Pedido no encontrado');
    send(res, 200, o);
  });
  add('POST', /^\/api\/orders\/(\d+)\/items$/, (req, res, p, b) => send(res, 200, orders.addItems(p[0], b)));
  add('PUT', /^\/api\/order-items\/(\d+)$/, (req, res, p, b) => send(res, 200, orders.updateItem(p[0], b)));
  add('DELETE', /^\/api\/order-items\/(\d+)$/, (req, res, p) => { orders.removeItem(p[0]); send(res, 200, { ok: true }); });
  add('DELETE', /^\/api\/orders\/(\d+)$/, (req, res, p) => { orders.cancel(p[0]); send(res, 200, { ok: true }); });
  add('POST', /^\/api\/orders\/(\d+)\/pay$/, (req, res, p, b) => send(res, 201, orders.pay(p[0], b)));

  /* ---- sales ---- */
  add('GET', /^\/api\/sales$/, (req, res, p, b, url) => send(res, 200, sales.list(url.searchParams)));
  add('GET', /^\/api\/sales\/(\d+)$/, (req, res, p) => send(res, 200, sales.detail(p[0])));
  add('POST', /^\/api\/sales\/(\d+)\/void$/, (req, res, p) => { sales.void(p[0]); send(res, 200, { ok: true }); });
  add('POST', /^\/api\/sales\/takeaway$/, (req, res, p, b) => send(res, 201, sales.takeaway(b)));

  /* ---- reports ---- */
  add('GET', /^\/api\/reports\/sales$/, (req, res, p, b, url) => send(res, 200, reports.sales(url.searchParams)));
  add('GET', /^\/api\/reports\/staff$/, (req, res, p, b, url) => send(res, 200, reports.staff(url.searchParams)));
  add('GET', /^\/api\/reports\/expenses\.csv$/, (req, res, p, b, url) => reports.expensesCsv(url.searchParams, res));

  /* ---- inventory ---- */
  add('GET', /^\/api\/inventory$/, (req, res) => send(res, 200, inventory.list()));
  add('POST', /^\/api\/inventory$/, (req, res, p, b) => send(res, 201, inventory.create(b)));
  add('PUT', /^\/api\/inventory\/(\d+)$/, (req, res, p, b) => send(res, 200, inventory.update(p[0], b)));
  add('DELETE', /^\/api\/inventory\/(\d+)$/, (req, res, p) => { inventory.remove(p[0]); send(res, 200, { ok: true }); });
  add('POST', /^\/api\/inventory\/(\d+)\/stock$/, (req, res, p, b) => send(res, 200, inventory.stockMove(p[0], b)));
  add('GET', /^\/api\/inventory\/(\d+)\/moves$/, (req, res, p) => send(res, 200, inventory.moves(p[0])));

  /* ---- expenses ---- */
  add('GET', /^\/api\/expenses$/, (req, res, p, b, url) => send(res, 200, expenses.list(url.searchParams)));
  add('POST', /^\/api\/expenses$/, (req, res, p, b) => send(res, 201, expenses.create(b)));
  add('PUT', /^\/api\/expenses\/(\d+)$/, (req, res, p, b) => send(res, 200, expenses.update(p[0], b)));
  add('DELETE', /^\/api\/expenses\/(\d+)$/, (req, res, p) => { expenses.remove(p[0]); send(res, 200, { ok: true }); });

  /* ---- staff ---- */
  add('GET', /^\/api\/workers$/, (req, res) => send(res, 200, staff.listWorkers()));
  add('POST', /^\/api\/workers$/, (req, res, p, b) => send(res, 201, staff.createWorker(b)));
  add('PUT', /^\/api\/workers\/(\d+)$/, (req, res, p, b) => send(res, 200, staff.updateWorker(p[0], b)));
  add('DELETE', /^\/api\/workers\/(\d+)$/, (req, res, p) => { staff.removeWorker(p[0]); send(res, 200, { ok: true }); });
  add('GET', /^\/api\/punches\/today$/, (req, res) => send(res, 200, staff.today()));
  add('POST', /^\/api\/punches$/, (req, res, p, b) => send(res, 201, staff.punch(b)));
  add('DELETE', /^\/api\/punches\/(\d+)$/, (req, res, p) => { staff.deletePunch(p[0]); send(res, 200, { ok: true }); });

  /* ---- settings + backup ---- */
  add('GET', /^\/api\/settings$/, (req, res) => send(res, 200, settings.get()));
  add('PUT', /^\/api\/settings$/, (req, res, p, b) => send(res, 200, settings.update(b)));
  add('GET', /^\/api\/backup$/, (req, res) => backup.exportDb(res));
  add('POST', /^\/api\/backup\/restore$/, (req, res, p, b) => { backup.restore(b); send(res, 200, { ok: true }); });

  return r;
}

const routes = buildRoutes();

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.pattern);
    if (m) return { route: r, params: m.slice(1).map((x) => (/^\d+$/.test(x) ? Number(x) : x)) };
  }
  return null;
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) { notFound(res); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { notFound(res); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { notFound(res); return; }
      serveStatic(pathname, res);
      return;
    }
    const found = matchRoute(req.method, pathname);
    if (!found) { notFound(res); return; }
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : undefined;
    found.route.handler(req, res, found.params, body, url);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    if (status === 500) console.error('API error:', err);
    if (!res.headersSent) send(res, status, { error: err.message || 'Error interno' });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================');
  console.log('  SHULAS CAFE - Punto de Venta');
  console.log(`  Listo: http://localhost:${PORT}`);
  console.log(`  Tablets (misma WiFi): http://<IP-de-esta-PC>:${PORT}`);
  console.log('==========================================');
});

process.on('uncaughtException', (err) => console.error('Error no capturado:', err));
