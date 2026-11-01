// ==========================================
// «Đối chiếu với Hàng đến BCVH» (KTT-16-4): XUẤT xlsx sheet 1–6 của trang Đối chiếu. CHỈ ĐỌC DB. Mỗi file = sheet «Thông tin» + một sheet dữ liệu (ghi bằng kttXuat.ghiXlsx).
// Nguồn số liệu = CHÍNH bó ngày của /tong-hop, /thoi-gian-nhan, /chua-thay (kttDoiChieu.js), nên số dòng mỗi sheet = số hiển thị ở API tương ứng:
//   1 «Chưa thấy ở đâu»       = tong_cong.tap_chinh.chua_thay của tong-hop (= nguon_chua_thay.thanh_1.tong của chua-thay)    — duyệt lại SHBG theo ngày (worker)
//   2 «Chuyến mất dấu»        = Σ so_chua_thay của chuyen_mat_dau.danh_sach (chua-thay; cả MAT_DAU_CHAC lẫn NGHI_THIEU_FILE)  — duyệt lại SHBG theo ngày (worker)
//   3 «Chuyển tiếp chưa quét đi» = ghepChuyenTiepChuaQuet.tong                                                              — duyệt lại SHBG theo ngày (worker)
//   4 «Thấy ở BCVH khác»      = tong_cong.tap_chinh.bcvh_khac của tong-hop                                                  — duyệt lại SHBG theo ngày (worker)
//   5 «Chuyến chậm»           = ghepChuyenCham.so_chuyen_cham (từ bó đã cache: histogram thời gian nhận theo chuyến, KHÔNG cần duyệt SHBG)
//   6 «Đã có tại đích»        = số ngày × số BCVH của yêu cầu (từ ghepTongHop)
// Sheet 1–4 duyệt lại SHBG TỪNG NGÀY bằng đúng bộ thu thập của bó (kttDoiChieu.boThuThap chế độ lietKe) rồi chọn dòng bằng cùng quy tắc cửa sổ / cờ của hàm ghép; danh sách SHBG không bao giờ vào cache.
// Giờ nghiệp vụ là chuỗi giờ VN; ghi ô bằng kttXuat.oGio (không phụ thuộc múi giờ máy chủ). Tài liệu: docs/ai/44_KTT_DO_PHU_BCVH.md mục 10.
// ==========================================
'use strict';
const DC = require('./kttDoiChieu');
const DQ = require('./kttDiNgayQuery');
const L = require('./kttLichChuyen');
const X = require('./kttXuat');
const { dd } = require('./kttDong');
const { MA_BCVH_HUE } = require('./kttTinh');

const NHAN_NGUON = Object.freeze({
  KDN_DA_XAC_NHAN: 'Kiện đi ngoài', KDN_CHUA_XAC_NHAN: 'Kiện đi ngoài', TUI_CHUYEN_TIEP_DA_CHIA_SAN: 'Túi chuyển tiếp đã chia sẵn',
  TUI_CHUA_QUET_DI: 'Túi khai thác đến chưa quét đi', KHAC: 'Khác'
});
const NHAN_LOAI_MAT_DAU = Object.freeze({ MAT_DAU_CHAC: 'Mất dấu chắc chắn', NGHI_THIEU_FILE: 'Nghi ngờ thiếu file dữ liệu của BCVH' });
const THU = Object.freeze(['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']);
const tenBcvh = (ma) => (ma ? (DQ.TEN_BCVH[ma] || null) : null);
const coKhong = (b) => (b ? 'Có' : 'Không');
/** Thứ trong tuần của ngày lịch 'YYYY-MM-DD' (hoặc đầu chuỗi giờ). Không đọc được -> null. Không phụ thuộc múi giờ máy chủ. */
function thuCua(chuoi) {
  const g = typeof chuoi === 'string' ? L.giayCua(`${chuoi.slice(0, 10)} 00:00:00`) : null;
  return g === null ? null : new Date(g * 1000).getUTCDay();
}
const laChuNhat = (chuoi) => thuCua(chuoi) === 0;

