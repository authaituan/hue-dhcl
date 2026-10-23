// ==========================================
// Test QUYTG-9d: thứ tự /luot — lượt «nghi ngờ» (hai mốc cách > 7 ngày) xếp CUỐI danh sách.
//   Nhóm A: không nghi ngờ, có quỹ F1_3 (tăng dần) -> Nhóm B: không nghi ngờ, quỹ null -> Nhóm C: nghi ngờ (quỹ tăng dần, null cuối).
//   Hòa: shbg, receiver_code, ngay_den. DB RAM + dữ liệu GIẢ (mã BCVH 539999, SHBG / BD10 giả). Không server, không mạng.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureArrivalSchema, deriveArrival } = require('../server/lib/arrivalsImport');
const QQ = require('../server/lib/quyThoiGianQuery');
const CACHE = require('../server/lib/quyThoiGianCache');

const BC = '539999';
let db;
let idDong = 0;

const insSql = `INSERT INTO arrival_items (id, import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
  bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
  VALUES (@id, 1, @recv, @trk, @bd10, '', @bag, NULL, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @arrival_evidence_count, @bag_date, @bd10_date, NULL)`;
const KTT_B = (n) => `530100${BC}6102${n}`;

function them(stmt, o) {
  const it = deriveArrival({ bag_confirmed_at: o.bag, item_confirmed_at: null, bd10_confirmed_at: o.xnd ?? null });
  stmt.run({
    id: ++idDong, recv: BC, trk: o.trk, bd10: KTT_B(String(idDong).padStart(2, '0')), bag: o.bag, xnd: o.xnd ?? null, ktt: o.ktt ?? null,
    arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis, arrival_date: it.arrival_date, arrival_evidence_count: it.arrival_evidence_count,
    bag_date: o.bag.slice(0, 10), bd10_date: o.xnd ? o.xnd.slice(0, 10) : null
  });
}

// Chỉ tiêu F1_3 mặc định 14 giờ (BCVH này không có ngoại lệ). Quỹ = 14h − thời gian thực (thời gian thực đã loại trừ khung 21:00–07:00 mỗi ngày).
const LUOT = [
  // Nhóm A — không nghi ngờ, có quỹ
  { trk: 'SX0001VN', ktt: '2026-10-20 15:25:00', xnd: '2026-10-21 07:45:14' }, // thực 6h20'14" -> quỹ dương
  { trk: 'SX0002VN', ktt: '2026-10-21 06:00:00', xnd: '2026-10-21 09:30:00' }, // thực 2h30' -> quỹ dương
  { trk: 'SX0003VN', ktt: '2026-10-19 08:00:00', xnd: '2026-10-21 08:00:00' }, // thực 28h (2 ngày) -> quỹ ÂM -14h, nhưng KHÔNG nghi ngờ
  { trk: 'SX0004VN', ktt: '2026-10-20 20:00:00', xnd: '2026-10-21 08:00:00' }, // thực 2h -> quỹ dương lớn hơn SX0002VN
  { trk: 'SX0005VN', ktt: '2026-10-21 06:00:00', xnd: '2026-10-21 09:30:00' }, // hòa quỹ với SX0002VN -> theo shbg
  // Nhóm B — không nghi ngờ, quỹ null
  { trk: 'SX0006VN', ktt: '2026-10-21 06:00:00', xnd: null }, // thiếu XNĐ BCVH: không đo được
  { trk: 'SX0007VN', ktt: '2026-10-21 11:00:00', xnd: '2026-10-21 09:30:00' }, // số âm (KTT sau XNĐ 1,5h): quỹ null, chưa tới 7 ngày
  // Nhóm C — nghi ngờ
  { trk: 'SX0008VN', ktt: '2026-10-13 08:00:00', xnd: '2026-10-21 08:00:00' }, // 8 ngày -> quỹ âm (đỡ sâu hơn SX0009VN)
  { trk: 'SX0009VN', ktt: '2026-10-10 08:00:00', xnd: '2026-10-21 08:00:00' }, // 11 ngày -> quỹ âm sâu nhất
  { trk: 'SX0010VN', ktt: '2026-10-13 08:00:00', xnd: '2026-10-21 08:00:00' }, // hòa quỹ với SX0008VN -> theo shbg
  { trk: 'SX0011VN', ktt: '2026-10-30 08:00:00', xnd: '2026-10-21 08:00:00' } // KTT sau XNĐ 9 ngày: nghi ngờ nhưng quỹ null -> cuối cùng
];

