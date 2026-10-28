// ==========================================
// «Hàng tại KTT» — trang «Lưu thoát» (KTT-7b): lớp TRUY VẤN. CHỈ ĐỌC DB (SELECT); tính bằng các hàm thuần của server/lib/kttLuuThoat.js.
// Dùng lại lượt đọc SHBG của kttQuery.js (cùng quy tắc chọn túi đến / BD10 đi của KTT-5: «lần đi cuối» = túi ĐI có giờ muộn nhất; túi đến ghép = túi ĐẾN quét muộn nhất
// không sau giờ đi cuối) và lịch chuyến chính thức (kttLichChuyen.docLichChuyen). Không API, không cache (KTT-8).
//
// «Bây giờ» để chấm hàng chưa đi = ĐỘ MỚI của dữ liệu (nguon_xuat_luc mới nhất của cặp OK, kttNapCap.docDoMoi), KHÔNG phải đồng hồ máy. `opts.bayGio` (nếu truyền) thay thế — dùng cho test
// và cho trang xem lại; khi đó `da_chot` cũng so với giá trị đó. Không có độ mới và không truyền bayGio -> kết quả rỗng có lý do CHUA_CO_DU_LIEU.
// ==========================================
'use strict';
const Q = require('./kttQuery');
const K = require('./kttNapCap');
const S = require('./kttLuuThoat');
const L = require('./kttLichChuyen');
const KN = require('../config/ktt-nap');
const NG = require('./kttNguon');
const DONG = require('./kttDong');

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);
const BCVH = require('./kttTinh').MA_BCVH_HUE;

/** { tuNgay, denNgay } -> danh sách ngày; sai định dạng / tuNgay > denNgay / quá 31 ngày -> LoiKtt (tiếng Việt). */
function chuanHoaNgay(opts) {
  const tu = opts && opts.tuNgay;
  const den = opts && opts.denNgay === undefined ? tu : (opts && opts.denNgay);
  if (!Q.ngayHopLe(tu) || !Q.ngayHopLe(den)) throw new Q.LoiKtt('KTT_NGAY_SAI', 'tuNgay / denNgay phải có dạng YYYY-MM-DD.');
  if (tu > den) throw new Q.LoiKtt('KTT_KHOANG_NGAY_SAI', 'tuNgay phải không sau denNgay.');
  const soNgay = (L.giayCua(`${den} 00:00:00`) - L.giayCua(`${tu} 00:00:00`)) / 86400 + 1;
  if (soNgay > S.SO_NGAY_TOI_DA) throw new Q.LoiKtt('KTT_KHOANG_QUA_DAI', `Khoảng ngày tối đa ${S.SO_NGAY_TOI_DA} ngày (đang chọn ${soNgay} ngày).`);
  return { tuNgay: tu, denNgay: den, ngays: S.tuNgayDen(tu, den) };
}

function docDoMoi(db) {
  try { return coBang(db, 'ktt_nap_cap') ? K.docDoMoi(db) : null; } catch (e) { return null; }
}

function docTenPhuong(db) {
  const m = new Map();
  try {
    if (coBang(db, 'ktt_dia_ban_phat')) for (const r of db.prepare('SELECT ma_phuong_xa, ten_phuong_xa FROM ktt_dia_ban_phat').all()) m.set(String(r.ma_phuong_xa).trim(), r.ten_phuong_xa);
  } catch (e) { /* thiếu bảng: chỉ dùng tên trong ktt_buu_gui */ }
  return m;
}

const khoiRong = (mocChiTieu) => NG.ganKg(S.taoKhoi({ mocChiTieu }).ketQua(), NG.kgRong());

/** KTT-10b: tham số mốc chỉ tiêu 14 giờ (`xnd` mặc định | `quet_tui_den`); thiếu -> mặc định; giá trị lạ -> LoiKtt tiếng Việt. */
function chuanHoaMocChiTieu(m) {
  if (m === undefined || m === null || m === '') return S.MOC_CHI_TIEU_MAC_DINH;
  if (!S.hopLeMocChiTieu(m)) throw new Q.LoiKtt('KTT_MOC_SAI', `mocChiTieu phải là một trong: ${Object.values(S.MOC_CHI_TIEU).join(', ')}.`);
  return m;
}

/** Giờ chốt ngày ('HH:MM') từ tham số ktt_gio_chot_ngay (KTT-8); lỗi / sai dạng -> '09:00' (không ném lỗi). */
function gioChot() {
  try { const g = KN.GIO_CHOT_NGAY; if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(g))) return g; } catch (e) { /* dùng mặc định */ }
  return '09:00';
}

