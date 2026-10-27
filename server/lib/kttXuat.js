// ==========================================
// «Hàng tại KTT» (KTT-8b): XUẤT xlsx sheet 7 «Hàng rớt lại / Lưu thoát» kèm sheet «Thông tin». CHỈ ĐỌC DB.
// Nguồn số liệu = CÙNG lượt duyệt với /api/ktt/chi-tiet (kttLuuThoatQuery.duyetLuuThoat → kttLuuThoat.phanLoaiShbg), KHÔNG tự tính quy tắc nào.
// Hai phần:
//   - xuatLuuThoat(db, opts): chạy ở worker (kttWorker.js) — liệt kê TOÀN BỘ SHBG, trả mỗi dòng là mảng ô (chuỗi / số / null) theo đúng thứ tự COT_SHEET7;
//   - ghiXlsx(out, ...): ghi luồng (ExcelJS WorkbookWriter) hai sheet, có nhường vòng lặp và chờ khi bộ đệm đầy.
// Giờ nghiệp vụ là chuỗi 'YYYY-MM-DD HH:MM:SS' giờ VN; khi ghi ô ngày giờ tách số bằng biểu thức chính quy rồi Date.UTC(số) (KHÔNG new Date(chuỗi) / Date.parse), ô hiển thị
// đúng số giờ nguồn ở mọi múi giờ của máy chủ. Tài liệu: docs/ai/42_KTT_API.md mục 10.
// ==========================================
'use strict';
const ExcelJS = require('exceljs');
const QL = require('./kttLuuThoatQuery');
const S = require('./kttLuuThoat');
const { DIA_BAN_PHAT_MAC_DINH } = require('./kttSchema');

const TEN_SHEET_THONG_TIN = 'Thông tin';
const TEN_SHEET_7 = '7 Hàng rớt lại';
const TRAN_DONG_MAC_DINH = 200000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CELL_MAX_CHARS = 32767;
const STRIP_XML_CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const RE_GIO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const FMT_GIO = 'dd/mm/yyyy hh:mm:ss';
const TEN_BCVH = new Map(DIA_BAN_PHAT_MAC_DINH.map(([ma, ten]) => [ma, ten]));

/** Trần số dòng sheet 7; biến môi trường KTT_XUAT_TRAN_DONG chỉ để test. */
function tranDong() {
  const n = Number(process.env.KTT_XUAT_TRAN_DONG);
  return Number.isInteger(n) && n > 0 ? n : TRAN_DONG_MAC_DINH;
}

// ------------------------------------------
// Cột sheet 7 (thứ tự cố định)
// ------------------------------------------
const COT_SHEET7 = Object.freeze([
  { khoa: 'shbg', tieuDe: 'SHBG', rong: 22, loai: 'chu' },
  { khoa: 'duong_thu_ten', tieuDe: 'Đường thư đến (tên)', rong: 30, loai: 'chu' },
  { khoa: 'duong_thu_ma', tieuDe: 'Đường thư đến (mã)', rong: 16, loai: 'chu' },
  { khoa: 'gio_quet_tui_den', tieuDe: 'Giờ quét túi đến KTT', rong: 21, loai: 'gio' },
  { khoa: 'confirm_date', tieuDe: 'Giờ xác nhận BD10 đến (ConfirmDate)', rong: 24, loai: 'gio' },
  { khoa: 'kl_kg', tieuDe: 'KL (kg)', rong: 11, loai: 'kg' },
  { khoa: 'bcvh_ma', tieuDe: 'BCVH đích (mã)', rong: 14, loai: 'chu' },
  { khoa: 'bcvh_ten', tieuDe: 'BCVH đích (tên)', rong: 18, loai: 'chu' },
  { khoa: 'chuyen', tieuDe: 'Chuyến liền kề', rong: 30, loai: 'chu' },
  { khoa: 'gio_xuat_phat', tieuDe: 'Giờ xuất phát', rong: 21, loai: 'gio' },
  { khoa: 'han_den', tieuDe: 'Hàng đến muộn nhất để kịp chuyến', rong: 24, loai: 'gio' },
  { khoa: 'gio_lap_bd10_di', tieuDe: 'Giờ lập BD10 đi', rong: 21, loai: 'gio' },
  { khoa: 'gio_cho', tieuDe: 'Giờ chờ tính chỉ tiêu (giờ, bỏ 21:00–07:00)', rong: 20, loai: 'gio_so' },
  { khoa: 'dat', tieuDe: 'Đạt / không đạt chỉ tiêu 14 giờ', rong: 26, loai: 'chu' },
  { khoa: 'nhom', tieuDe: 'Phân loại', rong: 34, loai: 'chu' },
  { khoa: 'trang_thai', tieuDe: 'Trạng thái (1–5)', rong: 40, loai: 'chu' },
  { khoa: 'ngay_d', tieuDe: 'Ngày lưu thoát (ngày D)', rong: 16, loai: 'chu' }
]);
const VI_TRI = Object.freeze(Object.fromEntries(COT_SHEET7.map((c, i) => [c.khoa, i])));

