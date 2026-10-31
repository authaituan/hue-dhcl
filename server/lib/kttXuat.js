// ==========================================
// «Hàng tại KTT» (KTT-8b, KTT-8d): XUẤT xlsx — sheet 7 «Hàng rớt lại / Lưu thoát» hoặc sheet 8 «Hôm sau / chưa đi trên 24 giờ», mỗi file kèm sheet «Thông tin». CHỈ ĐỌC DB.
// Sheet 7 = CÙNG lượt duyệt với /api/ktt/chi-tiet (kttLuuThoatQuery.duyetLuuThoat → kttLuuThoat.phanLoaiShbg); sheet 8 = CÙNG lượt duyệt và cùng dòng với /api/ktt/danh-sach
// (kttDiNgayQuery.duyetDanhSach → dongDanhSach), nên số dòng = số trong ô B5 / bảng rớt lại đã bấm. KHÔNG tự tính quy tắc nào.
// Hai phần:
//   - xuatLuuThoat / xuatHomSauChuaDi(db, opts): chạy ở worker (kttWorker.js) — liệt kê TOÀN BỘ SHBG, trả mỗi dòng là mảng ô (chuỗi / số / null) theo đúng thứ tự COT_SHEET7 / COT_SHEET8;
//   - ghiXlsx(out, ...): ghi luồng (ExcelJS WorkbookWriter) hai sheet, có nhường vòng lặp và chờ khi bộ đệm đầy.
// Giờ nghiệp vụ là chuỗi 'YYYY-MM-DD HH:MM:SS' giờ VN; khi ghi ô ngày giờ tách số bằng biểu thức chính quy rồi Date.UTC(số) (KHÔNG new Date(chuỗi) / Date.parse), ô hiển thị
// đúng số giờ nguồn ở mọi múi giờ của máy chủ. Tài liệu: docs/ai/42_KTT_API.md mục 10.
// ==========================================
'use strict';
const ExcelJS = require('exceljs');
const QL = require('./kttLuuThoatQuery');
const S = require('./kttLuuThoat');
const L = require('./kttLichChuyen');
const DQ = require('./kttDiNgayQuery');
const NG = require('./kttNguon');

const TEN_SHEET_THONG_TIN = 'Thông tin';
const TEN_SHEET_7 = '7 Hàng rớt lại';
const TEN_SHEET_8 = '8 Hôm sau-chưa đi';
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

// ------------------------------------------
// Sheet 8 «Hôm sau / chưa đi trên 24 giờ» (KTT-8d): cột lấy từ dòng của /danh-sach (kttDiNgayQuery.dongDanhSach), thứ tự cố định
// ------------------------------------------
const NHAN_NHOM_8 = Object.freeze({ hom_sau: 'Hôm sau', chua_di_tren_24h: 'Chưa đi trên 24 giờ' });
const NHAN_HUONG_8 = Object.freeze({ lien_tinh_den_bcvh: 'Liên tỉnh (xe Cấp 1) → 6 BCVH Huế', noi_tinh_den_bcvh: 'Nội tỉnh → 6 BCVH Huế', noi_tinh_di_lien_tinh: 'Nội tỉnh → đi liên tỉnh (xe Cấp 1)' });
const COT_SHEET8 = Object.freeze([
  { api: 'shbg', tieuDe: 'SHBG', rong: 22, loai: 'chu' },
  { api: 'duong_thu_ten', tieuDe: 'Đường thư đến (tên)', rong: 30, loai: 'chu' },
  { api: 'duong_thu_ma', tieuDe: 'Đường thư đến (mã)', rong: 16, loai: 'chu' },
  { api: 'noi_gui_ma', tieuDe: 'Nơi gửi BD10 đến (mã)', rong: 14, loai: 'chu' },
  { api: 'noi_gui_ten', tieuDe: 'Nơi gửi BD10 đến (tên)', rong: 24, loai: 'chu' },
  { api: 'gio_den_ktt', tieuDe: 'Giờ đến KTT (quét túi đến)', rong: 21, loai: 'gio' },
  { api: 'kg', tieuDe: 'KL (kg)', rong: 11, loai: 'kg' },
  { api: 'ma_bcvh', tieuDe: 'BCVH đích (mã)', rong: 14, loai: 'chu' },
  { api: 'ten_bcvh', tieuDe: 'BCVH đích (tên)', rong: 18, loai: 'chu' },
  { api: 'bd10_di_gio_lap', tieuDe: 'Giờ lập BD10 đi', rong: 21, loai: 'gio' },
  { api: 'cho_gio', tieuDe: 'Số giờ chờ (giờ đồng hồ, đến lúc lập BD10 đi hoặc đến độ mới dữ liệu)', rong: 24, loai: 'gio_so', fmt: '0.0' },
  { api: 'nhom', tieuDe: 'Nhóm', rong: 20, loai: 'chu' },
  { api: 'huong', tieuDe: 'Hướng', rong: 32, loai: 'chu' },
  { api: 'hang_hoan', tieuDe: 'Hàng hoàn Tổ KHHH', rong: 12, loai: 'chu' },
  { api: 'ngay_den', tieuDe: 'Ngày đến KTT (ngày D)', rong: 14, loai: 'chu' }
].map((c) => Object.freeze(c)));
const VI_TRI_8 = Object.freeze(Object.fromEntries(COT_SHEET8.map((c, i) => [c.api, i])));

