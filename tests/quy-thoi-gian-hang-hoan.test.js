// ==========================================
// Test QUYTG-10: Quỹ thời gian LOẠI hàng hoàn khỏi lượt «chính» (lý do HANG_HOAN, nhóm «Không đo được»). DB RAM + dữ liệu GIẢ (SHBG HT…VN, BD10 giả). Không server, không mạng.
// Nguồn danh sách hoàn = ktt_hang_hoan (kttHangHoan.docDanhSachHangHoan / metaHangHoan), cùng nguồn trang «Hàng tại Khai thác tỉnh».
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureArrivalSchema, deriveArrival } = require('../server/lib/arrivalsImport');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const { VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const QQ = require('../server/lib/quyThoiGianQuery');
const N = require('../server/lib/quyThoiGianNhom');
const CACHE = require('../server/lib/quyThoiGianCache');
const PD = require('../server/lib/phatDashboard');

const BC = VALID_BCVH_CODES[0];
const NGAY = '2026-10-21';
const DAY = { from: NGAY, to: NGAY };
const json = (x) => JSON.parse(JSON.stringify(x));
const KTT_B = (n) => `530100${BC}6102${n}`;
const SO_LOC = 55; // lượt lọc: đạt sàn 50 lượt / ngày của lũy kế
const insSql = `INSERT INTO arrival_items (id, import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
  bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
  VALUES (@id, 1, @recv, @trk, @bd10, '', @bag, NULL, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @arrival_evidence_count, @bag_date, @bd10_date, NULL)`;

/** DB giả: SO_LOC lượt lọc đo được (KHÔNG quá hạn), NH1 + HH1 cùng mốc quá hạn (3 ngày), HH2 thiếu mốc KTT. Danh sách hoàn CHƯA nạp. */
function dungDb() {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  ensureKttSchema(d);
  d.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT); CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, new_ward_name TEXT)');
  const f = d.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (?,?,?,?,?,1,?,'OK')");
  f.run(1, BC, 'f1.csv', NGAY, '093012', 'a'); f.run(2, BC, 'f2.csv', NGAY, '153012', 'b'); // 2 file OK: ngày không bị coi là «đang cập nhật»
  const st = d.prepare(insSql);
  let id = 0;
  const T = (o) => {
    const it = deriveArrival({ bag_confirmed_at: o.bag, item_confirmed_at: null, bd10_confirmed_at: o.xnd });
    st.run({ id: ++id, recv: BC, trk: o.trk, bd10: KTT_B(10 + id % 80), bag: o.bag, xnd: o.xnd, ktt: o.ktt ?? null, arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis,
      arrival_date: it.arrival_date, arrival_evidence_count: it.arrival_evidence_count, bag_date: o.bag.slice(0, 10), bd10_date: o.xnd.slice(0, 10) });
  };
  const bag = `${NGAY} 08:50:00`; const xnd = `${NGAY} 09:00:00`;
  for (let i = 0; i < SO_LOC; i++) T({ trk: `HTF${String(i).padStart(4, '0')}VN`, bag, xnd, ktt: `${NGAY} 08:00:00` });
  T({ trk: 'HTNH1VN', bag, xnd, ktt: '2026-10-18 08:00:00' }); // không hoàn, quá hạn
  T({ trk: 'HTHH1VN', bag, xnd, ktt: '2026-10-18 08:00:00' }); // (sẽ là) hoàn, mốc KTT cũ của chuyến đi -> quá hạn nếu không loại
  T({ trk: 'HTHH2VN', bag, xnd }); // (sẽ là) hoàn, thiếu mốc KTT: lý do hoàn phải thắng THIEU_XAC_NHAN_KTT
  return d;
}
let nap = 0;
function napHoan(d, ...ds) {
  const ins = d.prepare('INSERT INTO ktt_hang_hoan (shbg, nguon_xuat_luc, cap_nhat_luc) VALUES (?, ?, ?)');
  nap++;
  for (const s of ds) ins.run(s, '2026-11-01 00:00:00', `2026-11-01 00:00:0${nap}`);
}
const tongHop = (d) => QQ.tongHopQuyThoiGian(d, DAY);

test('(e) danh sách hoàn chưa nạp: không lỗi, kết quả như trước, meta có cờ chưa nạp', () => {
  const d = dungDb();
  const th = tongHop(d);
  assert.equal(th.tong.tong_shbg, SO_LOC + 3);
  assert.equal(th.tong.chinh, SO_LOC + 2); // NH1 + HH1 đều chính, quá hạn
  assert.equal(th.tong.dai.QUA_HAN, 2);
  assert.equal(th.tong.khong_do_duoc_theo_ly_do.HANG_HOAN, 0);
  assert.equal(th.tong.khong_do_duoc_theo_ly_do.THIEU_XAC_NHAN_KTT, 1);
  assert.equal(th.meta.hang_hoan_chua_nap, true);
  assert.equal(th.meta.hang_hoan_nguon_xuat_luc, null);
  // bảng ktt_hang_hoan không tồn tại (DB cũ): vẫn không lỗi
  const cu = new Database(':memory:'); ensureArrivalSchema(cu);
  assert.equal(QQ.tongHopQuyThoiGian(cu, DAY).meta.hang_hoan_chua_nap, true);
  cu.close(); d.close();
});

