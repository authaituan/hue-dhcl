// ==========================================
// SANLUONG-5g-5: «Khôi phục từ thùng rác» của một lần «Thay thế ngày» (chỉ ADMIN) — docs/ai/19_THAY_THE_NGAY_NHAT_KY_KHOI_PHUC.md, 04_DECISIONS.md #87.
// Khôi phục là BỔ SUNG, KHÔNG xóa gì: thêm lại các dòng đã xóa còn thiếu (INSERT OR IGNORE theo khoá nghiệp vụ ux_arrival_items_key, id dòng cấp MỚI — id gốc đã bị
// dùng lại sau khi thay) và tạo lại bản ghi file OK / EMPTY nếu chưa có; nếu đã có bản OK / EMPTY CÙNG TÊN (thường là file SFTP vừa nạp) thì GẮN dòng vào bản ghi đó.
// KHÔNG đụng trạng thái phát, KHÔNG chạm NAS / mạng, KHÔNG nạp thư viện SFTP, KHÔNG mở DB (db được truyền vào).
// File REJECTED / CONFLICT trong thùng rác KHÔNG được tạo lại (để lõi SFTP không chặn nạp lại bằng DA_TU_CHOI) — chỉ liệt kê trong xem trước.
// Không có SHBG / BD trong kết quả hay thông báo lỗi (chỉ số lượng và tên tệp).
// ==========================================
'use strict';
const path = require('path');
const TT = require('./thayTheThucHien');
const X = require('./thayTheXemTruoc');
const S = require('./sftpSync');
const { NhatKyLoi, kiemTraId } = require('./thayTheNhatKy');
const { xoaBoNhoBd10Share } = require('./arrivalsQuery');

const HTTP = Object.freeze({
  THAM_SO_SAI: 400, XAC_NHAN_SAI: 400, KHONG_TIM_THAY: 404,
  THUNG_RAC_HET_HAN: 409, DA_KHOI_PHUC: 409, KHONG_CO_GI_DE_KHOI_PHUC: 409,
  KHOI_PHUC_THAT_BAI: 500
});
class KhoiPhucLoi extends NhatKyLoi {
  constructor(code, message) { super(code, message, HTTP[code] || 500); }
}

const HANH_DONG = Object.freeze({
  TAO_LAI: 'TAO_LAI',
  GAN_VAO_FILE_HIEN_HANH: 'GAN_VAO_FILE_HIEN_HANH',
  BO_QUA_TU_CHOI: 'BO_QUA_TU_CHOI',
  KHONG_TAO_LAI_TRUNG_BAN_GHI: 'KHONG_TAO_LAI_TRUNG_BAN_GHI'
});

const COT_DONG_CHEP = TT.COT_DONG.filter((c) => c !== 'id' && c !== 'import_file_id');

/** Đọc lần thay + kiểm trạng thái khôi phục. Ném 404 / DA_KHOI_PHUC / THUNG_RAC_HET_HAN. Chỉ đọc. */
function docLanThay(db, id, now) {
  const nk = db.prepare('SELECT * FROM thay_the_nhat_ky WHERE id = ?').get(id);
  if (!nk) throw new KhoiPhucLoi('KHONG_TIM_THAY', 'Không có lần thay thế này');
  if (db.prepare('SELECT 1 FROM thay_the_khoi_phuc WHERE nhat_ky_id = ?').get(id)) {
    throw new KhoiPhucLoi('DA_KHOI_PHUC', 'Lần thay thế này đã được khôi phục — không khôi phục hai lần');
  }
  if (nk.thung_rac_da_don === 1 || nk.thung_rac_het_han_luc <= now.toISOString()) {
    throw new KhoiPhucLoi('THUNG_RAC_HET_HAN', 'Thùng rác của lần thay thế này đã quá hạn hoặc đã được dọn — không còn khôi phục được');
  }
  return nk;
}

