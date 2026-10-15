// ==========================================
// SANLUONG-5f-1: lõi ĐỌC cho màn «Nạp dữ liệu nguồn» (chỉ ADMIN) — docs/ai/17_NAP_DU_LIEU_NGUON_API_DOC.md, 04_DECISIONS.md #85.
// THUẦN ĐỌC: chỉ SELECT, không bảng mới, không nạp thư viện SFTP, không mạng, không mở DB (db được truyền vào). `now` (Date, giờ máy chủ) và trạng thái hẹn giờ được tiêm để test.
// Không trả: đường dẫn / địa chỉ máy chủ nguồn, tài khoản, mật khẩu, vân tay, nội dung file, SHBG. Mọi chuỗi lỗi đi qua lamSach (che bí mật + bỏ số dài) trước khi trả.
// Giờ trong DB là UTC (ISO …Z); ngày / giờ NGHIỆP VỤ (hôm nay, giờ mong đợi) tính theo giờ máy chủ của `now`.
// ==========================================
'use strict';
const S = require('./sftpSync');
const F = require('./sftpFiles');
const { DASHBOARD_BCVH, bcvhNames } = require('./dashboardQuery');
const CF = require('../config/nap-nguon');
const X = require('./napNguonXemXet');

const MA_BCVH = DASHBOARD_BCVH.map((b) => b.ma);
const TRANG_THAI = Object.freeze({
  DA_NAP: 'DA_NAP', NHAP_TAY: 'NHAP_TAY', RONG: 'RONG', LOI: 'LOI', NGUON_CO_FILE_CHUA_NAP: 'NGUON_CO_FILE_CHUA_NAP',
  CHO_FILE: 'CHO_FILE', CHUA_DEN_GIO: 'CHUA_DEN_GIO', NGUON_CHUA_CO_FILE: 'NGUON_CHUA_CO_FILE', MA_KHONG_KHOP: 'MA_KHONG_KHOP',
  CHUA_BAT_DAU: 'CHUA_BAT_DAU' // SANLUONG-5f-1b: ngày trước «ngày bắt đầu» của BCVH (quyết định #88)
});

/** Lỗi có MÃ: THAM_SO_SAI (400), KHONG_TIM_THAY (404). */
class NapNguonLoi extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
const saiThamSo = (m) => new NapNguonLoi('THAM_SO_SAI', m, 400);

// ------------------------------------------
// Ngày giờ
// ------------------------------------------
const p2 = (n) => String(n).padStart(2, '0');
const ngayCuc = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const phutCuc = (d) => d.getHours() * 60 + d.getMinutes();
const phutCua = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const NGAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function ngayHopLe(s) {
  const m = typeof s === 'string' ? NGAY_RE.exec(s) : null;
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const soNgay = (tu, den) => Math.round((Date.parse(`${den}T00:00:00Z`) - Date.parse(`${tu}T00:00:00Z`)) / 86400000) + 1;
const dotCua = (gio) => (String(gio).slice(0, 5) < CF.RANH_GIOI_DOT ? 'S' : 'C');
const isoTuDb = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : (s || null)); // CURRENT_TIMESTAMP của SQLite là UTC
const isoTuMs = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);
const lam = (t, bimat = []) => (t == null || t === '' ? null : S.lamSach(t, bimat, 300));

const GIO_MONG_DOI = () => ({ sang: CF.GIO_MONG_DOI_SANG, chieu: CF.GIO_MONG_DOI_CHIEU, an_han_phut: CF.AN_HAN_PHUT });

// ------------------------------------------
// 1. Tổng quan
// ------------------------------------------
const LA_KHOA_THAY_THE_SQL = '(ghi_chu_loi IS NULL OR ghi_chu_loi NOT LIKE @tienTo)';
const thamKhoa = () => ({ tienTo: `${CF.TIEN_TO_KHOA_THAY_THE}%` });
const cachChay = (trigger) => (trigger === 'TIMER' ? 'TU_DONG' : 'TAY');
/** Người bấm (SANLUONG-5f-2): { ma, ten } hoặc null (hàng cũ / lượt tự động không có). */
const nguoiBam = (r) => (r.nguoi_bam_ma ? { ma: r.nguoi_bam_ma, ten: r.nguoi_bam_ten || null } : null);

