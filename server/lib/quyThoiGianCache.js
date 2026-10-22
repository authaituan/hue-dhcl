// ==========================================
// Bộ nhớ đệm cho «Quỹ thời gian» (QUYTG-5), theo mẫu phatVuHoi.js: vô hiệu khi DẤU HIỆU DB đổi (PD.dauHieuDb = data_version + total_changes: bắt MỌI đường ghi —
// nạp SFTP / tay, thay thế, khôi phục, script) hoặc quá 10 phút (chốt an toàn). Hai tầng, cùng khóa khung (from|to|receiver_code đã sắp xếp|ward_key):
//   - danh sách ĐẦY ĐỦ đã đánh giá và đã sắp (lớn): tối đa 3 khóa, đầy thì bỏ khóa cũ nhất. Một lần tính phục vụ mọi trang và mọi bộ lọc nhom / trang_thai / ly_do / nghi_ngo của cùng khung;
//   - tổng hợp (nhỏ): tối đa 500 khóa; tính từ danh sách đầy đủ (đang có trong cache hoặc vừa tính rồi đưa vào cache) nên một khung chỉ tính MỘT lần cho cả hai route.
// Danh sách trong cache không bao giờ bị sửa tại chỗ (trangTuLuot chỉ lọc / cắt ra mảng mới).
// ==========================================
'use strict';
const QQ = require('./quyThoiGianQuery');
const PD = require('./phatDashboard');

const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const TONG_MAX = 500;
const DANH_SACH_MAX = 3;
const tong = new Map();
const danhSach = new Map();
let cacheDauHieu = null;
const xoaCache = () => { tong.clear(); danhSach.clear(); cacheDauHieu = null; };

/** Khóa khung đã chuẩn hóa: from|to|mã BCVH (bỏ trùng, sắp xếp)|ward_key. */
function khoaKhung(f) {
  return `qtg1|${f.from}|${f.to}|${[...new Set(f.receiverCodes)].sort().join(',')}|${f.wardKey || ''}`;
}

function dongBo(dauHieu) {
  if (cacheDauHieu !== dauHieu) { tong.clear(); danhSach.clear(); cacheDauHieu = dauHieu; }
}
function lay(map, khoa, now) {
  const c = map.get(khoa);
  if (!c) return null;
  if (now - c.luc >= CACHE_MAX_AGE_MS) { map.delete(khoa); return null; }
  return c.kq;
}
function dat(map, gioiHan, khoa, kq, now) {
  map.delete(khoa);
  while (map.size >= gioiHan) map.delete(map.keys().next().value); // bỏ khóa cũ nhất
  map.set(khoa, { luc: now, kq });
}

function luotDayDu(db, f, khoa, now) {
  let ds = lay(danhSach, khoa, now);
  if (!ds) {
    ds = QQ.luotDaSapXep(db, f);
    dat(danhSach, DANH_SACH_MAX, khoa, ds, now);
  }
  return ds;
}

/** GET …/quy-thoi-gian/luot: query như layLuotQuyThoiGian. `now`: chỉ để test. */
function luot(db, query, now = Date.now()) {
  const { f, rieng } = QQ.docThamSo(query, { coPhanTrang: true });
  dongBo(PD.dauHieuDb(db));
  return QQ.trangTuLuot(luotDayDu(db, f, khoaKhung(f), now), f, rieng);
}

/** GET …/quy-thoi-gian/tong-hop: query như tongHopQuyThoiGian. */
function tongHop(db, query, now = Date.now()) {
  const { f } = QQ.docThamSo(query, { coPhanTrang: false });
  dongBo(PD.dauHieuDb(db));
  const khoa = khoaKhung(f);
  let kq = lay(tong, khoa, now);
  if (!kq) {
    kq = QQ.tongHopTuLuot(luotDayDu(db, f, khoa, now), f);
    dat(tong, TONG_MAX, khoa, kq, now);
  }
  return kq;
}

/** Chỉ để test: số khóa đang giữ. */
const thongKe = () => ({ tong: tong.size, danh_sach: danhSach.size });

module.exports = { CACHE_MAX_AGE_MS, TONG_MAX, DANH_SACH_MAX, khoaKhung, luot, tongHop, xoaCache, thongKe };
