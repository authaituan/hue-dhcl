// ==========================================
// Truy vấn tổng hợp «Hàng tại KTT» (KTT-5): sản lượng, tồn treo, chuyến, nằm lâu, chỉ tiêu F1.3, chi tiết, gộp.
// Dữ liệu: ktt_tui, ktt_buu_gui (KTT-2), ktt_dia_ban_phat (KTT-5), cấu hình docCauHinhKtt(db) (KTT-4). Tính bằng các hàm thuần của server/lib/kttTinh.js.
// Quy tắc: docs/ai/37_KTT_QUY_TAC_TINH.md, 38_KTT_TRUY_VAN.md. Chỉ ĐỌC DB (SELECT), không ghi, không thêm cột; nhãn «treo», «nằm lâu», «trễ chuyến» tính khi truy vấn.
// Không API, không cache, không quyền (ticket sau). Không đối chiếu dữ liệu phát phía BCVH (arrival_items).
//
// Cấu trúc: hai lượt đọc bằng con trỏ `.iterate()` (không nạp cả bảng vào bộ nhớ):
//   - lượt TÚI   (ktt_tui, theo id): mỗi túi -> một «đơn vị túi»  (chuyển tiếp đi tính ở mức túi; treo; túi không có bưu gửi);
//   - lượt SHBG  (ktt_buu_gui ⨝ ktt_tui, theo shbg): mỗi SHBG -> một «đơn vị SHBG» (hàng khai thác lại: túi đến mở ra, đóng sang túi đi).
// Mỗi hàm công khai chạy các «bộ đếm» (accumulator) qua cùng hai lượt đó; `tongHopKtt` chạy TẤT CẢ bộ đếm trong MỘT lượt.
//
// Giờ là chuỗi `YYYY-MM-DD HH:MM:SS` giờ địa phương; mọi phép trừ bằng giây UTC cố định (docGiay), không phụ thuộc TZ; không dùng hàm dựng ngày từ chuỗi của JS.
// Lọc ngày bằng so sánh chuỗi (định dạng cố định nên thứ tự chuỗi = thứ tự thời gian), tận dụng chỉ mục trên giờ quét đến / giờ đi.
// ==========================================
'use strict';
const { docGiay } = require('./quyThoiGian');
const T = require('./kttTinh');
const { docCauHinhKtt } = require('./kttCauHinh');
const { docLichChuyen } = require('./kttLichChuyen');
const { danhGiaChuyenLich } = require('./kttChuyen');

const GIAY_NGAY = 86400;
const GIAY_7_NGAY = 7 * GIAY_NGAY;
const GIO_VN_LECH_GIAY = 7 * 3600; // chỉ dùng để suy `bayGio` mặc định (Việt Nam UTC+7 cố định, không giờ mùa hè)
const TRANG_TOI_DA = 200;
const TRANG_MAC_DINH = 50;

const CHIEU = Object.freeze({ DEN: 'DEN', DI: 'DI', CHUYEN_TIEP_DI: 'CHUYEN_TIEP_DI' });
const THU_TU_CHIEU = ['DEN', 'DI', 'CHUYEN_TIEP_DI'];
const NGUON = Object.freeze({ CHUYEN_TIEP_DI: 'CHUYEN_TIEP_DI', KHAI_THAC_LAI: 'KHAI_THAC_LAI' }); // nguồn của hàng khi chấm chuyến / nằm lâu: túi chuyển tiếp | bưu gửi khai thác lại
const LOAI_CHI_TIET = Object.freeze(['treo', 'nam_lau', 'tre_chuyen', 'lo_chuyen', 'den_sat_gio', 'xnd_sau_gio_di', 'can_kiem_tra_lai', 'khong_ro_dich', 'quet_den_sau_gio_di']);
const DAI_QUY = Object.freeze(['AM', 'T0_2H', 'T2_6H', 'TREN_6H']);
const GIO_DEM_BAT_DAU = 21; // khớp khung loại trừ 21:00–07:00
const GIO_DEM_KET_THUC = 7;

class LoiKtt extends Error {
  constructor(ma, thongBao) { super(thongBao); this.name = 'LoiKtt'; this.code = ma; }
}

// ------------------------------------------
// Tiện ích
// ------------------------------------------
const chuoi = (x) => (x === null || x === undefined ? '' : String(x).trim());
const soHuuHan = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const ngayCuaGio = (g) => (g ? g.slice(0, 10) : null);
const gioCuaGio = (g) => (g ? Number(g.slice(11, 13)) : null);
const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);

const ngayHopLe = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && docGiay(`${s} 00:00:00`) !== null;
const ngayKeTiep = (ngay) => T.dinhDangGiay(docGiay(`${ngay} 00:00:00`) + GIAY_NGAY).slice(0, 10);

/** Giờ hiện tại theo giờ Việt Nam (UTC+7 cố định) dạng chuỗi giờ; chỉ dùng khi bên gọi không truyền `bayGio`. Không phụ thuộc TZ máy. */
function bayGioMacDinh() {
  return T.dinhDangGiay(Math.floor(Date.now() / 1000) + GIO_VN_LECH_GIAY);
}

/** Chuẩn hóa { tuNgay, denNgay, bayGio }. Thiếu `bayGio` -> giờ hiện tại VN; thiếu ngày -> ngày của `bayGio`. Sai định dạng / tuNgay > denNgay -> ném LoiKtt. */
function chuanHoaKhoang(opts = {}) {
  const bayGio = opts.bayGio === undefined || opts.bayGio === null ? bayGioMacDinh() : opts.bayGio;
  if (docGiay(bayGio) === null) throw new LoiKtt('KTT_BAY_GIO_SAI', 'bayGio phải có dạng YYYY-MM-DD HH:MM:SS.');
  const homNay = bayGio.trim().slice(0, 10);
  const tuNgay = opts.tuNgay === undefined || opts.tuNgay === null ? (opts.denNgay || homNay) : opts.tuNgay;
  const denNgay = opts.denNgay === undefined || opts.denNgay === null ? tuNgay : opts.denNgay;
  if (!ngayHopLe(tuNgay) || !ngayHopLe(denNgay)) throw new LoiKtt('KTT_NGAY_SAI', 'tuNgay / denNgay phải có dạng YYYY-MM-DD.');
  if (tuNgay > denNgay) throw new LoiKtt('KTT_KHOANG_NGAY_SAI', 'tuNgay phải không sau denNgay.');
  return { tuNgay, denNgay, bayGio: bayGio.trim() };
}

function docBangPhuongXa(db, canhBao) {
  const bang = {};
  if (!coBang(db, 'ktt_dia_ban_phat')) { canhBao.push('Thiếu bảng ktt_dia_ban_phat: không tra được đích theo phường/xã.'); return bang; }
  for (const r of db.prepare('SELECT ma_phuong_xa, ma_bcvh FROM ktt_dia_ban_phat').all()) bang[chuoi(r.ma_phuong_xa)] = chuoi(r.ma_bcvh);
  if (!Object.keys(bang).length) canhBao.push('Bảng ktt_dia_ban_phat chưa có dòng nào: không tra được đích theo phường/xã.');
  return bang;
}

