// ==========================================
// Xuất file Excel dữ liệu THÔ "Hàng đến" của ĐÚNG MỘT BCVH mỗi lần (SANLUONG-3c-3, docs/ai/04_DECISIONS.md #55–#58).
// Mọi dòng của BCVH trong khoảng ngày (theo mốc `date_basis`), KHÔNG gộp theo bưu gửi, KHÔNG loại dòng nào.
// Đúng 9 cột; tất cả ô (kể cả tiêu đề) là VĂN BẢN (numFmt '@' + giá trị chuỗi); ô rỗng để trống thật.
// Ghi theo luồng (ExcelJS WorkbookWriter) từng lô dòng theo khoá (ngày, id), có chờ khi bộ đệm ghi đầy -> bộ nhớ không tăng theo số dòng.
// Chỉ đọc DB. Giá trị người dùng đi qua tham số `@`; tên cột chỉ lấy từ whitelist (aq.DATE_BASES).
// ==========================================
'use strict';
const ExcelJS = require('exceljs');
const aq = require('./arrivalsQuery');
const { DASHBOARD_BCVH, bcvhNames } = require('./dashboardQuery');
const { getAssignedBcvh } = require('./userBcvh');
const { ROLES } = require('../roles');
const bd10 = require('./bd10Query');
const XLSX_PREFIX_NR = 'ChuaNhan';

// Tiêu đề trong file (PO chốt 09/10/2026) -> cột trong arrival_items, theo đúng thứ tự cột của file xuất.
const EXPORT_COLUMNS = Object.freeze([
  { header: 'BC_nhan_BG', field: 'receiver_code', width: 14 },
  { header: 'Ten_duong_thu', field: 'route_name', width: 34 },
  { header: 'SHBG', field: 'tracking_no', width: 20 },
  { header: 'So_hieu_BD8', field: 'bd8_no', width: 24 },
  { header: 'So_hieu_BD10', field: 'bd10_no', width: 24 },
  { header: 'Thoi_gian_XN_BG', field: 'item_confirmed_at', width: 21, time: true },
  { header: 'Thoi_gian_XN_tui', field: 'bag_confirmed_at', width: 21, time: true },
  { header: 'Ngay_gio_XND_BD10', field: 'bd10_confirmed_at', width: 21, time: true },
  { header: 'Dich_vu_code', field: 'service_code', width: 14 }
]);

const EXPORT_MAX_DAYS = 92;
const EXPORT_MAX_ROWS_DEFAULT = 1000000; // Excel tối đa 1.048.576 dòng (gồm 1 dòng tiêu đề)
const EXCEL_MAX_DATA_ROWS = 1048575;
const BATCH_SIZE = 2000;
const PENDING_HIGH_BYTES = 2 * 1024 * 1024; // XML chờ nén/gửi vượt mức này thì dừng đọc DB cho tới khi vơi
const SHEET_NAME = 'HangDen'; // không chứa ký tự cấm của Excel (\ / ? * [ ] :), ≤ 31 ký tự
const CELL_MAX_CHARS = 32767; // giới hạn ký tự của một ô Excel
const STRIP_XML_CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g; // ký tự không hợp lệ trong XML 1.0
const DB_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Ngưỡng số dòng: mặc định 1.000.000; biến môi trường ARRIVALS_EXPORT_MAX_ROWS để đổi (test dùng ngưỡng nhỏ).
function maxRows() {
  const n = Number(process.env.ARRIVALS_EXPORT_MAX_ROWS);
  return Number.isInteger(n) && n > 0 ? Math.min(n, EXCEL_MAX_DATA_ROWS) : EXPORT_MAX_ROWS_DEFAULT;
}

const formatCount = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ------------------------------------------
// Phạm vi xuất của từng vai trò (04_DECISIONS.md #57)
// ------------------------------------------
function allowedBcvhCodes(db, user) {
  const all = DASHBOARD_BCVH.map((b) => b.ma);
  if (user.role === ROLES.ADMIN || user.role === ROLES.TTVH) return all;
  if (user.role === ROLES.GDVH) {
    const assigned = new Set(getAssignedBcvh(user.id, db));
    return all.filter((ma) => assigned.has(ma));
  }
  return [];
}

function exportScope(db, user) {
  const names = bcvhNames(db);
  return allowedBcvhCodes(db, user).map((ma) => ({ ma, ten: names.get(ma) }));
}