/** Một dòng của /danh-sach -> mảng ô theo COT_SHEET8 (nhóm, hướng, hàng hoàn ra chữ; còn lại giữ nguyên). */
function dongSheet8(o) {
  return COT_SHEET8.map((c) => {
    const x = o[c.api];
    if (c.api === 'nhom') return NHAN_NHOM_8[x] || x;
    if (c.api === 'huong') return NHAN_HUONG_8[x] || x;
    if (c.api === 'hang_hoan') return x ? 'Có' : 'Không';
    return x === undefined ? null : x;
  });
}

/**
 * Tác vụ worker sheet 8: TOÀN BỘ SHBG của một ô (không phân trang). opts: { tuNgay, denNgay, loai, duongThu?, noiGui?, huong?, hangHoan?, maBcvh?, bayGio, tranDong }.
 * Trả { tong, vuotTran, dong } — `tong` = pagination.total của /danh-sach cùng tham số; `dong` giữ tối đa `tranDong` dòng, sắp theo (ngày D, SHBG).
 */
function xuatHomSauChuaDi(db, opts) {
  const loc = DQ.boLocDanhSach(opts);
  const tran = opts.tranDong || tranDong();
  const bayGioGiay = L.giayCua(opts.bayGio);
  const dong = [];
  let tong = 0;
  DQ.duyetDanhSach(db, { tuNgay: opts.tuNgay, denNgay: opts.denNgay, bayGio: opts.bayGio }, loc, (u, pl) => {
    tong++;
    if (dong.length < tran) dong.push(dongSheet8(DQ.dongDanhSach(u, pl, bayGioGiay)));
  });
  const a = VI_TRI_8.ngay_den; const b = VI_TRI_8.shbg;
  dong.sort((x, y) => (x[a] < y[a] ? -1 : x[a] > y[a] ? 1 : x[b] < y[b] ? -1 : x[b] > y[b] ? 1 : 0));
  return { tong, vuotTran: tong > tran, dong };
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
  const hoan = maBcvh ? khoi.tong_shbg_ngay - khoi.tong_shbg : tongCong.hang_hoan.tong_shbg; // KTT-17-2: hàng hoàn của BCVH đó (có ở cả 6 BCVH)
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
  const coDl = lt.theo_ngay.filter((x) => x.co_du_lieu).map((x) => x.ngay);
  return [
    ['Cửa sổ', `Từ ngày ${dd(ctx.tu)} đến ngày ${dd(ctx.den)} (sheet «${TEN_SHEET_7}», theo ngày D = ngày của giờ quét túi đến KTT). ${cuaSoThucTe(coDl[0], coDl[coDl.length - 1], coDl.length)} Bộ lọc trạng thái: ${ctx.nhom ? ctx.nhom : 'không (tất cả)'}; BCVH: ${ctx.maBcvh ? ctx.maBcvh : 'không (tất cả)'}; nguồn: ${ctx.nguon ? ctx.nguon : 'không (tất cả)'}.`],
    ['Dữ liệu đến', nguon ? `Dữ liệu nguồn xuất lúc ${nguon} (giờ Việt Nam).` : 'Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào).'],
    ['Chốt số theo ngày', ngay.join('; ') || '(không có ngày)'],
    ['Ngày xuất, người xuất', `${ctx.xuatLuc} (giờ Việt Nam); tài khoản: ${ctx.nguoiXuat || '(không rõ)'}.`],
    ['Trạng thái số liệu', tatCaChot ? 'Đã chốt: mọi ngày trong khoảng đã qua giờ chốt.' : `Số tạm: có ngày chưa chốt (ngày D chốt khi dữ liệu đến sau ${ctx.gioChot} ngày D+1).`],
    ['Phạm vi bưu gửi', 'Mỗi SHBG tính MỘT lần. Gồm bưu gửi khai thác lại (có túi đến được mở) và bưu gửi chỉ có túi chuyển tiếp đi (KTT không mở túi; đi ngoài hoặc túi chia sẵn). SHBG có cả hai loại túi tính theo túi đến. Cờ nguồn: trường nguon_hang của API chi-tiet (khai_thac | chuyen_tiep).'],
    ['Định nghĩa: năm trạng thái', 'Mốc xếp chuyến = giờ quét túi đến KTT; «đã đi» = giờ lập BD10 đi; ngày D = ngày quét túi đến. 1 = Đi trong ngày (D), đúng chuyến; 2 = Đi trong ngày (D), trượt chuyến; 3 = Đi hôm sau (D+1), đúng chuyến; 4 = Đi hôm sau (D+1), trượt chuyến; 5 = Từ 2 ngày (đi từ D+2) hoặc chưa đi mà đã lỡ giờ xe rời KTT. Lưu thoát = trạng thái 1 + 2.'],
    ['Định nghĩa: đang chờ chuyến', 'Chưa lập BD10 đi và chưa đến giờ xe rời KTT của chuyến liền kề; không tính vào trạng thái 5 và không vào mẫu số.'],
    ['Định nghĩa: hàng hoàn', `SHBG có trong danh sách hàng hoàn (ItemReturn của CSDL BCCP, nạp riêng) và đích là một trong 6 BCVH Huế; không xét nơi gửi gốc. Ghi «${LOAI_TRU}» ở cột đạt / không đạt, không vào tổng chỉ tiêu.`],
    ['Định nghĩa: chỉ tiêu 14 giờ (hai mốc)', `Đo song song hai mốc, cùng kết thúc ở giờ lập BD10 đi, bỏ khung 21:00–07:00. Mốc A = giờ xác nhận BD10 đến (ConfirmDate); Mốc B = giờ quét túi đến KTT. «Đo được» = đã lập BD10 đi và mốc không sau giờ đi (Đạt / Không đạt); «Không đo được» = thiếu mốc, mốc sau giờ lập BD10 đi, hoặc chưa đi. Mẫu số = SHBG đã phân loại (năm trạng thái + đang chờ chuyến). «${KHONG_TINH}» = hàng thiếu giờ quét túi đến hoặc không xếp được chuyến; «${LOAI_TRU}» = hàng hoàn (cả hai không vào mẫu số). Không có tỷ lệ «đạt» chung: chỉ ghi «đo được x/y» của từng mốc.`],
    ['Định nghĩa: mốc chuyến và hạn đến', `Mốc chuyến = giờ xe rời KTT. Hạn đến = giờ xe rời KTT − ${han} phút (lấy từ cấu hình lịch chuyến). Hàng quét túi đến không muộn hơn hạn thì được xếp vào chuyến đó.`],
    ['Định nghĩa: hai mốc giờ đến', 'Giờ quét túi đến KTT dùng xếp chuyến, tính lưu thoát và là mốc B của chỉ tiêu 14 giờ; giờ xác nhận BD10 đến (ConfirmDate) là mốc A của chỉ tiêu 14 giờ.'],
    ...dongChiTieu14h(lt, ctx.maBcvh),
    ...dinhNghiaChung(han),
    ['Đơn vị', `Sheet «${TEN_SHEET_THONG_TIN}»: mỗi dòng một mục mô tả. Sheet «${TEN_SHEET_7}»: mỗi dòng là một SHBG (số hiệu bưu gửi); khối lượng tính bằng kg.`],
    ['Số dòng kiểm tra', ctx.soDong],
    ['Đối chiếu với màn hình Lưu thoát', soManHinh === null ? 'Màn hình Lưu thoát không có số tương ứng với bộ lọc này (bộ lọc theo nguồn / BCVH kết hợp với trạng thái chưa có ô riêng): không đối chiếu được.' : `Màn hình Lưu thoát cùng khoảng ngày và bộ lọc có ${soManHinh} SHBG${ctx.soDong === soManHinh ? ': khớp số dòng sheet «7 Hàng rớt lại».' : ': KHÔNG khớp số dòng sheet «7 Hàng rớt lại» (số liệu đang được cập nhật, hãy xuất lại).'}`]
  ];
}