/**
 * tuDong: { st: kết quả sftpScheduler.docTrangThaiSftp() | null, soThuMuc: số thư mục nguồn | null } (route tiêm; test tiêm giả).
 * Trả { tu_dong, luot_gan_nhat, dang_chay, gio_mong_doi }. KHÔNG có host / cổng / tài khoản / mật khẩu / vân tay.
 */
function tongQuan({ db, now = new Date(), tuDong = {} }) {
  const st = tuDong.st || null;
  const tt = st ? st.trangThai : 'TAT';
  const trangThai = ['DANG_CHAY', 'CHO', 'TAM_DUNG'].includes(tt) ? tt : 'TAT';
  const lyDo = trangThai === 'TAM_DUNG' ? ({ XAC_THUC: 'XAC_THUC', VAN_TAY_SAI: 'VAN_TAY' }[st.lyDo] || null) : null;
  const luot = st && st.luotGanNhat ? st.luotGanNhat : null;
  const loiLuc = luot && ['CO_LOI', 'LOI_KET_NOI', 'TAM_DUNG', 'LOI_BAT_NGO'].includes(luot.ketQua) ? (luot.luc || null) : null;

  const gan = db.prepare(`SELECT id, started_at, "trigger", loi, loai, nguoi_bam_ma, nguoi_bam_ten FROM sftp_sync_runs WHERE finished_at IS NOT NULL AND ${LA_KHOA_THAY_THE_SQL} ORDER BY id DESC LIMIT 1`).get(thamKhoa());
  const chay = db.prepare(`SELECT id, started_at, "trigger", loai, nguoi_bam_ma, nguoi_bam_ten FROM sftp_sync_runs WHERE finished_at IS NULL AND ${LA_KHOA_THAY_THE_SQL} ORDER BY id DESC`).all(thamKhoa())
    .find((r) => now.getTime() - Date.parse(r.started_at) < S.KHOA_PHUT * 60000);
  return {
    tu_dong: {
      bat: trangThai !== 'TAT', trang_thai: trangThai, ly_do_tam_dung: lyDo, loi_luc: loiLuc,
      chu_ky_phut: st && st.chuKyPhut != null ? st.chuKyPhut : null, so_thu_muc: tuDong.soThuMuc ?? null, luot_ke_tiep_luc: st && st.luotKeTiep ? st.luotKeTiep : null
    },
    luot_gan_nhat: gan ? { id: gan.id, bat_dau: gan.started_at, cach_chay: cachChay(gan.trigger), loai: gan.loai || null, nguoi: nguoiBam(gan), ket_qua: gan.loi > 0 ? 'CO_LOI' : 'THANH_CONG' } : null,
    dang_chay: chay ? { id: chay.id, bat_dau: chay.started_at, cach_chay: cachChay(chay.trigger), loai: chay.loai || null, nguoi: nguoiBam(chay) } : null,
    gio_mong_doi: GIO_MONG_DOI()
  };
}

// ------------------------------------------
// 2. Lưới / 3. Một ô — nạp dữ liệu bằng vài truy vấn tổng hợp rồi tính từng ô trong bộ nhớ
// ------------------------------------------
const khoa = (bcvh, ngay) => `${bcvh}|${ngay}`;

