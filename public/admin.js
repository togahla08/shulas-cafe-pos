'use strict';
/* Shulas Cafe POS — admin screens: menu, reports, inventory, expenses, staff, settings */
window.AdminScreens = { init };

function frow(labelText, input) { return el('div', {}, el('label', { class: 'f' }, labelText), input); }

/* =============================================================
   MENU EDITOR
============================================================= */
Screens.menu = async () => {
  const scr = $('#screen-menu');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' }, '📋 Menú',
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn small orange', onclick: () => categoryModal() }, '➕ Nueva categoría'),
    el('button', { class: 'btn small', onclick: () => productModal() }, '➕ Nuevo producto')
  ));

  let menu;
  try { menu = await fetchMenu(true); } catch (e) { toast(e.message, true); return; }

  for (const c of menu) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', {},
      el('span', { class: 'badge', style: 'background:' + c.color }, c.name),
      el('span', { class: 'spacer', style: 'flex:1' }),
      el('button', { class: 'btn small ghost', onclick: () => categoryModal(c) }, '✏️'),
      el('button', { class: 'btn small ghost', style: 'color:var(--danger)', onclick: () => confirmModal('¿Eliminar la categoría "' + c.name + '"?', async () => {
        try { await api('/api/categories/' + c.id, { method: 'DELETE' }); toast('Categoría eliminada'); nav('menu'); }
        catch (e) { toast(e.message, true); }
      }) }, '🗑️')
    ));
    for (const p of c.products) {
      card.appendChild(el('div', { class: 'list-row' },
        el('b', { style: p.active ? '' : 'text-decoration:line-through;color:#999' }, p.name),
        p.inventory_item_id ? el('span', { class: 'badge green', title: 'Descuenta inventario' }, '📦') : null,
        el('span', { class: 'grow' }),
        el('span', { class: 'money' }, money(p.price)),
        el('button', { class: 'btn small ghost', onclick: () => productModal(p, c.id) }, '✏️'),
        el('button', { class: 'btn small ghost', style: 'color:var(--danger)', onclick: () => confirmModal('¿Eliminar "' + p.name + '"?', async () => {
          try { await api('/api/products/' + p.id, { method: 'DELETE' }); toast('Producto eliminado'); nav('menu'); }
          catch (e) { toast(e.message, true); }
        }) }, '🗑️')
      ));
    }
    if (!c.products.length) card.appendChild(el('p', { class: 'muted' }, 'Sin productos todavía.'));
    scr.appendChild(card);
  }
};

function categoryModal(cat) {
  const name = el('input', { type: 'text', value: cat ? cat.name : '', placeholder: 'Ej. Bebidas' });
  const color = el('input', { type: 'color', value: cat ? cat.color : '#E8734A', style: 'height:48px;width:80px' });
  const box = el('div', {},
    frow('Nombre', name), frow('Color', color),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn', onclick: async () => {
        try {
          if (cat) await api('/api/categories/' + cat.id, { method: 'PUT', body: { name: name.value, color: color.value } });
          else await api('/api/categories', { method: 'POST', body: { name: name.value, color: color.value } });
          closeModal(); toast('Guardada'); nav('menu');
        } catch (e) { toast(e.message, true); }
      } }, 'Guardar')
    )
  );
  openModal(box, cat ? 'Editar categoría' : 'Nueva categoría');
}