/** Câu «cửa sổ thực tế» (ngày đầu / cuối có dữ liệu trong khoảng yêu cầu). */
const cuaSoThucTe = (dau, cuoi, n) => (dau ? `Ngày có dữ liệu thực tế: ${dd(dau)} – ${dd(cuoi)} (${n} ngày).` : 'Không có ngày nào có dữ liệu trong khoảng này.');

/** KTT-8d: định nghĩa nhóm dùng chung cho sheet «Thông tin» của mọi file xuất (cùng câu chữ với DINH_NGHIA_B của API B và docs/ai/43). */
function dinhNghiaChung(hanPhut) {
  return [
    ['Định nghĩa: rớt lại', 'Rớt lại = không đi cùng ngày đến KTT = hôm sau + từ 2 ngày + chưa đi (= trạng thái 3 + 4 + 5); không tính hàng «đang chờ chuyến». «Cùng ngày» = BD10 đi lập trước 24:00 ngày D.'],
    ['Định nghĩa: hôm sau', 'BD10 đi lập trong ngày D+1 (đích 6 BCVH Huế: = trạng thái 3 + 4; hướng nội tỉnh đi liên tỉnh: so ngày lập BD10 đi với ngày D).'],
    ['Định nghĩa: chưa đi trên 24 giờ', 'Chưa có BD10 đi VÀ (độ mới dữ liệu − giờ quét túi đến KTT) > 24 giờ đồng hồ liên tục (không bỏ khung 21:00–07:00). Hướng nội tỉnh đi liên tỉnh thiếu giờ quét túi đến thì tính từ giờ xác nhận BD10 đến. Chưa đi ≤ 24 giờ là nhóm «chưa đi dưới 24 giờ».'],
    ['Định nghĩa: xe Cấp 1', 'Xe Cấp 1 = BD10 đến có nơi gửi KHÔNG bắt đầu bằng 53 (hàng tỉnh khác về KTT), và xe đưa hàng nội tỉnh đi tỉnh khác.'],
    ['Định nghĩa: chuyến liền kề', `Chuyến đầu tiên của BCVH đích (theo lịch chuyến) có hạn đến = giờ xe rời KTT − ${hanPhut} phút không sớm hơn giờ quét túi đến KTT. Lập BD10 đi không muộn hơn giờ xe rời KTT của chuyến này = đúng chuyến, muộn hơn = trượt chuyến.`]
  ];
}

