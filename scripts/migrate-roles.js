#!/usr/bin/env node
// ==========================================
// Chuyển đổi vai trò một lần (SANLUONG-3c-2, docs/ai/04_DECISIONS.md #49): MANAGER -> TTVH.
// ADMIN, GDVH, STAFF giữ nguyên.
//
//   node scripts/migrate-roles.js [--db <đường-dẫn-DB>]            # chế độ thử (dry-run), KHÔNG ghi gì
//   node scripts/migrate-roles.js [--db <đường-dẫn-DB>] --apply    # sao lưu rồi chuyển đổi
//
// DB mặc định data/hue-dhcl.db (hoặc biến môi trường ARRIVALS_DB, như các script khác).
// - Dry-run: chỉ in số tài khoản theo từng giá trị `role` và số sẽ đổi. KHÔNG in họ tên, mã HRM, hash.
// - --apply: nếu có gì để đổi -> sao lưu DB (cùng thư mục, tên có dấu thời gian) rồi đổi trong MỘT transaction.
// - Giá trị `role` lạ (ngoài ADMIN, TTVH, GDVH, STAFF, MANAGER, kể cả rỗng): KHÔNG tự đổi gì cả,
//   in số lượng và thoát mã lỗi 2 để PO quyết.
// - Idempotent: chạy lại khi không còn MANAGER thì không làm gì (không sao lưu, không ghi).
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { VALID_ROLES, LEGACY_ROLE_MAP } = require('../server/roles');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'hue-dhcl.db');
const USAGE = 'Cách dùng: node scripts/migrate-roles.js [--db <DB>] [--apply]';

// Mã thoát: 0 ok (kể cả không có gì để đổi), 1 lỗi sử dụng/DB, 2 gặp vai trò lạ (đã dừng, không đổi gì).
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_UNKNOWN_ROLE = 2;

function parseArgs(argv) {
  const out = { apply: false, db: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--db') out.db = argv[++i];
    else throw new Error(`Tham số không hợp lệ: ${argv[i]}. ${USAGE}`);
  }
  return out;
}

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Đếm tài khoản theo giá trị role (null/rỗng gom vào khoá '').
function countRoles(db) {
  const counts = new Map();
  for (const r of db.prepare("SELECT COALESCE(role, '') AS role, COUNT(*) AS n FROM users GROUP BY COALESCE(role, '')").all()) {
    counts.set(r.role, r.n);
  }
  return counts;
}

const label = (role) => (role === '' ? '(trống)' : JSON.stringify(role));

// Trả { exitCode, lines, backupPath?, changed }. `log` nhận từng dòng (mặc định console.log).
async function migrateRoles({ dbPath = DEFAULT_DB, apply = false, log = console.log, now = new Date() } = {}) {
  if (!fs.existsSync(dbPath)) return { exitCode: EXIT_ERROR, error: `Không tìm thấy DB ${dbPath}`, changed: 0 };

  const db = new Database(dbPath, { fileMustExist: true });
  try {
    const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (!hasUsers) return { exitCode: EXIT_ERROR, error: 'DB không có bảng users', changed: 0 };

    const counts = countRoles(db);
    const known = new Set([...VALID_ROLES, ...Object.keys(LEGACY_ROLE_MAP)]);
    const unknown = [...counts].filter(([role]) => !known.has(role));
    const toChange = Object.keys(LEGACY_ROLE_MAP).reduce((sum, from) => sum + (counts.get(from) || 0), 0);

    log(`Chế độ: ${apply ? 'ÁP DỤNG (--apply)' : 'THỬ (dry-run, không ghi gì)'} — DB: ${dbPath}`);
    log('Số tài khoản theo vai trò hiện có:');
    for (const [role, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) log(`  ${label(role)}: ${n}`);
    for (const [from, to] of Object.entries(LEGACY_ROLE_MAP)) log(`Sẽ đổi ${from} -> ${to}: ${counts.get(from) || 0} tài khoản`);

    if (unknown.length) {
      log('DỪNG: có giá trị role lạ, KHÔNG tự đổi gì (kể cả MANAGER). PO quyết cách xử lý:');
      for (const [role, n] of unknown) log(`  ${label(role)}: ${n} tài khoản`);
      return { exitCode: EXIT_UNKNOWN_ROLE, changed: 0, unknown: Object.fromEntries(unknown) };
    }
    if (toChange === 0) {
      log('Không có gì để đổi.');
      return { exitCode: EXIT_OK, changed: 0 };
    }
    if (!apply) {
      log('Đây là chế độ thử: chưa ghi gì. Chạy lại với --apply để sao lưu và chuyển đổi.');
      return { exitCode: EXIT_OK, changed: 0, wouldChange: toChange };
    }

    const backupPath = path.join(path.dirname(path.resolve(dbPath)), `${path.basename(dbPath)}.${stamp(now)}.bak`);
    await db.backup(backupPath);
    log(`Đã sao lưu: ${backupPath}`);

    const upd = db.prepare('UPDATE users SET role = ? WHERE role = ?');
    const changed = db.transaction(() => {
      let n = 0;
      for (const [from, to] of Object.entries(LEGACY_ROLE_MAP)) n += upd.run(to, from).changes;
      return n;
    })();
    log(`Đã đổi ${changed} tài khoản.`);
    return { exitCode: EXIT_OK, changed, backupPath };
  } finally {
    db.close();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[migrate-roles] ${err.message}`);
    process.exit(EXIT_ERROR);
  }
  try {
    const res = await migrateRoles({ dbPath: args.db || process.env.ARRIVALS_DB || DEFAULT_DB, apply: args.apply });
    if (res.error) console.error(`[migrate-roles] ${res.error}`);
    process.exit(res.exitCode);
  } catch (err) {
    console.error(`[migrate-roles] ${err.message}`);
    process.exit(EXIT_ERROR);
  }
}

if (require.main === module) main();

module.exports = { migrateRoles, EXIT_OK, EXIT_ERROR, EXIT_UNKNOWN_ROLE };
