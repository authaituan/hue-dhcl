// ==========================================
// Test QUYTG-9a-2: «Thời gian Khai thác-Vận chuyển» — /luy-ke ở chế độ nhiều BCVH («Tất cả BCVH»): từng ngày PHẢI bằng /tong-hop của đúng ngày đó
// (SHBG đi qua nhiều BCVH cùng ngày là MỘT lượt). Chế độ một BCVH giữ nguyên (cộng riêng từng BCVH). Cache theo (tập BCVH, ngày) với chữ ký riêng.
// Toàn bộ trên DB GIẢ trong bộ nhớ (SHBG, BD10 giả); gọi thẳng hàm lõi / cache (cùng hàm các route gọi), không mở máy chủ, không đụng data/.
// Đo thời gian ở quy mô 6 BCVH × 31 ngày × 1.500 lượt/ngày/BCVH: chỉ khi QTG_PERF=1.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { deriveArrival, ensureArrivalSchema } = require('../server/lib/arrivalsImport');
const QQ = require('../server/lib/quyThoiGianQuery');
const CACHE = require('../server/lib/quyThoiGianCache');

const p2 = (n) => String(n).padStart(2, '0');
const t10 = (n) => `2026-10-${p2(n)}`;
const json = (x) => JSON.parse(JSON.stringify(x));
const CODES = require('../server/lib/userBcvh').VALID_BCVH_CODES.slice().sort();
const [C0, C1, C2] = CODES;

const INS = `INSERT INTO arrival_items (id, import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
  bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
  VALUES (@id, 1, @recv, @trk, @bd10, '', @bag, NULL, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @arrival_evidence_count, @bag_date, @bd10_date, NULL)`;