async function productModal(prod, presetCatId) {
  const menu = await fetchMenu(true);
  const name = el('input', { type: 'text', value: prod ? prod.name : '', placeholder: 'Ej. Capuchino' });
  const price = el('input', { type: 'number', step: '0.50', min: '0', value: prod ? prod.price : '', placeholder: '0.00' });
  const catSel = el('select', {}, menu.map((c) => el('option', { value: c.id }, c.name)));
  if (prod) catSel.value = prod.category_id; else if (presetCatId) catSel.value = presetCatId;

  let invItems = [];
  try { invItems = await api('/api/inventory'); } catch (_) {}
  const invSel = el('select', {}, [el('option', { value: '' }, '— No descuenta inventario —')]
    .concat(invItems.map((i) => el('option', { value: i.id }, i.name + ' (' + i.unit + ')'))));
  if (prod && prod.inventory_item_id) invSel.value = prod.inventory_item_id;

  const active = el('input', { type: 'checkbox' });
  active.checked = prod ? !!prod.active : true;

  const box = el('div', {},
    frow('Nombre', name), frow('Precio ($)', price), frow('Categoría', catSel),
    frow('Inventario vinculado (opcional)', invSel),
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' }, active, 'Visible en la pantalla de pedidos'),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn', onclick: async () => {
        const body = { name: name.value, price: parseFloat(price.value), category_id: Number(catSel.value), inventory_item_id: invSel.value ? Number(invSel.value) : null, active: active.checked ? 1 : 0 };
        try {
          if (prod) await api('/api/products/' + prod.id, { method: 'PUT', body });
          else await api('/api/products', { method: 'POST', body });
          closeModal(); toast('Guardado'); nav('menu');
        } catch (e) { toast(e.message, true); }
      } }, 'Guardar')
    )
  );
  openModal(box, prod ? 'Editar producto' : 'Nuevo producto');
}

