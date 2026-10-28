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

const TEN_SHEET_THONG_TIN = 'Thông tin';
const TEN_SHEET_7 = '7 Hàng rớt lại';
const TRAN_DONG_MAC_DINH = 200000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CELL_MAX_CHARS = 32767;
const STRIP_XML_CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const RE_GIO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const FMT_GIO = 'dd/mm/yyyy hh:mm:ss';

/** Trần số dòng sheet 7; biến môi trường KTT_XUAT_TRAN_DONG chỉ để test. */
function tranDong() {
  const n = Number(process.env.KTT_XUAT_TRAN_DONG);
  return Number.isInteger(n) && n > 0 ? n : TRAN_DONG_MAC_DINH;
}

// ------------------------------------------
// Cột sheet 7 (thứ tự cố định)
// ------------------------------------------
const API_KHOA = Object.freeze({
  shbg: 'shbg', duong_thu_ten: 'duong_thu_den_ten', duong_thu_ma: 'duong_thu_den_ma', gio_quet_tui_den: 'gio_quet_tui_den', confirm_date: 'gio_xac_nhan_bd10_den', kl_kg: 'kg',
  bcvh_ma: 'ma_bcvh', bcvh_ten: 'ten_bcvh', chuyen: 'chuyen_lien_ke', gio_xuat_phat: 'gio_xuat_phat', han_den: 'han_den_muon_nhat', gio_lap_bd10_di: 'gio_lap_bd10_di',
  gio_cho: 'gio_cho_gio', moc_a: 'chi_tieu_14h_xnd', moc_b: 'chi_tieu_14h_quet_tui_den', nhom: 'phan_loai', trang_thai: 'trang_thai', ngay_d: 'ngay_luu_thoat'
}); // khoa cột sheet -> tên trường của kttDong.dongChiTiet / chi-tiet
const COT_GOC = ([
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
  // KTT-10c: cột «Đạt / không đạt» một mốc (dat_khong_dat) thay bằng HAI cột, mỗi cột một mốc đo (trường dat_khong_dat vẫn có trong chi-tiet)
  { khoa: 'moc_a', tieuDe: 'Chỉ tiêu 14 giờ – Mốc A (xác nhận BD10 đến → lập BD10 đi)', rong: 30, loai: 'chu' },
  { khoa: 'moc_b', tieuDe: 'Chỉ tiêu 14 giờ – Mốc B (quét túi đến KTT → lập BD10 đi)', rong: 30, loai: 'chu' },
  { khoa: 'nhom', tieuDe: 'Phân loại', rong: 34, loai: 'chu' },
  { khoa: 'trang_thai', tieuDe: 'Trạng thái (1–5)', rong: 40, loai: 'chu' },
  { khoa: 'ngay_d', tieuDe: 'Ngày lưu thoát (ngày D)', rong: 16, loai: 'chu' }
]);
const COT_SHEET7 = Object.freeze(COT_GOC.map((c) => Object.freeze({ ...c, api: API_KHOA[c.khoa] })));
const VI_TRI = Object.freeze(Object.fromEntries(COT_SHEET7.map((c, i) => [c.khoa, i])));

const D = require('./kttDong');
const { LOAI_TRU, KHONG_TINH, dd } = D;

/** Một SHBG (u của kttQuery, kq của phanLoaiShbg) -> mảng ô theo COT_SHEET7 (18 cột = các trường của kttDong.dongChiTiet trừ dat_khong_dat). Chuỗi giờ giữ nguyên (đổi sang ô ngày giờ ở ghiXlsx). */
function dongSheet7(u, kq) {
  const o = D.dongChiTiet(u, kq);
  return COT_SHEET7.map((c) => o[c.api]);
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
  QL.duyetLuuThoat(db, { tuNgay: opts.tuNgay, denNgay: opts.denNgay, bayGio: opts.bayGio, maBcvh: opts.maBcvh || null, nguon: opts.nguon || null, khop }, (u, kq) => {
    tong++;
    if (dong.length < tran) dong.push(dongSheet7(u, kq));
  });
  const a = VI_TRI.ngay_d; const b = VI_TRI.shbg;
  dong.sort((x, y) => (x[a] < y[a] ? -1 : x[a] > y[a] ? 1 : x[b] < y[b] ? -1 : x[b] > y[b] ? 1 : 0));
  return { tong, vuotTran: tong > tran, dong };
}

