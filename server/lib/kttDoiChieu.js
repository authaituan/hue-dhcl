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
const kplMoi = () => ({ noi_den: {}, khong_thay: 0, khong_thay_nguon: {} }); // khong_phan_loai đã ghi đi: nơi đến thực tế -> số; số không thấy ở BCVH nào (kèm nguồn hàng)
// KTT-16-3: tg = độ trễ «KTT ghi đi -> BCVH đích nhận» của thanh 2 (tai_dich): histogram theo PHÚT (khóa phút -> số), am = độ trễ âm (không vào histogram), cung_ngay = số mẫu không âm có mốc cùng ngày lịch với giờ lập BD10.
// chuyen = các chuyến BD10 (khóa «mã BD10|giờ lập») -> { b, g, n (SHBG đã ghi đi, đã phân loại), ct (chưa thấy) }. ly_do = lý do thiếu trạng thái của SHBG chưa thấy thanh 1. Không giữ danh sách SHBG.
const tgMoi = () => ({ hist: {}, n: 0, am: 0, khong_doc: 0, cung_ngay: 0 });
// KTT-16-4: ctcq = số SHBG «chuyển tiếp chưa quét đi» (nguồn chuyen_tiep, nhóm chưa đi trên 24 giờ, không hoàn) đích 6 BCVH Huế; ch.h/ch.nt = histogram phút (thưa) và số mẫu thời gian nhận của chuyến.
const bcvhMoi = () => ({ tap_chinh: khoiMoi(), da_ghi_di: khoiMoi(), khac_noi_den: { tap_chinh: {}, da_ghi_di: {} }, kpl: kplMoi(), hang_hoan: 0, tg: tgMoi(), chuyen: {}, ly_do: {}, ctcq: 0 });

/** Lý do SHBG thanh 1 (chưa đi trên 24 giờ) đang thiếu trạng thái. Kiện đi ngoài không có khái niệm «mở túi». */
const LY_DO = Object.freeze({
  KDN_DA_XAC_NHAN: 'Kiện đi ngoài đã xác nhận, chưa lập BD10 đi',
  KDN_CHUA_XAC_NHAN: 'Kiện đi ngoài chưa xác nhận',
  TUI_CHUA_QUET_DI: 'Túi khai thác đến chưa quét đi',
  TUI_CHUYEN_TIEP_DA_CHIA_SAN: 'Túi chuyển tiếp đã chia sẵn, chưa quét đi',
  KHAC: 'Khác'
});
/** Kiện đi ngoài (định nghĩa PO): luồng túi DI_NGOAI, hoặc số hiệu BD8 trùng SHBG. Khóa `chuyen_tiep` của `theo_nguon` (nhóm thiếu giờ quét đến) = kiện đi ngoài, `khai_thac` = túi khai thác. */
const laKienDiNgoai = (u) => u.luong === 'DI_NGOAI' || (!!u.soHieuBd8 && u.soHieuBd8 === u.shbg);
/** Hàng chuyển tiếp luồng DA_CHIA_SAN mà BD8 khác SHBG: nằm trong túi (không phải kiện đi ngoài). */
const laChuyenTiepDaChiaSan = (u) => u.nguonHang === 'chuyen_tiep' && u.luong === 'DA_CHIA_SAN';
function lyDoThieu(u) {
  if (laKienDiNgoai(u)) return u.xndBd10 ? 'KDN_DA_XAC_NHAN' : 'KDN_CHUA_XAC_NHAN';
  if (laChuyenTiepDaChiaSan(u)) return 'TUI_CHUYEN_TIEP_DA_CHIA_SAN';
  return u.xndBd10 && !u.coTuiDi ? 'TUI_CHUA_QUET_DI' : 'KHAC';
}
/** Nguồn của SHBG thiếu giờ quét túi đến (khóa của theo_nguon). */
const nguonKpl = (u) => (laKienDiNgoai(u) ? 'chuyen_tiep' : laChuyenTiepDaChiaSan(u) ? 'da_chia_san' : 'khai_thac');
const NHAN_KPL = 'Thiếu giờ quét túi đến ở KTT';
const NGUON_KPL = Object.freeze({ chuyen_tiep: 'Kiện đi ngoài', khai_thac: 'Túi khai thác', da_chia_san: 'Túi chuyển tiếp đã chia sẵn' });
/** Chuyến «mất dấu»: mọi SHBG đã ghi đi của chuyến đều chưa thấy (ty_le_chua_thay >= TY_LE) và có ít nhất SO_SHBG_TOI_THIEU SHBG. PO duyệt 01/11/2026. */
const MAT_DAU = Object.freeze({ TY_LE: 1, SO_SHBG_TOI_THIEU: 5 });

