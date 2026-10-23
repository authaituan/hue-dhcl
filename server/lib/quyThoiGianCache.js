// ==========================================
// Bộ nhớ đệm cho «Thời gian Khai thác-Vận chuyển» (QUYTG-5), theo mẫu phatVuHoi.js: vô hiệu khi DẤU HIỆU DB đổi (PD.dauHieuDb = data_version + total_changes: bắt MỌI đường ghi —
// nạp SFTP / tay, thay thế, khôi phục, script) hoặc quá 10 phút (chốt an toàn). Hai tầng, cùng khóa khung (from|to|receiver_code đã sắp xếp|ward_key):
//   - danh sách ĐẦY ĐỦ đã đánh giá và đã sắp (lớn): tối đa 3 khóa, đầy thì bỏ khóa cũ nhất. Một lần tính phục vụ mọi trang và mọi bộ lọc nhom / trang_thai / ly_do / nghi_ngo của cùng khung;
//   - tổng hợp (nhỏ): tối đa 500 khóa; tính từ danh sách đầy đủ (đang có trong cache hoặc vừa tính rồi đưa vào cache) nên một khung chỉ tính MỘT lần cho cả hai route.
// Danh sách trong cache không bao giờ bị sửa tại chỗ (trangTuLuot chỉ lọc / cắt ra mảng mới).
// ==========================================
'use strict';
const QQ = require('./quyThoiGianQuery');
const PD = require('./phatDashboard');

const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const TONG_MAX = 500;
const DANH_SACH_MAX = 3;
const tong = new Map();
const danhSach = new Map();
const theoNgayCache = new Map(); // QUYTG-7: tổng hợp theo ngày (nhỏ, không tính vào thongKe); tính từ cùng danh sách đầy đủ
let cacheDauHieu = null;
const xoaCache = () => {
  tong.clear(); danhSach.clear(); theoNgayCache.clear(); cacheDauHieu = null;
  xoaLuyKe();
};

/** Khóa khung đã chuẩn hóa: from|to|mã BCVH (bỏ trùng, sắp xếp)|ward_key. */
function khoaKhung(f) {
  return `qtg1|${f.from}|${f.to}|${[...new Set(f.receiverCodes)].sort().join(',')}|${f.wardKey || ''}`;
}

function dongBo(dauHieu) {
  if (cacheDauHieu !== dauHieu) { tong.clear(); danhSach.clear(); theoNgayCache.clear(); cacheDauHieu = dauHieu; }
}
function lay(map, khoa, now) {
  const c = map.get(khoa);
  if (!c) return null;
  if (now - c.luc >= CACHE_MAX_AGE_MS) { map.delete(khoa); return null; }
  return c.kq;
}
function dat(map, gioiHan, khoa, kq, now) {
  map.delete(khoa);
  while (map.size >= gioiHan) map.delete(map.keys().next().value); // bỏ khóa cũ nhất
  map.set(khoa, { luc: now, kq });
}

function luotDayDu(db, f, khoa, now) {
  let ds = lay(danhSach, khoa, now);
  if (!ds) {
    ds = QQ.luotDaSapXep(db, f);
    dat(danhSach, DANH_SACH_MAX, khoa, ds, now);
  }
  return ds;
}

/** GET …/quy-thoi-gian/luot: query như layLuotQuyThoiGian. `now`: chỉ để test. */
function luot(db, query, now = Date.now()) {
  const { f, rieng } = QQ.docThamSo(query, { coPhanTrang: true });
  dongBo(PD.dauHieuDb(db));
  return QQ.trangTuLuot(luotDayDu(db, f, khoaKhung(f), now), f, rieng);
}

/** GET …/quy-thoi-gian/tong-hop: query như tongHopQuyThoiGian. */
function tongHop(db, query, now = Date.now()) {
  const { f } = QQ.docThamSo(query, { coPhanTrang: false });
  dongBo(PD.dauHieuDb(db));
  const khoa = khoaKhung(f);
  let kq = lay(tong, khoa, now);
  if (!kq) {
    kq = QQ.tongHopTuLuot(luotDayDu(db, f, khoa, now), f);
    dat(tong, TONG_MAX, khoa, kq, now);
  }
  return kq;
}

/** GET …/quy-thoi-gian/theo-ngay: query như theoNgayQuyThoiGian (tối đa 31 ngày). */
function theoNgay(db, query, now = Date.now()) {
  const { f } = QQ.docThamSoTheoNgay(query);
  dongBo(PD.dauHieuDb(db));
  const khoa = khoaKhung(f);
  let kq = lay(theoNgayCache, khoa, now);
  if (!kq) {
    kq = QQ.theoNgayTuLuot(luotDayDu(db, f, khoa, now), f);
    dat(theoNgayCache, TONG_MAX, khoa, kq, now);
  }
  return kq;
}

/** Chỉ để test: số khóa đang giữ. */
const thongKe = () => ({ tong: tong.size, danh_sach: danhSach.size });

