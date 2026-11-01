// ==========================================
// «Hàng tại KTT» (KTT-16-2): GHÉP KTT ↔ «Hàng đến BCVH» (arrival_items) và tổng hợp đối chiếu. CHỈ ĐỌC DB.
// Ba lớp:
//  - boThuThap()/tinhNgayDoiChieu(): bó số đếm MỘT ngày đến D (lượt duyệt SHBG của KTT-14 + tra arrival_items theo lô). Không giữ danh sách SHBG: chỉ đếm.
//  - ghepTongHop(): HÀM THUẦN ghép các bó ngày với độ phủ của KTT-16-1 (cửa sổ kiểm tra được từng BCVH) thành kết quả của route.
//  - chuKyBcvh(): chữ ký dữ liệu BCVH của MỘT ngày (dùng cho cache theo ngày ở kttApi.js).
// Tập chính = SHBG nhóm `chua_di_tren_24h` (D.phanLoaiDi) KHÔNG phải hàng hoàn (hàng hoàn = KTT-17-2, tách riêng, chỉ trả số `hang_hoan_loai_khoi`).
// «Đã ghi đi» (thanh 2) = SHBG đích 6 BCVH Huế, không hoàn, có giờ lập BD10 đi. Khóa ghép tracking_no ↔ SHBG, khớp chuỗi trực tiếp.
// «Có mặt ở BCVH» = có dòng arrival_items với MỐC ĐẾN HỢP LỆ (arrival_at khác NULL / rỗng); nơi đến thực tế = BCVH có mốc muộn nhất. PO chốt: đã có mặt ở BCVH nào thì xếp vào BCVH đó,
// không xét trạng thái túi KTT; chỉ SHBG không thấy ở BCVH nào mới là «chưa thấy».
// Tra BCVH: chỉ file OK có file_date trong [D, D+2] (cùng ba ngày mà cờ «dương tính giả» của KTT-16-1 xét) nên chữ ký cache của ngày D bắt được mọi thay đổi có thể đổi kết quả.
// Tài liệu: docs/ai/44_KTT_DO_PHU_BCVH.md mục 8.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const DQ = require('./kttDiNgayQuery');
const { MA_BCVH_HUE } = require('./kttTinh');

const LOAI = Object.freeze({ TAI_DICH: 'tai_dich', BCVH_KHAC: 'bcvh_khac', CHUA_THAY: 'chua_thay' });
const KHOI_LO_TRA_CUU = 800; // số SHBG mỗi câu truy vấn arrival_items (≤ giới hạn tham số của SQLite)
const NGAY_SAU_D = 2; // khớp kttDoPhuBcvh.NGAY_SAU_D_XET_CO

const khoiMoi = () => ({ tai_dich: 0, bcvh_khac: 0, chua_thay: 0 });
const kplMoi = () => ({ noi_den: {}, khong_thay: 0 }); // khong_phan_loai đã ghi đi: nơi đến thực tế -> số; số không thấy ở BCVH nào
const bcvhMoi = () => ({ tap_chinh: khoiMoi(), da_ghi_di: khoiMoi(), khac_noi_den: { tap_chinh: {}, da_ghi_di: {} }, kpl: kplMoi(), hang_hoan: 0 });
const ngayCong = (ngay, n) => L.dinhDang(L.giayCua(`${ngay} 00:00:00`) + n * 86400).slice(0, 10);
const cong1 = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/** Bó rỗng của một ngày. */
function taoNgayDoiChieu(ngay) {
  return { ngay, co_du_lieu: false, bcvh: Object.fromEntries(MA_BCVH_HUE.map((m) => [m, bcvhMoi()])) };
}

/**
 * Tra các SHBG trong arrival_items của 6 BCVH (file OK, file_date trong [tu, den]). ds: mảng chuỗi SHBG (không trùng).
 * «Có mặt» chỉ tính DÒNG CÓ MỐC ĐẾN HỢP LỆ (arrival_at khác NULL / rỗng — mốc R2: XN túi / XNĐ BD10 / XN bưu gửi); dòng «chưa xác định ngày đến» KHÔNG phải đã đến.
 * Trả Map SHBG -> Map(mã BCVH -> mốc đến muộn nhất của SHBG ở BCVH đó). Chỉ mục ix_arrival_items_tracking; lô nhỏ để không giữ nhiều tham số.
 */
