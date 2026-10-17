#!/usr/bin/env node
// ==========================================
// SANLUONG-5j — Xóa dữ liệu hàng đến ĐÃ NẠP của một số BCVH trong một khoảng NGÀY TRONG TÊN FILE (file_date), để xuất lại từ nguồn rồi nạp bằng
// scripts/import-arrivals.js. Hướng dẫn: docs/ai/31_SANLUONG5J_XOA_DU_LIEU_BCVH_KHOANG_NGAY.md.
//
//   node scripts/xoa-du-lieu-bcvh.js --bcvh 535470,536250 --tu 2026-10-01 --den 2026-10-14 [--db <đường dẫn>]
//        CHẠY KHÔ (mặc định): DB mở CHỈ-ĐỌC; in theo BCVH × file_date số file / dòng / SHBG / ngày đến; báo dòng có ngày đến trong khoảng nằm ở file NGOÀI khoảng.
//   node scripts/xoa-du-lieu-bcvh.js --bcvh … --tu 2026-10-01 --den 2026-10-14 --chay-that --xac-nhan "XOA 2026-10-01..2026-10-14" [--db …]
//        CHẠY THẬT: khoá chung với đồng bộ SFTP / «Thay thế» → sao lưu toàn DB (giữ 5 bản) → MỘT giao dịch: chép thùng rác 30 ngày → xóa dòng → xóa bản ghi file.
//
// TÁI SỬ DỤNG lõi «Thay thế ngày» (#83, server/lib/thayTheThucHien.js): khoá giuKhoaChung, saoLuu, donThungRac, bảng thay_the_nhat_ky / thung_rac_file / thung_rac_dong.
// Mỗi cặp (BCVH, file_date) bị xóa = MỘT dòng thay_the_nhat_ky (tap_file_moi rỗng) = MỘT mẻ thùng rác → khôi phục được bằng «Khôi phục» của 5g-5 (#87).
// Chặn cứng: 533140 (Thuận Hóa) KHÔNG BAO GIỜ bị xóa bằng lệnh này; chỉ nhận mã trong 6 BCVH chuẩn; khoảng tối đa 31 ngày.
// KHÔNG xóa trạng thái phát (phat_status_current / phat_status_history / phat_batches). KHÔNG mạng, KHÔNG đọc .env / SFTP.
// DB: --db, hoặc biến môi trường ARRIVALS_DB, mặc định data/hue-dhcl.db (như import-arrivals.js). Sao lưu: <thư mục chứa DB>/backups/.
// Mã thoát: 0 xong · 1 lỗi khác (giao dịch đã hoàn tác) · 2 DB · 7 đang có lượt đồng bộ / thay thế khác · 8 tham số / xác nhận sai · 11 sao lưu lỗi.
// KHÔNG in SHBG / nội dung dòng (chỉ số lượng).
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const TT = require('../server/lib/thayTheThucHien');
const X = require('../server/lib/thayTheXemTruoc');
const S = require('../server/lib/sftpSync');
const CF = require('../server/config/thay-the');
const { ensureArrivalSchema } = require('../server/lib/arrivalsImport');
const { DASHBOARD_BCVH } = require('../server/lib/dashboardQuery');

