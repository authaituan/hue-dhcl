// ==========================================
// Test QUYTG-4: lõi truy vấn server/lib/quyThoiGianQuery.js trên DB RAM + dữ liệu GIẢ (mã BCVH 539999 / 538888, SHBG và BD10 giả). Không server, không mạng.
// Đo hiệu năng ~130.000 dòng giả: chỉ chạy khi đặt QTG_PERF=1 (không đặt ngưỡng cứng).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureArrivalSchema, deriveArrival } = require('../server/lib/arrivalsImport');
const aq = require('../server/lib/arrivalsQuery');
const QQ = require('../server/lib/quyThoiGianQuery');
const N = require('../server/lib/quyThoiGianNhom');

const BC = '539999';
const BC2 = '538888';
let db;
let idDong = 0;

function taoDb() {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  d.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT); CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, new_ward_name TEXT)'); // aq.buildCountedCte / aq.summary đọc danh mục (để rỗng)
  d.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,?,?,?,?,1,'x','OK')")
    .run(BC, 'f.csv', '2026-10-21', '093012');
  return d;
}
const insSql = `INSERT INTO arrival_items (id, import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
  bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
  VALUES (@id, 1, @recv, @trk, @bd10, '', @bag, @item, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @arrival_evidence_count, @bag_date, @bd10_date, @item_date)`;
function them(stmt, o) {
  const it = deriveArrival({ bag_confirmed_at: o.bag ?? null, item_confirmed_at: o.item ?? null, bd10_confirmed_at: o.xnd ?? null });
  stmt.run({
    id: ++idDong, recv: o.recv ?? BC, trk: o.trk, bd10: o.bd10 ?? '', bag: o.bag ?? null, item: o.item ?? null, xnd: o.xnd ?? null, ktt: o.ktt ?? null,
    arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis, arrival_date: it.arrival_date, arrival_evidence_count: it.arrival_evidence_count,
    bag_date: o.bag ? o.bag.slice(0, 10) : null, bd10_date: o.xnd ? o.xnd.slice(0, 10) : null, item_date: o.item ? o.item.slice(0, 10) : null
  });
}

const KTT_B = (n) => `530100${BC}6102${n}`;
const KHAC_B = (n) => `531120${BC}6102${n}`;
const NGOAI_B = (n) => `700916${BC}6102${n}`;