/**
 * Lưu thoát theo ngày đến. opts: { tuNgay, denNgay ('YYYY-MM-DD', ≤ 31 ngày), bayGio?, mocChiTieu? }. meta.moc_chi_tieu = mốc nuôi dat_khong_dat (KTT-10c).
 * Trả { khoang_ngay, bay_gio, nguon_xuat_luc_moi_nhat, co_du_lieu, ly_do, moc, theo_ngay: [...], tong_cong, meta, canh_bao }.
 * Mỗi ngày: { ngay, da_chot, co_du_lieu, tong_shbg, tong (6 BCVH), theo_bcvh { mã: khối + tong_shbg_ngay (KTT-11b) }, hang_hoan, khong_phan_loai, ngoai_bay_chip (KTT-11b), tong_shbg_ngay, tui_khong_co_buu_gui }.
 * Khối: { tong_shbg, trang_thai { t1..t5, dang_cho_chuyen: { shbg, tui } }, luu_thoat, dung_chuyen, chi_tiet_trang_thai_5, dat_khong_dat, khong_phan_loai, di_truoc_khi_den } — mỗi chỉ số có `moc`.
 */
function luuThoatTheoNgay(db, opts = {}) {
  const k = chuanHoaNgay(opts);
  const mocChiTieu = chuanHoaMocChiTieu(opts.mocChiTieu);
  const doMoi = docDoMoi(db);
  const bayGio = opts.bayGio !== undefined && opts.bayGio !== null ? opts.bayGio : (doMoi ? doMoi.nguon_xuat_luc : null);
  const moc = { ...S.MOC, chi_tieu: S.NHAN_MOC_CHI_TIEU[mocChiTieu], chi_tieu_14h: { ...S.NHAN_MOC_CHI_TIEU, moc_mac_dinh: mocChiTieu } };
  const rong = (lyDo) => ({
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, bay_gio: null, nguon_xuat_luc_moi_nhat: null, co_du_lieu: false, ly_do: lyDo, moc,
    theo_ngay: k.ngays.map((ngay) => ({ ngay, da_chot: false, co_du_lieu: false, tong_shbg: 0, tui_khong_co_buu_gui: 0, tong_shbg_ngay: 0, tong: khoiRong(mocChiTieu), theo_bcvh: Object.fromEntries(BCVH.map((m) => [m, { ...khoiRong(mocChiTieu), tong_shbg_ngay: 0 }])), hang_hoan: khoiRong(mocChiTieu), khong_phan_loai: { khong_ro_dich: 0, ngoai_pham_vi: {} }, ngoai_bay_chip: ngoaiBayChipRong(), theo_nguon: [], theo_nguon_hang: nguonHangRong(mocChiTieu) })),
    tong_cong: null, meta: { nguon_xuat_luc_moi_nhat: null, moc, moc_chi_tieu: mocChiTieu }, canh_bao: ['Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào): chưa tính được.']
  });
  if (bayGio === null) return rong('CHUA_CO_DU_LIEU');
  if (!coBang(db, 'ktt_tui') || !coBang(db, 'ktt_buu_gui')) return rong('THIEU_BANG_DU_LIEU');

  const gio_chot = gioChot();
  const tenPhuongTheoMa = docTenPhuong(db);
  const theoNgay = new Map(k.ngays.map((ngay) => [ngay, {
    ngay, tong: S.taoKhoi({ mocChiTieu }), theoBcvh: new Map(BCVH.map((m) => [m, S.taoKhoi({ mocChiTieu })])), hoan: S.taoKhoi({ mocChiTieu }),
    khongRo: 0, ngoai: {}, tuiKhongBuuGui: 0, tongShbg: 0,
    kgTong: NG.taoKg(), kgBcvh: new Map(BCVH.map((m) => [m, NG.taoKg()])), kgHoan: NG.taoKg(), nguon: NG.taoNguon(), // KTT-8c: kg và nhóm theo nguồn (chỉ cộng thêm, không đụng taoKhoi)
    nh: { [Q.NGUON_HANG.KHAI_THAC]: nguonHangMoi(mocChiTieu), [Q.NGUON_HANG.CHUYEN_TIEP]: nguonHangMoi(mocChiTieu) } // KTT-14: tách hai cờ nguồn (cộng lại = tổng)
  }]));
  const meta = { hang_hoan_tu_531120_dich_khac_thuan_hoa: 0, ngoai_pham_vi: {}, khong_ro_dich: 0, khong_co_gio_quet_den: 0, khong_xep_duoc_chuyen: {}, di_truoc_khi_den: 0, co_quet_di_chua_lap_bd10: 0, tui_khong_co_buu_gui: 0, shbg_thieu_khoi_luong: 0, shbg_chuyen_tiep: 0, co_ca_hai_loai_tui: 0, chuyen_tiep_nhieu_tui: 0, chuyen_tiep_co_tui_di_khac: 0 };

  const { ctx } = Q.chayTapLuuThoat(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio }, (c) => { // KTT-14: tập SHBG chung (gồm hàng chuyển tiếp)
    const ngu = { lich: c.lichChuyen.lich, hanPhut: c.lichChuyen.hanDenTruocChuyenPhut, bayGio: c.bayGio, mocChiTieu };
    return [{
      tui(u) {
        if (u.chieu !== Q.CHIEU.DEN || !u.trongKhoangDen || !(u.nShbg === 0)) return;
        const n = theoNgay.get(u.ngayDen);
        if (n) { n.tuiKhongBuuGui++; meta.tui_khong_co_buu_gui++; }
      },
      shbg(u) {
        if (!u.trongKhoangDen) return;
        const n = theoNgay.get(u.ngayDen);
        if (!n) return;
        const tenPhuong = u.tenPhuong || tenPhuongTheoMa.get(String(u.maPhuong || '').trim()) || null;
        const kq = S.phanLoaiShbg({ ...u, tenPhuong, gioBd10Di: u.gioBd10Di, noiGuiGoc: u.noiGuiGoc }, ngu);
        n.tongShbg++;
        const nh = n.nh[u.nguonHang];
        nh.tongShbg++;
        if (u.nguonHang === Q.NGUON_HANG.CHUYEN_TIEP) { meta.shbg_chuyen_tiep++; if (u.soTuiChuyenTiep > 1) meta.chuyen_tiep_nhieu_tui++; if (u.chuyenTiepCoTuiDiKhac) meta.chuyen_tiep_co_tui_di_khac++; }
        if (u.coCaHaiLoaiTui) meta.co_ca_hai_loai_tui++;
        if (NG.thieuKhoiLuong(u)) meta.shbg_thieu_khoi_luong++;
        const kgShbg = NG.kgCua(u);
        if (kq.nhom === S.NHOM.KHONG_RO_DICH) { n.khongRo++; nh.khongRo++; meta.khong_ro_dich++; return; }
        if (kq.nhom === S.NHOM.NGOAI_PHAM_VI) { n.ngoai[kq.loaiDich] = (n.ngoai[kq.loaiDich] || 0) + 1; nh.ngoai[kq.loaiDich] = (nh.ngoai[kq.loaiDich] || 0) + 1; meta.ngoai_pham_vi[kq.loaiDich] = (meta.ngoai_pham_vi[kq.loaiDich] || 0) + 1; return; }
        if (kq.tu531120KhacThuanHoa) meta.hang_hoan_tu_531120_dich_khac_thuan_hoa++;
        if (kq.nhom === S.NHOM.HANG_HOAN) { n.hoan.them(kq, u.tuiDenId); n.kgHoan.them(kq, kgShbg); nh.hoan++; return; }
        n.tong.them(kq, u.tuiDenId);
        nh.tong.them(kq, u.tuiDenId);
        n.theoBcvh.get(kq.maBcvh).them(kq, u.tuiDenId);
        n.kgTong.them(kq, kgShbg); n.kgBcvh.get(kq.maBcvh).them(kq, kgShbg); n.nguon.them(u, kq);
        if (kq.nhom === S.NHOM.KHONG_CO_GIO_QUET_DEN) meta.khong_co_gio_quet_den++;
        else if (kq.nhom === S.NHOM.KHONG_XEP_DUOC_CHUYEN) meta.khong_xep_duoc_chuyen[kq.lyDo] = (meta.khong_xep_duoc_chuyen[kq.lyDo] || 0) + 1;
        else {
          if (kq.diTruocKhiDen) meta.di_truoc_khi_den++;
          if (!u.gioBd10Di && u.gioQuetDi) meta.co_quet_di_chua_lap_bd10++;
        }
      }
    }];
  });

  const theo_ngay = k.ngays.map((ngay) => {
    const n = theoNgay.get(ngay);
    const tong = NG.ganKg(n.tong.ketQua(), n.kgTong.ketQua());
    const hang_hoan = NG.ganKg(n.hoan.ketQua(), n.kgHoan.ketQua());
    // KTT-11b: tong_shbg_ngay của khối BCVH = số dòng xlsx khi lọc BCVH đó, không lọc trạng thái = SHBG của khối + hàng hoàn (hàng hoàn chỉ có ở Thuận Hóa).
    const theo_bcvh = Object.fromEntries(BCVH.map((m) => {
      const khoi = NG.ganKg(n.theoBcvh.get(m).ketQua(), n.kgBcvh.get(m).ketQua());
      return [m, { ...khoi, tong_shbg_ngay: khoi.tong_shbg + (m === S.MA_THUAN_HOA ? hang_hoan.tong_shbg : 0) }];
    }));
    const ngoaiTong = Object.values(n.ngoai).reduce((a, b) => a + b, 0);
    return {
      ngay, da_chot: S.daChot(ngay, bayGio, gio_chot), co_du_lieu: n.tongShbg > 0 || n.tuiKhongBuuGui > 0,
      tong_shbg: tong.tong_shbg, tong, theo_bcvh, hang_hoan,
      khong_phan_loai: { khong_ro_dich: n.khongRo, ngoai_pham_vi: { ...n.ngoai }, tong: n.khongRo + ngoaiTong },
      ngoai_bay_chip: ngoaiBayChip(n.khongRo, n.ngoai, tong.khong_phan_loai),
      tong_shbg_ngay: n.tongShbg, tui_khong_co_buu_gui: n.tuiKhongBuuGui, theo_nguon: n.nguon.ketQua(),
      theo_nguon_hang: Object.fromEntries(Object.values(Q.NGUON_HANG).map((key) => [key, ketQuaNguonHang(n.nh[key])]))
    };
  });

  // Cộng TỪNG NGÀY: dựng khối tổng bằng cách cộng số của các khối ngày (không tính lại từ dữ liệu).
  const tong_cong = congCacNgay(theo_ngay);
  const canh_bao = [...ctx.canhBao];
  if (meta.khong_ro_dich > 0) canh_bao.push(`${meta.khong_ro_dich} bưu gửi không rõ đích: không vào năm trạng thái lưu thoát.`);
  const nguonXuat = doMoi ? doMoi.nguon_xuat_luc : null;
  return {
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, bay_gio: bayGio, nguon_xuat_luc_moi_nhat: nguonXuat, co_du_lieu: theo_ngay.some((x) => x.co_du_lieu), ly_do: null, moc,
    theo_ngay, tong_cong, meta: { nguon_xuat_luc_moi_nhat: nguonXuat, bay_gio: bayGio, moc, moc_chi_tieu: mocChiTieu, ...meta }, canh_bao
  };
}

