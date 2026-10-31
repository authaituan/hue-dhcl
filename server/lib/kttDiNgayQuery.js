// ==========================================
// «Hàng tại KTT» — KTT-12: lớp TRUY VẤN của B1/B2/B3 (đi cùng ngày), hàng rớt lại, B5 và danh sách bấm ô. CHỈ ĐỌC DB (SELECT).
// Dùng lại lượt đọc SHBG của kttQuery.js (cùng quy tắc chọn túi đến / BD10 đi của KTT-5) và `phanLoaiShbg` của kttLuuThoat.js, nên «cùng ngày» ở đây
// là CÙNG MỘT định nghĩa với /api/ktt/luu-thoat. Hàm thuần nằm ở kttDiNgay.js. Tài liệu: docs/ai/43_KTT_DI_CUNG_NGAY_API.md.
// ==========================================
'use strict';
const Q = require('./kttQuery');
const S = require('./kttLuuThoat');
const L = require('./kttLichChuyen');
const D = require('./kttDiNgay');
const NG = require('./kttNguon');
const QL = require('./kttLuuThoatQuery');
const { DIA_BAN_PHAT_MAC_DINH } = require('./kttSchema');

const TEN_BCVH = Object.freeze(Object.fromEntries(DIA_BAN_PHAT_MAC_DINH.map(([ma, ten]) => [ma, ten])));
const LOAI_DANH_SACH = Object.freeze({ 'hom-sau': 'hom_sau', 'chua-di-24h': 'chua_di_tren_24h' });
const TRANG_TOI_DA = 200;

/** Lượt duyệt SHBG dùng chung: gọi cb(u, kq, pl) cho mỗi SHBG có ngày đến trong khoảng (kq = S.phanLoaiShbg, pl = D.phanLoaiDi). Không cần giờ chuyến để tính B nên bỏ chấm cũ của kttQuery. */
function chayShbg(db, { tuNgay, denNgay, bayGio }, cb) {
  const bayGioGiay = L.giayCua(bayGio);
  Q.chayTapLuuThoat(db, { tuNgay, denNgay, bayGio }, (c) => { // KTT-14: tập SHBG chung (gồm hàng chuyển tiếp)
    const ngu = { lich: c.lichChuyen.lich, hanPhut: c.lichChuyen.hanDenTruocChuyenPhut, bayGio: c.bayGio };
    return [{
      shbg(u) {
        if (!u.trongKhoangDen) return;
        const kq = S.phanLoaiShbg(u, ngu);
        cb(u, kq, D.phanLoaiDi(u, kq, bayGioGiay));
      }
    }];
  });
}

/** Bó số liệu MỘT ngày đến (D.taoNgay) tính ở «bây giờ» = bayGio. Cộng được: D.congCacNgay. */
function tinhNgay(db, ngay, bayGio) {
  const b = D.taoNgay(ngay);
  chayShbg(db, { tuNgay: ngay, denNgay: ngay, bayGio }, (u, kq, pl) => {
    b.co_du_lieu = true;
    if (pl.bo) b.bo[pl.bo]++;
    else D.themShbg(b, u, pl);
  });
  return b;
}

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);

const rongLaNull = (x) => (x === undefined || x === null || x === '' ? null : String(x));
/**
 * Bộ lọc của một ô (B5 / bảng rớt lại / B1) từ opts: { loai, duongThu?, noiGui?, huong?, hangHoan?, maBcvh? } -> { nhomCan, duongThu, noiGui, huong, hangHoan, maBcvh } (thiếu = null).
 * duongThu / noiGui: mã, hoặc NG.MA_LOC_RONG («__RONG__») = mã null / rỗng (KTT-8d2). hangHoan: false = loại hàng hoàn, true = chỉ hàng hoàn, null = cả hai.
 */
function boLocDanhSach(opts) {
  if (!Object.prototype.hasOwnProperty.call(LOAI_DANH_SACH, opts.loai)) throw new Q.LoiKtt('KTT_LOAI_SAI', `loai phải thuộc: ${Object.keys(LOAI_DANH_SACH).join(', ')}.`);
  return {
    nhomCan: LOAI_DANH_SACH[opts.loai], duongThu: rongLaNull(opts.duongThu), noiGui: rongLaNull(opts.noiGui), huong: rongLaNull(opts.huong), maBcvh: rongLaNull(opts.maBcvh),
    hangHoan: opts.hangHoan === undefined || opts.hangHoan === null ? null : !!opts.hangHoan
  };
}