before(() => {
  db = new Database(':memory:');
  ensureArrivalSchema(db);
  db.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT); CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, new_ward_name TEXT)');
  db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,?,?,?,?,1,'x','OK')").run(BC, 'f.csv', '2026-10-21', '093012');
  const st = db.prepare(insSql);
  for (const l of LUOT) them(st, { ...l, bag: '2026-10-21 07:00:00' });
});
after(() => { try { db.close(); } catch (e) { /* đã đóng */ } });

const DAY = { from: '2026-10-21', to: '2026-10-21' };
const lay = (q) => QQ.layLuotQuyThoiGian(db, { ...DAY, page_size: '200', ...q });
const shbg = (kq) => kq.items.map((i) => i.shbg);
const THU_TU = ['SX0003VN', 'SX0001VN', 'SX0002VN', 'SX0005VN', 'SX0004VN', 'SX0006VN', 'SX0007VN', 'SX0009VN', 'SX0008VN', 'SX0010VN', 'SX0011VN'];

test('dữ liệu giả đúng như thiết kế: 5 lượt có quỹ, 2 lượt quỹ null, 4 lượt nghi ngờ', () => {
  const kq = lay();
  assert.equal(kq.items.length, LUOT.length);
  const th = (s) => kq.items.find((i) => i.shbg === s);
  for (const s of ['SX0001VN', 'SX0002VN', 'SX0003VN', 'SX0004VN', 'SX0005VN']) assert.deepEqual([th(s).nghiNgo, th(s).quyConLaiGiay !== null], [false, true], s);
  for (const s of ['SX0006VN', 'SX0007VN']) assert.deepEqual([th(s).nghiNgo, th(s).quyConLaiGiay], [false, null], s);
  for (const s of ['SX0008VN', 'SX0009VN', 'SX0010VN']) assert.deepEqual([th(s).nghiNgo, th(s).quyConLaiGiay.F1_3 < 0], [true, true], s);
  assert.deepEqual([th('SX0011VN').nghiNgo, th('SX0011VN').quyConLaiGiay], [true, null]);
  assert.ok(th('SX0009VN').quyConLaiGiay.F1_3 < th('SX0008VN').quyConLaiGiay.F1_3);
  assert.equal(th('SX0008VN').quyConLaiGiay.F1_3, th('SX0010VN').quyConLaiGiay.F1_3);
  assert.ok(th('SX0003VN').quyConLaiGiay.F1_3 < 0 && th('SX0003VN').quyConLaiGiay.F1_3 > th('SX0008VN').quyConLaiGiay.F1_3); // lượt thường quỹ âm vẫn nông hơn lượt nghi ngờ
  assert.equal(th('SX0002VN').quyConLaiGiay.F1_3, th('SX0005VN').quyConLaiGiay.F1_3); // hòa quỹ, phân theo shbg
});

test('thứ tự: A (có quỹ, tăng dần) -> B (quỹ null) -> C (nghi ngờ: quỹ tăng dần, null cuối), hòa theo shbg', () => {
  const kq = lay();
  assert.deepEqual(shbg(kq), THU_TU);
  // nghi ngờ chỉ ở CUỐI: không lượt thường nào đứng sau một lượt nghi ngờ
  const dau = kq.items.findIndex((i) => i.nghiNgo);
  assert.ok(kq.items.slice(0, dau).every((i) => !i.nghiNgo));
  assert.ok(kq.items.slice(dau).every((i) => i.nghiNgo));
  assert.deepEqual(lay(), lay()); // xác định
});