const truocNgay = (ngay) => new Date(Date.parse(`${ngay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Bộ dựng dữ liệu giả trên DB trong bộ nhớ (cùng khuôn với tests/quy-thoi-gian-khoang-ngay.test.js). */
function boDung(db) {
  const st = db.prepare(INS);
  const st2 = db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (?, ?, ?, ?, 1, ?, ?)");
  let idDong = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM arrival_items').get().m;
  let seq = idDong;
  if (!db.prepare('SELECT 1 FROM arrival_import_files WHERE id = 1').get()) {
    db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (1, ?, 'HangDen_535470_20260801_000000.csv', '2026-08-01', '000000', 1, 'goc', 'REJECTED', 'giả')").run(C0);
  }
  const them = (o) => {
    const it = deriveArrival({ bag_confirmed_at: o.bag ?? null, item_confirmed_at: null, bd10_confirmed_at: o.xnd ?? null });
    st.run({
      id: ++idDong, recv: o.recv, trk: o.trk, bd10: o.bd10 ?? '', bag: o.bag ?? null, xnd: o.xnd ?? null, ktt: o.ktt ?? null,
      arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis, arrival_date: it.arrival_date, arrival_evidence_count: it.arrival_evidence_count,
      bag_date: o.bag ? o.bag.slice(0, 10) : null, bd10_date: o.xnd ? o.xnd.slice(0, 10) : null
    });
    return idDong;
  };
  const bd10Moi = (recv) => `530100${recv}6${String(++seq).padStart(6, '0')}`;
  /** `n` lượt đến (recv, ngày): `qh` lượt đầu QUÁ HẠN (quỹ −1 giây), còn lại CON_TREN_6. Cả hai là lượt chính. */
  const nap = (recv, ngay, n, qh = 0) => {
    const truoc = truocNgay(ngay);
    for (let i = 0; i < n; i++) {
      const bd10 = bd10Moi(recv);
      const trk = `GV${String(seq).padStart(7, '0')}VN`;
      if (i < qh) them({ recv, trk, bd10, ktt: `${truoc} 07:00:00`, xnd: `${ngay} 07:00:01`, bag: `${ngay} 07:00:01` });
      else them({ recv, trk, bd10, ktt: `${ngay} 07:00:00`, xnd: `${ngay} 15:00:00`, bag: `${ngay} 15:00:00` });
    }
  };
  /** Một SHBG đi qua nhiều BCVH CÙNG ngày (mỗi BCVH một dòng, BCVH đầu trong `recvs` đến sớm nhất). qh: cả các dòng đều quá hạn. Cả hai là lượt chính. */
  const chung = (ngay, recvs, trk, qh) => {
    const truoc = truocNgay(ngay);
    recvs.forEach((recv, i) => {
      const gio = qh ? `${ngay} 07:0${i}:01` : `${ngay} 15:0${i}:00`;
      them({ recv, trk, bd10: bd10Moi(recv), ktt: qh ? `${truoc} 07:00:00` : `${ngay} 07:00:00`, xnd: gio, bag: gio });
    });
  };
  const taoFile = (recv, ngay, soFile = 2, status = 'OK') => {
    for (let i = 0; i < soFile; i++) st2.run(recv, `HangDen_${recv}_${ngay.replace(/-/g, '')}_${p2(9 + i * 6)}0000.csv`, ngay, `${p2(9 + i * 6)}0000`, `s${recv}${ngay}${i}`, status);
  };
  return { them, nap, chung, taoFile };
}
function dbBoNho() {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  d.exec('CREATE TABLE phat_status_current (bcvh TEXT, shbg TEXT)'); // bảng phát giả: ghi vào đây đổi dấu hiệu DB mà không đổi dữ liệu đến
  return d;
}

/**
 * Tháng 10/2026, ba BCVH (C0, C1, C2) × ngày 1–4, mỗi (BCVH, ngày) 60 lượt riêng + 2 file OK. Quá hạn riêng: C0 6, C1 12, C2 3 mỗi ngày.
 * SHBG CHUNG nhiều BCVH cùng ngày: ngày 2: 5 SHBG ở C0 và C1 (cả hai dòng quá hạn); ngày 3: 3 SHBG ở C1 và C2; ngày 4: 2 SHBG ở cả C0, C1, C2.
 * Số lượt cộng riêng từng BCVH — C0: 60, 65, 60, 62; C1: 60, 65, 63, 62; C2: 60, 60, 63, 62.
 * Số lượt theo ngày loại trùng xuyên BCVH (= /tong-hop «Tất cả»): 180, 185, 183, 182 (Σ 730); quá hạn: 21, 26, 21, 21 (Σ 89). Cộng riêng: 742 lượt, 94 quá hạn.
 */
function dungBaBcvh(d) {
  const b = boDung(d);
  const qh = { [C0]: 6, [C1]: 12, [C2]: 3 };
  for (let n = 1; n <= 4; n++) for (const c of [C0, C1, C2]) { b.nap(c, t10(n), 60, qh[c]); b.taoFile(c, t10(n), 2); }
  for (let i = 0; i < 5; i++) b.chung(t10(2), [C0, C1], `CH2${i}VN`, true);
  for (let i = 0; i < 3; i++) b.chung(t10(3), [C1, C2], `CH3${i}VN`, false);
  for (let i = 0; i < 2; i++) b.chung(t10(4), [C0, C1, C2], `CH4${i}VN`, false);
  return b;
}
const RIENG = { [C0]: [60, 65, 60, 62], [C1]: [60, 65, 63, 62], [C2]: [60, 60, 63, 62] };
const DEN_NGAY = [180, 185, 183, 182];
const QH_NGAY = [21, 26, 21, 21];
const cong = (x) => x.reduce((a, n) => a + n, 0);
/** Kết quả /tong-hop «Tất cả BCVH» của đúng một ngày (không receiver_code). */
const tongHopNgay = (d, ngay) => QQ.tongHopQuyThoiGian(d, { from: ngay, to: ngay }).tong;

test('«Tất cả BCVH»: từng ngày của /luy-ke (den, chinh, qua_han) bằng đúng /tong-hop Tất cả của ngày đó; Σ ngày = tong; loại trùng SHBG đi qua nhiều BCVH', () => {
  const d = dbBoNho();
  dungBaBcvh(d);
  CACHE.xoaCache();
  for (const [ten, lk] of [['lõi không cache', QQ.luyKeQuyThoiGian(d, {})], ['qua cache', CACHE.luyKe(d, {})]]) {
    assert.equal(lk.theo_ngay.length, 4, ten);
    lk.theo_ngay.forEach((n, i) => {
      const th = tongHopNgay(d, n.ngay);
      assert.deepEqual([n.den, n.chinh, n.qua_han], [th.tong_shbg, th.chinh, th.dai.QUA_HAN], `${ten} ${n.ngay}`);
      assert.deepEqual([n.den, n.qua_han], [DEN_NGAY[i], QH_NGAY[i]], `${ten} ${n.ngay} (số kỳ vọng dựng tay)`);
    });
    assert.equal(cong(lk.theo_ngay.map((n) => n.den)), lk.tong.tong_shbg, ten);
    assert.equal(cong(lk.theo_ngay.map((n) => n.qua_han)), lk.tong.dai.QUA_HAN, ten);
    assert.equal(cong(lk.theo_ngay.map((n) => n.chinh)), lk.tong.chinh, ten);
    assert.deepEqual([lk.tong.tong_shbg, lk.tong.chinh, lk.tong.dai.QUA_HAN], [cong(DEN_NGAY), cong(DEN_NGAY), cong(QH_NGAY)], ten);
    assert.equal(lk.tong.ty_le_qua_han, cong(QH_NGAY) / cong(DEN_NGAY), ten);
    const cuoi = lk.theo_ngay[3];
    assert.deepEqual([cuoi.luy_ke_qua_han, cuoi.luy_ke_chinh, cuoi.luy_ke_ty_le], [cong(QH_NGAY), cong(DEN_NGAY), cong(QH_NGAY) / cong(DEN_NGAY)], ten);
    assert.equal(lk.meta.loai_trung_xuyen_bcvh_trong_ngay, true, ten);
  }
  // lũy kế cả khoảng bằng Σ /tong-hop từng ngày
  const sum = [1, 2, 3, 4].map((n) => tongHopNgay(d, t10(n)));
  assert.equal(cong(sum.map((t) => t.tong_shbg)), 730);
  // liệt kê đủ cả 6 mã = «Tất cả» (cùng kết quả)
  assert.deepEqual(json(QQ.luyKeQuyThoiGian(d, { receiver_code: CODES.join(',') })), json(QQ.luyKeQuyThoiGian(d, {})));
  d.close();
});

test('«Tất cả BCVH»: cộng riêng từng BCVH (kiểu cũ) lớn hơn tong đúng số lượt đi qua nhiều BCVH — tài liệu 35 mục «Σ theo từng BCVH có thể lớn hơn tong»', () => {
  const d = dbBoNho();
  dungBaBcvh(d);
  const rieng = [C0, C1, C2].map((c) => QQ.luyKeQuyThoiGian(d, { receiver_code: c }));
  assert.equal(cong(rieng.map((r) => r.tong.tong_shbg)), 742);
  assert.equal(cong(rieng.map((r) => r.tong.dai.QUA_HAN)), 94);
  assert.equal(QQ.luyKeQuyThoiGian(d, {}).tong.tong_shbg, 730); // 742 − (5 + 3 + 2×2) lượt trùng
  d.close();
});

test('một BCVH: số liệu y nguyên (cộng riêng từng BCVH, khớp cách tính cũ) và khớp /tong-hop lọc đúng BCVH đó', () => {
  const d = dbBoNho();
  dungBaBcvh(d);
  CACHE.xoaCache();
  for (const c of [C0, C1, C2]) {
    const kh = QQ.khungLuyKe(d, QQ.docThamSoLuyKe({ receiver_code: c }));
    const cu = QQ.ghepLuyKe(kh, QQ.thongTinFile(d, kh.codes, kh.tu, kh.den), QQ.tinhTheoBcvhNgay(d, kh.codes, kh.tu, kh.den)); // đúng đường tính trước 9a-2
    const lk = QQ.luyKeQuyThoiGian(d, { receiver_code: c });
    assert.deepEqual(json(lk), json(cu), c);
    assert.deepEqual(json(CACHE.luyKe(d, { receiver_code: c })), json(cu), `${c} qua cache`);
    assert.deepEqual(lk.theo_ngay.map((n) => n.den), RIENG[c], c);
    assert.equal(lk.meta.loai_trung_xuyen_bcvh_trong_ngay, false, c);
    lk.theo_ngay.forEach((n) => {
      const th = QQ.tongHopQuyThoiGian(d, { from: n.ngay, to: n.ngay, receiver_code: c }).tong;
      assert.deepEqual([n.den, n.chinh, n.qua_han], [th.tong_shbg, th.chinh, th.dai.QUA_HAN], `${c} ${n.ngay}`);
    });
  }
  assert.deepEqual(QQ.luyKeQuyThoiGian(d, { receiver_code: C0 }).theo_ngay.map((n) => n.qua_han), [6, 11, 6, 6]);
  d.close();
});

test('«Tất cả BCVH»: BCVH không đủ điều kiện trong ngày (đang cập nhật / dưới sàn / thiếu file) bị loại; ngày chỉ loại trùng giữa các BCVH còn lại', () => {
  const d = dbBoNho();
  const b = dungBaBcvh(d);
  // ngày 5: C0 và C1 đủ (60 + 5 chung), C2 chỉ 30 lượt (dưới sàn) dù đủ file; ngày 6 (mới nhất): C0 đủ 2 file, C1 chỉ 1 file (đang cập nhật)
  b.nap(C0, t10(5), 60, 6); b.nap(C1, t10(5), 60, 6); b.nap(C2, t10(5), 30, 3);
  for (let i = 0; i < 5; i++) b.chung(t10(5), [C0, C1, C2], `CH5${i}VN`, false);
  for (const c of [C0, C1, C2]) b.taoFile(c, t10(5), 2);
  b.nap(C0, t10(6), 60, 6); b.nap(C1, t10(6), 60, 6);
  for (let i = 0; i < 4; i++) b.chung(t10(6), [C0, C1], `CH6${i}VN`, false);
  b.taoFile(C0, t10(6), 2); b.taoFile(C1, t10(6), 1);
  CACHE.xoaCache();
  for (const lk of [QQ.luyKeQuyThoiGian(d, {}), CACHE.luyKe(d, {})]) {
    const n5 = lk.theo_ngay[4];
    assert.deepEqual([n5.co_du_lieu, n5.so_bcvh_trong_ngay], [true, 2]);
    assert.deepEqual(n5.bcvh_thieu.find((x) => x.ma === C2), { ma: C2, ly_do: 'DUOI_SAN' });
    assert.equal(n5.bcvh_thieu.length, CODES.length - 2);
    assert.equal(n5.den, 125); // C0: 60 + 5 chung, C1: 60 + 5 chung; 5 SHBG chung của hai BCVH tính một lần -> 125 (C2 dưới sàn nên không vào)
    const th = QQ.tongHopQuyThoiGian(d, { from: t10(5), to: t10(5), receiver_code: `${C0},${C1}` }).tong;
    assert.deepEqual([n5.den, n5.chinh, n5.qua_han], [th.tong_shbg, th.chinh, th.dai.QUA_HAN]);
    const n6 = lk.theo_ngay[5];
    assert.deepEqual([n6.co_du_lieu, n6.so_bcvh_trong_ngay, n6.den], [true, 1, 64]); // chỉ C0 (C1 đang cập nhật): 60 + 4 chung của C0
    assert.deepEqual(n6.bcvh_thieu.filter((x) => x.ly_do === 'DANG_CAP_NHAT'), [{ ma: C1, ly_do: 'DANG_CAP_NHAT' }]);
    assert.equal(lk.ngay_dang_cap_nhat, t10(6));
    assert.equal(cong(lk.theo_ngay.map((n) => n.den)), lk.tong.tong_shbg);
  }
  d.close();
});

test('«Tất cả BCVH» — cache: thêm một dòng của MỘT (BCVH, ngày) chỉ tính lại NGÀY đó; ghi không liên quan không tính lại gì; kết quả luôn khớp lõi không cache', () => {
  const d = dbBoNho();
  const b = dungBaBcvh(d);
  CACHE.xoaCache();
  const g0 = json(CACHE.luyKe(d, {}));
  const s0 = CACHE.thongKeLuyKe();
  assert.equal(s0.ngayGopTinhLai, 4); // 4 ngày, mỗi ngày một lần (không phải 3 BCVH × 4 ngày)
  assert.equal(s0.ngayGop, 4);
  assert.equal(s0.capTinhLai, 24); // 6 BCVH × 4 ngày: cặp (BCVH, ngày) cần đếm số lượt cho sàn 50
  assert.deepEqual(g0, json(QQ.luyKeQuyThoiGian(d, {})));
  // lần hai: đường nhanh
  CACHE.luyKe(d, {});
  assert.deepEqual(CACHE.thongKeLuyKe(), s0);
  // ghi KHÔNG liên quan: không tính lại ngày nào, không tính lại cặp nào
  d.prepare("INSERT INTO phat_status_current (bcvh, shbg) VALUES ('x', 'y')").run();
  assert.deepEqual(json(CACHE.luyKe(d, {})), g0);
  const s1 = CACHE.thongKeLuyKe();
  assert.equal(s1.lanChuKy, s0.lanChuKy + 1);
  assert.equal(s1.ngayGopTinhLai, s0.ngayGopTinhLai);
  assert.equal(s1.capTinhLai, s0.capTinhLai);
  // thêm 3 lượt quá hạn vào (C2, ngày 3): chỉ ngày 3 tính lại
  b.nap(C2, t10(3), 3, 3);
  const g1 = json(CACHE.luyKe(d, {}));
  const s2 = CACHE.thongKeLuyKe();
  assert.equal(s2.ngayGopTinhLai - s1.ngayGopTinhLai, 1);
  assert.equal(s2.capTinhLai - s1.capTinhLai, 1);
  assert.deepEqual(g1, json(QQ.luyKeQuyThoiGian(d, {})));
  assert.deepEqual([g1.theo_ngay[2].den, g1.theo_ngay[2].qua_han], [DEN_NGAY[2] + 3, QH_NGAY[2] + 3]);
  assert.deepEqual([g1.theo_ngay[1].den, g1.theo_ngay[3].den], [DEN_NGAY[1], DEN_NGAY[3]]);
  // sửa tại chỗ KTT của 4 lượt riêng của (C0, ngày 1): thành quá hạn -> chỉ ngày 1
  const ids = d.prepare("SELECT id FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? AND bd10_ttkt_confirmed_at = ? LIMIT 4").all(C0, t10(1), `${t10(1)} 07:00:00`).map((r) => r.id);
  assert.equal(ids.length, 4);
  for (const id of ids) d.prepare('UPDATE arrival_items SET bd10_ttkt_confirmed_at = ? WHERE id = ?').run('2026-09-30 07:00:00', id);
  const g2 = json(CACHE.luyKe(d, {}));
  const s3 = CACHE.thongKeLuyKe();
  assert.equal(s3.ngayGopTinhLai - s2.ngayGopTinhLai, 1);
  assert.equal(g2.theo_ngay[0].qua_han, g1.theo_ngay[0].qua_han + 4);
  assert.deepEqual(g2, json(QQ.luyKeQuyThoiGian(d, {})));
  // xóa dòng của (C1, ngày 4) -> chỉ ngày 4
  d.prepare('DELETE FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? AND id IN (SELECT id FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? LIMIT 2)').run(C1, t10(4), C1, t10(4));
  const g3 = json(CACHE.luyKe(d, {}));
  assert.equal(CACHE.thongKeLuyKe().ngayGopTinhLai - s3.ngayGopTinhLai, 1);
  assert.deepEqual(g3, json(QQ.luyKeQuyThoiGian(d, {})));
  assert.equal(g3.theo_ngay[3].den, g2.theo_ngay[3].den - 2);
  // đổi tập BCVH đủ điều kiện (thêm file thứ hai thay đổi trạng thái đang cập nhật của ngày mới nhất) -> ngày đó tính lại dù dữ liệu đến không đổi
  const lyDoCu = g3.theo_ngay[3].bcvh_thieu.length;
  d.prepare("DELETE FROM arrival_import_files WHERE unit_code = ? AND file_date = ? AND file_name LIKE '%_150000.csv'").run(C2, t10(4)); // C2 còn 1 file ở ngày mới nhất -> đang cập nhật
  const n0 = CACHE.thongKeLuyKe().ngayGopTinhLai;
  const g4 = json(CACHE.luyKe(d, {}));
  assert.equal(g4.theo_ngay[3].bcvh_thieu.length, lyDoCu + 1);
  assert.equal(CACHE.thongKeLuyKe().ngayGopTinhLai - n0, 1);
  assert.deepEqual(g4, json(QQ.luyKeQuyThoiGian(d, {})));
  CACHE.xoaCache();
  assert.equal(CACHE.thongKeLuyKe().ngayGop, 0);
  d.close();
});

test('«Tất cả BCVH» — cache: tầng tuổi giữ nguyên (ngày gần 10 phút, ngày xa 6 giờ); chữ ký đổi tính lại ngay kể cả ngày xa', () => {
  const d = dbBoNho();
  const b = dungBaBcvh(d);
  for (const c of [C0, C1, C2]) { b.nap(c, t10(8), 60, 6); b.taoFile(c, t10(8), 2); } // ngày mới nhất = 8: ngày xa (cách > 3 ngày) = 1..4; ngày gần = 5..8 (chỉ ngày 8 có dữ liệu)
  CACHE.xoaCache();
  const t0 = Date.now();
  const ngayGop = () => CACHE.thongKeLuyKe().ngayGopTinhLai;
  const ket0 = json(CACHE.luyKe(d, {}, t0));
  assert.equal(ngayGop(), 5); // ngày 1–4 và 8
  let truoc = ngayGop();
  const k1 = json(CACHE.luyKe(d, {}, t0 + CACHE.CACHE_MAX_AGE_MS)); // quá 10 phút: chỉ ngày GẦN (8) tính lại
  assert.equal(ngayGop() - truoc, 1);
  assert.deepEqual(k1, ket0);
  // chữ ký của (C1, ngày 2) — NGÀY XA — đổi: tính lại NGAY đúng ngày đó, không chờ trần 6 giờ
  truoc = ngayGop();
  b.nap(C1, t10(2), 2, 2);
  const k2 = json(CACHE.luyKe(d, {}, t0 + CACHE.CACHE_MAX_AGE_MS + 1000));
  assert.equal(ngayGop() - truoc, 1);
  assert.deepEqual(k2, json(QQ.luyKeQuyThoiGian(d, {})));
  assert.equal(k2.theo_ngay[1].den, DEN_NGAY[1] + 2);
  // sát trần 6 giờ: ngày xa còn hạn, chỉ ngày gần (8) quá 10 phút kể từ lần tính lại trước
  truoc = ngayGop();
  CACHE.luyKe(d, {}, t0 + CACHE.LUY_KE_TUOI_NGAY_XA_MS - 1);
  assert.equal(ngayGop() - truoc, 1);
  // ngày xa chạm trần 6 giờ: ngày 1, 3, 4 (tính ở t0) tính lại dù dữ liệu không đổi; ngày 2 (tính lại sau t0) và ngày 8 (vừa tính) còn hạn
  d.prepare("INSERT INTO phat_status_current (bcvh, shbg) VALUES ('x', 'z')").run();
  truoc = ngayGop();
  CACHE.luyKe(d, {}, t0 + CACHE.LUY_KE_TUOI_NGAY_XA_MS + 1000);
  assert.equal(ngayGop() - truoc, 3);
  CACHE.xoaCache();
  d.close();
});

test('quá hạn lũy kế lấy từ ĐẾM QUÁ HẠN (dai.QUA_HAN), không phải từ sản lượng đến: đổi KTT làm quá hạn tăng mà đến giữ nguyên; trùng số chỉ là ngẫu nhiên', () => {
  const d = dbBoNho();
  dungBaBcvh(d);
  const truoc = QQ.luyKeQuyThoiGian(d, {});
  const cuoi0 = truoc.theo_ngay[3];
  assert.notEqual(truoc.tong.dai.QUA_HAN, cuoi0.den); // 89 ≠ 182 (sản lượng ngày cuối)
  assert.notEqual(truoc.tong.dai.QUA_HAN, truoc.tong.tong_shbg); // 89 ≠ 730
  assert.equal(truoc.tong.dai.QUA_HAN, cong(truoc.theo_ngay.map((n) => n.qua_han)));
  assert.equal(truoc.tong.dai.QUA_HAN, cuoi0.luy_ke_qua_han);
  // 7 lượt riêng CON_TREN_6 của (C0, ngày 4) chuyển thành quá hạn (KTT sớm hơn XNĐ 24 giờ): đến giữ nguyên, quá hạn tăng đúng 7
  const ids = d.prepare("SELECT id FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? AND bd10_ttkt_confirmed_at = ? LIMIT 7").all(C0, t10(4), `${t10(4)} 07:00:00`).map((r) => r.id);
  assert.equal(ids.length, 7);
  for (const id of ids) d.prepare('UPDATE arrival_items SET bd10_ttkt_confirmed_at = ? WHERE id = ?').run(`${t10(3)} 07:00:00`, id);
  const sau = QQ.luyKeQuyThoiGian(d, {});
  assert.equal(sau.tong.tong_shbg, truoc.tong.tong_shbg);
  assert.equal(sau.theo_ngay[3].den, cuoi0.den);
  assert.equal(sau.tong.dai.QUA_HAN, truoc.tong.dai.QUA_HAN + 7);
  assert.equal(sau.theo_ngay[3].qua_han, cuoi0.qua_han + 7);
  d.close();
});

test('số lượt theo (BCVH, ngày) dùng cho sàn 50 (đếm nhẹ bằng SQL) bằng tong_shbg của đường tính đầy đủ', () => {
  const d = dbBoNho();
  dungBaBcvh(d);
  const day = QQ.tinhTheoBcvhNgay(d, [C0, C1, C2], t10(1), t10(4));
  const dem = QQ.demLuotTheoBcvhNgay(d, [C0, C1, C2], t10(1), t10(4));
  assert.equal(dem.size, day.size);
  for (const [k, g] of day) assert.equal(dem.get(k).tong_shbg, g.tong_shbg, k);
  d.close();
});

// ------------------------------------------
// Đo (QTG_PERF=1): 6 BCVH × 31 ngày × 1.500 lượt/ngày/BCVH + SHBG chung (30 SHBG/ngày cho mỗi cặp BCVH 0-1, 2-3, 4-5), DB trong bộ nhớ
// ------------------------------------------
test('đo lũy kế «Tất cả» có SHBG chung: lạnh / chỉ ghi bảng phát / một cặp đổi / sau 10 phút (QTG_PERF=1)', { skip: !process.env.QTG_PERF }, () => {
  const d = dbBoNho();
  const b = boDung(d);
  const t0 = process.hrtime.bigint();
  d.exec('BEGIN');
  for (let n = 1; n <= 31; n++) {
    for (const recv of CODES) { b.nap(recv, t10(n), 1500, 150); b.taoFile(recv, t10(n), 2); }
    for (let i = 0; i < 3; i++) for (let k = 0; k < 30; k++) b.chung(t10(n), [CODES[2 * i], CODES[2 * i + 1]], `CP${i}${n}${k}VN`, k % 10 === 0);
  }
  d.exec('COMMIT');
  const ms = (x, y) => Math.round(Number(y - x) / 1e5) / 10;
  const dung = ms(t0, process.hrtime.bigint());
  const dem = () => { const s = CACHE.thongKeLuyKe(); return s.ngayGopTinhLai ?? 0; };
  CACHE.xoaCache();
  const m0 = process.hrtime.bigint(); const lanh = CACHE.luyKe(d, {}); const m1 = process.hrtime.bigint();
  const s0 = CACHE.thongKeLuyKe();
  CACHE.luyKe(d, {}); const m2 = process.hrtime.bigint();
  d.prepare("INSERT INTO phat_status_current (bcvh, shbg) VALUES ('x', 'y')").run();
  const p0 = process.hrtime.bigint(); const sauPhat = CACHE.luyKe(d, {}); const p1 = process.hrtime.bigint();
  const s1 = CACHE.thongKeLuyKe();
  b.nap(CODES[0], t10(15), 5, 5); // MỘT (BCVH, ngày) đổi
  const n0 = process.hrtime.bigint(); const sauNgay = CACHE.luyKe(d, {}); const n1 = process.hrtime.bigint();
  const s2 = CACHE.thongKeLuyKe();
  const ngoai = QQ.luyKeQuyThoiGian(d, {}); const n2 = process.hrtime.bigint();
  const goc = Date.now();
  let c0 = dem(); const g0 = process.hrtime.bigint();
  const sau10p = CACHE.luyKe(d, {}, goc + 11 * 60 * 1000); // quá 10 phút, dữ liệu không đổi: chỉ 4 ngày gần nhất tính lại
  const g1 = process.hrtime.bigint(); const ngay10p = dem() - c0;
  const mot = 6 * 31 * 1500 + 31 * 90; // loại trùng: mỗi SHBG chung một lượt
  console.log(`[QTG_PERF] luy-ke «Tất cả» 6 BCVH × 31 ngày × 1.500 + chung (dựng DB ${dung} ms): lạnh ${ms(m0, m1)} ms (${lanh.tong.tong_shbg} lượt; ${s0.ngayGopTinhLai ?? '-'} ngày tính, ${s0.capTinhLai} cặp đếm); `
    + `nóng ${ms(m1, m2)} ms; sau ghi bảng phát ${ms(p0, p1)} ms (${s1.capTinhLai - s0.capTinhLai} cặp, ${(s1.ngayGopTinhLai ?? 0) - (s0.ngayGopTinhLai ?? 0)} ngày); `
    + `sau MỘT (BCVH, ngày) đổi ${ms(n0, n1)} ms (${s2.capTinhLai - s1.capTinhLai} cặp, ${(s2.ngayGopTinhLai ?? 0) - (s1.ngayGopTinhLai ?? 0)} ngày); sau 10 phút ${ms(g0, g1)} ms (${ngay10p} ngày tính lại); lõi không cache ${ms(n1, n2)} ms`);
  if (s0.ngayGopTinhLai !== undefined) {
    assert.equal(lanh.tong.tong_shbg, mot);
    assert.equal(s0.ngayGopTinhLai, 31);
    assert.equal((s1.ngayGopTinhLai) - s0.ngayGopTinhLai, 0);
    assert.equal(s2.ngayGopTinhLai - s1.ngayGopTinhLai, 1);
    assert.equal(sauNgay.tong.tong_shbg, lanh.tong.tong_shbg + 5);
    assert.deepEqual(sau10p, sauNgay);
    assert.deepEqual(sauPhat, lanh);
    assert.deepEqual(sauNgay, ngoai);
    assert.ok(ms(m0, m1) <= 5000, 'lạnh ≤ 5 giây');
    assert.ok(ms(p0, p1) <= 500, 'sau ghi bảng phát ≤ 0,5 giây');
  }
  d.close();
});
