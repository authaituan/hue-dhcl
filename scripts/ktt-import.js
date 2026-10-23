#!/usr/bin/env node
// ==========================================
// Nạp file CSV «Hàng tại KTT» vào DB (lõi: server/lib/kttImport.js, schema: server/lib/kttSchema.js) — KTT-2.
//
//   node scripts/ktt-import.js <file.csv | thư-mục> [--dry-run] [--db <đường-dẫn-DB>]
//
// File: KTT_Tui_<yyyymmdd>_<hhmmss>.csv và KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv. Thư mục: nạp mọi KTT_*.csv theo thứ tự tên.
// --dry-run: KHÔNG ghi gì (cả lượt chạy trong một giao dịch rồi hoàn tác), chỉ báo số liệu dự kiến.
// DB mặc định data/hue-dhcl.db (hoặc biến môi trường KTT_DB). Chỉ in số liệu tổng hợp — KHÔNG in nội dung dòng dữ liệu.
// Mã thoát: 0 = ổn; 2 = có file bị từ chối (REJECTED) hoặc sai tên; 1 = sai cách dùng / lỗi hệ thống.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const { importKttDuongDan, chayThu } = require('../server/lib/kttImport');

const USAGE = 'Cách dùng: node scripts/ktt-import.js <file.csv | thư-mục> [--dry-run] [--db <DB>]';

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') out.db = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
    else out.positional.push(a);
  }
  return out;
}

function inBang(rows) {
  const head = ['File', 'Loại', 'Trạng thái', 'Dòng', 'Thêm', 'Cập nhật', 'Bỏ qua', 'Lỗi', 'Ghi chú'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('-+-'));
  rows.forEach((r) => console.log(line(r)));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.positional[0];
  if (!target) throw new Error(USAGE);
  if (!fs.existsSync(target)) throw new Error(`Không tìm thấy: ${target}`);
  const dbPath = args.db || process.env.KTT_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db');
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}. Chạy app một lần để tạo DB.`);

  const db = new Database(dbPath, { fileMustExist: true });
  try {
    // Chạy thử: dựng schema (nếu DB chưa có bảng KTT) CŨNG nằm trong giao dịch bị hoàn tác, nên không ghi gì vào DB.
    const results = args.dryRun
      ? chayThu(db, () => { ensureKttSchema(db); return importKttDuongDan(db, target); }).map((r) => ({ ...r, dryRun: true }))
      : (ensureKttSchema(db), importKttDuongDan(db, target));

    if (args.dryRun) console.log('CHẠY THỬ (--dry-run): không ghi gì vào DB. Số liệu dưới đây là dự kiến.\n');
    inBang(results.map((r) => [
      r.fileName, r.loai || '', r.status === 'DA_NAP' ? 'DA_NAP (bỏ qua, đã nạp)' : r.status,
      r.dong, r.them, r.capNhat, r.boQua, r.loi,
      r.error || (r.cotLa && r.cotLa.length ? `bỏ ${r.cotLa.length} cột lạ` : '')
    ]));
    for (const r of results) {
      if (r.loiMau && r.loiMau.length) {
        console.log(`\nDòng lỗi mẫu của ${r.fileName} (tối đa 20; chỉ số dòng + tên cột + mã lỗi):`);
        for (const e of r.loiMau) console.log(`  dòng ${e.dong}: cột ${e.cot} — ${e.ma}`);
      }
    }
    const tong = (k) => results.reduce((s, r) => s + (r[k] || 0), 0);
    const bad = results.filter((r) => r.status === 'REJECTED' || r.status === 'SAI_TEN').length;
    console.log(`\nTổng: ${results.length} file, ${tong('them')} dòng thêm, ${tong('capNhat')} cập nhật, ${tong('boQua')} bỏ qua (nguồn cũ hơn), ${tong('loi')} dòng lỗi, ${bad} file bị từ chối / sai tên, ${results.filter((r) => r.status === 'DA_NAP').length} file đã nạp trước đó.`);
    return bad ? 2 : 0;
  } finally { db.close(); }
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`[ktt-import] ${err.message}`);
  process.exitCode = 1;
}