const goc = new Map(); // 'YYYY-MM-DD' -> giây của 00:00:00 (ít ngày khác nhau; tránh phân tích chuỗi đầy đủ cho từng SHBG)
const SO = /^\d\d:\d\d:\d\d/;
/** Như L.giayCua cho dạng 'YYYY-MM-DD HH:MM:SS[...]' hợp lệ (đường nhanh theo ngày đã nhớ); dạng khác -> L.giayCua. */
function giayNhanh(c) {
  if (typeof c !== 'string' || c.length < 19 || c.charCodeAt(10) !== 32) return L.giayCua(c);
  const ngay = c.slice(0, 10);
  let g = goc.get(ngay);
  if (g === undefined) { g = L.giayCua(`${ngay} 00:00:00`); if (goc.size > 4000) goc.clear(); goc.set(ngay, g); }
  const gio = c.slice(11, 19);
  if (g === null || !SO.test(gio)) return L.giayCua(c);
  const h = +gio.slice(0, 2); const m = +gio.slice(3, 5); const s = +gio.slice(6, 8);
  if (h > 23 || m > 59 || s > 59) return L.giayCua(c);
  return g + h * 3600 + m * 60 + s;
}
/** Ghi một mẫu độ trễ (moc = mốc đến muộn nhất ở đích, gdi = giờ lập BD10 đi) vào tg; trả số phút của mẫu hợp lệ, hoặc null. */
function ghiDoTre(tg, moc, gdi) {
  const a = giayNhanh(moc);
  const b = giayNhanh(gdi);
  if (a === null || b === null) { tg.khong_doc++; return null; }
  const delta = a - b;
  if (delta < 0) { tg.am++; return null; }
  tg.n++;
  const phut = Math.floor(delta / 60);
  tg.hist[phut] = (tg.hist[phut] || 0) + 1;
  if (String(moc).slice(0, 10) === String(gdi).slice(0, 10)) tg.cung_ngay++;
  return phut; // KTT-16-4: phút của mẫu hợp lệ (cho histogram theo chuyến); null = âm / không đọc được
}
const ngayCong = (ngay, n) => L.dinhDang(L.giayCua(`${ngay} 00:00:00`) + n * 86400).slice(0, 10);
const cong1 = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/** Bó rỗng của một ngày. */
function taoNgayDoiChieu(ngay) {
  return { ngay, co_du_lieu: false, ctcq_khac: 0, bcvh: Object.fromEntries(MA_BCVH_HUE.map((m) => [m, bcvhMoi()])) };
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
function boThuThap(ngay, tuyChon = null) {
  const lietKe = !!(tuyChon && tuyChon.lietKe); // KTT-16-4: chế độ XUẤT — thêm danh sách dòng (b.dong) ngoài số đếm; bó đếm không đổi
  const b = taoNgayDoiChieu(ngay);
  const dongCt = []; // chuyển tiếp chưa quét đi (kể cả đích ngoài 6 BCVH Huế)
  const ex = [];
  const shbg = [];
  const dich = [];
  const bit = [];
  const gdi = [];
  const bd10 = [];
  const lyDo = [];
  const nguon = [];
  return {
    them(u, kq, pl) {
      b.co_du_lieu = true;
      if (!pl.bo && !pl.khac && !pl.hanHoan && pl.nhom === 'chua_di_tren_24h' && u.nguonHang === 'chuyen_tiep') { // KTT-16-4: «chuyển tiếp chưa quét đi» (không phụ thuộc cửa sổ BCVH)
        const hue = u.nhom === 'BCVH_HUE' && !!u.maBcvh && !!b.bcvh[u.maBcvh];
        if (hue) b.bcvh[u.maBcvh].ctcq++; else b.ctcq_khac++;
        if (lietKe) dongCt.push({ s: u.shbg, d: hue ? u.maBcvh : null, g: u.quetDen || u.xndBd10 || null });
      }
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
      gdi.push(u.gioBd10Di || null); bd10.push(u.bd10Di || ''); nguon.push(nguonKpl(u));
      lyDo.push(m & 1 ? lyDoThieu(u) : null);
      if (lietKe && tuyChon.ex !== false) ex.push({ g: u.quetDen || u.xndBd10 || null, ngay: u.ngayDen || null, bd8: u.soHieuBd8 || null, bd10den: u.bd10Den || null });
    },
    xong(db) {
      if (lietKe) b.dong = { chuyen_tiep: dongCt, chua_thay: [], bcvh_khac: [], chua_thay_t2: [] };
      if (shbg.length === 0) return b;
      const co = traCuuBcvh(db, shbg, ngay, ngayCong(ngay, NGAY_SAU_D));
      for (let i = 0; i < shbg.length; i++) {
        const x = b.bcvh[dich[i]];
        const c = co.get(shbg[i]);
        if (bit[i] & 4) {
          const nd = noiDen(c);
          if (nd === null) { x.kpl.khong_thay++; cong1(x.kpl.khong_thay_nguon, nguon[i] || 'khai_thac'); } else cong1(x.kpl.noi_den, nd);
          continue;
        }
        const loai = loaiGhep(dich[i], c);
        const nd = loai === LOAI.BCVH_KHAC ? noiDen(c) : null;
        if (bit[i] & 1) {
          x.tap_chinh[loai]++; if (nd) cong1(x.khac_noi_den.tap_chinh, nd); if (loai === LOAI.CHUA_THAY) cong1(x.ly_do, lyDo[i]);
          if (lietKe && loai === LOAI.CHUA_THAY) b.dong.chua_thay.push({ s: shbg[i], d: dich[i], ly: lyDo[i], ...ex[i] });
          if (lietKe && loai === LOAI.BCVH_KHAC) b.dong.bcvh_khac.push({ s: shbg[i], d: dich[i], nd, gb: c.get(nd), ...ex[i] });
        }
        if (bit[i] & 2) {
          x.da_ghi_di[loai]++; if (nd) cong1(x.khac_noi_den.da_ghi_di, nd);
          const kc = `${bd10[i]}|${gdi[i]}`;
          const ch = x.chuyen[kc] || (x.chuyen[kc] = { b: bd10[i], g: gdi[i], n: 0, ct: 0, nt: 0, h: {} });
          if (loai === LOAI.TAI_DICH) {
            const ph = ghiDoTre(x.tg, c.get(dich[i]), gdi[i]);
            if (ph !== null) { ch.nt++; ch.h[ph] = (ch.h[ph] || 0) + 1; }
          }
          ch.n++;
          if (loai === LOAI.CHUA_THAY) { ch.ct++; if (lietKe) b.dong.chua_thay_t2.push({ s: shbg[i], d: dich[i], b: bd10[i], g: gdi[i] }); }
        }
      }
      return b;
    }
  };
}

/** Bó đối chiếu của MỘT ngày đến D tính ở «bây giờ» = bayGio, với lượt duyệt RIÊNG (dùng khi không cần bó B). */
function tinhNgayDoiChieu(db, ngay, bayGio, tuyChon = null) {
  const t = boThuThap(ngay, tuyChon);
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

// ------------------------------------------
// KTT-16-3: thời gian BCVH nhận, chuyến mất dấu, nguồn «chưa thấy» (HÀM THUẦN trên bó theo ngày; cửa sổ / cờ áp lúc ghép như ghepTongHop)
// ------------------------------------------
const lamTron3 = (x) => Math.round(x * 1000) / 1000;
/** Phân vị theo THỨ HẠNG GẦN NHẤT (rank = ceil(p*n)) trên histogram phút; trả giờ = cận trên của bin phút (sai lệch so với tính chính xác < 1 phút). */
function phanViHist(hist, n, p) {
  if (!n) return null;
  const khoa = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const dich = Math.ceil(p * n);
  let c = 0;
  for (const k of khoa) { c += hist[k]; if (c >= dich) return lamTron3((k + 1) / 60); }
  return null;
}
const tgCong = (a, b) => {
  for (const [k, v] of Object.entries(b.hist)) a.hist[k] = (a.hist[k] || 0) + v;
  a.n += b.n; a.am += b.am; a.khong_doc += b.khong_doc; a.cung_ngay += b.cung_ngay;
  return a;
};
const tyLe4 = (t, m) => (m > 0 ? Math.round((t / m) * 10000) / 10000 : null);
function thongKeTg(tg) {
  const tong = tg.n + tg.am + tg.khong_doc;
  return {
    mau_tong: tong, mau: tg.n, am: tg.am, khong_doc: tg.khong_doc, ty_le_am: tyLe4(tg.am, tong),
    cung_ngay: tg.cung_ngay, ty_le_cung_ngay: tyLe4(tg.cung_ngay, tg.n), p50_gio: phanViHist(tg.hist, tg.n, 0.5), p90_gio: phanViHist(tg.hist, tg.n, 0.9)
  };
}
const doPhuTheoMaNgay = (doPhu) => new Map(doPhu.bcvh.map((x) => [x.ma, new Map(x.theo_ngay.map((n) => [n.ngay, n]))]));

/** (a) p50 / p90 (giờ), % đến cùng ngày đi, số âm — theo BCVH đích và theo ngày; chỉ ngày D trong cửa sổ của đích. */
function ghepThoiGianNhan({ ngays, bo, doPhu, maBcvh = null }) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const dpMa = doPhuTheoMaNgay(doPhu);
  const gop = Object.fromEntries(dsMa.map((ma) => [ma, tgMoi()]));
  const ngoai = Object.fromEntries(dsMa.map((ma) => [ma, 0]));
  const tong = tgMoi();
  const theoNgay = ngays.map((ngay) => {
    const b = bo[ngay] || taoNgayDoiChieu(ngay);
    const hang = { ngay, theo_bcvh: {} };
    for (const ma of dsMa) {
      const tg = (b.bcvh[ma] || bcvhMoi()).tg;
      const trong = !!dpMa.get(ma).get(ngay).trong_cua_so;
      if (!trong) { ngoai[ma] += tg.n + tg.am + tg.khong_doc; hang.theo_bcvh[ma] = { trong_cua_so: false, ...thongKeTg(tgMoi()) }; continue; }
      tgCong(gop[ma], tg); tgCong(tong, tg);
      hang.theo_bcvh[ma] = { trong_cua_so: true, ...thongKeTg(tg) };
    }
    return hang;
  });
  return {
    theo_bcvh: Object.fromEntries(dsMa.map((ma) => [ma, { ...thongKeTg(gop[ma]), ngoai_cua_so: ngoai[ma] }])),
    tong_cong: { ...thongKeTg(tong), ngoai_cua_so: Object.values(ngoai).reduce((s, n) => s + n, 0) },
    theo_ngay: theoNgay
  };
}

/** (b) Chuyến BD10 (mã BD10 + giờ lập + BCVH đích) có SHBG chưa thấy. Gộp nhiều ngày theo chuyến; `NGHI_THIEU_FILE` khi có SHBG chưa thấy rơi vào ngày cờ dương tính giả. */
function ghepChuyenMatDau({ ngays, bo, doPhu, maBcvh = null }) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const dpMa = doPhuTheoMaNgay(doPhu);
  const chuyen = new Map();
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b) continue;
    for (const ma of dsMa) {
      const dp = dpMa.get(ma).get(ngay);
      if (!dp.trong_cua_so) continue;
      for (const c of Object.values((b.bcvh[ma] || bcvhMoi()).chuyen)) {
        const khoa = `${ma}|${c.b}|${c.g}`;
        const e = chuyen.get(khoa) || { ma_bd10: c.b, gio_lap: c.g, ma_bcvh_dich: ma, so_shbg: 0, so_chua_thay: 0, so_chua_thay_nghi: 0 };
        e.so_shbg += c.n; e.so_chua_thay += c.ct;
        if (dp.co_the_duong_tinh_gia) e.so_chua_thay_nghi += c.ct;
        chuyen.set(khoa, e);
      }
    }
  }
  const phanBo = { khong: 0, duoi_10: 0, tu_10_den_duoi_50: 0, tu_50_den_duoi_100: 0, het: 0 };
  let tongShbg = 0;
  const matDau = [];
  const so = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  for (const e of chuyen.values()) {
    tongShbg += e.so_shbg;
    const r = e.so_chua_thay / e.so_shbg;
    if (r === 0) phanBo.khong++; else if (r < 0.1) phanBo.duoi_10++; else if (r < 0.5) phanBo.tu_10_den_duoi_50++; else if (r < 1) phanBo.tu_50_den_duoi_100++; else phanBo.het++;
    if (r >= MAT_DAU.TY_LE && e.so_shbg >= MAT_DAU.SO_SHBG_TOI_THIEU) {
      matDau.push({ ...e, ty_le_chua_thay: Math.round(r * 10000) / 10000, loai: e.so_chua_thay_nghi > 0 ? 'NGHI_THIEU_FILE' : 'MAT_DAU_CHAC' });
    }
  }
  matDau.sort((a, b) => b.so_chua_thay - a.so_chua_thay || so(a.gio_lap, b.gio_lap) || so(a.ma_bd10, b.ma_bd10));
  const tom = (loai) => { const ds = matDau.filter((x) => x.loai === loai); return { so_chuyen: ds.length, so_shbg: ds.reduce((s, x) => s + x.so_chua_thay, 0) }; };
  return {
    tieu_chi: { ty_le_chua_thay_toi_thieu: MAT_DAU.TY_LE, so_shbg_toi_thieu: MAT_DAU.SO_SHBG_TOI_THIEU },
    tong_chuyen: chuyen.size, tong_shbg_da_ghi_di: tongShbg, phan_bo_ty_le_chua_thay: phanBo,
    so_chuyen_mat_dau: matDau.length, mat_dau_chac: tom('MAT_DAU_CHAC'), nghi_thieu_file: tom('NGHI_THIEU_FILE'),
    danh_sach: matDau
  };
}