const NHAN_TRANG_THAI = Object.freeze({
  T1: '1 – Đi trong ngày, đúng chuyến', T2: '2 – Đi trong ngày, trượt chuyến',
  T3: '3 – Đi hôm sau, đúng chuyến', T4: '4 – Đi hôm sau, trượt chuyến',
  T5: '5 – Từ 2 ngày hoặc chưa đi', DANG_CHO_CHUYEN: 'Đang chờ chuyến (chưa đến giờ xe rời KTT)'
});
const NHAN_LY_DO = Object.freeze({
  KHONG_CO_LICH: 'không có chuyến trong lịch', THIEU_GIO_DEN: 'thiếu giờ quét đến', GIO_DEN_SAI: 'giờ quét đến sai', KHONG_PHAI_BCVH_HUE: 'không phải BCVH Huế',
  GIO_BD10_SAI: 'giờ lập BD10 đi sai', CHUYEN_SAI: 'chuyến sai'
});
const NHAN_DAT = Object.freeze({
  [S.DAT.DAT]: 'Đạt', [S.DAT.KHONG_DAT]: 'Không đạt', [S.DAT.CHUA_DI]: 'Chưa đi (chưa quá chỉ tiêu)',
  [S.DAT.CHUA_DO_DUOC]: 'Chưa đo được (chưa có xác nhận đến)', [S.DAT.XND_SAU_GIO_DI]: 'Xác nhận đến sau giờ lập BD10 đi'
});
const LOAI_TRU = 'Loại trừ';
const KHONG_TINH = 'Không tính';

function nhanNhom(kq, loaiDich) {
  switch (kq.nhom) {
    case S.NHOM.HANG_HOAN: return 'Hàng hoàn Tổ KHHH';
    case S.NHOM.KHONG_RO_DICH: return 'Đích không rõ';
    case S.NHOM.NGOAI_PHAM_VI: return `Ngoài phạm vi (${loaiDich || 'khác'})`;
    case S.NHOM.KHONG_CO_GIO_QUET_DEN: return 'Thiếu giờ quét túi đến';
    case S.NHOM.KHONG_XEP_DUOC_CHUYEN: return `Không xếp được chuyến (${NHAN_LY_DO[kq.lyDo] || kq.lyDo || 'không rõ lý do'})`;
    default: return kq.trangThai === S.TRANG_THAI.DANG_CHO_CHUYEN ? 'Đang chờ chuyến' : 'Đã phân loại 5 trạng thái';
  }
}

const dd = (ngay) => `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}/${ngay.slice(0, 4)}`;