/* =============================================================
   REPORTS
============================================================= */
let reportRange = 'day';
Screens.reports = async () => {
  const scr = $('#screen-reports');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' }, '📊 Reportes'));

  const seg = el('div', { class: 'seg' },
    [['day', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']].map(([v, label]) =>
      el('button', { class: reportRange === v ? 'active' : '', onclick: () => { reportRange = v; Screens.reports(); } }, label))
  );
  scr.appendChild(seg);

  let rep;
  try { rep = await api('/api/reports/sales?range=' + reportRange); } catch (e) { toast(e.message, true); return; }

  const kpis = el('div', { class: 'kpi-grid' },
    kpi('Ventas', money(rep.sales.total)),
    kpi('Pedidos', String(rep.sales.orders)),
    kpi('Gastos', money(rep.expenses.total)),
    kpi('Ganancia', money(rep.profit), rep.profit < 0)
  );
  scr.appendChild(kpis);

  const methods = el('div', { class: 'card' }, el('h3', {}, '💳 Por forma de pago'));
  for (const m of rep.byMethod) {
    methods.appendChild(el('div', { class: 'list-row' },
      el('b', {}, ({ efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '🏦 Transferencia' }[m.pay_method]) || m.pay_method),
      el('span', { class: 'grow' }), el('span', { class: 'muted' }, m.n + ' ventas'),
      el('span', { class: 'money' }, money(m.total))
    ));
  }
  if (!rep.byMethod.length) methods.appendChild(el('p', { class: 'muted' }, 'Sin ventas en este período.'));
  scr.appendChild(methods);

  const top = el('div', { class: 'card' }, el('h3', {}, '🏆 Productos más vendidos'));
  const table = el('table', { class: 'rep' },
    el('tr', {}, el('th', {}, '#'), el('th', {}, 'Producto'), el('th', { class: 'num' }, 'Cant.'), el('th', { class: 'num' }, 'Total')),
    rep.top.map((t, i) => el('tr', {},
      el('td', {}, String(i + 1)), el('td', {}, t.name),
      el('td', { class: 'num' }, String(t.qty)), el('td', { class: 'num' }, money(t.total))))
  );
  if (rep.top.length) top.appendChild(table); else top.appendChild(el('p', { class: 'muted' }, 'Sin ventas en este período.'));
  scr.appendChild(top);

  const days = el('div', { class: 'card' }, el('h3', {}, '📅 Día por día'));
  const dtable = el('table', { class: 'rep' },
    el('tr', {}, el('th', {}, 'Día'), el('th', { class: 'num' }, 'Pedidos'), el('th', { class: 'num' }, 'Ventas')),
    rep.byDay.map((d) => el('tr', {},
      el('td', {}, d.day), el('td', { class: 'num' }, String(d.orders || 0)), el('td', { class: 'num' }, money(d.total || 0))))
  );
  if (rep.byDay.length) days.appendChild(dtable); else days.appendChild(el('p', { class: 'muted' }, 'Sin ventas en este período.'));
  scr.appendChild(days);

  /* CSV exports */
  scr.appendChild(el('div', { class: 'btn-row' },
    el('button', { class: 'btn ghost', onclick: () => window.open('/api/reports/expenses.csv?range=' + reportRange, '_blank') }, '⬇️ Gastos (CSV)'),
    el('button', { class: 'btn ghost', onclick: () => exportSalesCsv(rep) }, '⬇️ Ventas (CSV)')
  ));
};

function kpi(label, value, neg) {
  return el('div', { class: 'kpi' }, el('div', { class: 'k-label' }, label), el('div', { class: 'k-value' + (neg ? ' neg' : '') }, value));
}

function exportSalesCsv(rep) {
  api('/api/sales?from=' + rep.from + '&to=' + rep.to + '&limit=500').then((rows) => {
    let csv = '\uFEFFfolio;fecha;tipo;mesa;total;pago\r\n';
    for (const s of rows) {
      if (s.status !== 'cobrada') continue;
      csv += [s.folio, s.created_at, s.type, s.table_name || '', s.total, s.pay_method].join(';') + '\r\n';
    }
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `ventas_${rep.from}_${rep.to}.csv`);
  }).catch((e) => toast(e.message, true));
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* =============================================================
   INVENTORY
============================================================= */
Screens.inventory = async () => {
  const scr = $('#screen-inventory');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' }, '📦 Inventario',
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn small', onclick: () => inventoryModal() }, '➕ Nuevo insumo')
  ));

  let items;
  try { items = await api('/api/inventory'); } catch (e) { toast(e.message, true); return; }

  const card = el('div', { class: 'card' });
  for (const i of items) {
    card.appendChild(el('div', { class: 'list-row' },
      el('b', {}, i.name),
      el('span', { class: 'muted' }, '(' + i.unit + ')' + (i.linked_products ? ' · 📋 ' + i.linked_products : '')),
      el('span', { class: 'grow' }),
      el('span', { class: 'badge ' + (i.low ? 'red' : 'green') }, Number(i.stock).toFixed(2).replace(/\.00$/, '') + ' ' + i.unit + (i.low ? ' · ¡BAJO!' : '')),
      el('button', { class: 'btn small', onclick: () => stockModal(i) }, '➕➖ Movimiento'),
      el('button', { class: 'btn small ghost', onclick: () => inventoryModal(i) }, '✏️'),
      el('button', { class: 'btn small ghost', style: 'color:var(--danger)', onclick: () => confirmModal('¿Eliminar "' + i.name + '"?', async () => {
        try { await api('/api/inventory/' + i.id, { method: 'DELETE' }); toast('Eliminado'); nav('inventory'); }
        catch (e) { toast(e.message, true); }
      }) }, '🗑️')
    ));
  }
  if (!items.length) card.appendChild(el('p', { class: 'muted' }, 'Agregue insumos como: leche, café en grano, vasos, azúcar...'));
  scr.appendChild(card);
  scr.appendChild(el('p', { class: 'muted' }, '💡 Vincule un insumo a un producto del menú y el stock se descontará automáticamente en cada venta.'));
};