function nap(db, tu, den, dsBcvh, homNay) {
  const m = JSON.stringify(dsBcvh);
  const dbFiles = db.prepare(`SELECT id, unit_code, file_name, file_date, file_time, file_size, row_count, status, error, source, imported_at FROM arrival_import_files
    WHERE unit_code IN (SELECT value FROM json_each(@m)) AND file_date BETWEEN @tu AND @den ORDER BY file_date, file_time, id`).all({ m, tu, den });
  const theoDb = new Map();
  for (const f of dbFiles) { const k = khoa(f.unit_code, f.file_date); if (!theoDb.has(k)) theoDb.set(k, []); theoDb.get(k).push(f); }

  // Nguồn: sftp_source_files (chỉ có dữ liệu khi hẹn giờ đã quét). Cùng tên ở nhiều thư mục -> gộp (còn trên nguồn nếu bất kỳ bản nào còn).
  const nguonHang = db.prepare('SELECT ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, con_tren_nguon FROM sftp_source_files').all();
  const coThongTinNguon = nguonHang.some((r) => r.con_tren_nguon === 1);
  const theoTen = new Map();
  for (const r of nguonHang) {
    const o = theoTen.get(r.ten_file);
    if (!o) theoTen.set(r.ten_file, { ...r });
    else if (r.con_tren_nguon === 1 && o.con_tren_nguon !== 1) theoTen.set(r.ten_file, { ...r });
  }
  const theoNguon = new Map();
  const maLa = new Map(); // tên -> thông tin file đúng mẫu nhưng mã không thuộc 6 BCVH
  for (const r of theoTen.values()) {
    const p = F.phanTichTen(r.ten_file);
    if (!p || !p.ngayHopLe || p.ngay < tu || p.ngay > den) continue;
    const mo = { ten: r.ten_file, kich_thuoc: r.kich_thuoc, mtime: isoTuMs(r.mtime), lan_dau_thay: r.lan_dau_thay, con_tren_nguon: r.con_tren_nguon === 1, gio: p.gio };
    if (dsBcvh.includes(p.maDonVi)) { const k = khoa(p.maDonVi, p.ngay); if (!theoNguon.has(k)) theoNguon.set(k, []); theoNguon.get(k).push(mo); }
    else if (!MA_BCVH.includes(p.maDonVi) && mo.con_tren_nguon) maLa.set(r.ten_file, { ma: p.maDonVi, ngay: p.ngay, gio: p.gio, con_tren_nguon: mo.con_tren_nguon });
  }
  // Mã lạ còn có thể được thấy qua nhật ký lượt (BO_QUA + MA_LA) dù hẹn giờ chưa quét
  for (const r of db.prepare("SELECT DISTINCT ten_file FROM sftp_sync_files WHERE ma_loi = 'MA_LA'").all()) {
    const p = F.phanTichTen(r.ten_file);
    if (p && p.ngayHopLe && p.ngay >= tu && p.ngay <= den && !MA_BCVH.includes(p.maDonVi) && !maLa.has(r.ten_file)) maLa.set(r.ten_file, { ma: p.maDonVi, ngay: p.ngay, gio: p.gio, con_tren_nguon: null });
  }

  // Tổng số dòng theo (BCVH, ngày) của các file đã chấp nhận, kèm 4 tuần trước (để lấy trung vị cùng thứ)
  const tu28 = S.congNgay(tu, -7 * CF.SO_TUAN_MAU);
  const tong = new Map();
  for (const r of db.prepare(`SELECT unit_code, file_date, SUM(row_count) AS n, COUNT(*) AS so_file FROM arrival_import_files
    WHERE status IN ('OK', 'EMPTY') AND unit_code IN (SELECT value FROM json_each(@m)) AND file_date BETWEEN @tu AND @den GROUP BY unit_code, file_date`).all({ m, tu: tu28, den })) {
    tong.set(khoa(r.unit_code, r.file_date), { n: r.n, so_file: r.so_file });
  }

  // «Ngày bắt đầu» của BCVH (SANLUONG-5f-1b, #88) = ngày nhỏ nhất trong MỌI bản ghi arrival_import_files (mọi trạng thái, kể cả nhập tay)
  // và mọi tên file trong sftp_source_files (kể cả đã biến mất). Không có gì -> hôm nay. Một truy vấn gộp + một lượt qua theoTen cho cả danh sách BCVH.
  const ngayBatDau = new Map(dsBcvh.map((ma) => [ma, homNay]));
  const ha = (ma, ngay) => { if (ngay && ngay < ngayBatDau.get(ma)) ngayBatDau.set(ma, ngay); };
  for (const r of db.prepare('SELECT unit_code, MIN(file_date) AS ngay FROM arrival_import_files WHERE unit_code IN (SELECT value FROM json_each(@m)) GROUP BY unit_code').all({ m })) {
    if (ngayBatDau.has(r.unit_code) && ngayHopLe(r.ngay)) ha(r.unit_code, r.ngay);
  }
  for (const tenFile of theoTen.keys()) {
    const p = F.phanTichTen(tenFile);
    if (p && p.ngayHopLe && ngayBatDau.has(p.maDonVi)) ha(p.maDonVi, p.ngay);
  }
  return { theoDb, theoNguon, maLa, coThongTinNguon, tong, ngayBatDau };
}