/** Ngữ cảnh chạy: khoảng ngày, bayGio, cấu hình, bảng địa bàn. `opts.cauHinh` (kết quả docCauHinhKtt) cho phép test cố định cấu hình. */
function taoNguCanh(db, opts) {
  const khoang = chuanHoaKhoang(opts);
  const cauHinh = opts && opts.cauHinh ? opts.cauHinh : docCauHinhKtt(db);
  const lichChuyen = opts && opts.lichChuyen ? opts.lichChuyen : docLichChuyen(db); // `opts.lichChuyen` ({ lich, hanDenTruocChuyenPhut }) cho phép test cố định lịch
  const canhBao = [...(cauHinh.canhBao || []), ...(lichChuyen.canhBao || [])];
  return {
    boQuaCham: !!(opts && opts.boQuaCham),
    lichChuyen,
    ...khoang,
    tuGio: `${khoang.tuNgay} 00:00:00`,
    denGio: `${ngayKeTiep(khoang.denNgay)} 00:00:00`, // cận trên mở
    cauHinh,
    nguong: cauHinh.nguong,
    bangPhuongXa: docBangPhuongXa(db, canhBao),
    canhBao,
    bayGioGiay: docGiay(khoang.bayGio),
    boNhoChuyen: new Map(),
    boNhoF13: new Map(),
    boNhoNam: new Map(),
    ...boNhoGiay()
  };
}

/** `giay(x)`: docGiay có nhớ (cùng một mốc lặp lại ở rất nhiều dòng); `gio(x)`: chuỗi giờ đã cắt khoảng trắng nếu hợp lệ, ngược lại null. */
function boNhoGiay() {
  const m = new Map();
  const giay = (x) => {
    if (typeof x !== 'string') return null;
    let v = m.get(x);
    if (v === undefined) { v = docGiay(x); m.set(x, v); }
    return v;
  };
  return { giay, gio: (x) => (giay(x) === null ? null : x.trim()) };
}

const trongKhoang = (ngay, ctx) => ngay !== null && ngay >= ctx.tuNgay && ngay <= ctx.denNgay;

// ------------------------------------------
// Đích
// ------------------------------------------
/**
 * Đích của TÚI: BD10 đi nhận -> mã bưu cục nhận của túi (túi ĐẾN nhận tại KTT 530100 -> nhóm KTT) -> cột Dich_nhom của nguồn (chỉ nhóm không cần mã BCVH, hoặc BCVH_HUE chưa rõ BCVH) -> KHONG_RO.
 * Trả { nhom, maBcvh, nguon }.
 */
function nhomTui(r, ctx) {
  const nhan = chuoi(r.nhan);
  if (nhan) return T.phanNhomDich({ maNhanBd10Di: nhan });
  const to = chuoi(r.toPos);
  if (to) return { ...T.phanNhomDich({ maNhanBd10Di: to }), nguon: 'TUI_TO_POS' };
  const cot = chuoi(r.dichNhomCot);
  if (cot === 'BCVH_HUE' || cot === 'HE1_530900' || cot === 'KTT' || cot === 'KHAC') return { nhom: cot, maBcvh: null, nguon: 'DICH_NHOM' };
  return { nhom: T.NHOM_DICH.KHONG_RO, maBcvh: null, nguon: null };
}

// ------------------------------------------
// Chấm có nhớ (nhiều bưu gửi cùng túi thường cùng mốc)
// ------------------------------------------
function chamChuyen(ctx, maBcvh, quetDen, gioDi) {
  const khoa = `${maBcvh}|${quetDen}|${gioDi || ''}`;
  let kq = ctx.boNhoChuyen.get(khoa);
  if (!kq) {
    // KTT-7b: lịch chuyến CHÍNH THỨC (ktt_lich_chuyen, kttLichChuyen.js) thay lịch V1 (ktt_cau_hinh_chuyen). Hình dạng kết quả giữ nguyên; tên chuyến là giờ xe rời KTT 'HH:MM'.
    kq = danhGiaChuyenLich({ quetDen, gioDi, bay_gio: ctx.bayGio, maBcvh, lich: ctx.lichChuyen.lich, hanPhut: ctx.lichChuyen.hanDenTruocChuyenPhut });
    ctx.boNhoChuyen.set(khoa, kq);
  }
  return kq;
}

function chamF13(ctx, maBcvh, maPhuong, xnd, gioDi) {
  const khoa = `${maBcvh}|${T.PHUONG_THUAN_HOA_PHU_XUAN.includes(maPhuong) ? 'T' : ''}|${xnd}|${gioDi || ''}`;
  let kq = ctx.boNhoF13.get(khoa);
  if (!kq) {
    kq = T.tinhChiTieu({ xnd, gioDi, bay_gio: ctx.bayGio, maBcvh, maPhuong, nguong: ctx.nguong });
    ctx.boNhoF13.set(khoa, kq);
  }
  return kq;
}

/** Hai mốc cách nhau quá 7 ngày đồng hồ (theo giây tuyệt đối) -> «Cần kiểm tra lại». Thiếu một mốc -> false. */
function cachQua7Ngay(ctx, a, b) {
  if (!a || !b) return false;
  return Math.abs(ctx.giay(a) - ctx.giay(b)) > GIAY_7_NGAY;
}

/** Thời gian nằm + bậc + chuyến + «nằm lâu» của một hàng (có nhớ theo nhóm đích / BCVH / hai mốc). Trả { nam, bac, chuyen, namLau }. */
function chamNam(ctx, nhom, maBcvh, quetDen, gioDi) {
  const khoa = `${nhom}|${maBcvh || ''}|${quetDen}|${gioDi || ''}`;
  let kq = ctx.boNhoNam.get(khoa);
  if (!kq) {
    const nam = T.namThucTe({ quetDen, gioDi, bay_gio: ctx.bayGio });
    const chuyen = maBcvh ? chamChuyen(ctx, maBcvh, quetDen, gioDi) : null;
    kq = {
      nam, chuyen,
      bac: nam.daDi ? T.phanBacNamLau(nam.giay) : null,
      namLau: T.trangThaiNamLau({ nhomDich: nhom, gioDi, giayNam: nam.giay, danhGiaChuyen: chuyen, nguong: ctx.nguong })
    };
    ctx.boNhoNam.set(khoa, kq);
  }
  return kq;
}

const dayDem = (gio) => (gio >= GIO_DEM_BAT_DAU || gio < GIO_DEM_KET_THUC ? 'DEM' : 'NGAY');
function daiQuy(giay) {
  if (giay < 0) return 'AM';
  if (giay <= 2 * 3600) return 'T0_2H';
  if (giay <= 6 * 3600) return 'T2_6H';
  return 'TREN_6H';
}

// ------------------------------------------
// Dựng đơn vị TÚI
// ------------------------------------------
function chuanHoaTui(r, ctx) {
  const quetDen = ctx.gio(r.gio_quet_tui_den);
  const xndBd10 = ctx.gio(r.bd10_den_xnd);
  const gioDiBd10 = ctx.gio(r.bd10_di_gio_di);
  const gioQuetDi = ctx.gio(r.gio_quet_tui_di);
  return {
    id: r.id, chieu: r.chieu, luong: chuoi(r.luong) || 'KHONG_RO', soHieuBd8: chuoi(r.so_hieu_bd8) || null,
    toPos: r.to_pos, dichNhomCot: r.dich_nhom, nhan: r.bd10_di_ma_diem_nhan,
    quetDen, xndBd10, gioDi: gioDiBd10 || gioQuetDi, gioQuetDi, gioBd10Di: gioDiBd10, diemGuiDen: chuoi(r.bd10_den_ma_diem_gui) || null, // KTT-7b: giờ LẬP BD10 đi (không lẫn giờ quét đi) và nơi gửi của BD10 đến
    bd10Den: chuoi(r.bd10_den_so_hieu) || null, bd10Di: chuoi(r.bd10_di_so_hieu) || null,
    coMoTui: r.co_mo_tui === 1, coBd10Di: !!chuoi(r.bd10_di_so_hieu) || !!gioDiBd10,
    nShbg: r.n_shbg === undefined ? null : r.n_shbg, kg: soHuuHan(r.khoi_luong_tui_kg)
  };
}

