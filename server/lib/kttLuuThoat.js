// ==========================================
// «Hàng tại KTT» — trang «Lưu thoát» (KTT-7b): phân loại MỘT SHBG vào năm trạng thái lưu thoát, đạt / không đạt chỉ tiêu 14 giờ, hàng hoàn Tổ KHHH,
// và bộ cộng theo ngày × BCVH. CÁC HÀM THUẦN: không DB, không giờ máy («bây giờ» luôn là tham số `bayGio`), không new Date(chuỗi) / Date.parse / Date.now.
// Phần truy vấn (đọc ktt_*) nằm ở server/lib/kttLuuThoatQuery.js. Tài liệu: docs/ai/41_KTT_LUU_THOAT.md.
//
// Mốc dùng (mỗi chỉ số ghi rõ ở trường `moc`):
//   - ngày đến D, xếp chuyến, năm trạng thái: Gio_quet_tui_den (gio_quet_tui_den) — PO xác nhận 26/10/2026;
//   - đã đi: giờ LẬP BD10 đi (bd10_di_gio_di, SendingTime);
//   - đạt / không đạt: ConfirmDate (bd10_den_xnd) -> giờ lập BD10 đi, trừ khung đêm 21:00–07:00 (quyThoiGian.js), chỉ tiêu quyThoiGianChiTieu.chiTieuGio.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const { thoiGianThucGiay } = require('./quyThoiGian');
const { chiTieuGio } = require('./quyThoiGianChiTieu');

const MA_TO_KHHH = '531120';
const MA_THUAN_HOA = '533140';
const GIO_CHOT_NGAY = '09:00:00'; // số của ngày D chỉ chốt sau cặp 09:00 của D+1
const SO_NGAY_TOI_DA = 31;