// ------------------------------------------
// Cột (thứ tự cố định; khoa = khóa ô). loai: chu | gio | gio_so | so | ty_le (xem kttXuat.ghiXlsx)
// ------------------------------------------
const cot = (khoa, tieuDe, rong, loai = 'chu', fmt = null) => Object.freeze({ khoa, tieuDe, rong, loai, ...(fmt ? { fmt } : {}) });
const SHEET = Object.freeze({
  1: Object.freeze({
    ten: '1 Chưa thấy ở đâu', tenFile: 'ChuaThayODau', route: 'chua-thay',
    cot: Object.freeze([
      cot('shbg', 'SHBG', 22), cot('ma_bcvh', 'BCVH đích (mã)', 14), cot('ten_bcvh', 'BCVH đích (tên)', 18),
      cot('gio_ktt', 'Giờ KTT nhận (quét túi đến; thiếu thì xác nhận BD10 đến)', 26, 'gio'),
      cot('bd8', 'Số hiệu BD8 (túi / kiện)', 24), cot('bd10_den', 'BD10 túi đến', 24),
      cot('nguon', 'Nguồn', 30), cot('ly_do', 'Lý do thiếu trạng thái', 44), cot('ngay_den', 'Ngày đến KTT (ngày D)', 14),
      cot('tuoi_gio', 'Tuổi (giờ, đến độ mới dữ liệu KTT)', 18, 'gio_so', '0.0'), cot('nghi', 'Có thể do BCVH thiếu dữ liệu', 14)
    ])
  }),
  2: Object.freeze({
    ten: '2 Chuyến mất dấu', tenFile: 'ChuyenMatDau', route: 'chuyen-mat-dau',
    cot: Object.freeze([
      cot('shbg', 'SHBG', 22), cot('ma_bcvh', 'BCVH đích (mã)', 14), cot('ten_bcvh', 'BCVH đích (tên)', 18), cot('ma_bd10', 'Mã chuyến (BD10 đi)', 24),
      cot('gio_lap', 'Giờ lập BD10 đi', 21, 'gio'), cot('thu', 'Ngày trong tuần', 14), cot('chu_nhat', 'Chủ nhật', 11), cot('loai', 'Loại', 20)
    ])
  }),
  3: Object.freeze({
    ten: '3 Chuyển tiếp chưa quét đi', tenFile: 'ChuyenTiepChuaQuetDi', route: 'chuyen-tiep-chua-quet-di',
    cot: Object.freeze([
      cot('shbg', 'SHBG', 22), cot('ma_bcvh', 'BCVH đích (mã)', 14), cot('ten_bcvh', 'BCVH đích (tên)', 18),
      cot('gio_chuyen_tiep', 'Giờ chuyển tiếp (quét túi đến; thiếu thì xác nhận BD10 đến)', 26, 'gio'), cot('loai_dich', 'Loại đích', 26)
    ])
  }),
  4: Object.freeze({
    ten: '4 Thấy ở BCVH khác', tenFile: 'ThayOBcvhKhac', route: 'thay-o-bcvh-khac',
    cot: Object.freeze([
      cot('shbg', 'SHBG', 22), cot('ma_du_kien', 'BCVH đích dự kiến (mã)', 16), cot('ten_du_kien', 'BCVH đích dự kiến (tên)', 20),
      cot('ma_thay', 'BCVH thật sự thấy (mã)', 16), cot('ten_thay', 'BCVH thật sự thấy (tên)', 20),
      cot('gio_ktt', 'Giờ KTT nhận (quét túi đến; thiếu thì xác nhận BD10 đến)', 26, 'gio'), cot('gio_bcvh', 'Giờ BCVH nhận (mốc đến muộn nhất)', 22, 'gio')
    ])
  }),
  5: Object.freeze({
    ten: '5 Chuyến chậm', tenFile: 'ChuyenCham', route: 'chuyen-cham',
    cot: Object.freeze([
      cot('ma_bd10', 'BD10 (mã chuyến)', 24), cot('ma_bcvh', 'BCVH đích (mã)', 14), cot('ten_bcvh', 'BCVH đích (tên)', 18), cot('gio_di', 'Giờ BD10 đi', 21, 'gio'),
      cot('gio_den', 'Giờ BCVH nhận (lúc 50% bưu gửi tới)', 22, 'gio'), cot('p50', 'Thời gian để 50% bưu gửi tới (giờ)', 22, 'gio_so', '0.00'),
      cot('p90', 'Thời gian để 90% bưu gửi tới (giờ)', 22, 'gio_so', '0.00'), cot('so_shbg', 'Số SHBG của chuyến', 12, 'so', '0'),
      cot('mau', 'Số SHBG đã thấy ở đích (mẫu)', 14, 'so', '0'), cot('c1', 'C1', 8), cot('c2', 'C2', 8), cot('c3', 'C3', 8)
    ])
  }),
  6: Object.freeze({
    ten: '6 Đã có tại đích', tenFile: 'DaCoTaiDich', route: 'da-co-tai-dich',
    cot: Object.freeze([
      cot('ma_bcvh', 'BCVH đích (mã)', 14), cot('ten_bcvh', 'BCVH đích (tên)', 18), cot('ngay', 'Ngày (ngày D, theo giờ lập BD10 đi)', 16),
      cot('trong_cua_so', 'Trong khoảng đối chiếu được', 14), cot('da_co', 'Số SHBG đã có tại đích', 14, 'so', '0'), cot('tong', 'Tổng SHBG đã giao đi (trong khoảng đối chiếu)', 16, 'so', '0'),
      cot('ty_le', 'Tỷ lệ đã có tại đích', 14, 'ty_le', '0.0%'), cot('ngoai_cua_so', 'SHBG chưa đối chiếu được (ngoài khoảng ngày có dữ liệu BCVH)', 18, 'so', '0')
    ])
  })
});
const LOAI_SHEET_DUYET = Object.freeze([1, 2, 3, 4]); // sheet cần duyệt lại SHBG
const tenFile = (sheet, tu, den) => `KTT_DoiChieu_${SHEET[sheet].tenFile}_${tu}_${den}.xlsx`;