function inventoryModal(item) {
  const name = el('input', { type: 'text', value: item ? item.name : '', placeholder: 'Ej. Leche' });
  const unit = el('select', {}, ['pza', 'kg', 'g', 'L', 'ml', 'paq'].map((u) => el('option', { value: u, selected: item && item.unit === u ? '' : null }, u)));
  const min = el('input', { type: 'number', step: '0.01', min: '0', value: item ? item.min_stock : '0' });
  const stock = el('input', { type: 'number', step: '0.01', value: item ? item.stock : '0' });
  const box = el('div', {},
    frow('Nombre', name), frow('Unidad', unit),
    item ? frow('Stock actual (solo lectura, use Movimiento)', stock) : frow('Stock inicial', stock),
    frow('Stock mínimo (alerta)', min),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn', onclick: async () => {
        try {
          if (item) {
            await api('/api/inventory/' + item.id, { method: 'PUT', body: { name: name.value, unit: unit.value, min_stock: parseFloat(min.value) } });
            const diff = parseFloat(stock.value) - Number(item.stock);
            if (Math.abs(diff) > 0.001) await api('/api/inventory/' + item.id + '/stock', { method: 'POST', body: { delta: diff, reason: 'ajuste' } });
          } else {
            await api('/api/inventory', { method: 'POST', body: { name: name.value, unit: unit.value, stock: parseFloat(stock.value) || 0, min_stock: parseFloat(min.value) || 0 } });
          }
          closeModal(); toast('Guardado'); nav('inventory');
        } catch (e) { toast(e.message, true); }
      } }, 'Guardar')
    )
  );
  openModal(box, item ? 'Editar insumo' : 'Nuevo insumo');
}

function stockModal(item) {
  const qty = el('input', { type: 'number', step: '0.01', placeholder: 'Cantidad' });
  const reason = el('select', {}, ['entrada', 'salida', 'merma', 'ajuste'].map((r) => el('option', { value: r }, r)));
  const movesBox = el('div', { class: 'muted' }, 'Cargando historial...');
  const box = el('div', {},
    el('p', {}, 'Stock actual de ', el('b', {}, item.name), ': ', String(item.stock) + ' ' + item.unit),
    frow('Cantidad (positiva = entra, negativa = sale)', qty),
    frow('Motivo', reason),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cerrar'),
      el('button', { class: 'btn', onclick: async () => {
        try {
          await api('/api/inventory/' + item.id + '/stock', { method: 'POST', body: { delta: parseFloat(qty.value), reason: reason.value } });
          closeModal(); toast('Movimiento registrado'); nav('inventory');
        } catch (e) { toast(e.message, true); }
      } }, 'Registrar')
    ),
    el('h3', { style: 'margin-top:14px' }, 'Últimos movimientos'), movesBox
  );
  openModal(box, 'Movimiento de inventario');
  api('/api/inventory/' + item.id + '/moves').then((moves) => {
    movesBox.innerHTML = '';
    movesBox.className = '';
    for (const m of moves.slice(0, 15)) {
      movesBox.appendChild(el('div', { class: 'list-row' },
        el('span', { class: 'muted' }, fmtDate(m.created_at) + ' ' + fmtTime(m.created_at)),
        el('span', { class: 'grow' }),
        el('b', { style: m.delta >= 0 ? 'color:var(--green)' : 'color:var(--danger)' }, (m.delta >= 0 ? '+' : '') + m.delta),
        el('span', { class: 'badge' }, m.reason)
      ));
    }
    if (!moves.length) movesBox.appendChild(el('p', { class: 'muted' }, 'Sin movimientos.'));
  });
}