const BCVH_CAM = '533140'; // Thuận Hóa — PO: không xóa bằng lệnh này
const SO_NGAY_TOI_DA = 31;
const TIEN_TO_SAO_LUU = 'truoc-xoa-bcvh';
const TEN_SAO_LUU_RE = /^truoc-xoa-bcvh_[\d-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_(\d{8}T\d{6}Z)(?:_(\d+))?\.db$/;
const MA_THOAT = Object.freeze({ OK: 0, KHAC: 1, DB: 2, DANG_CO_LUOT: 7, THAM_SO: 8, SAO_LUU: 11 });
const TEN_BCVH = new Map(DASHBOARD_BCVH.map((b) => [b.ma, b.ten]));
const NGAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const USAGE = `Cách dùng:
  node scripts/xoa-du-lieu-bcvh.js --bcvh <mã>,<mã> --tu <yyyy-mm-dd> --den <yyyy-mm-dd> [--db <DB>]                              (chạy khô — mặc định)
  node scripts/xoa-du-lieu-bcvh.js --bcvh … --tu … --den … --chay-that --xac-nhan "XOA <tu>..<den>" [--db <DB>]                   (xóa thật)`;

class XoaLoi extends Error {
  constructor(maThoat, message) { super(message); this.maThoat = maThoat; }
}
const thamSoSai = (msg) => new XoaLoi(MA_THOAT.THAM_SO, msg);

function ngayHopLe(s) {
  const m = typeof s === 'string' ? NGAY_RE.exec(s) : null;
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const soNgay = (tu, den) => Math.round((Date.parse(`${den}T00:00:00Z`) - Date.parse(`${tu}T00:00:00Z`)) / 86400000) + 1;

/** Đọc + kiểm tham số. Nhận cả «--x giá-trị» và «--x=giá-trị». Ném XoaLoi(THAM_SO). */
function docThamSo(argv) {
  const out = { bcvh: null, tu: null, den: null, chayThat: false, xacNhan: null, db: null };
  const coGiaTri = { '--bcvh': 'bcvh', '--tu': 'tu', '--den': 'den', '--xac-nhan': 'xacNhan', '--db': 'db' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^(--[a-z-]+)=(.*)$/s.exec(a);
    if (a === '--chay-that') out.chayThat = true;
    else if (m && coGiaTri[m[1]]) out[coGiaTri[m[1]]] = m[2];
    else if (coGiaTri[a]) {
      if (i + 1 >= argv.length) throw thamSoSai(`Thiếu giá trị cho ${a}`);
      out[coGiaTri[a]] = argv[++i];
    } else throw thamSoSai(`Tuỳ chọn không hỗ trợ: ${String(a).slice(0, 40)}`);
  }
  if (out.bcvh === null) throw thamSoSai('Thiếu --bcvh');
  const ma = [...new Set(String(out.bcvh).split(',').map((x) => x.trim()).filter(Boolean))];
  if (!ma.length) throw thamSoSai('--bcvh rỗng');
  // 533140 bị chặn TRƯỚC mọi kiểm khác: chuỗi --bcvh chứa 533140 ở BẤT KỲ đâu (khoảng trắng, lặp lại, dính ký tự lạ, đi cùng mã sai) đều bị từ chối
  if (String(out.bcvh).includes(BCVH_CAM)) {
    throw thamSoSai(`BCVH ${BCVH_CAM} (Thuận Hóa) KHÔNG được xóa bằng lệnh này. Bỏ mã ${BCVH_CAM} khỏi --bcvh.`);
  }
  const hopLe = DASHBOARD_BCVH.map((b) => b.ma).filter((x) => x !== BCVH_CAM);
  const la = ma.filter((x) => !hopLe.includes(x));
  if (la.length) throw thamSoSai(`Mã BCVH không hợp lệ: ${la.map((x) => x.slice(0, 12)).join(', ')}. Chỉ nhận: ${hopLe.join(', ')}`);
  out.bcvh = hopLe.filter((x) => ma.includes(x)); // thứ tự chuẩn của danh mục
  if (!ngayHopLe(out.tu)) throw thamSoSai('--tu phải là ngày hợp lệ dạng YYYY-MM-DD');
  if (!ngayHopLe(out.den)) throw thamSoSai('--den phải là ngày hợp lệ dạng YYYY-MM-DD');
  if (out.tu > out.den) throw thamSoSai('--tu phải nhỏ hơn hoặc bằng --den');
  if (soNgay(out.tu, out.den) > SO_NGAY_TOI_DA) throw thamSoSai(`Khoảng ngày dài ${soNgay(out.tu, out.den)} ngày, vượt tối đa ${SO_NGAY_TOI_DA} ngày`);
  if (out.chayThat && out.xacNhan !== chuoiXacNhan(out.tu, out.den)) {
    throw thamSoSai(`Xóa thật cần đúng --xac-nhan "${chuoiXacNhan(out.tu, out.den)}". CHƯA xóa gì.`);
  }
  return out;
}
const chuoiXacNhan = (tu, den) => `XOA ${tu}..${den}`;

function duongDanDb(tham) {
  return path.resolve(tham.db || process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
}

function moDb(dbPath, chayThat) {
  if (!fs.existsSync(dbPath)) throw new XoaLoi(MA_THOAT.DB, `Không tìm thấy DB ${path.basename(dbPath)}. Dùng --db hoặc ARRIVALS_DB`);
  const db = new Database(dbPath, chayThat ? { fileMustExist: true } : { readonly: true, fileMustExist: true });
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'arrival_import_files'").get()) { db.close(); throw new XoaLoi(MA_THOAT.DB, 'DB chưa có bảng arrival_import_files'); }
  if (chayThat) {
    db.pragma('busy_timeout = 30000'); // chờ tối đa 30 giây nếu máy chủ app đang ghi
    ensureArrivalSchema(db);
    S.ensureSftpSyncSchema(db);
    TT.ensureThayTheSchema(db);
  }
  return db;
}

// ------------------------------------------
// Khảo sát (CHỈ ĐỌC) — dùng cho cả chạy khô lẫn chạy thật (tính lại trong khoá và trong giao dịch)
// ------------------------------------------
/**
 * Trả { tu, den, bcvh: [{ ma, ten, cap: [{ ngay, cu (X.docPhiaDb), ngay_den_min, ngay_den_max, dong_ngay_den_rong, shbg_mat_that }], so_file, so_dong, so_shbg,
 *   shbg_mat_that, phat (X.docPhiaPhat) }], ngoai_khoang: [{ bcvh, file_date, so_dong, so_shbg }], tong: { so_file, so_dong, so_shbg } }.
 */
function khaoSat(db, { bcvh, tu, den }) {
  const ngayCuaBcvh = db.prepare('SELECT DISTINCT file_date FROM arrival_import_files WHERE unit_code = @b AND file_date BETWEEN @tu AND @den ORDER BY file_date').pluck();
  const ketQua = [];
  for (const ma of bcvh) {
    const cap = [];
    const tatCaShbg = new Set();
    const ids = [];
    for (const ngay of ngayCuaBcvh.all({ b: ma, tu, den })) {
      const cu = X.docPhiaDb(db, ma, ngay);
      const ngayDen = [...cu.theoNgay.keys()].filter((k) => k !== null).sort();
      cap.push({ ngay, cu, ngay_den_min: ngayDen[0] || null, ngay_den_max: ngayDen[ngayDen.length - 1] || null, dong_ngay_den_rong: cu.dongNgayRong });
      for (const s of cu.shbg) tatCaShbg.add(s);
      for (const f of cu.files) ids.push(f.id);
    }
    // «Mất thật» = SHBG không còn dòng nào ở file NGOÀI tập xóa của cùng BCVH (lõi X.tinhMatThat của «Thay thế»)
    const mat = new Set(X.tinhMatThat(db, ma, { ids: JSON.stringify(ids) }, [...tatCaShbg].sort()));
    const conSau = new Set([...tatCaShbg].filter((s) => !mat.has(s)));
    for (const c of cap) c.shbg_mat_that = [...c.cu.shbg].filter((s) => mat.has(s)).length;
    ketQua.push({
      ma, ten: TEN_BCVH.get(ma) || ma, cap,
      so_file: cap.reduce((a, c) => a + c.cu.files.length, 0), so_dong: cap.reduce((a, c) => a + c.cu.tongDong, 0), so_shbg: tatCaShbg.size,
      shbg_mat_that: mat.size,
      phat: X.docPhiaPhat(db, ma, tatCaShbg, conSau) // { so_shbg_co_trang_thai, con_o_ban_moi (còn dòng hàng đến ở file khác), khong_con (mồ côi) }
    });
  }
  const ngoaiKhoang = db.prepare(`SELECT f.unit_code AS bcvh, f.file_date, COUNT(*) AS so_dong, COUNT(DISTINCT UPPER(TRIM(i.tracking_no))) AS so_shbg
    FROM arrival_items i JOIN arrival_import_files f ON f.id = i.import_file_id
    WHERE f.unit_code IN (SELECT value FROM json_each(@b)) AND (f.file_date < @tu OR f.file_date > @den) AND i.arrival_date BETWEEN @tu AND @den
    GROUP BY f.unit_code, f.file_date ORDER BY f.unit_code, f.file_date`).all({ b: JSON.stringify(bcvh), tu, den });
  const cong = (k) => ketQua.reduce((a, b) => a + b[k], 0);
  return { tu, den, bcvh: ketQua, ngoai_khoang: ngoaiKhoang, tong: { so_file: cong('so_file'), so_dong: cong('so_dong'), so_shbg: cong('so_shbg') } };
}

// ------------------------------------------
// Sao lưu: dùng TT.saoLuu (db.backup, kiểm chỗ trống) với tiền tố riêng; giữ SO_BAN_SAO_LUU_GIU bản gần nhất CỦA LỆNH NÀY
// (bộ đếm của «Thay thế» / «Khôi phục» chỉ nhận tên truoc-thay-the / truoc-khoi-phuc nên không đụng tới các bản này).
// ------------------------------------------
function donSaoLuuXoa(thuMuc, giu = CF.SO_BAN_SAO_LUU_GIU) {
  let ten;
  try { ten = fs.readdirSync(thuMuc); } catch (e) { return 0; }
  const ds = ten.map((t) => ({ t, m: TEN_SAO_LUU_RE.exec(t) })).filter((x) => x.m)
    .map((x) => ({ ten: x.t, khoa: `${x.m[1]}_${String(x.m[2] || 1).padStart(6, '0')}` }))
    .sort((a, b) => (a.khoa < b.khoa ? 1 : a.khoa > b.khoa ? -1 : 0));
  let da = 0;
  for (const b of ds.slice(giu)) { try { fs.rmSync(path.join(thuMuc, b.ten), { force: true }); da++; } catch (e) { /* bỏ qua */ } }
  return da;
}

// ------------------------------------------
// Xóa thật
// ------------------------------------------
/**
 * xoaThat({ db, bcvh, tu, den, xacNhan, nguoiThucHien, sauLuuDir, now, options: { sauKhiXoa } })
 * Thứ tự: kiểm xác nhận → khoá chung (TT.giuKhoaChung) → khảo sát → (không có gì: dừng, không sao lưu) → sao lưu → MỘT giao dịch → dọn → nhả khoá.
 * Ném XoaLoi (maThoat) — giao dịch lỗi thì DB y nguyên.
 */
async function xoaThat({ db, bcvh, tu, den, xacNhan, nguoiThucHien = null, sauLuuDir = null, now = () => new Date(), options = {} }) {
  if (xacNhan !== chuoiXacNhan(tu, den)) throw thamSoSai(`Xóa thật cần đúng --xac-nhan "${chuoiXacNhan(tu, den)}". CHƯA xóa gì.`);
  const batDau = now();
  let nha;
  try {
    nha = TT.giuKhoaChung(db, batDau, { dangDongBo: () => false }, now); // hẹn giờ trong máy chủ app thấy hàng khoá ở sftp_sync_runs và bỏ lượt
  } catch (err) {
    throw new XoaLoi(MA_THOAT.DANG_CO_LUOT, err.message);
  }
  try {
    const ks = khaoSat(db, { bcvh, tu, den });
    if (!ks.tong.so_file) return { ...ks, da_xoa: false, so_dong_xoa: 0, so_file_xoa: 0, nhat_ky: [], sao_luu: null };

    const thuMucSaoLuu = sauLuuDir || path.join(path.dirname(path.resolve(db.name)), 'backups');
    let sl;
    try {
      sl = await TT.saoLuu(db, thuMucSaoLuu, bcvh.join('-'), `${tu}_${den}`, batDau, { tienToSaoLuu: TIEN_TO_SAO_LUU });
    } catch (err) {
      throw new XoaLoi(MA_THOAT.SAO_LUU, `${err.message}`);
    }

    const luc = now();
    const hetHan = new Date(luc.getTime() + CF.SO_NGAY_GIU_THUNG_RAC * 86400000).toISOString();
    const cotF = TT.COT_FILE.join(', ');
    const cotD = TT.COT_DONG.join(', ');
    const nguoi = String(nguoiThucHien || 'script:xoa-du-lieu-bcvh').slice(0, 80);
    const nhatKy = [];
    let soDongXoa = 0;
    let soFileXoa = 0;
    const thucHien = db.transaction(() => {
      const lai = khaoSat(db, { bcvh, tu, den }); // tính lại trong giao dịch: có ai nạp / xóa giữa chừng thì dừng
      const dauVet = (k) => JSON.stringify(k.bcvh.map((b) => b.cap.map((c) => [c.ngay, c.cu.ids, c.cu.tongDong])));
      if (dauVet(lai) !== dauVet(ks)) throw new XoaLoi(MA_THOAT.KHAC, 'Dữ liệu đã đổi trong lúc chuẩn bị (có người nạp / xóa). Đã hoàn tác, CHƯA xóa gì — chạy lại.');
      const ghiNhatKy = db.prepare(`INSERT INTO thay_the_nhat_ky (thoi_diem_utc, nguoi_thuc_hien, bcvh, ngay, tap_file_cu, tap_file_moi, so_file_cu, so_dong_cu, shbg_cu,
        shbg_mat_that, shbg_mat_can_tren, muc_canh_bao, dong_y_mat, duong_dan_sao_luu, ket_qua, thung_rac_het_han_luc)
        VALUES (@luc, @nguoi, @b, @d, @cu, '[]', @sfc, @sdc, @shc, @mt, @shc, @muc, 1, @sl, 'THANH_CONG', @het)`);
      const chepFile = db.prepare(`INSERT INTO thung_rac_file (thung_rac_id, ${cotF}) SELECT @t, ${cotF} FROM arrival_import_files WHERE id IN (SELECT value FROM json_each(@ids)) ORDER BY id`);
      const chepDong = db.prepare(`INSERT INTO thung_rac_dong (thung_rac_id, ${cotD}) SELECT @t, ${cotD} FROM arrival_items WHERE import_file_id IN (SELECT value FROM json_each(@ids)) ORDER BY id`);
      const xoaDong = db.prepare('DELETE FROM arrival_items WHERE import_file_id IN (SELECT value FROM json_each(@ids))');
      const xoaFile = db.prepare('DELETE FROM arrival_import_files WHERE id IN (SELECT value FROM json_each(@ids))');
      for (const b of lai.bcvh) {
        for (const c of b.cap) {
          const id = Number(ghiNhatKy.run({
            luc: luc.toISOString(), nguoi, b: b.ma, d: c.ngay, cu: JSON.stringify(c.cu.files), sfc: c.cu.files.length, sdc: c.cu.tongDong, shc: c.cu.shbg.size,
            mt: c.shbg_mat_that, muc: X.mucCanhBaoTheo(c.shbg_mat_that, c.cu.shbg.size), sl: sl.duong_dan, het: hetHan
          }).lastInsertRowid);
          chepFile.run({ t: id, ids: c.cu.ids });
          chepDong.run({ t: id, ids: c.cu.ids });
          const dong = xoaDong.run({ ids: c.cu.ids }).changes; // khóa ngoại bật: dòng trước, bản ghi file sau
          if (typeof options.sauKhiXoa === 'function') options.sauKhiXoa(b.ma, c.ngay);
          const file = xoaFile.run({ ids: c.cu.ids }).changes;
          if (dong !== c.cu.tongDong || file !== c.cu.files.length) throw new XoaLoi(MA_THOAT.KHAC, 'Số dòng / file đã xóa không khớp số đã tính — đã hoàn tác toàn bộ');
          soDongXoa += dong;
          soFileXoa += file;
          nhatKy.push({ id, bcvh: b.ma, ngay: c.ngay, so_file: file, so_dong: dong });
        }
      }
    });
    try {
      thucHien.immediate();
    } catch (err) {
      if (err instanceof XoaLoi) throw err;
      throw new XoaLoi(MA_THOAT.KHAC, `Giao dịch xóa thất bại (${String((err && err.code) || (err && err.name) || 'LOI').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40)}) — đã hoàn tác toàn bộ, DB y nguyên`);
    }

    // dọn (lỗi dọn KHÔNG làm hỏng lần xóa đã xong)
    const don = { thung_rac: 0, sao_luu: 0, loi: [] };
    try { don.thung_rac = TT.donThungRac(db, luc).mua; } catch (e) { don.loi.push('thung_rac'); }
    try { don.sao_luu = donSaoLuuXoa(thuMucSaoLuu); } catch (e) { don.loi.push('sao_luu'); }
    return { ...ks, da_xoa: true, so_dong_xoa: soDongXoa, so_file_xoa: soFileXoa, nhat_ky: nhatKy, sao_luu: { tep: sl.tep, kich_thuoc: sl.kich_thuoc }, thung_rac_het_han_luc: hetHan, da_don: don };
  } finally {
    nha();
  }
}

// ------------------------------------------
// In
// ------------------------------------------
const log = (...a) => console.log(...a);
const loi = (...a) => console.error(...a);

function inKhaoSat(ks, chayKho) {
  log(`\n== ${chayKho ? 'CHẠY KHÔ (không ghi gì)' : 'XÓA THẬT'}: dữ liệu hàng đến theo ngày trong TÊN FILE ${ks.tu}..${ks.den} — BCVH ${ks.bcvh.map((b) => b.ma).join(', ')} ==`);
  for (const b of ks.bcvh) {
    log(`\nBCVH ${b.ma} (${b.ten})`);
    if (!b.cap.length) { log('  (không có file nào trong khoảng)'); continue; }
    log('  file_date    file   dòng     SHBG    ngày đến (nhỏ nhất..lớn nhất)');
    for (const c of b.cap) {
      const den = c.ngay_den_min ? `${c.ngay_den_min}..${c.ngay_den_max}` : '—';
      log(`  ${c.ngay}   ${String(c.cu.files.length).padStart(4)}  ${String(c.cu.tongDong).padStart(7)}  ${String(c.cu.shbg.size).padStart(7)}    ${den}${c.dong_ngay_den_rong ? ` (+${c.dong_ngay_den_rong} dòng không có ngày đến)` : ''}`);
    }
    log(`  cộng         ${String(b.so_file).padStart(4)}  ${String(b.so_dong).padStart(7)}  ${String(b.so_shbg).padStart(7)}    (SHBG khác nhau của BCVH; ${b.shbg_mat_that} không còn ở file nào khác)`);
  }
  log(`\nTỔNG: ${ks.tong.so_file} file · ${ks.tong.so_dong} dòng · ${ks.tong.so_shbg} SHBG (cộng theo từng BCVH)`);

  if (ks.ngoai_khoang.length) {
    log(`\n[CẢNH BÁO — KHÔNG xóa] Còn ${ks.ngoai_khoang.reduce((a, r) => a + r.so_dong, 0)} dòng có NGÀY ĐẾN trong ${ks.tu}..${ks.den} nằm ở file có ngày trong tên NGOÀI khoảng:`);
    for (const r of ks.ngoai_khoang) log(`  ${r.bcvh}  file_date ${r.file_date}: ${r.so_dong} dòng · ${r.so_shbg} SHBG`);
    log('  → Các dòng này vẫn ở lại DB. Khi nạp lại file mới, dòng trùng khoá với chúng sẽ bị bỏ qua (đếm «bỏ qua»), sản lượng các ngày đó vẫn tính chúng.');
  } else {
    log(`\n[Kiểm] Không có dòng nào có ngày đến trong ${ks.tu}..${ks.den} nằm ở file ngoài khoảng.`);
  }

  const coPhat = ks.bcvh.filter((b) => b.phat.so_shbg_co_trang_thai > 0);
  log('\n[Trạng thái phát — KHÔNG xóa]');
  if (!coPhat.length) log('  Không SHBG nào trong phần xóa có trạng thái phát.');
  for (const b of coPhat) {
    log(`  ${b.ma}: ${b.phat.so_shbg_co_trang_thai} SHBG có trạng thái phát; ${b.phat.con_o_ban_moi} còn dòng hàng đến ở file khác; ${b.phat.khong_con} sẽ MỒ CÔI cho tới khi nạp lại`);
  }
}

function inKetQua(kq) {
  if (!kq.da_xoa) { log('\nKhông có file nào để xóa — KHÔNG sao lưu, KHÔNG ghi gì.'); return; }
  log(`\n[Kết quả] đã xóa ${kq.so_dong_xoa} dòng / ${kq.so_file_xoa} bản ghi file trong MỘT giao dịch.`);
  log(`  sao lưu: ${kq.sao_luu.tep} (${Math.round(kq.sao_luu.kich_thuoc / 1048576)} MB, thư mục backups/ cạnh DB; giữ ${CF.SO_BAN_SAO_LUU_GIU} bản gần nhất của lệnh này)`);
  log(`  thùng rác giữ đến ${kq.thung_rac_het_han_luc}; nhật ký (khôi phục được từng mẻ qua «Khôi phục» của «Thay thế ngày»):`);
  for (const n of kq.nhat_ky) log(`    #${n.id}  ${n.bcvh}  ${n.ngay}  ${n.so_file} file · ${n.so_dong} dòng`);
  if (kq.da_don.thung_rac || kq.da_don.sao_luu || kq.da_don.loi.length) {
    log(`  dọn: thùng rác quá hạn ${kq.da_don.thung_rac} mẻ, sao lưu cũ ${kq.da_don.sao_luu} bản${kq.da_don.loi.length ? ` (lỗi dọn: ${kq.da_don.loi.join(', ')})` : ''}`);
  }
  log('  Tiếp theo: xuất lại file từ nguồn rồi nạp bằng scripts/import-arrivals.js.');
}

async function main(argv = process.argv.slice(2)) {
  let tham;
  let db;
  try {
    tham = docThamSo(argv);
    db = moDb(duongDanDb(tham), tham.chayThat);
  } catch (err) {
    if (err instanceof XoaLoi) {
      loi(`LỖI ${err.message}`);
      if (err.maThoat === MA_THOAT.THAM_SO) loi(USAGE);
      return err.maThoat;
    }
    loi(`LỖI [db] ${String(err && err.message).slice(0, 160)}`);
    return MA_THOAT.DB;
  }
  try {
    if (!tham.chayThat) {
      const ks = khaoSat(db, tham);
      inKhaoSat(ks, true);
      log(`\nĐây là CHẠY KHÔ: chưa khoá, chưa sao lưu, chưa xóa.${ks.tong.so_file ? ` Muốn xóa thật, thêm: --chay-that --xac-nhan "${chuoiXacNhan(tham.tu, tham.den)}"` : ''}`);
      return MA_THOAT.OK;
    }
    const nguoi = `script:xoa-du-lieu-bcvh:${(() => { try { return os.userInfo().username; } catch (e) { return 'khong-ro'; } })()}`;
    const kq = await xoaThat({ db, bcvh: tham.bcvh, tu: tham.tu, den: tham.den, xacNhan: tham.xacNhan, nguoiThucHien: nguoi });
    inKhaoSat(kq, false);
    inKetQua(kq);
    return MA_THOAT.OK;
  } catch (err) {
    if (err instanceof XoaLoi) { loi(`LỖI ${err.message}`); return err.maThoat; }
    loi(`LỖI [khac] ${String(err && err.message).slice(0, 160)}`);
    return MA_THOAT.KHAC;
  } finally {
    try { db.close(); } catch (e) { /* đã đóng */ }
  }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((err) => { loi(`[xoa-du-lieu-bcvh] Lỗi không lường trước: ${String(err && err.message).slice(0, 200)}`); process.exitCode = 1; });
}

module.exports = { BCVH_CAM, SO_NGAY_TOI_DA, MA_THOAT, TEN_SAO_LUU_RE, XoaLoi, docThamSo, khaoSat, xoaThat, donSaoLuuXoa, chuoiXacNhan, main };
