// ==========================================
// «Hàng tại KTT» — trang «Lưu thoát» (KTT-7b): phân loại MỘT SHBG vào năm trạng thái lưu thoát, đạt / không đạt chỉ tiêu 14 giờ, hàng hoàn (ItemReturn),
// và bộ cộng theo ngày × BCVH. CÁC HÀM THUẦN: không DB, không giờ máy («bây giờ» luôn là tham số `bayGio`), không new Date(chuỗi) / Date.parse / Date.now.
// Phần truy vấn (đọc ktt_*) nằm ở server/lib/kttLuuThoatQuery.js. Tài liệu: docs/ai/41_KTT_LUU_THOAT.md.
//
// Mốc dùng (mỗi chỉ số ghi rõ ở trường `moc`):
//   - ngày đến D, xếp chuyến, năm trạng thái: Gio_quet_tui_den (gio_quet_tui_den) — PO xác nhận 26/10/2026;
//   - đã đi: giờ LẬP BD10 đi (bd10_di_gio_di, SendingTime);
//   - đạt / không đạt: ConfirmDate (bd10_den_xnd) -> giờ lập BD10 đi, trừ khung đêm 21:00–07:00 (quyThoiGian.js), chỉ tiêu quyThoiGianChiTieu.chiTieuGio.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const { thoiGianThucGiay } = require('./quyThoiGian');
const { chiTieuGio } = require('./quyThoiGianChiTieu');

const GIO_CHOT_NGAY = '09:00:00'; // số của ngày D chỉ chốt sau cặp 09:00 của D+1
const SO_NGAY_TOI_DA = 31;