/**
 * Số SHBG mà màn hình Lưu thoát (kết quả /luu-thoat của cùng khoảng) cho ra ứng với bộ lọc { nhom, maBcvh, nguon } — để đối chiếu với số dòng sheet 7.
 * Trả null khi màn hình KHÔNG có con số tương ứng (ví dụ lọc theo nguồn mà không chọn trạng thái: nhóm nguồn chỉ gồm SHBG đã phân loại; lọc theo BCVH + nhóm `khong_ro_dich`…).
 */
function soKhop(luuThoat, { nhom = null, maBcvh = null, nguon = null } = {}) {
  const tongCong = luuThoat && luuThoat.tong_cong;
  if (!tongCong) return 0;
  const tongMap = (o) => Object.values(o || {}).reduce((a, x) => a + x, 0);
  const tongNgay = (f) => luuThoat.theo_ngay.reduce((s, n) => s + f(n.tong.khong_phan_loai), 0);
  if (nguon) {
    const g = (tongCong.theo_nguon || []).find((x) => x.ma === nguon);
    const b = g && maBcvh ? (g.theo_bcvh[maBcvh] || { shbg: 0, ro_lai: 0, truot_chuyen: 0, khong_dat: 0 }) : null;
    if (!g) return nhom && ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen', 'ro_lai', 'truot_chuyen', 'dat', 'khong_dat'].includes(nhom) ? 0 : null;
    switch (nhom) {
      case 't1': case 't2': case 't3': case 't4': case 't5': case 'dang_cho_chuyen': return maBcvh ? null : g.trang_thai[nhom].shbg;
      case 'ro_lai': return maBcvh ? b.ro_lai : g.ro_lai;
      case 'truot_chuyen': return maBcvh ? b.truot_chuyen : g.truot_chuyen;
      case 'khong_dat': return maBcvh ? b.khong_dat : g.dat_khong_dat.khong_dat;
      case 'dat': return maBcvh ? null : g.dat_khong_dat.dat;
      default: return null;
    }
  }
  const khoi = maBcvh ? tongCong.theo_bcvh[maBcvh] : tongCong;
  const hoan = !maBcvh || maBcvh === S.MA_THUAN_HOA ? tongCong.hang_hoan.tong_shbg : 0;
  const dk = khoi.dat_khong_dat;
  const kpl = khoi.khong_phan_loai || {};
  if (!nhom) return maBcvh ? khoi.tong_shbg + hoan : tongCong.tong_shbg_ngay;
  switch (nhom) {
    case 't1': case 't2': case 't3': case 't4': case 't5': case 'dang_cho_chuyen': return khoi.trang_thai[nhom].shbg;
    case 'ro_lai': return khoi.trang_thai.t3.shbg + khoi.trang_thai.t4.shbg + khoi.trang_thai.t5.shbg;
    case 'truot_chuyen': return khoi.dung_chuyen.truot_chuyen + khoi.dung_chuyen.lo_chuyen;
    case 'hang_hoan': return hoan;
    case 'dat': return dk.dat;
    case 'khong_dat': return dk.khong_dat;
    case 'chua_di': return dk.chua_di;
    case 'chua_do_duoc': return dk.chua_do_duoc;
    case 'xnd_sau_gio_di': return dk.xnd_sau_gio_di;
    case 'khong_ro_dich': return maBcvh ? null : tongCong.khong_phan_loai.khong_ro_dich;
    case 'ngoai_pham_vi': return maBcvh ? null : tongMap(tongCong.khong_phan_loai.ngoai_pham_vi);
    case 'khong_co_gio_quet_den': return maBcvh ? kpl.khong_co_gio_quet_den : tongNgay((k) => k.khong_co_gio_quet_den);
    case 'khong_xep_duoc_chuyen': return maBcvh ? tongMap(kpl.khong_xep_duoc_chuyen) : tongNgay((k) => tongMap(k.khong_xep_duoc_chuyen));
    default: return 0;
  }
}
/** Tương thích KTT-8b: chỉ lọc theo nhóm. */
const soShbgTheoLuuThoat = (luuThoat, nhom) => soKhop(luuThoat, { nhom: nhom || null }) ?? 0;

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
  const soManHinh = soKhop(lt, { nhom: ctx.nhom, maBcvh: ctx.maBcvh, nguon: ctx.nguon });
  const han = ctx.hanPhut;
  return [
    ['Cửa sổ', `Từ ngày ${dd(ctx.tu)} đến ngày ${dd(ctx.den)} (theo ngày D = ngày của giờ quét túi đến KTT). Bộ lọc trạng thái: ${ctx.nhom ? ctx.nhom : 'không (tất cả)'}; BCVH: ${ctx.maBcvh ? ctx.maBcvh : 'không (tất cả)'}; nguồn: ${ctx.nguon ? ctx.nguon : 'không (tất cả)'}.`],
    ['Dữ liệu đến', nguon ? `Dữ liệu nguồn xuất lúc ${nguon} (giờ Việt Nam).` : 'Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào).'],
    ['Chốt số theo ngày', ngay.join('; ') || '(không có ngày)'],
    ['Ngày xuất, người xuất', `${ctx.xuatLuc} (giờ Việt Nam); tài khoản: ${ctx.nguoiXuat || '(không rõ)'}.`],
    ['Trạng thái số liệu', tatCaChot ? 'Đã chốt: mọi ngày trong khoảng đã qua giờ chốt.' : `Số tạm: có ngày chưa chốt (ngày D chốt khi dữ liệu đến sau ${ctx.gioChot} ngày D+1).`],
    ['Định nghĩa: năm trạng thái', 'Mốc xếp chuyến = giờ quét túi đến KTT; «đã đi» = giờ lập BD10 đi; ngày D = ngày quét túi đến. 1 = Đi trong ngày (D), đúng chuyến; 2 = Đi trong ngày (D), trượt chuyến; 3 = Đi hôm sau (D+1), đúng chuyến; 4 = Đi hôm sau (D+1), trượt chuyến; 5 = Từ 2 ngày (đi từ D+2) hoặc chưa đi mà đã lỡ giờ xe rời KTT. Lưu thoát = trạng thái 1 + 2.'],
    ['Định nghĩa: đang chờ chuyến', 'Chưa lập BD10 đi và chưa đến giờ xe rời KTT của chuyến liền kề; không tính vào trạng thái 5 và không vào mẫu số.'],
    ['Định nghĩa: hàng hoàn Tổ KHHH', `Túi đến gốc có nơi gửi BD10 là ${S.MA_TO_KHHH} và đích là BCVH Thuận Hóa (${S.MA_THUAN_HOA}). Ghi «${LOAI_TRU}» ở cột đạt / không đạt, không vào tổng chỉ tiêu.`],
    ['Định nghĩa: chỉ tiêu 14 giờ (hai mốc)', `Đo song song hai mốc, cùng kết thúc ở giờ lập BD10 đi, bỏ khung 21:00–07:00. Mốc A = giờ xác nhận BD10 đến (ConfirmDate); Mốc B = giờ quét túi đến KTT. «Đo được» = đã lập BD10 đi và mốc không sau giờ đi (Đạt / Không đạt); «Không đo được» = thiếu mốc, mốc sau giờ lập BD10 đi, hoặc chưa đi. Mẫu số = SHBG đã phân loại (năm trạng thái + đang chờ chuyến). «${KHONG_TINH}» = hàng thiếu giờ quét túi đến hoặc không xếp được chuyến; «${LOAI_TRU}» = hàng hoàn Tổ KHHH (cả hai không vào mẫu số). Không có tỷ lệ «đạt» chung: chỉ ghi «đo được x/y» của từng mốc.`],
    ['Định nghĩa: mốc chuyến và hạn đến', `Mốc chuyến = giờ xe rời KTT. Hạn đến = giờ xe rời KTT − ${han} phút (lấy từ cấu hình lịch chuyến). Hàng quét túi đến không muộn hơn hạn thì được xếp vào chuyến đó.`],
    ['Định nghĩa: hai mốc giờ đến', 'Giờ quét túi đến KTT dùng xếp chuyến, tính lưu thoát và là mốc B của chỉ tiêu 14 giờ; giờ xác nhận BD10 đến (ConfirmDate) là mốc A của chỉ tiêu 14 giờ.'],
    ...dongChiTieu14h(lt, ctx.maBcvh),
    ['Đơn vị', 'Mỗi dòng sheet «7 Hàng rớt lại» là một SHBG (số hiệu bưu gửi); khối lượng tính bằng kg.'],
    ['Số dòng kiểm tra', ctx.soDong],
    ['Đối chiếu với màn hình Lưu thoát', soManHinh === null ? 'Màn hình Lưu thoát không có số tương ứng với bộ lọc này (bộ lọc theo nguồn / BCVH kết hợp với trạng thái chưa có ô riêng): không đối chiếu được.' : `Màn hình Lưu thoát cùng khoảng ngày và bộ lọc có ${soManHinh} SHBG${ctx.soDong === soManHinh ? ': khớp số dòng sheet «7 Hàng rớt lại».' : ': KHÔNG khớp số dòng sheet «7 Hàng rớt lại» (số liệu đang được cập nhật, hãy xuất lại).'}`]
  ];
}