/** Một túi -> đơn vị: đích, ngày, treo (chiều DEN / CHUYEN_TIEP_DI), chuyến + nằm lâu (CHUYEN_TIEP_DI đích BCVH Huế). */
function dungDonTui(r, ctx) {
  const t = chuanHoaTui(r, ctx);
  const dich = nhomTui(t, ctx);
  const u = {
    donVi: 'TUI', id: t.id, chieu: t.chieu, luong: t.luong, soHieuBd8: t.soHieuBd8,
    nhom: dich.nhom, maBcvh: dich.maBcvh, nguonDich: dich.nguon,
    quetDen: t.quetDen, xndBd10: t.xndBd10, gioDi: t.gioDi, bd10Den: t.bd10Den, bd10Di: t.bd10Di, nShbg: t.nShbg, kg: t.kg,
    ngayDen: ngayCuaGio(t.quetDen || t.xndBd10), ngayDi: ngayCuaGio(t.gioDi),
    treo: null, chuyen: null, nam: null, bac: null, namLau: null, canKiemTraLai: false
  };
  u.trongKhoangDen = trongKhoang(u.ngayDen, ctx);
  u.trongKhoangDi = trongKhoang(u.ngayDi, ctx);
  u.canTinhTreo = t.chieu === CHIEU.DEN || (t.chieu === CHIEU.CHUYEN_TIEP_DI && dich.nhom !== T.NHOM_DICH.HE1_530900);
  if (t.chieu === CHIEU.DEN || t.chieu === CHIEU.CHUYEN_TIEP_DI) {
    u.treo = T.trangThaiTreo({
      chieu: t.chieu, luong: t.luong, nhomDich: dich.nhom, quetDen: t.quetDen, coMoTui: t.coMoTui,
      coQuetDi: !!t.gioQuetDi, coBd10Di: t.coBd10Di, bay_gio: ctx.bayGio, nguong: ctx.nguong
    });
  }
  if (t.chieu === CHIEU.CHUYEN_TIEP_DI && t.quetDen) {
    u.canKiemTraLai = cachQua7Ngay(ctx, t.quetDen, t.gioDi);
    if (!u.canKiemTraLai) Object.assign(u, chamNam(ctx, dich.nhom, dich.maBcvh, t.quetDen, t.gioDi));
  }
  return u;
}

// ------------------------------------------
// Dựng đơn vị SHBG (các dòng của cùng một SHBG, sắp theo id túi)
// ------------------------------------------
function chuanHoaDongShbg(r, ctx) {
  const t = chuanHoaTui(r, ctx);
  t.shbg = r.shbg;
  t.tuiId = r.tui_id;
  t.id = r.tui_id;
  t.gam = soHuuHan(r.gam);
  t.maPhuong = chuoi(r.ma_xa_phuong);
  t.tenPhuong = chuoi(r.ten_xa_phuong) || null;
  t.duongThuMa = chuoi(r.dt_ma) || null; // KTT-8b: đường thư của BD10 đến (chỉ để xuất file, không dùng để tính)
  t.duongThuTen = chuoi(r.dt_ten) || null;
  t.diemGuiTen = chuoi(r.dg_ten) || null; // KTT-12: tên nơi gửi BD10 đến (chỉ để hiển thị bảng B5, không dùng để tính)
  t.xndSh = ctx.gio(r.xnd_sh);
  t.quetDenGiay = t.quetDen ? ctx.giay(t.quetDen) : null;
  t.gioDiGiay = t.gioDi ? ctx.giay(t.gioDi) : null;
  return t;
}

const chonCuoi = (ds, giayCua) => ds.reduce((tot, x) => (tot === null || giayCua(x) > giayCua(tot) || (giayCua(x) === giayCua(tot) && x.id > tot.id) ? x : tot), null);

/**
 * Các dòng của MỘT SHBG -> đơn vị. «Lần đi cuối» = dòng túi ĐI có giờ đi muộn nhất (dòng túi đi chưa có giờ chỉ dùng khi không dòng nào có giờ).
 * Túi đến ghép = túi ĐẾN có giờ quét đến muộn nhất không sau giờ đi cuối (không có thì muộn nhất); không dòng đến nào có mã 4 thì dòng đến có id lớn nhất.
 * `cells`: mỗi dòng -> ô sản lượng (ngày theo quét đến cho ĐẾN, theo giờ đi cho ĐI / CHUYEN_TIEP_DI).
 */