const trungVi = (a) => { const s = [...a].sort((x, y) => x - y); const g = s.length >> 1; return s.length % 2 ? s[g] : (s[g - 1] + s[g]) / 2; };

/** Nghi ngờ ít / nhiều ở mức (BCVH, ngày). Không xét hôm nay hay tương lai; không có file đã chấp nhận của ngày đó thì không xét. */
function tinhNghiNgo(du, bcvh, ngay, homNay) {
  const own = du.tong.get(khoa(bcvh, ngay));
  const base = { tong_dong: own ? own.n : 0, so_file_db: own ? own.so_file : 0, trung_vi: null, so_mau: 0, nghi_ngo: null };
  if (ngay >= homNay || !own) return base;
  const mau = [];
  for (let k = 1; k <= CF.SO_TUAN_MAU; k++) { const t = du.tong.get(khoa(bcvh, S.congNgay(ngay, -7 * k))); if (t) mau.push(t.n); }
  base.so_mau = mau.length;
  if (mau.length < CF.TOI_THIEU_NGAY_MAU) return { ...base, nghi_ngo: 'CHUA_DU_MAU' };
  const tv = trungVi(mau);
  base.trung_vi = tv;
  if (tv > 0 && own.n < CF.NGUONG_IT * tv) base.nghi_ngo = 'IT';
  else if (tv > 0 && own.n > CF.NGUONG_NHIEU * tv) base.nghi_ngo = 'NHIEU';
  return base;
}

function tinhO(du, bcvh, ngay, dot, now, bimat) {
  if (ngay < du.ngayBatDau.get(bcvh)) {
    return { bcvh, ngay, dot, trang_thai: TRANG_THAI.CHUA_BAT_DAU, ly_do: null, nghi_ngo: null, nguon_co_file: du.coThongTinNguon ? false : null, chi_tiet: { file_db: [], file_nguon: [] } };
  }
  const fDb = du.theoDb.get(khoa(bcvh, ngay)) || [];
  const fNguon = (du.theoNguon.get(khoa(bcvh, ngay)) || []).filter((s) => dotCua(s.gio) === dot);
  const sftpDot = fDb.filter((f) => f.source === 'SFTP' && dotCua(f.file_time) === dot);
  const tay = fDb.filter((f) => f.source === 'MANUAL');
  const tayNhan = tay.filter((f) => f.status === 'OK' || f.status === 'EMPTY');
  const nguonCon = fNguon.filter((s) => s.con_tren_nguon);
  let trangThai;
  let lyDo = null;
  if (sftpDot.some((f) => f.status === 'OK')) trangThai = TRANG_THAI.DA_NAP;
  else if (sftpDot.some((f) => f.status === 'EMPTY')) { trangThai = TRANG_THAI.RONG; lyDo = 'EMPTY'; }
  else if (sftpDot.length) { trangThai = TRANG_THAI.LOI; lyDo = sftpDot[sftpDot.length - 1].status; }
  else if (nguonCon.length) { trangThai = TRANG_THAI.NGUON_CO_FILE_CHUA_NAP; lyDo = tayNhan.length ? 'NHAP_TAY_CO_SAN' : 'CHUA_NAP'; }
  else if (tayNhan.length) trangThai = TRANG_THAI.NHAP_TAY;
  else {
    const hom = ngayCuc(now);
    if (ngay > hom) { trangThai = TRANG_THAI.CHUA_DEN_GIO; lyDo = 'NGAY_TUONG_LAI'; }
    else if (ngay === hom) {
      const denHan = phutCua(dot === 'S' ? CF.GIO_MONG_DOI_SANG : CF.GIO_MONG_DOI_CHIEU) + CF.AN_HAN_PHUT;
      if (phutCuc(now) < denHan) trangThai = TRANG_THAI.CHUA_DEN_GIO;
      else { trangThai = TRANG_THAI.CHO_FILE; lyDo = 'QUA_GIO_MONG_DOI'; }
    } else { trangThai = TRANG_THAI.NGUON_CHUA_CO_FILE; lyDo = 'KHONG_THAY_TREN_NGUON'; }
  }
  const lienQuan = [...sftpDot, ...tay];
  const nghi = tinhNghiNgo(du, bcvh, ngay, ngayCuc(now));
  return {
    bcvh, ngay, dot, trang_thai: trangThai, ly_do: lyDo, nghi_ngo: nghi.nghi_ngo,
    nguon_co_file: du.coThongTinNguon ? (du.theoNguon.get(khoa(bcvh, ngay)) || []).some((s) => s.con_tren_nguon) : null,
    chi_tiet: {
      file_db: lienQuan.map((f) => ({ ten: f.file_name, nguon: f.source, trang_thai: f.status, so_dong: f.row_count, nap_luc: isoTuDb(f.imported_at), loi: lam(f.error, bimat) })),
      file_nguon: fNguon.map((s) => ({ ten: s.ten, kich_thuoc: s.kich_thuoc, mtime: s.mtime, lan_dau_thay: s.lan_dau_thay, con_tren_nguon: s.con_tren_nguon }))
    }
  };
}

