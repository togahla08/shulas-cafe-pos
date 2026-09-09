'use strict';
/* Shulas Cafe POS — app core: helpers, navigation, home, tables, order (POS) */
window.Screens = {};
window.App = {};

/* ---------- tiny helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

async function api(path, opts) {
  const res = await fetch(path, {
    method: (opts && opts.method) || 'GET',
    headers: opts && opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

let toastTimer = null;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function money(n) { return '$' + Number(n || 0).toFixed(2); }
function fmtTime(ts) { return String(ts || '').slice(11, 16); }
function fmtDate(ts) { return String(ts || '').slice(0, 10); }

/* ---------- modal ---------- */
function openModal(content, title) {
  const card = $('#modal-card');
  card.innerHTML = '';
  if (title) card.appendChild(el('h3', {}, title));
  card.appendChild(content);
  $('#modal-backdrop').classList.remove('hidden');
}
function closeModal() { $('#modal-backdrop').classList.add('hidden'); }

function confirmModal(msg, onYes, yesLabel) {
  const box = el('div', {},
    el('p', { style: 'font-size:18px;' }, msg),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn danger', onclick: () => { closeModal(); onYes(); } }, yesLabel || 'Sí, continuar')
    )
  );
  openModal(box, '⚠️ Confirmar');
}

function askNote(current, onOk) {
  const ta = el('textarea', { rows: 3, placeholder: 'Ej: sin cebolla, extra queso...' });
  ta.value = current || '';
  const box = el('div', {},
    ta,
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn', onclick: () => { closeModal(); onOk(ta.value); } }, 'Guardar')
    )
  );
  openModal(box, '📝 Nota de la partida');
}

/* ---------- navigation ---------- */
const SCREEN_TITLES = {
  home: 'Inicio', tables: 'Mesas', order: 'Pedido', menu: 'Menú',
  reports: 'Reportes', inventory: 'Inventario', expenses: 'Gastos',
  staff: 'Personal', settings: 'Ajustes'
};
let currentScreen = 'home';

function nav(screen, params) {
  currentScreen = screen;
  $$('.screen').forEach((s) => s.classList.remove('active'));
  const target = $('#screen-' + screen);
  if (!target) return;
  target.classList.add('active');
  target.scrollTop = 0;
  const fn = Screens[screen];
  if (fn) Promise.resolve(fn(params)).catch((e) => toast(e.message, true));
}