// ---- cộng các khối ngày
const SO_TT = ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'];
function congKhoi(ds) {
  const t = (f) => ds.reduce((s, x) => s + f(x), 0);
  const trang_thai = Object.fromEntries(SO_TT.map((m) => [m, { shbg: t((x) => x.trang_thai[m].shbg), tui: t((x) => x.trang_thai[m].tui), kg: NG.r3(t((x) => x.trang_thai[m].kg || 0)) }]));
  const chot = SO_TT.slice(0, 5).reduce((s, m) => s + trang_thai[m].shbg, 0);
  const ty = (tu, mau) => (mau > 0 ? tu / mau : null);
  const luu = trang_thai.t1.shbg + trang_thai.t2.shbg;
  const dung = t((x) => x.dung_chuyen.tu_so);
  const dat = t((x) => x.dat_khong_dat.dat);
  const khongDat = t((x) => x.dat_khong_dat.khong_dat);
  const khongXep = {};
  for (const x of ds) for (const [ly, n] of Object.entries(x.khong_phan_loai.khong_xep_duoc_chuyen)) khongXep[ly] = (khongXep[ly] || 0) + n;
  return {
    tong_shbg: t((x) => x.tong_shbg), kg: NG.r3(t((x) => x.kg || 0)), trang_thai,
    luu_thoat: { moc: S.MOC.luu_thoat, tu_so: luu, mau_so: chot, ty_le: ty(luu, chot) },
    dung_chuyen: { moc: S.MOC.xep_chuyen, tu_so: dung, mau_so: chot, ty_le: ty(dung, chot), truot_chuyen: t((x) => x.dung_chuyen.truot_chuyen), lo_chuyen: t((x) => x.dung_chuyen.lo_chuyen) },
    chi_tiet_trang_thai_5: {
      di_tu_d2_dung_chuyen: t((x) => x.chi_tiet_trang_thai_5.di_tu_d2_dung_chuyen), di_tu_d2_truot_chuyen: t((x) => x.chi_tiet_trang_thai_5.di_tu_d2_truot_chuyen), chua_di_lo_chuyen: t((x) => x.chi_tiet_trang_thai_5.chua_di_lo_chuyen)
    },
    dat_khong_dat: {
      moc: ds[0].dat_khong_dat.moc, dat, khong_dat: khongDat, chua_di: t((x) => x.dat_khong_dat.chua_di), chua_do_duoc: t((x) => x.dat_khong_dat.chua_do_duoc), xnd_sau_gio_di: t((x) => x.dat_khong_dat.xnd_sau_gio_di),
      ty_le_dat: ty(dat, dat + khongDat)
    },
    khong_phan_loai: { khong_co_gio_quet_den: t((x) => x.khong_phan_loai.khong_co_gio_quet_den), khong_xep_duoc_chuyen: khongXep },
    di_truoc_khi_den: t((x) => x.di_truoc_khi_den),
    chi_tieu_14h: S.congChiTieu14h(ds.map((x) => x.chi_tieu_14h))
  };
}