/**
 * (c) Nguồn của SHBG «chưa thấy». Hai bảng, mỗi bảng loại trừ lẫn nhau và cộng đúng:
 *  - thanh_1: SHBG tập chính chưa thấy trong cửa sổ (= tong_cong.tap_chinh.chua_thay của ghepTongHop), chia theo BCVH đích và theo lý do đang thiếu trạng thái;
 *  - thieu_gio_quet_den: SHBG đã ghi đi nhưng thiếu giờ quét túi đến (= khong_phan_loai_da_ghi_di.tong): đã thấy (theo nơi đến thực tế) + chưa thấy (theo nguồn) + ngoài cửa sổ.
 */
function ghepChuaThay({ ngays, bo, doPhu, maBcvh = null }) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const dpMa = doPhuTheoMaNgay(doPhu);
  const t1 = { tong: 0, nghi: 0, theoBcvh: Object.fromEntries(dsMa.map((m) => [m, 0])), lyDo: {}, lyDoNghi: {}, bcvhLyDo: Object.fromEntries(dsMa.map((m) => [m, {}])) };
  const t2 = { tong: 0, daThay: 0, noiDen: {}, chuaThay: 0, nguon: {}, nghi: 0, ngoai: 0 };
  const theoNgay = ngays.map((ngay) => {
    const b = bo[ngay] || taoNgayDoiChieu(ngay);
    const cacBcvh = MA_BCVH_HUE.map((ma) => dpMa.get(ma).get(ngay));
    const tatCaTrong = cacBcvh.every((n) => n && n.trong_cua_so);
    const baoNghi = cacBcvh.some((n) => n && n.co_the_duong_tinh_gia);
    const h = { ngay, thanh_1: { tong: 0, theo_ly_do: {} }, thieu_gio_quet_den: { tong: 0, da_thay: 0, chua_thay: 0, ngoai_cua_so: 0 } };
    for (const ma of dsMa) {
      const x = b.bcvh[ma] || bcvhMoi();
      const dp = dpMa.get(ma).get(ngay);
      if (dp.trong_cua_so) {
        for (const [ly, n] of Object.entries(x.ly_do)) {
          t1.tong += n; t1.theoBcvh[ma] += n; cong1(t1.lyDo, ly, n); cong1(t1.bcvhLyDo[ma], ly, n);
          h.thanh_1.tong += n; cong1(h.thanh_1.theo_ly_do, ly, n);
          if (dp.co_the_duong_tinh_gia) { t1.nghi += n; cong1(t1.lyDoNghi, ly, n); }
        }
      }
      const daThay = Object.values(x.kpl.noi_den).reduce((s, n) => s + n, 0);
      congMap(t2.noiDen, x.kpl.noi_den);
      t2.daThay += daThay; t2.tong += daThay + x.kpl.khong_thay;
      h.thieu_gio_quet_den.tong += daThay + x.kpl.khong_thay; h.thieu_gio_quet_den.da_thay += daThay;
      if (tatCaTrong) {
        t2.chuaThay += x.kpl.khong_thay; congMap(t2.nguon, x.kpl.khong_thay_nguon);
        if (baoNghi) t2.nghi += x.kpl.khong_thay;
        h.thieu_gio_quet_den.chua_thay += x.kpl.khong_thay;
      } else { t2.ngoai += x.kpl.khong_thay; h.thieu_gio_quet_den.ngoai_cua_so += x.kpl.khong_thay; }
    }
    return h;
  });
  const dsLyDo = (m, nghi) => Object.keys(LY_DO).filter((k) => m[k]).map((k) => ({ ma: k, nhan: LY_DO[k], so_luong: m[k], nghi_duong_tinh_gia: nghi[k] || 0 }));
  return {
    thanh_1: { tong: t1.tong, nghi_duong_tinh_gia: t1.nghi, theo_bcvh: t1.theoBcvh, theo_ly_do: dsLyDo(t1.lyDo, t1.lyDoNghi), theo_bcvh_ly_do: t1.bcvhLyDo },
    thieu_gio_quet_den: {
      nhan: NHAN_KPL, tong: t2.tong,
      da_thay: { tong: t2.daThay, theo_bcvh_noi_den: t2.noiDen },
      chua_thay: { tong: t2.chuaThay, nghi_duong_tinh_gia: t2.nghi, theo_nguon: Object.keys(NGUON_KPL).filter((k) => t2.nguon[k]).map((k) => ({ ma: k, nhan: NGUON_KPL[k], so_luong: t2.nguon[k] })) },
      ngoai_cua_so: t2.ngoai
    },
    theo_ngay: theoNgay
  };
}

