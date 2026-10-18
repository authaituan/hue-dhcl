// ==========================================
// THAMSO-1 (docs/ai/34_THAMSO1_BACKEND_BANG_THAM_SO.md, 04_DECISIONS.md #94): lớp đọc / ghi «Tham số hệ thống».
//  - Bảng `tham_so` CHỈ lưu giá trị ghi đè; thiếu dòng = mặc định (server/config/tham-so-mac-dinh.js). `tham_so_nhat_ky` ghi mọi lần sửa / hoàn về mặc định.
//  - `lay(khoa)` đọc từ RAM (nạp lúc khởi động bằng khoiTao(db), cập nhật sau mỗi lần ghi thành công); chưa khoiTao -> mặc định.
//  - Các file hằng số cũ dùng taoDoiTuong() với getter ENUMERABLE: tên xuất khẩu, hình dạng, thứ tự khóa không đổi; chỗ gọi không phải sửa.
//  - `phienBan()` tăng sau mỗi lần ghi (cache tầng 1 của ket-qua-phat-thang đưa vào khóa, #93).
// File này chỉ phụ thuộc server/config/tham-so-mac-dinh.js; danh bạ (server/config/tham-so.js, nặng hơn) nạp LƯỜI để không tạo vòng phụ thuộc.
// ==========================================
'use strict';
const MD = require('../config/tham-so-mac-dinh');

const state = { ghiDe: new Map(), phienBan: 0 };
const coKhoa = (khoa) => Object.prototype.hasOwnProperty.call(MD, khoa);
const danhBa = () => require('../config/tham-so');

class ThamSoLoi extends Error {
  constructor(code, message, httpStatus = 400, extra = null) {
    super(message);
    this.name = 'ThamSoLoi';
    this.code = code;
    this.httpStatus = httpStatus;
    this.extra = extra;
  }
}
const loi = (code, m) => new ThamSoLoi(code, m, 400);

// ------------------------------------------
// Đọc
// ------------------------------------------
/** Giá trị hiệu lực của khóa (ghi đè nếu có, không thì mặc định). Khóa không có trong mặc định -> ném lỗi lập trình. */
function lay(khoa) {
  if (!coKhoa(khoa)) throw new Error(`Tham số không tồn tại: ${String(khoa)}`);
  return state.ghiDe.has(khoa) ? state.ghiDe.get(khoa) : MD[khoa];
}
/** Bản chụp { khoa: giá trị hiệu lực } của mọi tham số có mặc định. */
function layNhieu() {
  return Object.fromEntries(Object.keys(MD).map((k) => [k, lay(k)]));
}
const phienBan = () => state.phienBan;

// ------------------------------------------
// Dựng đối tượng hằng số với getter (dùng ở 4 file hằng số cũ)
// ------------------------------------------
class TheoKhoa { constructor(khoa) { if (!coKhoa(khoa)) throw new Error(`Tham số không tồn tại: ${khoa}`); this.khoa = khoa; } }
class TheoHam { constructor(fn) { this.fn = fn; } }
/** Đánh dấu thuộc tính đọc theo khóa tham số. */
const theoKhoa = (khoa) => new TheoKhoa(khoa);
/** Đánh dấu thuộc tính tính bằng hàm (đối tượng lồng: nên trả Object.freeze({...}) mới mỗi lần). */
const theoHam = (fn) => new TheoHam(fn);
/**
 * spec: { TEN: giá trị cố định | theoKhoa('khoa') | theoHam(fn) }. Trả đối tượng ĐÓNG BĂNG; thuộc tính theo khóa/hàm là getter enumerable (không configurable),
 * giữ nguyên thứ tự khóa của spec để Object.keys / spread / JSON.stringify cho kết quả như đối tượng tĩnh trước đây.
 */
function taoDoiTuong(spec) {
  const o = {};
  for (const [ten, v] of Object.entries(spec)) {
    if (v instanceof TheoKhoa) Object.defineProperty(o, ten, { enumerable: true, configurable: false, get: () => lay(v.khoa) });
    else if (v instanceof TheoHam) Object.defineProperty(o, ten, { enumerable: true, configurable: false, get: v.fn });
    else Object.defineProperty(o, ten, { enumerable: true, configurable: false, writable: false, value: v });
  }
  return Object.freeze(o);
}

// ------------------------------------------
// Kiểm tra hợp lệ (máy chủ)
// ------------------------------------------
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toi4 = (v) => Math.abs(Math.round(v * 10000) - v * 10000) < 1e-7; // tối đa 4 chữ số thập phân