/** Một SHBG (u của kttQuery, kq của phanLoaiShbg) -> mảng ô theo COT_SHEET7. Chuỗi giờ giữ nguyên (đổi sang ô ngày giờ ở ghiXlsx). Thiếu dữ liệu -> null (ô trống). */
function dongSheet7(u, kq) {
  const d = kq.datKhongDat || null;
  const ch = kq.chuyen || null;
  const v = new Array(COT_SHEET7.length).fill(null);
  v[VI_TRI.shbg] = u.shbg;
  v[VI_TRI.duong_thu_ten] = u.duongThuDenTen || null;
  v[VI_TRI.duong_thu_ma] = u.duongThuDenMa || null;
  v[VI_TRI.gio_quet_tui_den] = u.quetDen || null;
  v[VI_TRI.confirm_date] = u.xndBd10 || null;
  v[VI_TRI.kl_kg] = typeof u.gam === 'number' && Number.isFinite(u.gam) ? u.gam / 1000 : null;
  v[VI_TRI.bcvh_ma] = u.maBcvh || null;
  v[VI_TRI.bcvh_ten] = u.maBcvh ? (TEN_BCVH.get(u.maBcvh) || null) : null;
  v[VI_TRI.chuyen] = ch ? `${TEN_BCVH.get(ch.ma_bcvh) || ch.ma_bcvh} ${ch.gio_xuat_phat} (${dd(ch.ngay)})` : null;
  v[VI_TRI.gio_xuat_phat] = ch ? ch.xuat_phat_luc : null;
  v[VI_TRI.han_den] = ch ? ch.han_den_luc : null;
  v[VI_TRI.gio_lap_bd10_di] = u.gioBd10Di || null;
  v[VI_TRI.gio_cho] = d && typeof d.thucGiay === 'number' ? d.thucGiay / 3600 : null;
  // Hàng hoàn: «Loại trừ». Không phân loại được (thiếu giờ quét đến / không xếp được chuyến): «Không tính» (không vào tổng đạt / không đạt của luu-thoat).
  v[VI_TRI.dat] = kq.nhom === S.NHOM.HANG_HOAN ? LOAI_TRU : (d ? (kq.trangThai ? NHAN_DAT[d.trangThai] || d.trangThai : KHONG_TINH) : null);
  v[VI_TRI.nhom] = nhanNhom(kq, u.nhom);
  v[VI_TRI.trang_thai] = kq.trangThai ? NHAN_TRANG_THAI[kq.trangThai] : null;
  v[VI_TRI.ngay_d] = u.ngayDen || null;
  return v;
}

/**
 * Tác vụ của worker: toàn bộ SHBG của khoảng ngày (không phân trang), lọc `nhom` (khóa của QL.NHOM_LUU_THOAT, null = tất cả).
 * opts: { tuNgay, denNgay, nhom?, bayGio, tranDong }. Trả { tong, vuotTran, dong } — `dong` chỉ giữ tối đa `tranDong` dòng, sắp theo (ngày D, SHBG).
 */
function xuatLuuThoat(db, opts) {
  const khop = opts.nhom ? QL.NHOM_LUU_THOAT[opts.nhom] : null;
  const tran = opts.tranDong || tranDong();
  const dong = [];
  let tong = 0;
  QL.duyetLuuThoat(db, { tuNgay: opts.tuNgay, denNgay: opts.denNgay, bayGio: opts.bayGio, khop }, (u, kq) => {
    tong++;
    if (dong.length < tran) dong.push(dongSheet7(u, kq));
  });
  const a = VI_TRI.ngay_d; const b = VI_TRI.shbg;
  dong.sort((x, y) => (x[a] < y[a] ? -1 : x[a] > y[a] ? 1 : x[b] < y[b] ? -1 : x[b] > y[b] ? 1 : 0));
  return { tong, vuotTran: tong > tran, dong };
}

