// ==========================================
// «Hàng tại KTT» (KTT-8b, KTT-8c, KTT-10c): MỘT DÒNG «Lưu thoát» của một SHBG — 19 trường dùng chung cho chi-tiet (JSON) và sheet 7 của file xlsx (18 cột: mọi trường trừ dat_khong_dat). CÁC HÀM THUẦN: không DB, không giờ máy.
// Chỉ ĐỌC u (đơn vị SHBG của kttQuery) và kq (kttLuuThoat.phanLoaiShbg); không tính lại quy tắc nào. Chuỗi giờ giữ nguyên 'YYYY-MM-DD HH:MM:SS' giờ VN.
// ==========================================
'use strict';
const S = require('./kttLuuThoat');
const { DIA_BAN_PHAT_MAC_DINH } = require('./kttSchema');

const TEN_BCVH = new Map(DIA_BAN_PHAT_MAC_DINH.map(([ma, ten]) => [ma, ten]));

const NHAN_TRANG_THAI = Object.freeze({
  T1: '1 – Đi trong ngày, đúng chuyến', T2: '2 – Đi trong ngày, trượt chuyến',
  T3: '3 – Đi hôm sau, đúng chuyến', T4: '4 – Đi hôm sau, trượt chuyến',
  T5: '5 – Từ 2 ngày hoặc chưa đi', DANG_CHO_CHUYEN: 'Đang chờ chuyến (chưa đến giờ xe rời KTT)'
});
const NHAN_LY_DO = Object.freeze({
  KHONG_CO_LICH: 'không có chuyến trong lịch', THIEU_GIO_DEN: 'thiếu giờ quét đến', GIO_DEN_SAI: 'giờ quét đến sai', KHONG_PHAI_BCVH_HUE: 'không phải BCVH Huế',
  GIO_BD10_SAI: 'giờ lập BD10 đi sai', CHUYEN_SAI: 'chuyến sai'
});
const NHAN_DAT = Object.freeze({
  [S.DAT.DAT]: 'Đạt', [S.DAT.KHONG_DAT]: 'Không đạt', [S.DAT.CHUA_DI]: 'Chưa đi (chưa quá chỉ tiêu)',
  [S.DAT.CHUA_DO_DUOC]: 'Chưa đo được (chưa có xác nhận đến)', [S.DAT.XND_SAU_GIO_DI]: 'Xác nhận đến sau giờ lập BD10 đi'
});
// KTT-10c: nhãn kết quả «đạt 14 giờ» theo TỪNG mốc (khối chi_tieu_14h, kttLuuThoat.DO_MOC). Ba nhãn «Không đo được (…)» cộng lại = khong_do_duoc.tong của mốc đó.
const NHAN_DO_MOC = Object.freeze({
  [S.DO_MOC.DAT]: 'Đạt', [S.DO_MOC.KHONG_DAT]: 'Không đạt', [S.DO_MOC.THIEU_MOC]: 'Không đo được (thiếu mốc)',
  [S.DO_MOC.MOC_SAU_GIO_DI]: 'Không đo được (mốc sau giờ lập BD10 đi)', [S.DO_MOC.CHUA_DI]: 'Không đo được (chưa đi)'
});
const LOAI_TRU = 'Loại trừ';
const KHONG_TINH = 'Không tính';

function nhanNhom(kq, loaiDich) {
  switch (kq.nhom) {
    case S.NHOM.HANG_HOAN: return 'Hàng hoàn Tổ KHHH';
    case S.NHOM.KHONG_RO_DICH: return 'Đích không rõ';
    case S.NHOM.NGOAI_PHAM_VI: return `Ngoài phạm vi (${loaiDich || 'khác'})`;
    case S.NHOM.KHONG_CO_GIO_QUET_DEN: return 'Thiếu giờ quét túi đến';
    case S.NHOM.KHONG_XEP_DUOC_CHUYEN: return `Không xếp được chuyến (${NHAN_LY_DO[kq.lyDo] || kq.lyDo || 'không rõ lý do'})`;
    default: return kq.trangThai === S.TRANG_THAI.DANG_CHO_CHUYEN ? 'Đang chờ chuyến' : 'Đã phân loại 5 trạng thái';
  }
}

