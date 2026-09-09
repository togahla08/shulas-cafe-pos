'use strict';
/* Settings: key-value store */
const { getDb } = require('./db');

function get() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function update(b) {
  const d = getDb();
  const st = d.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(b)) {
    if (typeof v !== 'string') continue;
    if (k.length > 50 || v.length > 500) continue;
    st.run(k, v);
  }
  return get();
}

module.exports = { get, update };
