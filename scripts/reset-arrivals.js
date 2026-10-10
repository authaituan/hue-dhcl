#!/usr/bin/env node
// ==========================================
// Xoá TOÀN BỘ dữ liệu "sản lượng đến" (chỉ cho môi trường dev, để nạp lại từ file CSV mới).
//
//   node scripts/reset-arrivals.js [--db <đường-dẫn-DB>]            # CHẠY THỬ: chỉ đọc, in số dòng sẽ xoá
//   node scripts/reset-arrivals.js [--db <đường-dẫn-DB>] --apply    # XOÁ trong một transaction
//
// DB mặc định data/hue-dhcl.db (hoặc biến môi trường ARRIVALS_DB).
// Chỉ xoá 2 bảng (danh sách trắng ARRIVAL_TABLES, KHÔNG suy ra từ tên):
//   arrival_items         dòng dữ liệu "Hàng đến"
//   arrival_import_files  lịch sử nạp file (tên file, mã băm, trạng thái) — sau khi xoá, mọi file được nạp lại như chưa từng nạp
// và đặt lại bộ đếm id của arrival_import_files. KHÔNG đụng: users, user_bcvh, post_offices, commune_post_offices, province_post_offices,
// ward_bdx_map (ánh xạ phường/xã -> BĐX, gồm cả gán tay), dashboard_widgets và mọi bảng khác. Không chắc bảng nào thì KHÔNG xoá.
// !! Trước khi --apply: tắt app và SAO LƯU data/hue-dhcl.db (+ -wal, -shm). Không hoàn tác được.
// Chạy lặp lại được (lần sau: 0 dòng). Không in nội dung dữ liệu.
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const USAGE = 'Cách dùng: node scripts/reset-arrivals.js [--db <DB>] [--apply]   (mặc định chạy thử, không ghi)';
// Thứ tự xoá: bảng con (khoá ngoại tới bảng cha) trước.
const ARRIVAL_TABLES = Object.freeze(['arrival_items', 'arrival_import_files']);
const SEQUENCE_TABLES = Object.freeze(['arrival_import_files']); // có AUTOINCREMENT

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

/** Trả { tables: [{ name, rows }], kept: [tên bảng giữ nguyên], deleted } ; xoá thật chỉ khi apply = true (một transaction). */
function resetArrivals(db, { apply = false } = {}) {
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  for (const t of ARRIVAL_TABLES) if (!existing.has(t)) throw new Error(`DB chưa có bảng ${t}.`);
  const tables = ARRIVAL_TABLES.map((name) => ({ name, rows: db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n }));
  const kept = [...existing].filter((n) => !ARRIVAL_TABLES.includes(n) && !n.startsWith('sqlite_')).sort();
  if (apply) {
    db.transaction(() => {
      for (const t of ARRIVAL_TABLES) db.prepare(`DELETE FROM ${t}`).run();
      if (existing.has('sqlite_sequence')) for (const t of SEQUENCE_TABLES) db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(t);
    })();
  }
  return { tables, kept, deleted: apply ? tables.reduce((a, t) => a + t.rows, 0) : 0 };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(args.db || process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}`);
  const db = new Database(dbPath, { fileMustExist: true, readonly: !args.apply });
  try {
    console.log(`DB: ${dbPath}`);
    console.log(args.apply ? 'CHẾ ĐỘ XOÁ (--apply). Nhớ đã TẮT app và SAO LƯU DB (+ -wal, -shm).' : 'CHẠY THỬ (không ghi). Thêm --apply để xoá — tắt app và sao lưu DB trước.');
    const r = resetArrivals(db, { apply: args.apply });
    console.log(`\n${args.apply ? 'Đã xoá' : 'Sẽ xoá'}:`);
    for (const t of r.tables) console.log(`  ${t.name.padEnd(22)} ${String(t.rows).padStart(9)} dòng`);
    console.log('\nGiữ nguyên (không đụng):');
    console.log(`  ${r.kept.join(', ')}`);
    if (args.apply) {
      db.pragma('wal_checkpoint(TRUNCATE)');
      console.log('\nXong. Nạp lại: tách file (nếu file phủ nhiều ngày) rồi chạy scripts/import-arrivals.js — xem docs/ai/06_DEPLOYMENT.md mục 9.');
    } else {
      console.log('\nChưa xoá gì.');
    }
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

module.exports = { resetArrivals, ARRIVAL_TABLES };