/* =============================================================
   EXPENSES
============================================================= */
Screens.expenses = async () => {
  const scr = $('#screen-expenses');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' }, '💸 Gastos',
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn small', onclick: () => expenseModal() }, '➕ Nuevo gasto')
  ));

  let rows;
  try { rows = await api('/api/expenses'); } catch (e) { toast(e.message, true); return; }
  const total = rows.reduce((s, r) => s + r.amount, 0);

  scr.appendChild(el('div', { class: 'kpi-grid' }, kpi('Total mostrado', money(total))));
  const card = el('div', { class: 'card' });
  const CAT_LABEL = { insumos: 'Insumos', servicios: 'Servicios', salarios: 'Salarios', renta: 'Renta', mantenimiento: 'Mantenimiento', otros: 'Otros' };
  for (const r of rows) {
    card.appendChild(el('div', { class: 'list-row' },
      el('span', { class: 'muted' }, r.date),
      el('span', { class: 'badge' }, CAT_LABEL[r.category] || r.category),
      el('span', { class: 'grow' }, r.note || ''),
      el('span', { class: 'money out' }, '−' + money(r.amount)),
      el('button', { class: 'btn small ghost', onclick: () => expenseModal(r) }, '✏️'),
      el('button', { class: 'btn small ghost', style: 'color:var(--danger)', onclick: () => confirmModal('¿Eliminar este gasto?', async () => {
        try { await api('/api/expenses/' + r.id, { method: 'DELETE' }); toast('Eliminado'); nav('expenses'); }
        catch (e) { toast(e.message, true); }
      }) }, '🗑️')
    ));
  }
  if (!rows.length) card.appendChild(el('p', { class: 'muted' }, 'Sin gastos registrados.'));
  scr.appendChild(card);
};

function expenseModal(exp) {
  const CATS = [['insumos', 'Insumos'], ['servicios', 'Servicios'], ['salarios', 'Salarios'], ['renta', 'Renta'], ['mantenimiento', 'Mantenimiento'], ['otros', 'Otros']];
  const cat = el('select', {}, CATS.map(([v, l]) => el('option', { value: v, selected: exp && exp.category === v ? '' : null }, l)));
  const amount = el('input', { type: 'number', step: '0.50', min: '0', value: exp ? exp.amount : '', placeholder: '0.00' });
  const note = el('input', { type: 'text', value: exp ? (exp.note || '') : '', placeholder: 'Ej. 2 botes de leche' });
  const date = el('input', { type: 'date', value: exp ? exp.date : new Date().toISOString().slice(0, 10) });
  const box = el('div', {},
    el('div', { class: 'form-grid' },
      el('div', {}, frow('Categoría', cat), frow('Fecha', date)),
      el('div', {}, frow('Monto ($)', amount), frow('Nota', note))
    ),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn', onclick: async () => {
        try {
          const body = { category: cat.value, amount: parseFloat(amount.value), note: note.value, date: date.value };
          if (exp) await api('/api/expenses/' + exp.id, { method: 'PUT', body });
          else await api('/api/expenses', { method: 'POST', body });
          closeModal(); toast('Guardado'); nav('expenses');
        } catch (e) { toast(e.message, true); }
      } }, 'Guardar')
    )
  );
  openModal(box, exp ? 'Editar gasto' : 'Nuevo gasto');
}

/* =============================================================
   STAFF (Personal + reloj checador con firma)
============================================================= */
Screens.staff = async () => {
  const scr = $('#screen-staff');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' }, '🧑‍🍳 Personal',
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn small', onclick: () => workerModal() }, '➕ Nuevo trabajador'),
    el('button', { class: 'btn small ghost', onclick: () => staffReportModal() }, '📊 Horarios')
  ));

  let workers;
  try { workers = await api('/api/workers'); } catch (e) { toast(e.message, true); return; }

  for (const w of workers) {
    if (!w.active && !w.today.length) continue;
    const isIn = w.today.length && w.today[w.today.length - 1].kind === 'in';
    const card = el('div', { class: 'worker-card' },
      el('div', {},
        el('div', { class: 'w-name' }, w.name + (w.active ? '' : ' (inactivo)')),
        el('div', { class: 'w-role' }, (w.role || 'Personal') + ' · ' + (isIn ? '🟢 Presente desde ' + fmtTime(w.today[w.today.length - 1].ts) : (w.today.length ? '🔴 Jornada terminada' : 'Fuera')))
      ),
      el('span', { class: 'grow' }),
      el('div', { class: 'punch-line' }, w.today.map((p) =>
        el('span', {}, el('span', { class: 'pk ' + p.kind }, p.kind === 'in' ? 'ENTRADA ' : 'SALIDA '), fmtTime(p.ts))
      )),
      el('button', { class: 'btn ' + (isIn ? 'orange' : ''), onclick: () => signatureModal(w, isIn ? 'out' : 'in') },
        isIn ? '🔴 MARCAR SALIDA' : '🟢 MARCAR ENTRADA'),
      el('button', { class: 'btn small ghost', onclick: () => workerModal(w) }, '✏️'),
      el('button', { class: 'btn small ghost', style: 'color:var(--danger)', onclick: () => confirmModal('¿Eliminar a ' + w.name + '? Sus checadas también se borrarán.', async () => {
        try { await api('/api/workers/' + w.id, { method: 'DELETE' }); toast('Eliminado'); nav('staff'); }
        catch (e) { toast(e.message, true); }
      }) }, '🗑️')
    );
    scr.appendChild(card);
  }
};