/**
 * KTT-8d: sheet «Thông tin» của file sheet 8. ctx: { tu, den, loai ('hom-sau' | 'chua-di-24h'), loc (DQ.boLocDanhSach), b ({ doMoi, ds, m } bó B cùng khoảng), soDong, soManHinh (D.soOManHinh, null = không có ô),
 * nguoiXuat, xuatLuc, hanPhut, gioChot }. Trả [[mục, nội dung], …].
 */
function dongThongTin8(ctx) {
  const { b, loc } = ctx;
  const nguon = b.doMoi ? b.doMoi.nguon_xuat_luc : null;
  const ngay = b.ds.map((x) => `${dd(x.ngay)}: ${x.da_chot ? 'đã chốt' : 'số tạm'}`);
  const tatCaChot = b.ds.length > 0 && b.ds.every((x) => x.da_chot);
  const nhan = (v, f = (x) => x) => (v === null ? 'không (tất cả)' : f(v));
  const nhanMa = (v) => nhan(v, (x) => (x === NG.MA_LOC_RONG ? '(không có mã)' : x));
  const o = `nhóm «${NHAN_NHOM_8[loc.nhomCan]}»; đường thư đến: ${nhanMa(loc.duongThu)}; nơi gửi BD10 đến: ${nhanMa(loc.noiGui)}; hướng: ${nhan(loc.huong, (h) => NHAN_HUONG_8[h] || h)}; hàng hoàn Tổ KHHH: ${nhan(loc.hangHoan, (h) => (h ? 'chỉ hàng hoàn' : 'không kể hàng hoàn'))}; BCVH: ${nhan(loc.maBcvh)}`;
  const sm = ctx.soManHinh;
  return [
    ['Cửa sổ', `Từ ngày ${dd(ctx.tu)} đến ngày ${dd(ctx.den)} (sheet «${TEN_SHEET_8}», theo ngày D = ngày của giờ quét túi đến KTT). ${cuaSoThucTe(b.m.ngay_dau, b.m.ngay_cuoi, b.m.so_ngay_co_du_lieu || 0)} Ô đã bấm: ${o}.`],
    ['Dữ liệu đến', nguon ? `Dữ liệu nguồn xuất lúc ${nguon} (giờ Việt Nam). «Chưa đi» và số giờ chờ tính đến mốc này.` : 'Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào).'],
    ['Chốt số theo ngày', ngay.join('; ') || '(không có ngày)'],
    ['Ngày xuất, người xuất', `${ctx.xuatLuc} (giờ Việt Nam); tài khoản: ${ctx.nguoiXuat || '(không rõ)'}.`],
    ['Trạng thái số liệu', tatCaChot ? 'Đã chốt: mọi ngày trong khoảng đã qua giờ chốt.' : `Số tạm: có ngày chưa chốt (ngày D chốt khi dữ liệu đến sau ${ctx.gioChot} ngày D+1). Nhóm «chưa đi trên 24 giờ» còn đổi khi có dữ liệu mới.`],
    ['Phạm vi bưu gửi', 'Mỗi SHBG tính MỘT lần. Gồm bưu gửi khai thác lại (có túi đến được mở) và bưu gửi chỉ có túi chuyển tiếp đi. Ba hướng của trang B: liên tỉnh (xe Cấp 1) → 6 BCVH Huế, nội tỉnh → 6 BCVH Huế (hàng hoàn tách riêng, mọi nơi gửi), nội tỉnh → đi liên tỉnh (xe Cấp 1).'],
    ['Định nghĩa: năm nhóm đi', 'Cùng ngày · hôm sau · từ 2 ngày (đã đi từ D+2) · chưa đi dưới 24 giờ · chưa đi trên 24 giờ. Mẫu số tỷ lệ = tổng năm nhóm; «đang chờ chuyến» và «không phân loại» (thiếu giờ quét túi đến / không xếp được chuyến) ngoài mẫu số.'],
    ...dinhNghiaChung(ctx.hanPhut),
    ['Định nghĩa: hàng hoàn', `SHBG có trong danh sách hàng hoàn (ItemReturn của CSDL BCCP, nạp riêng) và đích là một trong 6 BCVH Huế; không xét nơi gửi gốc. Dòng «Hoàn» riêng ở B5 (theo nơi gửi), không cộng vào tổng và tỷ lệ.`],
    ['Định nghĩa: số giờ chờ', 'Giờ đồng hồ (1 chữ số thập phân) từ giờ quét túi đến KTT (thiếu thì giờ xác nhận BD10 đến) tới giờ lập BD10 đi; chưa đi thì tới độ mới dữ liệu. KHÔNG phải giờ chờ tính chỉ tiêu 14 giờ (không bỏ khung đêm).'],
    ['Đơn vị', `Sheet «${TEN_SHEET_THONG_TIN}»: mỗi dòng một mục mô tả. Sheet «${TEN_SHEET_8}»: mỗi dòng là một SHBG (số hiệu bưu gửi) của ô đã bấm; khối lượng tính bằng kg.`],
    ['Số dòng kiểm tra', ctx.soDong],
    ['Đối chiếu với màn hình B', sm === null ? 'Màn hình B không có ô tương ứng với bộ lọc này (lọc theo BCVH): không đối chiếu được.' : `Ô tương ứng trên màn hình B (B5 / bảng rớt lại / B1) cùng khoảng ngày có ${sm} SHBG${ctx.soDong === sm ? `: khớp số dòng sheet «${TEN_SHEET_8}».` : `: KHÔNG khớp số dòng sheet «${TEN_SHEET_8}» (số liệu đang được cập nhật, hãy xuất lại).`}`]
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
async function ghiXlsx(out, { thongTin, dong, sheet = 7 }, dungChua = () => false) {
  const COT = sheet === 8 ? COT_SHEET8 : COT_SHEET7; // KTT-8d: sheet 8 cùng cách ghi, khác cột / tên sheet
  const TEN = sheet === 8 ? TEN_SHEET_8 : TEN_SHEET_7;
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

  const ws = wb.addWorksheet(TEN, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ws.columns = COT.map((c) => ({ key: c.khoa || c.api, width: c.rong }));
  const h = ws.addRow(COT.map((c) => c.tieuDe));
  h.eachCell((c) => { c.font = dam; c.numFmt = '@'; c.alignment = { wrapText: true, vertical: 'middle' }; });
  h.commit();

  let rows = 0;
  for (const v of dong) {
    if (rows % 1000 === 0 && dungChua()) { try { wb.zip.abort(); } catch (e) { /* đang đóng */ } return { rows, aborted: true }; }
    const gt = new Array(COT.length);
    for (let i = 0; i < COT.length; i++) {
      const x = v[i];
      const loai = COT[i].loai;
      gt[i] = x === null || x === undefined ? null : loai === 'gio' ? oGio(x) : (loai === 'kg' || loai === 'gio_so') ? x : vanBan(x);
    }
    const r = ws.addRow(gt);
    for (let i = 0; i < COT.length; i++) {
      if (gt[i] === null) continue;
      const loai = COT[i].loai;
      const c = r.getCell(i + 1);
      c.numFmt = COT[i].fmt || (loai === 'gio' ? FMT_GIO : loai === 'kg' ? '0.000' : loai === 'gio_so' ? '0.00' : '@');
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
/** KTT-8d: tên file sheet 8 — loai ở dạng tham số (hom-sau | chua-di-24h). */
const tenFile8 = (tu, den, loai) => `KTT_HomSauChuaDi_${loai}_${tu}_${den}.xlsx`;

module.exports = {
  TEN_SHEET_THONG_TIN, TEN_SHEET_7, TEN_SHEET_8, COT_SHEET7, COT_SHEET8, NHAN_NHOM_8, NHAN_HUONG_8, XLSX_MIME, TRAN_DONG_MAC_DINH, FMT_GIO,
  NHAN_TONG_14H, tranDong, dongSheet7, xuatLuuThoat, soShbgTheoLuuThoat, soKhop, dongThongTin, dongChiTieu14h, gioVietNam, ghiXlsx, tenFile, vanBan, oGio,
  dongSheet8, xuatHomSauChuaDi, dongThongTin8, dinhNghiaChung, tenFile8
};