function traCuuBcvh(db, ds, tu, den) {
  const kq = new Map();
  for (let i = 0; i < ds.length; i += KHOI_LO_TRA_CUU) {
    const lo = ds.slice(i, i + KHOI_LO_TRA_CUU);
    const cham = lo.map(() => '?').join(',');
    const sql = `SELECT i.tracking_no AS t, f.unit_code AS m, i.arrival_at AS g FROM arrival_items i INDEXED BY ix_arrival_items_tracking
      JOIN arrival_import_files f ON f.id = i.import_file_id
      WHERE i.tracking_no IN (${cham}) AND f.status = 'OK' AND f.file_date BETWEEN ? AND ? AND f.unit_code IN (${MA_BCVH_HUE.map(() => '?').join(',')})
        AND i.arrival_at IS NOT NULL AND i.arrival_at <> ''`;
    for (const r of db.prepare(sql).iterate(...lo, tu, den, ...MA_BCVH_HUE)) {
      let s = kq.get(r.t);
      if (!s) { s = new Map(); kq.set(r.t, s); }
      const cu = s.get(r.m);
      if (cu === undefined || r.g > cu) s.set(r.m, r.g);
    }
  }
  return kq;
}

/** Nơi đến thực tế = BCVH có mốc đến hợp lệ MUỘN NHẤT (hòa: mã nhỏ hơn). `co`: Map mã -> mốc | undefined. Không có mặt ở đâu -> null. */
function noiDen(co) {
  if (!co || co.size === 0) return null;
  let tot = null;
  for (const [ma, g] of co) if (tot === null || g > tot[1] || (g === tot[1] && ma < tot[0])) tot = [ma, g];
  return tot[0];
}

/** Loại của một SHBG đích `ma` khi tập BCVH có nó là `co` (Map mã -> mốc | undefined): có ở đích -> TAI_DICH (kể cả có ở BCVH khác); chỉ ở nơi khác -> BCVH_KHAC; không đâu -> CHUA_THAY. */
function loaiGhep(ma, co) {
  if (co && co.has(ma)) return LOAI.TAI_DICH;
  return co && co.size > 0 ? LOAI.BCVH_KHAC : LOAI.CHUA_THAY;
}

/**
 * Bộ thu thập của MỘT ngày đến D: `them(u, kq, pl)` gắn vào lượt duyệt SHBG (DQ.chayShbg / DQ.tinhNgay), `xong(db)` tra arrival_items theo lô rồi trả bó đếm.
 * Cùng lượt duyệt, cùng tập SHBG với bó B của KTT-12 nên cùng số `chua_di_tren_24h`; có thể dùng CHUNG một lượt duyệt với bó B (kttApi.layNgayDC) để không duyệt hai lần.
 * Danh sách SHBG chỉ tồn tại trong bộ thu thập này (≤ vài chục nghìn chuỗi, giải phóng khi xong), không đưa vào kết quả.
 * Nhóm bit: 1 = tập chính, 2 = đã ghi đi đã phân loại, 4 = `khong_phan_loai` đã ghi đi (có giờ lập BD10 đi nhưng thiếu giờ quét túi đến nên không xếp được chuyến): xếp theo NƠI ĐẾN THỰC TẾ.
 */
function boThuThap(ngay) {
  const b = taoNgayDoiChieu(ngay);
  const shbg = [];
  const dich = [];
  const bit = [];
  return {
    them(u, kq, pl) {
      b.co_du_lieu = true;
      if (pl.bo || !u.maBcvh || !b.bcvh[u.maBcvh] || u.nhom !== 'BCVH_HUE') return;
      if (pl.hanHoan) { b.bcvh[u.maBcvh].hang_hoan++; return; }
      let m = 0;
      const daGhiDi = L.giayCua(u.gioBd10Di) !== null;
      if (pl.khac === 'khong_phan_loai') {
        if (daGhiDi) m = 4;
      } else {
        if (!pl.khac && pl.nhom === 'chua_di_tren_24h') m |= 1;
        if (daGhiDi) m |= 2;
      }
      if (m === 0) return;
      shbg.push(u.shbg); dich.push(u.maBcvh); bit.push(m);
    },
    xong(db) {
      if (shbg.length === 0) return b;
      const co = traCuuBcvh(db, shbg, ngay, ngayCong(ngay, NGAY_SAU_D));
      for (let i = 0; i < shbg.length; i++) {
        const x = b.bcvh[dich[i]];
        const c = co.get(shbg[i]);
        if (bit[i] & 4) {
          const nd = noiDen(c);
          if (nd === null) x.kpl.khong_thay++; else cong1(x.kpl.noi_den, nd);
          continue;
        }
        const loai = loaiGhep(dich[i], c);
        const nd = loai === LOAI.BCVH_KHAC ? noiDen(c) : null;
        if (bit[i] & 1) { x.tap_chinh[loai]++; if (nd) cong1(x.khac_noi_den.tap_chinh, nd); }
        if (bit[i] & 2) { x.da_ghi_di[loai]++; if (nd) cong1(x.khac_noi_den.da_ghi_di, nd); }
      }
      return b;
    }
  };
}