function kiemTraBcvh(bcvh) {
  if (bcvh === undefined || bcvh === null || bcvh === '') return null;
  if (typeof bcvh !== 'string' || !MA_BCVH.includes(bcvh)) throw saiThamSo(`Tham số "bcvh" phải là một trong: ${MA_BCVH.join(', ')}`);
  return bcvh;
}

/** Danh sách ngày từ `den` về `tu` (mới nhất trước). */
const dsNgay = (tu, den) => { const r = []; for (let d = den; d >= tu; d = S.congNgay(d, -1)) r.push(d); return r; };

const THU_TU_LOAI = { DOT: 0, NGAY: 1, MA_LA: 2 };
const CAN_XU_LY = new Set([TRANG_THAI.LOI, TRANG_THAI.RONG, TRANG_THAI.NGUON_CO_FILE_CHUA_NAP, TRANG_THAI.CHO_FILE, TRANG_THAI.NGUON_CHUA_CO_FILE]);

/**
 * Lưới ngày × BCVH × đợt (S, C). Tối đa SO_NGAY_TOI_DA ngày. Trả
 * { tu, den, bcvh, hom_nay, ds_bcvh, gio_mong_doi, ngay_bat_dau: { <mã BCVH>: 'YYYY-MM-DD' }, o: [ô] (ngày mới nhất trước, rồi theo thứ tự BCVH, S trước C), ngay_bcvh: [{bcvh, ngay, tong_dong, so_file_db, trung_vi, so_mau, nghi_ngo, nguon_co_file}],
 *   can_xu_ly: [mục phẳng, mới nhất trước; KHÔNG gồm mục đã xem xét còn hiệu lực], da_xem_xet: [...] (5f-1c), tong_hop: { theo_trang_thai, nghi_ngo, da_xem_xet } }.
 */