/**
 * KTT-11b: phân rã bốn nhóm nằm trong «Tất cả» (tong_shbg_ngay) nhưng không có chip trạng thái: không rõ đích, ngoài 6 BCVH, thiếu giờ quét túi đến, không xếp được chuyến.
 * Đẳng thức: t1…t5 + dang_cho_chuyen + hang_hoan.tong_shbg + ngoai_bay_chip.tong = tong_shbg_ngay. Hàng hoàn thiếu giờ quét / không xếp được chuyến nằm trong hang_hoan, KHÔNG ở đây.
 */
function dungNgoaiBayChip(khongRo, ngoai, coGio, khongXep) {
  const ngoaiTong = Object.values(ngoai).reduce((a, b) => a + b, 0);
  const khongXepTong = Object.values(khongXep).reduce((a, b) => a + b, 0);
  return {
    khong_ro_dich: khongRo, ngoai_pham_vi: { ...ngoai }, ngoai_pham_vi_tong: ngoaiTong, khong_co_gio_quet_den: coGio,
    khong_xep_duoc_chuyen: { ...khongXep }, khong_xep_duoc_chuyen_tong: khongXepTong, tong: khongRo + ngoaiTong + coGio + khongXepTong
  };
}
/** kpl = khong_phan_loai của khối `tong` (6 BCVH, không gồm hàng hoàn). */
const ngoaiBayChip = (khongRo, ngoai, kpl) => dungNgoaiBayChip(khongRo, ngoai, kpl.khong_co_gio_quet_den, kpl.khong_xep_duoc_chuyen);
const ngoaiBayChipRong = () => dungNgoaiBayChip(0, {}, 0, {});
function congNgoaiBayChip(ds) {
  const gop = (key) => { const r = {}; for (const x of ds) for (const [m, c] of Object.entries(x[key])) r[m] = (r[m] || 0) + c; return r; };
  return dungNgoaiBayChip(ds.reduce((s, x) => s + x.khong_ro_dich, 0), gop('ngoai_pham_vi'), ds.reduce((s, x) => s + x.khong_co_gio_quet_den, 0), gop('khong_xep_duoc_chuyen'));
}

