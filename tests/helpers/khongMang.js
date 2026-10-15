// ==========================================
// Test cụm SFTP (5g-2, 5g-3) KHÔNG được phụ thuộc môi trường và KHÔNG được chạm mạng thật.
// server/index.js (nạp qua harness) gọi process.loadEnvFile() => nếu thư mục đang đứng có `.env` chứa SFTP_*, các biến đó lọt vào process.env SAU khi test file bắt đầu.
// Vì vậy phải cách ly SFTP_* cả ở đầu file test LẪN ngay sau startTestServer(), và đặt nguồn mặc định «cấm mạng» để lỡ chạm mạng thì đỏ ngay.
// ==========================================
'use strict';

const MANG_BI_CAM = 'KHÔNG ĐƯỢC KẾT NỐI MẠNG TRONG TEST';

/** Xóa mọi biến SFTP_* khỏi process.env; trả hàm khôi phục đúng các biến đã xóa. Gọi nhiều lần được (lần sau chỉ xóa phần mới lọt vào). */
function cachLySftpEnv() {
  const luu = {};
  for (const k of Object.keys(process.env)) {
    if (/^SFTP_/.test(k)) { luu[k] = process.env[k]; delete process.env[k]; }
  }
  return () => { for (const [k, v] of Object.entries(luu)) process.env[k] = v; };
}

/** Nguồn mặc định giả: ketNoi ném lỗi nếu bị gọi. Dùng với thayTheXemTruoc.datNguon(...). */
const nguonCamMang = (dirs = ['/CSV_Report_533140']) => ({
  ketNoi: async () => { throw new Error(MANG_BI_CAM); },
  dirs,
  bimat: []
});

module.exports = { MANG_BI_CAM, cachLySftpEnv, nguonCamMang };