// ------------------------------------------
// Kiểm tham số
// ------------------------------------------
function parseReceiverCode(query) {
  const raw = query.receiver_code;
  if (Array.isArray(raw)) throw new aq.QueryParamError('Tham số "receiver_code" chỉ nhận 1 mã BCVH mỗi lần xuất');
  const code = raw === undefined ? '' : String(raw).trim();
  if (!code) throw new aq.QueryParamError('Thiếu tham số "receiver_code" (mã của một trong 6 BCVH)');
  if (!DASHBOARD_BCVH.some((b) => b.ma === code)) {
    throw new aq.QueryParamError(`Tham số "receiver_code" không thuộc 6 BCVH được hỗ trợ (${DASHBOARD_BCVH.map((b) => b.ma).join(', ')})`);
  }
  return code;
}

/** Trả { code, f }: f = bộ lọc đã chuẩn hoá (from/to dạng "YYYY-MM-DD HH:MM:SS", dateBasis). */
function parseExportParams(query) {
  const code = parseReceiverCode(query);
  // Xuất file chỉ nhận ngày (không nhận giờ), khác các API xem.
  for (const k of ['from', 'to']) {
    const v = query[k];
    if (typeof v === 'string' && v.trim() && !aq.DATE_RE.test(v.trim())) {
      throw new aq.QueryParamError(`Tham số "${k}" phải dạng YYYY-MM-DD`);
    }
  }
  const f = aq.parseFilters({ ...query, receiver_code: code }, { allowed: ['receiver_code', 'from', 'to', 'date_basis'] });
  const days = aq.dayDiff(f.fromDate, f.toDate) + 1;
  if (days > EXPORT_MAX_DAYS) {
    throw new aq.QueryParamError(`Khoảng ngày xuất file tối đa ${EXPORT_MAX_DAYS} ngày (đã chọn ${days} ngày). Hãy thu hẹp khoảng ngày`);
  }
  return { code, f };
}

// ------------------------------------------
// Truy vấn
// ------------------------------------------
function whereSql(f) {
  const b = aq.DATE_BASES[f.dateBasis]; // whitelist
  return {
    b,
    // Cột ngày dẫn xuất đi qua chỉ mục (receiver_code, <ngày>); cột giờ so sánh chính xác.
    where: `receiver_code = @recv AND ${b.date} BETWEEN @dfrom AND @dto AND ${b.time} BETWEEN @from AND @to`
  };
}
const paramsOf = ({ code, f }) => ({ recv: code, dfrom: f.fromDate, dto: f.toDate, from: f.from, to: f.to });

function countRows(db, ctx) {
  const { where } = whereSql(ctx.f);
  return db.prepare(`SELECT COUNT(*) AS n FROM arrival_items WHERE ${where}`).get(paramsOf(ctx)).n;
}

// ------------------------------------------
// Giá trị ô: luôn là chuỗi hoặc null (rỗng để trống thật)
// ------------------------------------------
// DB: 'YYYY-MM-DD HH:MM:SS' (giờ địa phương) -> 'dd/MM/yyyy HH:mm:ss'. Không khớp dạng -> giữ nguyên.
function formatTime(s) {
  const m = DB_TIME_RE.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : s;
}

function cellText(value, isTime) {
  if (value === null || value === undefined || value === '') return null;
  let s = String(value).replace(STRIP_XML_CTRL, '');
  if (isTime) s = formatTime(s);
  if (s.length > CELL_MAX_CHARS) s = s.slice(0, CELL_MAX_CHARS);
  return s === '' ? null : s;
}

const rowValues = (r) => EXPORT_COLUMNS.map((c) => cellText(r[c.field], c.time));

