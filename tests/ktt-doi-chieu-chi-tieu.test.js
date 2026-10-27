// ==========================================
// Test KTT-10b (5.5): scripts/ktt-doi-chieu-chi-tieu.js — in số tổng khối `chi_tieu_14h` hai mốc từ BẢN CHÉP DB, CHỈ ĐỌC.
// DB file tạm + ensureKttSchema, dữ liệu GIẢ (SHBG KTT-DEMO-xxxx). Không mở data/, không server, không DB thật.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const SC = require('../scripts/ktt-doi-chieu-chi-tieu');

const TH = '533140';
const SCRIPT = path.join(__dirname, '..', 'scripts', 'ktt-doi-chieu-chi-tieu.js');
const NG = { nguon_xuat_luc: '2026-10-23 10:00:00', cap_nhat_luc: '2026-10-23 10:00:00' };
let seq = 0;
function them(db, bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
function tui(db, o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them(db, 'ktt_tui', r); return r; }
function bg(db, t, shbg) { them(db, 'ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG }); }
function tuiDen(db, quet, xnd, shbg, bd10) {
  const t = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xnd });
  bg(db, t, shbg);
}
function tuiDi(db, gioDi, shbg) {
  const t = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: TH, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: 'BD10-DI-1', bd10_di_ma_diem_nhan: TH });
  bg(db, t, shbg);
}

