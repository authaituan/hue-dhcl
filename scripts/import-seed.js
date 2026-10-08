#!/usr/bin/env node
// ==========================================
// Nạp DB ban đầu cho hue-dhcl từ DB hệ thống cũ (kế thừa từ it-assets v1.0.0):
// tài khoản (users, giữ nguyên id + password_hash) và mạng lưới (tỉnh / BĐX / bưu cục).
//
//   node scripts/import-seed.js <đường-dẫn-DB-nguồn> [--force]
//
// - Đích cố định data/hue-dhcl.db, phải đã có schema mới (chạy app 1 lần để server/db.js tạo bảng).
// - Nguồn KHÔNG bao giờ được mở trực tiếp: mở SQLite (kể cả readonly) trên DB chế độ WAL vẫn tạo
//   file -wal/-shm cạnh nó. Script chỉ ĐỌC file nguồn (+ -wal nếu có) để chép sang thư mục tạm,
//   mở bản sao ở chế độ readonly, xong thì xoá thư mục tạm.
// - Chỉ sao 4 bảng, theo thứ tự khoá ngoại; chỉ các cột có ở CẢ HAI phía.
// - Cả lần nạp nằm trong 1 transaction; lỗi toàn vẹn -> rollback, đích giữ nguyên.
// - KHÔNG in password_hash / mật khẩu.
// ==========================================
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const TABLES = ['province_post_offices', 'commune_post_offices', 'post_offices', 'users'];
const DEFAULT_TARGET = path.join(__dirname, '..', 'data', 'hue-dhcl.db');

class SeedError extends Error {}

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
const tableNames = (db) => new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
const columnsOf = (db, table) => db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((c) => c.name);

// Bản chụp chỉ-đọc của DB nguồn (xem chú thích đầu file).
function openSourceSnapshot(sourcePath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hue-dhcl-seed-'));
  const copy = path.join(tmpDir, 'source.db');
  try {
    fs.copyFileSync(sourcePath, copy);
    if (fs.existsSync(`${sourcePath}-wal`)) fs.copyFileSync(`${sourcePath}-wal`, `${copy}-wal`);
    const db = new Database(copy, { readonly: true, fileMustExist: true });
    return { db, close() { db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); } };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

function importSeed({ sourcePath, targetPath = DEFAULT_TARGET, force = false }) {
  if (!sourcePath) throw new SeedError('Thiếu đường dẫn DB nguồn. Cách dùng: node scripts/import-seed.js <đường-dẫn-DB-nguồn> [--force]');
  if (!fs.existsSync(sourcePath)) throw new SeedError(`Không tìm thấy DB nguồn: ${sourcePath}`);
  if (!fs.existsSync(targetPath)) {
    throw new SeedError(`Chưa có DB đích ${targetPath}. Chạy app một lần để tạo bảng (hoặc: node -e "require('./server/db')"), rồi chạy lại script.`);
  }
  if (path.resolve(sourcePath).toLowerCase() === path.resolve(targetPath).toLowerCase()) {
    throw new SeedError('DB nguồn và DB đích là cùng một file.');
  }

  const snapshot = openSourceSnapshot(sourcePath);
  const src = snapshot.db;
  let dst;
  try {
    if (src.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new SeedError('DB nguồn không qua được integrity_check — dừng hệ thống cũ rồi lấy lại bản sao DB.');
    }
    const srcTables = tableNames(src);
    if (!srcTables.has('users')) throw new SeedError('DB nguồn không có bảng users — không phải DB hệ thống cũ?');
    const missingSrc = TABLES.filter((t) => !srcTables.has(t));
    if (missingSrc.length) throw new SeedError(`DB nguồn thiếu bảng: ${missingSrc.join(', ')}`);

    dst = new Database(targetPath, { fileMustExist: true });
    const dstTables = tableNames(dst);
    const missingDst = TABLES.filter((t) => !dstTables.has(t));
    if (missingDst.length) {
      throw new SeedError(`DB đích thiếu bảng: ${missingDst.join(', ')}. Chạy app một lần để tạo schema mới rồi chạy lại.`);
    }

    const nonEmpty = TABLES.filter((t) => dst.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(t)}`).get().n > 0);
    if (nonEmpty.length && !force) {
      throw new SeedError(`DB đích đã có dữ liệu ở bảng: ${nonEmpty.join(', ')}. Dùng --force để xoá 4 bảng này và nạp lại.`);
    }

    // Giao tập cột theo từng bảng (giữ thứ tự cột của đích).
    const plan = TABLES.map((t) => {
      const srcCols = columnsOf(src, t);
      const dstCols = columnsOf(dst, t);
      return {
        table: t,
        cols: dstCols.filter((c) => srcCols.includes(c)),
        dropped: srcCols.filter((c) => !dstCols.includes(c)),
        defaulted: dstCols.filter((c) => !srcCols.includes(c))
      };
    });
    for (const p of plan) {
      if (!p.cols.includes('id')) throw new SeedError(`Bảng ${p.table}: thiếu cột id ở một trong hai phía.`);
    }

    const counts = {};
    const run = dst.transaction(() => {
      // Kiểm khoá ngoại vào cuối transaction (foreign_key_check bên dưới), không chặn theo từng dòng.
      dst.pragma('defer_foreign_keys = ON');
      if (force) {
        for (const t of [...TABLES].reverse()) dst.prepare(`DELETE FROM ${quoteIdent(t)}`).run();
      }
      for (const p of plan) {
        const colSql = p.cols.map(quoteIdent).join(', ');
        const rows = src.prepare(`SELECT ${colSql} FROM ${quoteIdent(p.table)}`).raw().all();
        const ins = dst.prepare(`INSERT INTO ${quoteIdent(p.table)} (${colSql}) VALUES (${p.cols.map(() => '?').join(', ')})`);
        for (const r of rows) ins.run(r);
        counts[p.table] = rows.length;
      }

      const fkErrors = dst.pragma('foreign_key_check');
      if (fkErrors.length) {
        const sample = fkErrors.slice(0, 5).map((e) => `${e.table}#${e.rowid} -> ${e.parent}`).join('; ');
        throw new SeedError(`Vi phạm khoá ngoại sau khi nạp (${fkErrors.length} dòng), đã huỷ toàn bộ: ${sample}`);
      }
      const orphanPo = dst.prepare('SELECT COUNT(*) AS n FROM post_offices p LEFT JOIN commune_post_offices c ON c.id = p.commune_id WHERE c.id IS NULL').get().n;
      const orphanCommune = dst.prepare('SELECT COUNT(*) AS n FROM commune_post_offices c LEFT JOIN province_post_offices v ON v.id = c.province_id WHERE v.id IS NULL').get().n;
      if (orphanPo || orphanCommune) {
        throw new SeedError(`Dữ liệu mồ côi: ${orphanPo} bưu cục không có BĐX, ${orphanCommune} BĐX không có tỉnh — đã huỷ toàn bộ.`);
      }
    });
    run();

    // Gộp WAL vào file .db để có thể chép riêng file này lên máy chủ.
    dst.pragma('wal_checkpoint(TRUNCATE)');

    const accounts = dst.prepare(`
      SELECT hrm_code, full_name, role, deactivated_at FROM users
      WHERE password_hash IS NOT NULL ORDER BY hrm_code
    `).all().map((u) => ({ hrm_code: u.hrm_code, full_name: u.full_name, role: u.role, active: u.deactivated_at === null }));
    const usersWithoutPassword = dst.prepare('SELECT COUNT(*) AS n FROM users WHERE password_hash IS NULL').get().n;
    const danglingResponsible = dst.prepare(`
      SELECT COUNT(*) AS n FROM post_offices p
      WHERE p.responsible_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.responsible_user_id)
    `).get().n;

    return {
      counts,
      columns: plan.map(({ table, dropped, defaulted }) => ({ table, dropped, defaulted })),
      accounts,
      usersWithoutPassword,
      danglingResponsible,
      forced: force && nonEmpty.length > 0
    };
  } finally {
    if (dst) dst.close();
    snapshot.close();
  }
}