/** Số SHBG của nhóm `nhom` (null = tất cả) theo kết quả luu-thoat (tong_cong) — con số mà màn hình Lưu thoát hiển thị, để đối chiếu với số dòng sheet 7. */
function soShbgTheoLuuThoat(luuThoat, nhom) {
  const tongCong = luuThoat && luuThoat.tong_cong;
  if (!tongCong) return 0;
  // tong_cong.khong_phan_loai chỉ có «không rõ đích» và «ngoài phạm vi»; hai nhóm còn lại cộng từ khối tổng của từng ngày.
  const tongNgay = (f) => luuThoat.theo_ngay.reduce((s, n) => s + f(n.tong.khong_phan_loai), 0);
  const tt = tongCong.trang_thai;
  const dk = tongCong.dat_khong_dat;
  const tongMap = (o) => Object.values(o || {}).reduce((a, x) => a + x, 0);
  if (!nhom) return tongCong.tong_shbg_ngay;
  switch (nhom) {
    case 't1': case 't2': case 't3': case 't4': case 't5': case 'dang_cho_chuyen': return tt[nhom].shbg;
    case 'hang_hoan': return tongCong.hang_hoan.tong_shbg;
    case 'dat': return dk.dat;
    case 'khong_dat': return dk.khong_dat;
    case 'chua_di': return dk.chua_di;
    case 'chua_do_duoc': return dk.chua_do_duoc;
    case 'xnd_sau_gio_di': return dk.xnd_sau_gio_di;
    case 'khong_ro_dich': return tongCong.khong_phan_loai.khong_ro_dich;
    case 'ngoai_pham_vi': return tongMap(tongCong.khong_phan_loai.ngoai_pham_vi);
    case 'khong_co_gio_quet_den': return tongNgay((k) => k.khong_co_gio_quet_den);
    case 'khong_xep_duoc_chuyen': return tongNgay((k) => tongMap(k.khong_xep_duoc_chuyen));
    default: return 0;
  }
}

// ------------------------------------------
// Sheet «Thông tin»
// ------------------------------------------
/** Giờ Việt Nam (UTC+7) 'YYYY-MM-DD HH:MM:SS' của một mốc thời gian (ms). Chỉ cộng 7 giờ rồi đọc theo UTC: không phụ thuộc múi giờ máy chủ. */
const gioVietNam = (ms) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

/**
 * ctx: { tu, den, nhom, luuThoat (kết quả /luu-thoat cùng khoảng), soDong, nguoiXuat, xuatLuc, hanPhut, gioChot }. Trả [[mục, nội dung], …].
 */