/** null nếu hợp lệ, ngược lại ThamSoLoi. meta: một mục của danh bạ. */
function kiemTraGiaTri(meta, v) {
  const ten = meta.khoa;
  if (meta.kieu === 'gio_hhmm') {
    if (typeof v !== 'string' || !HHMM_RE.test(v)) return loi('THAM_SO_SAI', `"${ten}" phải là giờ dạng HH:MM (00:00–23:59)`);
    if (v < meta.min || v > meta.max) return loi('NGOAI_KHOANG', `"${ten}" phải trong khoảng ${meta.min}–${meta.max}`);
    return null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || Object.is(v, -0)) return loi('THAM_SO_SAI', `"${ten}" phải là một số hữu hạn (không nhận chuỗi, NaN, Infinity, -0)`);
  const nguyen = meta.kieu === 'so_nguyen' || meta.kieu === 'phan_tram_nguyen' || meta.kieu === 'gio_nguyen';
  if (nguyen && !Number.isInteger(v)) return loi('THAM_SO_SAI', `"${ten}" phải là số nguyên`);
  if (!nguyen && !toi4(v)) return loi('THAM_SO_SAI', `"${ten}" chỉ nhận tối đa 4 chữ số thập phân`);
  if (v < meta.min || v > meta.max) return loi('NGOAI_KHOANG', `"${ten}" phải trong khoảng ${meta.min}–${meta.max}`);
  return null;
}

/** Ràng buộc chéo trên tập giá trị SAU khi áp bản sửa; chỉ xét ràng buộc dính tới các khóa đổi. */
function kiemTraRangBuoc(g, khoaDoi) {
  for (const rb of danhBa().RANG_BUOC) {
    if (!rb.khoa.some((k) => khoaDoi.has(k))) continue;
    if (!rb.ok(g)) return loi('RANG_BUOC', rb.thong_bao);
  }
  return null;
}