function dungDonShbg(dong, ctx) {
  const denRows = dong.filter((x) => x.chieu === CHIEU.DEN);
  const diRows = dong.filter((x) => x.chieu === CHIEU.DI);
  const maPhuong = (dong.find((x) => x.maPhuong) || { maPhuong: '' }).maPhuong;
  const gam = (dong.find((x) => x.gam !== null) || { gam: null }).gam;

  const diCoGio = diRows.filter((x) => x.gioDiGiay !== null);
  const diCuoi = diCoGio.length ? chonCuoi(diCoGio, (x) => x.gioDiGiay) : (diRows.length ? chonCuoi(diRows, () => 0) : null);
  const gioDiGiay = diCuoi ? diCuoi.gioDiGiay : null;

  let den = null;
  const denCoQuet = denRows.filter((x) => x.quetDenGiay !== null);
  // KTT-7b: túi đến GỐC = túi đến có giờ quét sớm nhất (cùng giờ: id nhỏ nhất); dùng nhận diện hàng hoàn Tổ KHHH (nơi gửi BD10 đến).
  const denGoc = denCoQuet.length ? denCoQuet.reduce((tot, x) => (x.quetDenGiay < tot.quetDenGiay || (x.quetDenGiay === tot.quetDenGiay && x.id < tot.id) ? x : tot)) : (denRows.length ? denRows.reduce((tot, x) => (x.id < tot.id ? x : tot)) : null);
  if (denCoQuet.length) {
    let ung = gioDiGiay !== null ? denCoQuet.filter((x) => x.quetDenGiay <= gioDiGiay) : denCoQuet;
    if (!ung.length) ung = denCoQuet;
    den = chonCuoi(ung, (x) => x.quetDenGiay);
  } else if (denRows.length) den = chonCuoi(denRows, () => 0);

  const dich = T.phanNhomDich({ maNhanBd10Di: diCuoi ? diCuoi.nhan : null, maPhuongXa: maPhuong, bangPhuongXa: ctx.bangPhuongXa });
  const u = {
    donVi: 'SHBG', shbg: dong[0].shbg, gam, maPhuong, nhom: dich.nhom, maBcvh: dich.maBcvh, nguonDich: dich.nguon,
    soHieuBd8: den ? den.soHieuBd8 : (diCuoi ? diCuoi.soHieuBd8 : null), bd10Den: den ? den.bd10Den : null, bd10Di: diCuoi ? diCuoi.bd10Di : null,
    luong: den ? den.luong : null, quetDen: den ? den.quetDen : null, gioDi: diCuoi ? diCuoi.gioDi : null, xndBd10: den ? den.xndBd10 : null, xnd: null,
    gioBd10Di: diCuoi ? diCuoi.gioBd10Di : null, gioQuetDi: diCuoi ? diCuoi.gioQuetDi : null, tenPhuong: (dong.find((x) => x.tenPhuong) || { tenPhuong: null }).tenPhuong,
    diemGuiDen: den ? den.diemGuiDen : null, diemGuiDenTen: den ? den.diemGuiTen : null, duongThuDenMa: den ? den.duongThuMa : null, duongThuDenTen: den ? den.duongThuTen : null,
    tuiDenId: den ? den.tuiId : null, noiGuiGoc: denGoc ? denGoc.diemGuiDen : null, quetDenGoc: denGoc ? denGoc.quetDen : null,
    // KTT-10b: chất lượng túi đến cho mốc «giờ quét túi đến» (chỉ để đếm, không dùng để chọn túi): số túi đến có giờ quét, có túi đi không, id túi đến gốc.
    soTuiDen: new Set(denCoQuet.map((x) => x.tuiId)).size, coTuiDi: diRows.length > 0, tuiDenGocId: denGoc ? denGoc.tuiId : null,
    ngayDen: den ? ngayCuaGio(den.quetDen || den.xndBd10) : null,
    chuyen: null, nam: null, bac: null, namLau: null, f13: null, canKiemTraLai: false, cells: []
  };
  u.trongKhoangDen = den ? trongKhoang(u.ngayDen, ctx) : false;
  u.daLanDen = !!den;

  if (den) {
    const xnds = [den.xndSh, den.xndBd10].filter(Boolean).sort();
    u.xnd = xnds.length ? xnds[0] : null; // xác nhận đến SỚM NHẤT
    u.canKiemTraLai = cachQua7Ngay(ctx, u.quetDen, u.gioDi) || cachQua7Ngay(ctx, u.xnd, u.gioDi);
    // `ctx.boQuaCham` (KTT-7b, kttLuuThoatQuery): bên gọi tự xếp chuyến / chấm chỉ tiêu bằng hàm thuần riêng, bỏ qua phần chấm nằm lâu / chuyến / F1.3 ở đây (tránh làm hai lần).
    if (!ctx.boQuaCham && !u.canKiemTraLai && u.quetDen) Object.assign(u, chamNam(ctx, u.nhom, u.maBcvh, u.quetDen, u.gioDi));
    if (!ctx.boQuaCham && u.maBcvh) {
      u.f13 = u.canKiemTraLai && u.xnd
        ? { trangThai: 'CAN_KIEM_TRA_LAI', daQuaGiay: null, conLaiGiay: null, chiTieuGio: null }
        : chamF13(ctx, u.maBcvh, maPhuong, u.xnd, u.gioDi);
    }
  }

  for (const x of dong) {
    let ngay;
    let nhom;
    if (x.chieu === CHIEU.DEN) { ngay = ngayCuaGio(x.quetDen || x.xndBd10); nhom = dich.nhom; }
    else if (x.chieu === CHIEU.DI) { ngay = ngayCuaGio(x.gioDi); nhom = T.phanNhomDich({ maNhanBd10Di: x.nhan, maPhuongXa: maPhuong, bangPhuongXa: ctx.bangPhuongXa }).nhom; }
    else { ngay = ngayCuaGio(x.gioDi); nhom = nhomTui(x, ctx).nhom; }
    if (ngay) u.cells.push({ ngay, chieu: x.chieu, luong: x.luong, nhom, tuiId: x.tuiId, kg: x.kg });
  }
  return u;
}

// ------------------------------------------
// Hai lượt đọc
// ------------------------------------------
const COT_TUI_SQL = 't.id, t.chieu, t.luong, t.so_hieu_bd8, t.to_pos, t.dich_nhom, t.co_mo_tui, t.khoi_luong_tui_kg, '
  + 't.gio_quet_tui_den, t.bd10_den_xnd, t.bd10_den_so_hieu, t.bd10_di_so_hieu, t.bd10_di_gio_di, t.gio_quet_tui_di, t.bd10_di_ma_diem_nhan, t.bd10_den_ma_diem_gui';
const noiKhoa = (b, t) => ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index'].map((c) => `${b}.${c} = ${t}.${c}`).join(' AND ');
const NOI_KHOA = noiKhoa('b', 't');

const dieuKienDen = (a) => `((${a}.gio_quet_tui_den >= @tuGio AND ${a}.gio_quet_tui_den < @denGio) OR (${a}.gio_quet_tui_den IS NULL AND ${a}.bd10_den_xnd >= @tuGio AND ${a}.bd10_den_xnd < @denGio))`;
const dieuKienDi = (a) => `((${a}.bd10_di_gio_di >= @tuGio AND ${a}.bd10_di_gio_di < @denGio) OR (${a}.bd10_di_gio_di IS NULL AND ${a}.gio_quet_tui_di >= @tuGio AND ${a}.gio_quet_tui_di < @denGio))`;

function duyetTui(db, ctx, cb) {
  const dieu = ctx.canNgayDi ? `(${dieuKienDen('t')} OR ${dieuKienDi('t')})` : dieuKienDen('t');
  const sql = `SELECT ${COT_TUI_SQL},
      ${ctx.coBuuGui ? `(SELECT COUNT(*) FROM ktt_buu_gui b WHERE ${NOI_KHOA})` : '0'} AS n_shbg
    FROM ktt_tui t
    WHERE +t.chieu IN ('DEN', 'DI', 'CHUYEN_TIEP_DI') AND ${dieu}
    ORDER BY t.id`;
  for (const r of db.prepare(sql).iterate({ tuGio: ctx.tuGio, denGio: ctx.denGio })) cb(dungDonTui(r, ctx));
}

function duyetShbg(db, ctx, cb) {
  // Tập SHBG ứng viên (túi ĐẾN quét đến trong khoảng; thêm túi ĐI / CHUYEN_TIEP_DI có giờ đi trong khoảng khi cần sản lượng ĐI), rồi lấy MỌI dòng của các SHBG đó.
  // Thứ tự nối cố định (CROSS JOIN: ứng viên -> ktt_buu_gui theo chỉ mục shbg -> ktt_tui theo khóa duy nhất) và `+t.chieu` để bộ lập kế hoạch không đảo ngược thành
  // «với mỗi túi dò toàn bộ danh sách SHBG» (độ phức tạp bình phương).
  const ungVien = ctx.canNgayDi
    ? `SELECT b2.shbg FROM ktt_buu_gui b2 JOIN ktt_tui t2 ON ${noiKhoa('b2', 't2')} WHERE +t2.chieu = 'DEN' AND ${dieuKienDen('t2')}
       UNION SELECT b2.shbg FROM ktt_buu_gui b2 JOIN ktt_tui t2 ON ${noiKhoa('b2', 't2')} WHERE +t2.chieu IN ('DI', 'CHUYEN_TIEP_DI') AND ${dieuKienDi('t2')}`
    : `SELECT b2.shbg FROM ktt_buu_gui b2 JOIN ktt_tui t2 ON ${noiKhoa('b2', 't2')} WHERE +t2.chieu = 'DEN' AND ${dieuKienDen('t2')}`;
  const sql = `SELECT b.shbg, b.khoi_luong_thuc_te_g AS gam, b.ma_xa_phuong, b.ten_xa_phuong, b.ti_xac_nhan_den_luc AS xnd_sh, t.id AS tui_id, t.bd10_den_ma_duong_thu AS dt_ma, t.bd10_den_ten_duong_thu AS dt_ten, t.bd10_den_ten_diem_gui AS dg_ten, ${COT_TUI_SQL}
    FROM (${ungVien}) u
    CROSS JOIN ktt_buu_gui b ON b.shbg = u.shbg
    CROSS JOIN ktt_tui t ON ${NOI_KHOA}
    WHERE +t.chieu IN ('DEN', 'DI', 'CHUYEN_TIEP_DI')
    ORDER BY b.shbg, t.id`;
  let hienTai = null;
  let dong = [];
  for (const r of db.prepare(sql).iterate({ tuGio: ctx.tuGio, denGio: ctx.denGio })) {
    if (r.shbg !== hienTai) {
      if (dong.length) cb(dungDonShbg(dong, ctx));
      dong = [];
      hienTai = r.shbg;
    }
    dong.push(chuanHoaDongShbg(r, ctx));
  }
  if (dong.length) cb(dungDonShbg(dong, ctx));
}