/** Bó đối chiếu của MỘT ngày đến D tính ở «bây giờ» = bayGio, với lượt duyệt RIÊNG (dùng khi không cần bó B). */
function tinhNgayDoiChieu(db, ngay, bayGio) {
  const t = boThuThap(ngay);
  DQ.chayShbg(db, { tuNgay: ngay, denNgay: ngay, bayGio }, t.them);
  return t.xong(db);
}

const tongKhoi = (k) => k.tai_dich + k.bcvh_khac + k.chua_thay;
const congMap = (a, b) => { for (const [k, n] of Object.entries(b)) a[k] = (a[k] || 0) + n; return a; };
const khoiKpl = () => ({ tong: 0, theo_bcvh_noi_den: {}, chua_thay: 0, ngoai_cua_so: 0, nghi_duong_tinh_gia: 0 });

/** Khối kết quả của một nhóm: trong cửa sổ chia ba loại + chú thích dương tính giả; ngoài cửa sổ chỉ đếm. `coKpl`: thêm khối khong_phan_loai_da_ghi_di (chỉ thanh 2). */
function khoiKetQua(coKpl = false) {
  const k = { tong: 0, trong_cua_so: 0, ngoai_cua_so: 0, tai_dich: 0, bcvh_khac: 0, chua_thay: 0, nghi_duong_tinh_gia: 0, bcvh_khac_theo_noi_den: {} };
  if (coKpl) { k.tong_da_phan_loai = 0; k.khong_phan_loai_da_ghi_di = khoiKpl(); }
  return k;
}
function themKhoiKetQua(kq, k, nd, trongCuaSo, nghi) {
  const t = tongKhoi(k);
  kq.tong += t;
  if (!trongCuaSo) { kq.ngoai_cua_so += t; return; }
  kq.trong_cua_so += t;
  kq.tai_dich += k.tai_dich; kq.bcvh_khac += k.bcvh_khac; kq.chua_thay += k.chua_thay;
  congMap(kq.bcvh_khac_theo_noi_den, nd);
  if (nghi) kq.nghi_duong_tinh_gia += k.chua_thay;
}
function congKpl(a, b) { a.tong += b.tong; a.chua_thay += b.chua_thay; a.ngoai_cua_so += b.ngoai_cua_so; a.nghi_duong_tinh_gia += b.nghi_duong_tinh_gia; congMap(a.theo_bcvh_noi_den, b.theo_bcvh_noi_den); return a; }
function congKetQua(a, b) {
  for (const key of Object.keys(a)) {
    if (key === 'bcvh_khac_theo_noi_den') congMap(a[key], b[key]);
    else if (key === 'khong_phan_loai_da_ghi_di') congKpl(a[key], b[key]);
    else a[key] += b[key];
  }
  return a;
}

/**
 * HÀM THUẦN. ngays: danh sách ngày YYYY-MM-DD của yêu cầu; bo: { ngay -> bó (taoNgayDoiChieu) }; daChot: { ngay -> bool }; doPhu: kết quả kttDoPhuBcvh (cùng khoảng, có D+1, D+2 cho cờ);
 * maBcvh: null (cả 6) hoặc một mã (lọc theo BCVH ĐÍCH mà KTT biết). Trả { theo_ngay[], tong_cong, cua_so_thuc_te }.
 * Nhóm `khong_phan_loai_da_ghi_di` (nằm trong `da_ghi_di.tong`): đã có mặt ở BCVH Y (mốc đến hợp lệ) -> tính vào Y, bất kể cửa sổ (đã thấy là bằng chứng); không thấy ở đâu -> `chua_thay` chỉ khi
 * ngày D nằm trong cửa sổ của CẢ SÁU BCVH (nhóm này không dùng đích KTT, SHBG có thể ở bất kỳ BCVH nào, nên «không thấy» chỉ kết luận được khi cả sáu đã phủ D + 48 giờ), ngược lại `ngoai_cua_so`.
 * `nghi_duong_tinh_gia` của nhóm này: bất kỳ BCVH nào trong sáu có cờ ở ngày D. `da_ghi_di.tong - khong_phan_loai_da_ghi_di.tong` = cùng ngày + hôm sau + từ 2 ngày của /dicungngay.
 */