/** Một dòng danh sách (JSON của /danh-sach, cũng là nguồn của sheet 8 xlsx). cho_gio = (giờ lập BD10 đi, hoặc «bây giờ» nếu chưa đi) − (giờ quét túi đến, thiếu thì giờ xác nhận BD10 đến), giờ đồng hồ, 1 chữ số thập phân. */
function dongDanhSach(u, pl, bayGioGiay) {
  const moc = u.quetDen || u.xndBd10 || null;
  const cuoi = u.gioBd10Di ? L.giayCua(u.gioBd10Di) : bayGioGiay;
  return {
    shbg: u.shbg, ngay_den: u.ngayDen, gio_den_ktt: u.quetDen || null, xnd_bd10_den: u.xndBd10 || null,
    kg: NG.thieuKhoiLuong(u) ? null : NG.r3(u.gam / 1000), ma_bcvh: u.maBcvh || null, ten_bcvh: u.maBcvh ? (TEN_BCVH[u.maBcvh] || null) : null,
    huong: pl.huongDong, hang_hoan: pl.hanHoan, nguon_hang: u.nguonHang, nhom: pl.nhom, bd10_di_gio_lap: u.gioBd10Di || null,
    cho_gio: moc && L.giayCua(moc) !== null && cuoi !== null ? Math.round(((cuoi - L.giayCua(moc)) / 3600) * 10) / 10 : null,
    duong_thu_ma: u.duongThuDenMa || null, duong_thu_ten: u.duongThuDenTen || null, noi_gui_ma: u.diemGuiDen || null, noi_gui_ten: u.diemGuiDenTen || null
  };
}

/**
 * KTT-8d: lượt duyệt DÙNG CHUNG của /danh-sach (phân trang) và sheet 8 xlsx (toàn bộ): gọi cb(u, pl) cho MỖI SHBG thuộc ô `loc` (boLocDanhSach), theo thứ tự đọc (SHBG).
 * Không có dữ liệu (bayGio null / thiếu bảng) -> không gọi cb.
 */
function duyetDanhSach(db, { tuNgay, denNgay, bayGio }, loc, cb) {
  if (bayGio === null || bayGio === undefined || !coBang(db, 'ktt_tui') || !coBang(db, 'ktt_buu_gui')) return;
  chayShbg(db, { tuNgay, denNgay, bayGio }, (u, kq, pl) => {
    if (pl.bo || pl.khac || pl.nhom !== loc.nhomCan) return;
    if (!NG.khopMaLoc(loc.duongThu, u.duongThuDenMa) || !NG.khopMaLoc(loc.noiGui, u.diemGuiDen)) return; // KTT-8d2: NG.MA_LOC_RONG = mã null / rỗng
    const huongDong = pl.huongDong;
    if (loc.huong !== null && huongDong !== loc.huong) return;
    if (loc.hangHoan !== null && pl.hanHoan !== loc.hangHoan) return;
    if (loc.maBcvh !== null && u.maBcvh !== loc.maBcvh) return;
    cb(u, pl);
  });
}

/**
 * Danh sách bưu gửi của một ô (mở từ bảng rớt lại / B5). opts: { tuNgay, denNgay (≤ 31 ngày), loai ('hom-sau' | 'chua-di-24h'), duongThu?, noiGui?, huong?, hangHoan? (true/false), maBcvh?,
 * trang (≥ 1), kichThuocTrang (1..200), bayGio? }. Số dòng (`tong`) = ô tương ứng của D.tongHop / D.theoDuongThu cùng bộ lọc (có test). Sắp theo SHBG (thứ tự đọc), ổn định giữa các trang.
 */
function danhSach(db, opts = {}) {
  const k = QL.chuanHoaNgay(opts);
  const loc = boLocDanhSach(opts);
  const so = (x, macDinh) => { const n = x === undefined || x === null ? macDinh : Number(x); return Number.isInteger(n) && n >= 1 ? n : null; };
  const trang = so(opts.trang, 1);
  const kichThuoc = so(opts.kichThuocTrang, 50);
  if (trang === null || kichThuoc === null) throw new Q.LoiKtt('KTT_TRANG_SAI', 'trang và kichThuocTrang phải là số nguyên dương.');
  const kichThuocTrang = Math.min(kichThuoc, TRANG_TOI_DA);
  const doMoi = QL.docDoMoi(db);
  const bayGio = opts.bayGio !== undefined && opts.bayGio !== null ? opts.bayGio : (doMoi ? doMoi.nguon_xuat_luc : null);
  const batDau = (trang - 1) * kichThuocTrang;
  const bayGioGiay = bayGio === null ? null : L.giayCua(bayGio);
  const dong = [];
  let tong = 0;
  duyetDanhSach(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio }, loc, (u, pl) => {
    if (tong >= batDau && dong.length < kichThuocTrang) dong.push(dongDanhSach(u, pl, bayGioGiay));
    tong++;
  });
  return { tong, trang, kichThuocTrang, soTrang: Math.ceil(tong / kichThuocTrang), dong, bay_gio: bayGio, nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null };
}

module.exports = { tinhNgay, danhSach, chayShbg, boLocDanhSach, dongDanhSach, duyetDanhSach, TEN_BCVH, LOAI_DANH_SACH, TRANG_TOI_DA };