function dongThongTin(ctx) {
  const lt = ctx.luuThoat;
  const nguon = lt.nguon_xuat_luc_moi_nhat;
  const ngay = lt.theo_ngay.map((x) => `${dd(x.ngay)}: ${x.da_chot ? 'đã chốt' : 'số tạm'}`);
  const tatCaChot = lt.theo_ngay.length > 0 && lt.theo_ngay.every((x) => x.da_chot);
  const soManHinh = soShbgTheoLuuThoat(lt, ctx.nhom);
  const han = ctx.hanPhut;
  return [
    ['Cửa sổ', `Từ ngày ${dd(ctx.tu)} đến ngày ${dd(ctx.den)} (theo ngày D = ngày của giờ quét túi đến KTT). Bộ lọc trạng thái: ${ctx.nhom ? ctx.nhom : 'không (tất cả)'}.`],
    ['Dữ liệu đến', nguon ? `Dữ liệu nguồn xuất lúc ${nguon} (giờ Việt Nam).` : 'Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào).'],
    ['Chốt số theo ngày', ngay.join('; ') || '(không có ngày)'],
    ['Ngày xuất, người xuất', `${ctx.xuatLuc} (giờ Việt Nam); tài khoản: ${ctx.nguoiXuat || '(không rõ)'}.`],
    ['Trạng thái số liệu', tatCaChot ? 'Đã chốt: mọi ngày trong khoảng đã qua giờ chốt.' : `Số tạm: có ngày chưa chốt (ngày D chốt khi dữ liệu đến sau ${ctx.gioChot} ngày D+1).`],
    ['Định nghĩa: năm trạng thái', 'Mốc xếp chuyến = giờ quét túi đến KTT; «đã đi» = giờ lập BD10 đi; ngày D = ngày quét túi đến. 1 = Đi trong ngày (D), đúng chuyến; 2 = Đi trong ngày (D), trượt chuyến; 3 = Đi hôm sau (D+1), đúng chuyến; 4 = Đi hôm sau (D+1), trượt chuyến; 5 = Từ 2 ngày (đi từ D+2) hoặc chưa đi mà đã lỡ giờ xe rời KTT. Lưu thoát = trạng thái 1 + 2.'],
    ['Định nghĩa: đang chờ chuyến', 'Chưa lập BD10 đi và chưa đến giờ xe rời KTT của chuyến liền kề; không tính vào trạng thái 5 và không vào mẫu số.'],
    ['Định nghĩa: hàng hoàn Tổ KHHH', `Túi đến gốc có nơi gửi BD10 là ${S.MA_TO_KHHH} và đích là BCVH Thuận Hóa (${S.MA_THUAN_HOA}). Ghi «${LOAI_TRU}» ở cột đạt / không đạt, không vào tổng chỉ tiêu.`],
    ['Định nghĩa: cột đạt / không đạt', `«Đạt» và «Không đạt» là số đạt và không đạt của màn hình Lưu thoát. «${KHONG_TINH}» = hàng thiếu giờ quét túi đến hoặc không xếp được chuyến (không vào tổng). «${LOAI_TRU}» = hàng hoàn Tổ KHHH. Còn lại: Chưa đi, Chưa đo được, Xác nhận đến sau giờ lập BD10 đi (không tính đạt / không đạt).`],
    ['Định nghĩa: mốc chuyến và hạn đến', `Mốc chuyến = giờ xe rời KTT. Hạn đến = giờ xe rời KTT − ${han} phút (lấy từ cấu hình lịch chuyến). Hàng quét túi đến không muộn hơn hạn thì được xếp vào chuyến đó.`],
    ['Định nghĩa: hai mốc giờ đến', 'Giờ quét túi đến KTT dùng xếp chuyến và tính lưu thoát; giờ xác nhận BD10 đến (ConfirmDate) dùng tính đạt / không đạt chỉ tiêu (bỏ khung 21:00–07:00).'],
    ['Đơn vị', 'Mỗi dòng sheet «7 Hàng rớt lại» là một SHBG (số hiệu bưu gửi); khối lượng tính bằng kg.'],
    ['Số dòng kiểm tra', ctx.soDong],
    ['Đối chiếu với màn hình Lưu thoát', `Màn hình Lưu thoát cùng khoảng ngày và bộ lọc có ${soManHinh} SHBG${ctx.soDong === soManHinh ? ': khớp số dòng sheet «7 Hàng rớt lại».' : ': KHÔNG khớp số dòng sheet «7 Hàng rớt lại» (số liệu đang được cập nhật, hãy xuất lại).'}`]
  ];
}

// ------------------------------------------
// Ghi file
// ------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PENDING_HIGH_BYTES = 2 * 1024 * 1024;
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
/** Nhường vòng lặp sự kiện (request khác được phục vụ) và chờ bộ đệm vơi hoặc client ngắt. */
async function nhuongVaCho(sheetStream, out, dungChua) {
  await new Promise((r) => setImmediate(r));
  while (!dungChua() && pendingBytes(sheetStream, out) > PENDING_HIGH_BYTES) await sleep(5);
}

