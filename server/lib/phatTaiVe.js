// ==========================================
// TAIVE-1: «Bảng kê kết quả phát theo ngày đến» — GET /api/phat/tai-ve (docs/ai/08_PHAT.md, 04_DECISIONS.md #98).
// Mỗi SHBG đến BCVH trong ngày ngay_den một dòng, kèm kết quả phát theo quy tắc ngày đến #92. KHÔNG có logic dựng trạng thái riêng: dùng ĐÚNG
// P.GAN_CTE (DASH-7f), P.NHAP_CTE + P.NHAP_ROW (#92) và aq.buildCountedCte của demNgay — số dòng = mẫu số của /ty-le và ketQuaPhat cùng (BCVH, ngày).
// TAIVE-3: thêm cột «Đã vu hồi» (cờ da_vu_hoi của ĐÚNG dòng lịch sử r.sel, như phatVuHoi.demNgay — nối thêm, không đổi NHAP_* / tập hàng) và bộ lọc DA_VU_HOI. Ghi file Excel theo luồng (ExcelJS WorkbookWriter), mọi ô là văn bản; chỉ đọc DB.
// ==========================================
'use strict';
const ExcelJS = require('exceljs');
const aq = require('./arrivalsQuery');
const den = require('./dashboardDenQuery');
const exp = require('./arrivalsExport');
const P = require('./phat');
const C = require('../config/phat');
const { bcvhNames } = require('./dashboardQuery');
const { VALID_BCVH_CODES } = require('./userBcvh');

const { PhatError } = P;
const GIOI_HAN_DONG = 50000;
const SHEET = 'BangKe';
const COT = Object.freeze([
  { header: 'Số hiệu bưu gửi', width: 22 },
  { header: 'BCVH', width: 28 },
  { header: 'Ngày giờ đến', width: 21 },
  { header: 'Trạng thái phát', width: 24 },
  { header: 'Đã vu hồi', width: 12 },
  { header: 'Ghi chú', width: 36 },
  { header: 'Giờ nhập', width: 21 },
  { header: 'Đợt nhập', width: 11 },
  { header: 'Người nhập', width: 30 }
]);

/** Giới hạn dòng một tệp: mặc định 50.000; biến môi trường TAIVE_MAX_DONG chỉ được HẠ xuống (test dùng ngưỡng nhỏ). */
function maxDong() {
  const n = Number(process.env.TAIVE_MAX_DONG);
  return Number.isInteger(n) && n > 0 ? Math.min(n, GIOI_HAN_DONG) : GIOI_HAN_DONG;
}

const dmy = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const tenFile = (bcvh, ngay) => `BangKe_KetQuaPhat_${bcvh}_${ngay.replace(/-/g, '')}.xlsx`;

/** Mệnh đề WITH dùng chung (cùng cách dựng với P.demNgay theoLichSu) + tham số. */
function dung(db, bcvh, ngay, tt) {
  const { sql, params } = aq.buildCountedCte(db, den.windowFilter(bcvh, ngay, '23:59:59'), { materialize: true });
  return {
    head: `WITH ${sql}, ${P.GAN_CTE}, ${P.NHAP_CTE}`,
    prm: { ...params, g_tu: ngay, g_den: ngay, g_all: JSON.stringify(VALID_BCVH_CODES), bcvh, x_day: ngay, x_tt: tt === C.DA_VU_HOI.ma ? C.DA_VU_HOI.trang_thai : (tt || null), x_vh: tt === C.DA_VU_HOI.ma ? 1 : 0 }
  };
}

const TT_SQL = "COALESCE(r.tt0, 'CHUA_CO_TT')";
// Khớp bộ lọc: đúng trạng thái; riêng DA_VU_HOI (x_vh = 1) = PKTC có cờ trên dòng lịch sử đã chọn (h). PKTC (x_vh = 0) vẫn gồm cả dòng có cờ.
const KHOP_SQL = `(${TT_SQL} = @x_tt AND (@x_vh = 0 OR h.da_vu_hoi = 1))`;
function dem(db, bcvh, ngay, tt) {
  const { head, prm } = dung(db, bcvh, ngay, tt);
  const r = db.prepare(`${head} SELECT COUNT(*) AS n, COALESCE(SUM(${KHOP_SQL}), 0) AS k FROM (${P.NHAP_ROW}) r LEFT JOIN phat_status_history h ON h.id = r.sel`).get(prm);
  return { tong: r.n, loc: tt ? r.k : r.n };
}
function layDong(db, bcvh, ngay, tt) {
  const { head, prm } = dung(db, bcvh, ngay, tt);
  return db.prepare(`${head}
    SELECT r.shbg AS shbg, r.t AS t, ${TT_SQL} AS tt, r.nl AS nl, h.ghi_chu AS ghi_chu, h.da_vu_hoi AS vh, h.batch_id AS batch_id, b.user_id AS user_id, u.hrm_code AS hrm, u.full_name AS ten
    FROM (${P.NHAP_ROW}) r LEFT JOIN phat_status_history h ON h.id = r.sel LEFT JOIN phat_batches b ON b.id = h.batch_id LEFT JOIN users u ON u.id = b.user_id
    WHERE (@x_tt IS NULL OR ${KHOP_SQL}) ORDER BY r.t, r.shbg`).all(prm);
}