// ------------------------------------------
// Chọn dòng sheet 1–4 từ các bó có `dong` (kttDoiChieu.boThuThap lietKe) — cùng quy tắc cửa sổ như hàm ghép
// ------------------------------------------
const so2 = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const mangTheoMaNgay = (doPhu) => DC.doPhuTheoMaNgay(doPhu);

/** Sheet 1: SHBG thanh 1 loại CHUA_THAY, ngày D trong cửa sổ của đích. Trả mảng ô theo SHEET[1].cot. */
function dongSheet1({ ngays, bo, doPhu, maBcvh = null, bayGio }) {
  const dpMa = mangTheoMaNgay(doPhu);
  const bayGioGiay = L.giayCua(bayGio);
  const kq = [];
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b || !b.dong) continue;
    for (const r of b.dong.chua_thay) {
      if (maBcvh && r.d !== maBcvh) continue;
      const dp = dpMa.get(r.d).get(ngay);
      if (!dp.trong_cua_so) continue;
      const g = L.giayCua(r.g);
      kq.push({
        ngay, shbg: r.s,
        o: [r.s, r.d, tenBcvh(r.d), r.g, r.bd8, r.bd10den, NHAN_NGUON[r.ly] || 'Khác', DC.LY_DO[r.ly] || DC.LY_DO.KHAC, r.ngay || ngay,
          g !== null && bayGioGiay !== null ? Math.round(((bayGioGiay - g) / 3600) * 10) / 10 : null, coKhong(!!dp.co_the_duong_tinh_gia)]
      });
    }
  }
  return sapXep(kq);
}

