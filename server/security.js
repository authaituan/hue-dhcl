// ==========================================
// SECURITY MODULE — lọc IP truy cập, IP thật sau proxy, header bảo mật,
// trang 404, nhật ký bảo mật. Chỉ dùng module có sẵn của Node, không thêm dep.
//
// Biến môi trường:
//   CMS_ALLOWED_IPS  Danh sách IP/dải CIDR IPv4 được vào hệ thống, cách nhau dấu
//                    phẩy, vd "10.47.33.15,10.47.33.20,10.47.31.0/24".
//                    Để trống = CHỈ máy chủ (127.0.0.1, ::1) — mặc định an toàn.
//                    "*" = cho mọi IP (chỉ dùng khi chạy thử, có cảnh báo).
//   TRUSTED_PROXIES  IP/dải của reverse proxy tin cậy (vd "127.0.0.1,::1" khi chạy
//                    sau Vite proxy hoặc reverse proxy của NAS). Chỉ khi kết nối
//                    đến từ các địa chỉ này mới đọc header X-Forwarded-For.
//                    Để trống = không tin header nào (X-Forwarded-For bị bỏ qua).
//   SECURITY_LOG     Đường dẫn file nhật ký bảo mật (mặc định data/security.log).
// ==========================================
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const LOCALHOST = '127.0.0.1,::1';

/** Bỏ tiền tố IPv4-mapped (::ffff:192.168.1.5 -> 192.168.1.5). */
function normalizeIp(ip) {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

/**
 * Danh sách IP: IP đơn (IPv4/IPv6) hoặc dải IPv4 dạng CIDR, cách nhau dấu phẩy.
 * Trả về hàm (ip) => true/false. Mục sai cú pháp -> ném lỗi ngay lúc khởi động
 * (thà không chạy còn hơn chạy với danh sách bị hiểu sai).
 */
function parseIpList(spec, label = 'danh sách IP') {
  const rules = String(spec || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [base, bitsStr] = entry.split('/');
      if (bitsStr !== undefined) {
        const baseInt = ipv4ToInt(base);
        const bits = Number(bitsStr);
        if (baseInt === null || !/^\d{1,2}$/.test(bitsStr) || bits > 32) {
          throw new Error(`${label}: mục không hợp lệ "${entry}"`);
        }
        const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
        return (ip) => {
          const n = ipv4ToInt(ip);
          return n !== null && (n & mask) === (baseInt & mask);
        };
      }
      if (!net.isIP(normalizeIp(entry))) throw new Error(`${label}: mục không hợp lệ "${entry}"`);
      const exact = normalizeIp(entry).toLowerCase();
      return (ip) => String(ip).toLowerCase() === exact;
    });
  return (ip) => rules.some((match) => match(ip));
}

/**
 * IP thật của máy khách.
 * Chỉ đọc X-Forwarded-For khi kết nối TCP đến từ đúng proxy tin cậy. Khi đó đi
 * từ PHẢI sang TRÁI, lấy địa chỉ đầu tiên KHÔNG phải proxy tin cậy: phần bên
 * trái do máy khách tự ghi nên giả được, phần bên phải do proxy của mình thêm.
 */
function clientIp(req, isTrustedProxy) {
  const remote = normalizeIp(req.socket && req.socket.remoteAddress);
  if (typeof isTrustedProxy !== 'function' || !isTrustedProxy(remote)) return remote;
  const hops = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((h) => normalizeIp(h.trim()));
  let ip = remote;
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!net.isIP(hops[i])) break; // giá trị rác: dừng, dùng địa chỉ tin cậy gần nhất
    ip = hops[i];
    if (!isTrustedProxy(ip)) break;
  }
  return ip;
}

// ------------------------------------------
// Nhật ký bảo mật (JSON mỗi dòng). Không bao giờ ghi mật khẩu/token.
// ------------------------------------------
function createSecurityLog(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch (e) {
    // thư mục đã có hoặc không tạo được: lỗi sẽ được báo khi ghi
  }
  return function securityLog(entry) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    fs.appendFile(file, line + '\n', (err) => {
      if (err) console.error('[security] Không ghi được nhật ký bảo mật:', err.message);
    });
  };
}

// ------------------------------------------
// Header bảo mật áp cho MỌI phản hồi.
// Chưa đặt Content-Security-Policy cho ứng dụng chính (Leaflet tải ảnh bản đồ
// từ máy chủ ngoài) — để ticket riêng, cần thử trên giao diện thật.
// ------------------------------------------
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Không dùng 'no-referrer': máy chủ ảnh bản đồ OpenStreetMap yêu cầu có Referer.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function securityHeaders(req, res, next) {
  res.set(BASE_HEADERS);
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
}