test('(a)(b) hàng hoàn: không quá hạn, không vào mẫu, thuộc HANG_HOAN (ưu tiên hơn thiếu mốc); cùng dữ liệu nhưng không hoàn vẫn quá hạn', () => {
  const d = dungDb();
  napHoan(d, 'HTHH1VN', 'HTHH2VN');
  const lay = (q = {}) => QQ.layLuotQuyThoiGian(d, { ...DAY, page_size: '200', ...q });
  const theo = (shbg) => lay().items.find((i) => i.shbg === shbg);
  for (const s of ['HTHH1VN', 'HTHH2VN']) {
    const l = theo(s);
    assert.equal(l.trangThai, 'KHONG_DO_DUOC', s);
    assert.equal(l.lyDo, 'HANG_HOAN', s);
    assert.equal(l.dai, null, s);
    assert.equal(l.nghiNgo, false, s);
    assert.equal(l.thoiGianThucGiay, null, s);
    assert.equal(l.quyConLaiGiay, null, s);
    assert.equal(l.nhom, 'KTT', s); // nhóm BD10 vẫn được phân
  }
  const nh = theo('HTNH1VN');
  assert.equal(nh.dai, 'QUA_HAN'); // (b) không hoàn, cùng mốc: như cũ
  assert.equal(nh.lyDo, null);
  const loc = lay({ ly_do: 'HANG_HOAN' });
  assert.deepEqual(loc.items.map((i) => i.shbg).sort(), ['HTHH1VN', 'HTHH2VN']);
  assert.equal(loc.pagination.total, 2);
  assert.equal(lay({ ly_do: 'THIEU_XAC_NHAN_KTT' }).pagination.total, 0);
  assert.equal(lay({ trang_thai: 'KHONG_DO_DUOC' }).pagination.total, 2);
  assert.equal(lay({ dai: 'QUA_HAN' }).pagination.total, 1);
  assert.ok(N.NHAN_LY_DO.HANG_HOAN && N.NHAN_LY_DO.HANG_HOAN.startsWith('Hàng hoàn'));
  d.close();
});

test('(c) tử và mẫu cùng giảm; tỷ lệ tổng / theo ngày / giờ / BCVH / lũy kế đổi đúng; đẳng thức tổng giữ', () => {
  const d = dungDb();
  const truoc = { th: tongHop(d), ng: QQ.theoNgayQuyThoiGian(d, DAY), lk: QQ.luyKeQuyThoiGian(d, { receiver_code: BC, den: NGAY }) };
  napHoan(d, 'HTHH1VN', 'HTHH2VN');
  const sau = { th: tongHop(d), ng: QQ.theoNgayQuyThoiGian(d, DAY), lk: QQ.luyKeQuyThoiGian(d, { receiver_code: BC, den: NGAY }) };

  assert.deepEqual([truoc.th.tong.chinh, truoc.th.tong.dai.QUA_HAN], [SO_LOC + 2, 2]);
  assert.deepEqual([sau.th.tong.chinh, sau.th.tong.dai.QUA_HAN], [SO_LOC + 1, 1]); // HH1 rời cả tử (2 -> 1) lẫn mẫu (SO_LOC + 2 -> SO_LOC + 1); HH2 trước đó đã không vào mẫu
  assert.equal(sau.th.tong.ty_le_qua_han, 1 / (SO_LOC + 1));
  assert.equal(truoc.th.tong.ty_le_qua_han, 2 / (SO_LOC + 2));
  const t = sau.th.tong;
  assert.equal(t.tong_shbg, SO_LOC + 3); // tổng bưu gửi không đổi
  assert.equal(t.tong_shbg, t.do_duoc + t.am + t.khong_do_duoc);
  assert.equal(t.do_duoc, t.chinh + t.nghi_ngo);
  assert.equal(t.khong_do_duoc, Object.values(t.khong_do_duoc_theo_ly_do).reduce((a, b) => a + b, 0));
  assert.equal(t.khong_do_duoc_theo_ly_do.HANG_HOAN, 2);
  assert.equal(sau.th.theo_nhom.KTT.khong_do_duoc_theo_ly_do.HANG_HOAN, 2);
  assert.equal(sau.th.theo_bcvh[0].chinh, SO_LOC + 1);
  assert.equal(sau.th.theo_bcvh[0].khong_do_duoc_theo_ly_do.HANG_HOAN, 2);
  assert.equal(t.theo_bcvh[0].qua_han, 1); // xếp hạng BCVH
  assert.equal(t.theo_bcvh[0].chinh, SO_LOC + 1);
  assert.equal(t.theo_duong_thu.reduce((a, r) => a + r.qua_han, 0), 1);
  assert.equal(sau.th.theo_gio.reduce((a, g) => a + g.chinh, 0), SO_LOC + 1); // theo giờ
  assert.equal(sau.th.theo_gio.reduce((a, g) => a + g.qua_han, 0), 1);
  assert.equal(sau.th.chi_tieu.tong.F1_3.het_quy, 1);

  const n0 = truoc.ng.ngay[0]; const n1 = sau.ng.ngay[0]; // theo ngày
  assert.deepEqual([n0.den, n0.chinh, n0.qua_han], [SO_LOC + 3, SO_LOC + 2, 2]);
  assert.deepEqual([n1.den, n1.chinh, n1.qua_han, n1.khong_do_duoc], [SO_LOC + 3, SO_LOC + 1, 1, 2]);
  assert.equal(n1.ty_le_qua_han, 1 / (SO_LOC + 1));

  assert.deepEqual([truoc.lk.tong.chinh, truoc.lk.tong.dai.QUA_HAN], [SO_LOC + 2, 2]); // lũy kế
  assert.deepEqual([sau.lk.tong.chinh, sau.lk.tong.dai.QUA_HAN], [SO_LOC + 1, 1]);
  assert.equal(sau.lk.tong.tong_shbg, SO_LOC + 3);
  assert.equal(sau.lk.theo_ngay.at(-1).luy_ke_ty_le, 1 / (SO_LOC + 1));
  assert.equal(sau.lk.meta.hang_hoan_chua_nap, false);
  d.close();
});

