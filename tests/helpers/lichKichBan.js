// ==========================================
// Bộ lịch chuyến GIẢ ĐỊNH dùng chung cho các test có kịch bản dựng sẵn quanh ngày nghỉ Chủ nhật (KTT-LICH-2).
// KHÔNG phải lịch chuẩn: lịch chuẩn 05/11/2026 nằm ở server/lib/kttSchema.js (LICH_CHUYEN_MAC_DINH). Các kịch bản «Hương Thủy nghỉ cả Chủ nhật», «Thuận Hóa nghỉ chuyến sát 12:30 vào Chủ nhật»…
// kiểm tra đúng LOGIC (xếp chuyến, nhóm nguyên nhân, đếm) và cần một lịch có chuyến nghỉ Chủ nhật ở nhiều BCVH; giữ nguyên bộ này để các số đã tính tay không phải tính lại.
// ==========================================
'use strict';

// [BCVH, giờ rời 'HH:MM', ngày chạy, nhãn | null]
const LICH_KICH_BAN = [
  ['535470', '06:00', 'CA_TUAN', null], ['535470', '12:00', 'CA_TUAN', null],
  ['536250', '06:30', 'NGHI_CN', null], ['536250', '12:30', 'NGHI_CN', null],
  ['535790', '08:00', 'CA_TUAN', null],
  ['537015', '07:30', 'CA_TUAN', null], ['537015', '13:30', 'NGHI_CN', null],
  ['537220', '07:30', 'CA_TUAN', null], ['537220', '13:00', 'NGHI_CN', null],
  ['533140', '07:00', 'CA_TUAN', null], ['533140', '12:30', 'CA_TUAN', null], ['533140', '19:45', 'CA_TUAN', null], ['533140', '22:00', 'CA_TUAN', 'C4'], ['533140', '12:55', 'NGHI_CN', null]
];

/** Thay toàn bộ ktt_lich_chuyen của `db` (đã ensureKttSchema) bằng bộ lịch giả định. */
function datLichKichBan(db) {
  db.exec('DELETE FROM ktt_lich_chuyen');
  const them = db.prepare("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, nhan, cap_nhat_luc) VALUES (?, ?, ?, ?, '2026-10-26 00:00:00')");
  for (const [ma, gio, ngay, nhan] of LICH_KICH_BAN) them.run(ma, gio, ngay, nhan);
}

module.exports = { LICH_KICH_BAN, datLichKichBan };
