'use strict';
/* Smoke tests: boot the server on a temp DB and exercise every API area */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 5178 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shulas-test-'));

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  -', name); }
  else { failed++; console.error('FAIL  -', name); }
}

async function req(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), SHULAS_DATA_DIR: TMP },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });

  try {
    /* wait for boot */
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try { await fetch(BASE + '/api/settings'); up = true; } catch (_) {}
    }
    ok(up, 'server boots and answers /api/settings');

    /* ---- static + seed ---- */
    const html = await fetch(BASE + '/').then((r) => r.text());
    ok(html.includes('Shulas'), 'serves index.html with brand');
    const logo = await fetch(BASE + '/logo.jpg');
    ok(logo.status === 200, 'serves logo.jpg');

    const menu = await req('GET', '/api/menu');
    ok(menu.status === 200 && menu.data.length >= 4, 'menu seeded with categories');
    const prod = menu.data[0].products[0];

    /* ---- menu CRUD ---- */
    const newCat = await req('POST', '/api/categories', { name: 'Prueba Cat', color: '#123456' });
    ok(newCat.status === 201 && newCat.data.id, 'create category');
    const newProd = await req('POST', '/api/products', { category_id: newCat.data.id, name: 'Producto Prueba', price: 12.5 });
    ok(newProd.status === 201 && newProd.data.price === 12.5, 'create product');
    const upProd = await req('PUT', '/api/products/' + newProd.data.id, { price: 15 });
    ok(upProd.data.price === 15, 'update product price');
    const badProd = await req('POST', '/api/products', { category_id: newCat.data.id, name: 'Malo', price: -5 });
    ok(badProd.status === 500 && /Precio/.test(badProd.data.error), 'rejects negative price');
    const delCatBlocked = await req('DELETE', '/api/categories/' + menu.data[0].id);
    ok(delCatBlocked.status === 500, 'cannot delete category with products');

    /* ---- tables ---- */
    const tables = await req('GET', '/api/tables');
    ok(tables.status === 200 && tables.data.length >= 12, '12 tables seeded');
    ok(tables.data.every((t) => t.status === 'libre'), 'all tables free initially');
    const newTable = await req('POST', '/api/tables', { name: 'Mesa X' });
    ok(newTable.status === 201, 'create table');

    /* ---- order lifecycle ---- */
    const order = await req('POST', '/api/orders', { type: 'mesa', table_id: tables.data[0].id });
    ok(order.status === 201 && order.data.id, 'open order on table');
    const dup = await req('POST', '/api/orders', { type: 'mesa', table_id: tables.data[0].id });
    ok(dup.status === 500, 'second open order on same table rejected');
    const tables2 = await req('GET', '/api/tables');
    ok(tables2.data.find((t) => t.id === tables.data[0].id).status === 'ocupada', 'table shows ocupada');

    const withItems = await req('POST', '/api/orders/' + order.data.id + '/items', {
      items: [{ product_id: prod.id }, { name: 'Cortesía', price: 0, qty: 1 }]
    });
    ok(withItems.status === 200 && withItems.data.items.length === 2, 'add items (catalog + freeform)');
    ok(Math.abs(withItems.data.total - prod.price) < 1e-9, 'order total correct');

    const item1 = withItems.data.items[0];
    const inc = await req('PUT', '/api/order-items/' + item1.id, { qty: 3 });
    ok(Math.abs(inc.data.total - (prod.price * 3)) < 1e-9, 'qty update recalculates total');
    const noted = await req('PUT', '/api/order-items/' + item1.id, { note: 'sin azúcar' });
    ok(noted.data.items[0].note === 'sin azúcar', 'item note saved');

    /* ---- move order between tables ---- */
    const move = await req('POST', '/api/tables/' + tables.data[0].id + '/move', { to_id: tables.data[1].id });
    ok(move.status === 200, 'move order to another table');

    /* ---- checkout ---- */
    const shortCash = await req('POST', '/api/orders/' + order.data.id + '/pay', { pay_method: 'efectivo', cash_received: 1 });
    ok(shortCash.status === 500, 'payment below total rejected');
    const pay = await req('POST', '/api/orders/' + order.data.id + '/pay', { pay_method: 'efectivo', cash_received: 500 });
    ok(pay.status === 201 && pay.data.folio === 1, 'checkout creates sale folio 1');
    ok(Math.abs(pay.data.cash_change - (500 - pay.data.total)) < 1e-9, 'change computed');
    const tables3 = await req('GET', '/api/tables');
    ok(tables3.data.find((t) => t.id === tables.data[1].id).status === 'libre', 'table freed after pay');

    /* ---- takeaway ---- */
    const tk = await req('POST', '/api/sales/takeaway', {
      items: [{ product_id: prod.id, qty: 2 }],
      pay_method: 'tarjeta'
    });
    ok(tk.status === 201 && tk.data.type === 'llevar' && Math.abs(tk.data.total - prod.price * 2) < 1e-9, 'takeaway one-shot sale');

    /* ---- reports ---- */
    const rep = await req('GET', '/api/reports/sales?range=day');
    ok(rep.status === 200 && rep.data.sales.orders === 2, 'daily report counts 2 orders');
    ok(rep.data.sales.total > 0, 'daily total > 0');
    ok(rep.data.top.length >= 1, 'top products include sold item');
    ok(rep.data.byMethod.some((m) => m.pay_method === 'tarjeta'), 'method breakdown has tarjeta');
    const repWeek = await req('GET', '/api/reports/sales?range=week');
    ok(repWeek.status === 200 && repWeek.data.sales.orders === 2, 'weekly report includes same sales');
    const repMonth = await req('GET', '/api/reports/sales?range=month');
    ok(repMonth.status === 200 && repMonth.data.sales.orders === 2, 'monthly report includes same sales');

    const csvRes = await fetch(BASE + '/api/reports/expenses.csv?range=month');
    const csvText = await csvRes.text();
    ok(csvRes.status === 200 && csvText.includes('fecha;categoria'), 'expenses CSV downloads');

    /* ---- sales history + void ---- */
    const salesList = await req('GET', '/api/sales');
    ok(salesList.data.length === 2, 'sales history lists both');
    const voided = await req('POST', '/api/sales/' + salesList.data[0].id + '/void');
    ok(voided.status === 200, 'void sale');
    const repAfterVoid = await req('GET', '/api/reports/sales?range=day');
    ok(repAfterVoid.data.sales.orders === 1, 'voided sale excluded from totals');

    /* ---- inventory ---- */
    const inv = await req('POST', '/api/inventory', { name: 'Leche', unit: 'L', stock: 10, min_stock: 2 });
    ok(inv.status === 201 && inv.data.stock === 10, 'create inventory item');
    const mv = await req('POST', '/api/inventory/' + inv.data.id + '/stock', { delta: -3, reason: 'merma' });
    ok(mv.data.stock === 7, 'stock move applies');
    const neg = await req('POST', '/api/inventory/' + inv.data.id + '/stock', { delta: -100 });
    ok(neg.status === 500, 'negative stock blocked');
    await req('POST', '/api/inventory/' + inv.data.id + '/stock', { delta: -5, reason: 'ajuste' });
    const invList = await req('GET', '/api/inventory');
    ok(invList.data.find((i) => i.id === inv.data.id).low === true, 'low stock flag when stock <= min');

    /* link product to inventory and sell: deduction */
    const linked = await req('PUT', '/api/products/' + prod.id, { inventory_item_id: inv.data.id });
    ok(linked.status === 200, 'link product to inventory item');
    const tk2 = await req('POST', '/api/sales/takeaway', { items: [{ product_id: prod.id, qty: 2 }], pay_method: 'efectivo' });
    ok(tk2.status === 201, 'sale with linked product');
    const invAfter = (await req('GET', '/api/inventory')).data.find((i) => i.id === inv.data.id);
    ok(Math.abs(invAfter.stock - 0) < 1e-9, 'stock deducted by sale (2 - 2 = 0)');

    /* ---- expenses ---- */
    const exp = await req('POST', '/api/expenses', { amount: 250, category: 'insumos', note: 'Gas' });
    ok(exp.status === 201, 'create expense');
    const expBad = await req('POST', '/api/expenses', { amount: -10 });
    ok(expBad.status === 500, 'negative expense rejected');
    const repWithExp = await req('GET', '/api/reports/sales?range=day');
    ok(Math.abs(repWithExp.data.expenses.total - 250) < 1e-9, 'report includes expense');
    ok(repWithExp.data.profit < repWithExp.data.sales.total, 'profit = sales - expenses');

    /* ---- staff ---- */
    const w = await req('POST', '/api/workers', { name: 'Maria Lopez', role: 'Mesera' });
    ok(w.status === 201, 'register worker');
    const workers = await req('GET', '/api/workers');
    ok(workers.data.length >= 1, 'worker listed');
    const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pin = await req('POST', '/api/punches', { worker_id: w.data.id, kind: 'in', signature: SIG });
    ok(pin.status === 201 && pin.data.sig_path && pin.data.sig_path.startsWith('signatures/'), 'punch IN with signature saved');
    const pin2 = await req('POST', '/api/punches', { worker_id: w.data.id, kind: 'in', signature: SIG });
    ok(pin2.status === 500, 'double IN rejected');
    const pout = await req('POST', '/api/punches', { worker_id: w.data.id, kind: 'out', signature: SIG });
    ok(pout.status === 201, 'punch OUT ok');
    const today = await req('GET', '/api/punches/today');
    ok(today.data.length === 2, 'today view has 2 punches');
    const sigDir = path.join(TMP, 'signatures');
    ok(fs.existsSync(sigDir) && fs.readdirSync(sigDir).length >= 2, 'signature files stored on disk');
    const staffRep = await req('GET', '/api/reports/staff?range=month');
    ok(staffRep.status === 200 && staffRep.data.byWorker[0].days.length >= 1, 'staff report groups by day');

    /* ---- settings ---- */
    const st = await req('PUT', '/api/settings', { name: 'Shulas Café', ticket_footer: 'Vuelva pronto!' });
    ok(st.status === 200 && st.data.ticket_footer === 'Vuelva pronto!', 'settings updated');

    /* ---- backup roundtrip ---- */
    const bk = await fetch(BASE + '/api/backup');
    const bkBuf = Buffer.from(await bk.arrayBuffer());
    ok(bk.status === 200 && bkBuf.slice(0, 15).toString('utf8') === 'SQLite format 3', 'backup downloads as SQLite file');
    const restore = await req('POST', '/api/backup/restore', { data: 'data:application/octet-stream;base64,' + bkBuf.toString('base64') });
    ok(restore.status === 200, 'restore accepts backup');
    const menuAfter = await req('GET', '/api/menu');
    ok(menuAfter.status === 200 && menuAfter.data.length >= 4, 'data intact after restore');
    const badRestore = await req('POST', '/api/backup/restore', { data: 'data:application/octet-stream;base64,' + Buffer.from('not a db').toString('base64') });
    ok(badRestore.status === 500, 'restore rejects non-SQLite file');

    /* ---- 404s ---- */
    const nf = await req('GET', '/api/nope');
    ok(nf.status === 404, 'unknown API returns 404');

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    console.error('TEST CRASH:', e);
    console.error('server log:\n' + serverLog);
    process.exitCode = 1;
  } finally {
    server.kill();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  }
}

main();
