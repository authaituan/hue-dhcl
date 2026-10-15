// ==========================================
// SANLUONG-5g-5: lõi ĐỌC «Nhật ký thay thế ngày» (chỉ ADMIN) — docs/ai/19_THAY_THE_NGAY_NHAT_KY_KHOI_PHUC.md, 04_DECISIONS.md #87.
// THUẦN ĐỌC: chỉ SELECT trên thay_the_nhat_ky / thay_the_khoi_phuc / thung_rac_* / users; không mạng, không mở DB (db được truyền vào), không nạp thư viện SFTP.
// KHÔNG trả: đường dẫn sao lưu hay đường dẫn máy chủ (chỉ tên tệp), SHBG / BD đầy đủ, nội dung dòng thùng rác.
// Giờ trong DB là UTC (ISO …Z); `thoi_diem_bangkok` là cùng thời điểm theo UTC+7.
// ==========================================
'use strict';
const { VALID_BCVH_CODES } = require('./userBcvh');

/** Lỗi có MÃ của API nhật ký / khôi phục: code ∈ MA_LOI, httpStatus ∈ HTTP. Cùng dạng { error, ma } như các API khác. */
class NhatKyLoi extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
const saiThamSo = (m) => new NhatKyLoi('THAM_SO_SAI', m, 400);

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

