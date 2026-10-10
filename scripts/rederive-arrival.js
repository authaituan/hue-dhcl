#!/usr/bin/env node
// ==========================================
// Tính lại cột ngày đến (arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count) của dữ liệu "Hàng đến" ĐÃ NẠP
// theo quy tắc R2 (docs/ai/04_DECISIONS.md #59): mốc đầu tiên không trống theo thứ tự XN túi -> XN bưu gửi -> XNĐ BD10.
// Dùng đúng hàm deriveArrival() của importer (server/lib/arrivalsImport.js) nên kết quả giống hệt dữ liệu nạp mới.
//
//   node scripts/rederive-arrival.js [--db <đường-dẫn-DB>]            # CHẠY THỬ: chỉ đọc, in số dòng thay đổi
//   node scripts/rederive-arrival.js [--db <đường-dẫn-DB>] --apply    # GHI trong một transaction
//
// DB mặc định data/hue-dhcl.db (hoặc biến môi trường ARRIVALS_DB). Chạy lặp lại được (lần sau: 0 dòng thay đổi).
// !! Trước khi --apply: tắt app (hoặc chắc chắn không có tiến trình nạp) và SAO LƯU data/hue-dhcl.db (+ -wal, -shm).
// Chỉ in số liệu tổng hợp — KHÔNG in số hiệu bưu gửi / BD8 / BD10.
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { deriveArrival } = require('../server/lib/arrivalsImport');

const USAGE = 'Cách dùng: node scripts/rederive-arrival.js [--db <DB>] [--apply]   (mặc định chạy thử, không ghi)';
const CHUNK = 20000;

function parseArgs(argv) {
  const out = { apply: false, db: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--db') out.db = argv[++i];
    else throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
  }
  return out;
}

const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const sorted = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);

/**
 * Tính lại toàn bộ bảng arrival_items. Trả thống kê; ghi DB chỉ khi apply = true (trong một transaction).
 * Tách thành hàm để test gọi trực tiếp trên DB tạm.
 */
function rederive(db, { apply = false } = {}) {
  const sel = db.prepare(`SELECT id, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count
    FROM arrival_items WHERE id > ? ORDER BY id LIMIT ${CHUNK}`);
  const upd = db.prepare('UPDATE arrival_items SET arrival_at = @arrival_at, arrival_at_basis = @arrival_at_basis, arrival_date = @arrival_date, arrival_evidence_count = @arrival_evidence_count WHERE id = @id');
  const stats = { total: 0, changed: 0, sameDay: 0, earlier: 0, later: 0, gainedDate: 0, lostDate: 0, timeOnly: 0, basis: new Map(), dayPairs: new Map() };

  const run = () => {
    let lastId = 0;
    for (;;) {
      const rows = sel.all(lastId);
      if (!rows.length) break;
      for (const r of rows) {
        stats.total++;
        lastId = r.id;
        const n = deriveArrival({ bag_confirmed_at: r.bag_confirmed_at, item_confirmed_at: r.item_confirmed_at, bd10_confirmed_at: r.bd10_confirmed_at });
        if (n.arrival_at === r.arrival_at && n.arrival_at_basis === r.arrival_at_basis && n.arrival_date === r.arrival_date
          && n.arrival_evidence_count === r.arrival_evidence_count) continue;
        stats.changed++;
        const o = r.arrival_date; const d = n.arrival_date;
        if (o === d) { stats.sameDay++; stats.timeOnly++; }
        else if (o === null) stats.gainedDate++;
        else if (d === null) stats.lostDate++;
        else if (d < o) { stats.earlier++; bump(stats.dayPairs, `${o} -> ${d}`); }
        else { stats.later++; bump(stats.dayPairs, `${o} -> ${d}`); }
        bump(stats.basis, `${r.arrival_at_basis || '(không)'} -> ${n.arrival_at_basis || '(không)'}`);
        if (apply) upd.run({ id: r.id, arrival_at: n.arrival_at, arrival_at_basis: n.arrival_at_basis, arrival_date: n.arrival_date, arrival_evidence_count: n.arrival_evidence_count });
      }
    }
  };
  if (apply) db.transaction(run)(); else run();
  return stats;
}

function printStats(s, apply) {
  console.log(`Tổng số dòng xét: ${s.total}`);
  console.log(`${apply ? 'Đã ghi' : 'Sẽ đổi'} ${s.changed} dòng (${s.total ? ((100 * s.changed) / s.total).toFixed(2) : 0}%):`);
  console.log(`  - ngày đến sớm lên:  ${s.earlier}`);
  console.log(`  - ngày đến muộn đi:  ${s.later}`);
  console.log(`  - cùng ngày (chỉ đổi giờ / mốc căn cứ): ${s.sameDay}`);
  console.log(`  - từ chưa có ngày -> có ngày: ${s.gainedDate}; từ có ngày -> chưa có: ${s.lostDate}`);
  console.log('  Mốc căn cứ cũ -> mới:');
  for (const [k, n] of sorted(s.basis)) console.log(`    ${k}: ${n}`);
  if (s.dayPairs.size) {
    console.log(`  Cặp ngày đổi (cũ -> mới), tối đa 20 cặp nhiều nhất / ${s.dayPairs.size} cặp:`);
    for (const [k, n] of sorted(s.dayPairs).slice(0, 20)) console.log(`    ${k}: ${n} dòng`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(args.db || process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}`);
  const db = new Database(dbPath, { fileMustExist: true, readonly: !args.apply });
  try {
    const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'arrival_items'").get();
    if (!has) throw new Error('DB chưa có bảng arrival_items.');
    console.log(`DB: ${dbPath}`);
    console.log(args.apply ? 'CHẾ ĐỘ GHI (--apply). Nhớ đã sao lưu DB (+ -wal, -shm) và tắt app.' : 'CHẠY THỬ (không ghi). Thêm --apply để ghi — sao lưu DB trước.');
    const stats = rederive(db, { apply: args.apply });
    printStats(stats, args.apply);
    if (!args.apply && stats.changed) console.log('\nChưa ghi gì. Chạy lại với --apply để ghi.');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Lỗi: ${err.message}\n${USAGE}`);
    process.exit(1);
  }
}

module.exports = { rederive };
