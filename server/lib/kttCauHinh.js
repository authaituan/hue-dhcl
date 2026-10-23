// ==========================================
// Đọc cấu hình «Hàng tại KTT» (KTT-4): lịch mốc chuyến (ktt_cau_hinh_chuyen) và ngưỡng (ktt_cau_hinh), schema ở server/lib/kttSchema.js.
// CHỈ ĐỌC, không ghi DB. Thiếu bảng / thiếu khóa / giá trị hỏng -> dùng mặc định V1 và ghi lý do vào `canhBao` (không ném lỗi).
// Kết quả đưa thẳng cho server/lib/kttTinh.js (danhGiaChuyen dùng `lich`, các hàm khác dùng `nguong`).
// ==========================================
'use strict';
const { NGUONG_MAC_DINH } = require('./kttTinh');

// khóa trong ktt_cau_hinh -> tên trường của đối tượng `nguong`
const KHOA_NGUONG = Object.freeze({
  treo_phut: 'treoPhut',
  nam_lau_toi_da_phut: 'namLauToiDaPhut',
  chi_tieu_f13_gio: 'chiTieuF13Gio',
  chi_tieu_f13_gio_thuan_hoa_phu_xuan: 'chiTieuF13GioThuanHoaPhuXuan'
});
const TEN_CHUYEN = ['SANG', 'TRUA', 'TOI'];

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);

/**
 * @returns {{ lich: Object<string, Array<{ten: string, gioMoc: string, chotTruocPhut: number}>>,
 *             nguong: {treoPhut: number, namLauToiDaPhut: number, chiTieuF13Gio: number, chiTieuF13GioThuanHoaPhuXuan: number},
 *             canhBao: string[] }}
 * `lich[maBcvh]` sắp xếp tăng dần theo gioMoc ('HH:MM'). Không có bảng chuyến -> lich rỗng + canhBao.
 */
function docCauHinhKtt(db) {
  const canhBao = [];
  const lich = {};
  const nguong = { ...NGUONG_MAC_DINH };

  if (!coBang(db, 'ktt_cau_hinh_chuyen')) {
    canhBao.push('Thiếu bảng ktt_cau_hinh_chuyen: lịch mốc chuyến để trống.');
  } else {
    try {
      const dong = db.prepare('SELECT ma_bcvh, ten_chuyen, gio_moc, gio_chot_truoc_phut FROM ktt_cau_hinh_chuyen ORDER BY ma_bcvh, gio_moc, ten_chuyen').all();
      for (const r of dong) {
        const chot = Number(r.gio_chot_truoc_phut);
        if (!TEN_CHUYEN.includes(r.ten_chuyen) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.gio_moc)) || !Number.isFinite(chot) || chot < 0) {
          canhBao.push(`Bỏ qua dòng mốc chuyến không hợp lệ của BCVH ${r.ma_bcvh}.`);
          continue;
        }
        (lich[r.ma_bcvh] = lich[r.ma_bcvh] || []).push({ ten: r.ten_chuyen, gioMoc: r.gio_moc, chotTruocPhut: chot });
      }
      if (!dong.length) canhBao.push('Bảng ktt_cau_hinh_chuyen chưa có dòng nào: lịch mốc chuyến để trống.');
    } catch (e) {
      canhBao.push('Không đọc được ktt_cau_hinh_chuyen: lịch mốc chuyến để trống.');
    }
  }

  let giaTri = null;
  if (!coBang(db, 'ktt_cau_hinh')) {
    canhBao.push('Thiếu bảng ktt_cau_hinh: dùng ngưỡng mặc định.');
  } else {
    try {
      giaTri = Object.fromEntries(db.prepare('SELECT khoa, gia_tri FROM ktt_cau_hinh').all().map((r) => [r.khoa, r.gia_tri]));
    } catch (e) {
      canhBao.push('Không đọc được ktt_cau_hinh: dùng ngưỡng mặc định.');
    }
  }
  for (const [khoa, truong] of giaTri ? Object.entries(KHOA_NGUONG) : []) {
    const tho = giaTri[khoa];
    if (tho === undefined || tho === null) { canhBao.push(`Thiếu ngưỡng ${khoa}: dùng mặc định ${NGUONG_MAC_DINH[truong]}.`); continue; }
    const v = typeof tho === 'string' && tho.trim() === '' ? NaN : Number(tho);
    if (!Number.isFinite(v) || v <= 0) { canhBao.push(`Ngưỡng ${khoa} không hợp lệ: dùng mặc định ${NGUONG_MAC_DINH[truong]}.`); continue; }
    nguong[truong] = v;
  }
  return { lich, nguong, canhBao };
}

module.exports = { docCauHinhKtt, KHOA_NGUONG };