const SQL_DEM_THEO_FILE = `
  SELECT d.import_file_id AS fid, COUNT(*) AS tong,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM arrival_items a WHERE a.tracking_no = d.tracking_no AND a.bd10_no = d.bd10_no AND a.bd8_no = d.bd8_no
      AND COALESCE(a.item_confirmed_at, '') = COALESCE(d.item_confirmed_at, '')) THEN 0 ELSE 1 END) AS se_them
  FROM thung_rac_dong d WHERE d.thung_rac_id = ? GROUP BY d.import_file_id`;

/** Phân tích CHỈ ĐỌC: mỗi file trong thùng rác sẽ được làm gì và bao nhiêu dòng sẽ thêm. Dùng chung cho xem trước và thực hiện (tính lại trong giao dịch). */
function phanTich(db, nhatKyId) {
  const dem = new Map(db.prepare(SQL_DEM_THEO_FILE).all(nhatKyId).map((r) => [r.fid, r]));
  const file = db.prepare('SELECT rac_id, id, file_name, status, sha256, row_count FROM thung_rac_file WHERE thung_rac_id = ? ORDER BY id').all(nhatKyId);
  const timHienHanh = db.prepare("SELECT id FROM arrival_import_files WHERE file_name = ? AND status IN ('OK', 'EMPTY') LIMIT 1");
  const timVuong = db.prepare('SELECT id FROM arrival_import_files WHERE file_name = ? AND sha256 = ? LIMIT 1');
  const tapFile = [];
  const daXet = new Set();
  for (const g of file) {
    daXet.add(g.id);
    const c = dem.get(g.id) || { tong: 0, se_them: 0 };
    const m = { rac_id: g.rac_id, id_goc: g.id, ten: g.file_name, trang_thai: g.status, hanh_dong: null, dich_id: null, so_dong_trong_thung_rac: c.tong, so_dong_se_them: 0, so_dong_da_co: 0, so_dong_gan_sang_file_khac: 0, so_dong_khong_khoi_phuc: 0 };
    if (g.status !== 'OK' && g.status !== 'EMPTY') {
      m.hanh_dong = HANH_DONG.BO_QUA_TU_CHOI;
    } else {
      const hh = timHienHanh.get(g.file_name);
      if (hh) { m.hanh_dong = HANH_DONG.GAN_VAO_FILE_HIEN_HANH; m.dich_id = hh.id; } else if (timVuong.get(g.file_name, g.sha256)) m.hanh_dong = HANH_DONG.KHONG_TAO_LAI_TRUNG_BAN_GHI;
      else m.hanh_dong = HANH_DONG.TAO_LAI;
    }
    if (m.hanh_dong === HANH_DONG.TAO_LAI || m.hanh_dong === HANH_DONG.GAN_VAO_FILE_HIEN_HANH) {
      m.so_dong_se_them = c.se_them;
      m.so_dong_da_co = c.tong - c.se_them;
      if (m.hanh_dong === HANH_DONG.GAN_VAO_FILE_HIEN_HANH) m.so_dong_gan_sang_file_khac = c.se_them;
    } else {
      m.so_dong_khong_khoi_phuc = c.tong;
    }
    tapFile.push(m);
  }
  let moCoi = 0; // dòng thùng rác không có bản ghi file đi kèm (không xảy ra với thùng rác do 5g-3 tạo; phòng dữ liệu hỏng)
  for (const [fid, c] of dem) if (!daXet.has(fid)) moCoi += c.tong;
  const tong = (k) => tapFile.reduce((a, m) => a + m[k], 0);
  const dem2 = (h) => tapFile.filter((m) => m.hanh_dong === h).length;
  const t = {
    so_dong_trong_thung_rac: tong('so_dong_trong_thung_rac') + moCoi,
    so_dong_se_them: tong('so_dong_se_them'),
    so_dong_da_co: tong('so_dong_da_co'),
    so_dong_gan_sang_file_khac: tong('so_dong_gan_sang_file_khac'),
    so_dong_khong_khoi_phuc: tong('so_dong_khong_khoi_phuc') + moCoi,
    so_file_se_tao_lai: dem2(HANH_DONG.TAO_LAI),
    so_file_gan_vao_hien_hanh: dem2(HANH_DONG.GAN_VAO_FILE_HIEN_HANH),
    so_file_bo_qua: dem2(HANH_DONG.BO_QUA_TU_CHOI) + dem2(HANH_DONG.KHONG_TAO_LAI_TRUNG_BAN_GHI)
  };
  const canhBao = [];
  if (t.so_dong_gan_sang_file_khac > 0) {
    canhBao.push({ ma: 'DONG_GAN_SANG_FILE_KHAC', noi_dung: `${t.so_dong_gan_sang_file_khac} dòng sẽ được gắn vào bản ghi file hiện hành CÙNG TÊN (không phải bản ghi gốc); số dòng (row_count) của bản ghi không đổi` });
  }
  if (dem2(HANH_DONG.BO_QUA_TU_CHOI) > 0) {
    canhBao.push({ ma: 'FILE_TU_CHOI_KHONG_TAO_LAI', noi_dung: `${dem2(HANH_DONG.BO_QUA_TU_CHOI)} bản ghi file bị từ chối (REJECTED / CONFLICT) KHÔNG được tạo lại` });
  }
  if (dem2(HANH_DONG.KHONG_TAO_LAI_TRUNG_BAN_GHI) > 0) {
    canhBao.push({ ma: 'KHONG_TAO_LAI_TRUNG_BAN_GHI', noi_dung: `${dem2(HANH_DONG.KHONG_TAO_LAI_TRUNG_BAN_GHI)} file không tạo lại được vì đã có bản ghi cùng tên và mã băm` });
  }
  if (t.so_dong_khong_khoi_phuc > 0) {
    canhBao.push({ ma: 'DONG_KHONG_KHOI_PHUC', noi_dung: `${t.so_dong_khong_khoi_phuc} dòng thuộc file không tạo lại được nên KHÔNG khôi phục` });
  }
  if (t.so_dong_se_them === 0 && t.so_file_se_tao_lai === 0) {
    canhBao.push({ ma: 'KHONG_CO_GI_DE_THEM', noi_dung: 'Không có dòng hay file nào cần thêm lại' });
  }
  return { tap_file: tapFile, ...t, canh_bao: canhBao };
}