function workerModal(w) {
  const name = el('input', { type: 'text', value: w ? w.name : '', placeholder: 'Nombre completo' });
  const role = el('input', { type: 'text', value: w ? (w.role || '') : '', placeholder: 'Ej. Mesero, Cocina, Caja' });
  const active = el('input', { type: 'checkbox' });
  active.checked = w ? !!w.active : true;
  const box = el('div', {},
    frow('Nombre', name), frow('Puesto', role),
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' }, active, ' Activo'),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn', onclick: async () => {
        try {
          const body = { name: name.value, role: role.value, active: active.checked ? 1 : 0 };
          if (w) await api('/api/workers/' + w.id, { method: 'PUT', body });
          else await api('/api/workers', { method: 'POST', body });
          closeModal(); toast('Guardado'); nav('staff');
        } catch (e) { toast(e.message, true); }
      } }, 'Guardar')
    )
  );
  openModal(box, w ? 'Editar trabajador' : 'Nuevo trabajador');
}

/* Signature pad modal for punch in/out */
function signatureModal(w, kind) {
  const canvas = el('canvas', { class: 'sig-pad' });
  canvas.width = 600; canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#2b2320'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  let drawing = false, hasInk = false;

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    return [(t.clientX - r.left) * (canvas.width / r.width), (t.clientY - r.top) * (canvas.height / r.height)];
  };
  const start = (ev) => { drawing = true; const [x, y] = pos(ev); ctx.beginPath(); ctx.moveTo(x, y); ev.preventDefault(); };
  const move = (ev) => {
    if (!drawing) return;
    const [x, y] = pos(ev);
    ctx.lineTo(x, y); ctx.stroke(); hasInk = true; ev.preventDefault();
  };
  const stop = () => { drawing = false; };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', stop);

  const clearBtn = el('button', { class: 'btn small ghost', onclick: () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); hasInk = false; } }, '🧽 Borrar firma');

  const box = el('div', {},
    el('p', { style: 'font-size:18px' }, el('b', {}, w.name), ' — firme para registrar su ', el('b', {}, kind === 'in' ? 'ENTRADA' : 'SALIDA')),
    canvas,
    el('div', { class: 'btn-row' }, clearBtn),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn big', onclick: async () => {
        if (!hasInk) { toast('Firme primero en el recuadro', true); return; }
        try {
          const sig = canvas.toDataURL('image/png');
          await api('/api/punches', { method: 'POST', body: { worker_id: w.id, kind, signature: sig } });
          closeModal();
          toast((kind === 'in' ? '¡Bienvenido, ' : 'Hasta luego, ') + w.name.split(' ')[0] + '!');
          nav('staff');
        } catch (e) { toast(e.message, true); }
      } }, kind === 'in' ? '✅ Registrar ENTRADA' : '✅ Registrar SALIDA')
    )
  );
  openModal(box, '🖊️ Chequeo con firma');
}