/** Sheet 2: SHBG (chưa thấy) của các chuyến mất dấu (cùng tiêu chí và cùng gộp nhiều ngày như ghepChuyenMatDau). */
function dongSheet2({ ngays, bo, doPhu, maBcvh = null }) {
  const md = DC.ghepChuyenMatDau({ ngays, bo, doPhu, maBcvh });
  const loaiTheoChuyen = new Map(md.danh_sach.map((c) => [`${c.ma_bcvh_dich}|${c.ma_bd10}|${c.gio_lap}`, c.loai]));
  const dpMa = mangTheoMaNgay(doPhu);
  const kq = [];
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b || !b.dong) continue;
    for (const r of b.dong.chua_thay_t2) {
      if (maBcvh && r.d !== maBcvh) continue;
      if (!dpMa.get(r.d).get(ngay).trong_cua_so) continue;
      const loai = loaiTheoChuyen.get(`${r.d}|${r.b}|${r.g}`);
      if (!loai) continue;
      const thu = thuCua(r.g);
      kq.push({ ngay: r.g || '', shbg: r.s, o: [r.s, r.d, tenBcvh(r.d), r.b || null, r.g, thu === null ? null : THU[thu], coKhong(thu === 0), NHAN_LOAI_MAT_DAU[loai] || loai] });
    }
  }
  return sapXep(kq);
}

/** Sheet 3: SHBG chuyển tiếp chưa quét đi (không phụ thuộc cửa sổ BCVH). Lọc theo BCVH: chỉ đích đó. */
function dongSheet3({ ngays, bo, maBcvh = null }) {
  const kq = [];
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b || !b.dong) continue;
    for (const r of b.dong.chuyen_tiep) {
      if (maBcvh && r.d !== maBcvh) continue;
      kq.push({ ngay, shbg: r.s, o: [r.s, r.d, tenBcvh(r.d), r.g, r.d ? 'BCVH Huế' : 'Khác (ngoài 6 BCVH Huế)'] });
    }
  }
  return sapXep(kq);
}

/** Sheet 4: SHBG thanh 1 loại BCVH_KHAC, ngày D trong cửa sổ của đích. */
function dongSheet4({ ngays, bo, doPhu, maBcvh = null }) {
  const dpMa = mangTheoMaNgay(doPhu);
  const kq = [];
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b || !b.dong) continue;
    for (const r of b.dong.bcvh_khac) {
      if (maBcvh && r.d !== maBcvh) continue;
      if (!dpMa.get(r.d).get(ngay).trong_cua_so) continue;
      kq.push({ ngay, shbg: r.s, o: [r.s, r.d, tenBcvh(r.d), r.nd, tenBcvh(r.nd), r.g, r.gb || null] });
    }
  }
  return sapXep(kq);
}
/** Sắp (ngày, SHBG) rồi bỏ khóa sắp. */
function sapXep(ds) {
  ds.sort((a, b) => so2(a.ngay, b.ngay) || so2(a.shbg, b.shbg));
  return ds.map((x) => x.o);
}

/** Sheet 5 từ kết quả ghepChuyenCham. C1/C2/C3: chưa có căn cứ trong dữ liệu -> trống. */
function dongSheet5(cham) {
  return cham.danh_sach.map((c) => [c.ma_bd10 || null, c.ma_bcvh_dich, tenBcvh(c.ma_bcvh_dich), c.gio_lap, c.gio_den_trung_vi, c.p50_gio, c.p90_gio, c.so_shbg, c.mau, null, null, null]);
}

/** Sheet 6 từ kết quả ghepTongHop: mỗi dòng một (BCVH, ngày). Tổng = SHBG thanh 2 phân loại được trong cửa sổ (tai_dich + bcvh_khac + chua_thay). */
function dongSheet6(tongHop, maBcvh = null) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const kq = [];
  for (const d of tongHop.theo_ngay) {
    for (const ma of dsMa) {
      const x = d.theo_bcvh[ma];
      if (!x) continue;
      const k = x.da_ghi_di;
      const tong = k.trong_cua_so;
      kq.push([ma, tenBcvh(ma), d.ngay, coKhong(!!x.trong_cua_so), k.tai_dich, tong, tong > 0 ? Math.round((k.tai_dich / tong) * 10000) / 10000 : null, k.ngoai_cua_so]);
    }
  }
  return kq;
}

