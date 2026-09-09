'use strict';
/* Reports: sales by day/week/month, staff hours, expenses CSV export */
const { getDb } = require('./db');

function range(q) {
  /* supports ?from&to or ?range=day|week|month (defaults to today) */
  const d = getDb();
  const now = d.prepare("SELECT datetime('now','localtime') AS t, date('now','localtime') AS today").get();
  const today = now.today;
  const r = String(q.get('range') || 'day');
  let from = q.get('from');
  let to = q.get('to');
  if (r === 'week') from = q.get('from') || isoWeekStart(today);
  if (r === 'month') {
    if (!from) { from = today.slice(0, 8) + '01'; }
  }
  if (!from) from = today; /* day range and explicit fallback */
  to = to || today;
  return { from, to, today };
}

function isoWeekStart(today) {
  const dt = new Date(today + 'T12:00:00');
  const day = (dt.getDay() + 6) % 7; /* 0=Monday */
  dt.setDate(dt.getDate() - day);
  return dt.toISOString().slice(0, 10);
}

function sales(q) {
  const { from, to } = range(q);
  const d = getDb();
  const totals = d.prepare(`
    SELECT COALESCE(SUM(CASE WHEN status='cobrada' THEN total END),0) AS total,
           COALESCE(SUM(CASE WHEN status='cobrada' THEN total END),0) - COALESCE(SUM(CASE WHEN status='cobrada' THEN total END),0) AS dummy,
           COUNT(CASE WHEN status='cobrada' THEN 1 END) AS orders,
           COALESCE(SUM(CASE WHEN status='cobrada' AND pay_method='efectivo' THEN total END),0) AS efectivo,
           COALESCE(SUM(CASE WHEN status='cobrada' AND pay_method='tarjeta' THEN total END),0) AS tarjeta,
           COALESCE(SUM(CASE WHEN status='cobrada' AND pay_method='transferencia' THEN total END),0) AS transferencia,
           COALESCE(SUM(CASE WHEN status='anulada' THEN total END),0) AS anuladas
    FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?)
  `).get(from, to);
  delete totals.dummy;

  const byDay = d.prepare(`
    SELECT date(created_at) AS day,
           SUM(CASE WHEN status='cobrada' THEN total END) AS total,
           COUNT(CASE WHEN status='cobrada' THEN 1 END) AS orders
    FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY day ORDER BY day
  `).all(from, to);

  const byMethod = d.prepare(`
    SELECT pay_method, SUM(total) AS total, COUNT(*) AS n
    FROM sales WHERE status='cobrada' AND date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY pay_method ORDER BY total DESC
  `).all(from, to);

  const top = d.prepare(`
    SELECT si.name, SUM(si.qty) AS qty, SUM(si.qty*si.price) AS total
    FROM sale_items si JOIN sales s ON s.id=si.sale_id
    WHERE s.status='cobrada' AND date(s.created_at) BETWEEN date(?) AND date(?)
    GROUP BY si.name ORDER BY total DESC LIMIT 10
  `).all(from, to);

  const byType = d.prepare(`
    SELECT type, COUNT(*) AS orders, SUM(total) AS total
    FROM sales WHERE status='cobrada' AND date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY type
  `).all(from, to);

  const exp = d.prepare(`
    SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n
    FROM expenses WHERE date BETWEEN date(?) AND date(?)
  `).get(from, to);

  return {
    from, to,
    sales: totals,
    byDay, byMethod, byType, top,
    expenses: exp,
    profit: (totals.total || 0) - (exp.total || 0)
  };
}

function staff(q) {
  const { from, to } = range(q);
  const d = getDb();
  const workers = d.prepare('SELECT * FROM workers ORDER BY name').all();
  const punches = d.prepare(`
    SELECT * FROM time_punches
    WHERE date(ts) BETWEEN date(?) AND date(?)
    ORDER BY worker_id, ts
  `).all(from, to);
  const byWorker = workers.map((w) => {
    const ps = punches.filter((p) => p.worker_id === w.id);
    const days = [];
    const map = new Map();
    for (const p of ps) {
      const day = String(p.ts).slice(0, 10);
      if (!map.has(day)) map.set(day, { day, in: null, out: null });
      const e = map.get(day);
      if (p.kind === 'in' && !e.in) e.in = p.ts;
      if (p.kind === 'out') e.out = p.ts;
    }
    let hours = 0;
    for (const e of map.values()) {
      if (e.in) {
        const t1 = new Date(e.in.replace(' ', 'T'));
        const t2 = e.out ? new Date(e.out.replace(' ', 'T')) : new Date();
        hours += Math.max(0, (t2 - t1) / 36e5);
      }
      days.push(e);
    }
    return { worker: w, days, hours: Math.round(hours * 100) / 100 };
  });
  return { from, to, byWorker };
}

function expensesCsv(q, res) {
  const { from, to } = range(q);
  const d = getDb();
  const rows = d.prepare('SELECT date, category, amount, note FROM expenses WHERE date BETWEEN date(?) AND date(?) ORDER BY date, id').all(from, to);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="gastos_${from}_${to}.csv"`,
    'Cache-Control': 'no-store'
  });
  res.write('\uFEFF'); /* Excel UTF-8 BOM */
  res.write('fecha;categoria;monto;nota\r\n');
  for (const r of rows) {
    const cell = (v) => String(v == null ? '' : v).replace(/[\r\n;]/g, ' ');
    res.write(`${r.date};${cell(r.category)};${r.amount};${cell(r.note)}\r\n`);
  }
  res.end();
}

module.exports = { sales, staff, expensesCsv, range };