// ---- KTT-14: tách theo CỜ NGUỒN (khai_thac | chuyen_tiep). Mỗi cờ có đẳng thức riêng: t1…t5 + đang chờ chuyến + hang_hoan_shbg + ngoai_bay_chip.tong = tong_shbg_ngay; hai cờ cộng lại = số của cả ngày.
const nguonHangMoi = (mocChiTieu) => ({ tongShbg: 0, tong: S.taoKhoi({ mocChiTieu }), hoan: 0, khongRo: 0, ngoai: {} });
function ketQuaNguonHang(a) {
  const tong = a.tong.ketQua();
  return { tong_shbg_ngay: a.tongShbg, tong, hang_hoan_shbg: a.hoan, ngoai_bay_chip: ngoaiBayChip(a.khongRo, a.ngoai, tong.khong_phan_loai) };
}
function nguonHangRong(mocChiTieu) { return Object.fromEntries(Object.values(Q.NGUON_HANG).map((key) => [key, ketQuaNguonHang(nguonHangMoi(mocChiTieu))])); }
function congNguonHang(ds) {
  return {
    tong_shbg_ngay: ds.reduce((s, x) => s + x.tong_shbg_ngay, 0), tong: congKhoi(ds.map((x) => x.tong)),
    hang_hoan_shbg: ds.reduce((s, x) => s + x.hang_hoan_shbg, 0), ngoai_bay_chip: congNgoaiBayChip(ds.map((x) => x.ngoai_bay_chip))
  };
}

