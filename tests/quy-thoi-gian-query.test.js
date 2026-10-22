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

// ------------------------------------------
// QUYTG-7: dải thời gian còn lại, đường thư, khung giờ, theo ngày (DB riêng, dữ liệu GIẢ; ngày 21/10, riêng DI0016 ở 23/10)
// ------------------------------------------
let dbDai = null;
function dungDbDai() {
  if (dbDai) return dbDai;
  const d = taoDb();
  const st = d.prepare(insSql);
  const upd = d.prepare('UPDATE arrival_items SET route_name = ?, ward_name = ? WHERE id = ?');
  const T = (o) => { them(st, { ...o, bag: o.xnd }); upd.run(o.duong ?? '', o.phuong ?? '', idDong); }; // bag = xnd: ngày đến = ngày XNĐ
  const BC3 = '533140';
  T({ trk: 'DI0001VN', bd10: KTT_B(41), ktt: '2026-10-20 07:00:00', xnd: '2026-10-21 07:00:01', duong: 'Đường thư 1' }); // quỹ -1
  T({ trk: 'DI0002VN', bd10: KTT_B(42), ktt: '2026-10-20 07:00:00', xnd: '2026-10-21 07:00:00', duong: 'Đường thư 1' }); // quỹ 0
  T({ trk: 'DI0003VN', bd10: KTT_B(43), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 19:00:01', duong: 'Đường thư 2' }); // quỹ 7.199
  T({ trk: 'DI0004VN', bd10: KTT_B(44), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 19:00:00', duong: 'Đường thư 2' }); // quỹ 7.200
  T({ trk: 'DI0005VN', bd10: KTT_B(45), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 15:00:01', duong: 'Đường thư 1' }); // quỹ 21.599
  T({ trk: 'DI0006VN', bd10: KTT_B(46), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 15:00:00', duong: 'Đường thư 3' }); // quỹ 21.600
  T({ trk: 'DI0007VN', bd10: KTT_B(47), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 09:59:59', duong: 'Đường thư 3' }); // khung Trước 10h
  T({ trk: 'DI0008VN', bd10: KTT_B(48), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 10:00:00', duong: 'Đường thư 3' }); // khung 10–12h
  T({ trk: 'DI0009VN', bd10: KTT_B(49), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 17:59:59', duong: 'Đường thư 3' }); // khung 16–18h, quỹ 10.801
  T({ trk: 'DI0010VN', bd10: KTT_B(50), ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 18:00:00', duong: 'Đường thư 3' }); // khung Sau 18h, quỹ 10.800
  T({ trk: 'DI0011VN', bd10: NGOAI_B(51), xnd: '2026-10-21 12:30:00', duong: '   ' }); // nhận trực tiếp, đường thư rỗng
  T({ trk: 'DI0012VN', bd10: KTT_B(52), ktt: '2026-10-21 11:00:00', xnd: '2026-10-21 09:30:00', duong: 'Đường thư 1' }); // số âm
  T({ trk: 'DI0013VN', bd10: KTT_B(53), ktt: '2026-10-10 08:00:00', xnd: '2026-10-21 08:00:00', duong: 'Đường thư 1' }); // nghi ngờ
  T({ trk: 'DI0014VN', bd10: KTT_B(54), xnd: '2026-10-21 09:00:00', duong: 'Đường thư 1' }); // thiếu KTT
  T({ trk: 'DI0015VN', recv: BC2, bd10: `530100${BC2}610241`, ktt: '2026-10-20 07:00:00', xnd: '2026-10-21 07:00:01', duong: 'Đường thư 2' }); // quá hạn ở BCVH 2
  T({ trk: 'DI0016VN', bd10: KTT_B(55), ktt: '2026-10-23 07:00:00', xnd: '2026-10-23 08:00:00', duong: 'Đường thư 1' }); // ngày 23/10
  T({ trk: 'DI0017VN', recv: BC3, bd10: `530100${BC3}610242`, ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 08:00:00', duong: 'Đường thư 1' }); // phường trống ở BCVH có ngoại lệ
  T({ trk: 'DI0018VN', recv: BC3, bd10: `530100${BC3}610243`, ktt: '2026-10-21 07:00:00', xnd: '2026-10-21 08:00:00', duong: 'Đường thư 1', phuong: 'Thuận Hóa' }); // phường có ngoại lệ (12 giờ)
  dbDai = d;
  return d;
}
after(() => { try { if (dbDai) dbDai.close(); } catch (e) { /* đã đóng */ } });
const layDai = (q) => QQ.layLuotQuyThoiGian(dungDbDai(), { ...DAY, page_size: '200', ...q });
const byShbg = (kq, shbg) => kq.items.find((i) => i.shbg === shbg);

test('QUYTG-7: biên dải thời gian còn lại (-1, 0, 7.199, 7.200, 21.599, 21.600 giây)', () => {
  assert.deepEqual([-1, 0, 7199, 7200, 21599, 21600, 50400].map(QQ.daiCua), ['QUA_HAN', 'SAP_HET', 'SAP_HET', 'CON_2_6', 'CON_2_6', 'CON_TREN_6', 'CON_TREN_6']);
  assert.deepEqual(QQ.DAI, ['QUA_HAN', 'SAP_HET', 'CON_2_6', 'CON_TREN_6']);
  const kq = layDai();
  const dai = (s) => [byShbg(kq, s).quyConLaiGiay.F1_3, byShbg(kq, s).dai];
  assert.deepEqual(dai('DI0001VN'), [-1, 'QUA_HAN']);
  assert.deepEqual(dai('DI0002VN'), [0, 'SAP_HET']);
  assert.deepEqual(dai('DI0003VN'), [7199, 'SAP_HET']);
  assert.deepEqual(dai('DI0004VN'), [7200, 'CON_2_6']);
  assert.deepEqual(dai('DI0005VN'), [21599, 'CON_2_6']);
  assert.deepEqual(dai('DI0006VN'), [21600, 'CON_TREN_6']);
});

test('QUYTG-7: khóa mới trên lượt; số âm / nghi ngờ / không đo được không có dải; lượt trực tiếp vào CON_TREN_6', () => {
  const kq = layDai();
  assert.equal(kq.pagination.total, 17); // DI0016 (23/10) nằm ngoài khung
  for (const l of kq.items) {
    for (const k of ['duong_thu', 'ngay_den', 'nguon_moc_bat_dau', 'dai']) assert.ok(Object.prototype.hasOwnProperty.call(l, k), k);
    assert.equal(l.ngay_den, '2026-10-21');
  }
  assert.equal(byShbg(kq, 'DI0001VN').duong_thu, 'Đường thư 1');
  assert.equal(byShbg(kq, 'DI0001VN').nguon_moc_bat_dau, 'KTT');
  const am = byShbg(kq, 'DI0012VN');
  assert.deepEqual([am.trangThai, am.nguon_moc_bat_dau, am.dai], ['AM', 'KTT', null]);
  const nn = byShbg(kq, 'DI0013VN');
  assert.deepEqual([nn.trangThai, nn.nghiNgo, nn.nguon_moc_bat_dau, nn.dai], ['DO_DUOC', true, 'KTT', null]); // quỹ âm rất sâu nhưng KHÔNG vào QUA_HAN
  assert.ok(nn.quyConLaiGiay.F1_3 < 0);
  const kd = byShbg(kq, 'DI0014VN');
  assert.deepEqual([kd.trangThai, kd.nguon_moc_bat_dau, kd.dai], ['KHONG_DO_DUOC', null, null]);
  const tt = byShbg(kq, 'DI0011VN');
  assert.deepEqual([tt.nhom, tt.nguon_moc_bat_dau, tt.dai, tt.duong_thu, tt.thoiGianThucGiay], ['NGOAI_53', 'XND_BCVH', 'CON_TREN_6', QQ.DUONG_THU_TRONG, 0]);
  assert.equal(QQ.DUONG_THU_TRONG, 'Chưa rõ đường thư');
  const truc = kq.items.filter((l) => l.nguon_moc_bat_dau === 'XND_BCVH');
  assert.ok(truc.length > 0 && truc.every((l) => l.dai === 'CON_TREN_6'));
  // 533140 + Thuận Hóa: chỉ tiêu 12 giờ (QUYTG-7b) -> quỹ 12 giờ - 1 giờ = 39.600 giây, dải suy từ quỹ đó
  const th = byShbg(kq, 'DI0018VN');
  assert.deepEqual([th.chi_tieu_gio, th.quyConLaiGiay.F1_3, th.dai], [12, 39600, 'CON_TREN_6']);
});

test('QUYTG-7: tổng hợp — dải, chinh / truc_tiep / lech_moc, tỉ lệ quá hạn, phuong_trong, meta', () => {
  const t = QQ.tongHopQuyThoiGian(dungDbDai(), DAY);
  assert.equal(t.tong.tong_shbg, 17);
  assert.equal(t.tong.chinh, 14); // 17 - số âm - nghi ngờ - không đo được
  assert.equal(t.tong.truc_tiep, 1);
  assert.equal(t.tong.lech_moc, 1);
  assert.deepEqual(t.tong.dai, { QUA_HAN: 2, SAP_HET: 2, CON_2_6: 4, CON_TREN_6: 6 });
  assert.equal(Object.values(t.tong.dai).reduce((a, x) => a + x, 0), t.tong.chinh);
  assert.ok(t.tong.truc_tiep <= t.tong.chinh);
  assert.equal(t.tong.ty_le_qua_han, 2 / 14); // mẫu số gồm cả lượt nhận trực tiếp
  assert.equal(t.tong.phuong_trong, 1); // chỉ DI0017 (533140, phường trống)
  assert.equal(t.tong.nghi_ngo, 1);
  assert.equal(t.tong.khong_do_duoc_theo_ly_do.THIEU_XAC_NHAN_KTT, 1);
  assert.equal(t.meta.chi_tieu, 'F1_3');
  assert.equal(t.meta.nguong_sap_het_giay, 7200);
  // theo_nhom: mỗi mục có khóa mới, tổng khớp tong
  for (const k of ['chinh', 'truc_tiep', 'lech_moc']) assert.equal(Object.values(t.theo_nhom).reduce((a, x) => a + x[k], 0), t.tong[k], k);
  for (const dd of QQ.DAI) assert.equal(Object.values(t.theo_nhom).reduce((a, x) => a + x.dai[dd], 0), t.tong.dai[dd], dd);
  for (const nh of Object.values(t.theo_nhom)) assert.equal(Object.values(nh.dai).reduce((a, x) => a + x, 0), nh.chinh);
  assert.equal(t.theo_nhom.NGOAI_53.truc_tiep, 1);
  assert.equal(t.theo_nhom.KTT.truc_tiep, 0);
  // không lượt chính -> ty_le null; mọi khung giờ 0
  const d = taoDb();
  const rong = QQ.tongHopQuyThoiGian(d, DAY);
  assert.equal(rong.tong.ty_le_qua_han, null);
  assert.deepEqual(rong.theo_gio.map((g) => g.chinh), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([rong.tong.theo_bcvh, rong.tong.theo_duong_thu, rong.tong.phuong_trong], [[], [], 0]);
  d.close();
});

test('QUYTG-7: tong.theo_bcvh — qua_han giảm dần, hòa theo den giảm dần; khóa cũ theo_bcvh giữ nguyên; lọc một BCVH', () => {
  const t = QQ.tongHopQuyThoiGian(dungDbDai(), DAY);
  assert.deepEqual(t.tong.theo_bcvh.map((b) => b.ma_bcvh), [BC, BC2, '533140']);
  assert.deepEqual(t.tong.theo_bcvh.map((b) => [b.den, b.chinh, b.truc_tiep, b.qua_han, b.sap_het]), [[14, 11, 1, 1, 2], [1, 1, 0, 1, 0], [2, 2, 0, 0, 0]]);
  assert.deepEqual(t.tong.theo_bcvh.map((b) => b.ty_le_qua_han), [1 / 11, 1, 0]);
  assert.equal(t.tong.theo_bcvh.reduce((a, b) => a + b.qua_han, 0), t.tong.dai.QUA_HAN);
  assert.equal(t.tong.theo_bcvh.reduce((a, b) => a + b.den, 0), t.tong.tong_shbg);
  assert.deepEqual(t.theo_bcvh.map((b) => b.receiver_code), ['533140', BC2, BC]); // khóa cũ: theo mã tăng dần
  for (const ma of [BC, BC2, '533140']) {
    const m = QQ.tongHopQuyThoiGian(dungDbDai(), { ...DAY, receiver_code: ma });
    assert.equal(m.tong.theo_bcvh.length, 1, ma);
    assert.equal(m.tong.theo_bcvh[0].ma_bcvh, ma);
    assert.equal(m.tong.theo_bcvh[0].den, m.tong.tong_shbg);
    assert.ok(layDai({ receiver_code: ma }).items.every((l) => l.receiver_code === ma));
  }
});

test('QUYTG-7: theo_duong_thu — gom đường thư rỗng, sắp xếp, trung bình «đã qua», tổng quá hạn', () => {
  const t = QQ.tongHopQuyThoiGian(dungDbDai(), DAY);
  const dt = t.tong.theo_duong_thu;
  assert.deepEqual(dt.map((x) => x.ten), ['Đường thư 1', 'Đường thư 2', 'Đường thư 3', QQ.DUONG_THU_TRONG]); // qua_han 1,1,0,0; hòa: den 8 > 3 và 5 > 1
  assert.deepEqual(dt.map((x) => [x.den, x.chinh, x.truc_tiep, x.qua_han, x.sap_het]), [[8, 5, 0, 1, 1], [3, 3, 0, 1, 1], [5, 5, 0, 0, 0], [1, 1, 1, 0, 0]]);
  assert.equal(dt.reduce((a, x) => a + x.qua_han, 0), t.tong.dai.QUA_HAN);
  assert.equal(dt.reduce((a, x) => a + x.den, 0), t.tong.tong_shbg);
  assert.equal(dt.reduce((a, x) => a + x.chinh, 0), t.tong.chinh);
  // trung bình làm tròn xuống: đường thư 3 = (28800 + 10799 + 10800 + 39599 + 39600) / 5 = 25919,6
  assert.equal(dt[2].da_qua_trung_binh_giay, 25919);
  assert.equal(dt[3].da_qua_trung_binh_giay, 0); // chỉ lượt trực tiếp (đã qua 0): mặc định tính cả lượt trực tiếp
  const luot = layDai().items;
  for (const x of dt) {
    const chinh = luot.filter((l) => l.duong_thu === x.ten && l.dai !== null);
    assert.equal(x.chinh, chinh.length);
    assert.equal(x.da_qua_trung_binh_giay, Math.floor(chinh.reduce((a, l) => a + l.thoiGianThucGiay, 0) / chinh.length));
    assert.equal(x.ty_le_qua_han, x.qua_han / x.chinh);
  }
  assert.equal(dt[0].ty_le_qua_han, 1 / 5);
  // đường thư không có lượt chính -> ty_le_qua_han và da_qua_trung_binh_giay là null
  const d = taoDb();
  idDong += 1000;
  them(d.prepare(insSql), { trk: 'DI0201VN', bd10: KTT_B(61), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' }); // thiếu KTT
  const r = QQ.tongHopQuyThoiGian(d, DAY).tong.theo_duong_thu;
  assert.deepEqual(r.map((x) => [x.ten, x.den, x.chinh, x.ty_le_qua_han, x.da_qua_trung_binh_giay]), [[QQ.DUONG_THU_TRONG, 1, 0, null, null]]);
  d.close();
});

test('QUYTG-7: theo_gio — 6 khung nửa mở, chỉ lượt chính (gồm trực tiếp), biên 09:59:59 / 10:00:00 / 17:59:59 / 18:00:00', () => {
  const t = QQ.tongHopQuyThoiGian(dungDbDai(), DAY);
  assert.deepEqual(t.theo_gio.map((g) => g.khung), ['Trước 10h', '10–12h', '12–14h', '14–16h', '16–18h', 'Sau 18h']);
  // Trước 10h: DI0001, 02, 07 (09:59:59), 15 (BCVH 2), 17, 18 | 10–12h: DI0008 (10:00:00) | 12–14h: DI0011 (trực tiếp) | 14–16h: DI0005, 06 | 16–18h: DI0009 (17:59:59) | Sau 18h: DI0003, 04, 10 (18:00:00)
  assert.deepEqual(t.theo_gio.map((g) => g.chinh), [6, 1, 1, 2, 1, 3]);
  assert.equal(t.theo_gio.reduce((a, g) => a + g.chinh, 0), t.tong.chinh);
  assert.deepEqual(t.theo_gio[0].dai, { QUA_HAN: 2, SAP_HET: 1, CON_2_6: 0, CON_TREN_6: 3 });
  assert.deepEqual(t.theo_gio.map((g) => [g.qua_han, g.sap_het]), [[2, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 1]]);
  for (const g of t.theo_gio) assert.equal(Object.values(g.dai).reduce((a, x) => a + x, 0), g.chinh);
  for (const dd of QQ.DAI) assert.equal(t.theo_gio.reduce((a, g) => a + g.dai[dd], 0), t.tong.dai[dd], dd);
});

test('QUYTG-7: theo ngày — đủ mọi ngày (kể cả ngày 0 lượt), ngày giảm dần, tổng den = tong_shbg', () => {
  const q = { from: '2026-10-21', to: '2026-10-23' };
  const r = QQ.theoNgayQuyThoiGian(dungDbDai(), q);
  assert.deepEqual(r.ngay.map((n) => n.ngay_den), ['2026-10-23', '2026-10-22', '2026-10-21']);
  assert.equal(r.ngay.reduce((a, n) => a + n.den, 0), QQ.tongHopQuyThoiGian(dungDbDai(), q).tong.tong_shbg);
  const [n23, n22, n21] = r.ngay;
  assert.deepEqual(n22, { ngay_den: '2026-10-22', den: 0, chinh: 0, truc_tiep: 0, lech_moc: 0, nghi_ngo: 0, khong_do_duoc: 0, dai: { QUA_HAN: 0, SAP_HET: 0, CON_2_6: 0, CON_TREN_6: 0 }, qua_han: 0, ty_le_qua_han: null, sap_het: 0, da_qua_trung_binh_giay: null });
  assert.deepEqual([n23.den, n23.chinh, n23.dai.CON_TREN_6, n23.da_qua_trung_binh_giay], [1, 1, 1, 3600]);
  assert.deepEqual([n21.den, n21.chinh, n21.truc_tiep, n21.lech_moc, n21.nghi_ngo, n21.khong_do_duoc, n21.qua_han, n21.sap_het], [17, 14, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(n21.dai, { QUA_HAN: 2, SAP_HET: 2, CON_2_6: 4, CON_TREN_6: 6 });
  assert.equal(n21.ty_le_qua_han, 2 / 14);
  const chinh21 = layDai().items.filter((l) => l.dai !== null);
  assert.equal(n21.da_qua_trung_binh_giay, Math.floor(chinh21.reduce((a, l) => a + l.thoiGianThucGiay, 0) / chinh21.length));
  assert.equal(r.meta.chi_tieu, 'F1_3');
  assert.equal(r.meta.nguong_sap_het_giay, 7200);
  // khung có giờ: ngày đến tính theo arrival_at, mỗi SHBG một lần -> khoảng 1 ngày chỉ có ngày đó
  assert.deepEqual(QQ.theoNgayQuyThoiGian(dungDbDai(), { ...DAY }).ngay.map((n) => [n.ngay_den, n.den]), [['2026-10-21', 17]]);
  assert.deepEqual(QQ.theoNgayQuyThoiGian(dungDbDai(), { ...DAY, receiver_code: BC2 }).ngay.map((n) => [n.ngay_den, n.den, n.dai.QUA_HAN]), [['2026-10-21', 1, 1]]);
  // 31 ngày được, 32 ngày -> lỗi; DB rỗng vẫn đủ 31 phần tử
  assert.equal(QQ.theoNgayQuyThoiGian(taoDb(), { from: '2026-09-21', to: '2026-10-21' }).ngay.length, 31);
  assert.throws(() => QQ.theoNgayQuyThoiGian(taoDb(), { from: '2026-09-20', to: '2026-10-21' }), QQ.QueryParamError);
  assert.throws(() => QQ.theoNgayQuyThoiGian(taoDb(), { ...DAY, nhom: 'KTT' }), QQ.QueryParamError);
  assert.throws(() => QQ.theoNgayQuyThoiGian(taoDb(), { ...DAY, page: '1' }), QQ.QueryParamError);
});

test('QUYTG-7: bộ lọc duong_thu / dai cho /luot, phối hợp được với nhom / trang_thai / nghi_ngo; sai -> QueryParamError', () => {
  const shbg = (kq) => kq.items.map((i) => i.shbg).sort();
  assert.deepEqual(shbg(layDai({ duong_thu: 'Đường thư 3' })), ['DI0006VN', 'DI0007VN', 'DI0008VN', 'DI0009VN', 'DI0010VN']);
  assert.deepEqual(shbg(layDai({ duong_thu: 'Chưa rõ đường thư' })), ['DI0011VN']);
  assert.equal(layDai({ duong_thu: 'Đường thư' }).pagination.total, 0); // khớp chính xác, không «chứa»
  assert.equal(layDai({ duong_thu: 'đường thư 3' }).pagination.total, 0);
  assert.deepEqual(shbg(layDai({ dai: 'QUA_HAN' })), ['DI0001VN', 'DI0015VN']);
  assert.equal(layDai({ dai: 'SAP_HET' }).pagination.total, 2);
  assert.equal(layDai({ dai: 'CON_2_6' }).pagination.total, 4);
  assert.equal(layDai({ dai: 'CON_TREN_6' }).pagination.total, 6);
  assert.ok(layDai({ dai: 'CON_TREN_6' }).items.every((l) => l.dai === 'CON_TREN_6'));
  // phối hợp
  assert.deepEqual(shbg(layDai({ nhom: 'NGOAI_53', dai: 'CON_TREN_6' })), ['DI0011VN']);
  assert.equal(layDai({ nhom: 'NGOAI_53', dai: 'QUA_HAN' }).pagination.total, 0);
  assert.deepEqual(shbg(layDai({ duong_thu: 'Đường thư 1', trang_thai: 'AM' })), ['DI0012VN']);
  assert.equal(layDai({ duong_thu: 'Đường thư 1', nghi_ngo: '1' }).pagination.total, 1);
  assert.equal(layDai({ dai: 'QUA_HAN', nghi_ngo: '1' }).pagination.total, 0); // lượt nghi ngờ không vào dải
  assert.deepEqual(shbg(layDai({ duong_thu: 'Đường thư 1', dai: 'QUA_HAN' })), ['DI0001VN']);
  assert.deepEqual(shbg(layDai({ duong_thu: 'Đường thư 2', dai: 'QUA_HAN', receiver_code: BC2 })), ['DI0015VN']);
  // sai
  for (const q of [{ dai: 'XYZ' }, { dai: 'qua_han' }, { dai: ['QUA_HAN', 'SAP_HET'] }, { duong_thu: ['a', 'b'] }]) assert.throws(() => layDai(q), QQ.QueryParamError, JSON.stringify(q));
  assert.throws(() => QQ.tongHopQuyThoiGian(dungDbDai(), { ...DAY, dai: 'QUA_HAN' }), QQ.QueryParamError);
  assert.throws(() => QQ.tongHopQuyThoiGian(dungDbDai(), { ...DAY, duong_thu: 'x' }), QQ.QueryParamError);
});

test('QUYTG-7: khóa cũ còn nguyên (F4_1 / F4_2, trung vị, theo_nhom) và không đổi hành vi khi không truyền tham số mới', () => {
  const t = QQ.tongHopQuyThoiGian(dungDbDai(), DAY);
  for (const k of ['F1_3', 'F4_1', 'F4_2']) assert.equal(t.chi_tieu.tong[k].con_quy + t.chi_tieu.tong[k].het_quy, t.tong.chinh);
  assert.deepEqual(Object.keys(t.chi_tieu.tong.F1_3), ['con_quy', 'het_quy']);
  assert.equal(t.chi_tieu.tong.F1_3.het_quy, 2); // DI0001 và DI0015 (quỹ -1)
  assert.equal(layDai().pagination.total, 17);
  assert.equal(layDai({ dai: '' }).pagination.total, 17);
  assert.equal(layDai({ duong_thu: '' }).pagination.total, 17);
});
