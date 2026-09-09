'use strict';
/* Shulas Cafe POS — ticket printing
   Two modes:
   1) Bluetooth thermal (ESC/POS) via Web Bluetooth — Chrome/Edge on the counter PC
   2) Browser print window (works everywhere, incl. tablets)                */
(function () {
  const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'; /* common thermal printer service */
  const CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';
  const WIDTH_CHARS = 48; /* 80mm printer ~48 chars */

  let device = null;
  let characteristic = null;

  /* ---------- ESC/POS helpers ---------- */
  const ESC = 0x1b, GS = 0x1d;
  const enc = new TextEncoder();

  function escposInit() { return new Uint8Array([ESC, 0x40]); }             /* init */
  function escposAlign(n) { return new Uint8Array([ESC, 0x61, n]); }        /* 0 left, 1 center, 2 right */
  function escposBold(on) { return new Uint8Array([ESC, 0x45, on ? 1 : 0]); }
  function escposSize(w, h) { return new Uint8Array([GS, 0x21, (w ? 1 : 0) | (h ? 16 : 0)]); }
  function escposCut() { return new Uint8Array([GS, 0x56, 0x42, 0x00]); }
  function escposFeed(n) { return new Uint8Array([ESC, 0x64, n]); }

  function line(text) { return enc.encode(text + '\n'); }

  function padLine(left, right) {
    left = String(left); right = String(right);
    const space = Math.max(1, WIDTH_CHARS - left.length - right.length);
    return left + ' '.repeat(space) + right;
  }

  function center(text) {
    text = String(text);
    const pad = Math.max(0, Math.floor((WIDTH_CHARS - text.length) / 2));
    return ' '.repeat(pad) + text;
  }

  function money(n) { return '$' + Number(n).toFixed(2); }

  /* Build full ESC/POS payload for a sale object */
  function buildEscPos(sale, settings) {
    const parts = [];
    const push = (...u8s) => { for (const u of u8s) parts.push(u); };
    const txt = (...lines) => { for (const l of lines) parts.push(line(l)); };

    push(escposInit());
    push(escposAlign(1), escposBold(1), escposSize(1, 1));
    txt(settings.name || 'Shulas Café');
    push(escposSize(0, 0), escposBold(0));
    txt(settings.tagline || '');
    txt(sale.created_at || '');
    txt('------------------------------------------------');
    const isMesa = sale.type === 'mesa';
    txt(isMesa ? ('MESA: ' + (sale.table_name || '')) : 'PARA LLEVAR');
    txt('------------------------------------------------');
    push(escposAlign(0));
    for (const it of sale.items || []) {
      const name = (it.name + (it.note ? ' *' : '')).slice(0, WIDTH_CHARS - 12);
      parts.push(line(padLine(name, money(it.price * it.qty))));
      const qtyTxt = `  ${it.qty} x ${money(it.price)}`;
      parts.push(line(qtyTxt));
      if (it.note) parts.push(line(' nota: ' + it.note));
    }
    txt('------------------------------------------------');
    push(escposAlign(2), escposBold(1), escposSize(1, 0));
    txt('TOTAL: ' + money(sale.total));
    push(escposSize(0, 0), escposBold(0));
    const methods = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    txt(methods[sale.pay_method] || sale.pay_method);
    if (sale.pay_method === 'efectivo' && sale.cash_received != null) {
      txt('Recibido: ' + money(sale.cash_received));
      txt('Cambio: ' + money(sale.cash_change));
    }
    txt('Folio: #' + sale.folio);
    push(escposAlign(1));
    txt('');
    txt(settings.ticket_footer || '');
    txt('');
    push(escposFeed(3));
    push(escposCut());
    return concat(parts);
  }

  function concat(list) {
    const total = list.reduce((s, u) => s + u.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const u of list) { out.set(u, off); off += u.length; }
    return out;
  }

  /* ---------- Bluetooth ---------- */
  async function connect(interactive) {
    if (characteristic) return true;
    if (!navigator.bluetooth) throw new Error('Este navegador no soporta Bluetooth. Use Chrome o Edge en la PC del mostrador.');
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
    device.addEventListener('gattserverdisconnected', () => {
      characteristic = null; device = null;
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    characteristic = await service.getCharacteristic(CHAR_UUID);
    return true;
  }

  async function writeChunks(char, bytes) {
    const CHUNK = 180;
    for (let off = 0; off < bytes.length; off += CHUNK) {
      await char.writeValue(bytes.slice(off, off + CHUNK));
    }
  }

  /* Public: print via Bluetooth */
  async function printBluetooth(sale, settings) {
    await connect(true);
    const bytes = buildEscPos(sale, settings);
    await writeChunks(characteristic, bytes);
    return true;
  }

  /* Public: build plain-text ticket (used by print window) */
  function buildText(sale, settings) {
    const L = [];
    L.push(center((settings.name || 'Shulas Café').toUpperCase()));
    if (settings.tagline) L.push(center(settings.tagline));
    L.push(center(String(sale.created_at || '')));
    L.push('-'.repeat(WIDTH_CHARS));
    L.push(sale.type === 'mesa' ? ('MESA: ' + (sale.table_name || '')) : 'PARA LLEVAR');
    L.push('-'.repeat(WIDTH_CHARS));
    for (const it of sale.items || []) {
      L.push(padLine((it.name + (it.note ? ' *' : '')).slice(0, 34), money(it.price * it.qty)));
      L.push('  ' + it.qty + ' x ' + money(it.price));
      if (it.note) L.push(' nota: ' + it.note);
    }
    L.push('-'.repeat(WIDTH_CHARS));
    L.push(padLine('TOTAL', money(sale.total)));
    const methods = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    L.push(methods[sale.pay_method] || sale.pay_method);
    if (sale.pay_method === 'efectivo' && sale.cash_received != null) {
      L.push('Recibido: ' + money(sale.cash_received));
      L.push('Cambio:   ' + money(sale.cash_change));
    }
    L.push('Folio: #' + sale.folio);
    L.push('');
    L.push(center(settings.ticket_footer || ''));
    return L.join('\n');
  }

  /* Public: print via browser dialog (hidden iframe / print area) */
  function printWindow(sale, settings) {
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = (sale.items || []).map((it) => `
      <div class="ti"><span>${esc(it.qty)} x ${esc(it.name)}${it.note ? ' <small>*' + esc(it.note) + '</small>' : ''}</span><b>$${Number(it.price * it.qty).toFixed(2)}</b></div>
      <div class="ts">${Number(it.price).toFixed(2)} c/u</div>`).join('');
    const html = `
      <div class="th">${esc((settings.name || 'Shulas Café').toUpperCase())}</div>
      <div class="ts">${esc(settings.tagline || '')}</div>
      <div class="ts">${esc(String(sale.created_at || ''))}</div>
      <hr>
      <div class="tm">${sale.type === 'mesa' ? 'MESA: ' + esc(sale.table_name || '') : 'PARA LLEVAR'}</div>
      <hr>
      ${rows}
      <hr>
      <div class="tt"><span>TOTAL</span><b>$${Number(sale.total).toFixed(2)}</b></div>
      <div class="ts">${esc(({ efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[sale.pay_method]) || sale.pay_method)}</div>
      ${sale.pay_method === 'efectivo' && sale.cash_received != null ? `
        <div class="ts">Recibido: $${Number(sale.cash_received).toFixed(2)}</div>
        <div class="ts">Cambio: $${Number(sale.cash_change).toFixed(2)}</div>` : ''}
      <div class="ts">Folio: #${esc(sale.folio)}</div>
      <hr>
      <div class="ts">${esc(settings.ticket_footer || '')}</div>`;
    let frame = document.getElementById('print-frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'print-frame';
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(frame);
    }
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title>
      <style>
        @page { size: 80mm auto; margin: 3mm; }
        body { font-family: "Courier New", monospace; font-size: 12px; width: 72mm; }
        .th { text-align:center; font-weight: bold; font-size: 15px; }
        .tm { font-weight: bold; }
        .tt { display:flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
        .ti { display:flex; justify-content: space-between; }
        .ts { text-align:center; font-size: 11px; color:#333; }
        hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
      </style></head><body>${html}</body></html>`);
    doc.close();
    return new Promise((resolve) => {
      frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); resolve(true); };
      setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {} resolve(true); }, 250);
    });
  }

  window.Printer = { printBluetooth, printWindow, buildText, buildEscPos, isSupported: () => !!navigator.bluetooth };
})();
