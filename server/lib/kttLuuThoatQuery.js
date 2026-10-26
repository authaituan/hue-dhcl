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

const khoiRong = () => S.taoKhoi().ketQua();

/**
 * Lưu thoát theo ngày đến. opts: { tuNgay, denNgay ('YYYY-MM-DD', ≤ 31 ngày), bayGio? }.
 * Trả { khoang_ngay, bay_gio, nguon_xuat_luc_moi_nhat, co_du_lieu, ly_do, moc, theo_ngay: [...], tong_cong, meta, canh_bao }.
 * Mỗi ngày: { ngay, da_chot, co_du_lieu, tong_shbg, tong (6 BCVH), theo_bcvh { mã: khối }, hang_hoan, khong_phan_loai, tong_shbg_ngay, tui_khong_co_buu_gui }.
 * Khối: { tong_shbg, trang_thai { t1..t5, dang_cho_chuyen: { shbg, tui } }, luu_thoat, dung_chuyen, chi_tiet_trang_thai_5, dat_khong_dat, khong_phan_loai, di_truoc_khi_den } — mỗi chỉ số có `moc`.
 */
function luuThoatTheoNgay(db, opts = {}) {
  const k = chuanHoaNgay(opts);
  const doMoi = docDoMoi(db);
  const bayGio = opts.bayGio !== undefined && opts.bayGio !== null ? opts.bayGio : (doMoi ? doMoi.nguon_xuat_luc : null);
  const moc = { ...S.MOC };
  const rong = (lyDo) => ({
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, bay_gio: null, nguon_xuat_luc_moi_nhat: null, co_du_lieu: false, ly_do: lyDo, moc,
    theo_ngay: k.ngays.map((ngay) => ({ ngay, da_chot: false, co_du_lieu: false, tong_shbg: 0, tui_khong_co_buu_gui: 0, tong_shbg_ngay: 0, tong: khoiRong(), theo_bcvh: Object.fromEntries(BCVH.map((m) => [m, khoiRong()])), hang_hoan: khoiRong(), khong_phan_loai: { khong_ro_dich: 0, ngoai_pham_vi: {} } })),
    tong_cong: null, meta: { nguon_xuat_luc_moi_nhat: null, moc }, canh_bao: ['Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào): chưa tính được.']
  });
  if (bayGio === null) return rong('CHUA_CO_DU_LIEU');
  if (!coBang(db, 'ktt_tui') || !coBang(db, 'ktt_buu_gui')) return rong('THIEU_BANG_DU_LIEU');

  const tenPhuongTheoMa = docTenPhuong(db);
  const theoNgay = new Map(k.ngays.map((ngay) => [ngay, {
    ngay, tong: S.taoKhoi(), theoBcvh: new Map(BCVH.map((m) => [m, S.taoKhoi()])), hoan: S.taoKhoi(),
    khongRo: 0, ngoai: {}, tuiKhongBuuGui: 0, tongShbg: 0
  }]));
  const meta = { hang_hoan_tu_531120_dich_khac_thuan_hoa: 0, ngoai_pham_vi: {}, khong_ro_dich: 0, khong_co_gio_quet_den: 0, khong_xep_duoc_chuyen: {}, di_truoc_khi_den: 0, co_quet_di_chua_lap_bd10: 0, tui_khong_co_buu_gui: 0 };

  const { ctx } = Q.chayBoDem(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio, boQuaCham: true }, (c) => {
    const ngu = { lich: c.lichChuyen.lich, hanPhut: c.lichChuyen.hanDenTruocChuyenPhut, bayGio: c.bayGio };
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
        if (kq.nhom === S.NHOM.KHONG_RO_DICH) { n.khongRo++; meta.khong_ro_dich++; return; }
        if (kq.nhom === S.NHOM.NGOAI_PHAM_VI) { n.ngoai[kq.loaiDich] = (n.ngoai[kq.loaiDich] || 0) + 1; meta.ngoai_pham_vi[kq.loaiDich] = (meta.ngoai_pham_vi[kq.loaiDich] || 0) + 1; return; }
        if (kq.tu531120KhacThuanHoa) meta.hang_hoan_tu_531120_dich_khac_thuan_hoa++;
        if (kq.nhom === S.NHOM.HANG_HOAN) { n.hoan.them(kq, u.tuiDenId); return; }
        n.tong.them(kq, u.tuiDenId);
        n.theoBcvh.get(kq.maBcvh).them(kq, u.tuiDenId);
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
    const tong = n.tong.ketQua();
    const hang_hoan = n.hoan.ketQua();
    const theo_bcvh = Object.fromEntries(BCVH.map((m) => [m, n.theoBcvh.get(m).ketQua()]));
    const ngoaiTong = Object.values(n.ngoai).reduce((a, b) => a + b, 0);
    return {
      ngay, da_chot: S.daChot(ngay, bayGio), co_du_lieu: n.tongShbg > 0 || n.tuiKhongBuuGui > 0,
      tong_shbg: tong.tong_shbg, tong, theo_bcvh, hang_hoan,
      khong_phan_loai: { khong_ro_dich: n.khongRo, ngoai_pham_vi: { ...n.ngoai }, tong: n.khongRo + ngoaiTong },
      tong_shbg_ngay: n.tongShbg, tui_khong_co_buu_gui: n.tuiKhongBuuGui
    };
  });

  // Cộng TỪNG NGÀY: dựng khối tổng bằng cách cộng số của các khối ngày (không tính lại từ dữ liệu).
  const tong_cong = congCacNgay(theo_ngay);
  const canh_bao = [...ctx.canhBao];
  if (meta.khong_ro_dich > 0) canh_bao.push(`${meta.khong_ro_dich} bưu gửi không rõ đích: không vào năm trạng thái lưu thoát.`);
  const nguonXuat = doMoi ? doMoi.nguon_xuat_luc : null;
  return {
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, bay_gio: bayGio, nguon_xuat_luc_moi_nhat: nguonXuat, co_du_lieu: theo_ngay.some((x) => x.co_du_lieu), ly_do: null, moc,
    theo_ngay, tong_cong, meta: { nguon_xuat_luc_moi_nhat: nguonXuat, bay_gio: bayGio, moc, ...meta }, canh_bao
  };
}