// ------------------------------------------
// KTT-16-4: chuyển tiếp chưa quét đi, chuyến chậm (HÀM THUẦN trên bó theo ngày)
// ------------------------------------------
/**
 * Ngưỡng «chuyến chậm» (PO chọn; đổi ở đây): chuyến BD10 (trong cửa sổ của đích) có ít nhất SO_MAU_TOI_THIEU SHBG đã thấy ở đích với mẫu hợp lệ
 * và TRUNG VỊ thời gian «giờ lập BD10 đi -> BCVH đích nhận» > NGUONG_TRUNG_VI_GIO. C1/C2/C3: chưa có căn cứ trong dữ liệu -> không suy đoán (cột để trống).
 */
const CHUYEN_CHAM = Object.freeze({ NGUONG_TRUNG_VI_GIO: 6, SO_MAU_TOI_THIEU: 5 });

/** Số SHBG «chuyển tiếp chưa quét đi» (nhóm chưa đi trên 24 giờ, nguồn chuyển tiếp, không hoàn), không phụ thuộc cửa sổ BCVH. maBcvh lọc theo đích: chỉ đích 6 BCVH Huế (khac = 0). */
function ghepChuyenTiepChuaQuet({ ngays, bo, maBcvh = null }) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const theoBcvh = Object.fromEntries(dsMa.map((m) => [m, 0]));
  let khac = 0;
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b) continue;
    for (const ma of dsMa) theoBcvh[ma] += (b.bcvh[ma] || bcvhMoi()).ctcq;
    if (!maBcvh) khac += b.ctcq_khac || 0;
  }
  const hue = Object.values(theoBcvh).reduce((s, n) => s + n, 0);
  return { tong: hue + khac, thuoc_bcvh_hue: hue, khac, theo_bcvh: theoBcvh };
}