function luoi({ db, now = new Date(), tu, den, bcvh = null, bimat = [] }) {
  if (!ngayHopLe(tu) || !ngayHopLe(den)) throw saiThamSo('Tham số "tu" và "den" phải là ngày hợp lệ dạng YYYY-MM-DD');
  if (tu > den) throw saiThamSo('"tu" không được sau "den"');
  if (soNgay(tu, den) > CF.SO_NGAY_TOI_DA) throw saiThamSo(`Khoảng ngày tối đa ${CF.SO_NGAY_TOI_DA} ngày`);
  const loc = kiemTraBcvh(bcvh);
  const ds = loc ? [loc] : MA_BCVH;
  const ten = bcvhNames(db);
  const homNay = ngayCuc(now);
  const du = nap(db, tu, den, ds, homNay);
  const o = [];
  const ngayBcvh = [];
  const theoTrangThai = Object.fromEntries(Object.values(TRANG_THAI).map((k) => [k, 0]));
  const nghiNgoDem = { IT: 0, NHIEU: 0, CHUA_DU_MAU: 0 };
  const canXuLy = [];
  for (const ngay of dsNgay(tu, den)) {
    for (const ma of ds) {
      const nghi = tinhNghiNgo(du, ma, ngay, homNay);
      const nc = du.coThongTinNguon ? (du.theoNguon.get(khoa(ma, ngay)) || []).some((s) => s.con_tren_nguon) : null;
      ngayBcvh.push({ bcvh: ma, ngay, tong_dong: nghi.tong_dong, so_file_db: nghi.so_file_db, trung_vi: nghi.trung_vi, so_mau: nghi.so_mau, nghi_ngo: nghi.nghi_ngo, nguon_co_file: nc });
      if (nghi.nghi_ngo) {
        nghiNgoDem[nghi.nghi_ngo]++;
        if (nghi.nghi_ngo !== 'CHUA_DU_MAU') canXuLy.push({ loai: 'NGAY', bcvh: ma, ngay, dot: null, trang_thai: null, ly_do: `NGHI_NGO_${nghi.nghi_ngo}`, nghi_ngo: nghi.nghi_ngo, nguon_co_file: nc, dau_van_tay: X.dauVanTayNgay(nghi) });
      }
      for (const dot of ['S', 'C']) {
        const c = tinhO(du, ma, ngay, dot, now, bimat);
        o.push(c);
        theoTrangThai[c.trang_thai]++;
        if (CAN_XU_LY.has(c.trang_thai)) canXuLy.push({ loai: 'DOT', bcvh: ma, ngay, dot, trang_thai: c.trang_thai, ly_do: c.ly_do, nghi_ngo: c.nghi_ngo, nguon_co_file: c.nguon_co_file, dau_van_tay: X.dauVanTayDot(c) });
      }
    }
  }
  if (!loc) {
    for (const [tenFile, m] of du.maLa) {
      theoTrangThai.MA_KHONG_KHOP++;
      canXuLy.push({ loai: 'MA_LA', bcvh: null, ngay: m.ngay, dot: dotCua(m.gio), trang_thai: TRANG_THAI.MA_KHONG_KHOP, ly_do: 'MA_LA', ma_la: F.tenAnToan(m.ma, 12), ten_file: F.tenAnToan(tenFile, 60), nghi_ngo: null, nguon_co_file: m.con_tren_nguon });
    }
  }
  // SANLUONG-5f-1c: tách mục «đã xem xét» còn hiệu lực (dấu vân tay khớp) khỏi can_xu_ly. o[] / theo_trang_thai / nghi_ngo KHÔNG đổi.
  const { conLai, daXemXet } = X.loc(db, tu, den, ds, canXuLy);
  const idx = (m) => (m ? MA_BCVH.indexOf(m) : 99);
  conLai.sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : THU_TU_LOAI[a.loai] - THU_TU_LOAI[b.loai] || idx(a.bcvh) - idx(b.bcvh) || (a.dot === b.dot ? 0 : a.dot === 'C' ? -1 : 1)));
  return {
    tu, den, bcvh: loc, hom_nay: homNay, ds_bcvh: ds.map((ma) => ({ ma, ten: ten.get(ma) })), gio_mong_doi: GIO_MONG_DOI(),
    ngay_bat_dau: Object.fromEntries(ds.map((ma) => [ma, du.ngayBatDau.get(ma)])),
    o, ngay_bcvh: ngayBcvh, can_xu_ly: conLai, da_xem_xet: daXemXet, tong_hop: { theo_trang_thai: theoTrangThai, nghi_ngo: nghiNgoDem, da_xem_xet: daXemXet.length }
  };
}

/**
 * SANLUONG-5f-1c: tình trạng HIỆN TẠI của một mục (DOT: ô; NGAY: cả ngày) để đánh dấu «đã xem xét». Đã kiểm tham số ở X.danhDau.
 * Trả { can_xu_ly, trang_thai, ly_do, nghi_ngo, dau } (dau = dấu vân tay hiện tại).
 */
function dauVanTayMuc({ db, now = new Date(), loai, bcvh, ngay, dot }) {
  const du = nap(db, ngay, ngay, [bcvh], ngayCuc(now));
  const nghi = tinhNghiNgo(du, bcvh, ngay, ngayCuc(now));
  if (loai === 'NGAY') {
    const can = nghi.nghi_ngo === 'IT' || nghi.nghi_ngo === 'NHIEU';
    return { can_xu_ly: can, trang_thai: null, ly_do: can ? `NGHI_NGO_${nghi.nghi_ngo}` : null, nghi_ngo: nghi.nghi_ngo, dau: X.dauVanTayNgay(nghi) };
  }
  const c = tinhO(du, bcvh, ngay, dot, now, []);
  return { can_xu_ly: CAN_XU_LY.has(c.trang_thai), trang_thai: c.trang_thai, ly_do: c.ly_do, nghi_ngo: c.nghi_ngo, dau: X.dauVanTayDot(c) };
}