const baoCao = (nk, p) => ({
  nhat_ky_id: nk.id, bcvh: nk.bcvh, ngay: nk.ngay,
  thung_rac: { het_han_luc: nk.thung_rac_het_han_luc },
  so_dong_trong_thung_rac: p.so_dong_trong_thung_rac,
  so_dong_se_them: p.so_dong_se_them,
  so_dong_da_co: p.so_dong_da_co,
  so_dong_gan_sang_file_khac: p.so_dong_gan_sang_file_khac,
  so_dong_khong_khoi_phuc: p.so_dong_khong_khoi_phuc,
  so_file_se_tao_lai: p.so_file_se_tao_lai,
  so_file_gan_vao_hien_hanh: p.so_file_gan_vao_hien_hanh,
  so_file_bo_qua: p.so_file_bo_qua,
  tap_file: p.tap_file.map((m) => ({
    ten: m.ten, trang_thai: m.trang_thai, hanh_dong: m.hanh_dong, so_dong_trong_thung_rac: m.so_dong_trong_thung_rac, so_dong_se_them: m.so_dong_se_them,
    so_dong_da_co: m.so_dong_da_co, so_dong_gan_sang_file_khac: m.so_dong_gan_sang_file_khac, so_dong_khong_khoi_phuc: m.so_dong_khong_khoi_phuc
  })),
  canh_bao: p.canh_bao,
  co_the_khoi_phuc: p.so_dong_se_them > 0 || p.so_file_se_tao_lai > 0
});

/** XEM TRƯỚC (chỉ đọc): không ghi DB, không khoá, không sao lưu. Ném KhoiPhucLoi (404 / 409). */
function xemTruoc({ db, nhatKyId, now = new Date() }) {
  const id = kiemTraId(nhatKyId, 'nhat_ky_id');
  const nk = docLanThay(db, id, now);
  return baoCao(nk, phanTich(db, id));
}

