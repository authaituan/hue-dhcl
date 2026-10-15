// ==========================================
// SANLUONG-5f-1c: «Đã xem xét» cho mục cần xử lý của màn «Nạp dữ liệu nguồn» (chỉ ADMIN) — docs/ai/17_NAP_DU_LIEU_NGUON_API_DOC.md, 04_DECISIONS.md #89.
// Lõi THUẦN: nhận `db`, không nạp thư viện SFTP, không mạng, không mở DB. Bảng nap_nguon_da_xem_xet (giờ lưu UTC, ISO …Z).
// Dấu «đã xem xét» chỉ có hiệu lực khi DẤU VÂN TAY hiện tại của mục khớp dấu vân tay lúc đánh dấu; lệch thì mục tự quay lại can_xu_ly (bản ghi giữ làm lịch sử).
// Không phụ thuộc vòng với napNguonDoc: các hàm cần luoi() / NapNguonLoi nạp lười bên trong hàm.
// ==========================================
'use strict';
const crypto = require('crypto');

const GHI_CHU_TOI_DA = 200;
const LOAI_HOP_LE = ['DOT', 'NGAY'];

function ensureXemXetSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nap_nguon_da_xem_xet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loai TEXT NOT NULL CHECK (loai IN ('DOT', 'NGAY')),
      bcvh TEXT NOT NULL,
      ngay TEXT NOT NULL,
      dot TEXT CHECK (dot IS NULL OR dot IN ('S', 'C')),
      trang_thai TEXT,
      ly_do TEXT,
      nghi_ngo TEXT,
      dau_van_tay TEXT NOT NULL,
      nguoi_ma TEXT NOT NULL,
      ghi_chu TEXT,
      tao_luc TEXT NOT NULL,
      huy_luc TEXT,
      huy_nguoi_ma TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_nap_nguon_da_xem_xet_hoat_dong
      ON nap_nguon_da_xem_xet (loai, bcvh, ngay, COALESCE(dot, '')) WHERE huy_luc IS NULL;
  `);
}

// ------------------------------------------
// Dấu vân tay
// ------------------------------------------
/** DOT: trạng thái + lý do + băm 16 hex đầu của SHA-256 danh sách `tên|kích thước` các file CÒN trên nguồn của ô (sắp theo tên); không có -> băm chuỗi rỗng. `c` = ô từ tinhO. */
function dauVanTayDot(c) {
  const ds = ((c.chi_tiet && c.chi_tiet.file_nguon) || []).filter((s) => s.con_tren_nguon)
    .map((s) => `${s.ten}|${s.kich_thuoc}`).sort();
  const bam = crypto.createHash('sha256').update(ds.join('\n')).digest('hex').slice(0, 16);
  return `${c.trang_thai}|${c.ly_do || ''}|${bam}`;
}
/** NGAY: nghi_ngo (IT|NHIEU) + tong_dong của ngày (từ ngay_bcvh). */
const dauVanTayNgay = (n) => `${n.nghi_ngo}|${n.tong_dong}`;

const khoaMuc = (loai, bcvh, ngay, dot) => `${loai}|${bcvh}|${ngay}|${dot || ''}`;

// ------------------------------------------
// Đọc / lọc
// ------------------------------------------
/** Các bản ghi ĐANG HOẠT ĐỘNG (chưa hủy) trong khoảng ngày và danh sách BCVH. Thiếu bảng (DB chưa chạy ensure) -> []. */
function banGhiHoatDong(db, tu, den, dsBcvh) {
  try {
    return db.prepare(`SELECT id, loai, bcvh, ngay, dot, trang_thai, ly_do, nghi_ngo, dau_van_tay, nguoi_ma, ghi_chu, tao_luc
      FROM nap_nguon_da_xem_xet WHERE huy_luc IS NULL AND ngay BETWEEN @tu AND @den AND bcvh IN (SELECT value FROM json_each(@m))`)
      .all({ tu, den, m: JSON.stringify(dsBcvh) });
  } catch (e) {
    if (/no such table/i.test(e.message)) return [];
    throw e;
  }
}

/**
 * Tách ứng viên (mục cần xử lý, kèm dấu vân tay hiện tại) thành { conLai, daXemXet }.
 * muc.dau_van_tay (nội bộ) do luoi() gắn; hàm này gỡ trường đó khỏi mục trả ra. Tên người tra từ bảng users lúc đọc.
 */
function loc(db, tu, den, dsBcvh, canXuLy) {
  const ghi = banGhiHoatDong(db, tu, den, dsBcvh);
  const hieuLuc = new Map();
  for (const b of ghi) hieuLuc.set(khoaMuc(b.loai, b.bcvh, b.ngay, b.dot), b);
  const ten = new Map();
  const ma = [...new Set(ghi.map((b) => b.nguoi_ma))];
  if (ma.length) {
    for (const u of db.prepare('SELECT hrm_code, full_name FROM users WHERE hrm_code IN (SELECT value FROM json_each(@m))').all({ m: JSON.stringify(ma) })) ten.set(u.hrm_code, u.full_name);
  }
  const conLai = [];
  const daXemXet = [];
  for (const m of canXuLy) {
    const dauHienTai = m.dau_van_tay;
    delete m.dau_van_tay;
    const b = (m.loai === 'DOT' || m.loai === 'NGAY') ? hieuLuc.get(khoaMuc(m.loai, m.bcvh, m.ngay, m.dot)) : null;
    if (b && dauHienTai === b.dau_van_tay) {
      daXemXet.push({
        id: b.id, loai: b.loai, bcvh: b.bcvh, ngay: b.ngay, dot: b.dot, trang_thai: b.trang_thai, ly_do: b.ly_do, nghi_ngo: b.nghi_ngo,
        nguoi: { ma: b.nguoi_ma, ten: ten.get(b.nguoi_ma) || null }, luc: b.tao_luc, ghi_chu: b.ghi_chu
      });
    } else conLai.push(m);
  }
  daXemXet.sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : a.bcvh === b.bcvh ? (a.loai === b.loai ? (a.dot === b.dot ? 0 : a.dot === 'C' ? -1 : 1) : (a.loai === 'DOT' ? -1 : 1)) : (a.bcvh < b.bcvh ? -1 : 1)));
  return { conLai, daXemXet };
}

// ------------------------------------------
// Ghi
// ------------------------------------------
function kiemTraThan(body) {
  const { NapNguonLoi, MA_BCVH } = require('./napNguonDoc');
  const sai = (m) => new NapNguonLoi('THAM_SO_SAI', m, 400);
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) throw sai('Thân yêu cầu phải là một đối tượng JSON');
  for (const k of Object.keys(body)) {
    if (!['loai', 'bcvh', 'ngay', 'dot', 'ghi_chu'].includes(k)) throw sai(`Trường không hỗ trợ: "${String(k).slice(0, 40)}"`);
  }
  if (!LOAI_HOP_LE.includes(body.loai)) throw sai('Trường "loai" phải là DOT hoặc NGAY');
  if (typeof body.bcvh !== 'string' || !MA_BCVH.includes(body.bcvh)) throw sai(`Trường "bcvh" phải là một trong: ${MA_BCVH.join(', ')}`);
  const { ngayHopLe } = require('./napNguonDoc');
  if (!ngayHopLe(body.ngay)) throw sai('Trường "ngay" phải là ngày hợp lệ dạng YYYY-MM-DD');
  if (body.loai === 'DOT') {
    if (body.dot !== 'S' && body.dot !== 'C') throw sai('Trường "dot" là bắt buộc khi loai = DOT, giá trị S hoặc C');
  } else if (body.dot !== undefined) throw sai('Không được có trường "dot" khi loai = NGAY');
  let ghiChu = null;
  if (body.ghi_chu !== undefined && body.ghi_chu !== null) {
    if (typeof body.ghi_chu !== 'string') throw sai('Trường "ghi_chu" phải là chuỗi');
    ghiChu = body.ghi_chu.trim() || null;
    if (ghiChu && ghiChu.length > GHI_CHU_TOI_DA) throw sai(`Ghi chú tối đa ${GHI_CHU_TOI_DA} ký tự`);
  }
  return { loai: body.loai, bcvh: body.bcvh, ngay: body.ngay, dot: body.loai === 'DOT' ? body.dot : null, ghiChu };
}

/**
 * Đánh dấu «đã xem xét». Máy chủ tự tính lại ô / ngày đúng (bcvh, ngày) để biết mục có đang cần xử lý và dấu vân tay hiện tại.
 * Trả { id, da_co }. 409 KHONG_CAN_XU_LY nếu mục không nằm trong can_xu_ly.
 */
function danhDau({ db, now = new Date(), user, body }) {
  const D = require('./napNguonDoc');
  const m = kiemTraThan(body);
  const h = D.dauVanTayMuc({ db, now, loai: m.loai, bcvh: m.bcvh, ngay: m.ngay, dot: m.dot });
  if (!h.can_xu_ly) throw new D.NapNguonLoi('KHONG_CAN_XU_LY', 'Mục này hiện không nằm trong danh sách cần xử lý', 409);
  const tra = { loai: m.loai, bcvh: m.bcvh, ngay: m.ngay, dot: m.dot || '' };
  const cu = db.prepare(`SELECT id, dau_van_tay FROM nap_nguon_da_xem_xet WHERE huy_luc IS NULL AND loai = @loai AND bcvh = @bcvh AND ngay = @ngay AND COALESCE(dot, '') = @dot`).get(tra);
  if (cu && cu.dau_van_tay === h.dau) return { id: cu.id, da_co: true, loai: m.loai, bcvh: m.bcvh, ngay: m.ngay };
  const luc = new Date().toISOString();
  const tx = db.transaction(() => {
    if (cu) db.prepare('UPDATE nap_nguon_da_xem_xet SET huy_luc = ?, huy_nguoi_ma = ? WHERE id = ?').run(luc, user.hrm_code, cu.id); // bản lỗi thời: hủy, giữ làm lịch sử
    return Number(db.prepare(`INSERT INTO nap_nguon_da_xem_xet (loai, bcvh, ngay, dot, trang_thai, ly_do, nghi_ngo, dau_van_tay, nguoi_ma, ghi_chu, tao_luc)
      VALUES (@loai, @bcvh, @ngay, @dot, @trang_thai, @ly_do, @nghi_ngo, @dau, @ma, @ghiChu, @luc)`)
      .run({ loai: m.loai, bcvh: m.bcvh, ngay: m.ngay, dot: m.dot, trang_thai: h.trang_thai, ly_do: h.ly_do, nghi_ngo: h.nghi_ngo, dau: h.dau, ma: user.hrm_code, ghiChu: m.ghiChu, luc }).lastInsertRowid);
  });
  return { id: tx(), da_co: false, loai: m.loai, bcvh: m.bcvh, ngay: m.ngay };
}

/** Hủy đánh dấu: giữ bản ghi, đặt huy_luc + huy_nguoi_ma. 404 KHONG_TIM_THAY nếu không có hoặc đã hủy. */
function huy({ db, id, user }) {
  const { NapNguonLoi } = require('./napNguonDoc');
  if (!/^\d+$/.test(String(id)) || Number(id) < 1 || Number(id) > Number.MAX_SAFE_INTEGER) throw new NapNguonLoi('KHONG_TIM_THAY', 'Không có mục đã xem xét này', 404);
  const b = db.prepare('SELECT id, loai, bcvh, ngay FROM nap_nguon_da_xem_xet WHERE id = ? AND huy_luc IS NULL').get(Number(id));
  if (!b) throw new NapNguonLoi('KHONG_TIM_THAY', 'Không có mục đã xem xét này', 404);
  db.prepare('UPDATE nap_nguon_da_xem_xet SET huy_luc = ?, huy_nguoi_ma = ? WHERE id = ?').run(new Date().toISOString(), user.hrm_code, b.id);
  return { id: b.id, da_huy: true, loai: b.loai, bcvh: b.bcvh, ngay: b.ngay };
}

module.exports = { ensureXemXetSchema, dauVanTayDot, dauVanTayNgay, loc, danhDau, huy, GHI_CHU_TOI_DA };