function formatReport(r) {
  const lines = [];
  lines.push(r.forced ? 'Đã xoá dữ liệu cũ của 4 bảng đích (--force) và nạp lại.' : 'Nạp dữ liệu thành công.');
  lines.push('', 'Số dòng đã nạp:');
  for (const t of TABLES) lines.push(`  ${t}: ${r.counts[t]}`);
  lines.push('', 'Cột:');
  for (const c of r.columns) {
    lines.push(`  ${c.table}: bỏ (chỉ có ở nguồn) [${c.dropped.join(', ') || '—'}]; để mặc định (chỉ có ở đích) [${c.defaulted.join(', ') || '—'}]`);
  }
  lines.push('', `Tài khoản đăng nhập (${r.accounts.length}): mã HRM | họ tên | quyền | trạng thái`);
  for (const a of r.accounts) lines.push(`  ${a.hrm_code} | ${a.full_name} | ${a.role} | ${a.active ? 'hoạt động' : 'khoá'}`);
  lines.push('', `Dòng users không có mật khẩu (không đăng nhập được): ${r.usersWithoutPassword}`);
  if (r.danglingResponsible) {
    lines.push(`Cảnh báo: ${r.danglingResponsible} bưu cục có người phụ trách không tồn tại trong users.`);
  }
  lines.push('', 'Kiểm toàn vẹn: foreign_key_check rỗng, mọi bưu cục/BĐX đều trỏ tới BĐX/tỉnh tồn tại.');
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const sourcePath = args.find((a) => !a.startsWith('--'));
  try {
    console.log(formatReport(importSeed({ sourcePath, force })));
  } catch (err) {
    console.error(`[import-seed] ${err instanceof SeedError ? err.message : `Lỗi: ${err.message}`}`);
    process.exit(1);
  }
}

module.exports = { importSeed, formatReport, SeedError, TABLES };