const dd = (ngay) => `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}/${ngay.slice(0, 4)}`;

/**
 * 19 trường (tên snake_case của API chi-tiet; cùng thứ tự cột sheet 7, sheet 7 không có cột dat_khong_dat từ KTT-10c). Thiếu dữ liệu -> null.
 * Hàng hoàn Tổ KHHH: dat_khong_dat, chi_tieu_14h_* = «Loại trừ»; không phân loại được (thiếu giờ quét đến / không xếp được chuyến): «Không tính».
 */
function dongChiTiet(u, kq) {
  const d = kq.datKhongDat || null;
  const ch = kq.chuyen || null;
  const c14 = kq.chiTieu14h || null;
  const moc = (m) => (kq.nhom === S.NHOM.HANG_HOAN ? LOAI_TRU : c14 ? NHAN_DO_MOC[c14[m].trangThai] || c14[m].trangThai : (d ? KHONG_TINH : null));
  return {
    shbg: u.shbg,
    duong_thu_den_ma: u.duongThuDenMa || null,
    duong_thu_den_ten: u.duongThuDenTen || null,
    gio_quet_tui_den: u.quetDen || null,
    gio_xac_nhan_bd10_den: u.xndBd10 || null,
    kg: typeof u.gam === 'number' && Number.isFinite(u.gam) ? u.gam / 1000 : null,
    ma_bcvh: u.maBcvh || null,
    ten_bcvh: u.maBcvh ? (TEN_BCVH.get(u.maBcvh) || null) : null,
    chuyen_lien_ke: ch ? `${TEN_BCVH.get(ch.ma_bcvh) || ch.ma_bcvh} ${ch.gio_xuat_phat} (${dd(ch.ngay)})` : null,
    gio_xuat_phat: ch ? ch.xuat_phat_luc : null,
    han_den_muon_nhat: ch ? ch.han_den_luc : null,
    gio_lap_bd10_di: u.gioBd10Di || null,
    gio_cho_gio: d && typeof d.thucGiay === 'number' ? d.thucGiay / 3600 : null,
    dat_khong_dat: kq.nhom === S.NHOM.HANG_HOAN ? LOAI_TRU : (d ? (kq.trangThai ? NHAN_DAT[d.trangThai] || d.trangThai : KHONG_TINH) : null),
    chi_tieu_14h_xnd: moc(S.MOC_CHI_TIEU.XND), // KTT-10c: mốc A (xác nhận BD10 đến -> lập BD10 đi)
    chi_tieu_14h_quet_tui_den: moc(S.MOC_CHI_TIEU.QUET_TUI_DEN), // KTT-10c: mốc B (quét túi đến KTT -> lập BD10 đi)
    phan_loai: nhanNhom(kq, u.nhom),
    trang_thai: kq.trangThai ? NHAN_TRANG_THAI[kq.trangThai] : null,
    ngay_luu_thoat: u.ngayDen || null,
    nguon_hang: u.nguonHang || 'khai_thac', // KTT-14: cờ nguồn (khai_thac | chuyen_tiep); chỉ có ở chi-tiet, KHÔNG thêm cột vào sheet 7
    luong_tui: u.luong || null // KTT-14: luồng của túi (KHAI_THAC_DEN, DI_NGOAI, DA_CHIA_SAN) — để PO xem hai luồng của hàng chuyển tiếp
  };
}

module.exports = { TEN_BCVH, NHAN_TRANG_THAI, NHAN_LY_DO, NHAN_DAT, NHAN_DO_MOC, LOAI_TRU, KHONG_TINH, nhanNhom, dd, dongChiTiet };
