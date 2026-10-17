// Nạp file .env (nếu có) TRƯỚC khi require các module đọc process.env (auth, security).
// Biến môi trường đã có sẵn luôn thắng giá trị trong .env. Không dùng dotenv.
try { process.loadEnvFile(); } catch (e) { /* không có .env: dùng biến môi trường hệ thống */ }

const express = require('express');
const path = require('path');
const fs = require('fs');
const { authRequired } = require('./auth');
const { createSecurity } = require('./security');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const dashboardWidgetsRoutes = require('./routes/dashboardWidgets');
const networkRoutes = require('./routes/network');
const organizationRoutes = require('./routes/organization');
const usersRoutes = require('./routes/users');
const arrivalsRoutes = require('./routes/arrivals');
const phatRoutes = require('./routes/phat');
const napNguonRoutes = require('./routes/napNguon');
const thamSoRoutes = require('./routes/thamSo');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Lớp bảo mật (server/security.js) — chạy TRƯỚC mọi thứ khác:
//   1. Lọc IP theo CMS_ALLOWED_IPS: IP không được phép nhận trang 404 (không
//      lộ là có hệ thống ở đây), API nhận 404 JSON; ghi data/security.log.
//   2. Header bảo mật cho mọi phản hồi.
//   3. Mọi /api/* (trừ đăng nhập) đều bắt buộc token — kể cả route đọc, và cả
//      route thêm sau này nếu quên gắn authRequired (mặc định là chặn).
// Không bật CORS: frontend chạy cùng địa chỉ với backend (bản build trong
// dist/ do chính server này phục vụ, hoặc qua proxy của Vite khi dev).
// ==========================================
const security = createSecurity();
app.locals.security = security; // routes/auth.js ghi nhật ký bảo mật qua req.app.locals.security
app.disable('x-powered-by');
app.use(security.ipFilter);
app.use(security.securityHeaders);
// Đăng nhập là route duy nhất chưa có token -> body chỉ cho 10kb (chống gửi payload khổng lồ
// khi chưa xác thực). express.json 50mb (import Excel) chỉ áp SAU lớp bắt buộc token.
app.use('/api/auth/login', express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  return authRequired(req, res, next);
});
app.use(express.json({ limit: '50mb' }));

// Router tách module (server/routes/*), mount đúng vị trí cũ để giữ thứ tự route.
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', dashboardWidgetsRoutes);
app.use('/api', networkRoutes);
app.use('/api', organizationRoutes);
app.use('/api', usersRoutes);
app.use('/api', arrivalsRoutes);
app.use('/api', phatRoutes);
app.use('/api', napNguonRoutes);
app.use('/api', thamSoRoutes);

// Serve frontend static files in production
const clientBuildPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // Express 5 + path-to-regexp mới không còn chấp nhận wildcard '*' trần
  // (gây crash "Missing parameter name at index 1: *" ngay lúc khởi động
  // nếu thư mục dist/ tồn tại). Dùng app.use() không path — middleware
  // cuối cùng, chạy cho MỌI request chưa được route nào ở trên xử lý,
  // tương đương ý nghĩa wildcard cũ nhưng không cần path-to-regexp parse.
  app.use((req, res, next) => {
    // /api/* không khớp route nào -> 404 JSON, không trả trang giao diện.
    if (req.path.startsWith('/api/')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Mọi yêu cầu còn lại: trang 404 (trình duyệt) hoặc 404 JSON (API).
app.use(security.sendNotFound);

const server = app.listen(PORT, () => {
  console.log(`Server hue-dhcl đang chạy tại http://localhost:${PORT}`);
});

// ==========================================
// Khởi động nóng «kết quả phát từ đầu tháng» (DASH-12b-4): sau khi máy chủ đã nghe, tính sẵn cache tháng của `all` và từng BCVH, từng (BCVH, ngày) một và nhường
// vòng lặp giữa các bước (không chặn yêu cầu khác). Tắt bằng PHAT_WARM=0; không chạy trong test / harness (NODE_TEST_CONTEXT). Lỗi chỉ ghi một dòng log.
// ==========================================
if (process.env.PHAT_WARM !== '0' && !process.env.NODE_TEST_CONTEXT && process.env.NODE_ENV !== 'test') {
  let daDong = false;
  server.on('close', () => { daDong = true; });
  setTimeout(() => {
    require('./lib/phatDashboard').khoiDongNong(require('./db'), { dung: () => daDong })
      .then((r) => console.log(`[phat-thang] khởi động nóng: ${r.so_ngay_bcvh_tinh} ngày-BCVH trong ${r.ms} ms${r.loi ? ` (lỗi: ${r.loi})` : ''}`))
      .catch((err) => console.error('[phat-thang] khởi động nóng lỗi:', err && err.message));
  }, 3000).unref();
}

// ==========================================
// Hẹn giờ tự động nạp file từ SFTP (SANLUONG-5e, docs/ai/15_SFTP_SCHEDULER.md). MẶC ĐỊNH TẮT: chỉ chạy khi SFTP_SYNC_ENABLED=1 và cấu hình đủ;
// không chạy trong test / harness (NODE_TEST_CONTEXT). Sai cấu hình -> một dòng log, hẹn giờ không khởi động, máy chủ vẫn chạy. Không bao giờ ném lỗi.
// ==========================================
try {
  const sched = require('./lib/sftpScheduler');
  sched.startSftpScheduler({ db: require('./db'), env: process.env });
  if (sched.docTrangThaiSftp().trangThai === sched.TT.CHO) {
    // Tắt gọn: huỷ hẹn giờ, đợi file đang nạp xong, rồi đóng máy chủ (chỉ đăng ký khi hẹn giờ đang bật, để không đổi cách tắt mặc định).
    const tatGon = () => {
      sched.stopSftpScheduler().catch(() => {}).finally(() => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
    };
    process.once('SIGTERM', tatGon);
    process.once('SIGINT', tatGon);
    server.on('close', () => { sched.stopSftpScheduler().catch(() => {}); });
  }
} catch (err) {
  console.error('[sftp-sync] Không khởi động được hẹn giờ:', err && err.message);
}