function kiemTraXacNhan(xacNhan, nk) {
  const sai = () => new KhoiPhucLoi('XAC_NHAN_SAI', 'Xác nhận không khớp: phải gõ lại đúng mã BCVH và ngày (YYYY-MM-DD) của lần thay thế cần khôi phục');
  if (!xacNhan || typeof xacNhan !== 'object' || Array.isArray(xacNhan)) throw sai();
  if (Object.keys(xacNhan).some((k) => !['ma_bcvh', 'ngay'].includes(k))) throw sai();
  if (xacNhan.ma_bcvh !== nk.bcvh || xacNhan.ngay !== nk.ngay) throw sai();
}

/**
 * khoiPhuc({ db, nhatKyId, xacNhan, nguoiThucHien, sauLuuDir, now, options }) — THỰC HIỆN. Chỉ ĐỌC bộ nhớ + DB, không mạng.
 *  options: { dangDongBo (test), dungLuongTrong(thuMuc) (test), truocGiaoDich() (async, sau sao lưu — test), sauKhiThem() (trong giao dịch, sau khi thêm — test) }.
 * Thứ tự: id + trạng thái + xác nhận → khoá chung → phân tích → sao lưu toàn DB → MỘT giao dịch đồng bộ (tính lại → tạo lại file / gắn → thêm dòng → nhật ký) → dọn → nhả khoá.
 * Lỗi bất kỳ trong giao dịch → hoàn lại toàn bộ, KHOI_PHUC_THAT_BAI (500).
 */
