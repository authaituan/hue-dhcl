#!/usr/bin/env node
// ==========================================
// Gán tay 1 phường/xã (tên như trong cột Ten_Xa_Phuong) -> BĐX (commune_post_offices.id), source = MANUAL.
//
//   node scripts/set-ward-map.js "<tên phường/xã>" <commune_id> [--db <đường-dẫn-DB>]
//
// DB mặc định data/hue-dhcl.db (hoặc ARRIVALS_DB). Kiểm commune_id có trong danh mục.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureArrivalSchema, setWardMapping } = require('../server/lib/arrivalsImport');

const args = process.argv.slice(2);
let dbPath = process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db');
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db') dbPath = args[++i];
  else positional.push(args[i]);
}
const [wardName, communeId] = positional;

try {
  if (!wardName || !communeId) throw new Error('Cách dùng: node scripts/set-ward-map.js "<tên phường/xã>" <commune_id> [--db <DB>]');
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}`);
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    ensureArrivalSchema(db);
    const key = setWardMapping(db, wardName, communeId);
    const c = db.prepare('SELECT code, name FROM commune_post_offices WHERE id = ?').get(communeId);
    console.log(`Đã gán "${wardName}" (khoá "${key}") -> BĐX ${c.code} ${c.name} [MANUAL]`);
  } finally { db.close(); }
} catch (err) {
  console.error(`[set-ward-map] ${err.message}`);
  process.exit(1);
}
