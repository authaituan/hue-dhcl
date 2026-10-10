#!/usr/bin/env node
// ==========================================
// Tách MỘT file CSV "Hàng đến" phủ nhiều ngày thành các file theo NGÀY, đúng mẫu tên của nạp hằng ngày:
//   HangDen_<mã BCVH>_<yyyymmdd>_<hhmmss>.csv   (ngày trong tên = ngày đến của các dòng trong file đó)
// rồi nạp bằng đúng công cụ hiện có (scripts/import-arrivals.js <thư-mục>). Không đổi hành vi nạp hằng ngày (docs/ai/04_DECISIONS.md #63).
//
//   node scripts/split-arrivals-csv.js <file.csv> --out <thư-mục-ngoài-repo> [--unit <mã BCVH>] [--time HHMMSS] [--dry-run]
//
// Ngày của một dòng = ngày theo quy tắc R2 (XN túi -> XN bưu gửi -> XNĐ BD10); dòng chưa có mốc BCVH nào lấy ngày lập BD10
// (Ngay_gio_XND_BD10_tai_TTKT); dòng không có mốc nào được xếp vào ngày cuối cùng và được báo số lượng.
// Mã BCVH trong tên file: --unit, mặc định lấy từ cột BC_nhan_BG của từng dòng.
// --time: giờ ghi trong tên file (mặc định 235959 -> coi như file chốt cuối ngày; Dashboard lấy as_of = 23:59).
// Thư mục đầu ra BẮT BUỘC nằm NGOÀI repo và phải chưa có / rỗng (dữ liệu thật không được lọt vào repo).
// Chỉ in số liệu tổng hợp — KHÔNG in nội dung dòng (số hiệu bưu gửi / BD8 / BD10).
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const { resolveHeader, readCsvRecords, COLUMNS, parseUsDateTime, deriveArrival } = require('../server/lib/arrivalsImport');

const USAGE = 'Cách dùng: node scripts/split-arrivals-csv.js <file.csv> --out <thư-mục-ngoài-repo> [--unit <mã BCVH>] [--time HHMMSS] [--dry-run]';
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { positional: [], dryRun: false, time: '235959' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '--unit' || a === '--time') out[a.slice(2)] = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
    else out.positional.push(a);
  }
  return out;
}

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const FIELD_INDEX = Object.fromEntries(COLUMNS.map(([, f], i) => [f, i]));

/**
 * Tách file. Trả { files: [{ name, unit, day, rows }], total, ttktDated, unplaced }. Ghi file khi dryRun = false.
 * Ném Error (thông báo tiếng Việt, không kèm nội dung dòng) khi sai tiêu đề / ngày giờ / thư mục.
 */