const NHOM = Object.freeze({
  PHAN_LOAI: 'PHAN_LOAI', HANG_HOAN: 'HANG_HOAN', KHONG_RO_DICH: 'KHONG_RO_DICH', NGOAI_PHAM_VI: 'NGOAI_PHAM_VI',
  KHONG_CO_GIO_QUET_DEN: 'KHONG_CO_GIO_QUET_DEN', KHONG_XEP_DUOC_CHUYEN: 'KHONG_XEP_DUOC_CHUYEN'
});
const TRANG_THAI = Object.freeze({ T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', DANG_CHO_CHUYEN: 'DANG_CHO_CHUYEN' });
const DAT = Object.freeze({ DAT: 'DAT', KHONG_DAT: 'KHONG_DAT', CHUA_DI: 'CHUA_DI', CHUA_DO_DUOC: 'CHUA_DO_DUOC', XND_SAU_GIO_DI: 'XND_SAU_GIO_DI' });
const MOC = Object.freeze({
  luu_thoat: 'gio_quet_tui_den', xep_chuyen: 'gio_quet_tui_den', gio_di: 'bd10_di_gio_di', chi_tieu: 'bd10_den_xnd -> bd10_di_gio_di'
});

// KTT-10b: hai mốc BẮT ĐẦU của chỉ tiêu «đạt 14 giờ» (đều kết thúc ở giờ lập BD10 đi). Đo song song cả hai; tham số chỉ chọn mốc nào nuôi khối `dat_khong_dat` cũ (mặc định `xnd` = hành vi cũ).
const MOC_CHI_TIEU = Object.freeze({ XND: 'xnd', QUET_TUI_DEN: 'quet_tui_den' });
const MOC_CHI_TIEU_MAC_DINH = MOC_CHI_TIEU.XND;
const NHAN_MOC_CHI_TIEU = Object.freeze({ xnd: 'bd10_den_xnd -> bd10_di_gio_di', quet_tui_den: 'gio_quet_tui_den -> bd10_di_gio_di' });
const hopLeMocChiTieu = (m) => m === MOC_CHI_TIEU.XND || m === MOC_CHI_TIEU.QUET_TUI_DEN;
// Kết quả theo mốc (khối `chi_tieu_14h`): đo được = DAT | KHONG_DAT; không đo được = THIEU_MOC | MOC_SAU_GIO_DI | CHUA_DI.
const DO_MOC = Object.freeze({ DAT: 'DAT', KHONG_DAT: 'KHONG_DAT', THIEU_MOC: 'THIEU_MOC', MOC_SAU_GIO_DI: 'MOC_SAU_GIO_DI', CHUA_DI: 'CHUA_DI' });

const giay = (x) => (typeof x === 'string' ? L.giayCua(x) : null);
const ngayCua = (g) => L.dinhDang(g).slice(0, 10);
const ngayKe = (ymd) => ngayCua(L.giayCua(`${ymd} 00:00:00`) + 86400);
const tuNgayDen = (tu, den) => { const ds = []; for (let d = tu; d <= den; d = ngayKe(d)) ds.push(d); return ds; };

// ------------------------------------------
// Đạt / không đạt chỉ tiêu (ConfirmDate -> giờ lập BD10 đi; chưa đi -> bayGio)
// ------------------------------------------
/**
 * { xnd (bd10_den_xnd), gioLapBd10Di, bayGio, maBcvh, tenPhuong }. Trả { trangThai: DAT | KHONG_DAT | CHUA_DI | CHUA_DO_DUOC | XND_SAU_GIO_DI, thucGiay, chiTieuGio }.
 *  - chưa xác nhận đến (xnd rỗng / sai): CHUA_DO_DUOC (không tính đạt / không đạt);
 *  - xác nhận đến SAU khi đã đi: XND_SAU_GIO_DI (kết quả âm, không làm tròn về 0; không tính đạt / không đạt);
 *  - đã đi: DAT nếu thực tế (trừ khung đêm) ≤ chỉ tiêu (đúng biên 14:00:00 là đạt, 14:00:01 là không đạt), ngược lại KHONG_DAT;
 *  - chưa đi: tính tới bayGio — đã quá chỉ tiêu thì KHONG_DAT, chưa thì CHUA_DI.
 */
function danhGiaChiTieu({ xnd, gioLapBd10Di, bayGio, maBcvh, tenPhuong } = {}) {
  return tinhTuMoc(xnd, { gioLapBd10Di, bayGio, maBcvh, tenPhuong });
}

/** Lõi dùng chung cho mốc A (batDau = xnd) và mốc B (batDau = giờ quét túi đến); nhãn trả về là nhãn CŨ (DAT.*): «mốc rỗng» = CHUA_DO_DUOC, «mốc sau giờ đi» = XND_SAU_GIO_DI. */
function tinhTuMoc(batDau, { gioLapBd10Di, bayGio, maBcvh, tenPhuong } = {}) {
  const gio = chiTieuGio(maBcvh, tenPhuong);
  const ra = (trangThai, thucGiay = null) => ({ trangThai, thucGiay, chiTieuGio: gio });
  if (giay(batDau) === null) return ra(DAT.CHUA_DO_DUOC);
  const co = giay(gioLapBd10Di) !== null;
  const cuoi = co ? gioLapBd10Di : bayGio;
  const thuc = thoiGianThucGiay(batDau, cuoi);
  if (thuc === null) return ra(DAT.CHUA_DO_DUOC);
  if (co) {
    if (giay(gioLapBd10Di) < giay(batDau)) return ra(DAT.XND_SAU_GIO_DI, thuc);
    return ra(thuc <= gio * 3600 ? DAT.DAT : DAT.KHONG_DAT, thuc);
  }
  if (thuc < 0) return ra(DAT.CHUA_DI, thuc);
  return ra(thuc <= gio * 3600 ? DAT.CHUA_DI : DAT.KHONG_DAT, thuc);
}

/**
 * KTT-10b: kết quả «đạt 14 giờ» của MỘT mốc, tách phần đo được khỏi phần không đo được. d = kết quả tinhTuMoc; coGioDi = đã có giờ lập BD10 đi; coMoc = mốc bắt đầu đọc được.
 *  - đo được = đã đi VÀ mốc ≤ giờ đi: DAT | KHONG_DAT;
 *  - không đo được: THIEU_MOC (mốc vắng), MOC_SAU_GIO_DI (mốc sau giờ lập BD10 đi), CHUA_DI (chưa có giờ lập BD10 đi).
 * `chuaDiQuaChiTieu`: chưa đi mà tới bayGio đã quá chỉ tiêu (khối `dat_khong_dat` cũ tính hàng này là không đạt; ở đây vẫn là «chưa đi», chỉ ghi lại để đối chiếu).
 */
function ketQuaTheoMoc(d, coGioDi, coMoc) {
  let trangThai;
  if (!coMoc) trangThai = DO_MOC.THIEU_MOC;
  else if (d.trangThai === DAT.XND_SAU_GIO_DI) trangThai = DO_MOC.MOC_SAU_GIO_DI;
  else if (!coGioDi) trangThai = DO_MOC.CHUA_DI;
  else if (d.trangThai === DAT.DAT) trangThai = DO_MOC.DAT;
  else if (d.trangThai === DAT.KHONG_DAT) trangThai = DO_MOC.KHONG_DAT;
  else trangThai = DO_MOC.THIEU_MOC;
  return { trangThai, thucGiay: d.thucGiay, chiTieuGio: d.chiTieuGio, chuaDiQuaChiTieu: !coGioDi && coMoc && d.trangThai === DAT.KHONG_DAT };
}

// ------------------------------------------
// Phân loại một SHBG
// ------------------------------------------
/**
 * u: { ngayDen (D), nhom ('BCVH_HUE' | 'HE1_530900' | 'KTT' | 'KHAC' | 'KHONG_RO'), maBcvh, noiGuiGoc (nơi gửi BD10 của túi đến GỐC), quetDen (Gio_quet_tui_den),
 *      gioBd10Di (giờ lập BD10 đi), xndBd10 (bd10_den_xnd), tenPhuong }.
 * ngu: { lich (dòng lịch chuyến), hanPhut, bayGio }.
 * Trả { nhom: NHOM.*, ... }. PHAN_LOAI / HANG_HOAN kèm { maBcvh, trangThai (T1..T5 | DANG_CHO_CHUYEN), chuyenKq ('DUNG' | 'TRUOT' | 'LO' | 'CHUA_DEN_GIO'), chuyen, diTruocKhiDen, datKhongDat }.
 *  Thứ tự: đích không rõ -> ngoài phạm vi (530900, KHAC, KTT) -> hàng chuyển hoàn -> thiếu giờ quét đến -> không xếp được chuyến -> năm trạng thái.
 *  Hàng hoàn = SHBG có trong danh sách ItemReturn (ktt_hang_hoan; `u.hangHoan`, do kttQuery tra từ danh sách) VÀ đích là một trong 6 BCVH Huế (u.nhom = BCVH_HUE; đích không rõ / ngoài 6 BCVH không phải hàng hoàn,
 *  giữ phân loại cũ). Không xét nơi gửi gốc. KTT-17-2 (PO 31/10/2026) thay quy tắc 7b (túi đến gốc từ 531120 và đích 533140).
 */
function phanLoaiShbg(u, ngu) {
  if (u.nhom === 'KHONG_RO') return { nhom: NHOM.KHONG_RO_DICH };
  if (u.nhom !== 'BCVH_HUE') return { nhom: NHOM.NGOAI_PHAM_VI, loaiDich: u.nhom };
  const ma = u.maBcvh;
  const hoan = u.hangHoan === true;
  const goc = { maBcvh: ma };
  const gioDi = giay(u.gioBd10Di) !== null ? u.gioBd10Di : null;
  const tinh = (batDau) => tinhTuMoc(batDau, { gioLapBd10Di: gioDi, bayGio: ngu.bayGio, maBcvh: ma, tenPhuong: u.tenPhuong });
  const mocChon = ngu.mocChiTieu === MOC_CHI_TIEU.QUET_TUI_DEN ? MOC_CHI_TIEU.QUET_TUI_DEN : MOC_CHI_TIEU_MAC_DINH; // KTT-10b: mốc nuôi `datKhongDat` (nhãn cũ); mặc định xnd = như trước
  const datA = mocChon === MOC_CHI_TIEU.XND ? tinh(u.xndBd10) : null;
  const datB = mocChon === MOC_CHI_TIEU.QUET_TUI_DEN ? tinh(u.quetDen) : null;
  const dat = datA || datB;
  const nhomDich = hoan ? NHOM.HANG_HOAN : NHOM.PHAN_LOAI;

  if (giay(u.quetDen) === null) return { ...goc, nhom: hoan ? NHOM.HANG_HOAN : NHOM.KHONG_CO_GIO_QUET_DEN, trangThai: null, datKhongDat: dat };
  const x = L.xepChuyen(ngu.lich, ma, u.quetDen, { hanDenTruocChuyenPhut: ngu.hanPhut });
  if (!x.ok) return { ...goc, nhom: hoan ? NHOM.HANG_HOAN : NHOM.KHONG_XEP_DUOC_CHUYEN, lyDo: x.ly_do, trangThai: null, datKhongDat: dat };
  const dg = L.danhGiaDiChuyen({ chuyen: x.chuyen, gioLapBd10Di: gioDi, bayGio: ngu.bayGio, gioDen: u.quetDen });
  if (dg.trang_thai === null) return { ...goc, nhom: hoan ? NHOM.HANG_HOAN : NHOM.KHONG_XEP_DUOC_CHUYEN, lyDo: dg.ly_do, trangThai: null, datKhongDat: dat };

  const D = u.ngayDen;
  let trangThai;
  let chuyenKq;
  if (gioDi !== null) {
    chuyenKq = dg.trang_thai === 'DUNG_CHUYEN' ? 'DUNG' : 'TRUOT';
    const ngayDi = ngayCua(giay(gioDi));
    if (ngayDi <= D) trangThai = chuyenKq === 'DUNG' ? TRANG_THAI.T1 : TRANG_THAI.T2;
    else if (ngayDi === ngayKe(D)) trangThai = chuyenKq === 'DUNG' ? TRANG_THAI.T3 : TRANG_THAI.T4;
    else trangThai = TRANG_THAI.T5;
  } else if (dg.trang_thai === 'LO_CHUYEN') { trangThai = TRANG_THAI.T5; chuyenKq = 'LO'; } else { trangThai = TRANG_THAI.DANG_CHO_CHUYEN; chuyenKq = 'CHUA_DEN_GIO'; }
  return { ...goc, nhom: nhomDich, trangThai, chuyenKq, chuyen: x.chuyen, diTruocKhiDen: !!dg.di_truoc_khi_den, datKhongDat: dat, ...chiTieu14h(u, gioDi !== null, mocChon === MOC_CHI_TIEU.XND ? dat : tinh(u.xndBd10), mocChon === MOC_CHI_TIEU.QUET_TUI_DEN ? dat : tinh(u.quetDen), tinh) };
}

/**
 * KTT-10b: kết quả SONG SONG hai mốc của một SHBG đã phân loại + cờ chất lượng túi đến (chỉ dùng cho mốc B).
 * Quy tắc chọn túi đến của mốc B: túi đến GHÉP (`u.quetDen`) — giống xếp chuyến / năm trạng thái (KTT-5), xem docs/ai/37_KTT_QUY_TAC_TINH.md mục 6.
 * `khacKetQuaNeuDungTuiGoc`: kết quả mốc B sẽ khác nếu lấy túi đến GỐC (quét sớm nhất) thay vì túi đến ghép — để PO biết quy tắc chọn ảnh hưởng bao nhiêu SHBG.
 */
function chiTieu14h(u, coGioDi, datA, datB, tinh) {
  const coMocA = giay(u.xndBd10) !== null;
  const coMocB = giay(u.quetDen) !== null;
  const a = ketQuaTheoMoc(datA, coGioDi, coMocA);
  const b = ketQuaTheoMoc(datB, coGioDi, coMocB);
  const ghepKhacGoc = u.tuiDenGocId !== undefined && u.tuiDenGocId !== null && u.tuiDenId !== u.tuiDenGocId;
  const khacKetQua = ghepKhacGoc && giay(u.quetDenGoc) !== giay(u.quetDen)
    ? ketQuaTheoMoc(tinh(u.quetDenGoc), coGioDi, giay(u.quetDenGoc) !== null).trangThai !== b.trangThai : false;
  return {
    chiTieu14h: { xnd: a, quet_tui_den: b },
    chatLuongTuiDen: { khongCoTuiDi: u.coTuiDi === false, nhieuTuiDen: (u.soTuiDen || 0) >= 2, ghepKhacGoc, khacKetQuaNeuDungTuiGoc: khacKetQua }
  };
}

// ------------------------------------------
// Bộ cộng
// ------------------------------------------
const KHOA_T = [TRANG_THAI.T1, TRANG_THAI.T2, TRANG_THAI.T3, TRANG_THAI.T4, TRANG_THAI.T5, TRANG_THAI.DANG_CHO_CHUYEN];
const ty = (tu, mau) => (mau > 0 ? tu / mau : null);

// ---- KTT-10b: khối `chi_tieu_14h` (đo song song hai mốc). Mẫu số = SHBG đã phân loại (có trạng thái), cùng phạm vi với `dat_khong_dat`.
const KHOA_MOC = [MOC_CHI_TIEU.XND, MOC_CHI_TIEU.QUET_TUI_DEN];
const tyLe = (tu, mau) => (mau > 0 ? tu / mau : null);

function taoDemChiTieu14h() {
  const moc = () => ({ [DO_MOC.DAT]: 0, [DO_MOC.KHONG_DAT]: 0, [DO_MOC.THIEU_MOC]: 0, [DO_MOC.MOC_SAU_GIO_DI]: 0, [DO_MOC.CHUA_DI]: 0, chuaDiQuaChiTieu: 0, chiODayKhongOKia: 0 });
  return { mauSo: 0, moc: { xnd: moc(), quet_tui_den: moc() }, caHai: 0, cl: { khongCoTuiDi: 0, nhieuTuiDen: 0, ghepKhacGoc: 0, khacKetQua: 0 } };
}

function demChiTieu14h(c, kq) {
  const r = kq.chiTieu14h;
  if (!r) return;
  c.mauSo++;
  const duoc = (m) => r[m].trangThai === DO_MOC.DAT || r[m].trangThai === DO_MOC.KHONG_DAT;
  for (const m of KHOA_MOC) {
    c.moc[m][r[m].trangThai]++;
    if (r[m].chuaDiQuaChiTieu) c.moc[m].chuaDiQuaChiTieu++;
  }
  const a = duoc('xnd');
  const b = duoc('quet_tui_den');
  if (a && b) c.caHai++;
  if (a && !b) c.moc.xnd.chiODayKhongOKia++;
  if (b && !a) c.moc.quet_tui_den.chiODayKhongOKia++;
  const q = kq.chatLuongTuiDen || {};
  if (q.khongCoTuiDi) c.cl.khongCoTuiDi++;
  if (q.nhieuTuiDen) c.cl.nhieuTuiDen++;
  if (q.ghepKhacGoc) c.cl.ghepKhacGoc++;
  if (q.khacKetQuaNeuDungTuiGoc) c.cl.khacKetQua++;
}

/** Khối kết quả (toàn số, cộng được giữa các ngày bằng congChiTieu14h). `do_duoc` là x, `mau_so` là y của «đo được x/y»; KHÔNG có tỷ lệ «đạt» chung. */
function ketQuaChiTieu14h(c, mocChon) {
  const khoi = (m) => {
    const x = c.moc[m];
    const doDuoc = x.DAT + x.KHONG_DAT;
    return {
      moc: NHAN_MOC_CHI_TIEU[m], do_duoc: doDuoc, mau_so: c.mauSo, dat: x.DAT, khong_dat: x.KHONG_DAT,
      ty_le_dat_tren_do_duoc: tyLe(x.DAT, doDuoc), // CHỈ trên phần đo được (do_duoc), KHÔNG phải tỷ lệ chung của mau_so
      khong_do_duoc: { tong: x.THIEU_MOC + x.MOC_SAU_GIO_DI + x.CHUA_DI, thieu_moc: x.THIEU_MOC, moc_sau_gio_di: x.MOC_SAU_GIO_DI, chua_di: x.CHUA_DI },
      chua_di_da_qua_chi_tieu: x.chuaDiQuaChiTieu, // thuộc `chua_di`; khối `dat_khong_dat` cũ tính các SHBG này là không đạt
      do_duoc_khong_do_duoc_o_moc_kia: x.chiODayKhongOKia
    };
  };
  return {
    moc_mac_dinh: mocChon, mau_so: c.mauSo, do_duoc_ca_hai_moc: c.caHai,
    theo_moc: { xnd: khoi('xnd'), quet_tui_den: khoi('quet_tui_den') },
    chat_luong_tui_den: { khong_co_tui_di: c.cl.khongCoTuiDi, nhieu_tui_den: c.cl.nhieuTuiDen, tui_den_ghep_khac_goc: c.cl.ghepKhacGoc, khac_ket_qua_neu_dung_tui_goc: c.cl.khacKetQua }
  };
}

/** Cộng các khối `chi_tieu_14h` (mỗi ngày một khối): cộng mọi số, tính lại tỷ lệ; chuỗi lấy của khối đầu. */
function congChiTieu14h(ds) {
  const cong = (xs) => {
    const m = xs[0];
    if (typeof m === 'number') return xs.reduce((s, x) => s + x, 0);
    if (m && typeof m === 'object') return Object.fromEntries(Object.keys(m).map((key) => [key, cong(xs.map((x) => x[key]))]));
    return m;
  };
  const r = cong(ds);
  for (const m of KHOA_MOC) r.theo_moc[m].ty_le_dat_tren_do_duoc = tyLe(r.theo_moc[m].dat, r.theo_moc[m].do_duoc);
  return r;
}

/** Một khối số liệu (một ngày × một BCVH, hoặc tổng). Đơn vị đếm: SHBG khác nhau; số túi = số túi ĐẾN khác nhau chứa các SHBG đó. opts.mocChiTieu: mốc nuôi `dat_khong_dat` (mặc định xnd). */
function taoKhoi(opts = {}) {
  const mocChon = opts.mocChiTieu === MOC_CHI_TIEU.QUET_TUI_DEN ? MOC_CHI_TIEU.QUET_TUI_DEN : MOC_CHI_TIEU_MAC_DINH;
  const c14 = taoDemChiTieu14h();
  const k = {
    tong: 0, tt: Object.fromEntries(KHOA_T.map((t) => [t, { shbg: 0, tui: new Set() }])),
    dung: 0, truot: 0, lo: 0, t5: { diTuD2Dung: 0, diTuD2Truot: 0, chuaDiLo: 0 },
    dat: Object.fromEntries(Object.values(DAT).map((d) => [d, 0])),
    khongCoGioQuetDen: 0, khongXepDuoc: {}, diTruocKhiDen: 0
  };
  return {
    them(kq, tuiId) {
      k.tong++;
      if (kq.trangThai === null || kq.trangThai === undefined) { // không phân loại được (thiếu giờ quét đến / không xếp được chuyến), kể cả hàng hoàn
        if (kq.lyDo) k.khongXepDuoc[kq.lyDo] = (k.khongXepDuoc[kq.lyDo] || 0) + 1; else k.khongCoGioQuetDen++;
        return;
      }
      const c = k.tt[kq.trangThai];
      c.shbg++;
      if (tuiId !== null && tuiId !== undefined) c.tui.add(tuiId);
      if (kq.trangThai !== TRANG_THAI.DANG_CHO_CHUYEN) {
        if (kq.chuyenKq === 'DUNG') k.dung++; else if (kq.chuyenKq === 'TRUOT') k.truot++; else if (kq.chuyenKq === 'LO') k.lo++;
        if (kq.trangThai === TRANG_THAI.T5) {
          if (kq.chuyenKq === 'DUNG') k.t5.diTuD2Dung++; else if (kq.chuyenKq === 'TRUOT') k.t5.diTuD2Truot++; else k.t5.chuaDiLo++;
        }
      }
      if (kq.diTruocKhiDen) k.diTruocKhiDen++;
      k.dat[kq.datKhongDat.trangThai]++;
      demChiTieu14h(c14, kq);
    },
    ketQua() {
      const tt = Object.fromEntries(KHOA_T.map((t) => [t.toLowerCase(), { shbg: k.tt[t].shbg, tui: k.tt[t].tui.size }]));
      const chot = [TRANG_THAI.T1, TRANG_THAI.T2, TRANG_THAI.T3, TRANG_THAI.T4, TRANG_THAI.T5].reduce((s, t) => s + k.tt[t].shbg, 0);
      const luuThoat = k.tt.T1.shbg + k.tt.T2.shbg;
      return {
        tong_shbg: k.tong,
        trang_thai: tt,
        luu_thoat: { moc: MOC.luu_thoat, tu_so: luuThoat, mau_so: chot, ty_le: ty(luuThoat, chot) },
        dung_chuyen: { moc: MOC.xep_chuyen, tu_so: k.dung, mau_so: chot, ty_le: ty(k.dung, chot), truot_chuyen: k.truot, lo_chuyen: k.lo },
        chi_tiet_trang_thai_5: { di_tu_d2_dung_chuyen: k.t5.diTuD2Dung, di_tu_d2_truot_chuyen: k.t5.diTuD2Truot, chua_di_lo_chuyen: k.t5.chuaDiLo },
        dat_khong_dat: {
          moc: NHAN_MOC_CHI_TIEU[mocChon], dat: k.dat.DAT, khong_dat: k.dat.KHONG_DAT, chua_di: k.dat.CHUA_DI, chua_do_duoc: k.dat.CHUA_DO_DUOC, xnd_sau_gio_di: k.dat.XND_SAU_GIO_DI,
          ty_le_dat: ty(k.dat.DAT, k.dat.DAT + k.dat.KHONG_DAT)
        },
        khong_phan_loai: { khong_co_gio_quet_den: k.khongCoGioQuetDen, khong_xep_duoc_chuyen: { ...k.khongXepDuoc } },
        di_truoc_khi_den: k.diTruocKhiDen,
        chi_tieu_14h: ketQuaChiTieu14h(c14, mocChon)
      };
    }
  };
}

/** Ngày đã chốt chưa: độ mới của dữ liệu (nguon_xuat_luc mới nhất) ≥ 09:00 ngày D+1. So sánh chuỗi giờ (định dạng cố định). */
function daChot(ngay, doMoi, gioChot = GIO_CHOT_NGAY) {
  const gio = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(gioChot)) ? `${gioChot}:00` : GIO_CHOT_NGAY; // KTT-8: giờ chốt là tham số ('HH:MM'); sai dạng -> mặc định 09:00:00
  return typeof doMoi === 'string' && L.giayCua(doMoi) !== null && L.giayCua(doMoi) >= L.giayCua(`${ngayKe(ngay)} ${gio}`);
}

module.exports = {
  GIO_CHOT_NGAY, SO_NGAY_TOI_DA, NHOM, TRANG_THAI, DAT, MOC,
  MOC_CHI_TIEU, MOC_CHI_TIEU_MAC_DINH, NHAN_MOC_CHI_TIEU, DO_MOC, hopLeMocChiTieu,
  danhGiaChiTieu, tinhTuMoc, ketQuaTheoMoc, phanLoaiShbg, taoKhoi, congChiTieu14h, daChot, tuNgayDen, ngayKe
};
