// ==========================================
// Test harness: khởi động server thật (server/index.js) trỏ vào 1 file SQLite
// tạm riêng cho test, KHÔNG đụng DB thật trong data/.
//
// Kỹ thuật: monkey-patch require.cache của 'better-sqlite3' để mọi
// `new Database(anyPath)` trong server/db.js bị redirect sang testDbPath,
// bất kể path mà db.js tự tính (thư mục data/).
// KHÔNG sửa 1 dòng nào trong server/db.js hay server/index.js.
//
// Sau đó require server/index.js trong CÙNG tiến trình: nó tự gọi
// app.listen(PORT) thật (side-effect có sẵn trong code gốc) -> ta gọi qua
// fetch() như 1 client thật, đúng những gì code production chạy.
// ==========================================
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'server');

// server/db.js tự tạo thư mục data/ lúc nạp (dù DB test nằm ở thư mục tạm) — xoá khi tiến trình test
// thoát nếu thư mục vẫn RỖNG (rmdirSync không bao giờ xoá thư mục có file, DB thật không bị ảnh hưởng).
process.on('exit', () => { try { fs.rmdirSync(path.join(ROOT, 'data')); } catch (e) { /* không có hoặc không rỗng */ } });

// Đặt ngay khi nạp module (fixtures.js require server/auth.js ngay sau harness).
// JWT_SECRET bắt buộc (server từ chối khởi động nếu thiếu): test tự đặt giá trị ngẫu nhiên.
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
// Nhật ký bảo mật ghi ra file tạm, không đụng data/security.log thật; xoá khi tiến trình test thoát.
if (!process.env.SECURITY_LOG) {
  const logFile = path.join(os.tmpdir(), `dhcl-test-security-${process.pid}-${crypto.randomBytes(4).toString('hex')}.log`);
  process.env.SECURITY_LOG = logFile;
  process.on('exit', () => { try { fs.unlinkSync(logFile); } catch (e) { /* chưa có file hoặc đã xoá */ } });
}

// Bắt lấy http.Server thật mà Express tạo ra bên trong app.listen() (Express
// nội bộ gọi http.createServer(app).listen(...)), để có thể .close() đàng
// hoàng sau khi test xong. server/index.js không export app/http.Server nên
// đây là cách duy nhất lấy được reference mà KHÔNG sửa server/index.js.
function patchHttpCreateServer() {
  const http = require('http');
  const originalCreateServer = http.createServer;
  let capturedServer = null;
  http.createServer = function patchedCreateServer(...args) {
    const server = originalCreateServer.apply(http, args);
    capturedServer = server;
    http.createServer = originalCreateServer; // chỉ bắt lần gọi đầu tiên, khôi phục ngay sau đó
    return server;
  };
  return () => capturedServer;
}

function patchBetterSqlite3(testDbPath) {
  const resolvedPath = require.resolve('better-sqlite3');
  const RealDatabase = require('better-sqlite3');

  // Hàm ctor thay thế: bỏ qua path được truyền vào (path thật của prod),
  // luôn mở/tạo file test thay thế. new F() trả về object tường minh từ
  // constructor -> hoạt động đúng dù RealDatabase là class hay function.
  function PatchedDatabase(_ignoredPath, options) {
    return new RealDatabase(testDbPath, options);
  }
  PatchedDatabase.prototype = RealDatabase.prototype;

  require.cache[resolvedPath].exports = PatchedDatabase;
}

// Đóng kết nối DB (nếu còn mở) rồi mới xoá file — trên Windows, unlinkSync
// sẽ thất bại âm thầm nếu SQLite native handle vẫn đang giữ file (lock),
// khiến file tạm bị sót lại trong os.tmpdir() dù không ảnh hưởng DB thật.
function cleanupDbFiles(testDbPath, db) {
  if (db) {
    try {
      db.close();
    } catch (e) {
      // đã đóng rồi hoặc lỗi không quan trọng, bỏ qua
    }
  }
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {
      // best-effort, không chặn test vì lỗi dọn file tạm
    }
  }
}

// Khởi động 1 instance server thật, DB riêng, port riêng.
// Gọi 1 LẦN duy nhất mỗi file test (mỗi file test = 1 tiến trình riêng
// khi chạy qua `node --test`, nên không lo đụng độ giữa các file).
function startTestServer({ port, dbFileName }) {
  const testDbPath = path.join(
    os.tmpdir(),
    dbFileName || `dhcl-test-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`
  );
  cleanupDbFiles(testDbPath); // dọn sạch nếu sót lại từ lần chạy trước bị crash

  patchBetterSqlite3(testDbPath);
  const getServer = patchHttpCreateServer();

  process.env.PORT = String(port);
  // server/index.js nội bộ làm `require('./db')` -> resolve cùng absolute
  // path với dòng require dưới đây (cùng file server/db.js) -> CÙNG 1 cache
  // entry -> CÙNG 1 kết nối DB (an toàn, tránh lock đa tiến trình).
  const db = require(path.join(SERVER_DIR, 'db.js'));
  require(path.join(SERVER_DIR, 'index.js')); // side-effect: app.listen(port)

  const baseUrl = `http://127.0.0.1:${port}`;
  return { db, baseUrl, testDbPath, server: getServer() };
}

// Đóng server đàng hoàng: dừng nhận connection mới + đóng cưỡng bức các
// keep-alive socket đang idle (nếu không, server.close() có thể treo chờ
// vô hạn vì HTTP keep-alive giữ socket mở). Nhờ vậy tiến trình test tự thoát
// tự nhiên, KHÔNG cần process.exit() (tránh nguy cơ cắt ngang trước khi
// test runner kịp ghi nhận kết quả test cuối cùng).
function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  });
}

async function waitForServer(baseUrl, { retries = 50, delayMs = 100 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(`${baseUrl}/api/organization/communes`);
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Server test không sẵn sàng sau ${retries * delayMs}ms tại ${baseUrl}: ${lastErr && lastErr.message}`);
}

module.exports = { startTestServer, waitForServer, cleanupDbFiles, closeServer, SERVER_DIR, ROOT };