async function splitCsv(inputPath, outDir, { unit = null, time = '235959', dryRun = false } = {}) {
  if (!/^\d{6}$/.test(time)) throw new Error('--time phải gồm 6 chữ số HHMMSS');
  if (unit !== null && !/^\d+$/.test(unit)) throw new Error('--unit phải là mã số BCVH');
  const outAbs = path.resolve(outDir);
  if (isInside(outAbs, REPO_ROOT)) throw new Error('Thư mục đầu ra phải nằm NGOÀI repo (dữ liệu thật không được đặt trong repo)');
  if (!dryRun && fs.existsSync(outAbs) && fs.readdirSync(outAbs).length) throw new Error('Thư mục đầu ra phải chưa có hoặc rỗng (tránh trộn với lần tách trước)');
  if (!fs.existsSync(inputPath)) throw new Error(`Không tìm thấy file: ${inputPath}`);

  const records = await readCsvRecords(inputPath);
  if (!records.length) throw new Error('File không có dòng tiêu đề');
  const header = records[0];
  const { index } = resolveHeader(header); // cùng quy tắc đọc tên cột với importer
  const at = (rec, field) => (index[FIELD_INDEX[field]] >= 0 ? String(rec[index[FIELD_INDEX[field]]] ?? '') : '');

  const groups = new Map(); // `${unit}|${day}` -> records
  const pending = []; // dòng không có ngày nào
  let ttktDated = 0;
  records.slice(1).forEach((rec, i) => {
    const t = {};
    for (const f of ['bag_confirmed_at', 'item_confirmed_at', 'bd10_confirmed_at', 'bd10_ttkt_confirmed_at']) {
      const p = parseUsDateTime(at(rec, f));
      if (!p.ok) throw new Error(`Dòng ${i + 2}: cột thời gian sai định dạng (cần M/D/YYYY h:mm:ss AM/PM)`);
      t[f] = p.value;
    }
    deriveArrival(t);
    let day = t.arrival_date;
    if (!day && t.bd10_ttkt_confirmed_at) { day = t.bd10_ttkt_confirmed_at.slice(0, 10); ttktDated++; }
    const u = unit || at(rec, 'receiver_code').trim();
    if (!/^\d+$/.test(u)) throw new Error(`Dòng ${i + 2}: không xác định được mã BCVH (cột BC_nhan_BG rỗng / không phải số; dùng --unit)`);
    if (!day) { pending.push({ rec, u }); return; }
    const k = `${u}|${day}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(rec);
  });
  // Dòng không có mốc nào: xếp vào ngày cuối cùng của cùng BCVH (hoặc ngày cuối cùng chung nếu BCVH đó chưa có ngày nào).
  const lastDay = [...groups.keys()].map((k) => k.split('|')[1]).sort().pop();
  for (const { rec, u } of pending) {
    const days = [...groups.keys()].filter((k) => k.startsWith(`${u}|`)).map((k) => k.split('|')[1]).sort();
    const day = days.length ? days[days.length - 1] : lastDay;
    if (!day) throw new Error('Không có dòng nào xác định được ngày');
    const k = `${u}|${day}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(rec);
  }

  const files = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, recs]) => {
    const [u, day] = k.split('|');
    return { name: `HangDen_${u}_${day.replace(/-/g, '')}_${time}.csv`, unit: u, day, rows: recs.length, recs };
  });
  if (!dryRun) {
    fs.mkdirSync(outAbs, { recursive: true });
    for (const f of files) {
      const lines = [header, ...f.recs].map((r) => r.map(quote).join(','));
      fs.writeFileSync(path.join(outAbs, f.name), '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
    }
  }
  return {
    files: files.map(({ recs, ...rest }) => rest),
    total: records.length - 1,
    ttktDated,
    unplaced: pending.length
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.positional[0];
  if (!input || !args.out) throw new Error(USAGE);
  const r = await splitCsv(input, args.out, { unit: args.unit || null, time: args.time, dryRun: args.dryRun });
  console.log(args.dryRun ? 'CHẠY THỬ (chưa ghi file nào). Sẽ tạo:' : `Đã tạo ${r.files.length} file trong ${path.resolve(args.out)}:`);
  const w = Math.max(...r.files.map((f) => f.name.length));
  for (const f of r.files) console.log(`  ${f.name.padEnd(w)}  ${String(f.rows).padStart(8)} dòng`);
  const sum = r.files.reduce((a, f) => a + f.rows, 0);
  console.log(`Tổng: ${sum} dòng / ${r.total} dòng trong file gốc${sum === r.total ? '' : '  <-- LỆCH, báo lại'}.`);
  if (r.ttktDated) console.log(`  - ${r.ttktDated} dòng chưa có mốc BCVH nào, xếp theo ngày lập BD10 (chưa nhận tại BCVH).`);
  if (r.unplaced) console.log(`  - ${r.unplaced} dòng KHÔNG có mốc nào, xếp vào ngày cuối cùng.`);
  console.log('Tiếp theo: node scripts/import-arrivals.js "' + path.resolve(args.out) + '"');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[split-arrivals-csv] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { splitCsv };