/* ---------- clock + settings ---------- */
function tickClock() {
  const d = new Date();
  $('#topbar-clock').textContent =
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
setInterval(tickClock, 10000);

App.settings = { name: 'Shulas Café', tagline: 'Café · Restaurante', ticket_footer: '¡Gracias por su visita!' };
async function loadSettings() {
  try { App.settings = await api('/api/settings'); } catch (_) {}
  $('#brand-name').textContent = App.settings.name || 'Shulas Café';
  $('#brand-tagline').textContent = App.settings.tagline || '';
}

/* =============================================================
   HOME
============================================================= */
Screens.home = async () => {
  const grid = $('#screen-home');
  grid.innerHTML = '';
  let low = [];
  try { low = await api('/api/inventory').then((items) => items.filter((i) => i.low)); } catch (_) {}

  if (low.length) {
    grid.appendChild(el('div', {
      class: 'low-banner',
      onclick: () => nav('inventory')
    }, '⚠️ Inventario bajo: ' + low.map((i) => i.name).join(', ')));
  }

  const tiles = [
    ['tables', '🍽️', 'Mesas'],
    ['takeaway', '🥡', 'Para llevar', takeawayHome],
    ['reports', '📊', 'Reportes'],
    ['inventory', '📦', 'Inventario'],
    ['expenses', '💸', 'Gastos'],
    ['staff', '🧑‍🍳', 'Personal'],
    ['menu', '📋', 'Menú'],
    ['settings', '⚙️', 'Ajustes']
  ];
  for (const [id, ico, label, fn] of tiles) {
    grid.appendChild(el('button', {
      class: 'tile ' + (id === 'tables' || id === 'menu' ? 'orange' : 'green'),
      onclick: fn || (() => nav(id))
    }, el('span', { class: 'ico' }, ico), el('span', {}, label)));
  }
};

function takeawayHome() { nav('order', { type: 'llevar' }); }

/* =============================================================
   TABLES
============================================================= */
Screens.tables = async () => {
  const scr = $('#screen-tables');
  scr.innerHTML = '';
  scr.appendChild(el('h2', { class: 'screen-title' },
    '🍽️ Mesas',
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn small ghost', onclick: editTablesModal }, '✏️ Configurar mesas')
  ));

  let tables = [];
  try { tables = await api('/api/tables'); } catch (e) { toast(e.message, true); }
  const grid = el('div', { class: 'tables-grid' });
  for (const t of tables) {
    const card = el('div', { class: 'table-card ' + (t.status === 'ocupada' ? 'ocupada' : ''), onclick: () => openTable(t) },
      el('div', { class: 't-name' }, t.name),
      t.status === 'ocupada'
        ? [
            el('div', { class: 't-status' }, 'Ocupada · ' + fmtTime(t.order.created_at)),
            el('div', { class: 't-total' }, money(t.order.total))
          ]
        : el('div', { class: 't-status' }, 'Libre — toque para abrir')
    );
    grid.appendChild(card);
  }
  scr.appendChild(grid);
};

async function openTable(t) {
  if (t.status === 'libre') {
    try {
      const order = await api('/api/orders', { method: 'POST', body: { type: 'mesa', table_id: t.id } });
      nav('order', { orderId: order.id });
    } catch (e) { toast(e.message, true); }
  } else {
    nav('order', { orderId: t.order.id });
  }
}

function editTablesModal() {
  const list = el('div');
  const box = el('div', {},
    el('p', { class: 'muted' }, 'Agregue, renombre o elimine mesas. La zona es solo informativa (Salón, Terraza...).'),
    list,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn small orange', onclick: async () => {
        const name = prompt('Nombre de la nueva mesa (ej. Mesa 13):');
        if (!name) return;
        try { await api('/api/tables', { method: 'POST', body: { name } }); await reload(); }
        catch (e) { toast(e.message, true); }
      } }, '➕ Agregar mesa')
    ),
    el('div', { class: 'modal-actions' }, el('button', { class: 'btn', onclick: closeModal }, 'Listo'))
  );

  async function reload() {
    const tables = await api('/api/tables');
    list.innerHTML = '';
    for (const t of tables) {
      const nameIn = el('input', { type: 'text', value: t.name, style: 'max-width:220px;' });
      const zoneIn = el('input', { type: 'text', value: t.zone, style: 'max-width:140px;' });
      list.appendChild(el('div', { class: 'list-row' },
        nameIn, zoneIn,
        el('button', { class: 'btn small', onclick: async () => {
          try { await api('/api/tables/' + t.id, { method: 'PUT', body: { name: nameIn.value, zone: zoneIn.value } }); toast('Guardada'); }
          catch (e) { toast(e.message, true); }
        } }, '💾'),
        el('button', { class: 'btn small danger', onclick: () => confirmModal('¿Eliminar ' + t.name + '?', async () => {
          try { await api('/api/tables/' + t.id, { method: 'DELETE' }); await reload(); } catch (e) { toast(e.message, true); }
        }) }, '🗑️')
      ));
    }
  }
  reload().catch((e) => toast(e.message, true));
  openModal(box, 'Configuración de mesas');
}

/* =============================================================
   ORDER (POS screen: menu buttons + ticket panel)
============================================================= */
let orderState = { order: null, categoryId: null };
let menuCache = null;

async function fetchMenu(force) {
  if (!menuCache || force) menuCache = await api('/api/menu');
  return menuCache;
}