/**
 * KTT-10c: ba dòng tổng hợp chỉ tiêu 14 giờ của sheet «Thông tin» (Mốc A, Mốc B, Không đo được) từ khối chi_tieu_14h của /luu-thoat cùng khoảng
 * (tổng 6 BCVH, hoặc BCVH đang lọc). Ghi «đo được x/y», KHÔNG ghi tỷ lệ «đạt» chung. Không theo bộ lọc trạng thái / nguồn (như màn hình Lưu thoát).
 */
function dongChiTieu14h(lt, maBcvh) {
  const tc = lt && lt.tong_cong;
  const k = tc ? (maBcvh ? tc.theo_bcvh[maBcvh] : tc) : null;
  const c = k && k.chi_tieu_14h;
  const pham = `${maBcvh ? `BCVH ${maBcvh}` : '6 BCVH'}, cả khoảng ngày, không theo bộ lọc trạng thái / nguồn`;
  if (!c) return [[NHAN_TONG_14H.a, 'Chưa có dữ liệu.'], [NHAN_TONG_14H.b, 'Chưa có dữ liệu.'], [NHAN_TONG_14H.k, 'Chưa có dữ liệu.']];
  const doDuoc = (m) => `Đo được ${m.do_duoc}/${m.mau_so}: đạt ${m.dat}, không đạt ${m.khong_dat} (${pham}).`;
  const khong = (m) => `${m.khong_do_duoc.tong} (thiếu mốc ${m.khong_do_duoc.thieu_moc}, mốc sau giờ lập BD10 đi ${m.khong_do_duoc.moc_sau_gio_di}, chưa đi ${m.khong_do_duoc.chua_di})`;
  const a = c.theo_moc.xnd; const b = c.theo_moc.quet_tui_den;
  return [
    [NHAN_TONG_14H.a, doDuoc(a)],
    [NHAN_TONG_14H.b, doDuoc(b)],
    [NHAN_TONG_14H.k, `Mốc A: ${khong(a)}; Mốc B: ${khong(b)}. Đo được + không đo được = mẫu số ${c.mau_so} ở mỗi mốc.`]
  ];
}
const NHAN_TONG_14H = Object.freeze({ a: 'Chỉ tiêu 14 giờ – Mốc A (xác nhận BD10 đến → lập BD10 đi)', b: 'Chỉ tiêu 14 giờ – Mốc B (quét túi đến KTT → lập BD10 đi)', k: 'Chỉ tiêu 14 giờ – Không đo được' });

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
  NHAN_TONG_14H, tranDong, dongSheet7, xuatLuuThoat, soShbgTheoLuuThoat, soKhop, dongThongTin, dongChiTieu14h, gioVietNam, ghiXlsx, tenFile, vanBan, oGio
};
