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
  Q.chayBoDem(db, { tuNgay, denNgay, bayGio, boQuaCham: true }, (c) => {
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

/**
 * Danh sách bưu gửi của một ô (mở từ bảng rớt lại / B5). opts: { tuNgay, denNgay (≤ 31 ngày), loai ('hom-sau' | 'chua-di-24h'), duongThu?, noiGui?, huong?, hangHoan? (true/false), maBcvh?,
 * trang (≥ 1), kichThuocTrang (1..200), bayGio? }. Số dòng (`tong`) = ô tương ứng của D.tongHop / D.theoDuongThu cùng bộ lọc (có test). Sắp theo SHBG (thứ tự đọc), ổn định giữa các trang.
 */
function danhSach(db, opts = {}) {
  const k = QL.chuanHoaNgay(opts);
  if (!Object.prototype.hasOwnProperty.call(LOAI_DANH_SACH, opts.loai)) throw new Q.LoiKtt('KTT_LOAI_SAI', `loai phải thuộc: ${Object.keys(LOAI_DANH_SACH).join(', ')}.`);
  const nhomCan = LOAI_DANH_SACH[opts.loai];
  const so = (x, macDinh) => { const n = x === undefined || x === null ? macDinh : Number(x); return Number.isInteger(n) && n >= 1 ? n : null; };
  const trang = so(opts.trang, 1);
  const kichThuoc = so(opts.kichThuocTrang, 50);
  if (trang === null || kichThuoc === null) throw new Q.LoiKtt('KTT_TRANG_SAI', 'trang và kichThuocTrang phải là số nguyên dương.');
  const kichThuocTrang = Math.min(kichThuoc, TRANG_TOI_DA);
  const duongThu = opts.duongThu === undefined || opts.duongThu === null || opts.duongThu === '' ? null : String(opts.duongThu);
  const noiGui = opts.noiGui === undefined || opts.noiGui === null || opts.noiGui === '' ? null : String(opts.noiGui);
  const huong = opts.huong === undefined || opts.huong === null || opts.huong === '' ? null : String(opts.huong);
  const maBcvh = opts.maBcvh === undefined || opts.maBcvh === null || opts.maBcvh === '' ? null : String(opts.maBcvh);
  const hangHoan = opts.hangHoan === undefined || opts.hangHoan === null ? null : !!opts.hangHoan;
  const doMoi = QL.docDoMoi(db);
  const bayGio = opts.bayGio !== undefined && opts.bayGio !== null ? opts.bayGio : (doMoi ? doMoi.nguon_xuat_luc : null);
  const ra = (tong, dong) => ({ tong, trang, kichThuocTrang, soTrang: Math.ceil(tong / kichThuocTrang), dong, bay_gio: bayGio, nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null });
  if (bayGio === null || !coBang(db, 'ktt_tui') || !coBang(db, 'ktt_buu_gui')) return ra(0, []);
  const batDau = (trang - 1) * kichThuocTrang;
  const bayGioGiay = L.giayCua(bayGio);
  const dong = [];
  let tong = 0;
  chayShbg(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio }, (u, kq, pl) => {
    if (pl.bo || pl.khac || pl.nhom !== nhomCan) return;
    if (duongThu !== null && String(u.duongThuDenMa || '').trim() !== duongThu) return;
    if (noiGui !== null && String(u.diemGuiDen || '').trim() !== noiGui) return;
    const huongDong = pl.huong === D.HUONG.NOI_TINH_HANG_HOAN ? D.HUONG.NOI_TINH_DEN_BCVH : pl.huong;
    if (huong !== null && huongDong !== huong) return;
    if (hangHoan !== null && pl.hanHoan !== hangHoan) return;
    if (maBcvh !== null && u.maBcvh !== maBcvh) return;
    if (tong >= batDau && dong.length < kichThuocTrang) {
      const moc = u.quetDen || u.xndBd10 || null;
      const cuoi = u.gioBd10Di ? L.giayCua(u.gioBd10Di) : bayGioGiay;
      dong.push({
        shbg: u.shbg, ngay_den: u.ngayDen, gio_den_ktt: u.quetDen || null, xnd_bd10_den: u.xndBd10 || null,
        kg: NG.thieuKhoiLuong(u) ? null : NG.r3(u.gam / 1000), ma_bcvh: u.maBcvh || null, ten_bcvh: u.maBcvh ? (TEN_BCVH[u.maBcvh] || null) : null,
        huong: huongDong, hang_hoan: pl.hanHoan, nhom: pl.nhom, bd10_di_gio_lap: u.gioBd10Di || null,
        cho_gio: moc && L.giayCua(moc) !== null && cuoi !== null ? Math.round(((cuoi - L.giayCua(moc)) / 3600) * 10) / 10 : null,
        duong_thu_ma: u.duongThuDenMa || null, duong_thu_ten: u.duongThuDenTen || null, noi_gui_ma: u.diemGuiDen || null, noi_gui_ten: u.diemGuiDenTen || null
      });
    }
    tong++;
  });
  return ra(tong, dong);
}

module.exports = { tinhNgay, danhSach, chayShbg, TEN_BCVH, LOAI_DANH_SACH, TRANG_TOI_DA };