/** Khung chi tiết một ô (bcvh, ngày, đợt S|C): trạng thái + file mong đợi + file trong DB / trên nguồn + lần thử gần nhất + lịch sử (tối đa LICH_SU_TOI_DA). */
function mot({ db, now = new Date(), bcvh, ngay, dot, bimat = [] }) {
  if (kiemTraBcvh(bcvh) === null) throw saiThamSo(`Tham số "bcvh" là bắt buộc, một trong: ${MA_BCVH.join(', ')}`);
  if (!ngayHopLe(ngay)) throw saiThamSo('Tham số "ngay" phải là ngày hợp lệ dạng YYYY-MM-DD');
  if (dot !== 'S' && dot !== 'C') throw saiThamSo('Tham số "dot" phải là S hoặc C');
  const du = nap(db, ngay, ngay, [bcvh], ngayCuc(now));
  const c = tinhO(du, bcvh, ngay, dot, now, bimat);
  const nghi = tinhNghiNgo(du, bcvh, ngay, ngayCuc(now));
  const mau = `${bcvh}_${ngay.replace(/-/g, '')}`;
  const lichSu = db.prepare(`SELECT f.id, f.run_id, f.ten_file, f.ket_qua, f.so_dong, f.thoi_gian_ms, f.ma_loi, f.chi_tiet, r.started_at, r."trigger"
    FROM sftp_sync_files f JOIN sftp_sync_runs r ON r.id = f.run_id WHERE f.ten_file LIKE @p ORDER BY f.id DESC LIMIT 200`).all({ p: `HangDen_${mau}_%` })
    .filter((r) => { const p = F.phanTichTen(r.ten_file); return p && p.maDonVi === bcvh && p.ngay === ngay && dotCua(p.gio) === dot; })
    .slice(0, CF.LICH_SU_TOI_DA)
    .map((r) => ({ lan_id: r.id, luot_id: r.run_id, luc: r.started_at, cach_chay: cachChay(r.trigger), ten: r.ten_file, ket_qua: r.ket_qua, so_dong: r.so_dong, thoi_gian_ms: r.thoi_gian_ms, ma_loi: r.ma_loi, chi_tiet: lam(r.chi_tiet, bimat) }));
  const daNap = c.chi_tiet.file_db.find((f) => f.nguon === 'SFTP' && f.trang_thai === 'OK') || null;
  const ganNhat = lichSu[0] || null;
  const fileLoi = c.chi_tiet.file_db.find((f) => f.loi);
  return {
    bcvh, ten_bcvh: bcvhNames(db).get(bcvh), ngay, dot, trang_thai: c.trang_thai, ly_do: c.ly_do, nghi_ngo: nghi.nghi_ngo, nguon_co_file: c.nguon_co_file,
    tong_ngay: { tong_dong: nghi.tong_dong, so_file_db: nghi.so_file_db, trung_vi: nghi.trung_vi, so_mau: nghi.so_mau },
    file_mong_doi: { mau_ten: `HangDen_${mau}_<hhmmss>.csv`, gio_mong_doi: dot === 'S' ? CF.GIO_MONG_DOI_SANG : CF.GIO_MONG_DOI_CHIEU, an_han_phut: CF.AN_HAN_PHUT },
    file_db: c.chi_tiet.file_db, file_nguon: c.chi_tiet.file_nguon,
    thong_tin_nap: daNap ? { ten: daNap.ten, nap_luc: daNap.nap_luc, so_dong: daNap.so_dong, thoi_gian_nap_ms: (db.prepare("SELECT thoi_gian_ms FROM sftp_sync_files WHERE ten_file = ? AND ket_qua = 'DA_NAP' ORDER BY id DESC LIMIT 1").get(daNap.ten) || {}).thoi_gian_ms ?? null } : null,
    lan_thu_gan_nhat: ganNhat,
    loi: ganNhat && (ganNhat.ma_loi || ganNhat.ket_qua === 'LOI') ? { ma: ganNhat.ma_loi, chi_tiet: ganNhat.chi_tiet } : (fileLoi ? { ma: c.ly_do, chi_tiet: fileLoi.loi } : null),
    lich_su: lichSu
  };
}

