// ==========================================
// File Excel / CSV của module «Xử lý và tỷ lệ phát» (PHAT-1): đọc file nhập, dựng file mẫu và file lỗi.
// Không đụng DB. Thư viện: exceljs, csv-parse (đã có). Mọi lỗi cấu trúc file -> PhatError 400 tiếng Việt.
// ==========================================
'use strict';
const ExcelJS = require('exceljs');
const { parse: parseCsv } = require('csv-parse/sync');
const C = require('../config/phat');
const P = require('./phat');
const exp = require('./arrivalsExport');

const { PhatError, normalizeKey } = P;
const XLSX_MIME = exp.XLSX_MIME;

// ------------------------------------------
// Đọc ô
// ------------------------------------------
/** Giá trị ô Excel -> { text, loi }. Công thức: lấy result nếu là chuỗi (số / logic -> chuỗi); lỗi công thức / chưa có kết quả -> loi. */
function docO(v) {
  if (v === null || v === undefined) return { text: '', loi: false };
  if (typeof v === 'string') return { text: v.trim(), loi: false };
  if (typeof v === 'number' || typeof v === 'boolean') return { text: String(v), loi: false };
  if (v instanceof Date) return { text: v.toISOString(), loi: false };
  if (typeof v === 'object') {
    if ('error' in v) return { text: '', loi: true };
    if ('formula' in v || 'sharedFormula' in v) {
      const r = v.result;
      if (r === undefined || r === null) return { text: '', loi: true };
      if (typeof r === 'object' && !(r instanceof Date)) return { text: '', loi: true }; // { error: '#N/A' } hoặc dạng lạ
      return docO(r);
    }
    if (Array.isArray(v.richText)) return { text: v.richText.map((x) => x.text || '').join('').trim(), loi: false };
    if ('text' in v) return docO(v.text);
    if ('hyperlink' in v) return { text: String(v.hyperlink || '').trim(), loi: false };
  }
  return { text: String(v).trim(), loi: false };
}

const CAC_COT = Object.freeze({ shbg: 'shbg', trang_thai: 'trang thai', ghi_chu: 'ghi chu' });

/** header: mảng chuỗi tiêu đề (theo thứ tự cột) -> chỉ số cột; thiếu cột bắt buộc -> 400. */
function timCot(header) {
  const idx = {};
  header.forEach((h, i) => {
    const k = normalizeKey(h);
    for (const [ten, khoa] of Object.entries(CAC_COT)) if (k === khoa && idx[ten] === undefined) idx[ten] = i;
  });
  const thieu = [];
  if (idx.shbg === undefined) thieu.push('SHBG');
  if (idx.trang_thai === undefined) thieu.push('Trạng thái');
  if (thieu.length) throw new PhatError(400, `File thiếu cột bắt buộc: ${thieu.join(', ')}. Cần có tiêu đề cột "SHBG" và "Trạng thái" (không phân biệt hoa/thường, dấu, khoảng trắng, gạch dưới).`);
  return idx;
}

function kiemTraSoDong(n) {
  if (n > C.maxDong()) {
    throw new PhatError(400, `File có hơn ${exp.formatCount(C.maxDong())} dòng dữ liệu, vượt giới hạn ${exp.formatCount(C.maxDong())} dòng một file. Hãy tách file nhỏ hơn.`);
  }
}

/** Sheet ẩn _meta (nếu có): cột A là khoá, cột B là giá trị. */
function docMeta(wb) {
  const ws = wb.getWorksheet(C.META_SHEET);
  if (!ws) return null;
  const meta = {};
  ws.eachRow((row) => {
    const k = normalizeKey(docO(row.getCell(1).value).text).replace(/ /g, '_');
    if (k) meta[k] = docO(row.getCell(2).value).text;
  });
  return meta;
}

function kiemTraMeta(meta, bcvh) {
  if (!meta) return; // file không có _meta (file tự lập) vẫn nhận
  if (meta.bcvh && meta.bcvh !== bcvh) {
    throw new PhatError(400, `File này được xuất cho BCVH ${meta.bcvh}, không phải BCVH ${bcvh} đang chọn. Hãy tải đúng file mẫu của BCVH ${bcvh}.`);
  }
  if (meta.phien_ban_cot && Number(meta.phien_ban_cot) !== C.PHIEN_BAN_COT) {
    throw new PhatError(400, 'File dùng cấu trúc cột phiên bản cũ. Hãy tải lại file mẫu mới.');
  }
}