async function khoiPhuc({ db, nhatKyId, xacNhan = null, nguoiThucHien = null, sauLuuDir = null, now = () => new Date(), options = {} }) {
  const t0 = Date.now();
  const id = kiemTraId(nhatKyId, 'nhat_ky_id');
  const batDau = now();
  const nk0 = docLanThay(db, id, batDau);
  kiemTraXacNhan(xacNhan, nk0);

  const nha = TT.giuKhoaChung(db, batDau, options, now);
  try {
    // Đọc lại SAU khi giữ khoá (không có await giữa kiểm và giữ khoá nhưng người khác có thể đã khôi phục ngay trước đó).
    const nk = docLanThay(db, id, batDau);
    const truoc = phanTich(db, id);
    if (truoc.so_dong_se_them === 0 && truoc.so_file_se_tao_lai === 0) {
      throw new KhoiPhucLoi('KHONG_CO_GI_DE_KHOI_PHUC', 'Không có dòng hay file nào cần thêm lại — KHÔNG làm gì');
    }
    const thuMucSaoLuu = sauLuuDir || path.join(path.dirname(path.resolve(db.name)), 'backups');
    const sl = await TT.saoLuu(db, thuMucSaoLuu, nk.bcvh, nk.ngay, batDau, { dungLuongTrong: options.dungLuongTrong || null, tienToSaoLuu: 'truoc-khoi-phuc' });
    if (typeof options.truocGiaoDich === 'function') await options.truocGiaoDich();

    const luc = now();
    const cotF = TT.COT_FILE.join(', ');
    const cotKhacId = TT.COT_FILE.filter((c) => c !== 'id').join(', ');
    const cotD = COT_DONG_CHEP.join(', ');
    let ketQua = null;
    const thucHien = db.transaction(() => {
      docLanThay(db, id, luc); // vẫn còn khôi phục được (và chưa ai khôi phục trong lúc sao lưu)
      const p = phanTich(db, id); // tính lại trong giao dịch: dữ liệu có thể đổi trong lúc sao lưu
      const idDung = db.prepare('SELECT 1 FROM arrival_import_files WHERE id = ?');
      let soThem = 0;
      for (const m of p.tap_file) {
        let dich = m.dich_id;
        if (m.hanh_dong === HANH_DONG.TAO_LAI) {
          const giuId = !idDung.get(m.id_goc);
          dich = Number(db.prepare(giuId
            ? `INSERT INTO arrival_import_files (${cotF}) SELECT ${cotF} FROM thung_rac_file WHERE rac_id = ?`
            : `INSERT INTO arrival_import_files (${cotKhacId}) SELECT ${cotKhacId} FROM thung_rac_file WHERE rac_id = ?`).run(m.rac_id).lastInsertRowid);
        }
        if (dich === null || m.so_dong_trong_thung_rac === 0) continue;
        soThem += db.prepare(`INSERT OR IGNORE INTO arrival_items (import_file_id, ${cotD}) SELECT @dich, ${cotD} FROM thung_rac_dong WHERE thung_rac_id = @t AND import_file_id = @goc ORDER BY id`)
          .run({ dich, t: id, goc: m.id_goc }).changes;
      }
      if (typeof options.sauKhiThem === 'function') options.sauKhiThem();
      const daCo = p.so_dong_trong_thung_rac - p.so_dong_khong_khoi_phuc - soThem; // dòng thuộc file khôi phục được nhưng đã có sẵn
      const ganSang = p.tap_file.filter((m) => m.hanh_dong === HANH_DONG.GAN_VAO_FILE_HIEN_HANH).reduce((a, m) => a + m.so_dong_se_them, 0);
      const khoiPhucId = Number(db.prepare(`INSERT INTO thay_the_khoi_phuc (nhat_ky_id, thoi_diem_utc, nguoi_thuc_hien, so_dong_trong_thung_rac, so_dong_them, so_dong_da_co,
        so_dong_gan_sang_file_khac, so_dong_khong_khoi_phuc, so_file_tao_lai, so_file_gan_vao_hien_hanh, so_file_bo_qua, duong_dan_sao_luu)
        VALUES (@nk, @luc, @nguoi, @tong, @them, @daCo, @gan, @khong, @tao, @ganF, @boQua, @sl)`).run({
        nk: id, luc: luc.toISOString(), nguoi: String(nguoiThucHien || 'khong-ro').slice(0, 80), tong: p.so_dong_trong_thung_rac, them: soThem, daCo, gan: ganSang,
        khong: p.so_dong_khong_khoi_phuc, tao: p.so_file_se_tao_lai, ganF: p.so_file_gan_vao_hien_hanh, boQua: p.so_file_bo_qua, sl: sl.duong_dan
      }).lastInsertRowid);
      ketQua = { khoiPhucId, soThem, daCo, ganSang, p };
    });
    try {
      thucHien.immediate();
    } catch (err) {
      if (err instanceof NhatKyLoi || err instanceof X.XemTruocLoi) throw err;
      throw new KhoiPhucLoi('KHOI_PHUC_THAT_BAI', `Giao dịch khôi phục thất bại (${S.lamSach(String((err && err.code) || (err && err.name) || 'LOI'), [], 40)}) — đã hoàn lại toàn bộ, DB y nguyên`);
    }
    xoaBoNhoBd10Share(db);
    let daDonSaoLuu = 0;
    try { daDonSaoLuu = TT.donSaoLuu(thuMucSaoLuu); } catch (e) { /* lỗi dọn không làm hỏng lần khôi phục đã xong */ }
    const { p } = ketQua;
    return {
      ...baoCao(nk, p),
      khoi_phuc_id: ketQua.khoiPhucId,
      so_dong_them: ketQua.soThem,
      so_dong_da_co: ketQua.daCo,
      so_dong_gan_sang_file_khac: ketQua.ganSang,
      so_file_tao_lai: p.so_file_se_tao_lai,
      sao_luu: { duong_dan: sl.duong_dan, tep: sl.tep, kich_thuoc: sl.kich_thuoc },
      da_don_sao_luu: daDonSaoLuu,
      thoi_gian_ms: Date.now() - t0
    };
  } finally {
    nha();
  }
}

module.exports = { KhoiPhucLoi, HTTP, HANH_DONG, xemTruoc, khoiPhuc, phanTich };