// ------------------------------------------
// 4. Lượt lấy
// ------------------------------------------
const hinhLuot = (r, now, bimat) => ({
  id: r.id, bat_dau: r.started_at, ket_thuc: r.finished_at, cach_chay: cachChay(r.trigger), loai: r.loai || null, so_o_yeu_cau: r.so_o_yeu_cau ?? null, liet_ke: r.tong_liet_ke, da_nap: r.da_nap, da_co: r.da_co, chua_on_dinh: r.chua_on_dinh,
  rong: r.rong, bo_qua_khac: r.bo_qua_khac, loi: r.loi,
  ket_qua: r.finished_at == null ? (now.getTime() - Date.parse(r.started_at) < S.KHOA_PHUT * 60000 ? 'DANG_CHAY' : 'TREO') : (r.loi > 0 ? 'CO_LOI' : 'THANH_CONG'),
  nguoi: nguoiBam(r), // SANLUONG-5f-2: { ma, ten } của người bấm «Lấy ngay» / «Lấy lại»; null với lượt tự động và hàng cũ
  ghi_chu_loi: lam(r.ghi_chu_loi, bimat)
});
const COT_LUOT = 'id, started_at, finished_at, "trigger", tong_liet_ke, da_nap, da_co, chua_on_dinh, rong, bo_qua_khac, loi, ghi_chu_loi, loai, nguoi_bam_ma, nguoi_bam_ten, so_o_yeu_cau';

function dsLuot({ db, now = new Date(), trang, kichThuoc, bimat = [] }) {
  const so = (v, mac, lo, hi, ten) => {
    if (v === undefined || v === null || v === '') return mac;
    if (!/^\d+$/.test(String(v)) || Number(v) < lo || Number(v) > hi) throw saiThamSo(`Tham số "${ten}" phải là số nguyên từ ${lo} đến ${hi}`);
    return Number(v);
  };
  const t = so(trang, 1, 1, 1000000, 'trang');
  const k = so(kichThuoc, CF.KICH_THUOC_LUOT_MAC_DINH, 1, CF.KICH_THUOC_LUOT_TOI_DA, 'kich_thuoc');
  const tong = db.prepare(`SELECT COUNT(*) AS n FROM sftp_sync_runs WHERE ${LA_KHOA_THAY_THE_SQL}`).get(thamKhoa()).n;
  const rows = db.prepare(`SELECT ${COT_LUOT} FROM sftp_sync_runs WHERE ${LA_KHOA_THAY_THE_SQL} ORDER BY id DESC LIMIT @k OFFSET @o`).all({ ...thamKhoa(), k, o: (t - 1) * k });
  return { trang: t, kich_thuoc: k, tong, so_trang: Math.max(1, Math.ceil(tong / k)), luot: rows.map((r) => hinhLuot(r, now, bimat)) };
}

function chiTietLuot({ db, now = new Date(), id, bimat = [] }) {
  if (!/^\d+$/.test(String(id)) || Number(id) < 1 || Number(id) > Number.MAX_SAFE_INTEGER) throw saiThamSo('Mã lượt phải là số nguyên dương');
  const r = db.prepare(`SELECT ${COT_LUOT} FROM sftp_sync_runs WHERE id = @id AND ${LA_KHOA_THAY_THE_SQL}`).get({ ...thamKhoa(), id: Number(id) });
  if (!r) throw new NapNguonLoi('KHONG_TIM_THAY', 'Không có lượt này', 404);
  const files = db.prepare('SELECT id, ten_file, ket_qua, so_dong, thoi_gian_ms, ma_loi, chi_tiet FROM sftp_sync_files WHERE run_id = ? ORDER BY id').all(r.id);
  return {
    ...hinhLuot(r, now, bimat),
    files: files.map((f) => ({ id: f.id, ten: F.tenAnToan(f.ten_file, 120), ket_qua: f.ket_qua, so_dong: f.so_dong, thoi_gian_ms: f.thoi_gian_ms, ma_loi: f.ma_loi, chi_tiet: lam(f.chi_tiet, bimat) }))
  };
}

module.exports = { NapNguonLoi, TRANG_THAI, MA_BCVH, tongQuan, luoi, mot, dsLuot, chiTietLuot, dotCua, ngayHopLe, dauVanTayMuc };