async function staffReportModal() {
  let rep;
  try { rep = await api('/api/reports/staff?range=month'); } catch (e) { toast(e.message, true); return; }
  const box = el('div', {});
  for (const w of rep.byWorker) {
    box.appendChild(el('div', { class: 'card' },
      el('h3', {}, w.worker.name, el('span', { class: 'badge green', style: 'margin-left:8px' }, w.hours + ' h este mes')),
      w.days.map((d) => el('div', { class: 'list-row' },
        el('span', { class: 'muted' }, d.day),
        el('span', { class: 'grow' }),
        d.in ? el('span', { class: 'pk in' }, '↑ ' + fmtTime(d.in)) : el('span', { class: 'muted' }, '—'),
        d.out ? el('span', { class: 'pk out' }, '↓ ' + fmtTime(d.out)) : el('span', { class: 'muted' }, 'sin salida')
      ))
    ));
  }
  if (!rep.byWorker.length) box.appendChild(el('p', { class: 'muted' }, 'Registre trabajadores primero.'));
  box.appendChild(el('div', { class: 'modal-actions' }, el('button', { class: 'btn', onclick: closeModal }, 'Cerrar')));
  openModal(box, '📊 Horarios del mes');
}

/* =============================================================
   SETTINGS
============================================================= */
Screens.settings = async () => {
  const scr = $('#screen-settings');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' }, '⚙️ Ajustes'));

  const s = App.settings;
  const name = el('input', { type: 'text', value: s.name || '' });
  const tagline = el('input', { type: 'text', value: s.tagline || '' });
  const footer = el('input', { type: 'text', value: s.ticket_footer || '' });

  scr.appendChild(el('div', { class: 'card' },
    el('h3', {}, '🏪 Datos del negocio'),
    frow('Nombre', name), frow('Leyenda', tagline), frow('Mensaje al pie del ticket', footer),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: async () => {
      try {
        App.settings = await api('/api/settings', { method: 'PUT', body: { name: name.value, tagline: tagline.value, ticket_footer: footer.value } });
        $('#brand-name').textContent = App.settings.name || '';
        $('#brand-tagline').textContent = App.settings.tagline || '';
        toast('Ajustes guardados');
      } catch (e) { toast(e.message, true); }
    } }, '💾 Guardar'))
  ));

  scr.appendChild(el('div', { class: 'card' },
    el('h3', {}, '💾 Respaldos'),
    el('p', { class: 'muted' }, 'Descargue una copia de toda la información (menú, ventas, personal...) y guárdela en una USB o correo.'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => window.open('/api/backup', '_blank') }, '⬇️ Descargar respaldo'),
      el('button', { class: 'btn ghost', onclick: restoreBackup }, '⬆️ Restaurar respaldo')
    )
  ));

  scr.appendChild(el('div', { class: 'card' },
    el('h3', {}, '🖨️ Impresora'),
    el('p', { class: 'muted' }, 'Bluetooth funciona en esta PC con Chrome/Edge. En tablets use el botón "Ventana" al cobrar.'),
    el('p', { class: 'muted' }, 'Soporte Bluetooth de este navegador: ', el('b', {}, Printer.isSupported() ? '✅ disponible' : '❌ no disponible (use Chrome/Edge)'))
  ));
};

function restoreBackup() {
  const file = el('input', { type: 'file', accept: '.db,application/octet-stream' });
  const box = el('div', {},
    el('p', {}, '⚠️ Esto reemplaza TODA la información actual por la del archivo de respaldo.'),
    frow('Archivo de respaldo (.db)', file),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn danger', onclick: async () => {
        if (!file.files.length) { toast('Elija un archivo', true); return; }
        const buf = await file.files[0].arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        try {
          await api('/api/backup/restore', { method: 'POST', body: { data: 'data:application/octet-stream;base64,' + b64 } });
          closeModal(); toast('Respaldo restaurado'); location.reload();
        } catch (e) { toast(e.message, true); }
      } }, 'Restaurar')
    )
  );
  openModal(box, 'Restaurar respaldo');
}

/* ---------- init ---------- */
function init() {
  /* nothing extra for now; screens are wired through nav() */
}
