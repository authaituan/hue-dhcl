// ==========================================
// SANLUONG-5e: LỚP KẾT NỐI SFTP — nơi DUY NHẤT trong máy chủ nạp thư viện `ssh2-sftp-client` (nạp lười, chỉ khi thật sự kết nối).
// Trả giao diện tối thiểu { list(thuMuc), get(duongDanTuXa, duongDanCucBo), end() } mà lõi đồng bộ (sftpSync.js) cần. CHỈ thao tác ĐỌC:
// connect / list / get (tải xuống đường dẫn cục bộ) / end. Bắt buộc ghim vân tay khoá máy chủ (kiểm TRƯỚC khi gửi mật khẩu).
// Lỗi vân tay sai: Error có cờ `saiVanTay = true` để bộ hẹn giờ tạm dừng (không thử lại mật khẩu mỗi chu kỳ).
// Không in / ghi tên đăng nhập, mật khẩu. Docs: docs/ai/15_SFTP_SCHEDULER.md.
// ==========================================
'use strict';
const F = require('./sftpFiles');

function choToiDa(promise, giay, nhan) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`${nhan}: quá ${giay} giây`), { code: 'ETIMEDOUT' })), giay * 1000);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * cfg: kết quả F.docCauHinh (host, port, user, password, ghimHex). tuyChon: { ketNoiGiay, lietKeGiay, taiGiay, nap } — `nap` (tiêm cho test) trả lớp SftpClient.
 * Ném lỗi (đã gắn `saiVanTay` nếu khoá không khớp) khi không kết nối được; đã cố đóng kết nối trước khi ném.
 */
async function ketNoiSftp(cfg, { ketNoiGiay = 15, lietKeGiay = 30, taiGiay = 180, nap = () => require('ssh2-sftp-client') } = {}) {
  const SftpClient = nap();
  const khoa = F.taoKiemTraKhoa(cfg.ghimHex);
  const sftp = new SftpClient('hue-dhcl-sftp-sync');
  try {
    await choToiDa(sftp.connect({
      host: cfg.host, port: cfg.port, username: cfg.user, password: cfg.password,
      readyTimeout: ketNoiGiay * 1000, hostVerifier: khoa.kiemTra
    }), ketNoiGiay + 5, 'Kết nối');
  } catch (err) {
    try { await choToiDa(sftp.end(), 5, 'Đóng kết nối'); } catch (e) { /* đã đóng */ }
    if (khoa.trangThai.khop === false) err.saiVanTay = true;
    throw err;
  }
  return {
    list: (dir) => choToiDa(sftp.list(dir), lietKeGiay, `Liệt kê ${F.tenAnToan(dir, 60)}`),
    get: (xa, cucBo) => choToiDa(sftp.get(xa, cucBo), taiGiay, 'Tải file'),
    end: async () => { try { await choToiDa(sftp.end(), 5, 'Đóng kết nối'); } catch (e) { /* đã đóng */ } }
  };
}

module.exports = { ketNoiSftp };
