#!/usr/bin/env node
// ==========================================
// Nạp file CSV "Hàng đến" vào DB (lõi: server/lib/arrivalsImport.js).
//
//   node scripts/import-arrivals.js <file.csv | thư-mục> [--db <đường-dẫn-DB>]
//   node scripts/import-arrivals.js --check-days [--db <đường-dẫn-DB>] [--today YYYY-MM-DD]
//   node scripts/import-arrivals.js <file.csv> --chia-ngay [--db <đường-dẫn-DB>]   (SANLUONG-5k: một file nhiều ngày, chia theo ngày đến BCVH)
//
// DB mặc định data/hue-dhcl.db (hoặc biến môi trường ARRIVALS_DB). DB phải đã có schema app.
// Chỉ in số liệu tổng hợp — KHÔNG in nội dung dòng dữ liệu.
// Mã thoát: 0 = ổn; 2 = có file REJECTED/CONFLICT; 1 = sai cách dùng / lỗi hệ thống.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureArrivalSchema, importArrivalFile, importArrivalFileChiaNgay, importArrivalDirectory, getMissingBatches, wardKey } = require('../server/lib/arrivalsImport');

const USAGE = 'Cách dùng: node scripts/import-arrivals.js <file.csv | thư-mục> [--db <DB>]  |  --check-days [--db <DB>] [--today YYYY-MM-DD]  |  <file.csv> --chia-ngay [--db <DB>]';

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db' || a === '--today') out[a.slice(2)] = argv[++i];
    else if (a === '--check-days') out.checkDays = true;
    else if (a === '--chia-ngay') out.chiaNgay = true;
    else if (a.startsWith('--')) throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
    else out.positional.push(a);
  }
  return out;
}

function openDb(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}. Chạy app một lần để tạo DB.`);
  const db = new Database(dbPath, { fileMustExist: true });
  const hasBase = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commune_post_offices'").get();
  if (!hasBase) { db.close(); throw new Error('DB chưa có schema của app (thiếu commune_post_offices).'); }
  ensureArrivalSchema(db);
  return db;
}

// Từ khoá tỉnh "nhà" lấy từ danh mục (vd "BĐTP Huế" -> "hue") — chỉ dùng cho số liệu hiển thị.
function homeProvinceKeys(db) {
  return db.prepare('SELECT name FROM province_post_offices').all()
    .map((p) => wardKey(p.name).replace(/^(bdtp|bdt|buu dien (tinh|thanh pho|tp))\s+/, ''))
    .filter(Boolean);
}

function outsideCount(provinces, homeKeys) {
  if (!homeKeys.length) return '?';
  let n = 0;
  for (const [name, c] of Object.entries(provinces || {})) {
    if (name && !homeKeys.some((k) => wardKey(name).includes(k))) n += c;
  }
  return n;
}

function printTable(rows) {
  const head = ['File', 'Trạng thái', 'Dòng', 'Đã nạp', 'Bỏ qua', 'Đến BCVH sớm nhất', 'Đến BCVH muộn nhất', 'SHBG', 'Thiếu phường', 'Ngoài tỉnh', 'Ghi chú'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('-+-'));
  rows.forEach((r) => console.log(line(r)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.db || process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db');

  if (args.checkDays) {
    const db = openDb(dbPath);
    try {
      const missing = getMissingBatches(db, args.today ? { today: args.today } : {});
      if (!missing.length) console.log('Không có ngày thiếu đợt.');
      else {
        console.log(`Ngày thiếu đợt (cần 2 file/ngày): ${missing.length}`);
        for (const m of missing) console.log(`  ${m.unit_code}  ${m.date}  có ${m.file_count} file`);
      }
    } finally { db.close(); }
    return 0;
  }

  const target = args.positional[0];
  if (!target) throw new Error(USAGE);
  if (!fs.existsSync(target)) throw new Error(`Không tìm thấy: ${target}`);

  if (args.chiaNgay) {
    // SANLUONG-5k: một file nhiều ngày, tự chia theo ngày đến BCVH, MỘT giao dịch (docs/ai/32_SANLUONG5K_IMPORT_CHIA_NGAY.md)
    if (fs.statSync(target).isDirectory()) throw new Error('--chia-ngay chỉ nhận MỘT file, không nhận thư mục');
    const db = openDb(dbPath);
    try {
      const r = await importArrivalFileChiaNgay(db, target);
      console.log(`File ${r.fileName}: ${r.status}${r.error ? ` — ${r.error}` : ''}${r.ngay ? ` (ngày ${r.ngay})` : ''}`);
      for (const w of r.canhBao || []) console.log(`  Cảnh báo: ${w}`);
      if (r.status === 'OK') {
        console.log('\nNgày       | Dòng  | SHBG  | Nạp mới | Bỏ qua | Ghi chú');
        for (const g of r.nhom) {
          console.log(`${g.ngay} | ${String(g.rowCount).padStart(5)} | ${String(g.shbg).padStart(5)} | ${String(g.inserted).padStart(7)} | ${String(g.ignored).padStart(6)} | ${g.alreadyImported ? 'đã nạp' : ''}`);
        }
        console.log(`\nTổng: ${r.nhom.length} ngày, ${r.tongDong} dòng, ${r.tongShbg} SHBG (cộng theo ngày), ${r.tongNap} dòng nạp mới, ${r.tongBoQua} dòng bỏ qua.`);
        return 0;
      }
      if (r.status === 'EMPTY' || r.status === 'SKIPPED_NAME') return r.status === 'EMPTY' ? 0 : 1;
      console.log('Không ghi gì (đã hoàn tác toàn bộ).');
      return 2;
    } finally { db.close(); }
  }

  const db = openDb(dbPath);
  try {
    const results = fs.statSync(target).isDirectory()
      ? await importArrivalDirectory(db, target)
      : [await importArrivalFile(db, target)];
    const homeKeys = homeProvinceKeys(db);
    printTable(results.map((r) => [
      r.fileName,
      r.alreadyImported ? `${r.status} (đã nạp)` : r.status,
      r.rowCount ?? '',
      r.inserted ?? '',
      r.ignored ?? '',
      r.stats?.arrivalMin ?? '',
      r.stats?.arrivalMax ?? '',
      r.stats?.distinctTracking ?? '',
      r.stats?.missingWard ?? '',
      r.stats ? outsideCount(r.stats.provinces, homeKeys) : '',
      r.error || r.warning || ''
    ]));
    const bad = results.filter((r) => r.status === 'REJECTED' || r.status === 'CONFLICT').length;
    const ignored = results.reduce((s, r) => s + (r.ignored || 0), 0);
    console.log(`\nTổng: ${results.length} file, ${results.reduce((s, r) => s + (r.inserted || 0), 0)} dòng nạp mới, ${ignored} dòng trùng khoá bỏ qua, ${bad} file REJECTED/CONFLICT.`);
    return bad ? 2 : 0;
  } finally { db.close(); }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`[import-arrivals] ${err.message}`);
  process.exit(1);
});