/** Chạy các bộ đếm: mỗi bộ có thể có `tui(u)`, `shbg(u)`, cờ `canNgayDi`. Lượt túi chạy trước lượt SHBG. Trả ngữ cảnh. */
function chay(db, opts, taoBoDem) {
  const ctx = taoNguCanh(db, opts || {});
  const boDems = taoBoDem(ctx);
  ctx.canNgayDi = boDems.some((b) => b.canNgayDi);
  const coTui = coBang(db, 'ktt_tui');
  const coBuuGui = coBang(db, 'ktt_buu_gui');
  ctx.coBuuGui = coBuuGui;
  if (!coTui) ctx.canhBao.push('Thiếu bảng ktt_tui: chưa có dữ liệu.');
  else if (!coBuuGui) ctx.canhBao.push('Thiếu bảng ktt_buu_gui: chỉ tính được ở mức túi.');
  const cbTui = boDems.filter((b) => b.tui);
  const cbShbg = boDems.filter((b) => b.shbg);
  if (coTui && cbTui.length) duyetTui(db, ctx, (u) => { for (const b of cbTui) b.tui(u); });
  if (coTui && coBuuGui && cbShbg.length) duyetShbg(db, ctx, (u) => { for (const b of cbShbg) b.shbg(u); });
  return { ctx, boDems };
}