/** UTC ISO (…Z) -> cùng thời điểm theo UTC+7 dạng YYYY-MM-DDTHH:mm:ss+07:00; không đọc được thì null. */
function sangBangkok(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return `${new Date(ms + 7 * 3600000).toISOString().slice(0, 19)}+07:00`;
}
/** Chỉ tên tệp (bỏ mọi thư mục, cả / lẫn \). */
const tenTep = (duongDan) => (typeof duongDan === 'string' && duongDan ? duongDan.split(/[\\/]/).pop() : null);
const phanTram = (a, b) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);
function docJson(s) {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

/** Kiểm và chuẩn hoá tham số danh sách. Tham số lạ do route chặn (chiNhan). */
function kiemTraTruyVan(q = {}) {
  const sNguyen = (v, ten, mac, toiDa) => {
    if (v === undefined || v === '') return mac;
    if (typeof v !== 'string' || !/^\d{1,6}$/.test(v) || Number(v) < 1) throw saiThamSo(`Tham số "${ten}" phải là số nguyên dương`);
    const n = Number(v);
    if (toiDa && n > toiDa) throw saiThamSo(`Tham số "${ten}" tối đa ${toiDa}`);
    return n;
  };
  const trang = sNguyen(mot(q.page), 'page', 1);
  const kichThuoc = sNguyen(mot(q.page_size), 'page_size', TRANG_MAC_DINH, TRANG_TOI_DA);
  const bcvh = mot(q.bcvh);
  if (bcvh !== undefined && bcvh !== '' && !VALID_BCVH_CODES.includes(bcvh)) throw saiThamSo(`Tham số "bcvh" phải là một trong: ${VALID_BCVH_CODES.join(', ')}`);
  const tu = mot(q.tu_ngay);
  const den = mot(q.den_ngay);
  for (const [v, ten] of [[tu, 'tu_ngay'], [den, 'den_ngay']]) {
    if (v !== undefined && v !== '' && !ngayHopLe(v)) throw saiThamSo(`Tham số "${ten}" phải là ngày thuần dạng YYYY-MM-DD`);
  }
  const coTu = tu !== undefined && tu !== '';
  const coDen = den !== undefined && den !== '';
  if (coTu && coDen) {
    if (den < tu) throw saiThamSo('Tham số "den_ngay" không được trước "tu_ngay"');
    if (soNgay(tu, den) > SO_NGAY_TOI_DA) throw saiThamSo(`Khoảng ngày tối đa ${SO_NGAY_TOI_DA} ngày`);
  }
  const nguoi = mot(q.nguoi);
  if (nguoi !== undefined && nguoi !== '' && (typeof nguoi !== 'string' || nguoi.length > 60)) throw saiThamSo('Tham số "nguoi" phải là mã người thực hiện (chuỗi, tối đa 60 ký tự)');
  return {
    trang, kichThuoc,
    bcvh: bcvh || null, tu: coTu ? tu : null, den: coDen ? den : null, nguoi: nguoi || null
  };
}

const TRUONG = `n.id, n.thoi_diem_utc, n.nguoi_thuc_hien, n.bcvh, n.ngay, n.so_file_cu, n.so_dong_cu, n.so_file_moi, n.so_dong_moi, n.shbg_cu, n.shbg_mat_that,
  n.shbg_mat_can_tren, n.muc_canh_bao, n.dong_y_mat, n.duong_dan_sao_luu, n.ket_qua, n.thung_rac_het_han_luc, n.thung_rac_da_don,
  u.full_name AS nguoi_ten, k.id AS khoi_phuc_id, k.thoi_diem_utc AS khoi_phuc_luc`;
const TU = `FROM thay_the_nhat_ky n LEFT JOIN users u ON u.hrm_code = n.nguoi_thuc_hien LEFT JOIN thay_the_khoi_phuc k ON k.nhat_ky_id = n.id`;

/** Một mục (dùng chung cho danh sách và chi tiết). */
function dinhDang(r, nowIso) {
  const daKhoiPhuc = r.khoi_phuc_id !== null && r.khoi_phuc_id !== undefined;
  const hetHan = r.thung_rac_da_don === 1 || r.thung_rac_het_han_luc <= nowIso;
  return {
    id: r.id,
    bcvh: r.bcvh,
    ngay: r.ngay,
    thoi_diem: r.thoi_diem_utc,
    thoi_diem_bangkok: sangBangkok(r.thoi_diem_utc),
    nguoi: { ma: r.nguoi_thuc_hien, ten: r.nguoi_ten || null },
    so_dong_xoa: r.so_dong_cu,
    so_dong_nap: r.so_dong_moi,
    so_file_xoa: r.so_file_cu,
    so_file_nap: r.so_file_moi,
    canh_bao: { muc: r.muc_canh_bao, da_dong_y_mat: r.dong_y_mat === 1 },
    mat_that: { so_shbg: r.shbg_mat_that, tren_so_shbg_cu: r.shbg_cu, ty_le_phan_tram: phanTram(r.shbg_mat_that, r.shbg_cu), can_tren_so_shbg: r.shbg_mat_can_tren },
    ket_qua: r.ket_qua,
    sao_luu: r.duong_dan_sao_luu ? { tep: tenTep(r.duong_dan_sao_luu), kich_thuoc: null } : null, // nhật ký không lưu kích thước
    thung_rac: {
      het_han_luc: r.thung_rac_het_han_luc,
      con_khoi_phuc_duoc: !hetHan && !daKhoiPhuc && r.ket_qua === 'THANH_CONG',
      da_khoi_phuc: daKhoiPhuc
    }
  };
}

/** Danh sách phân trang, mới trước. now: Date (giờ máy chủ, để quyết «còn khôi phục được»). */
function danhSach({ db, query = {}, now = new Date() }) {
  const t = kiemTraTruyVan(query);
  const dk = [];
  const tham = {};
  if (t.bcvh) { dk.push('n.bcvh = @bcvh'); tham.bcvh = t.bcvh; }
  if (t.tu) { dk.push('n.ngay >= @tu'); tham.tu = t.tu; }
  if (t.den) { dk.push('n.ngay <= @den'); tham.den = t.den; }
  if (t.nguoi) { dk.push('n.nguoi_thuc_hien = @nguoi'); tham.nguoi = t.nguoi; }
  const where = dk.length ? `WHERE ${dk.join(' AND ')}` : '';
  const tong = db.prepare(`SELECT COUNT(*) AS n FROM thay_the_nhat_ky n ${where}`).get(tham).n;
  const rows = db.prepare(`SELECT ${TRUONG} ${TU} ${where} ORDER BY n.thoi_diem_utc DESC, n.id DESC LIMIT @lim OFFSET @off`)
    .all({ ...tham, lim: t.kichThuoc, off: (t.trang - 1) * t.kichThuoc });
  const nowIso = now.toISOString();
  return {
    items: rows.map((r) => dinhDang(r, nowIso)),
    pagination: { total: tong, page: t.trang, page_size: t.kichThuoc, total_pages: Math.ceil(tong / t.kichThuoc) }
  };
}

/** id từ đường dẫn: số nguyên dương (≤ 9 chữ số); sai -> 400. */
function kiemTraId(v, ten = 'id') {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e9) return v;
  if (typeof v === 'string' && /^\d{1,9}$/.test(v) && Number(v) > 0) return Number(v);
  throw saiThamSo(`Tham số "${ten}" phải là số nguyên dương`);
}