// ------------------------------------------
// Trang 404: CSS nhúng trong <style>, cho phép đúng khối đó bằng mã băm.
// ------------------------------------------
const NOT_FOUND_FILE = path.join(__dirname, 'pages', '404.html');
let notFound = null;
function buildNotFound(raw) {
  // Chuẩn hoá CRLF -> LF: trình duyệt chuẩn hoá xuống dòng về LF khi tính mã băm CSP,
  // nên băm và gửi đúng bản LF (git trên Windows có thể đổi file sang CRLF).
  const html = raw.replace(/\r\n/g, '\n');
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  const hash = m ? crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') : null;
  return {
    html,
    csp: [
      "default-src 'none'",
      hash ? `style-src 'sha256-${hash}'` : "style-src 'none'",
      "img-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'"
    ].join('; ')
  };
}

function loadNotFound() {
  if (!notFound) notFound = buildNotFound(fs.readFileSync(NOT_FOUND_FILE, 'utf8'));
  return notFound;
}

/**
 * Trả 404. Trình duyệt (GET/HEAD, Accept text/html) nhận trang 404 đẹp;
 * API và các yêu cầu khác nhận JSON/text ngắn. Dùng cho cả IP bị chặn
 * -> không lộ là có hệ thống ở địa chỉ này (404 thay vì 403).
 */
function sendNotFound(req, res) {
  res.set(BASE_HEADERS);
  res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const wantsHtml = (req.method === 'GET' || req.method === 'HEAD') && /text\/html/.test(String(req.headers.accept || ''));
  if (wantsHtml) {
    try {
      const page = loadNotFound();
      res.set('Content-Security-Policy', page.csp);
      return res.status(404).type('html').send(page.html);
    } catch (e) {
      // thiếu file trang 404: rơi xuống trả text
    }
  }
  return res.status(404).type('text').send('Not found');
}

/**
 * Tạo bộ lọc dùng cho app Express. Gắn req.clientIp cho các route phía sau.
 * Ném lỗi lúc khởi động nếu cấu hình IP sai cú pháp.
 */
function createSecurity(env = process.env) {
  const rawAllowed = String(env.CMS_ALLOWED_IPS || '').trim();
  const allowAll = rawAllowed === '*';
  const allowedSpec = rawAllowed && !allowAll ? rawAllowed : LOCALHOST;
  const isAllowed = allowAll ? () => true : parseIpList(allowedSpec, 'CMS_ALLOWED_IPS');

  const rawProxies = String(env.TRUSTED_PROXIES || '').trim();
  const isTrustedProxy = rawProxies ? parseIpList(rawProxies, 'TRUSTED_PROXIES') : null;

  const logFile = env.SECURITY_LOG || path.join(__dirname, '..', 'data', 'security.log');
  const log = createSecurityLog(logFile);

  if (allowAll) {
    console.warn('[security] CẢNH BÁO: CMS_ALLOWED_IPS="*" — MỌI IP đều vào được. Chỉ dùng khi chạy thử.');
  } else if (!rawAllowed) {
    console.warn('[security] CMS_ALLOWED_IPS chưa đặt: chỉ máy chủ (127.0.0.1, ::1) vào được. Đặt danh sách IP được phép trước khi cho máy khác dùng.');
  } else {
    console.log(`[security] IP được phép: ${allowedSpec}`);
  }
  if (isTrustedProxy) console.log(`[security] Proxy tin cậy: ${rawProxies}`);

  // Ghi nhật ký IP bị chặn tối đa 1 dòng / IP / phút để không bị làm đầy đĩa.
  const deniedSeen = new Map();
  function logDenied(ip, req) {
    const now = Date.now();
    const last = deniedSeen.get(ip) || 0;
    if (now - last < 60 * 1000) return;
    deniedSeen.set(ip, now);
    if (deniedSeen.size > 5000) deniedSeen.clear();
    log({
      event: 'ip_denied',
      ip,
      method: req.method,
      path: String(req.originalUrl || req.url).slice(0, 200),
      ua: String(req.headers['user-agent'] || '').slice(0, 200)
    });
  }

  function ipFilter(req, res, next) {
    const ip = clientIp(req, isTrustedProxy);
    req.clientIp = ip;
    if (isAllowed(ip)) return next();
    logDenied(ip, req);
    return sendNotFound(req, res);
  }

  return { ipFilter, securityHeaders, sendNotFound, log, isAllowed, isTrustedProxy };
}

module.exports = {
  normalizeIp,
  parseIpList,
  clientIp,
  createSecurity,
  sendNotFound,
  buildNotFound,
  securityHeaders
};