function congCacNgay(theoNgay) {
  const ngoai = {};
  for (const n of theoNgay) for (const [m, c] of Object.entries(n.khong_phan_loai.ngoai_pham_vi)) ngoai[m] = (ngoai[m] || 0) + c;
  return {
    ...congKhoi(theoNgay.map((n) => n.tong)),
    theo_bcvh: Object.fromEntries(BCVH.map((m) => [m, { ...congKhoi(theoNgay.map((n) => n.theo_bcvh[m])), tong_shbg_ngay: theoNgay.reduce((s, n) => s + n.theo_bcvh[m].tong_shbg_ngay, 0) }])),
    hang_hoan: congKhoi(theoNgay.map((n) => n.hang_hoan)),
    khong_phan_loai: { khong_ro_dich: theoNgay.reduce((s, n) => s + n.khong_phan_loai.khong_ro_dich, 0), ngoai_pham_vi: ngoai },
    ngoai_bay_chip: congNgoaiBayChip(theoNgay.map((n) => n.ngoai_bay_chip)),
    tong_shbg_ngay: theoNgay.reduce((s, n) => s + n.tong_shbg_ngay, 0), tui_khong_co_buu_gui: theoNgay.reduce((s, n) => s + n.tui_khong_co_buu_gui, 0),
    theo_nguon: NG.congNguon(theoNgay.map((n) => n.theo_nguon)),
    theo_nguon_hang: Object.fromEntries(Object.values(Q.NGUON_HANG).map((key) => [key, congNguonHang(theoNgay.map((n) => n.theo_nguon_hang[key]))]))
  };
}

// ------------------------------------------
// KTT-8: ghép kết quả MỘT NGÀY thành kết quả khoảng ngày (cache theo ngày ở kttApi.js)
// ------------------------------------------
const cong = (a, b) => { const r = { ...a }; for (const [k, v] of Object.entries(b)) r[k] = (r[k] || 0) + v; return r; };
const KHONG_RO_RE = /bưu gửi không rõ đích: không vào năm trạng thái lưu thoát\.$/;

/**
 * ds: kết quả luuThoatTheoNgay của TỪNG NGÀY (mỗi phần tử một ngày, liên tiếp, cùng bayGio / độ mới). Trả CÙNG kết quả như luuThoatTheoNgay trên cả khoảng (có test so khớp):
 * theo_ngay ghép lại, tong_cong cộng các ngày, meta cộng các bộ đếm, canh_bao hợp nhất (câu «không rõ đích» tính lại theo tổng).
 */
function ghepKhoang(ds) {
  const dau = ds[0];
  const cuoi = ds[ds.length - 1];
  const theo_ngay = ds.flatMap((x) => x.theo_ngay);
  const rong = ds.some((x) => x.tong_cong === null);
  const meta = { ...dau.meta };
  for (const k of Object.keys(meta)) {
    if (typeof meta[k] === 'number') meta[k] = ds.reduce((a, x) => a + x.meta[k], 0);
    else if (meta[k] && typeof meta[k] === 'object' && !['moc'].includes(k)) meta[k] = ds.reduce((a, x) => cong(a, x.meta[k]), {});
  }
  const canh_bao = [];
  for (const x of ds) for (const c of x.canh_bao) if (!KHONG_RO_RE.test(c) && !canh_bao.includes(c)) canh_bao.push(c);
  if (!rong && meta.khong_ro_dich > 0) canh_bao.push(`${meta.khong_ro_dich} bưu gửi không rõ đích: không vào năm trạng thái lưu thoát.`);
  return {
    khoang_ngay: { tu_ngay: dau.khoang_ngay.tu_ngay, den_ngay: cuoi.khoang_ngay.den_ngay }, bay_gio: dau.bay_gio, nguon_xuat_luc_moi_nhat: dau.nguon_xuat_luc_moi_nhat,
    co_du_lieu: theo_ngay.some((x) => x.co_du_lieu), ly_do: dau.ly_do, moc: dau.moc, theo_ngay, tong_cong: rong ? null : congCacNgay(theo_ngay), meta, canh_bao
  };
}

