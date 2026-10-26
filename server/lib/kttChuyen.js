// ==========================================
// «Hàng tại KTT» (KTT-7b): cầu nối giữa lịch chuyến chính thức (server/lib/kttLichChuyen.js, KTT-7a) và phần «chuyến» của kttQuery.js.
// `danhGiaChuyenLich` trả CÙNG HÌNH DẠNG với kttTinh.danhGiaChuyen (lịch V1) để các bộ đếm của kttQuery / kttDanhGia không phải đổi cấu trúc,
// nhưng chuyến thuộc / giờ xuất phát lấy từ ktt_lich_chuyen: tên chuyến là GIỜ XE RỜI KTT dạng 'HH:MM' (không còn SANG / TRUA / TOI);
// hạn hàng đến = giờ rời − han_den_truoc_chuyen_phut (60). THUẦN: không DB, không giờ máy, không new Date(chuỗi) / Date.parse.
// Trạng thái ánh xạ từ danhGiaDiChuyen: DUNG_CHUYEN -> DUNG_CHUYEN, TRUOT_CHUYEN -> TRE_CHUYEN, LO_CHUYEN -> LO_CHUYEN, CHUA_DEN_GIO -> CHUA_DEN_MOC.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');

const MA_TRANG_THAI = Object.freeze({ DUNG_CHUYEN: 'DUNG_CHUYEN', TRUOT_CHUYEN: 'TRE_CHUYEN', LO_CHUYEN: 'LO_CHUYEN', CHUA_DEN_GIO: 'CHUA_DEN_MOC' });
const MA_LY_DO = Object.freeze({ KHONG_PHAI_BCVH_HUE: 'DICH_KHONG_PHAI_BCVH_HUE', THIEU_GIO_DEN: 'THIEU_MOC_QUET_DEN', GIO_DEN_SAI: 'THIEU_MOC_QUET_DEN', KHONG_CO_LICH: 'KHONG_CO_LICH' });

const chuoiGio = (x) => (typeof x === 'string' && L.giayCua(x) !== null ? x.trim() : null);
const chuyenRa = (c) => (c ? { ten: c.gio_xuat_phat, moc: c.xuat_phat_luc } : null);

/**
 * { quetDen, gioDi (giờ lập BD10 đi), bay_gio, maBcvh, lich (mảng dòng lịch, xem kttLichChuyen), hanPhut }.
 * Trả { trangThai, lyDo, chuyenDuKien: { ten: 'HH:MM', moc } | null, soChuyenTre, denSatGio, kipChuyenSat, chuyenSatGio, gioDiTruocQuetDen } — như kttTinh.danhGiaChuyen.
 * denSatGio = quetDen ∈ (hạn đến, giờ rời] của một chuyến trong ngày đến (chuyến đó coi là lỡ); kipChuyenSat = gioDi ≤ giờ rời của chuyến sát giờ, null khi không sát giờ hoặc chưa đi.
 * soChuyenTre = số chuyến của BCVH có giờ rời trong [giờ rời chuyến dự kiến, giờ đi thực tế hoặc bay_gio).
 */
function danhGiaChuyenLich({ quetDen, gioDi, bay_gio: bayGio, maBcvh, lich, hanPhut } = {}) {
  const khong = (lyDo) => ({ trangThai: 'KHONG_AP_DUNG', lyDo, chuyenDuKien: null, soChuyenTre: null, denSatGio: false, kipChuyenSat: null, chuyenSatGio: null, gioDiTruocQuetDen: false });
  const tuyChon = { hanDenTruocChuyenPhut: hanPhut };
  const x = L.xepChuyen(lich, String(maBcvh ?? '').trim(), quetDen, tuyChon);
  if (!x.ok) return khong(MA_LY_DO[x.ly_do]);
  const di = chuoiGio(gioDi);
  const bay = chuoiGio(bayGio);
  if (di === null && bay === null) return khong('THIEU_BAY_GIO');
  const quet = L.giayCua(quetDen);
  const dg = L.danhGiaDiChuyen({ chuyen: x.chuyen, gioLapBd10Di: di, bayGio: bay, gioDen: quetDen });
  const trangThai = MA_TRANG_THAI[dg.trang_thai];
  const giayDuKien = L.giayCua(x.chuyen.xuat_phat_luc);
  const giayCuoi = L.giayCua(di !== null ? di : bay);

  let soChuyenTre = 0;
  if (trangThai === 'TRE_CHUYEN' || trangThai === 'LO_CHUYEN') {
    for (let ngay = x.chuyen.ngay; ngay <= String(L.dinhDang(giayCuoi)).slice(0, 10); ngay = L.dinhDang(L.giayCua(`${ngay} 00:00:00`) + 86400).slice(0, 10)) {
      for (const c of L.chuyenTrongNgay(lich, x.chuyen.ma_bcvh, ngay, tuyChon)) {
        const g = L.giayCua(c.xuat_phat_luc);
        if (g >= giayDuKien && g < giayCuoi) soChuyenTre++;
      }
    }
  }

  const trongNgayDen = L.chuyenTrongNgay(lich, x.chuyen.ma_bcvh, String(quetDen).trim().slice(0, 10), tuyChon);
  const satGio = trongNgayDen.find((c) => quet > L.giayCua(c.han_den_luc) && quet <= L.giayCua(c.xuat_phat_luc)) || null;

  return {
    trangThai, lyDo: null, chuyenDuKien: chuyenRa(x.chuyen), soChuyenTre,
    denSatGio: !!satGio,
    kipChuyenSat: satGio && di !== null ? L.giayCua(di) <= L.giayCua(satGio.xuat_phat_luc) : null,
    chuyenSatGio: chuyenRa(satGio),
    gioDiTruocQuetDen: di !== null && L.giayCua(di) < quet
  };
}

module.exports = { danhGiaChuyenLich, MA_TRANG_THAI };