// ------------------------------------------
// Khởi tạo / schema
// ------------------------------------------
function ensureThamSoSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tham_so (
      khoa TEXT PRIMARY KEY,
      gia_tri TEXT NOT NULL,
      cap_nhat_luc TEXT NOT NULL,
      cap_nhat_boi TEXT NOT NULL,
      che_do TEXT NOT NULL DEFAULT 'tay' CHECK (che_do IN ('tay', 'tu_thong_ke'))
    );
    CREATE TABLE IF NOT EXISTS tham_so_nhat_ky (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      khoa TEXT NOT NULL,
      gia_tri_cu TEXT,
      gia_tri_moi TEXT,
      thoi_diem_utc TEXT NOT NULL,
      nguoi_ma TEXT NOT NULL,
      ly_do TEXT NOT NULL,
      loai TEXT NOT NULL CHECK (loai IN ('SUA', 'VE_MAC_DINH'))
    );
    CREATE INDEX IF NOT EXISTS ix_tham_so_nhat_ky_khoa ON tham_so_nhat_ky(khoa, id);
  `);
}

/**
 * Nạp ghi đè từ DB vào RAM. Dòng hỏng (khóa lạ / chỉ-đọc / JSON sai / ngoài khoảng / phá ràng buộc chéo) bị BỎ QUA, dùng mặc định,
 * ghi một dòng console.error KHÔNG kèm giá trị. Không bao giờ ném lỗi.
 */
function khoiTao(db) {
  const moi = new Map();
  try {
    const DB = danhBa();
    const hong = (khoa) => console.error(`[tham-so] Bỏ qua giá trị ghi đè không hợp lệ của "${String(khoa).slice(0, 60)}", dùng mặc định`);
    for (const r of db.prepare('SELECT khoa, gia_tri FROM tham_so').all()) {
      const meta = DB.THEO_KHOA.get(r.khoa);
      let v;
      try { v = JSON.parse(r.gia_tri); } catch (e) { hong(r.khoa); continue; }
      if (!meta || meta.chi_doc || kiemTraGiaTri(meta, v)) { hong(r.khoa); continue; }
      moi.set(r.khoa, v);
    }
    const g = (k) => (moi.has(k) ? moi.get(k) : MD[k]);
    for (const rb of DB.RANG_BUOC) {
      if (rb.ok(g)) continue;
      for (const k of rb.khoa) if (moi.delete(k)) hong(k);
    }
  } catch (e) {
    console.error('[tham-so] Không đọc được bảng tham_so, dùng toàn bộ mặc định:', e && e.code ? e.code : (e && e.name));
    moi.clear();
  }
  const doi = JSON.stringify([...moi]) !== JSON.stringify([...state.ghiDe]);
  state.ghiDe = moi;
  if (doi) state.phienBan += 1;
}

// ------------------------------------------
// Ghi
// ------------------------------------------
const nguoiMa = (user) => String((user && (user.hrm_code || user.id)) || 'khong_ro').slice(0, 60);
const nowIso = () => new Date().toISOString();
const json = (v) => JSON.stringify(v);

function kiemTraLyDo(lyDo) {
  if (typeof lyDo !== 'string' || !lyDo.trim()) throw loi('THIEU_LY_DO', 'Phải nhập lý do (1–200 ký tự)');
  const t = lyDo.trim();
  if (t.length > 200) throw loi('THAM_SO_SAI', 'Lý do tối đa 200 ký tự');
  return t;
}
function mucCuaKhoa(khoa) {
  if (typeof khoa !== 'string' || !khoa) throw loi('THAM_SO_SAI', 'Mỗi phần tử phải có "khoa" là chuỗi');
  const meta = danhBa().THEO_KHOA.get(khoa);
  if (!meta) throw loi('KHOA_LA', `Khóa tham số không tồn tại: "${khoa.slice(0, 60)}"`);
  if (meta.chi_doc) throw loi('KHOA_CHI_DOC', `Tham số "${khoa}" là quy tắc định nghĩa, chỉ đọc, không sửa được`);
  return meta;
}

/** Áp một tập thay đổi { khoa -> giá trị | undefined (= về mặc định) } trong MỘT giao dịch + nhật ký; cập nhật RAM sau khi giao dịch thành công. */
function ap(db, user, thayDoi, lyDo, loaiNhatKy) {
  const g = (k) => (thayDoi.has(k) ? (thayDoi.get(k) === undefined ? MD[k] : thayDoi.get(k)) : lay(k));
  const rb = kiemTraRangBuoc(g, new Set(thayDoi.keys()));
  if (rb) throw rb;
  // THAMSO-1a: khóa có giá trị mới == giá trị hiệu lực hiện hành thì bỏ qua (không nhật ký, không dòng ghi đè mới). Cả lô không đổi gì -> không ghi, không tăng phiên bản.
  for (const [khoa, v] of [...thayDoi]) if (json(v === undefined ? MD[khoa] : v) === json(lay(khoa))) thayDoi.delete(khoa);
  if (!thayDoi.size) return [];
  const luc = nowIso();
  const ma = nguoiMa(user);
  const them = db.prepare('INSERT INTO tham_so_nhat_ky (khoa, gia_tri_cu, gia_tri_moi, thoi_diem_utc, nguoi_ma, ly_do, loai) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const xoa = db.prepare('DELETE FROM tham_so WHERE khoa = ?');
  const ghi = db.prepare(`INSERT INTO tham_so (khoa, gia_tri, cap_nhat_luc, cap_nhat_boi, che_do) VALUES (?, ?, ?, ?, 'tay')
    ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, cap_nhat_luc = excluded.cap_nhat_luc, cap_nhat_boi = excluded.cap_nhat_boi, che_do = 'tay'`);
  const cuoi = new Map();
  db.transaction(() => {
    for (const [khoa, v] of thayDoi) {
      const cu = lay(khoa);
      const moi = v === undefined ? MD[khoa] : v;
      // Giá trị bằng mặc định (và khác hiện hành): XÓA dòng ghi đè (không ghim giá trị cũ khi mặc định trong mã đổi sau này), vẫn ghi nhật ký.
      if (json(moi) === json(MD[khoa])) { xoa.run(khoa); cuoi.set(khoa, undefined); } else { ghi.run(khoa, json(moi), luc, ma); cuoi.set(khoa, moi); }
      them.run(khoa, json(cu), json(moi), luc, ma, lyDo, loaiNhatKy);
    }
  })();
  for (const [khoa, v] of cuoi) { if (v === undefined) state.ghiDe.delete(khoa); else state.ghiDe.set(khoa, v); }
  state.phienBan += 1;
  return [...thayDoi.keys()];
}

/**
 * Sửa nhiều tham số một lần (kiểm TOÀN BỘ trước, rồi mới ghi: hoặc ghi hết hoặc không ghi gì).
 * thayDoi: [{ khoa, gia_tri }] (1–30 phần tử, khóa không trùng, không có trường lạ). Trả danh sách khóa đã áp.
 */
function datNhieu(db, user, thayDoi, lyDo) {
  const ly = kiemTraLyDo(lyDo);
  if (!Array.isArray(thayDoi) || thayDoi.length < 1 || thayDoi.length > 30) throw loi('THAM_SO_SAI', '"thay_doi" phải là mảng 1–30 phần tử');
  const m = new Map();
  for (const p of thayDoi) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw loi('THAM_SO_SAI', 'Mỗi phần tử của "thay_doi" phải là đối tượng { khoa, gia_tri }');
    for (const k of Object.keys(p)) if (k !== 'khoa' && k !== 'gia_tri') throw loi('THAM_SO_SAI', `Phần tử có trường không hỗ trợ: "${k.slice(0, 40)}"`);
    const meta = mucCuaKhoa(p.khoa);
    if (m.has(p.khoa)) throw loi('THAM_SO_SAI', `Khóa bị trùng trong yêu cầu: "${p.khoa}"`);
    if (!Object.prototype.hasOwnProperty.call(p, 'gia_tri')) throw loi('THAM_SO_SAI', `Thiếu "gia_tri" của "${p.khoa}"`);
    const e = kiemTraGiaTri(meta, p.gia_tri);
    if (e) throw e;
    m.set(p.khoa, p.gia_tri);
  }
  return ap(db, user, m, ly, 'SUA');
}

/** Hoàn về mặc định. khoa: mảng khóa; tatCa = true: mọi khóa không chỉ-đọc đang có ghi đè. Trả danh sách khóa đã hoàn. */
function veMacDinh(db, user, khoa, lyDo, { tatCa = false } = {}) {
  const ly = kiemTraLyDo(lyDo);
  const m = new Map();
  if (tatCa) {
    if (khoa !== undefined && khoa !== null) throw loi('THAM_SO_SAI', 'Không dùng "khoa" cùng "tat_ca"');
    for (const k of state.ghiDe.keys()) m.set(k, undefined);
    if (!m.size) return [];
  } else {
    if (!Array.isArray(khoa) || khoa.length < 1 || khoa.length > 60) throw loi('THAM_SO_SAI', '"khoa" phải là mảng 1–60 khóa');
    for (const k of khoa) {
      mucCuaKhoa(k);
      if (m.has(k)) throw loi('THAM_SO_SAI', `Khóa bị trùng trong yêu cầu: "${k}"`);
      m.set(k, undefined);
    }
  }
  return ap(db, user, m, ly, 'VE_MAC_DINH');
}

// ------------------------------------------
// Đọc cho API
// ------------------------------------------
function danhSach(db) {
  const DB = danhBa();
  const dong = new Map(db.prepare('SELECT khoa, cap_nhat_luc, cap_nhat_boi FROM tham_so').all().map((r) => [r.khoa, r]));
  return {
    nhom: DB.NHOM.map((n) => ({ ma: n.ma, nhan: n.nhan })),
    tham_so: DB.DANH_BA.map((m) => {
      const gia = m.chi_doc ? m.mac_dinh : lay(m.khoa);
      const d = !m.chi_doc ? dong.get(m.khoa) : null;
      return {
        khoa: m.khoa, nhom: m.nhom, nhan: m.nhan, mo_ta: m.mo_ta, anh_huong: m.anh_huong, vi_du: m.vi_du, nhin_thay_o: m.nhin_thay_o,
        kieu: m.kieu, don_vi: m.don_vi, min: m.min ?? null, max: m.max ?? null, rang_buoc: m.rang_buoc,
        mac_dinh: m.mac_dinh, gia_tri: gia, la_mac_dinh: json(gia) === json(m.mac_dinh), chi_doc: m.chi_doc,
        cap_nhat_luc: d ? d.cap_nhat_luc : null, cap_nhat_boi: d ? d.cap_nhat_boi : null
      };
    }),
    phien_ban: state.phienBan
  };
}

const TRANG_MAC_DINH = 20;
const TRANG_TOI_DA = 100;
const SO_NGAY_TOI_DA = 92;
const NGAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ngayHopLe = (s) => {
  const m = typeof s === 'string' ? NGAY_RE.exec(s) : null;
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
};
const soNgay = (tu, den) => Math.round((Date.parse(`${den}T00:00:00Z`) - Date.parse(`${tu}T00:00:00Z`)) / 86400000) + 1;
const mot = (v) => (Array.isArray(v) ? v[v.length - 1] : v);

/** Nhật ký sửa, mới trước, phân trang. query: khoa, tu, den (ngày giờ Việt Nam, YYYY-MM-DD, ≤ 92 ngày), page, page_size (≤ 100). */
function nhatKy(db, query = {}) {
  for (const k of Object.keys(query)) if (!['khoa', 'tu', 'den', 'page', 'page_size'].includes(k)) throw loi('THAM_SO_SAI', `Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
  const sNguyen = (v, ten, mac, toiDa) => {
    if (v === undefined || v === '') return mac;
    if (typeof v !== 'string' || !/^\d{1,6}$/.test(v) || Number(v) < 1) throw loi('THAM_SO_SAI', `Tham số "${ten}" phải là số nguyên dương`);
    const n = Number(v);
    if (toiDa && n > toiDa) throw loi('THAM_SO_SAI', `Tham số "${ten}" tối đa ${toiDa}`);
    return n;
  };
  const trang = sNguyen(mot(query.page), 'page', 1);
  const kichThuoc = sNguyen(mot(query.page_size), 'page_size', TRANG_MAC_DINH, TRANG_TOI_DA);
  const khoa = mot(query.khoa);
  if (khoa !== undefined && khoa !== '' && (typeof khoa !== 'string' || !danhBa().THEO_KHOA.has(khoa))) throw loi('KHOA_LA', 'Tham số "khoa" không phải một khóa tham số');
  const tu = mot(query.tu);
  const den = mot(query.den);
  for (const [v, ten] of [[tu, 'tu'], [den, 'den']]) if (v !== undefined && v !== '' && !ngayHopLe(v)) throw loi('THAM_SO_SAI', `Tham số "${ten}" phải là ngày dạng YYYY-MM-DD`);
  const coTu = tu !== undefined && tu !== '';
  const coDen = den !== undefined && den !== '';
  if (coTu && coDen) {
    if (den < tu) throw loi('THAM_SO_SAI', 'Tham số "den" không được trước "tu"');
    if (soNgay(tu, den) > SO_NGAY_TOI_DA) throw loi('THAM_SO_SAI', `Khoảng ngày tối đa ${SO_NGAY_TOI_DA} ngày`);
  }
  const dk = [];
  const tham = {};
  if (khoa) { dk.push('n.khoa = @khoa'); tham.khoa = khoa; }
  if (coTu) { dk.push("date(n.thoi_diem_utc, '+7 hours') >= @tu"); tham.tu = tu; }
  if (coDen) { dk.push("date(n.thoi_diem_utc, '+7 hours') <= @den"); tham.den = den; }
  const where = dk.length ? `WHERE ${dk.join(' AND ')}` : '';
  const tong = db.prepare(`SELECT COUNT(*) AS n FROM tham_so_nhat_ky n ${where}`).get(tham).n;
  const rows = db.prepare(`SELECT n.id, n.khoa, n.gia_tri_cu, n.gia_tri_moi, n.thoi_diem_utc, n.nguoi_ma, n.ly_do, n.loai, u.full_name AS nguoi_ten
    FROM tham_so_nhat_ky n LEFT JOIN users u ON u.hrm_code = n.nguoi_ma ${where} ORDER BY n.id DESC LIMIT @lim OFFSET @off`)
    .all({ ...tham, lim: kichThuoc, off: (trang - 1) * kichThuoc });
  const doc = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  return {
    items: rows.map((r) => ({
      id: r.id, khoa: r.khoa, loai: r.loai, gia_tri_cu: doc(r.gia_tri_cu), gia_tri_moi: doc(r.gia_tri_moi),
      thoi_diem: r.thoi_diem_utc, nguoi: { ma: r.nguoi_ma, ten: r.nguoi_ten || null }, ly_do: r.ly_do
    })),
    pagination: { total: tong, page: trang, page_size: kichThuoc, total_pages: Math.ceil(tong / kichThuoc) }
  };
}

// ------------------------------------------
// Chỉ để test: đổi giá trị TRONG RAM, không ghi DB (kiểm khóa cache tầng 1 không phụ thuộc total_changes).
// ------------------------------------------
function __thuDatRam(khoa, giaTri) {
  if (!coKhoa(khoa)) throw new Error(`Tham số không tồn tại: ${khoa}`);
  if (giaTri === undefined) state.ghiDe.delete(khoa); else state.ghiDe.set(khoa, giaTri);
  state.phienBan += 1;
}

module.exports = {
  ThamSoLoi, lay, layNhieu, phienBan, taoDoiTuong, theoKhoa, theoHam, kiemTraGiaTri,
  ensureThamSoSchema, khoiTao, datNhieu, veMacDinh, danhSach, nhatKy, __thuDatRam
};