Screens.order = async (params) => {
  params = params || {};
  const scr = $('#screen-order');
  scr.innerHTML = '';
  if (params.orderId) {
    const o = await api('/api/orders/' + params.orderId);
    orderState = { order: o, categoryId: null };
  } else if (params.type === 'llevar') {
    /* created lazily on first product; reuse an existing open takeaway order if any */
    const open = await api('/api/orders/open');
    const existing = open.find((o) => o.type === 'llevar');
    orderState = { order: existing ? await api('/api/orders/' + existing.id) : null, categoryId: null };
  } else { nav('tables'); return; }

  const layout = el('div', { class: 'order-layout' });
  const left = el('div', { class: 'order-left' });
  const right = el('div', { class: 'order-right' });
  layout.appendChild(left); layout.appendChild(right);
  scr.appendChild(layout);

  /* LEFT: product buttons */
  const menu = await fetchMenu(true);
  left.appendChild(el('h3', { style: 'margin-top:0' },
    (orderState.order.type === 'mesa' ? '🍽️ ' + (orderState.order.table_name || 'Mesa') : '🥡 Para llevar') +
    ' — toque los productos'));

  const tabs = el('div', { class: 'cat-tabs' });
  const grid = el('div', { class: 'prod-grid' });
  left.appendChild(tabs); left.appendChild(grid);

  function renderCats() {
    tabs.innerHTML = '';
    for (const c of menu) {
      tabs.appendChild(el('button', {
        class: 'cat-tab' + (orderState.categoryId === c.id ? ' active' : ''),
        onclick: () => { orderState.categoryId = c.id; renderCats(); renderProds(); }
      }, c.name));
    }
  }
  function renderProds() {
    grid.innerHTML = '';
    const cat = menu.find((c) => c.id === orderState.categoryId) || menu[0];
    if (!cat) return;
    orderState.categoryId = cat.id;
    for (const p of cat.products.filter((p) => p.active)) {
      grid.appendChild(el('button', { class: 'prod-btn', onclick: () => addProduct(p) },
        el('span', { class: 'p-name' }, p.name),
        el('span', { class: 'p-price' }, money(p.price))
      ));
    }
  }
  renderCats(); renderProds();

  /* RIGHT: current order */
  function renderRight() {
    right.innerHTML = '';
    right.appendChild(el('h3', { style: 'margin:0' }, '🧾 Pedido'));
    const itemsBox = el('div', { class: 'order-items' });
    for (const it of (orderState.order ? orderState.order.items : [])) {
      const q = el('span', { class: 'oi-qty-num' }, String(it.qty));
      itemsBox.appendChild(el('div', { class: 'order-item' },
        el('div', { class: 'oi-name' }, it.name, it.note ? el('small', { class: 'oi-note' }, '📝 ' + it.note) : null),
        el('div', { class: 'oi-qty' },
          el('button', { class: 'qty-btn minus', onclick: () => decItem(it) }, '−'),
          q,
          el('button', { class: 'qty-btn', onclick: async () => {
            try { orderState.order = await api('/api/order-items/' + it.id, { method: 'PUT', body: { qty: Number(it.qty) + 1 } }); renderRight(); }
            catch (e) { toast(e.message, true); }
          } }, '+')
        ),
        money(it.price * it.qty),
        el('button', { class: 'qty-btn minus', title: 'Nota', style: 'background:#8B5E3C', onclick: () => askNote(it.note, async (note) => {
          try { orderState.order = await api('/api/order-items/' + it.id, { method: 'PUT', body: { note } }); renderRight(); }
          catch (e) { toast(e.message, true); }
        }) }, '📝'),
        el('button', { class: 'qty-btn minus', title: 'Quitar', onclick: () => confirmModal('¿Quitar ' + it.name + '?', async () => {
          try { orderState.order = await api('/api/order-items/' + it.id, { method: 'DELETE' }); renderRight(); }
          catch (e) { toast(e.message, true); }
        }) }, '🗑️')
      ));
    }
    if (!orderState.order || !orderState.order.items.length) itemsBox.appendChild(el('p', { class: 'muted' }, 'Aún no hay productos. Toque un producto para agregarlo.'));
    right.appendChild(itemsBox);

    right.appendChild(el('div', { class: 'order-total' },
      money(orderState.order ? orderState.order.total : 0),
      el('small', {}, (orderState.order ? orderState.order.items.length : 0) + ' partidas')
    ));

    const canPay = orderState.order && orderState.order.items.length;
    right.appendChild(el('div', { class: 'btn-row', style: 'flex-direction:column' },
      el('button', { class: 'btn big', style: 'width:100%', disabled: canPay ? null : 'true', onclick: payModal }, '💵 COBRAR'),
      el('button', { class: 'btn ghost', style: 'width:100%', onclick: () => nav(!orderState.order || orderState.order.type === 'mesa' ? 'tables' : 'home') }, '← Volver'),
      orderState.order && orderState.order.type === 'mesa'
        ? el('button', { class: 'btn ghost', style: 'width:100%', onclick: moveOrderModal }, '🔀 Cambiar de mesa')
        : null,
      orderState.order ? el('button', { class: 'btn ghost danger-text', style: 'width:100%;color:var(--danger)', onclick: () => confirmModal('¿Cancelar TODO el pedido?', async () => {
        try { await api('/api/orders/' + orderState.order.id, { method: 'DELETE' }); toast('Pedido cancelado'); nav('tables'); }
        catch (e) { toast(e.message, true); }
      }) }, '🗑️ Cancelar pedido') : null
    ));
  }

  async function addProduct(p) {
    try {
      if (!orderState.order) {
        orderState.order = await api('/api/orders', { method: 'POST', body: { type: 'llevar' } });
      }
      orderState.order = await api('/api/orders/' + orderState.order.id + '/items', { method: 'POST', body: { product_id: p.id } });
      renderRight();
    } catch (e) { toast(e.message, true); }
  }
  async function decItem(it) {
    try {
      if (Number(it.qty) <= 1) {
        orderState.order = await api('/api/order-items/' + it.id, { method: 'DELETE' });
      } else {
        orderState.order = await api('/api/order-items/' + it.id, { method: 'PUT', body: { qty: Number(it.qty) - 1 } });
      }
      renderRight();
    } catch (e) { toast(e.message, true); }
  }

  function moveOrderModal() {
    api('/api/tables').then((tables) => {
      const free = tables.filter((t) => t.status === 'libre');
      const box = el('div', {},
        free.length ? el('div', { class: 'tables-grid' }, free.map((t) =>
          el('button', { class: 'table-card', onclick: async () => {
            try {
              await api('/api/tables/' + t.id + '/move', { method: 'POST', body: { to_id: t.id, from_id: orderState.order.table_id } });
              closeModal(); toast('Pedido movido a ' + t.name); nav('order', { orderId: orderState.order.id });
            } catch (e) { toast(e.message, true); }
          } }, el('div', { class: 't-name' }, t.name)
        ))) : el('p', {}, 'No hay mesas libres.'),
        el('div', { class: 'modal-actions' }, el('button', { class: 'btn ghost', onclick: closeModal }, 'Cerrar'))
      );
      openModal(box, 'Cambiar pedido de mesa');
    });
  }

  renderRight();
};