test('phân trang qua ranh giới nhóm: trang cuối chứa nhóm C, ghép các trang = danh sách đầy đủ, không trùng / sót', () => {
  for (const size of [1, 2, 3, 4, 5, 7]) {
    const p1 = lay({ page_size: String(size), page: '1' });
    assert.equal(p1.pagination.total, LUOT.length);
    assert.equal(p1.pagination.total_pages, Math.ceil(LUOT.length / size));
    const ghep = [];
    for (let p = 1; p <= p1.pagination.total_pages; p++) ghep.push(...shbg(lay({ page_size: String(size), page: String(p) })));
    assert.deepEqual(ghep, THU_TU, `page_size=${size}`);
  }
  const cuoi = lay({ page_size: '3', page: '4' });
  assert.deepEqual(shbg(cuoi), ['SX0010VN', 'SX0011VN']); // trang cuối toàn nhóm C
  assert.ok(cuoi.items.every((i) => i.nghiNgo));
  assert.deepEqual(shbg(lay({ page_size: '3', page: '3' })), ['SX0007VN', 'SX0009VN', 'SX0008VN']); // trang giữa vắt qua B -> C
  assert.deepEqual(lay({ page_size: '3', page: '99' }).items, []);
});

test('bộ lọc phối hợp: nghi_ngo=1 chỉ nghi ngờ, nghi_ngo=0 loại nghi ngờ; thứ tự trong kết quả lọc theo quy tắc nhóm', () => {
  assert.deepEqual(shbg(lay({ nghi_ngo: '1' })), ['SX0009VN', 'SX0008VN', 'SX0010VN', 'SX0011VN']);
  assert.deepEqual(shbg(lay({ nghi_ngo: '0' })), ['SX0003VN', 'SX0001VN', 'SX0002VN', 'SX0005VN', 'SX0004VN', 'SX0006VN', 'SX0007VN']);
  assert.equal(lay({ nghi_ngo: '1' }).pagination.total, 4);
  assert.equal(lay({ nghi_ngo: '0' }).pagination.total, 7);
  assert.deepEqual(shbg(lay({ nghi_ngo: '1', trang_thai: 'DO_DUOC' })), ['SX0009VN', 'SX0008VN', 'SX0010VN']);
  assert.deepEqual(shbg(lay({ nghi_ngo: '1', page_size: '2', page: '2' })), ['SX0010VN', 'SX0011VN']);
});

test('cache: sắp lại không đổi khóa / số lần tính; mọi trang và bộ lọc của cùng khung dùng MỘT danh sách đã sắp', () => {
  CACHE.xoaCache();
  const t0 = Date.now();
  const q = { ...DAY, page_size: '200' };
  const a = CACHE.luot(db, q, t0);
  assert.deepEqual(a.items.map((i) => i.shbg), THU_TU);
  assert.deepEqual(CACHE.thongKe(), { tong: 0, danh_sach: 1 });
  const b = CACHE.luot(db, { ...q, page_size: '3', page: '4' }, t0 + 1);
  const c = CACHE.luot(db, { ...q, nghi_ngo: '1' }, t0 + 2);
  assert.deepEqual(b.items.map((i) => i.shbg), ['SX0010VN', 'SX0011VN']);
  assert.deepEqual(c.items.map((i) => i.shbg), ['SX0009VN', 'SX0008VN', 'SX0010VN', 'SX0011VN']);
  assert.equal(b.items[0], a.items.find((i) => i.shbg === 'SX0010VN')); // cùng đối tượng trong cache, không tính lại
  assert.deepEqual(CACHE.thongKe(), { tong: 0, danh_sach: 1 });
  assert.equal(CACHE.khoaKhung(QQ.docThamSo(q, { coPhanTrang: true }).f), 'qtg1|2026-10-21 00:00:00|2026-10-21 23:59:59||'); // chữ ký cache không đổi
  // danh sách trong cache không bị sửa tại chỗ: tổng hợp (cùng danh sách) vẫn đúng
  const th = CACHE.tongHop(db, DAY, t0 + 3);
  assert.equal(th.tong.tong_shbg, LUOT.length);
  assert.equal(th.tong.nghi_ngo, 4);
  assert.deepEqual(a.items.map((i) => i.shbg), THU_TU);
  CACHE.xoaCache();
  // thời gian /luot lạnh trên DB giả quy mô nhỏ (chỉ để báo cáo, không đặt ngưỡng)
  const t = process.hrtime.bigint();
  QQ.layLuotQuyThoiGian(db, q);
  console.log(`# QUYTG-9d: /luot lạnh ${LUOT.length} lượt giả = ${Number(process.hrtime.bigint() - t) / 1e6} ms`);
});