/** Người nhập: còn tài khoản -> «Họ tên (mã)»; tài khoản đã xóa -> «(đã xóa) <mã người dùng>». */
function nguoiNhap(r) {
  if (!r.user_id) return null;
  if (r.hrm || r.ten) return r.ten && r.hrm ? `${r.ten} (${r.hrm})` : (r.ten || r.hrm);
  return `(đã xóa) ${r.user_id}`;
}

/**
 * Kiểm tra trước khi ghi: đếm theo từng BCVH (cùng truy vấn nguồn của dòng). Trả { codes, ngay, tt, tong, soDong }.
 * tong = số SHBG đến ngày đó (không lọc trạng thái) — 0 -> 400 «chưa có file hàng đến»; soDong > giới hạn -> 400.
 */
function chuanBi(db, { bcvh, ngay, tt }) {
  const names = bcvhNames(db);
  const codes = bcvh === 'all' ? VALID_BCVH_CODES : [bcvh];
  let tong = 0;
  let soDong = 0;
  for (const c of codes) { const d = dem(db, c, ngay, tt); tong += d.tong; soDong += d.loc; }
  if (tong === 0) {
    throw new PhatError(400, `${bcvh === 'all' ? 'Toàn Trung tâm' : names.get(bcvh)} chưa có file hàng đến cho ngày ${dmy(ngay)}.`);
  }
  const max = maxDong();
  if (soDong > max) {
    throw new PhatError(400, `Bảng kê có ${exp.formatCount(soDong)} dòng, vượt giới hạn ${exp.formatCount(max)} dòng một tệp. Hãy chọn một BCVH hoặc lọc theo trạng thái.`);
  }
  return { codes, ngay, tt, tong, soDong, names };
}

/** Ghi tệp vào `out` theo luồng, mỗi lần một BCVH (không giữ cả bảng). Trả { rows, aborted }. */
async function ghi(db, kh, out, shouldStop = () => false) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COT.map((c) => ({ width: c.width, style: { numFmt: '@' } }));
  const head = ws.addRow(COT.map((c) => c.header));
  head.eachCell((cell) => { cell.font = { bold: true }; cell.numFmt = '@'; });
  head.commit();
  const text = (v) => exp.cellText(v, false);
  let rows = 0;
  for (const c of kh.codes) {
    if (shouldStop()) { try { wb.zip.abort(); } catch (e) { /* đang đóng */ } return { rows, aborted: true }; }
    const nhan = `${c} · ${kh.names.get(c)}`;
    const list = layDong(db, c, kh.ngay, kh.tt);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const co = r.tt !== C.TT_CHUA_CO && r.nl; // «Chưa có TT»: các cột phía nhập để trống
      ws.addRow([
        text(r.shbg), text(nhan), text(exp.formatTime(r.t)), text(C.TT_NHAN[r.tt]),
        r.tt === 'PKTC' && r.vh === 1 ? text('Có') : null, // cờ phụ của PKTC; mọi dòng khác (kể cả «Chưa có TT») để trống
        co ? text(r.ghi_chu) : null,
        co ? text(exp.formatTime(P.gioBangkok(r.nl))) : null,
        co && r.batch_id ? `#${r.batch_id}` : null,
        co ? text(nguoiNhap(r)) : null
      ]).commit();
      rows++;
      if (i % 2000 === 1999) {
        await new Promise((resolve) => setImmediate(resolve));
        if (shouldStop()) { try { wb.zip.abort(); } catch (e) { /* đang đóng */ } return { rows, aborted: true }; }
      }
    }
  }
  ws.commit();
  await wb.commit();
  return { rows, aborted: false };
}

module.exports = { COT, GIOI_HAN_DONG, maxDong, tenFile, chuanBi, ghi };