const NHOM = Object.freeze({
  PHAN_LOAI: 'PHAN_LOAI', HANG_HOAN: 'HANG_HOAN', KHONG_RO_DICH: 'KHONG_RO_DICH', NGOAI_PHAM_VI: 'NGOAI_PHAM_VI',
  KHONG_CO_GIO_QUET_DEN: 'KHONG_CO_GIO_QUET_DEN', KHONG_XEP_DUOC_CHUYEN: 'KHONG_XEP_DUOC_CHUYEN'
});
const TRANG_THAI = Object.freeze({ T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', DANG_CHO_CHUYEN: 'DANG_CHO_CHUYEN' });
const DAT = Object.freeze({ DAT: 'DAT', KHONG_DAT: 'KHONG_DAT', CHUA_DI: 'CHUA_DI', CHUA_DO_DUOC: 'CHUA_DO_DUOC', XND_SAU_GIO_DI: 'XND_SAU_GIO_DI' });
const MOC = Object.freeze({
  luu_thoat: 'gio_quet_tui_den', xep_chuyen: 'gio_quet_tui_den', gio_di: 'bd10_di_gio_di', chi_tieu: 'bd10_den_xnd -> bd10_di_gio_di'
});

const giay = (x) => (typeof x === 'string' ? L.giayCua(x) : null);
const ngayCua = (g) => L.dinhDang(g).slice(0, 10);
const ngayKe = (ymd) => ngayCua(L.giayCua(`${ymd} 00:00:00`) + 86400);
const tuNgayDen = (tu, den) => { const ds = []; for (let d = tu; d <= den; d = ngayKe(d)) ds.push(d); return ds; };

// ------------------------------------------
// Đạt / không đạt chỉ tiêu (ConfirmDate -> giờ lập BD10 đi; chưa đi -> bayGio)
// ------------------------------------------
/**
 * { xnd (bd10_den_xnd), gioLapBd10Di, bayGio, maBcvh, tenPhuong }. Trả { trangThai: DAT | KHONG_DAT | CHUA_DI | CHUA_DO_DUOC | XND_SAU_GIO_DI, thucGiay, chiTieuGio }.
 *  - chưa xác nhận đến (xnd rỗng / sai): CHUA_DO_DUOC (không tính đạt / không đạt);
 *  - xác nhận đến SAU khi đã đi: XND_SAU_GIO_DI (kết quả âm, không làm tròn về 0; không tính đạt / không đạt);
 *  - đã đi: DAT nếu thực tế (trừ khung đêm) ≤ chỉ tiêu (đúng biên 14:00:00 là đạt, 14:00:01 là không đạt), ngược lại KHONG_DAT;
 *  - chưa đi: tính tới bayGio — đã quá chỉ tiêu thì KHONG_DAT, chưa thì CHUA_DI.
 */
function danhGiaChiTieu({ xnd, gioLapBd10Di, bayGio, maBcvh, tenPhuong } = {}) {
  const gio = chiTieuGio(maBcvh, tenPhuong);
  const ra = (trangThai, thucGiay = null) => ({ trangThai, thucGiay, chiTieuGio: gio });
  if (giay(xnd) === null) return ra(DAT.CHUA_DO_DUOC);
  const co = giay(gioLapBd10Di) !== null;
  const cuoi = co ? gioLapBd10Di : bayGio;
  const thuc = thoiGianThucGiay(xnd, cuoi);
  if (thuc === null) return ra(DAT.CHUA_DO_DUOC);
  if (co) {
    if (giay(gioLapBd10Di) < giay(xnd)) return ra(DAT.XND_SAU_GIO_DI, thuc);
    return ra(thuc <= gio * 3600 ? DAT.DAT : DAT.KHONG_DAT, thuc);
  }
  if (thuc < 0) return ra(DAT.CHUA_DI, thuc);
  return ra(thuc <= gio * 3600 ? DAT.CHUA_DI : DAT.KHONG_DAT, thuc);
}

// ------------------------------------------
// Phân loại một SHBG
// ------------------------------------------
/**
 * u: { ngayDen (D), nhom ('BCVH_HUE' | 'HE1_530900' | 'KTT' | 'KHAC' | 'KHONG_RO'), maBcvh, noiGuiGoc (nơi gửi BD10 của túi đến GỐC), quetDen (Gio_quet_tui_den),
 *      gioBd10Di (giờ lập BD10 đi), xndBd10 (bd10_den_xnd), tenPhuong }.
 * ngu: { lich (dòng lịch chuyến), hanPhut, bayGio }.
 * Trả { nhom: NHOM.*, ... }. PHAN_LOAI / HANG_HOAN kèm { maBcvh, trangThai (T1..T5 | DANG_CHO_CHUYEN), chuyenKq ('DUNG' | 'TRUOT' | 'LO' | 'CHUA_DEN_GIO'), chuyen, diTruocKhiDen, datKhongDat }.
 *  Thứ tự: đích không rõ -> ngoài phạm vi (530900, KHAC, KTT) -> hàng hoàn Tổ KHHH -> thiếu giờ quét đến -> không xếp được chuyến -> năm trạng thái.
 *  Hàng hoàn Tổ KHHH = túi đến gốc có nơi gửi BD10 là 531120 VÀ đích BCVH Thuận Hóa (533140). Từ 531120 mà đích BCVH Huế khác: tính như hàng thường, gắn `tu531120KhacThuanHoa`.
 */
function phanLoaiShbg(u, ngu) {
  if (u.nhom === 'KHONG_RO') return { nhom: NHOM.KHONG_RO_DICH };
  if (u.nhom !== 'BCVH_HUE') return { nhom: NHOM.NGOAI_PHAM_VI, loaiDich: u.nhom };
  const ma = u.maBcvh;
  const tu531120 = u.noiGuiGoc === MA_TO_KHHH;
  const hoan = tu531120 && ma === MA_THUAN_HOA;
  const goc = { maBcvh: ma, tu531120KhacThuanHoa: tu531120 && !hoan };
  const gioDi = giay(u.gioBd10Di) !== null ? u.gioBd10Di : null;
  const dat = danhGiaChiTieu({ xnd: u.xndBd10, gioLapBd10Di: gioDi, bayGio: ngu.bayGio, maBcvh: ma, tenPhuong: u.tenPhuong });
  const nhomDich = hoan ? NHOM.HANG_HOAN : NHOM.PHAN_LOAI;

  if (giay(u.quetDen) === null) return { ...goc, nhom: hoan ? NHOM.HANG_HOAN : NHOM.KHONG_CO_GIO_QUET_DEN, trangThai: null, datKhongDat: dat };
  const x = L.xepChuyen(ngu.lich, ma, u.quetDen, { hanDenTruocChuyenPhut: ngu.hanPhut });
  if (!x.ok) return { ...goc, nhom: hoan ? NHOM.HANG_HOAN : NHOM.KHONG_XEP_DUOC_CHUYEN, lyDo: x.ly_do, trangThai: null, datKhongDat: dat };
  const dg = L.danhGiaDiChuyen({ chuyen: x.chuyen, gioLapBd10Di: gioDi, bayGio: ngu.bayGio, gioDen: u.quetDen });
  if (dg.trang_thai === null) return { ...goc, nhom: hoan ? NHOM.HANG_HOAN : NHOM.KHONG_XEP_DUOC_CHUYEN, lyDo: dg.ly_do, trangThai: null, datKhongDat: dat };

  const D = u.ngayDen;
  let trangThai;
  let chuyenKq;
  if (gioDi !== null) {
    chuyenKq = dg.trang_thai === 'DUNG_CHUYEN' ? 'DUNG' : 'TRUOT';
    const ngayDi = ngayCua(giay(gioDi));
    if (ngayDi <= D) trangThai = chuyenKq === 'DUNG' ? TRANG_THAI.T1 : TRANG_THAI.T2;
    else if (ngayDi === ngayKe(D)) trangThai = chuyenKq === 'DUNG' ? TRANG_THAI.T3 : TRANG_THAI.T4;
    else trangThai = TRANG_THAI.T5;
  } else if (dg.trang_thai === 'LO_CHUYEN') { trangThai = TRANG_THAI.T5; chuyenKq = 'LO'; } else { trangThai = TRANG_THAI.DANG_CHO_CHUYEN; chuyenKq = 'CHUA_DEN_GIO'; }
  return { ...goc, nhom: nhomDich, trangThai, chuyenKq, chuyen: x.chuyen, diTruocKhiDen: !!dg.di_truoc_khi_den, datKhongDat: dat };
}

// ------------------------------------------
// Bộ cộng
// ------------------------------------------
const KHOA_T = [TRANG_THAI.T1, TRANG_THAI.T2, TRANG_THAI.T3, TRANG_THAI.T4, TRANG_THAI.T5, TRANG_THAI.DANG_CHO_CHUYEN];
const ty = (tu, mau) => (mau > 0 ? tu / mau : null);

/** Một khối số liệu (một ngày × một BCVH, hoặc tổng). Đơn vị đếm: SHBG khác nhau; số túi = số túi ĐẾN khác nhau chứa các SHBG đó. */
function taoKhoi() {
  const k = {
    tong: 0, tt: Object.fromEntries(KHOA_T.map((t) => [t, { shbg: 0, tui: new Set() }])),
    dung: 0, truot: 0, lo: 0, t5: { diTuD2Dung: 0, diTuD2Truot: 0, chuaDiLo: 0 },
    dat: Object.fromEntries(Object.values(DAT).map((d) => [d, 0])),
    khongCoGioQuetDen: 0, khongXepDuoc: {}, diTruocKhiDen: 0
  };
  return {
    them(kq, tuiId) {
      k.tong++;
      if (kq.trangThai === null || kq.trangThai === undefined) { // không phân loại được (thiếu giờ quét đến / không xếp được chuyến), kể cả hàng hoàn
        if (kq.lyDo) k.khongXepDuoc[kq.lyDo] = (k.khongXepDuoc[kq.lyDo] || 0) + 1; else k.khongCoGioQuetDen++;
        return;
      }
      const c = k.tt[kq.trangThai];
      c.shbg++;
      if (tuiId !== null && tuiId !== undefined) c.tui.add(tuiId);
      if (kq.trangThai !== TRANG_THAI.DANG_CHO_CHUYEN) {
        if (kq.chuyenKq === 'DUNG') k.dung++; else if (kq.chuyenKq === 'TRUOT') k.truot++; else if (kq.chuyenKq === 'LO') k.lo++;
        if (kq.trangThai === TRANG_THAI.T5) {
          if (kq.chuyenKq === 'DUNG') k.t5.diTuD2Dung++; else if (kq.chuyenKq === 'TRUOT') k.t5.diTuD2Truot++; else k.t5.chuaDiLo++;
        }
      }
      if (kq.diTruocKhiDen) k.diTruocKhiDen++;
      k.dat[kq.datKhongDat.trangThai]++;
    },
    ketQua() {
      const tt = Object.fromEntries(KHOA_T.map((t) => [t.toLowerCase(), { shbg: k.tt[t].shbg, tui: k.tt[t].tui.size }]));
      const chot = [TRANG_THAI.T1, TRANG_THAI.T2, TRANG_THAI.T3, TRANG_THAI.T4, TRANG_THAI.T5].reduce((s, t) => s + k.tt[t].shbg, 0);
      const luuThoat = k.tt.T1.shbg + k.tt.T2.shbg;
      return {
        tong_shbg: k.tong,
        trang_thai: tt,
        luu_thoat: { moc: MOC.luu_thoat, tu_so: luuThoat, mau_so: chot, ty_le: ty(luuThoat, chot) },
        dung_chuyen: { moc: MOC.xep_chuyen, tu_so: k.dung, mau_so: chot, ty_le: ty(k.dung, chot), truot_chuyen: k.truot, lo_chuyen: k.lo },
        chi_tiet_trang_thai_5: { di_tu_d2_dung_chuyen: k.t5.diTuD2Dung, di_tu_d2_truot_chuyen: k.t5.diTuD2Truot, chua_di_lo_chuyen: k.t5.chuaDiLo },
        dat_khong_dat: {
          moc: MOC.chi_tieu, dat: k.dat.DAT, khong_dat: k.dat.KHONG_DAT, chua_di: k.dat.CHUA_DI, chua_do_duoc: k.dat.CHUA_DO_DUOC, xnd_sau_gio_di: k.dat.XND_SAU_GIO_DI,
          ty_le_dat: ty(k.dat.DAT, k.dat.DAT + k.dat.KHONG_DAT)
        },
        khong_phan_loai: { khong_co_gio_quet_den: k.khongCoGioQuetDen, khong_xep_duoc_chuyen: { ...k.khongXepDuoc } },
        di_truoc_khi_den: k.diTruocKhiDen
      };
    }
  };
}

/** Ngày đã chốt chưa: độ mới của dữ liệu (nguon_xuat_luc mới nhất) ≥ 09:00 ngày D+1. So sánh chuỗi giờ (định dạng cố định). */
function daChot(ngay, doMoi, gioChot = GIO_CHOT_NGAY) {
  const gio = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(gioChot)) ? `${gioChot}:00` : GIO_CHOT_NGAY; // KTT-8: giờ chốt là tham số ('HH:MM'); sai dạng -> mặc định 09:00:00
  return typeof doMoi === 'string' && L.giayCua(doMoi) !== null && L.giayCua(doMoi) >= L.giayCua(`${ngayKe(ngay)} ${gio}`);
}

module.exports = {
  MA_TO_KHHH, MA_THUAN_HOA, GIO_CHOT_NGAY, SO_NGAY_TOI_DA, NHOM, TRANG_THAI, DAT, MOC,
  danhGiaChiTieu, phanLoaiShbg, taoKhoi, daChot, tuNgayDen, ngayKe
};