// ------------------------------------------
// KTT-8: danh sách chi tiết SHBG theo nhóm lưu thoát (để KTT kiểm tra, giải trình)
// ------------------------------------------
const NHOM_LUU_THOAT = Object.freeze({
  t1: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai === 'T1', t2: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai === 'T2',
  t3: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai === 'T3', t4: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai === 'T4',
  t5: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai === 'T5', dang_cho_chuyen: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai === 'DANG_CHO_CHUYEN',
  hang_hoan: (k) => k.nhom === S.NHOM.HANG_HOAN,
  dat: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai !== null && k.datKhongDat.trangThai === S.DAT.DAT,
  khong_dat: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai !== null && k.datKhongDat.trangThai === S.DAT.KHONG_DAT,
  chua_di: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai !== null && k.datKhongDat.trangThai === S.DAT.CHUA_DI,
  chua_do_duoc: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai !== null && k.datKhongDat.trangThai === S.DAT.CHUA_DO_DUOC,
  xnd_sau_gio_di: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai !== null && k.datKhongDat.trangThai === S.DAT.XND_SAU_GIO_DI,
  // KTT-8c: rớt lại = hàng KHÔNG đi trong ngày D (t3 + t4 + t5); trượt chuyến = đã đi trượt + chưa đi lỡ chuyến (cùng phạm vi với dung_chuyen.truot_chuyen + lo_chuyen của luu-thoat)
  ro_lai: (k) => k.nhom === S.NHOM.PHAN_LOAI && (k.trangThai === 'T3' || k.trangThai === 'T4' || k.trangThai === 'T5'),
  truot_chuyen: (k) => k.nhom === S.NHOM.PHAN_LOAI && k.trangThai !== null && k.trangThai !== 'DANG_CHO_CHUYEN' && (k.chuyenKq === 'TRUOT' || k.chuyenKq === 'LO'),
  khong_ro_dich: (k) => k.nhom === S.NHOM.KHONG_RO_DICH, ngoai_pham_vi: (k) => k.nhom === S.NHOM.NGOAI_PHAM_VI,
  khong_co_gio_quet_den: (k) => k.nhom === S.NHOM.KHONG_CO_GIO_QUET_DEN, khong_xep_duoc_chuyen: (k) => k.nhom === S.NHOM.KHONG_XEP_DUOC_CHUYEN
});
const TRANG_TOI_DA = 200;

/**
 * opts: { tuNgay, denNgay (≤ 31 ngày), nhom (một khóa của NHOM_LUU_THOAT), maBcvh? (một trong 6 BCVH), trang (≥ 1), kichThuocTrang (1..200, mặc định 50), bayGio? }.
 * Trả { tong, trang, kichThuocTrang, soTrang, dong: [...], bay_gio, nguon_xuat_luc_moi_nhat }. Sắp xếp ỔN ĐỊNH theo SHBG (thứ tự đọc của kttQuery); tổng khớp số của luuThoatTheoNgay cùng khoảng / nhóm.
 * Mỗi dòng: SHBG, số hiệu BD8 / BD10 đến + đi, ngày đến, giờ quét đến, xác nhận đến, giờ lập BD10 đi, BCVH đích, nhóm, trạng thái, chuyến thuộc (giờ rời, ngày), kết quả chuyến, nhãn đạt / không đạt, chỉ tiêu, thời gian chờ (giây). Không có tên người, biển số, lái xe.
 */