// ------------------------------------------
// Lũy kế tháng (QUYTG-9a). KHÔNG giữ danh sách lượt, chỉ giữ số đếm nhỏ theo (BCVH, ngày), và KHÔNG mất cache chỉ vì có ghi không liên quan (vd nhập trạng thái phát):
//  - đường nhanh: kết quả của (BCVH, tháng, ngày cuối) còn nguyên khi dấu hiệu DB (PD.dauHieuDb) không đổi và chưa quá CACHE_MAX_AGE_MS;
//  - đường chậm (dấu hiệu đổi): MỘT truy vấn gộp tính CHỮ KÝ dữ liệu hàng đến của mọi (BCVH, ngày) (QQ.chuKyDuLieu); chỉ (BCVH, ngày) có chữ ký đổi / quá tuổi mới tính lại
//    (MỘT truy vấn gộp trên hộp bao các cặp đó), còn lại dùng số đếm đã giữ. Ngày thiếu / đủ file xét lại mỗi lần ghép (bảng file nhỏ).
// TUỔI TỐI ĐA của một cặp có TẦNG (chỉ là TRẦN thời gian giữ, KHÔNG thay chữ ký): ngày GẦN (cách ngày mới nhất của phạm vi ≤ LUY_KE_NGAY_XA ngày) 10 phút (CACHE_MAX_AGE_MS);
//    ngày XA (cách > LUY_KE_NGAY_XA ngày) LUY_KE_TUOI_NGAY_XA_MS = 6 giờ. Chữ ký của cặp đổi (nạp / «Thay thế» / khôi phục / sửa tại chỗ — kể cả ngày xa) thì tính lại NGAY, không chờ trần.
//    Nhờ vậy cứ 10 phút không phải tính lại cả tháng, chỉ vài ngày gần nhất.
// Giới hạn đã biết: chữ ký của một cặp không bắt được dòng của CÙNG SHBG ở ngày khác (dòng đo không giới hạn theo ngày) — chốt tuổi (10 phút / 6 giờ) bù lại.
// QUYTG-9a-2 — NHIỀU BCVH («Tất cả»): số của mỗi NGÀY lấy bằng cách tính của /tong-hop (loại trùng SHBG đi qua nhiều BCVH), nên cache có HAI cấp:
//  - luyKeLuot  `mã|ngày` -> { chuKy, tong_shbg }: số lượt riêng của (BCVH, ngày), chỉ để xét sàn 50 (đếm nhẹ bằng SQL). Cùng chữ ký / tầng tuổi như cặp của chế độ một BCVH;
//  - luyKeNgayGop `tập BCVH yêu cầu|ngày` -> { sig, g }: số đếm đã loại trùng của cả NGÀY. sig = danh sách BCVH «có dữ liệu» của ngày + chữ ký dữ liệu đến của từng BCVH đó,
//    nên đổi MỘT cặp (BCVH, ngày) hay đổi tập BCVH đủ điều kiện (file về đủ, qua sàn) chỉ tính lại NGÀY đó; cùng tầng tuổi (10 phút / 6 giờ).
// ------------------------------------------
const LUY_KE_KET_QUA_MAX = 64;
const LUY_KE_NGAY_MAX = 4000;
const LUY_KE_NGAY_XA = 3; // ngày XA = cách ngày mới nhất của phạm vi quá số ngày này
const LUY_KE_TUOI_NGAY_XA_MS = 6 * 60 * 60 * 1000;
const lui = (ngay, n) => new Date(Date.parse(`${ngay}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const luyKeKetQua = new Map(); // khóa (BCVH|tháng|ngày cuối) -> { token, ket_qua }
const luyKeNgay = new Map(); // chế độ MỘT BCVH: `mã|ngày` -> { chuKy, g (demRong hoặc null = không có lượt) }
const luyKeLuot = new Map(); // chế độ NHIỀU BCVH: `mã|ngày` -> { chuKy, tong_shbg }
const luyKeNgayGop = new Map(); // chế độ NHIỀU BCVH: `mã1,mã2,…|ngày` -> { sig, g (demRong đã loại trùng xuyên BCVH, hoặc null) }
const demLuyKe = { lanTinh: 0, capTinhLai: 0, lanChuKy: 0, ngayGopTinhLai: 0 }; // chỉ để test / đo
function xoaLuyKe() {
  luyKeKetQua.clear(); luyKeNgay.clear(); luyKeLuot.clear(); luyKeNgayGop.clear();
  demLuyKe.lanTinh = 0; demLuyKe.capTinhLai = 0; demLuyKe.lanChuKy = 0; demLuyKe.ngayGopTinhLai = 0;
}

function luyKe(db, query, now = Date.now()) {
  const kh = QQ.khungLuyKe(db, QQ.docThamSoLuyKe(query));
  if (!kh.den) return QQ.ghepLuyKe(kh, new Map(), new Map());
  const token = PD.dauHieuDb(db);
  const khoa = `lk1|${kh.codes.join(',')}|${kh.tu}|${kh.den}`;
  const c = lay(luyKeKetQua, khoa, now);
  if (c && c.token === token) return c.ket_qua;

  demLuyKe.lanChuKy++;
  const chuKy = QQ.chuKyDuLieu(db, kh.codes, kh.tu, kh.den);
  const gop = QQ.luyKeGop(kh); // nhiều BCVH: số của ngày loại trùng xuyên BCVH (như /tong-hop)
  const kho = gop ? luyKeLuot : luyKeNgay;
  const can = [];
  const ranhXa = kh.ngayMoiNhat ? lui(kh.ngayMoiNhat, LUY_KE_NGAY_XA) : null; // ngày < ranh giới này là ngày XA
  const tuoiCua = (ngay) => (ranhXa !== null && ngay < ranhXa ? LUY_KE_TUOI_NGAY_XA_MS : CACHE_MAX_AGE_MS);
  for (const ngay of kh.ngays) {
    const tuoiToiDa = tuoiCua(ngay);
    for (const ma of kh.codes) {
      const k = `${ma}|${ngay}`;
      const e = kho.get(k);
      const conHan = e && now - e.luc < tuoiToiDa;
      if (!conHan || e.kq.chuKy !== (chuKy.get(k) || QQ.CHU_KY_TRONG)) can.push({ ma, ngay, k }); // chữ ký đổi -> tính lại NGAY, kể cả ngày xa
    }
  }
  if (can.length) {
    demLuyKe.lanTinh++;
    demLuyKe.capTinhLai += can.length;
    const maCan = [...new Set(can.map((x) => x.ma))].sort();
    const ngayCan = can.map((x) => x.ngay).sort();
    const hopBao = [maCan, ngayCan[0], ngayCan[ngayCan.length - 1]]; // hộp bao: BCVH cần × [ngày nhỏ nhất, ngày lớn nhất]
    if (gop) {
      const dem = QQ.demLuotTheoBcvhNgay(db, ...hopBao);
      for (const x of can) dat(luyKeLuot, LUY_KE_NGAY_MAX, x.k, { chuKy: chuKy.get(x.k) || QQ.CHU_KY_TRONG, tong_shbg: dem.has(x.k) ? dem.get(x.k).tong_shbg : 0 }, now);
    } else {
      const tinh = QQ.tinhTheoBcvhNgay(db, ...hopBao);
      for (const x of can) dat(luyKeNgay, LUY_KE_NGAY_MAX, x.k, { chuKy: chuKy.get(x.k) || QQ.CHU_KY_TRONG, g: tinh.get(x.k) || null }, now);
    }
  }
  const agg = new Map();
  for (const ma of kh.codes) {
    for (const ngay of kh.ngays) {
      const e = kho.get(`${ma}|${ngay}`);
      if (!e) continue;
      if (gop) { if (e.kq.tong_shbg) agg.set(`${ma}|${ngay}`, { tong_shbg: e.kq.tong_shbg }); } else if (e.kq.g) agg.set(`${ma}|${ngay}`, e.kq.g);
    }
  }
  // Nhiều BCVH: số của ngày theo (tập BCVH yêu cầu, ngày), tính lại khi tập BCVH đủ điều kiện hoặc chữ ký của một trong số đó đổi, hoặc quá tuổi tối đa của tầng.
  const khoaMa = kh.codes.join(',');
  const gopNgay = !gop ? null : (ngay, coDuLieu) => {
    const k = `${khoaMa}|${ngay}`;
    const sig = `${coDuLieu.join(',')}#${coDuLieu.map((ma) => chuKy.get(`${ma}|${ngay}`) || QQ.CHU_KY_TRONG).join('/')}`;
    const e = luyKeNgayGop.get(k);
    if (e && now - e.luc < tuoiCua(ngay) && e.kq.sig === sig) return e.kq.g;
    demLuyKe.ngayGopTinhLai++;
    const g = QQ.tinhNgayGop(db, coDuLieu, ngay);
    dat(luyKeNgayGop, LUY_KE_NGAY_MAX, k, { sig, g }, now);
    return g;
  };
  const ketQua = QQ.ghepLuyKe(kh, QQ.thongTinFile(db, kh.codes, kh.tu, kh.den), agg, gopNgay);
  dat(luyKeKetQua, LUY_KE_KET_QUA_MAX, khoa, { token, ket_qua: ketQua }, now);
  return ketQua;
}

/** Chỉ để test / đo: số khóa đang giữ và bộ đếm tính lại của lũy kế. */
const thongKeLuyKe = () => ({ ket_qua: luyKeKetQua.size, ngay: luyKeNgay.size, luot: luyKeLuot.size, ngayGop: luyKeNgayGop.size, ...demLuyKe });

module.exports = { CACHE_MAX_AGE_MS, TONG_MAX, DANH_SACH_MAX, LUY_KE_KET_QUA_MAX, LUY_KE_NGAY_MAX, LUY_KE_NGAY_XA, LUY_KE_TUOI_NGAY_XA_MS, khoaKhung, luot, tongHop, theoNgay, luyKe, xoaCache, thongKe, thongKeLuyKe };