/** Số hiển thị ở API ứng với từng sheet (để đối chiếu số dòng). p = { ngays, bo, doPhu, daChot, maBcvh }. */
function soApi(sheet, p, tongHop = null) {
  const th = tongHop || DC.ghepTongHop(p);
  switch (sheet) {
    case 1: return th.tong_cong.tap_chinh.chua_thay;
    case 2: { const md = DC.ghepChuyenMatDau(p); return md.danh_sach.reduce((s, c) => s + c.so_chua_thay, 0); }
    case 3: return DC.ghepChuyenTiepChuaQuet(p).tong;
    case 4: return th.tong_cong.tap_chinh.bcvh_khac;
    case 5: return DC.ghepChuyenCham(p).so_chuyen_cham;
    case 6: return p.ngays.length * (p.maBcvh ? 1 : MA_BCVH_HUE.length);
    default: return null;
  }
}

/**
 * Tác vụ worker: duyệt lại SHBG từng ngày (bó chế độ lietKe) rồi chọn dòng sheet 1–4.
 * opts: { sheet, ngays, doPhu, maBcvh, bayGio, tranDong }. Trả { tong, vuotTran, dong, soBo } — soBo = số đếm của CHÍNH các bó vừa duyệt (để đối chiếu nội bộ).
 */
function lietKe(db, opts) {
  const bo = {};
  for (const ngay of opts.ngays) bo[ngay] = DC.tinhNgayDoiChieu(db, ngay, opts.bayGio, { lietKe: true, ex: opts.sheet === 1 || opts.sheet === 4 }); // ex: cột phụ (giờ KTT nhận, BD8, BD10 đến) chỉ sheet 1 và 4 cần
  const p = { ngays: opts.ngays, bo, doPhu: opts.doPhu, maBcvh: opts.maBcvh || null, bayGio: opts.bayGio };
  const chon = { 1: dongSheet1, 2: dongSheet2, 3: dongSheet3, 4: dongSheet4 }[opts.sheet];
  const tran = opts.tranDong || X.tranDong();
  const dong = chon(p);
  const soBo = soApi(opts.sheet, { ...p, daChot: {} });
  return { tong: dong.length, vuotTran: dong.length > tran, dong: dong.length > tran ? [] : dong, soBo };
}