function ghepTongHop({ ngays, bo, daChot = {}, doPhu, maBcvh = null }) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const doPhuTheoMa = new Map(doPhu.bcvh.map((x) => [x.ma, new Map(x.theo_ngay.map((n) => [n.ngay, n]))]));
  const tong = { tap_chinh: khoiKetQua(), da_ghi_di: khoiKetQua(true), hang_hoan_loai_khoi: 0 };
  const theoNgay = ngays.map((ngay) => {
    const b = bo[ngay] || taoNgayDoiChieu(ngay);
    const cacBcvh = MA_BCVH_HUE.map((ma) => doPhuTheoMa.get(ma).get(ngay));
    const tatCaTrong = cacBcvh.every((n) => n && n.trong_cua_so);
    const baoNghi = cacBcvh.some((n) => n && n.co_the_duong_tinh_gia);
    const d = { ngay, co_du_lieu: b.co_du_lieu, da_chot: !!daChot[ngay], tap_chinh: khoiKetQua(), da_ghi_di: khoiKetQua(true), hang_hoan_loai_khoi: 0, theo_bcvh: {} };
    for (const ma of dsMa) {
      const dp = doPhuTheoMa.get(ma).get(ngay);
      const x = b.bcvh[ma] || bcvhMoi();
      const trong = !!dp.trong_cua_so;
      const nghi = !!dp.co_the_duong_tinh_gia;
      const tc = khoiKetQua();
      const dg = khoiKetQua(true);
      themKhoiKetQua(tc, x.tap_chinh, x.khac_noi_den.tap_chinh, trong, nghi);
      themKhoiKetQua(dg, x.da_ghi_di, x.khac_noi_den.da_ghi_di, trong, nghi);
      dg.tong_da_phan_loai = dg.tong;
      const k = dg.khong_phan_loai_da_ghi_di;
      congMap(k.theo_bcvh_noi_den, x.kpl.noi_den);
      k.tong = Object.values(x.kpl.noi_den).reduce((s, n) => s + n, 0) + x.kpl.khong_thay;
      if (tatCaTrong) { k.chua_thay = x.kpl.khong_thay; if (baoNghi) k.nghi_duong_tinh_gia = x.kpl.khong_thay; } else k.ngoai_cua_so = x.kpl.khong_thay;
      dg.tong += k.tong;
      congKetQua(d.tap_chinh, tc); congKetQua(d.da_ghi_di, dg);
      d.hang_hoan_loai_khoi += x.hang_hoan;
      d.theo_bcvh[ma] = { trang_thai: dp.trang_thai, trong_cua_so: trong, co_the_duong_tinh_gia: nghi, ngay_thieu_trong_d_d2: dp.ngay_thieu_trong_d_d2, tap_chinh: tc, da_ghi_di: dg, hang_hoan_loai_khoi: x.hang_hoan };
    }
    congKetQua(tong.tap_chinh, d.tap_chinh); congKetQua(tong.da_ghi_di, d.da_ghi_di);
    tong.hang_hoan_loai_khoi += d.hang_hoan_loai_khoi;
    return d;
  });
  return { theo_ngay: theoNgay, tong_cong: tong, cua_so_thuc_te: doPhu.cua_so_thuc_te };
}

/**
 * Chữ ký dữ liệu BCVH của ngày D: các file OK / EMPTY của 6 BCVH có file_date trong [D, D+2] (số file, tổng id, file mới nhất). Nạp thêm / thay / khôi phục file của D..D+2 đổi chữ ký;
 * file của ngày khác không đổi nó. (Cửa sổ kiểm tra được và cờ dương tính giả KHÔNG nằm trong bó: chúng được ghép lúc trả lời từ độ phủ KTT-16-1.)
 */
function chuKyBcvh(db, ngay) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s, COALESCE(MAX(file_date || ' ' || file_time), '') AS m FROM arrival_import_files
      WHERE unit_code IN (${MA_BCVH_HUE.map(() => '?').join(',')}) AND file_date BETWEEN ? AND ? AND status IN ('OK', 'EMPTY')`).get(...MA_BCVH_HUE, ngay, ngayCong(ngay, NGAY_SAU_D));
    return `${r.n}.${r.s}.${r.m}`;
  } catch (e) { return 'khong-doc-duoc'; }
}

module.exports = { LOAI, taoNgayDoiChieu, boThuThap, tinhNgayDoiChieu, ghepTongHop, chuKyBcvh, traCuuBcvh, loaiGhep, noiDen };