async function docXlsx(buffer, bcvh) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    throw new PhatError(400, 'Không đọc được file Excel (.xlsx). File có thể bị hỏng hoặc không đúng định dạng.');
  }
  kiemTraMeta(docMeta(wb), bcvh);
  const ws = wb.worksheets.find((w) => w.name !== C.META_SHEET && w.state === 'visible');
  if (!ws) throw new PhatError(400, 'File Excel không có sheet dữ liệu.');
  const hRow = ws.getRow(1);
  const header = [];
  for (let c = 1; c <= Math.max(ws.columnCount, 1); c++) header.push(docO(hRow.getCell(c).value).text);
  const idx = timCot(header);
  const cell = (row, i) => (i === undefined ? { text: '', loi: false } : docO(row.getCell(i + 1).value));
  const dong = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const s = cell(row, idx.shbg);
    const t = cell(row, idx.trang_thai);
    const g = cell(row, idx.ghi_chu);
    if (!s.text && !t.text && !g.text && !s.loi && !t.loi) continue; // dòng trống hoàn toàn
    dong.push({
      so_dong_goc: r, shbg: s.text, trang_thai_file: t.text, ghi_chu: g.text,
      loi_o: s.loi ? 'SHBG' : (t.loi ? 'TRANG_THAI' : null)
    });
    kiemTraSoDong(dong.length);
  }
  return dong;
}

function docCsv(buffer) {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  let records;
  try {
    records = parseCsv(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, bom: true });
  } catch (err) {
    throw new PhatError(400, `Không đọc được file CSV (${err.code || 'CSV_ERROR'}). Dùng CSV UTF-8, dấu phân cách là dấu phẩy, chấm phẩy hoặc tab.`);
  }
  if (!records.length) throw new PhatError(400, 'File CSV trống.');
  const idx = timCot(records[0]);
  const dong = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const v = (k) => (idx[k] === undefined ? '' : String(rec[idx[k]] ?? '').trim());
    if (!v('shbg') && !v('trang_thai') && !v('ghi_chu')) continue;
    dong.push({ so_dong_goc: i + 1, shbg: v('shbg'), trang_thai_file: v('trang_thai'), ghi_chu: v('ghi_chu'), loi_o: null });
    kiemTraSoDong(dong.length);
  }
  return dong;
}

/** Buffer file nhập (.xlsx hoặc .csv UTF-8) -> mảng dòng thô. Nhận diện theo nội dung (xlsx là file zip: bắt đầu "PK"). */
async function docFileKiemTra(buffer, tenFile, bcvh) {
  const ten = String(tenFile || '').toLowerCase();
  if (ten && !/\.(xlsx|csv)$/.test(ten)) throw new PhatError(400, 'Chỉ nhận file .xlsx hoặc .csv (UTF-8).');
  if (buffer.length < 4) throw new PhatError(400, 'File trống.');
  const laXlsx = buffer[0] === 0x50 && buffer[1] === 0x4B;
  if (ten.endsWith('.xlsx') && !laXlsx) throw new PhatError(400, 'File không phải .xlsx hợp lệ.');
  return laXlsx ? docXlsx(buffer, bcvh) : docCsv(buffer);
}

// ------------------------------------------
// Dựng file mẫu / file lỗi
// ------------------------------------------
const CHUOI_DANH_SACH = `"${C.DANH_SACH_NHAN.join(',')}"`; // 6 nhãn (5 trạng thái + «Đã vu hồi») ≈ 95 ký tự (< 255 của Excel)
const FILL_KHOA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
const FILL_DIEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

const ngayVN = (t) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : null);
const chuoi = (v) => exp.cellText(v, false);

const COT_MAU = [
  { header: 'SHBG', key: 'shbg', width: 18, khoa: true },
  { header: 'Ngày đến', key: 'ngay', width: 13, khoa: true },
  { header: 'Khung giờ đến', key: 'khung', width: 15, khoa: true },
  { header: 'Đường thư', key: 'duong_thu', width: 34, khoa: true },
  { header: 'Trạng thái hiện có', key: 'hien_co', width: 24, khoa: true },
  { header: 'Trạng thái', key: 'trang_thai', width: 26, khoa: false },
  { header: 'Ghi chú', key: 'ghi_chu', width: 32, khoa: false }
];
const COT_LOI = [
  { header: 'Số dòng trong file gốc', key: 'so_dong_goc', width: 14, khoa: true },
  { header: 'Lý do lỗi', key: 'ly_do', width: 60, khoa: true }
];