function danhSachLuuThoat(db, opts = {}) {
  const k = chuanHoaNgay(opts);
  if (!Object.prototype.hasOwnProperty.call(NHOM_LUU_THOAT, opts.nhom)) throw new Q.LoiKtt('KTT_LOAI_SAI', `nhom phải thuộc: ${Object.keys(NHOM_LUU_THOAT).join(', ')}.`);
  const khop = NHOM_LUU_THOAT[opts.nhom];
  const maBcvh = opts.maBcvh === undefined || opts.maBcvh === null || opts.maBcvh === '' ? null : String(opts.maBcvh).trim();
  const nguon = opts.nguon === undefined || opts.nguon === null || opts.nguon === '' ? null : String(opts.nguon);
  if (nguon !== null && !NG.RE_MA_NGUON.test(nguon)) throw new Q.LoiKtt('KTT_NGUON_SAI', 'nguon chỉ gồm chữ, số, _ . - / và khoảng trắng, tối đa 40 ký tự.');
  if (maBcvh !== null && !BCVH.includes(maBcvh)) throw new Q.LoiKtt('KTT_BCVH_SAI', 'maBcvh phải là một trong 6 BCVH Huế.');
  const so = (x, macDinh) => { const n = x === undefined || x === null ? macDinh : Number(x); return Number.isInteger(n) && n >= 1 ? n : null; };
  const trang = so(opts.trang, 1);
  const kichThuoc = so(opts.kichThuocTrang, 50);
  if (trang === null || kichThuoc === null) throw new Q.LoiKtt('KTT_TRANG_SAI', 'trang và kichThuocTrang phải là số nguyên dương.');
  const kichThuocTrang = Math.min(kichThuoc, TRANG_TOI_DA);
  const doMoi = docDoMoi(db);
  const bayGio = opts.bayGio !== undefined && opts.bayGio !== null ? opts.bayGio : (doMoi ? doMoi.nguon_xuat_luc : null);
  const ra = (tong, dong) => ({ tong, trang, kichThuocTrang, soTrang: Math.ceil(tong / kichThuocTrang), dong, bay_gio: bayGio, nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null });
  if (bayGio === null || !coBang(db, 'ktt_tui') || !coBang(db, 'ktt_buu_gui')) return ra(0, []);
  const batDau = (trang - 1) * kichThuocTrang;
  const dong = [];
  let tong = 0;
  duyetLuuThoat(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio, maBcvh, nguon, khop }, (u, kq, tenPhuong) => {
    if (tong >= batDau && dong.length < kichThuocTrang) {
      const d = kq.datKhongDat || null;
      dong.push({
        shbg: u.shbg, soHieuBd8: u.soHieuBd8 || null, bd10Den: u.bd10Den || null, bd10Di: u.bd10Di || null, ngayDen: u.ngayDen, quetDen: u.quetDen || null,
        xndBd10: u.xndBd10 || null, gioLapBd10Di: u.gioBd10Di || null, maBcvh: u.maBcvh || null, nhomDich: u.nhom, nhom: kq.nhom, trangThai: kq.trangThai === undefined ? null : kq.trangThai,
        gioXuatPhat: kq.chuyen ? kq.chuyen.gio_xuat_phat : null, ngayChuyen: kq.chuyen ? kq.chuyen.ngay : null, ketQuaChuyen: kq.chuyenKq || null, lyDo: kq.lyDo || null,
        diTruocKhiDen: !!kq.diTruocKhiDen, datKhongDat: d ? d.trangThai : null, chiTieuGio: d ? d.chiTieuGio : null, thoiGianChoGiay: d ? d.thucGiay : null, tenPhuong,
        ...DONG.dongChiTiet(u, kq) // KTT-8c: thêm 17 trường snake_case (cùng sheet 7); trường cũ giữ nguyên nghĩa
      });
    }
    tong++;
  });
  return ra(tong, dong);
}

/**
 * Lượt duyệt DÙNG CHUNG của danhSachLuuThoat (chi-tiet) và xuatLuuThoat (xlsx, KTT-8b): mỗi SHBG có ngày đến trong khoảng được phân loại bằng S.phanLoaiShbg (cùng quy tắc),
 * lọc theo BCVH (`maBcvh`, null = tất cả) và nhóm (`khop(kq)`, null = tất cả SHBG kể cả không rõ đích / ngoài phạm vi) rồi gọi cb(u, kq, tenPhuong).
 * opts: { tuNgay, denNgay, bayGio (bắt buộc), maBcvh?, nguon?, khop? }. Chỉ đọc DB.
 */
function duyetLuuThoat(db, opts, cb) {
  const tenPhuongTheoMa = docTenPhuong(db);
  Q.chayTapLuuThoat(db, { tuNgay: opts.tuNgay, denNgay: opts.denNgay, bayGio: opts.bayGio }, (c) => { // KTT-14: cùng tập với luuThoatTheoNgay
    const ngu = { lich: c.lichChuyen.lich, hanPhut: c.lichChuyen.hanDenTruocChuyenPhut, bayGio: c.bayGio };
    return [{
      shbg(u) {
        if (!u.trongKhoangDen) return;
        const tenPhuong = u.tenPhuong || tenPhuongTheoMa.get(String(u.maPhuong || '').trim()) || null;
        const kq = S.phanLoaiShbg({ ...u, tenPhuong }, ngu);
        if (opts.maBcvh && u.maBcvh !== opts.maBcvh) return;
        if (opts.nguon && NG.nguonCua(u).ma !== opts.nguon) return; // KTT-8c: nhóm theo nguồn (NOI_TINH / KHONG_RO_NGUON / mã đường thư đến)
        if (opts.khop && !opts.khop(kq)) return;
        cb(u, kq, tenPhuong);
      }
    }];
  });
}

module.exports = { luuThoatTheoNgay, chuanHoaNgay, ghepKhoang, congCacNgay, danhSachLuuThoat, duyetLuuThoat, NHOM_LUU_THOAT, TRANG_TOI_DA, docDoMoi, gioChot };