/* =============================================================
   PAYMENT
============================================================= */
async function payModal() {
  const total = orderState.order.total;
  let method = 'efectivo';
  let receivedStr = '';

  const amountDisp = el('div', { class: 'pay-amount' }, money(0));
  const changeRow = el('div', { class: 'muted', style: 'text-align:center;font-size:17px;min-height:22px' });

  function calc() {
    const r = parseFloat(receivedStr) || 0;
    amountDisp.textContent = money(r);
    if (method === 'efectivo' && r > 0) {
      const ch = r - total;
      changeRow.textContent = ch >= 0 ? ('Cambio: ' + money(ch)) : ('Faltan: ' + money(-ch));
      changeRow.style.color = ch >= 0 ? 'var(--green-dark)' : 'var(--danger)';
    } else changeRow.textContent = '';
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  const keypad = el('div', { class: 'keypad' });
  for (const k of keys) {
    keypad.appendChild(el('button', { onclick: () => {
      if (k === 'C') receivedStr = '';
      else if (k === '⌫') receivedStr = receivedStr.slice(0, -1);
      else if (receivedStr.includes('.') && k === '.') {}
      else if (k === '.' && !receivedStr) receivedStr = '0.';
      else receivedStr += k;
      calc();
    } }, k));
  }

  const methodRow = el('div', { class: 'btn-row' },
    ['efectivo', 'tarjeta', 'transferencia'].map((m) =>
      el('button', { class: 'btn small ' + (m === method ? '' : 'ghost'), onclick: (ev) => {
        method = m;
        $$('.btn', methodRow).forEach((b) => b.classList.add('ghost'));
        ev.currentTarget.classList.remove('ghost');
        calc();
      } }, { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '🏦 Transferencia' }[m]))
  );

  const box = el('div', {},
    el('p', { style: 'font-size:22px;font-weight:800;text-align:center' }, 'Total a cobrar: ' + money(total)),
    methodRow,
    method === 'efectivo' ? el('div', {}, el('label', { class: 'f' }, '¿Con cuánto paga?'), amountDisp, keypad, changeRow) : null,
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancelar'),
      el('button', { class: 'btn big', onclick: doPay }, '✅ Cobrar e imprimir')
    )
  );
  openModal(box, 'Cobrar');

  async function doPay() {
    const body = { pay_method: method };
    if (method === 'efectivo' && receivedStr) body.cash_received = parseFloat(receivedStr);
    try {
      const sale = await api('/api/orders/' + orderState.order.id + '/pay', { method: 'POST', body });
      closeModal();
      await afterSale(sale);
    } catch (e) { toast(e.message, true); }
  }
}

async function afterSale(sale) {
  const st = App.settings;
  const box = el('div', {},
    el('p', { style: 'font-size:26px;font-weight:800;color:var(--green-dark);text-align:center' },
      '✅ Venta cobrada: ' + money(sale.total)),
    sale.cash_change != null ? el('p', { style: 'font-size:20px;text-align:center' }, 'Cambio a entregar: ' + money(sale.cash_change)) : null,
    el('div', { class: 'modal-actions', style: 'justify-content:center' },
      el('button', { class: 'btn orange', onclick: async () => {
        try { await Printer.printBluetooth(sale, st); toast('Ticket enviado a la impresora'); }
        catch (e) { toast(e.message + ' — use "Ventana"', true); }
      } }, '🖨️ Bluetooth'),
      el('button', { class: 'btn ghost', onclick: () => { Printer.printWindow(sale, st); } }, '🖨️ Ventana'),
      el('button', { class: 'btn', onclick: closeModal }, 'Listo')
    )
  );
  openModal(box, '🧾 Ticket');
}

/* =============================================================
   BOOT
============================================================= */
$('#btn-home').addEventListener('click', () => nav('home'));
$('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

(async function boot() {
  tickClock();
  await loadSettings();
  nav('home');
  if (window.AdminScreens) AdminScreens.init();
})();