const khoangRa = (ctx) => ({ tuNgay: ctx.tuNgay, denNgay: ctx.denNgay, bayGio: ctx.bayGio });
const sapXep = (ds, ...khoa) => ds.sort((a, b) => {
  for (const k of khoa) {
    const x = typeof k === 'function' ? k(a) : a[k];
    const y = typeof k === 'function' ? k(b) : b[k];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
});
const lay = (map, khoa, tao) => { let v = map.get(khoa); if (!v) { v = tao(); map.set(khoa, v); } return v; };

// ------------------------------------------
// Sản lượng
// ------------------------------------------
function boDemSanLuong(ctx) {
  const o = new Map(); // ngày|chiều|luồng|nhóm
  const tong = new Map(); // ngày|chiều|luồng
  const oMoi = (ngay, chieu, luong, nhom) => lay(o, `${ngay}|${chieu}|${luong}|${nhom}`, () => ({ ngay, chieu, luong, nhom, tui: 0, shbg: 0, khoiLuongGam: 0, _tui: new Set() }));
  const tongMoi = (ngay, chieu, luong) => lay(tong, `${ngay}|${chieu}|${luong}`, () => ({ ngay, chieu, luong, tui: 0, shbg: 0, khoiLuongGam: 0, khoiLuongTuiKg: 0, _tui: new Set() }));
  const themTui = (c, tg, id, kg) => {
    if (!c._tui.has(id)) { c._tui.add(id); c.tui++; }
    if (!tg._tui.has(id)) { tg._tui.add(id); tg.tui++; tg.khoiLuongTuiKg += kg || 0; }
  };
  return {
    canNgayDi: true,
    tui(u) {
      const ngay = u.chieu === CHIEU.DEN ? u.ngayDen : u.ngayDi;
      if (!trongKhoang(ngay, ctx)) return;
      if (u.chieu !== CHIEU.CHUYEN_TIEP_DI && u.nShbg > 0) return; // túi có bưu gửi: tính ở lượt SHBG (nhóm theo đích từng bưu gửi)
      themTui(oMoi(ngay, u.chieu, u.luong, u.nhom), tongMoi(ngay, u.chieu, u.luong), u.id, u.kg);
    },
    shbg(u) {
      const daOo = new Set();
      const daTong = new Set();
      for (const c of u.cells) {
        if (!trongKhoang(c.ngay, ctx)) continue;
        const cell = oMoi(c.ngay, c.chieu, c.luong, c.nhom);
        const tg = tongMoi(c.ngay, c.chieu, c.luong);
        if (!daOo.has(cell)) { daOo.add(cell); cell.shbg++; cell.khoiLuongGam += u.gam || 0; }
        if (!daTong.has(tg)) { daTong.add(tg); tg.shbg++; tg.khoiLuongGam += u.gam || 0; }
        if (c.chieu !== CHIEU.CHUYEN_TIEP_DI) themTui(cell, tg, c.tuiId, c.kg); // túi chuyển tiếp đi đã đếm ở lượt túi
      }
    },
    ketQua() {
      const bo = (c) => { const { _tui, ...ra } = c; return ra; };
      const thuTu = (c) => THU_TU_CHIEU.indexOf(c.chieu);
      const theoNgay = sapXep([...o.values()].map(bo), 'ngay', thuTu, 'luong', 'nhom');
      const tongRa = sapXep([...tong.values()].map(bo), 'ngay', thuTu, 'luong');
      const tongCong = {};
      for (const ch of THU_TU_CHIEU) tongCong[ch] = { tui: 0, shbg: 0, khoiLuongGam: 0, khoiLuongTuiKg: 0 };
      for (const t of tongRa) {
        const c = tongCong[t.chieu];
        c.tui += t.tui; c.shbg += t.shbg; c.khoiLuongGam += t.khoiLuongGam; c.khoiLuongTuiKg += t.khoiLuongTuiKg;
      }
      return { khoangNgay: khoangRa(ctx), theoNgay, tong: tongRa, tongCong };
    }
  };
}

// ------------------------------------------
// Tồn treo (ảnh chụp tại bayGio)
// ------------------------------------------
function boDemTreo(ctx) {
  const theoLoai = new Map();
  const theoBcvh = new Map();
  const theoTuoi = new Map();
  const theoNgay = new Map();
  const r = { tui: 0, shbg: 0, chuaDenNguong: 0, khongCoMocQuetDen: 0 };
  return {
    tui(u) {
      if (!u.treo || !u.trongKhoangDen || !u.canTinhTreo) return;
      const ngay = lay(theoNgay, u.ngayDen, () => ({ ngay: u.ngayDen, tong: 0, treo: 0 }));
      ngay.tong++;
      const tt = u.treo.trangThai;
      if (tt === 'CHUA_DEN_NGUONG') { r.chuaDenNguong++; return; }
      if (tt === 'KHONG_CO_MOC_QUET_DEN') { r.khongCoMocQuetDen++; return; }
      if (tt !== 'CHUA_QUET_DI' && tt !== 'CHUA_MO_TUI') return;
      const n = u.nShbg || 0;
      ngay.treo++;
      r.tui++; r.shbg += n;
      const a = lay(theoLoai, `${tt}|${u.nhom}|${u.treo.tuoi}`, () => ({ loai: tt, nhom: u.nhom, tuoi: u.treo.tuoi, tui: 0, shbg: 0 }));
      a.tui++; a.shbg += n;
      const bcvh = u.maBcvh || 'KHONG_RO_BCVH';
      const b = lay(theoBcvh, bcvh, () => ({ maBcvh: bcvh, tui: 0, shbg: 0 }));
      b.tui++; b.shbg += n;
      const c = lay(theoTuoi, u.treo.tuoi, () => ({ tuoi: u.treo.tuoi, tui: 0, shbg: 0 }));
      c.tui++; c.shbg += n;
    },
    ketQua() {
      return {
        khoangNgay: khoangRa(ctx),
        treoPhut: ctx.nguong.treoPhut,
        tong: { tui: r.tui, shbg: r.shbg },
        theoLoai: sapXep([...theoLoai.values()], 'loai', 'nhom', 'tuoi'),
        theoTuoi: sapXep([...theoTuoi.values()], 'tuoi'),
        theoBcvh: sapXep([...theoBcvh.values()], (x) => -x.tui, 'maBcvh'),
        theoNgay: sapXep([...theoNgay.values()], 'ngay'),
        chuaDenNguong: r.chuaDenNguong,
        khongCoMocQuetDen: r.khongCoMocQuetDen
      };
    }
  };
}

// ------------------------------------------
// Chuyến
// ------------------------------------------
const TRANG_THAI_CHUYEN = ['DUNG_CHUYEN', 'TRE_CHUYEN', 'LO_CHUYEN', 'CHUA_DEN_MOC'];

function boDemChuyen(ctx) {
  const o = new Map(); // ngày|bcvh|chuyến|nguồn
  const gio = new Map(); // giờ quét đến|chuyến|nguồn
  const satGio = new Map(); // bcvh|chuyến sát giờ|nguồn
  const khongApDung = new Map(); // lyDo|nguồn
  const tre2Ngay = (c, gioDi) => c.trangThai === 'TRE_CHUYEN' && gioDi && ctx.giay(gioDi) - ctx.giay(c.chuyenDuKien.moc) >= 2 * GIAY_NGAY;
  const ghi = (nguon, u, soLuong) => {
    const c = u.chuyen;
    if (!c) return;
    const donVi = nguon === NGUON.CHUYEN_TIEP_DI ? 'TUI' : 'SHBG';
    if (c.trangThai === 'KHONG_AP_DUNG') {
      lay(khongApDung, `${c.lyDo}|${nguon}`, () => ({ lyDo: c.lyDo, nguon, donVi, soLuong: 0 })).soLuong += soLuong;
      return;
    }
    const ten = c.chuyenDuKien.ten;
    const a = lay(o, `${u.ngayDen}|${u.maBcvh}|${ten}|${nguon}`, () => ({
      ngay: u.ngayDen, maBcvh: u.maBcvh, chuyen: ten, nguon, donVi, tong: 0,
      DUNG_CHUYEN: 0, TRE_CHUYEN: 0, LO_CHUYEN: 0, CHUA_DEN_MOC: 0, soChuyenTre: 0, treTu2Ngay: 0
    }));
    a.tong += soLuong;
    a[c.trangThai] += soLuong;
    a.soChuyenTre += (c.soChuyenTre || 0) * soLuong;
    if (tre2Ngay(c, u.gioDi)) a.treTu2Ngay += soLuong;
    const g = gioCuaGio(u.quetDen);
    const h = lay(gio, `${g}|${ten}|${nguon}`, () => ({ gio: g, chuyen: ten, nguon, donVi, tong: 0, dungChuyen: 0, treChuyen: 0 }));
    h.tong += soLuong;
    if (c.trangThai === 'DUNG_CHUYEN') h.dungChuyen += soLuong;
    else if (c.trangThai === 'TRE_CHUYEN' || c.trangThai === 'LO_CHUYEN') h.treChuyen += soLuong;
    if (c.denSatGio) {
      const s = lay(satGio, `${u.maBcvh}|${c.chuyenSatGio.ten}|${nguon}`, () => ({ maBcvh: u.maBcvh, chuyen: c.chuyenSatGio.ten, nguon, donVi, soDenSatGio: 0, kipChuyenSat: 0, sangChuyenKe: 0, chuaDi: 0 }));
      s.soDenSatGio += soLuong;
      if (c.kipChuyenSat === true) s.kipChuyenSat += soLuong;
      else if (c.kipChuyenSat === false) s.sangChuyenKe += soLuong;
      else s.chuaDi += soLuong;
    }
  };
  const chotTruocPhut = [ctx.lichChuyen.hanDenTruocChuyenPhut]; // hạn hàng đến trước giờ xe rời KTT (ktt_lich_cau_hinh); một giá trị chung cho mọi chuyến
  return {
    tui(u) {
      if (u.chieu !== CHIEU.CHUYEN_TIEP_DI || !u.trongKhoangDen || u.canKiemTraLai || !u.maBcvh) return;
      ghi(NGUON.CHUYEN_TIEP_DI, u, 1);
    },
    shbg(u) {
      if (!u.trongKhoangDen || u.canKiemTraLai || !u.maBcvh) return;
      ghi(NGUON.KHAI_THAC_LAI, u, 1);
    },
    ketQua() {
      const theoBcvhChuyen = sapXep([...o.values()], 'ngay', 'maBcvh', 'chuyen', 'nguon');
      const nguonNgay = new Map();
      for (const a of theoBcvhChuyen) {
        const n = lay(nguonNgay, `${a.ngay}|${a.nguon}`, () => ({ ngay: a.ngay, nguon: a.nguon, donVi: a.donVi, tong: 0, daCham: 0, dungChuyen: 0, treChuyen: 0, loChuyen: 0 }));
        n.tong += a.tong; n.dungChuyen += a.DUNG_CHUYEN; n.treChuyen += a.TRE_CHUYEN; n.loChuyen += a.LO_CHUYEN;
        n.daCham += a.DUNG_CHUYEN + a.TRE_CHUYEN + a.LO_CHUYEN;
      }
      return {
        khoangNgay: khoangRa(ctx),
        chotTruocPhut,
        theoBcvhChuyen,
        theoNgay: sapXep([...nguonNgay.values()], 'ngay', 'nguon'),
        theoGioQuetDen: sapXep([...gio.values()], 'nguon', 'gio', 'chuyen'),
        denSatGio: sapXep([...satGio.values()], 'maBcvh', 'chuyen', 'nguon'),
        khongApDung: sapXep([...khongApDung.values()], 'lyDo', 'nguon')
      };
    }
  };
}

// ------------------------------------------
// Nằm lâu
// ------------------------------------------
function boDemNamLau(ctx) {
  const o = new Map();
  const ghi = (nguon, u) => {
    if (!u.trongKhoangDen || u.canKiemTraLai || !u.nam || !u.nam.daDi || u.bac === null) return;
    const donVi = nguon === NGUON.CHUYEN_TIEP_DI ? 'TUI' : 'SHBG';
    const caQuet = dayDem(gioCuaGio(u.quetDen));
    const a = lay(o, `${nguon}|${u.luong}|${caQuet}|${u.nhom}|${u.bac}`, () => ({ nguon, donVi, luong: u.luong, caQuet, nhom: u.nhom, bac: u.bac, soDon: 0, namLau: 0, namLauTreChuyen: 0, namLauQuaNguong: 0 }));
    a.soDon++;
    if (u.namLau && u.namLau.trangThai === 'NAM_LAU') {
      a.namLau++;
      if (u.namLau.lyDo === 'TRE_CHUYEN') a.namLauTreChuyen++; else a.namLauQuaNguong++;
    }
  };
  return {
    tui(u) { if (u.chieu === CHIEU.CHUYEN_TIEP_DI) ghi(NGUON.CHUYEN_TIEP_DI, u); },
    shbg(u) { ghi(NGUON.KHAI_THAC_LAI, u); },
    ketQua() {
      const theoBac = sapXep([...o.values()], 'nguon', 'luong', 'caQuet', 'nhom', 'bac');
      const tongNguon = {};
      for (const a of theoBac) {
        const t = tongNguon[a.nguon] || (tongNguon[a.nguon] = { donVi: a.donVi, daDi: 0, daDiBcvhHue: 0, namLau: 0 });
        t.daDi += a.soDon; t.namLau += a.namLau;
        if (a.nhom === T.NHOM_DICH.BCVH_HUE) t.daDiBcvhHue += a.soDon;
      }
      return { khoangNgay: khoangRa(ctx), namLauToiDaPhut: ctx.nguong.namLauToiDaPhut, theoBac, tongNguon };
    }
  };
}

// ------------------------------------------
// Chỉ tiêu F1.3
// ------------------------------------------
function boDemChiTieu(ctx) {
  const theoBcvh = new Map();
  const tongCong = { soDoDuoc: 0, XND_SAU_GIO_DI: 0, CHUA_XAC_NHAN_DEN: 0, CAN_KIEM_TRA_LAI: 0, THIEU_BAY_GIO: 0, quy: Object.fromEntries(DAI_QUY.map((d) => [d, 0])) };
  return {
    shbg(u) {
      if (!u.f13 || !u.trongKhoangDen || u.f13.trangThai === 'KHONG_CHAM') return;
      const b = lay(theoBcvh, u.maBcvh, () => ({ maBcvh: u.maBcvh, tong: 0, soDoDuoc: 0, XND_SAU_GIO_DI: 0, CHUA_XAC_NHAN_DEN: 0, CAN_KIEM_TRA_LAI: 0, THIEU_BAY_GIO: 0, quy: Object.fromEntries(DAI_QUY.map((d) => [d, 0])) }));
      const tt = u.f13.trangThai;
      b.tong++;
      if (tt === 'DO_DUOC') {
        const dai = daiQuy(u.f13.conLaiGiay); // KHÔNG làm tròn số âm về 0
        b.soDoDuoc++; b.quy[dai]++; tongCong.soDoDuoc++; tongCong.quy[dai]++;
      } else { b[tt]++; tongCong[tt]++; }
    },
    ketQua() {
      return { khoangNgay: khoangRa(ctx), theoBcvh: sapXep([...theoBcvh.values()], 'maBcvh'), tongCong: { tong: tongCong.soDoDuoc + tongCong.XND_SAU_GIO_DI + tongCong.CHUA_XAC_NHAN_DEN + tongCong.CAN_KIEM_TRA_LAI + tongCong.THIEU_BAY_GIO, ...tongCong } };
    }
  };
}

// ------------------------------------------
// Chất lượng dữ liệu (dùng cho tổng hợp và nhận xét)
// ------------------------------------------
function boDemChatLuong(ctx) {
  const bd10Den = new Set();
  const bd10DenChuaXnd = new Set();
  const r = { shbgKhaiThacLai: 0, shbgKhongRoDich: 0, shbgCanKiemTraLai: 0, tuiCanKiemTraLai: 0, tuiChuyenTiepDi: 0 };
  return {
    tui(u) {
      if (u.chieu === CHIEU.DEN && u.trongKhoangDen && u.bd10Den) {
        bd10Den.add(u.bd10Den);
        if (!u.xndBd10) bd10DenChuaXnd.add(u.bd10Den);
      }
      if (u.chieu === CHIEU.CHUYEN_TIEP_DI && u.trongKhoangDen) {
        r.tuiChuyenTiepDi++;
        if (u.canKiemTraLai) r.tuiCanKiemTraLai++;
      }
    },
    shbg(u) {
      if (!u.trongKhoangDen) return;
      r.shbgKhaiThacLai++;
      if (u.nhom === T.NHOM_DICH.KHONG_RO) r.shbgKhongRoDich++;
      if (u.canKiemTraLai) r.shbgCanKiemTraLai++;
    },
    ketQua() {
      return { ...r, bd10Den: bd10Den.size, bd10DenChuaXacNhan: bd10DenChuaXnd.size };
    }
  };
}

// ------------------------------------------
// Chi tiết (danh sách mở từ nhận xét)
// ------------------------------------------
const THEO_LOAI = {
  treo: { tui: (u) => !!u.treo && (u.treo.trangThai === 'CHUA_QUET_DI' || u.treo.trangThai === 'CHUA_MO_TUI') },
  nam_lau: { tui: (u) => !!u.namLau && u.namLau.trangThai === 'NAM_LAU', shbg: (u) => !!u.namLau && u.namLau.trangThai === 'NAM_LAU' },
  tre_chuyen: { tui: (u) => !!u.chuyen && u.chuyen.trangThai === 'TRE_CHUYEN', shbg: (u) => !!u.chuyen && u.chuyen.trangThai === 'TRE_CHUYEN' },
  lo_chuyen: { tui: (u) => !!u.chuyen && u.chuyen.trangThai === 'LO_CHUYEN', shbg: (u) => !!u.chuyen && u.chuyen.trangThai === 'LO_CHUYEN' },
  den_sat_gio: { tui: (u) => !!u.chuyen && u.chuyen.denSatGio, shbg: (u) => !!u.chuyen && u.chuyen.denSatGio },
  xnd_sau_gio_di: { shbg: (u) => !!u.f13 && u.f13.trangThai === 'XND_SAU_GIO_DI' },
  can_kiem_tra_lai: { tui: (u) => u.chieu === CHIEU.CHUYEN_TIEP_DI && u.canKiemTraLai, shbg: (u) => u.canKiemTraLai },
  khong_ro_dich: { shbg: (u) => u.nhom === T.NHOM_DICH.KHONG_RO },
  quet_den_sau_gio_di: { tui: (u) => !!u.nam && u.nam.trangThai === 'QUET_DEN_SAU_GIO_DI', shbg: (u) => !!u.nam && u.nam.trangThai === 'QUET_DEN_SAU_GIO_DI' }
};

function dongChiTiet(u) {
  const c = u.chuyen;
  const ra = {
    donVi: u.donVi, shbg: u.shbg || null, tuiId: u.donVi === 'TUI' ? u.id : null, soHieuBd8: u.soHieuBd8, chieu: u.chieu || null, luong: u.luong,
    bd10Den: u.bd10Den, bd10Di: u.bd10Di, nhom: u.nhom, maBcvh: u.maBcvh, nguonDich: u.nguonDich,
    quetDen: u.quetDen, xndBd10: u.xndBd10, xnd: u.xnd === undefined ? null : u.xnd, gioDi: u.gioDi, ngayDen: u.ngayDen,
    soShbg: u.donVi === 'TUI' ? u.nShbg : null,
    trangThaiChuyen: c ? c.trangThai : null, chuyenDuKien: c && c.chuyenDuKien ? c.chuyenDuKien.ten : null, mocDuKien: c && c.chuyenDuKien ? c.chuyenDuKien.moc : null,
    soChuyenTre: c ? c.soChuyenTre : null, denSatGio: c ? c.denSatGio : false, kipChuyenSat: c ? c.kipChuyenSat : null,
    giayNam: u.nam ? u.nam.giay : null, bacNam: u.bac, trangThaiNamLau: u.namLau ? u.namLau.trangThai : null, lyDoNamLau: u.namLau ? u.namLau.lyDo : null,
    trangThaiTreo: u.treo ? u.treo.trangThai : null, tuoiGiay: u.treo ? u.treo.tuoiGiay : null, tuoiTreo: u.treo ? u.treo.tuoi : null,
    trangThaiF13: u.f13 ? u.f13.trangThai : null, conLaiGiay: u.f13 ? u.f13.conLaiGiay : null,
    canKiemTraLai: u.canKiemTraLai
  };
  return ra;
}

function boDemChiTiet(ctx, loc) {
  const dk = THEO_LOAI[loc.loai];
  const batDau = (loc.trang - 1) * loc.kichThuocTrang;
  const dong = [];
  let tong = 0;
  const ghi = (u) => {
    if (loc.maBcvh && u.maBcvh !== loc.maBcvh) return;
    if (tong >= batDau && dong.length < loc.kichThuocTrang) dong.push(dongChiTiet(u));
    tong++;
  };
  const bo = { };
  if (dk.tui) bo.tui = (u) => { if (u.trongKhoangDen && dk.tui(u)) ghi(u); };
  if (dk.shbg) bo.shbg = (u) => { if (u.trongKhoangDen && dk.shbg(u)) ghi(u); };
  bo.ketQua = () => ({
    khoangNgay: khoangRa(ctx), loai: loc.loai, maBcvh: loc.maBcvh || null,
    tong, trang: loc.trang, kichThuocTrang: loc.kichThuocTrang, soTrang: Math.ceil(tong / loc.kichThuocTrang), dong
  });
  return bo;
}

function chuanHoaLocChiTiet(opts) {
  const loai = opts && opts.loai;
  if (!LOAI_CHI_TIET.includes(loai)) throw new LoiKtt('KTT_LOAI_SAI', `loai phải thuộc: ${LOAI_CHI_TIET.join(', ')}.`);
  const maBcvh = opts.maBcvh === undefined || opts.maBcvh === null || opts.maBcvh === '' ? null : String(opts.maBcvh).trim();
  if (maBcvh !== null && !T.MA_BCVH_HUE.includes(maBcvh)) throw new LoiKtt('KTT_BCVH_SAI', 'maBcvh phải là một trong 6 BCVH Huế.');
  const nguyen = (x, macDinh) => { const n = x === undefined || x === null ? macDinh : Number(x); return Number.isInteger(n) && n >= 1 ? n : null; };
  const trang = nguyen(opts.trang, 1);
  const kichThuoc = nguyen(opts.kichThuocTrang, TRANG_MAC_DINH);
  if (trang === null || kichThuoc === null) throw new LoiKtt('KTT_TRANG_SAI', 'trang và kichThuocTrang phải là số nguyên dương.');
  return { loai, maBcvh, trang, kichThuocTrang: Math.min(kichThuoc, TRANG_TOI_DA) };
}

// ------------------------------------------
// API công khai
// ------------------------------------------
/** Sản lượng theo ngày × chiều × luồng × nhóm đích. Xem docs/ai/38_KTT_TRUY_VAN.md. */
function sanLuongTheoNgay(db, opts) {
  const { boDems } = chay(db, opts, (ctx) => [boDemSanLuong(ctx)]);
  return boDems[0].ketQua();
}

/** Ảnh chụp «treo» tại `bayGio`, theo loại × nhóm đích × bậc tuổi. */
function tonTreo(db, opts) {
  const { boDems } = chay(db, opts, (ctx) => [boDemTreo(ctx)]);
  return boDems[0].ketQua();
}

/** Chuyến theo BCVH Huế × chuyến (ngày theo ngày quét đến) + «đến sát giờ». */
function chuyenTheoBcvh(db, opts) {
  const { boDems } = chay(db, opts, (ctx) => [boDemChuyen(ctx)]);
  return boDems[0].ketQua();
}

/** Phân bố bậc nằm lâu của hàng ĐÃ đi, tách theo luồng và ngày/đêm của giờ quét đến. */
function namLauTheoBac(db, opts) {
  const { boDems } = chay(db, opts, (ctx) => [boDemNamLau(ctx)]);
  return boDems[0].ketQua();
}

/** Chỉ tiêu F1.3 cho SHBG đích 6 BCVH Huế, theo BCVH. */
function chiTieuF13(db, opts) {
  const { boDems } = chay(db, opts, (ctx) => [boDemChiTieu(ctx)]);
  return boDems[0].ketQua();
}

/** Danh sách chi tiết (lọc `loai`, `maBcvh`, khoảng ngày; phân trang tối đa 200 dòng/trang; có `tong`). */
function chiTiet(db, opts) {
  const loc = chuanHoaLocChiTiet(opts);
  const o = opts.ngay ? { ...opts, tuNgay: opts.ngay, denNgay: opts.ngay } : opts;
  const { boDems } = chay(db, o, (ctx) => [boDemChiTiet(ctx, loc)]);
  return boDems[0].ketQua();
}

/** Gộp các mục trên (MỘT lượt đọc) + `canhBao` + `khoangNgay`. */
function tongHopKtt(db, opts) {
  const { ctx, boDems } = chay(db, opts, (c) => [boDemSanLuong(c), boDemTreo(c), boDemChuyen(c), boDemNamLau(c), boDemChiTieu(c), boDemChatLuong(c)]);
  const [sanLuong, treo, chuyen, namLau, chiTieu, chatLuong] = boDems.map((b) => b.ketQua());
  const canhBao = [...ctx.canhBao];
  for (const k of chuyen.khongApDung) {
    if (k.lyDo === 'KHONG_CO_LICH') canhBao.push(`${k.soLuong} ${k.donVi === 'TUI' ? 'túi' : 'bưu gửi'} đích BCVH Huế không có lịch chuyến trong cấu hình: không chấm chuyến.`);
  }
  if (chatLuong.shbgKhongRoDich > 0) canhBao.push(`${chatLuong.shbgKhongRoDich} bưu gửi không rõ đích (không tra được phường/xã): không chấm chỉ tiêu F1.3 và chuyến.`);
  if (chatLuong.shbgCanKiemTraLai + chatLuong.tuiCanKiemTraLai > 0) canhBao.push('Có hàng hai mốc cách nhau quá 7 ngày («Cần kiểm tra lại»): không vào thống kê chính.');
  return {
    khoangNgay: khoangRa(ctx), canhBao,
    sanLuong, tonTreo: treo, chuyen, namLau, chiTieuF13: chiTieu, chatLuongDuLieu: chatLuong
  };
}

module.exports = {
  LoiKtt, CHIEU, NGUON, LOAI_CHI_TIET, DAI_QUY, TRANG_THAI_CHUYEN, TRANG_TOI_DA,
  bayGioMacDinh, chuanHoaKhoang, chayBoDem: chay, ngayHopLe, ngayKeTiep, // KTT-7b: kttLuuThoatQuery.js dùng lại lượt đọc SHBG
  sanLuongTheoNgay, tonTreo, chuyenTheoBcvh, namLauTheoBac, chiTieuF13, chiTiet, tongHopKtt
};