/** Chuỗi an toàn cho ô văn bản: bỏ ký tự cấm của XML, cắt ở giới hạn của ô; rỗng -> null. Luôn ghi là CHUỖI (không bao giờ là công thức), kể cả khi bắt đầu bằng = + - @. */
function vanBan(x) {
  if (x === null || x === undefined) return null;
  let s = String(x).replace(STRIP_XML_CTRL, '');
  if (s.length > CELL_MAX_CHARS) s = s.slice(0, CELL_MAX_CHARS);
  return s === '' ? null : s;
}
/** 'YYYY-MM-DD HH:MM:SS' -> Date mà các số UTC bằng đúng các số của chuỗi (ô hiển thị đúng giờ nguồn, không lệch múi giờ). Sai dạng -> chuỗi nguyên văn. */
function oGio(s) {
  const m = RE_GIO.exec(String(s));
  if (!m) return vanBan(s);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}

/**
 * Ghi file hai sheet vào `out` (response). thongTin: [[mục, nội dung]]; dong: mảng ô của sheet 7 (từ worker). dungChua(): true khi client đã ngắt -> huỷ file.
 * Trả { rows, aborted }.
 */
async function ghiXlsx(out, { thongTin, dong }, dungChua = () => false) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  const dam = { bold: true };

  const ws1 = wb.addWorksheet(TEN_SHEET_THONG_TIN, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws1.columns = [{ width: 32, style: { numFmt: '@', alignment: { vertical: 'top', wrapText: true } } }, { width: 110, style: { alignment: { vertical: 'top', wrapText: true } } }];
  const h1 = ws1.addRow(['Mục', 'Nội dung ghi trong sheet']);
  h1.eachCell((c) => { c.font = dam; c.numFmt = '@'; });
  h1.commit();
  for (const [muc, nd] of thongTin) {
    const r = ws1.addRow([vanBan(muc), typeof nd === 'number' ? nd : vanBan(nd)]);
    r.getCell(1).numFmt = '@'; r.getCell(1).font = dam;
    if (typeof nd !== 'number') r.getCell(2).numFmt = '@';
    r.commit();
  }
  ws1.commit();

  const ws = wb.addWorksheet(TEN_SHEET_7, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ws.columns = COT_SHEET7.map((c) => ({ key: c.khoa, width: c.rong }));
  const h = ws.addRow(COT_SHEET7.map((c) => c.tieuDe));
  h.eachCell((c) => { c.font = dam; c.numFmt = '@'; c.alignment = { wrapText: true, vertical: 'middle' }; });
  h.commit();

  let rows = 0;
  for (const v of dong) {
    if (rows % 1000 === 0 && dungChua()) { try { wb.zip.abort(); } catch (e) { /* đang đóng */ } return { rows, aborted: true }; }
    const gt = new Array(COT_SHEET7.length);
    for (let i = 0; i < COT_SHEET7.length; i++) {
      const x = v[i];
      const loai = COT_SHEET7[i].loai;
      gt[i] = x === null || x === undefined ? null : loai === 'gio' ? oGio(x) : (loai === 'kg' || loai === 'gio_so') ? x : vanBan(x);
    }
    const r = ws.addRow(gt);
    for (let i = 0; i < COT_SHEET7.length; i++) {
      if (gt[i] === null) continue;
      const loai = COT_SHEET7[i].loai;
      const c = r.getCell(i + 1);
      c.numFmt = loai === 'gio' ? FMT_GIO : loai === 'kg' ? '0.000' : loai === 'gio_so' ? '0.00' : '@';
    }
    r.commit();
    rows++;
    if (rows % 1000 === 0) await nhuongVaCho(ws.stream, out, dungChua);
  }
  ws.commit();
  await wb.commit();
  return { rows, aborted: false };
}

const tenFile = (tu, den) => `KTT_LuuThoat_${tu}_${den}.xlsx`;

module.exports = {
  TEN_SHEET_THONG_TIN, TEN_SHEET_7, COT_SHEET7, XLSX_MIME, TRAN_DONG_MAC_DINH, FMT_GIO,
  tranDong, dongSheet7, xuatLuuThoat, soShbgTheoLuuThoat, dongThongTin, gioVietNam, ghiXlsx, tenFile, vanBan, oGio
};