/** Chuyến (mã BD10, giờ lập, BCVH đích) gộp nhiều ngày, mẫu thời gian nhận (histogram phút) trong cửa sổ của đích. Trả mảng { ma_bd10, gio_lap, ma_bcvh_dich, so_shbg, mau, p50_gio, p90_gio, gio_den_trung_vi }. */
function gopThoiGianChuyen({ ngays, bo, doPhu, maBcvh = null }) {
  const dsMa = maBcvh ? [maBcvh] : MA_BCVH_HUE;
  const dpMa = doPhuTheoMaNgay(doPhu);
  const chuyen = new Map();
  for (const ngay of ngays) {
    const b = bo[ngay];
    if (!b) continue;
    for (const ma of dsMa) {
      if (!dpMa.get(ma).get(ngay).trong_cua_so) continue;
      for (const c of Object.values((b.bcvh[ma] || bcvhMoi()).chuyen)) {
        const khoa = `${ma}|${c.b}|${c.g}`;
        const e = chuyen.get(khoa) || { ma_bd10: c.b, gio_lap: c.g, ma_bcvh_dich: ma, so_shbg: 0, mau: 0, hist: {} };
        e.so_shbg += c.n; e.mau += c.nt || 0;
        for (const [k, v] of Object.entries(c.h || {})) e.hist[k] = (e.hist[k] || 0) + v;
        chuyen.set(khoa, e);
      }
    }
  }
  const kq = [];
  for (const e of chuyen.values()) {
    const p50 = phanViHist(e.hist, e.mau, 0.5);
    const gioLap = L.giayCua(e.gio_lap);
    kq.push({
      ma_bd10: e.ma_bd10, gio_lap: e.gio_lap, ma_bcvh_dich: e.ma_bcvh_dich, so_shbg: e.so_shbg, mau: e.mau,
      p50_gio: p50, p90_gio: phanViHist(e.hist, e.mau, 0.9), gio_den_trung_vi: p50 !== null && gioLap !== null ? L.dinhDang(gioLap + Math.round(p50 * 3600)) : null
    });
  }
  return kq;
}