before(() => {
  db = taoDb();
  const st = db.prepare(insSql);
  const T = (o) => them(st, o);
  // 1. Đo được (ví dụ chuẩn)
  T({ trk: 'QT0001VN', bd10: KTT_B(11), bag: '2026-10-21 07:40:00', xnd: '2026-10-21 07:45:14', ktt: '2026-10-20 15:25:00' });
  // 2. Số âm: KTT sau XNĐ
  T({ trk: 'QT0002VN', bd10: KTT_B(12), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 11:00:00' });
  // 3-5. KTT trống ở ba nhóm
  T({ trk: 'QT0003VN', bd10: KTT_B(13), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' });
  T({ trk: 'QT0004VN', bd10: KHAC_B(14), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' });
  T({ trk: 'QT0005VN', bd10: NGOAI_B(15), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' });
  // 6. XNĐ trống
  T({ trk: 'QT0006VN', bd10: KTT_B(16), bag: '2026-10-21 09:00:00', ktt: '2026-10-21 06:00:00' });
  // 7. BD10 lập đi tại BCVH (6 ký tự đầu = mã BCVH nhận)
  T({ trk: 'QT0007VN', bd10: `${BC}530100610203`, bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 06:00:00' });
  // 8-9. BD10 rỗng / ngắn
  T({ trk: 'QT0008VN', bd10: '', bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 06:00:00' });
  T({ trk: 'QT0009VN', bd10: '53012', bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 06:00:00' });
  // 10. Nghi ngờ: KTT trước XNĐ 11 ngày
  T({ trk: 'QT0010VN', bd10: KTT_B(20), bag: '2026-10-21 07:50:00', xnd: '2026-10-21 08:00:00', ktt: '2026-10-10 08:00:00' });
  // 11. Nhiều dòng cùng BCVH: dòng đại diện (túi sớm nhất, XNĐ trống) khác dòng đo (XNĐ sớm nhất)
  T({ trk: 'QT0011VN', bd10: KHAC_B(21), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 10:00:00', ktt: '2026-10-21 06:00:00' }); // A: XNĐ muộn
  T({ trk: 'QT0011VN', bd10: NGOAI_B(22), bag: '2026-10-21 07:30:00', xnd: '2026-10-21 08:00:00', ktt: '2026-10-20 23:00:00' }); // B: XNĐ sớm nhất -> dòng đo
  T({ trk: 'QT0011VN', bd10: KTT_B(23), bag: '2026-10-21 07:00:00', ktt: '2026-10-19 08:00:00' }); // C: đại diện (túi 07:00) nhưng XNĐ trống -> bị bỏ qua
  // 12. Nhiều dòng, không dòng nào có XNĐ -> dòng đại diện, xnd = null
  T({ trk: 'QT0012VN', bd10: KTT_B(24), bag: '2026-10-21 08:00:00', ktt: '2026-10-21 05:00:00' });
  T({ trk: 'QT0012VN', bd10: NGOAI_B(25), bag: '2026-10-21 09:00:00' });
  // 13. Biên khung ngày: 20/10 23:59:59 và 22/10 00:00:00 nằm ngoài khung 21/10
  T({ trk: 'QT0013VN', bd10: KTT_B(26), bag: '2026-10-20 23:59:59', xnd: '2026-10-21 00:10:00', ktt: '2026-10-20 12:00:00' });
  T({ trk: 'QT0014VN', bd10: KTT_B(27), bag: '2026-10-22 00:00:00', xnd: '2026-10-22 00:10:00', ktt: '2026-10-21 12:00:00' });
  // 15. BCVH thứ hai
  T({ trk: 'QT0015VN', recv: BC2, bd10: `530100${BC2}610221`, bag: '2026-10-21 08:00:00', xnd: '2026-10-21 09:00:00', ktt: '2026-10-21 07:00:00' });
  T({ trk: 'QT0016VN', recv: BC2, bd10: `531120${BC2}610222`, bag: '2026-10-21 08:00:00', xnd: '2026-10-21 09:00:00' });
});
after(() => { try { db.close(); } catch (e) { /* đã đóng */ } });

const DAY = { from: '2026-10-21', to: '2026-10-21' };
const lay = (q) => QQ.layLuotQuyThoiGian(db, { ...DAY, page_size: '200', ...q });
const theo = (kq, shbg) => kq.items.find((i) => i.shbg === shbg);

test('khớp «Sản lượng đến» cho cùng bộ lọc', () => {
  for (const q of [{ ...DAY }, { ...DAY, receiver_code: BC }, { ...DAY, receiver_code: BC2 }, { from: '2026-10-20', to: '2026-10-22' }, { from: '2026-10-21 08:00', to: '2026-10-21 09:00' },
    { from: '2026-10-20', to: '2026-10-22', receiver_code: `${BC},${BC2}` }]) {
    const f = aq.parseFilters(q, { allowed: ['from', 'to', 'receiver_code'] });
    const san = aq.summary(db, f, { isAdmin: false }).san_luong;
    const th = QQ.tongHopQuyThoiGian(db, q);
    assert.equal(th.tong.tong_shbg, san, JSON.stringify(q));
    assert.equal(QQ.layLuotQuyThoiGian(db, { ...q, page_size: '1' }).pagination.total, san);
  }
  assert.equal(QQ.tongHopQuyThoiGian(db, { from: '2026-10-20', to: '2026-10-22' }).tong.tong_shbg, 16);
});

test('đo được: ví dụ chuẩn, quỹ 27.586 / 22.186 / 18.586', () => {
  const l = theo(lay(), 'QT0001VN');
  assert.equal(l.receiver_code, BC);
  assert.equal(l.nhom, 'KTT');
  assert.equal(l.trangThai, 'DO_DUOC');
  assert.equal(l.lyDo, null);
  assert.equal(l.ktt, '2026-10-20 15:25:00');
  assert.equal(l.xnd, '2026-10-21 07:45:14');
  assert.equal(l.thoiGianThucGiay, 22814);
  assert.deepEqual(l.quyConLaiGiay, { F1_3: 27586, F4_1: 22186, F4_2: 18586 });
  assert.equal(l.nghiNgo, false);
});

test('số âm, KTT trống ở 3 nhóm, XNĐ trống, lập đi, rỗng / ngắn, nghi ngờ', () => {
  const kq = lay();
  const am = theo(kq, 'QT0002VN');
  assert.deepEqual([am.trangThai, am.lyDo, am.thoiGianThucGiay, am.quyConLaiGiay], ['AM', 'KTT_SAU_XND_BCVH', -5400, null]);
  assert.deepEqual([theo(kq, 'QT0003VN').nhom, theo(kq, 'QT0003VN').lyDo], ['KTT', 'THIEU_XAC_NHAN_KTT']);
  assert.deepEqual([theo(kq, 'QT0004VN').nhom, theo(kq, 'QT0004VN').lyDo], ['NOI_TINH_KHAC', 'KHONG_QUA_KTT']);
  assert.deepEqual([theo(kq, 'QT0005VN').nhom, theo(kq, 'QT0005VN').trangThai, theo(kq, 'QT0005VN').lyDo, theo(kq, 'QT0005VN').thoiGianThucGiay], ['NGOAI_53', 'DO_DUOC', null, 0]); // QUYTG-7a: ngoài 53 đo từ XNĐ BCVH, không còn «không đo được»
  const thieuXnd = theo(kq, 'QT0006VN');
  assert.deepEqual([thieuXnd.nhom, thieuXnd.trangThai, thieuXnd.lyDo, thieuXnd.xnd, thieuXnd.ktt], ['KTT', 'KHONG_DO_DUOC', 'THIEU_XND_BCVH', null, '2026-10-21 06:00:00']);
  assert.deepEqual([theo(kq, 'QT0007VN').nhom, theo(kq, 'QT0007VN').lyDo], ['LAP_DI_TAI_BCVH', 'LAP_DI_TAI_BCVH']);
  assert.deepEqual([theo(kq, 'QT0008VN').nhom, theo(kq, 'QT0008VN').lyDo], ['RONG', 'KHONG_CO_BD10']);
  assert.deepEqual([theo(kq, 'QT0009VN').nhom, theo(kq, 'QT0009VN').lyDo], ['KHONG_HOP_LE', 'BD10_KHONG_HOP_LE']);
  const nn = theo(kq, 'QT0010VN');
  assert.deepEqual([nn.trangThai, nn.nghiNgo, typeof nn.thoiGianThucGiay], ['DO_DUOC', true, 'number']);
  assert.equal(nn.lyDo, null);
});

test('SHBG nhiều dòng cùng BCVH: đo theo dòng XNĐ sớm nhất, KTT và BD10 của chính dòng đó; dòng XNĐ trống bị bỏ qua', () => {
  const l = theo(lay(), 'QT0011VN');
  assert.equal(l.bd10_no, NGOAI_B(22)); // không phải dòng A (XNĐ muộn) cũng không phải dòng C (đại diện, XNĐ trống)
  assert.equal(l.nhom, 'NGOAI_53');
  assert.equal(l.ktt, '2026-10-20 23:00:00'); // KTT của dòng B, không phải 06:00 (A) hay 19/10 (C)
  assert.equal(l.xnd, '2026-10-21 08:00:00');
  assert.equal(l.thoiGianThucGiay, 0); // QUYTG-7a: ngoài 53 đo từ XNĐ BCVH nên bỏ qua KTT (23:00 hôm trước) -> 0
  assert.equal(l.trangThai, 'DO_DUOC');
  // không dòng nào có XNĐ -> dòng đại diện (túi sớm nhất), xnd = null
  const k = theo(lay(), 'QT0012VN');
  assert.deepEqual([k.bd10_no, k.nhom, k.xnd, k.trangThai, k.lyDo], [KTT_B(24), 'KTT', null, 'KHONG_DO_DUOC', 'THIEU_XND_BCVH']);
  // mỗi SHBG chỉ một lượt
  const ds = lay().items.map((i) => i.shbg);
  assert.equal(new Set(ds).size, ds.length);
});

test('bộ lọc: receiver_code, khoảng ngày (biên), nhom / trang_thai / ly_do', () => {
  assert.ok(lay({ receiver_code: BC2 }).items.every((i) => i.receiver_code === BC2));
  assert.equal(lay({ receiver_code: BC2 }).pagination.total, 2);
  assert.equal(lay({ receiver_code: `${BC},${BC2}` }).pagination.total, lay().pagination.total);
  assert.equal(lay({ receiver_code: BC }).pagination.total, 12);
  // 20/10 23:59:59 chỉ lọt khi from <= 20/10; 22/10 00:00:00 chỉ lọt khi to >= 22/10
  const ds = (q) => lay(q).items.map((i) => i.shbg);
  assert.ok(!ds().includes('QT0013VN') && !ds().includes('QT0014VN'));
  assert.ok(ds({ from: '2026-10-20' }).includes('QT0013VN'));
  assert.ok(ds({ to: '2026-10-22' }).includes('QT0014VN'));
  assert.ok(!ds({ from: '2026-10-20', to: '2026-10-20 23:59' }).includes('QT0013VN')); // to = 23:59:00 < 23:59:59
  assert.ok(ds({ from: '2026-10-20 23:59', to: '2026-10-21 00:00' }).includes('QT0013VN')); // 23:59:59 nằm trong [23:59:00, 00:00:00]
  assert.ok(lay({ nhom: 'KTT' }).items.every((i) => i.nhom === 'KTT'));
  assert.ok(lay({ trang_thai: 'AM' }).items.every((i) => i.trangThai === 'AM'));
  assert.equal(lay({ trang_thai: 'AM' }).pagination.total, 1);
  assert.ok(lay({ ly_do: 'THIEU_XND_BCVH' }).items.every((i) => i.lyDo === 'THIEU_XND_BCVH'));
  assert.equal(lay({ ly_do: 'THIEU_XND_BCVH' }).pagination.total, 2);
  assert.equal(lay({ nhom: 'KTT', trang_thai: 'KHONG_DO_DUOC' }).pagination.total, 3);
  // date_basis do người gọi truyền bị bỏ qua
  assert.equal(lay({ date_basis: 'bag' }).pagination.total, lay().pagination.total);
  assert.equal(lay({ date_basis: 'khong-hop-le' }).pagination.total, lay().pagination.total);
});

test('tham số sai -> QueryParamError', () => {
  const sai = [{ nhom: 'XYZ' }, { trang_thai: 'xyz' }, { ly_do: 'XYZ' }, { nhom: ['KTT', 'RONG'] }, { page: '0' }, { page_size: '201' }, { khoa_la: '1' }, { receiver_code: 'abc' },
    { from: 'hôm qua' }, { from: '2026-10-22', to: '2026-10-21' }];
  for (const q of sai) assert.throws(() => lay(q), QQ.QueryParamError, JSON.stringify(q));
  assert.throws(() => QQ.layLuotQuyThoiGian(db, { to: '2026-10-21' }), QQ.QueryParamError); // thiếu from
  assert.throws(() => QQ.tongHopQuyThoiGian(db, { ...DAY, nhom: 'KTT' }), QQ.QueryParamError);
  assert.throws(() => QQ.tongHopQuyThoiGian(db, { ...DAY, page: '1' }), QQ.QueryParamError);
  assert.throws(() => QQ.tongHopQuyThoiGian(db, undefined), QQ.QueryParamError);
});

test('phân trang và sắp xếp ổn định (quỹ F1_3 tăng dần, null cuối, hòa theo shbg)', () => {
  const tat = lay().items;
  const khoa = (l) => (l.quyConLaiGiay ? l.quyConLaiGiay.F1_3 : null);
  const coSo = tat.filter((l) => khoa(l) !== null);
  const khongSo = tat.filter((l) => khoa(l) === null);
  assert.deepEqual(tat.slice(0, coSo.length), coSo); // mọi lượt có quỹ đứng trước mọi lượt null
  for (let i = 1; i < coSo.length; i++) assert.ok(khoa(coSo[i - 1]) <= khoa(coSo[i]));
  for (let i = 1; i < khongSo.length; i++) assert.ok(khongSo[i - 1].shbg <= khongSo[i].shbg);
  // ghép các trang = danh sách đầy đủ, không trùng / sót
  const p1 = lay({ page_size: '5', page: '1' });
  assert.equal(p1.pagination.total, tat.length);
  assert.equal(p1.pagination.total_pages, Math.ceil(tat.length / 5));
  const ghep = [];
  for (let p = 1; p <= p1.pagination.total_pages; p++) ghep.push(...lay({ page_size: '5', page: String(p) }).items);
  assert.deepEqual(ghep, tat);
  assert.deepEqual(lay({ page_size: '5', page: '99' }).items, []);
  // lặp lại cho cùng kết quả
  assert.deepEqual(lay(), lay());
});

test('tổng hợp: bất biến', () => {
  for (const q of [{ ...DAY }, { ...DAY, receiver_code: BC }, { from: '2026-10-20', to: '2026-10-22' }]) {
    const t = QQ.tongHopQuyThoiGian(db, q);
    const nhoms = Object.values(t.theo_nhom);
    assert.deepEqual(Object.keys(t.theo_nhom).sort(), ['KHONG_HOP_LE', 'KTT', 'LAP_DI_TAI_BCVH', 'NGOAI_53', 'NOI_TINH_KHAC', 'RONG']);
    assert.equal(nhoms.reduce((a, x) => a + x.tong_shbg, 0), t.tong.tong_shbg);
    assert.equal(t.theo_bcvh.reduce((a, x) => a + x.tong_shbg, 0), t.tong.tong_shbg);
    for (const d of [t.tong, ...nhoms, ...t.theo_bcvh]) {
      assert.equal(d.do_duoc + d.am + d.khong_do_duoc, d.tong_shbg);
      assert.ok(d.chinh <= d.do_duoc);
      assert.equal(Object.values(d.khong_do_duoc_theo_ly_do).reduce((a, x) => a + x, 0), d.khong_do_duoc);
    }
    assert.equal(nhoms.reduce((a, x) => a + x.chinh, 0), t.tong.chinh);
    for (const k of ['F1_3', 'F4_1', 'F4_2']) {
      assert.equal(t.chi_tieu.tong[k].con_quy + t.chi_tieu.tong[k].het_quy, t.tong.chinh);
      for (const [nh, c] of Object.entries(t.chi_tieu.theo_nhom)) assert.equal(c[k].con_quy + c[k].het_quy, t.theo_nhom[nh].chinh, `${nh} ${k}`);
    }
    for (const nh of ['LAP_DI_TAI_BCVH', 'RONG', 'KHONG_HOP_LE']) {
      assert.equal(t.theo_nhom[nh].chinh, 0);
      assert.equal(t.chi_tieu.theo_nhom[nh].F1_3.con_quy + t.chi_tieu.theo_nhom[nh].F1_3.het_quy, 0);
      assert.equal(t.chi_tieu.theo_nhom[nh].thoi_gian_thuc_trung_vi_giay, null);
    }
  }
});

test('tổng hợp: số cụ thể trên bộ giả (21/10, cả hai BCVH)', () => {
  const t = QQ.tongHopQuyThoiGian(db, DAY);
  assert.equal(t.tong.tong_shbg, 14); // QT0001-QT0012 (BCVH 1) + QT0015, QT0016 (BCVH 2); QT0013 (20/10) và QT0014 (22/10) nằm ngoài khung
});

test('tổng hợp: BCVH và nhóm, trung vị', () => {
  const t = QQ.tongHopQuyThoiGian(db, { ...DAY, receiver_code: BC });
  assert.deepEqual(t.theo_bcvh.map((b) => b.receiver_code), [BC]);
  const tong = QQ.tongHopQuyThoiGian(db, DAY);
  assert.deepEqual(tong.theo_bcvh.map((b) => b.receiver_code), [BC2, BC]);
  assert.equal(tong.theo_nhom.LAP_DI_TAI_BCVH.tong_shbg, 1);
  assert.equal(tong.theo_nhom.RONG.tong_shbg, 1);
  assert.equal(tong.theo_nhom.KHONG_HOP_LE.tong_shbg, 1);
  assert.equal(tong.tong.am, 1);
  assert.equal(tong.tong.nghi_ngo, 1);
  // lượt chinh: QT0001 (22814), QT0005 (0, ngoài 53), QT0011 (0, ngoài 53), QT0015 (BC2: KTT 07:00→XNĐ 09:00 = 7200) ; QT0010 nghi ngờ nên không chinh
  assert.equal(tong.tong.chinh, 4);
  assert.equal(tong.chi_tieu.tong.thoi_gian_thuc_trung_vi_giay, 3600); // trung vị của [0, 0, 7200, 22814]
  assert.deepEqual(tong.chi_tieu.tong.F1_3, { con_quy: 4, het_quy: 0 });
  assert.equal(tong.chi_tieu.theo_nhom.KTT.thoi_gian_thuc_trung_vi_giay, (22814 + 7200) / 2);
  assert.equal(tong.chi_tieu.theo_nhom.NGOAI_53.thoi_gian_thuc_trung_vi_giay, 0);
});

test('hết quỹ: lượt chinh với F4_2 âm còn F1_3 dương', () => {
  const d = taoDb();
  const st = d.prepare(insSql);
  idDong += 1000;
  them(st, { trk: 'QT0101VN', bd10: KTT_B(31), bag: '2026-10-21 19:40:00', xnd: '2026-10-21 19:31:00', ktt: '2026-10-21 08:00:00' }); // XNĐ 19:31 -> thực 41.460 s
  const t = QQ.tongHopQuyThoiGian(d, DAY);
  assert.equal(t.tong.chinh, 1);
  assert.deepEqual(t.chi_tieu.tong.F1_3, { con_quy: 1, het_quy: 0 });
  assert.deepEqual(t.chi_tieu.tong.F4_1, { con_quy: 1, het_quy: 0 });
  assert.deepEqual(t.chi_tieu.tong.F4_2, { con_quy: 0, het_quy: 1 });
  assert.equal(t.chi_tieu.tong.thoi_gian_thuc_trung_vi_giay, 41460);
  d.close();
});

test('DB rỗng: đủ khóa, toàn 0', () => {
  const d = taoDb();
  const t = QQ.tongHopQuyThoiGian(d, DAY);
  assert.equal(t.tong.tong_shbg, 0);
  assert.deepEqual(t.theo_bcvh, []);
  assert.equal(Object.keys(t.theo_nhom).length, 6);
  assert.equal(t.chi_tieu.tong.thoi_gian_thuc_trung_vi_giay, null);
  assert.deepEqual(QQ.layLuotQuyThoiGian(d, DAY).items, []);
  d.close();
});

// ------------------------------------------
// Hiệu năng (QTG_PERF=1): ~130.000 dòng giả, hạt giống cố định
// ------------------------------------------
test('hiệu năng ~130.000 dòng giả (QTG_PERF=1)', { skip: !process.env.QTG_PERF }, () => {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  d.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT); CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, new_ward_name TEXT)');
  d.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,'539991','f.csv','2026-10-15','093012',1,'x','OK')").run();
  let seed = 123456789;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p2 = (n) => String(n).padStart(2, '0');
  const gio = (ngay, giay) => { const g = Math.floor(giay); return `2026-10-${p2(ngay)} ${p2(Math.floor(g / 3600))}:${p2(Math.floor((g % 3600) / 60))}:${p2(g % 60)}`; };
  const bcvhs = ['539991', '539992', '539993', '539994', '539995', '539996'];
  const st = d.prepare(insSql);
  const SO_DONG = 130000;
  let nSo = 0;
  let dem = 0;
  d.exec('BEGIN');
  while (dem < SO_DONG) {
    nSo++;
    const trk = `PF${String(nSo).padStart(9, '0')}VN`;
    const recv = bcvhs[Math.floor(rnd() * 6)];
    const ngay = 1 + Math.floor(rnd() * 30);
    const bagS = 6 * 3600 + rnd() * 13 * 3600;
    const soDong = rnd() < 0.12 ? 2 : 1;
    for (let i = 0; i < soDong && dem < SO_DONG; i++, dem++) {
      const u = rnd();
      let bd10 = u < 0.45 ? `530100${recv}6${String(dem).padStart(6, '0')}` : u < 0.62 ? `${recv}531120${String(dem).padStart(6, '0')}` : u < 0.82 ? `5311${p2(Math.floor(rnd() * 90))}${recv}${String(dem).padStart(5, '0')}`
        : u < 0.95 ? `7009${p2(Math.floor(rnd() * 90))}${recv}${String(dem).padStart(5, '0')}` : u < 0.98 ? '' : '53012';
      if (i > 0 && (bd10 === '' || bd10 === '53012')) bd10 = `7009${String(dem).padStart(8, '0')}`; // khóa duy nhất (SHBG, BD10, BD8, giờ XN BG)
      const coXnd = rnd() < 0.9;
      const xndS = bagS + 600 + rnd() * 3 * 3600;
      const coKtt = rnd() < 0.85;
      const lech = rnd() < 0.01; // 1%: mốc KTT quá cũ (nghi ngờ)
      const xnd = coXnd ? gio(ngay, xndS) : null;
      const ktt = coKtt ? (lech ? gio(Math.max(1, ngay - 12), 3600) : gio(ngay, Math.max(0, xndS - 3600 - rnd() * 20 * 3600))) : null;
      them(st, { trk, recv, bd10, bag: gio(ngay, bagS + i * 60), xnd, ktt });
    }
  }
  d.exec('COMMIT');
  const q = { from: '2026-10-01', to: '2026-10-31' };
  const t0 = process.hrtime.bigint();
  const luot = QQ.layLuotQuyThoiGian(d, { ...q, page_size: '200' });
  const t1 = process.hrtime.bigint();
  const th = QQ.tongHopQuyThoiGian(d, q);
  const t2 = process.hrtime.bigint();
  const san = aq.summary(d, aq.parseFilters(q, { allowed: ['from', 'to'] }), { isAdmin: false }).san_luong;
  const t3 = process.hrtime.bigint();
  const ms = (a, b) => Math.round(Number(b - a) / 1e6);
  console.log(`[QTG_PERF] ${dem} dòng, ${nSo} SHBG: layLuot ${ms(t0, t1)} ms (items=${luot.items.length}/${luot.pagination.total}); tongHop ${ms(t1, t2)} ms; aq.summary ${ms(t2, t3)} ms`);
  assert.equal(th.tong.tong_shbg, san);
  assert.equal(luot.pagination.total, san);
  assert.equal(th.tong.do_duoc + th.tong.am + th.tong.khong_do_duoc, th.tong.tong_shbg);
  d.close();
});