// ------------------------------------------
// XML dòng dữ liệu. Dòng tiêu đề đi qua API dòng của ExcelJS; dòng dữ liệu ghi thẳng XML vào luồng sheet vì API dòng/ô
// của ExcelJS tốn ~30 µs/dòng (chủ yếu tra kiểu ô) — 1 triệu dòng mất ~30 s. Ô chuỗi: t="str" (như ExcelJS ghi), s = kiểu '@'.
// ------------------------------------------
const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, EXPORT_COLUMNS.length).split('');
const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const xmlEscape = (v) => v.replace(/[&<>"']/g, (ch) => XML_ESC[ch]);

function rowXml(rowNumber, values, styleId) {
  let x = `<row r="${rowNumber}">`;
  for (let i = 0; i < values.length; i++) {
    const ref = `${COL_LETTERS[i]}${rowNumber}`;
    x += values[i] === null ? `<c r="${ref}" s="${styleId}"/>` : `<c r="${ref}" s="${styleId}" t="str"><v>${xmlEscape(values[i])}</v></c>`;
  }
  return `${x}</row>`;
}

function exportFileName(ctx) {
  return `HangDen_${ctx.code}_${ctx.f.fromDate}_${ctx.f.toDate}.xlsx`;
}

// ------------------------------------------
// Ghi file theo luồng vào `out` (res). Trả { rows, aborted }.
// shouldStop(): true khi client đã ngắt -> dừng đọc DB, huỷ file đang ghi.
// ------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Byte XML đang chờ nén / gửi: bộ đệm của luồng sheet + ống dẫn vào bộ nén + hàng đợi của response.
// (Luồng sheet của ExcelJS không tự báo áp lực ngược, nên phải đo ở đây.)
// readable-stream 3 (dùng trong archiver) không có writableLength / readableLength -> đọc trạng thái nội bộ.
function streamBytes(st) {
  const w = st.writableLength !== undefined ? st.writableLength : (st._writableState && st._writableState.length);
  const r = st.readableLength !== undefined ? st.readableLength : (st._readableState && st._readableState.length);
  return (w || 0) + (r || 0);
}

function pendingBytes(sheetStream, out) {
  let n = (sheetStream.buffers || []).reduce((sum, b) => sum + b.length, 0);
  for (const sink of sheetStream.pipes || []) n += streamBytes(sink);
  return n + streamBytes(out);
}

// Chờ tới khi bộ đệm vơi (hoặc client ngắt). Nhường vòng lặp sự kiện ít nhất một lần giữa các lô.
async function waitForRoom(sheetStream, out, shouldStop) {
  await new Promise((resolve) => setImmediate(resolve));
  while (!shouldStop() && pendingBytes(sheetStream, out) > PENDING_HIGH_BYTES) await sleep(5);
}

async function writeExport(db, ctx, out, shouldStop = () => false) {
  const b = aq.DATE_BASES[ctx.f.dateBasis]; // whitelist
  // Duyệt từng NGÀY (theo cột ngày của tiêu chí), trong ngày phân trang theo id: cả hai nằm trong khoá chỉ mục
  // (receiver_code, <ngày>, rowid) nên mỗi lô là một lần "seek" — không quét lại từ đầu khoảng ngày.
  const stmt = db.prepare(`
    SELECT id, ${EXPORT_COLUMNS.map((c) => c.field).join(', ')}
    FROM arrival_items
    WHERE receiver_code = @recv AND ${b.date} = @day AND ${b.time} BETWEEN @from AND @to AND id > @lid
    ORDER BY id
    LIMIT ${BATCH_SIZE}`);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ key: c.field, width: c.width, style: { numFmt: '@' } }));
  const head = ws.addRow(EXPORT_COLUMNS.map((c) => c.header));
  head.eachCell((cell) => { cell.font = { bold: true }; cell.numFmt = '@'; });
  head.commit();
  const textStyleId = wb.styles.addStyleModel({ numFmt: '@' }, ExcelJS.ValueType.String); // kiểu '@' đã có sẵn từ cột

  let rows = 0;
  for (let day = ctx.f.fromDate; day <= ctx.f.toDate; day = aq.addDays(day, 1)) {
    let lastId = 0;
    for (;;) {
      if (shouldStop()) {
        try { wb.zip.abort(); } catch (e) { /* đang đóng */ }
        return { rows, aborted: true };
      }
      const batch = stmt.all({ recv: ctx.code, day, from: ctx.f.from, to: ctx.f.to, lid: lastId });
      if (!batch.length) break;
      let xml = '';
      for (let i = 0; i < batch.length; i++) xml += rowXml(rows + i + 2, rowValues(batch[i]), textStyleId); // dòng 1 là tiêu đề
      ws.stream.write(xml, 'utf8');
      rows += batch.length;
      lastId = batch[batch.length - 1].id;
      await waitForRoom(ws.stream, out, shouldStop);
      if (batch.length < BATCH_SIZE) break;
    }
  }
  ws.commit();
  await wb.commit();
  return { rows, aborted: false };
}

// ------------------------------------------
// Xuất danh sách "đã lập BD10 về BCVH, chưa có XN nhận tại BCVH" của MỘT BCVH (cùng cơ chế, cùng quyền, cùng giới hạn với /export).
// Danh sách nhỏ (chục–trăm dòng) nên dùng API dòng của ExcelJS; vẫn ghi luồng, mọi ô là chuỗi.
// ------------------------------------------
const NR_COLUMNS = Object.freeze([
  { header: 'SHBG', field: 'tracking_no', width: 20 },
  { header: 'So_hieu_BD8', field: 'bd8_no', width: 24 },
  { header: 'So_hieu_BD10', field: 'bd10_no', width: 24 },
  { header: 'Ten_duong_thu', field: 'route_name', width: 34 },
  { header: 'Thoi_gian_lap_BD10', field: 'thoi_diem_lap_bd10', width: 21, time: true },
  { header: 'Tuoi_ngay', field: 'tuoi_ngay', width: 11 }
]);
const NR_PAGE = 2000;