// ---- cộng các khối ngày
const SO_TT = ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'];
function congKhoi(ds) {
  const t = (f) => ds.reduce((s, x) => s + f(x), 0);
  const trang_thai = Object.fromEntries(SO_TT.map((m) => [m, { shbg: t((x) => x.trang_thai[m].shbg), tui: t((x) => x.trang_thai[m].tui) }]));
  const chot = SO_TT.slice(0, 5).reduce((s, m) => s + trang_thai[m].shbg, 0);
  const ty = (tu, mau) => (mau > 0 ? tu / mau : null);
  const luu = trang_thai.t1.shbg + trang_thai.t2.shbg;
  const dung = t((x) => x.dung_chuyen.tu_so);
  const dat = t((x) => x.dat_khong_dat.dat);
  const khongDat = t((x) => x.dat_khong_dat.khong_dat);
  const khongXep = {};
  for (const x of ds) for (const [ly, n] of Object.entries(x.khong_phan_loai.khong_xep_duoc_chuyen)) khongXep[ly] = (khongXep[ly] || 0) + n;
  return {
    tong_shbg: t((x) => x.tong_shbg), trang_thai,
    luu_thoat: { moc: S.MOC.luu_thoat, tu_so: luu, mau_so: chot, ty_le: ty(luu, chot) },
    dung_chuyen: { moc: S.MOC.xep_chuyen, tu_so: dung, mau_so: chot, ty_le: ty(dung, chot), truot_chuyen: t((x) => x.dung_chuyen.truot_chuyen), lo_chuyen: t((x) => x.dung_chuyen.lo_chuyen) },
    chi_tiet_trang_thai_5: {
      di_tu_d2_dung_chuyen: t((x) => x.chi_tiet_trang_thai_5.di_tu_d2_dung_chuyen), di_tu_d2_truot_chuyen: t((x) => x.chi_tiet_trang_thai_5.di_tu_d2_truot_chuyen), chua_di_lo_chuyen: t((x) => x.chi_tiet_trang_thai_5.chua_di_lo_chuyen)
    },
    dat_khong_dat: {
      moc: S.MOC.chi_tieu, dat, khong_dat: khongDat, chua_di: t((x) => x.dat_khong_dat.chua_di), chua_do_duoc: t((x) => x.dat_khong_dat.chua_do_duoc), xnd_sau_gio_di: t((x) => x.dat_khong_dat.xnd_sau_gio_di),
      ty_le_dat: ty(dat, dat + khongDat)
    },
    khong_phan_loai: { khong_co_gio_quet_den: t((x) => x.khong_phan_loai.khong_co_gio_quet_den), khong_xep_duoc_chuyen: khongXep },
    di_truoc_khi_den: t((x) => x.di_truoc_khi_den)
  };
}

function congCacNgay(theoNgay) {
  const ngoai = {};
  for (const n of theoNgay) for (const [m, c] of Object.entries(n.khong_phan_loai.ngoai_pham_vi)) ngoai[m] = (ngoai[m] || 0) + c;
  return {
    ...congKhoi(theoNgay.map((n) => n.tong)),
    theo_bcvh: Object.fromEntries(BCVH.map((m) => [m, congKhoi(theoNgay.map((n) => n.theo_bcvh[m]))])),
    hang_hoan: congKhoi(theoNgay.map((n) => n.hang_hoan)),
    khong_phan_loai: { khong_ro_dich: theoNgay.reduce((s, n) => s + n.khong_phan_loai.khong_ro_dich, 0), ngoai_pham_vi: ngoai },
    tong_shbg_ngay: theoNgay.reduce((s, n) => s + n.tong_shbg_ngay, 0), tui_khong_co_buu_gui: theoNgay.reduce((s, n) => s + n.tui_khong_co_buu_gui, 0)
  };
}

module.exports = { luuThoatTheoNgay, chuanHoaNgay };