/** 6 SHBG có đáp án tính tay (mẫu số 6): mốc A đo được 3 (2 đạt, 1 không đạt), mốc B đo được 4 (3 đạt, 1 không đạt). */
function taoBanChep() {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'ktt-dc-'));
  const file = path.join(thuMuc, 'ban-chep.db');
  const db = new Database(file);
  ensureKttSchema(db);
  const q = '2026-10-20 05:30:00';
  tuiDen(db, q, q, 'KTT-DEMO-A1', 'BD10-DEN-1'); tuiDi(db, '2026-10-20 06:50:00', 'KTT-DEMO-A1'); // A đạt, B đạt
  tuiDen(db, '2026-10-20 05:00:00', '2026-10-20 14:00:00', 'KTT-DEMO-A2', 'BD10-DEN-2'); tuiDi(db, '2026-10-21 14:00:01', 'KTT-DEMO-A2'); // không đạt cả hai
  tuiDen(db, q, null, 'KTT-DEMO-A3', 'BD10-DEN-3'); tuiDi(db, '2026-10-20 06:50:00', 'KTT-DEMO-A3'); // thiếu XNĐ: A không đo được, B đạt
  tuiDen(db, q, '2026-10-20 08:00:00', 'KTT-DEMO-A4', 'BD10-DEN-4'); tuiDi(db, '2026-10-20 06:50:00', 'KTT-DEMO-A4'); // XNĐ sau giờ đi: A không đo được, B đạt
  tuiDen(db, '2026-10-20 11:00:00', '2026-10-20 11:00:00', 'KTT-DEMO-A5', 'BD10-DEN-5'); // chưa đi, không có túi đi
  tuiDen(db, '2026-10-20 08:00:00', '2026-10-20 05:00:00', 'KTT-DEMO-A6', 'BD10-DEN-6'); tuiDi(db, '2026-10-20 06:00:00', 'KTT-DEMO-A6'); // đi trước khi đến: A đạt, B mốc sau giờ đi
  db.prepare("INSERT INTO ktt_nap_cap (khoa_cap, nguon_xuat_luc, ket_qua, thay_dau_luc, cap_nhat_luc) VALUES ('20261023_100000', '2026-10-23 10:00:00', 'OK', '2026-10-23 10:05:00', '2026-10-23 10:05:00')").run();
  db.close();
  return { thuMuc, file };
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const chay = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('in số tổng hai mốc từ bản chép: đo được x/y, đạt, không đạt, ba nhóm không đo được, chưa đi quá chỉ tiêu, đo được ở mốc này không ở mốc kia, chất lượng túi đến; DB không đổi byte', () => {
  const { thuMuc, file } = taoBanChep();
  try {
    const truoc = sha(file);
    const r = chay('--db', file, '--tu', '2026-10-20');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(sha(file), truoc, 'DB không bị ghi');
    for (const s of ['3 / 6', '4 / 6', 'không phải tỷ lệ chung', 'thiếu mốc', 'mốc sau giờ lập BD10 đi', 'chưa đi', 'chua_di_da_qua_chi_tieu', 'không đo được ở mốc kia', 'SHBG không có túi đi: 1', 'từ 2 túi đến']) assert.ok(r.stdout.includes(s), s);
    assert.doesNotMatch(r.stdout, /KTT-DEMO|BD10-DEN|BD10-DI/, 'không in SHBG / số hiệu BD10');
    const j = JSON.parse(chay('--db', file, '--tu', '2026-10-20', '--den', '2026-10-20', '--json').stdout).chi_tieu_14h;
    const [a, b] = [j.theo_moc.xnd, j.theo_moc.quet_tui_den];
    assert.deepEqual([j.mau_so, a.do_duoc, a.dat, a.khong_dat, b.do_duoc, b.dat, b.khong_dat], [6, 3, 2, 1, 4, 3, 1]);
    assert.deepEqual({ ...a.khong_do_duoc }, { tong: 3, thieu_moc: 1, moc_sau_gio_di: 1, chua_di: 1 });
    assert.deepEqual({ ...b.khong_do_duoc }, { tong: 2, thieu_moc: 0, moc_sau_gio_di: 1, chua_di: 1 });
    assert.deepEqual([a.do_duoc_khong_do_duoc_o_moc_kia, b.do_duoc_khong_do_duoc_o_moc_kia, j.do_duoc_ca_hai_moc], [1, 2, 2]);
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
});

test('khoảng nhiều ngày và ngày không có dữ liệu: cộng đúng; DB chưa có độ mới → báo chưa có dữ liệu, không lỗi', () => {
  const { thuMuc, file } = taoBanChep();
  try {
    const j = JSON.parse(chay('--db', file, '--tu', '2026-10-19', '--den', '2026-10-21', '--json').stdout).chi_tieu_14h;
    assert.equal(j.mau_so, 6, 'ngày 19 và 21 không có dữ liệu: không thêm');
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ktt-dc-'));
  const f2 = path.join(t2, 'trong.db');
  const db = new Database(f2); ensureKttSchema(db); db.close();
  try {
    const r = chay('--db', f2, '--tu', '2026-10-20');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Chưa có dữ liệu để tính/);
  } finally { fs.rmSync(t2, { recursive: true, force: true }); }
});

test('từ chối: cờ ghi, thiếu --db / --tu, ngày sai, tu > den, quá 31 ngày, DB thật data/hue-dhcl.db, file không có; mã thoát 1', () => {
  const { thuMuc, file } = taoBanChep();
  try {
    const cacCa = [['--db', file, '--tu', '2026-10-20', '--apply'], ['--db', file, '--tu', '2026-10-20', '--delete'], ['--tu', '2026-10-20'], ['--db', file], ['--db', file, '--tu', '2026-02-30'],
      ['--db', file, '--tu', '2026-10-21', '--den', '2026-10-20'], ['--db', file, '--tu', '2026-09-01', '--den', '2026-10-20'],
      ['--db', path.join(__dirname, '..', 'data', 'hue-dhcl.db'), '--tu', '2026-10-20'], ['--db', path.join(thuMuc, 'khong-co.db'), '--tu', '2026-10-20'], ['--db', file, '--tu', '2026-10-20', '--la']];
    for (const args of cacCa) {
      const r = chay(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /Cách dùng/, args.join(' '));
    }
    assert.throws(() => SC.parseArgs(['--db', file, '--tu', '2026-10-20', '--write']), /chỉ đọc/);
    assert.equal(SC.parseArgs(['--db', file, '--tu', '2026-10-20']).den, '2026-10-20', '--den mặc định = --tu');
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
});