const nrFilters = (ctx, page) => ({ ...ctx.f, page, pageSize: NR_PAGE });
function countNotReceived(db, ctx) {
  return aq.notReceivedList(db, { ...ctx.f, page: 1, pageSize: 1 }).pagination.total;
}
const notReceivedFileName = (ctx) => `${XLSX_PREFIX_NR}_${ctx.code}_${ctx.f.fromDate}_${ctx.f.toDate}.xlsx`;

// Ghi file danh sách theo trang (mọi ô là chuỗi). fetchPage(page) -> mảng bản ghi (rỗng / ngắn hơn NR_PAGE = hết).
async function writeListExport(out, shouldStop, { sheet, columns, fetchPage }) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet(sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ key: c.field, width: c.width, style: { numFmt: '@' } }));
  const head = ws.addRow(columns.map((c) => c.header));
  head.eachCell((cell) => { cell.font = { bold: true }; cell.numFmt = '@'; });
  head.commit();
  let rows = 0;
  for (let page = 1; ; page++) {
    if (shouldStop()) { try { wb.zip.abort(); } catch (e) { /* đang đóng */ } return { rows, aborted: true }; }
    const items = fetchPage(page);
    if (!items.length) break;
    for (const r of items) { ws.addRow(columns.map((c) => cellText(r[c.field], c.time))).commit(); rows++; }
    if (items.length < NR_PAGE) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  ws.commit();
  await wb.commit();
  return { rows, aborted: false };
}

const writeNotReceivedExport = (db, ctx, out, shouldStop = () => false) => writeListExport(out, shouldStop, {
  sheet: 'ChuaNhan', columns: NR_COLUMNS, fetchPage: (page) => aq.notReceivedList(db, nrFilters(ctx, page)).items
});

// ------------------------------------------
// Xuất danh sách "BD10 đến không XNĐ" (S2 + S3) của MỘT BCVH, cùng bộ lọc với GET /bd10-khong-xnd (từ ngày, đến ngày, nhom, tuoi).
// ------------------------------------------
const BD10_COLUMNS = Object.freeze([
  { header: 'So_hieu_BD10', field: 'so_hieu_bd10', width: 26 },
  { header: 'Buu_cuc_lap', field: 'lap6', width: 14 },
  { header: 'Nhom', field: 'nhom', width: 9 },
  { header: 'Thoi_gian_gan_ngay', field: 'thoi_diem', width: 21, time: true },
  { header: 'Tuoi_ngay', field: 'tuoi', width: 11 },
  { header: 'So_buu_gui', field: 'so_buu_gui', width: 12 },
  { header: 'So_BD8', field: 'so_bd8', width: 9 },
  { header: 'Co_XN_tui', field: 'co_xn_tui', width: 11 },
  { header: 'Co_XN_BG', field: 'co_xn_bg', width: 10 },
  { header: 'Trang_thai', field: 'trang_thai', width: 11 }
]);
const bd10Opts = (ctx) => ({ nhom: ctx.nhom || null, tuoi: ctx.tuoi || null });
const bd10Row = (r) => ({ ...r, co_xn_tui: r.co_xn_tui ? 'Co' : 'Khong', co_xn_bg: r.co_xn_bg ? 'Co' : 'Khong' });
const countBd10 = (db, ctx) => bd10.list(db, { ...ctx.f, page: 1, pageSize: 1 }, bd10Opts(ctx)).pagination.total;
const bd10FileName = (ctx) => `BD10KhongXND_${ctx.code}_${ctx.f.fromDate}_${ctx.f.toDate}.xlsx`;
const writeBd10Export = (db, ctx, out, shouldStop = () => false) => writeListExport(out, shouldStop, {
  sheet: 'BD10KhongXND', columns: BD10_COLUMNS, fetchPage: (page) => bd10.list(db, { ...ctx.f, page, pageSize: NR_PAGE }, bd10Opts(ctx)).items.map(bd10Row)
});

module.exports = {
  EXPORT_COLUMNS, EXPORT_MAX_DAYS, EXPORT_MAX_ROWS_DEFAULT, BATCH_SIZE, SHEET_NAME, XLSX_MIME,
  maxRows, formatCount, allowedBcvhCodes, exportScope, parseReceiverCode, parseExportParams,
  countRows, formatTime, cellText, exportFileName, writeExport, NR_COLUMNS, countNotReceived, notReceivedFileName, writeNotReceivedExport,
  BD10_COLUMNS, countBd10, bd10FileName, writeBd10Export
};