test('(d) danh sách hoàn đổi thì cache tính lại (kể cả khi dấu hiệu DB không đổi); meta có độ mới', () => {
  const d = dungDb();
  CACHE.xoaCache();
  const dauHieuGoc = PD.dauHieuDb;
  PD.dauHieuDb = () => 'co-dinh'; // giả lập thay đổi mà dấu hiệu DB không bắt được: chỉ phiên bản danh sách hoàn trong chữ ký cache được phép làm cache mất hiệu lực
  try {
    const q = { ...DAY, page_size: '200' };
    const mot = { receiver_code: BC, den: NGAY };
    assert.equal(CACHE.tongHop(d, DAY).tong.dai.QUA_HAN, 2);
    assert.equal(CACHE.theoNgay(d, DAY).ngay[0].qua_han, 2);
    assert.equal(CACHE.luot(d, q).meta.hang_hoan_chua_nap, true);
    assert.equal(CACHE.luyKe(d, mot).tong.dai.QUA_HAN, 2);
    assert.equal(CACHE.tongHop(d, DAY).tong.dai.QUA_HAN, 2); // cache còn dùng được khi danh sách chưa đổi

    napHoan(d, 'HTHH1VN');
    let th = CACHE.tongHop(d, DAY);
    assert.equal(th.tong.dai.QUA_HAN, 1);
    assert.equal(th.tong.khong_do_duoc_theo_ly_do.HANG_HOAN, 1);
    assert.equal(th.meta.hang_hoan_chua_nap, false);
    assert.equal(th.meta.hang_hoan_nguon_xuat_luc, '2026-11-01 00:00:00');
    assert.equal(CACHE.theoNgay(d, DAY).ngay[0].qua_han, 1);
    assert.equal(CACHE.luot(d, { ...q, ly_do: 'HANG_HOAN' }).pagination.total, 1);
    assert.equal(CACHE.luyKe(d, mot).tong.dai.QUA_HAN, 1);
    assert.deepEqual(json(CACHE.luyKe(d, mot)), json(QQ.luyKeQuyThoiGian(d, mot))); // cache = lõi không cache

    napHoan(d, 'HTHH2VN'); // nạp thêm: HH2 thiếu mốc -> chuyển từ THIEU_XAC_NHAN_KTT sang HANG_HOAN
    th = CACHE.tongHop(d, DAY);
    assert.equal(th.tong.khong_do_duoc_theo_ly_do.HANG_HOAN, 2);
    assert.equal(th.tong.khong_do_duoc_theo_ly_do.THIEU_XAC_NHAN_KTT, 0);
    assert.equal(CACHE.luyKe(d, { receiver_code: BC, den: NGAY }).tong.chinh, SO_LOC + 1);
  } finally {
    PD.dauHieuDb = dauHieuGoc;
    CACHE.xoaCache();
  }
  d.close();
});