// ------------------------------------------
// Sheet «Thông tin»
// ------------------------------------------
const MO_TA_NHOM = Object.freeze({
  1: 'Mỗi dòng một SHBG thuộc thanh 1 (nhóm «chưa đi trên 24 giờ» của KTT, không phải hàng hoàn) mà không thấy ở BCVH nào trong 6 BCVH Huế (loại CHUA_THAY), ngày D (ngày đến KTT) nằm trong khoảng đối chiếu được của BCVH đích. Nguồn / lý do theo nhãn KTT-16-3: «Kiện đi ngoài» = SHBG đi ngoài túi (BD8 trùng SHBG), trạng thái chỉ «xác nhận» / «chưa xác nhận»; «Túi chuyển tiếp đã chia sẵn»; «Túi khai thác đến chưa quét đi»; «Khác». «Tuổi» = độ mới dữ liệu KTT − giờ KTT nhận.',
  2: 'Mỗi dòng một SHBG chưa thấy thuộc một chuyến «mất dấu»: chuyến BD10 đi (mã BD10 + giờ lập + BCVH đích) có ít nhất 5 SHBG đã giao đi (đã phân loại, ngày D trong khoảng đối chiếu của đích) và MỌI SHBG của chuyến đều chưa thấy. «Mất dấu chắc chắn»: không có SHBG nào rơi vào ngày BCVH không có file dữ liệu; «Nghi ngờ thiếu file dữ liệu của BCVH»: có (BCVH không có file dữ liệu của ngày này nên chưa chắc đã mất dấu). Cột «Chủ nhật» theo ngày lập BD10 đi. Không kết luận nguyên nhân.',
  3: 'Mỗi dòng một SHBG chuyển tiếp (chỉ có túi chuyển tiếp đi, KTT không mở túi) thuộc nhóm «chưa đi trên 24 giờ» của KTT-14 (chưa có giờ lập BD10 đi quá 24 giờ kể từ giờ quét túi đến), không phải hàng hoàn. Không phụ thuộc khoảng ngày đối chiếu được của BCVH (chỉ số liệu KTT). «Loại đích»: BCVH Huế (một trong 6 BCVH) hoặc khác.',
  4: 'Mỗi dòng một SHBG thanh 1 (chưa đi trên 24 giờ, không hoàn) không thấy ở BCVH đích KTT biết nhưng thấy ở BCVH khác trong 6 BCVH (loại BCVH_KHAC), ngày D trong khoảng đối chiếu của đích. «BCVH thật sự thấy» = nơi đến thực tế = BCVH có mốc đến hợp lệ muộn nhất; «Giờ BCVH nhận» là mốc đó.',
  5: 'Mỗi dòng một chuyến BD10 «chậm»: chuyến (mã BD10 + giờ lập + BCVH đích) có từ {mau} SHBG đã thấy ở đích (mẫu hợp lệ, ngày D trong khoảng đối chiếu) và 50% số bưu gửi của chuyến tới sau hơn {nguong} giờ (thời gian «giờ lập BD10 đi → BCVH đích nhận») (hằng số CHUYEN_CHAM trong kttDoiChieu.js; PO chọn). Giờ BCVH nhận = giờ lập BD10 đi + thời gian để 50% bưu gửi tới. Cột C1, C2, C3 để TRỐNG: dữ liệu chưa có căn cứ phân loại (đang làm rõ C1/C2/C3 so với xe C2).',
  6: 'Mỗi dòng một (BCVH đích, ngày D). «Đã có tại đích» = SHBG thanh 2 (đã giao đi BD10, không hoàn) phân loại tai_dich; «Tổng» = SHBG thanh 2 phân loại được trong khoảng đối chiếu được (tại đích + thấy ở BCVH khác + chưa thấy); không gồm nhóm thiếu giờ quét túi đến. Ngày chưa đối chiếu được (ngoài khoảng ngày có dữ liệu BCVH): Tổng = 0, SHBG chưa đối chiếu được chỉ đếm.'
});
const DONVI_DONG = Object.freeze({
  1: 'SHBG (số hiệu bưu gửi)', 2: 'SHBG (số hiệu bưu gửi) của chuyến mất dấu', 3: 'SHBG (số hiệu bưu gửi)', 4: 'SHBG (số hiệu bưu gửi)', 5: 'chuyến BD10', 6: '(BCVH, ngày)'
});

/**
 * ctx: { sheet, tu, den, maBcvh, doMoi (nguon_xuat_luc KTT | null), doPhu, daChot ({ngay: bool}), ngays, soDong, soApi, nguoiXuat, xuatLuc, gioChot }. Trả [[mục, nội dung], …].
 */