/** Chuyến chậm = chuyến có mẫu >= SO_MAU_TOI_THIEU và trung vị > NGUONG_TRUNG_VI_GIO (hằng CHUYEN_CHAM). Sắp: trung vị giảm dần, rồi giờ lập, mã BD10. */
function ghepChuyenCham(p) {
  const so = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const tatCa = gopThoiGianChuyen(p);
  const ds = tatCa.filter((c) => c.mau >= CHUYEN_CHAM.SO_MAU_TOI_THIEU && c.p50_gio !== null && c.p50_gio > CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO)
    .sort((a, b) => b.p50_gio - a.p50_gio || so(a.gio_lap, b.gio_lap) || so(a.ma_bd10, b.ma_bd10));
  return {
    tieu_chi: { trung_vi_toi_thieu_gio_vuot: CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO, so_mau_toi_thieu: CHUYEN_CHAM.SO_MAU_TOI_THIEU },
    tong_chuyen: tatCa.length, so_chuyen_cham: ds.length, so_shbg_chuyen_cham: ds.reduce((s, c) => s + c.so_shbg, 0), danh_sach: ds
  };
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

module.exports = { LOAI, LY_DO, MAT_DAU, taoNgayDoiChieu, boThuThap, tinhNgayDoiChieu, ghepTongHop, ghepThoiGianNhan, ghepChuyenMatDau, ghepChuaThay, ghepChuyenTiepChuaQuet, gopThoiGianChuyen, ghepChuyenCham, CHUYEN_CHAM, doPhuTheoMaNgay, phanViHist, chuKyBcvh, traCuuBcvh, loaiGhep, noiDen };
