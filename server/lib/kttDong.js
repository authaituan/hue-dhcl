// ==========================================
// «Hàng tại KTT» (KTT-8b, KTT-8c): MỘT DÒNG «Lưu thoát» của một SHBG — 17 trường dùng chung cho chi-tiet (JSON) và sheet 7 của file xlsx. CÁC HÀM THUẦN: không DB, không giờ máy.
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
 * 17 trường (tên snake_case của API chi-tiet; cùng thứ tự cột sheet 7). Thiếu dữ liệu -> null.
 * Hàng hoàn Tổ KHHH: dat_khong_dat = «Loại trừ»; không phân loại được (thiếu giờ quét đến / không xếp được chuyến): «Không tính».
 */
function dongChiTiet(u, kq) {
  const d = kq.datKhongDat || null;
  const ch = kq.chuyen || null;
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
    phan_loai: nhanNhom(kq, u.nhom),
    trang_thai: kq.trangThai ? NHAN_TRANG_THAI[kq.trangThai] : null,
    ngay_luu_thoat: u.ngayDen || null
  };
}

module.exports = { TEN_BCVH, NHAN_TRANG_THAI, NHAN_LY_DO, NHAN_DAT, LOAI_TRU, KHONG_TINH, nhanNhom, dd, dongChiTiet };