function dongThongTin(ctx) {
  const s = SHEET[ctx.sheet];
  const tenSheet = s.ten;
  const cuaSo = ctx.doPhu.cua_so_thuc_te;
  const ngay = ctx.ngays.map((n) => `${dd(n)}: ${ctx.daChot[n] ? 'đã chốt' : 'số tạm'}`);
  const tatCaChot = ctx.ngays.length > 0 && ctx.ngays.every((n) => ctx.daChot[n]);
  const dsMa = ctx.maBcvh ? ctx.doPhu.bcvh.filter((x) => x.ma === ctx.maBcvh) : ctx.doPhu.bcvh;
  const theoBcvh = dsMa.map((x) => `${x.ma}${x.cua_so ? `: ${dd(x.cua_so.tu)} – ${dd(x.cua_so.den)}` : ': chưa có khoảng đối chiếu được'}`).join('; ');
  const doMoiBcvh = dsMa.map((x) => `${x.ma}: ${x.do_moi || 'chưa có'}`).join('; ');
  const mo = MO_TA_NHOM[ctx.sheet].replace('{mau}', DC.CHUYEN_CHAM.SO_MAU_TOI_THIEU).replace('{nguong}', DC.CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO);
  const khop = ctx.soApi === ctx.soDong;
  return [
    ['Khoảng ngày đối chiếu được', `Từ ngày ${dd(ctx.tu)} đến ngày ${dd(ctx.den)} (sheet «${tenSheet}»). Khoảng ngày đối chiếu được chung của 6 BCVH trong khoảng đã chọn: ${cuaSo ? `${dd(cuaSo.tu)} – ${dd(cuaSo.den)}` : 'không có ngày nào'}. Theo từng BCVH đích: ${theoBcvh}. BCVH lọc: ${ctx.maBcvh ? ctx.maBcvh : 'không (tất cả)'}.`],
    ['Dữ liệu đến', `${ctx.doMoi ? `Dữ liệu KTT nguồn xuất lúc ${ctx.doMoi} (giờ Việt Nam).` : 'Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào).'} Độ mới «Hàng đến BCVH» (file OK mới nhất): ${doMoiBcvh}.`],
    ['Chốt số theo ngày', ngay.join('; ') || '(không có ngày)'],
    ['Ngày xuất, người xuất', `${ctx.xuatLuc} (giờ Việt Nam); tài khoản: ${ctx.nguoiXuat || '(không rõ)'}.`],
    ['Trạng thái số liệu', tatCaChot ? 'Đã chốt: mọi ngày trong khoảng đã qua giờ chốt.' : `Số tạm: có ngày chưa chốt (ngày D chốt khi dữ liệu đến sau ${ctx.gioChot} ngày D+1). Số liệu BCVH có thể được nạp thêm; «chưa thấy» chỉ kết luận trong khoảng đối chiếu được (D + 48 giờ).`],
    ['Định nghĩa: nhóm của sheet', mo],
    ['Định nghĩa: có mặt ở BCVH', 'Có mặt ở BCVH = có dòng «Hàng đến BCVH» (file OK của 6 BCVH, file_date trong [D, D+2]) với mốc đến hợp lệ; dòng chưa xác định ngày đến không tính. Có ở BCVH đích → tại đích; chỉ ở BCVH khác → BCVH khác; không đâu → chưa thấy. Khóa ghép: SHBG = tracking_no (khớp chuỗi trực tiếp).'],
    ['Định nghĩa: có thể do BCVH thiếu dữ liệu', 'BCVH đích có ngày D, D+1 hoặc D+2 không có dữ liệu (không có file, hoặc chỉ file rỗng): «chưa thấy» có thể chỉ do BCVH không có file dữ liệu của ngày này (KTT-16-1). Không bị bỏ khỏi số liệu, chỉ để chú thích.'],
    ['Định nghĩa: 50% / 90% bưu gửi tới', '«50% bưu gửi tới» / «90% bưu gửi tới» là thời gian tính từ lúc lập BD10 đi đến khi BCVH nhận được 50% / 90% số bưu gửi của chuyến; chỉ tính các bưu gửi đã tới BCVH (hàng chưa thấy không tính). Đơn vị: giờ.'],
    ['Đơn vị', `Sheet «Thông tin»: mỗi dòng một mục mô tả. Sheet «${tenSheet}»: mỗi dòng là một ${DONVI_DONG[ctx.sheet]}.`],
    ['Số dòng kiểm tra', ctx.soDong],
    ['Đối chiếu với màn hình', `Số tương ứng trên trang Đối chiếu (cùng khoảng ngày và BCVH) là ${ctx.soApi}${khop ? `: khớp số dòng sheet «${tenSheet}».` : `: KHÔNG khớp số dòng sheet «${tenSheet}» (số liệu đang được cập nhật, hãy xuất lại).`}`]
  ];
}

module.exports = {
  SHEET, NHAN_NGUON, THU, LOAI_SHEET_DUYET, tenFile, thuCua, laChuNhat, dongSheet1, dongSheet2, dongSheet3, dongSheet4, dongSheet5, dongSheet6, soApi, lietKe, dongThongTin
};