/** Chi tiết một lần thay (404 KHONG_TIM_THAY nếu không có). */
function chiTiet({ db, id, now = new Date() }) {
  const n = kiemTraId(id);
  const r = db.prepare(`SELECT ${TRUONG} ${TU} WHERE n.id = ?`).get(n);
  if (!r) throw new NhatKyLoi('KHONG_TIM_THAY', 'Không có lần thay thế này', 404);
  const full = db.prepare('SELECT tap_file_cu, tap_file_moi FROM thay_the_nhat_ky WHERE id = ?').get(n);
  const muc = dinhDang(r, now.toISOString());
  const dongRac = db.prepare('SELECT COUNT(*) AS n FROM thung_rac_dong WHERE thung_rac_id = ?').get(n).n;
  const fileRac = db.prepare('SELECT COUNT(*) AS n FROM thung_rac_file WHERE thung_rac_id = ?').get(n).n;
  const kp = r.khoi_phuc_id ? db.prepare(`SELECT k.thoi_diem_utc, k.nguoi_thuc_hien, u.full_name AS ten, k.so_dong_them, k.so_dong_da_co, k.so_dong_gan_sang_file_khac,
      k.so_dong_khong_khoi_phuc, k.so_file_tao_lai, k.so_file_gan_vao_hien_hanh, k.so_file_bo_qua
    FROM thay_the_khoi_phuc k LEFT JOIN users u ON u.hrm_code = k.nguoi_thuc_hien WHERE k.id = ?`).get(r.khoi_phuc_id) : null;
  return {
    ...muc,
    tap_file_cu: docJson(full.tap_file_cu).map((f) => ({ ten: f.file_name ?? null, trang_thai: f.status ?? null, nguon: f.source ?? null, so_dong: f.so_dong_thuc ?? f.row_count ?? 0 })),
    tap_file_moi: docJson(full.tap_file_moi).map((f) => ({ ten: f.ten ?? null, trang_thai: f.trang_thai ?? null, so_dong: f.so_dong ?? 0, da_ghi: f.da_ghi ?? 0, bo_qua_trung: f.bo_qua_trung ?? 0 })),
    thung_rac: { ...muc.thung_rac, so_dong: dongRac, so_file: fileRac },
    khoi_phuc: kp ? {
      thoi_diem: kp.thoi_diem_utc, thoi_diem_bangkok: sangBangkok(kp.thoi_diem_utc), nguoi: { ma: kp.nguoi_thuc_hien, ten: kp.ten || null },
      so_dong_them: kp.so_dong_them, so_dong_da_co: kp.so_dong_da_co, so_dong_gan_sang_file_khac: kp.so_dong_gan_sang_file_khac,
      so_dong_khong_khoi_phuc: kp.so_dong_khong_khoi_phuc, so_file_tao_lai: kp.so_file_tao_lai, so_file_gan_vao_hien_hanh: kp.so_file_gan_vao_hien_hanh, so_file_bo_qua: kp.so_file_bo_qua
    } : null
  };
}

module.exports = { NhatKyLoi, saiThamSo, kiemTraTruyVan, kiemTraId, danhSach, chiTiet, sangBangkok, tenTep, TRANG_MAC_DINH, TRANG_TOI_DA, SO_NGAY_TOI_DA };