async function dungSheet(cols, rows, meta) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('PHAT');
  ws.columns = cols.map((c) => ({
    header: c.header, key: c.key, width: c.width,
    style: c.khoa ? { numFmt: '@' } : { numFmt: '@', protection: { locked: false } } // cột Trạng thái, Ghi chú mở khóa
  }));
  for (const r of rows) ws.addRow(r);
  const h = ws.getRow(1);
  h.font = { bold: true };
  cols.forEach((c, i) => {
    const cell = h.getCell(i + 1);
    cell.fill = c.khoa ? FILL_KHOA : FILL_DIEN;
    cell.protection = { locked: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const last = rows.length + 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(last, 1), column: cols.length } };
  if (rows.length) {
    const tt = cols.findIndex((c) => c.key === 'trang_thai') + 1;
    const letter = String.fromCharCode(64 + tt);
    ws.dataValidations.add(`${letter}2:${letter}${last}`, {
      type: 'list', allowBlank: true, formulae: [CHUOI_DANH_SACH], showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Trạng thái', error: 'Chọn một trong 6 trạng thái trong danh sách.'
    });
  }
  // Khóa sheet KHÔNG mật khẩu; chỉ mở khóa 2 cột điền. exceljs: giá trị true = CHO PHÉP (lọc, đổi độ rộng cột).
  await ws.protect('', { autoFilter: true, formatColumns: true });
  const ms = wb.addWorksheet(C.META_SHEET, { state: 'veryHidden' });
  for (const [k, v] of Object.entries(meta)) ms.addRow([k, String(v)]);
  return wb;
}

const nhanTT = (ma, vuHoi) => (ma ? C.nhanTrangThai(ma, vuHoi) : null);

/** rows từ phat.layDongMau. Trả Buffer .xlsx. */
async function taoFileMau({ bcvh, from, to, scope, rows }) {
  const out = rows.map((r) => ({
    shbg: chuoi(r.shbg), ngay: ngayVN(r.t), khung: (P.khungGio(r.t) || {}).nhan || null,
    duong_thu: chuoi(r.duong_thu) || C.DUONG_THU_TRONG,
    hien_co: C.nhanTrangThai(r.hien_co || C.TT_CHUA_CO, r.vu_hoi),
    trang_thai: scope === 'tat-ca' ? nhanTT(r.hien_co, r.vu_hoi) : null, // «tất cả»: nạp sẵn trạng thái hiện có (nếu đã có)
    ghi_chu: scope === 'tat-ca' ? chuoi(r.ghi_chu) : null
  }));
  const wb = await dungSheet(COT_MAU, out, {
    bcvh, tu_ngay: from, den_ngay: to, pham_vi: scope, xuat_luc: P.nowIso(), phien_ban_cot: C.PHIEN_BAN_COT, so_dong: rows.length
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** rows từ phat.layDongLoi. Cùng cấu trúc file mẫu + «Số dòng trong file gốc», «Lý do lỗi»; nhập lại thẳng được. */
async function taoFileLoi({ bcvh, rows }) {
  const out = rows.map((r) => ({
    shbg: chuoi(r.shbg), ngay: ngayVN(r.t), khung: (P.khungGio(r.t) || {}).nhan || null,
    duong_thu: r.t ? (chuoi(r.duong_thu) || C.DUONG_THU_TRONG) : null,
    hien_co: r.hien_co ? C.nhanTrangThai(r.hien_co, r.hien_co_vu_hoi) : null,
    trang_thai: chuoi(r.trang_thai), ghi_chu: chuoi(r.ghi_chu), so_dong_goc: String(r.so_dong_goc), ly_do: chuoi(r.ly_do)
  }));
  const wb = await dungSheet([...COT_MAU, ...COT_LOI], out, {
    bcvh, pham_vi: 'loi', xuat_luc: P.nowIso(), phien_ban_cot: C.PHIEN_BAN_COT, so_dong: rows.length
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { XLSX_MIME, docO, timCot, docFileKiemTra, taoFileMau, taoFileLoi, COT_MAU, COT_LOI };
