// ==========================================
// «Hàng tại KTT» (KTT-KD-1): VÌ SAO KHÔNG ĐẠT 14 GIỜ của trang «Lưu thoát». CÁC HÀM THUẦN: không DB, không giờ máy («bây giờ» là `ngu.bayGio`).
// KHÔNG đổi quy tắc nào của kttLuuThoat.js / kttLichChuyen.js / kttChuyen.js: chỉ ĐỌC `kq.chiTieu14h[m]` (phanLoaiShbg) và `danhGiaChuyenLich`, rồi cộng thêm.
// Tài liệu: docs/ai/41_KTT_LUU_THOAT.md mục «KTT-KD-1», docs/ai/42_KTT_API.md, quyết định trong docs/ai/04_DECISIONS.md.
//
// NHÓM NGUYÊN NHÂN (loại trừ nhau; theo từng MỐC — mốc A `xnd`, mốc B `quet_tui_den`):
//   KHÔNG ĐẠT ĐÃ ĐI (chiTieu14h[m].trangThai = KHONG_DAT), xét theo thứ tự (P2: A ưu tiên B):
//     A «Lỡ chuyến sát giờ»  = denSatGio (đến trong (hạn, giờ rời] của một chuyến), bất kể sau đó DUNG hay TRE chuyến;
//     B «Trượt chuyến»       = TRE_CHUYEN, không sát giờ;
//     C «Đi đúng chuyến, vẫn quá chỉ tiêu» = DUNG_CHUYEN, không sát giờ;
//     D «Chưa phân loại được» = lưới an toàn (còn lại; luôn 0 trên dữ liệu hiện có).
//   E «Chưa đi, đã quá chỉ tiêu» (chiTieu14h[m].chuaDiQuaChiTieu): SỐ TUYỆT ĐỐI riêng, KHÔNG nằm trong `khong_dat` / `do_duoc` của chi_tieu_14h.
//   Đẳng thức: A+B+C+D = chi_tieu_14h.theo_moc[m].khong_dat; E = chua_di_da_qua_chi_tieu; A–E = `dat_khong_dat.khong_dat` cùng mốc (khối cũ trộn đã đi và chưa đi).
// Tỷ lệ chuẩn = KHÔNG ĐẠT ĐÃ ĐI / ĐO ĐƯỢC (đo được = đạt + không đạt đã đi; docs/ai/37 mục 6); E không vào mẫu số.
// Hàng chuyển hoàn bị loại (chỉ SHBG nhóm PHAN_LOAI có chiTieu14h). Khối lượng: gam ≤ 0 hoặc thiếu = «không rõ» (đếm ở shbg_thieu_kg, không cộng kg).
//
// Hai loại bộ cộng (đều cộng được giữa các ngày):
//   - GỌN (`taoDemGon`): đếm nhóm A–E theo mốc, gắn vào chi_tieu_14h.theo_moc[m].nguyen_nhan của /luu-thoat;
//   - NẶNG (`taoBo().nang()`): ô nhóm (không đạt / chưa đi quá chỉ tiêu), ô mẫu số, ô giờ × BCVH (biên an toàn, chờ theo lịch, dư địa), đợt đến (BD10 đến).
//     Không đưa vào /luu-thoat; route /luu-thoat/khong-dat-14h dựng bảng từ đây.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const C = require('./kttChuyen');
const S = require('./kttLuuThoat');
const NG = require('./kttNguon');
const { thoiGianThucGiay } = require('./quyThoiGian');

const MOC = Object.freeze([S.MOC_CHI_TIEU.XND, S.MOC_CHI_TIEU.QUET_TUI_DEN]); // thứ tự cố định: [xnd, quet_tui_den]
const HAU_TO = Object.freeze({ [S.MOC_CHI_TIEU.XND]: 'A', [S.MOC_CHI_TIEU.QUET_TUI_DEN]: 'B' });
const NHOM = Object.freeze(['A', 'B', 'C', 'D', 'E']);
const NHAN_NHOM = Object.freeze({
  A: 'Lỡ chuyến sát giờ', B: 'Trượt chuyến', C: 'Đi đúng chuyến, vẫn quá chỉ tiêu', D: 'Chưa phân loại được', E: 'Chưa đi, đã quá chỉ tiêu'
});
const LY_DO_XEP_NHOM = Object.freeze({
  SAT_GIO_DUNG_CHUYEN: 'Đến sát giờ xe rời, đi kịp chuyến kế vẫn quá chỉ tiêu',
  SAT_GIO_TRUOT_CHUYEN_KE: 'Đến sát giờ xe rời, lỡ chuyến đó rồi lại trượt chuyến kế',
  TRUOT_CHUYEN: 'Đến kịp chuyến nhưng lập BD10 đi sau giờ xe rời',
  DUNG_CHUYEN_QUA_CHI_TIEU: 'Lập BD10 đi kịp chuyến nhưng thời gian chờ vẫn quá chỉ tiêu',
  KHONG_PHAN_LOAI_DUOC: 'Không phân loại được theo chuyến',
  CHUA_DI_QUA_CHI_TIEU: 'Chưa lập BD10 đi và đã quá chỉ tiêu',
  CHUA_DI_QUA_CHI_TIEU_SAT_GIO: 'Chưa lập BD10 đi, đã quá chỉ tiêu; đến sát giờ xe rời'
});
const SAT_GIO_PHUT = Object.freeze([30, 60, 90]); // ngưỡng «sát giờ» theo biên an toàn (tham số bien_sat_gio_phut)
const SAT_GIO_MAC_DINH = 60;
const BUOC_BIEN = 15; // phút mỗi bậc của biểu đồ tần suất (P10 chính xác trong ±1 bậc)
const BUOC_CHO = 30;
const BUOC_DU = 30;
const KHUNG_CHO = Object.freeze(['den_14h', '14_16h', '16_20h', '20_24h', '24_36h', '36_48h', 'tren_48h']);
const KHUNG_SO_CHUYEN = Object.freeze(['0', '1', '2', '3_tro_len']);
const THU = Object.freeze(['2', '3', '4', '5', '6', '7', 'CN']);

const r3 = NG.r3;
const KHONG_MOC = '-';

// ------------------------------------------
// Hàm thuần nhỏ
// ------------------------------------------
/** Thứ trong tuần của ngày D ('YYYY-MM-DD'): '2'…'7' hoặc 'CN' (như báo cáo pha 1: theo NGÀY ĐẾN D, chuỗi giờ VN, không phụ thuộc múi giờ máy). */
function thuCua(ngay) {
  const g = L.giayCua(`${ngay} 00:00:00`);
  if (g === null) return null;
  const d = new Date(g * 1000).getUTCDay(); // 0 = Chủ nhật
  return d === 0 ? 'CN' : String(d + 1);
}
const loaiNgay = (thu) => (thu === 'CN' ? 'chu_nhat' : 'thuong');
const khungSoChuyen = (n) => (!Number.isFinite(n) || n <= 0 ? '0' : n >= 3 ? '3_tro_len' : String(n));
/** Khung thời gian chờ (giờ thực, trừ 21:00–07:00) của một SHBG không đạt / chưa đi quá chỉ tiêu. */
function khungCho(giay) {
  if (typeof giay !== 'number') return null;
  const h = giay / 3600;
  return h <= 14 ? KHUNG_CHO[0] : h <= 16 ? KHUNG_CHO[1] : h <= 20 ? KHUNG_CHO[2] : h <= 24 ? KHUNG_CHO[3] : h <= 36 ? KHUNG_CHO[4] : h <= 48 ? KHUNG_CHO[5] : KHUNG_CHO[6];
}
/** kg của một SHBG cho khối này: gam > 0 -> kg; thiếu hoặc 0 g -> null («không rõ»). */
const kgRo = (u) => (typeof u.gam === 'number' && Number.isFinite(u.gam) && u.gam > 0 ? u.gam / 1000 : null);

/**
 * Nhóm nguyên nhân của một SHBG theo MỘT mốc. r = kq.chiTieu14h[m]; dg = C.danhGiaChuyenLich (chỉ cần khi r là KHONG_DAT / chưa đi quá chỉ tiêu).
 * Trả null nếu SHBG không thuộc A–E (đạt, chưa quá chỉ tiêu, không đo được); ngược lại { nhom, lyDo, truotChuyenKe, daDi }.
 */
function phanNhom(r, dg) {
  if (r && r.trangThai === S.DO_MOC.KHONG_DAT) {
    if (dg && dg.denSatGio) {
      const truotKe = dg.trangThai === 'TRE_CHUYEN';
      return { nhom: 'A', lyDo: truotKe ? 'SAT_GIO_TRUOT_CHUYEN_KE' : 'SAT_GIO_DUNG_CHUYEN', truotChuyenKe: truotKe, daDi: true };
    }
    if (dg && dg.trangThai === 'TRE_CHUYEN') return { nhom: 'B', lyDo: 'TRUOT_CHUYEN', truotChuyenKe: false, daDi: true };
    if (dg && dg.trangThai === 'DUNG_CHUYEN') return { nhom: 'C', lyDo: 'DUNG_CHUYEN_QUA_CHI_TIEU', truotChuyenKe: false, daDi: true };
    return { nhom: 'D', lyDo: 'KHONG_PHAN_LOAI_DUOC', truotChuyenKe: false, daDi: true };
  }
  if (r && r.chuaDiQuaChiTieu) return { nhom: 'E', lyDo: dg && dg.denSatGio ? 'CHUA_DI_QUA_CHI_TIEU_SAT_GIO' : 'CHUA_DI_QUA_CHI_TIEU', truotChuyenKe: false, daDi: false };
  return null;
}

/** Giá trị `loai` của /chi-tiet (và `nhom` của danhSachLuuThoat) cho danh sách nhóm nguyên nhân. KHÔNG nằm trong QL.NHOM_LUU_THOAT (bộ lọc `trang_thai` cũ không đổi). */
const LOAI_CHI_TIET = 'khong_dat_14h';
/** kq (phanLoaiShbg) có thể thuộc A–E ở ít nhất một mốc: không đạt đã đi hoặc chưa đi đã quá chỉ tiêu. */
const coNguyenNhan = (kq) => !!kq && kq.nhom === S.NHOM.PHAN_LOAI && !!kq.chiTieu14h && MOC.some((m) => kq.chiTieu14h[m].trangThai === S.DO_MOC.KHONG_DAT || kq.chiTieu14h[m].chuaDiQuaChiTieu);

/** Đánh giá chuyến của MỘT SHBG (dùng chung cho bộ cộng, chi-tiet và xlsx để cùng quy tắc). */
function danhGiaChuyenCua(u, ngu) {
  return C.danhGiaChuyenLich({ quetDen: u.quetDen, gioDi: u.gioBd10Di, bay_gio: ngu.bayGio, maBcvh: u.maBcvh, lich: ngu.lich, hanPhut: ngu.hanPhut });
}

/** Nhóm nguyên nhân cả hai mốc của một SHBG đã phân loại (kq.nhom = PHAN_LOAI, có chiTieu14h). Trả { xnd, quet_tui_den, dg } (mỗi mốc: phanNhom hoặc null); null nếu không có chiTieu14h. */
function phanNhomShbg(u, kq, ngu) {
  if (!kq || kq.nhom !== S.NHOM.PHAN_LOAI || !kq.chiTieu14h) return null;
  const c = kq.chiTieu14h;
  const can = MOC.some((m) => c[m].trangThai === S.DO_MOC.KHONG_DAT || c[m].chuaDiQuaChiTieu);
  const dg = can ? danhGiaChuyenCua(u, ngu) : null;
  return { xnd: phanNhom(c.xnd, dg), quet_tui_den: phanNhom(c.quet_tui_den, dg), dg };
}

// ------------------------------------------
// Lọc và dòng chi tiết (chi-tiet, xlsx sheet 10) — CÙNG quy tắc với bộ cộng
// ------------------------------------------
/**
 * Hàm lọc cho lượt duyệt (kttLuuThoatQuery.duyetLuuThoat): kd = { moc ('xnd' | 'quet_tui_den'), nhom ('A'…'E' | 'tat_ca' | null), gio (0–23 | null), chuyen ('HH:MM' | null), thu ('2'…'7' | 'CN' | null), nguonHang | null }.
 * Chỉ giữ SHBG thuộc nhóm A–E CỦA MỐC `kd.moc` (dựa chiTieu14h[moc], KHÔNG dựa khối `dat_khong_dat` mốc A mặc định) rồi lọc theo các chiều còn lại.
 */
function taoKhop(kd) {
  return (kq, u, ngu) => {
    const pn = phanNhomShbg(u, kq, ngu);
    const p = pn && pn[kd.moc];
    if (!p) return false;
    if (kd.nhom && kd.nhom !== 'tat_ca' && p.nhom !== kd.nhom) return false;
    if (kd.gio !== null && kd.gio !== undefined && Number(String(u.quetDen).slice(11, 13)) !== kd.gio) return false;
    if (kd.chuyen && !(pn.dg && pn.dg.chuyenDuKien && pn.dg.chuyenDuKien.ten === kd.chuyen)) return false;
    if (kd.thu && thuCua(u.ngayDen) !== kd.thu) return false;
    if (kd.nguonHang && (u.nguonHang || 'khai_thac') !== kd.nguonHang) return false;
    return true;
  };
}
/** Các trường thêm của một dòng chi tiết thuộc nhóm nguyên nhân (theo mốc `moc`). Dùng chung chi-tiet và xlsx. */
function dongNguyenNhan(u, kq, ngu, moc) {
  const pn = phanNhomShbg(u, kq, ngu);
  const p = pn && pn[moc];
  const dg = pn && pn.dg;
  return {
    nhom_nguyen_nhan: p ? p.nhom : null, ten_nhom_nguyen_nhan: p ? NHAN_NHOM[p.nhom] : null,
    ly_do_xep_nhom: p ? p.lyDo : null, mo_ta_ly_do_xep_nhom: p ? LY_DO_XEP_NHOM[p.lyDo] : null, truot_chuyen_ke: p ? p.truotChuyenKe : false,
    kg: kgRo(u), // 0 g = «không rõ» (null), khác cột kg của chi-tiet thường
    so_chuyen_tre: dg ? dg.soChuyenTre : null, sat_gio: dg ? !!dg.denSatGio : null, thu: thuCua(u.ngayDen), moc_chi_tieu: moc,
    nhom_nguyen_nhan_xnd: pn && pn.xnd ? pn.xnd.nhom : null, nhom_nguyen_nhan_quet_tui_den: pn && pn.quet_tui_den ? pn.quet_tui_den.nhom : null
  };
}

// ------------------------------------------
// Bộ cộng GỌN: nhóm A–E theo mốc (gắn vào chi_tieu_14h.theo_moc[m].nguyen_nhan)
// ------------------------------------------
const oKg = () => ({ shbg: 0, kg: 0, thieu: 0 });
const demMoc = () => ({ g: Object.fromEntries(NHOM.map((k) => [k, oKg()])), truotKe: 0, b: { '1': 0, '2': 0, '3_tro_len': 0 }, e: Object.fromEntries(KHUNG_SO_CHUYEN.map((k) => [k, 0])), eSat: 0 });
const kgRa = (o) => ({ shbg: o.shbg, kg: o.shbg > 0 && o.thieu === o.shbg ? null : r3(o.kg), shbg_thieu_kg: o.thieu });
function ketQuaMoc(d) {
  const tong = (ks) => ks.reduce((t, k) => ({ shbg: t.shbg + d.g[k].shbg, kg: t.kg + d.g[k].kg, thieu: t.thieu + d.g[k].thieu }), oKg());
  return {
    ...Object.fromEntries(NHOM.map((k) => [k, kgRa(d.g[k])])),
    tong: { da_di: kgRa(tong(['A', 'B', 'C', 'D'])), ca_chua_di: kgRa(tong(NHOM)) },
    truot_chuyen_ke: d.truotKe,
    b_theo_so_chuyen_tre: { ...d.b },
    e_theo_so_chuyen_tre: { ...d.e },
    e_sat_gio: d.eSat
  };
}
function taoDemGon() {
  const m = { xnd: demMoc(), quet_tui_den: demMoc() };
  return {
    /** pn = kết quả phanNhom của mốc (hoặc null), dg = danhGiaChuyenLich, kg = kg đã chuẩn (null = không rõ). */
    them(moc, pn, dg, kg) {
      if (!pn) return;
      const d = m[moc];
      const o = d.g[pn.nhom];
      o.shbg++;
      if (kg === null) o.thieu++; else o.kg += kg;
      if (pn.truotChuyenKe) d.truotKe++;
      if (pn.nhom === 'B') d.b[khungSoChuyen(dg.soChuyenTre) === '0' ? '1' : khungSoChuyen(dg.soChuyenTre)]++;
      if (pn.nhom === 'E') { d.e[khungSoChuyen(dg.soChuyenTre)]++; if (dg.denSatGio) d.eSat++; }
    },
    ketQua() { return { xnd: ketQuaMoc(m.xnd), quet_tui_den: ketQuaMoc(m.quet_tui_den) }; }
  };
}
const nguyenNhanRong = () => taoDemGon().ketQua();
/** Gắn kết quả gọn vào một khối đã có chi_tieu_14h (chỉ THÊM trường `nguyen_nhan` vào từng mốc). */
function ganGon(khoi, gon) {
  for (const m of MOC) khoi.chi_tieu_14h.theo_moc[m].nguyen_nhan = gon[m];
  return khoi;
}

// ------------------------------------------
// Biểu đồ tần suất thưa (cộng được): { bậc: số }
// ------------------------------------------
const hThemN = (h, giaTri, buoc, n) => { const k = Math.floor(giaTri / buoc); h[k] = (h[k] || 0) + n; };
const hGop = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] || 0) + v; return a; };
/** Phân vị p (0..1) theo cách xếp thứ tự phần tử floor(p·n), trả cận dưới của bậc chứa nó (cùng đơn vị đầu vào). null nếu rỗng. */
function hPhanVi(h, buoc, p) {
  const ks = Object.keys(h).map(Number).sort((x, y) => x - y);
  const n = ks.reduce((s, k) => s + h[k], 0);
  if (n === 0) return null;
  const dich = Math.min(n - 1, Math.floor(p * n));
  let s = 0;
  for (const k of ks) { s += h[k]; if (s > dich) return k * buoc; }
  return null;
}

// ------------------------------------------
// Bộ cộng NẶNG
// ------------------------------------------
const sot = (n) => (n === null || n === undefined ? KHONG_MOC : n);

function taoNangRong() {
  return { nn: new Map(), mau: new Map(), cube: new Map(), dot: new Map(), nguonTen: new Map() };
}

function oCube(c, d) {
  const k = `${d.gio}|${d.bcvh}|${d.thu}|${d.nh}`;
  let o = c.get(k);
  if (!o) {
    o = {
      d, shbg: 0, kg: 0, thieu: 0, do: { xnd: 0, quet_tui_den: 0 }, kd: { xnd: 0, quet_tui_den: 0 }, e: { xnd: 0, quet_tui_den: 0 },
      lo: 0, mauLo: 0, sat: { 30: 0, 60: 0, 90: 0 }, bienSum: 0, bienH: {}, choSum: 0, choMax: 0, choH: {}, duMin: Infinity, duH: {}
    };
    c.set(k, o);
  }
  return o;
}

/** opts.nang = false: chỉ bộ GỌN (nhóm A–E); bộ nặng (ô mẫu số, giờ × BCVH, đợt đến) bỏ qua để bộ nhớ đệm theo ngày không nhân đôi cho mốc phụ. */
function taoBo(opts = {}) {
  const nang0 = opts.nang !== false;
  const gon = new Map();
  const layGon = (k) => { let g = gon.get(k); if (!g) { g = taoDemGon(); gon.set(k, g); } return g; };
  const nang = taoNangRong();
  const memo = new Map(); // BCVH -> Map(giờ quét đến -> { bien (phút), cho (giây), ... }): nhiều SHBG cùng giờ quét chỉ tính một lần
  const hanIdx = new Map(); // chuỗi hạn đến của chuyến -> giây (số chuyến rất ít)
  const nguonIdx = new Map(); // nơi gửi -> Map(mã đường thư -> { ma, ten }): tránh gọi NG.nguonCua cho từng SHBG
  const nguonNhanh = (u) => {
    let a = nguonIdx.get(u.diemGuiDen);
    if (!a) { a = new Map(); nguonIdx.set(u.diemGuiDen, a); }
    let g = a.get(u.duongThuDenMa);
    if (!g) { g = NG.nguonCua(u); a.set(u.duongThuDenMa, g); if (!nang.nguonTen.has(g.ma)) nang.nguonTen.set(g.ma, g.ten); }
    return g;
  };
  const dotIdx = new Map(); // BD10 đến -> Map(BCVH -> { nguồn hàng -> ô đợt })
  let thuBo = null; // một bộ cộng = MỘT ngày đến nên thứ không đổi
  let daGop = false;
  return {
    /** Gọi cho MỌI SHBG đã qua phanLoaiShbg của một ngày. Bỏ qua SHBG không thuộc PHAN_LOAI (hàng hoàn, thiếu giờ quét, không xếp được chuyến…). */
    them(u, kq, ngu) {
      if (!kq || kq.nhom !== S.NHOM.PHAN_LOAI || !kq.chiTieu14h || !kq.chuyen) return;
      const c = kq.chiTieu14h;
      const ngay = u.ngayDen;
      if (thuBo === null) thuBo = thuCua(ngay);
      const thu = thuBo;
      const nh = u.nguonHang || 'khai_thac';
      const bcvh = u.maBcvh;
      const kg = kgRo(u);
      let m = null; let ng = null;
      if (nang0) {
        ng = nguonNhanh(u);
        let mb = memo.get(bcvh);
        if (!mb) { mb = new Map(); memo.set(bcvh, mb); }
        m = mb.get(u.quetDen);
        if (!m) {
          const q = L.giayCua(u.quetDen);
          let hs = hanIdx.get(kq.chuyen.han_den_luc);
          if (hs === undefined) { hs = L.giayCua(kq.chuyen.han_den_luc); hanIdx.set(kq.chuyen.han_den_luc, hs); }
          m = { bien: (hs - q) / 60, cho: thoiGianThucGiay(u.quetDen, kq.chuyen.xuat_phat_luc), gio: Number(String(u.quetDen).slice(11, 13)), bcvh, q, cube: {}, mau: new Map(), cnt: {} };
          mb.set(u.quetDen, m);
        }
      }
      const gio = m ? m.gio : 0;

      if (nang0) {
        // Hot path: mọi thứ chỉ phụ thuộc (BCVH, giờ quét đến) nằm trong `m` (tính một lần); ô tra theo Map lồng nhau, không ghép chuỗi cho mỗi SHBG. Phần biên / chờ / dư địa được GỘP vào biểu đồ ở nang().
        const gct = c.xnd.chiTieuGio;
        const duGio = (gct * 3600 - (m.cho === null ? 0 : m.cho)) / 3600;
        const cX = c.xnd.trangThai; const cQ = c.quet_tui_den.trangThai;
        const doXnd = cX === S.DO_MOC.DAT || cX === S.DO_MOC.KHONG_DAT ? 1 : 0;
        const doQtd = cQ === S.DO_MOC.DAT || cQ === S.DO_MOC.KHONG_DAT ? 1 : 0;
        const kdX = cX === S.DO_MOC.KHONG_DAT ? 1 : 0; const kdQ = cQ === S.DO_MOC.KHONG_DAT ? 1 : 0;
        const eX = c.xnd.chuaDiQuaChiTieu ? 1 : 0; const eQ = c.quet_tui_den.chuaDiQuaChiTieu ? 1 : 0;

        // ---- ô mẫu số (ngày × giờ × BCVH × nguồn × nguồn hàng; thứ suy từ ngày)
        let mm = m.mau.get(ng.ma);
        if (!mm) { mm = {}; m.mau.set(ng.ma, mm); }
        let om = mm[nh];
        if (!om) {
          const km = ngay + '|' + gio + '|' + bcvh + '|' + ng.ma + '|' + nh;
          om = nang.mau.get(km);
          if (!om) { om = { d: { ngay, gio, thu, bcvh, nguon: ng.ma, nh }, shbg: 0, kg: 0, thieu: 0, do: { xnd: 0, quet_tui_den: 0 } }; nang.mau.set(km, om); }
          mm[nh] = om;
        }
        om.shbg++; if (kg === null) om.thieu++; else om.kg += kg;
        om.do.xnd += doXnd; om.do.quet_tui_den += doQtd;

        // ---- ô giờ × BCVH × thứ × nguồn hàng
        let oc = m.cube[nh];
        if (!oc) { oc = oCube(nang.cube, { gio, bcvh, thu, nh }); m.cube[nh] = oc; }
        oc.shbg++; if (kg === null) oc.thieu++; else oc.kg += kg;
        oc.do.xnd += doXnd; oc.do.quet_tui_den += doQtd;
        oc.kd.xnd += kdX; oc.kd.quet_tui_den += kdQ; oc.e.xnd += eX; oc.e.quet_tui_den += eQ;
        if (kq.chuyenKq !== 'CHUA_DEN_GIO') { oc.mauLo++; if (kq.chuyenKq === 'TRUOT' || kq.chuyenKq === 'LO') oc.lo++; }
        let cn = m.cnt[nh];
        if (!cn) { cn = {}; m.cnt[nh] = cn; }
        cn[gct] = (cn[gct] || 0) + 1;

        // ---- đợt đến (BD10 đến) × BCVH × nguồn hàng (thứ suy từ ngày)
        if (u.bd10Den) {
          let d1 = dotIdx.get(u.bd10Den);
          if (!d1) { d1 = new Map(); dotIdx.set(u.bd10Den, d1); }
          let d2 = d1.get(bcvh);
          if (!d2) { d2 = {}; d1.set(bcvh, d2); }
          let od = d2[nh];
          if (!od) {
            od = { d: { bd10: u.bd10Den, thu, bcvh, nh, nguon: ng.ma }, shbg: 0, kg: 0, thieu: 0, do: { xnd: 0, quet_tui_den: 0 }, kd: { xnd: 0, quet_tui_den: 0 }, e: { xnd: 0, quet_tui_den: 0 }, sat: { 30: 0, 60: 0, 90: 0 }, bienSum: 0, choSum: 0, duMin: Infinity, tMin: Infinity, tMax: -Infinity, chuyen: {} };
            nang.dot.set(u.bd10Den + '|' + thu + '|' + bcvh + '|' + nh, od);
            d2[nh] = od;
          }
          od.shbg++; if (kg === null) od.thieu++; else od.kg += kg;
          od.do.xnd += doXnd; od.do.quet_tui_den += doQtd;
          od.kd.xnd += kdX; od.kd.quet_tui_den += kdQ; od.e.xnd += eX; od.e.quet_tui_den += eQ;
          if (m.bien <= 30) od.sat[30]++;
          if (m.bien <= 60) od.sat[60]++;
          if (m.bien <= 90) od.sat[90]++;
          od.bienSum += m.bien; od.choSum += (m.cho || 0) / 3600;
          if (duGio < od.duMin) od.duMin = duGio;
          if (m.q < od.tMin) od.tMin = m.q;
          if (m.q > od.tMax) od.tMax = m.q;
          const gx = kq.chuyen.gio_xuat_phat;
          od.chuyen[gx] = (od.chuyen[gx] || 0) + 1;
        }
      }

      // ---- nhóm nguyên nhân (chỉ SHBG không đạt đã đi / chưa đi quá chỉ tiêu ở ít nhất một mốc)
      const pn = phanNhomShbg(u, kq, ngu);
      if (!pn || (!pn.xnd && !pn.quet_tui_den)) return;
      const dg = pn.dg;
      const dem = [layGon('tong'), layGon(`b:${bcvh}`), layGon(`h:${nh}`)];
      for (const moc of MOC) {
        const p = pn[moc];
        if (!p) continue;
        for (const g of dem) g.them(moc, p, dg, kg);
      }
      if (!nang0) return;
      const kn = [ngay, gio, bcvh, ng.ma, nh, sot(pn.xnd && pn.xnd.nhom), sot(pn.quet_tui_den && pn.quet_tui_den.nhom), pn.xnd && pn.xnd.truotChuyenKe ? 1 : 0, pn.quet_tui_den && pn.quet_tui_den.truotChuyenKe ? 1 : 0,
        khungSoChuyen(dg.soChuyenTre), dg.denSatGio ? 1 : 0, dg.chuyenDuKien ? dg.chuyenDuKien.ten : KHONG_MOC, pn.xnd ? khungCho(c.xnd.thucGiay) : KHONG_MOC, pn.quet_tui_den ? khungCho(c.quet_tui_den.thucGiay) : KHONG_MOC].join('|');
      let on = nang.nn.get(kn);
      if (!on) {
        on = { d: { ngay, gio, thu, bcvh, nguon: ng.ma, nh, nhom: { xnd: pn.xnd ? pn.xnd.nhom : null, quet_tui_den: pn.quet_tui_den ? pn.quet_tui_den.nhom : null },
          truotKe: { xnd: !!(pn.xnd && pn.xnd.truotChuyenKe), quet_tui_den: !!(pn.quet_tui_den && pn.quet_tui_den.truotChuyenKe) }, soTre: khungSoChuyen(dg.soChuyenTre), satGio: !!dg.denSatGio,
          chuyen: dg.chuyenDuKien ? dg.chuyenDuKien.ten : null, khungCho: { xnd: pn.xnd ? khungCho(c.xnd.thucGiay) : null, quet_tui_den: pn.quet_tui_den ? khungCho(c.quet_tui_den.thucGiay) : null } }, shbg: 0, kg: 0, thieu: 0 };
        nang.nn.set(kn, on);
      }
      on.shbg++; if (kg === null) on.thieu++; else on.kg += kg;
    },
    gon(khoa) { return layGon(khoa).ketQua(); },
    /** Bộ nặng của ngày (null khi opts.nang = false). Đợt đến chỉ giữ BD10 có ít nhất một SHBG không đạt / chưa đi quá chỉ tiêu (đủ để xếp hạng; giảm bộ nhớ). */
    nang() {
      if (!nang0) return null;
      if (!daGop) {
        daGop = true;
        // gộp biên an toàn / chờ theo lịch / dư địa vào biểu đồ của ô giờ × BCVH (mỗi (BCVH, giờ quét) × nguồn hàng × chỉ tiêu một lần)
        for (const mb of memo.values()) for (const m of mb.values()) {
          for (const nh in m.cnt) {
            const oc = m.cube[nh];
            for (const g in m.cnt[nh]) {
              const n = m.cnt[nh][g];
              for (const p of SAT_GIO_PHUT) if (m.bien <= p) oc.sat[p] += n;
              oc.bienSum += m.bien * n; hThemN(oc.bienH, m.bien, BUOC_BIEN, n);
              if (m.cho !== null) { const h = m.cho / 3600; oc.choSum += h * n; if (h > oc.choMax) oc.choMax = h; hThemN(oc.choH, m.cho / 60, BUOC_CHO, n); }
              const du = (Number(g) * 3600 - (m.cho === null ? 0 : m.cho)) / 60;
              if (du < oc.duMin) oc.duMin = du;
              hThemN(oc.duH, du, BUOC_DU, n);
            }
          }
        }
      }
      const co = new Set();
      for (const o of nang.dot.values()) if (o.kd.xnd + o.kd.quet_tui_den + o.e.xnd + o.e.quet_tui_den > 0) co.add(o.d.bd10);
      for (const [k, o] of nang.dot) if (!co.has(o.d.bd10)) nang.dot.delete(k);
      return nang;
    }
  };
}

// ------------------------------------------
// Ghép nhiều ngày (cộng các bộ nặng)
// ------------------------------------------
function gopNang(ds) {
  const r = taoNangRong();
  for (const n of ds) {
    if (!n) continue;
    for (const [k, v] of n.nguonTen) r.nguonTen.set(k, v);
    for (const [k, v] of n.nn) { const o = r.nn.get(k); if (!o) r.nn.set(k, { d: v.d, shbg: v.shbg, kg: v.kg, thieu: v.thieu }); else { o.shbg += v.shbg; o.kg += v.kg; o.thieu += v.thieu; } }
    for (const [k, v] of n.mau) { const o = r.mau.get(k); if (!o) r.mau.set(k, { d: v.d, shbg: v.shbg, kg: v.kg, thieu: v.thieu, do: { ...v.do } }); else { o.shbg += v.shbg; o.kg += v.kg; o.thieu += v.thieu; o.do.xnd += v.do.xnd; o.do.quet_tui_den += v.do.quet_tui_den; } }
    for (const [k, v] of n.cube) {
      const o = r.cube.get(k);
      if (!o) { r.cube.set(k, { ...v, do: { ...v.do }, kd: { ...v.kd }, e: { ...v.e }, sat: { ...v.sat }, bienH: { ...v.bienH }, choH: { ...v.choH }, duH: { ...v.duH } }); continue; }
      o.shbg += v.shbg; o.kg += v.kg; o.thieu += v.thieu; o.lo += v.lo; o.mauLo += v.mauLo; o.bienSum += v.bienSum; o.choSum += v.choSum; if (v.choMax > o.choMax) o.choMax = v.choMax; if (v.duMin < o.duMin) o.duMin = v.duMin;
      for (const m of MOC) { o.do[m] += v.do[m]; o.kd[m] += v.kd[m]; o.e[m] += v.e[m]; }
      for (const p of SAT_GIO_PHUT) o.sat[p] += v.sat[p];
      hGop(o.bienH, v.bienH); hGop(o.choH, v.choH); hGop(o.duH, v.duH);
    }
    for (const [k, v] of n.dot) {
      const o = r.dot.get(k);
      if (!o) { r.dot.set(k, { ...v, do: { ...v.do }, kd: { ...v.kd }, e: { ...v.e }, sat: { ...v.sat }, chuyen: { ...v.chuyen } }); continue; }
      o.shbg += v.shbg; o.kg += v.kg; o.thieu += v.thieu; o.bienSum += v.bienSum; o.choSum += v.choSum; if (v.duMin < o.duMin) o.duMin = v.duMin; if (v.tMin < o.tMin) o.tMin = v.tMin; if (v.tMax > o.tMax) o.tMax = v.tMax;
      for (const m of MOC) { o.do[m] += v.do[m]; o.kd[m] += v.kd[m]; o.e[m] += v.e[m]; }
      for (const p of SAT_GIO_PHUT) o.sat[p] += v.sat[p];
      hGop(o.chuyen, v.chuyen);
    }
  }
  return r;
}

// ------------------------------------------
// Dựng bảng từ bộ nặng đã ghép
// ------------------------------------------
const KHOA_LOC = Object.freeze(['ma_bcvh', 'nguon', 'thu', 'nguon_hang']);
/** Bộ lọc đã chuẩn hóa: { maBcvh, nguon, thu, nguonHang } (null = không lọc). */
function khopLoc(d, loc) {
  return (!loc.maBcvh || d.bcvh === loc.maBcvh) && (!loc.nguon || d.nguon === loc.nguon) && (!loc.thu || d.thu === loc.thu) && (!loc.nguonHang || d.nh === loc.nguonHang);
}
const oNhomRong = () => Object.fromEntries(NHOM.map((k) => [k, oKg()]));
function cotMoc(nhom, doDuoc) {
  const dd = ['A', 'B', 'C', 'D'].reduce((t, k) => ({ shbg: t.shbg + nhom[k].shbg, kg: t.kg + nhom[k].kg, thieu: t.thieu + nhom[k].thieu }), oKg());
  return {
    nhom: Object.fromEntries(NHOM.map((k) => [k, kgRa(nhom[k])])),
    tong: { da_di: kgRa(dd), ca_chua_di: kgRa(['A', 'B', 'C', 'D', 'E'].reduce((t, k) => ({ shbg: t.shbg + nhom[k].shbg, kg: t.kg + nhom[k].kg, thieu: t.thieu + nhom[k].thieu }), oKg())) },
    khong_dat_da_di: dd.shbg, chua_di_qua_chi_tieu: nhom.E.shbg, do_duoc: doDuoc,
    ty_le_khong_dat: doDuoc === null ? null : (doDuoc > 0 ? dd.shbg / doDuoc : null)
  };
}

/** Số SHBG thuộc nhóm nguyên nhân của mốc kd.moc theo bộ lọc (loc + kd.nhom / gio / chuyen): số mà màn hình phải khớp với số dòng của chi-tiet / xlsx cùng bộ lọc. */
function demTheoLoc(nang, loc, kd) {
  let n = 0;
  for (const o of nang.nn.values()) {
    if (!khopLoc(o.d, loc)) continue;
    const g = o.d.nhom[kd.moc];
    if (!g) continue;
    if (kd.nhom && kd.nhom !== 'tat_ca' && g !== kd.nhom) continue;
    if (kd.gio !== null && kd.gio !== undefined && o.d.gio !== kd.gio) continue;
    if (kd.chuyen && o.d.chuyen !== kd.chuyen) continue;
    n += o.shbg;
  }
  return n;
}

/**
 * Gom các ô nhóm (nn) + mẫu số (mau) theo `dims` (tên trường của d). coMau = true khi mọi dims đều có trong ô mẫu số (ngay, gio, thu, bcvh, nguon, nh).
 * Mỗi dòng: { ...dims, shbg (mẫu số: mọi SHBG phân loại), kg, shbg_thieu_kg, theo_moc: { xnd: cotMoc, quet_tui_den: cotMoc } }. Dòng có dữ liệu mẫu số hoặc nhóm; sắp theo dims.
 */
const dv = (d, x) => (x === 'loai_ngay' ? loaiNgay(d.thu) : d[x]); // chiều dẫn xuất: loại ngày (thường | chu_nhat) từ thứ
const TEN_RA = Object.freeze({ bcvh: 'ma_bcvh', nh: 'nguon_hang' });
function gomChieu(nang, loc, dims, coMau, ghiChuNhom) {
  const hang = new Map();
  const layHang = (d) => {
    const k = dims.map((x) => dv(d, x)).join('|');
    let h = hang.get(k);
    if (!h) { h = { dims: Object.fromEntries(dims.map((x) => [x, dv(d, x)])), mau: oKg(), do: { xnd: 0, quet_tui_den: 0 }, nhom: { xnd: oNhomRong(), quet_tui_den: oNhomRong() }, truotKe: { xnd: 0, quet_tui_den: 0 } }; hang.set(k, h); }
    return h;
  };
  if (coMau) for (const o of nang.mau.values()) {
    if (!khopLoc(o.d, loc)) continue;
    const h = layHang(o.d);
    h.mau.shbg += o.shbg; h.mau.kg += o.kg; h.mau.thieu += o.thieu;
    h.do.xnd += o.do.xnd; h.do.quet_tui_den += o.do.quet_tui_den;
  }
  for (const o of nang.nn.values()) {
    if (!khopLoc(o.d, loc)) continue;
    if (ghiChuNhom && !ghiChuNhom(o.d)) continue;
    const h = layHang(o.d);
    for (const m of MOC) {
      const n = o.d.nhom[m];
      if (!n) continue;
      const t = h.nhom[m][n];
      t.shbg += o.shbg; t.kg += o.kg; t.thieu += o.thieu;
      if (o.d.truotKe[m]) h.truotKe[m] += o.shbg;
    }
  }
  const ra = [...hang.values()].map((h) => ({
    ...Object.fromEntries(Object.entries(h.dims).flatMap(([x, v]) => (x === 'nguon' ? [['nguon', v], ['nguon_ten', nang.nguonTen.get(v) || v]] : [[TEN_RA[x] || x, v]]))), shbg: h.mau.shbg, kg: h.mau.shbg > 0 && h.mau.thieu === h.mau.shbg ? null : r3(h.mau.kg), shbg_thieu_kg: h.mau.thieu,
    theo_moc: Object.fromEntries(MOC.map((m) => [m, { ...cotMoc(h.nhom[m], coMau ? h.do[m] : null), truot_chuyen_ke: h.truotKe[m] }]))
  }));
  return ra.sort((a, b) => {
    for (const x of dims.map((y) => TEN_RA[y] || y)) { const p = a[x]; const q = b[x]; if (p < q) return -1; if (p > q) return 1; }
    return 0;
  });
}

/** Phân bố KHUNG THỜI GIAN CHỜ (giờ thực, trừ 21:00–07:00) của SHBG không đạt / chưa đi quá chỉ tiêu, theo từng mốc. Không có mẫu số. */
function phanBoCho(nang, loc) {
  const o = Object.fromEntries(KHUNG_CHO.map((k) => [k, { xnd: oNhomRong(), quet_tui_den: oNhomRong() }]));
  for (const c of nang.nn.values()) {
    if (!khopLoc(c.d, loc)) continue;
    for (const m of MOC) {
      const n = c.d.nhom[m]; const kh = c.d.khungCho[m];
      if (!n || !kh) continue;
      const t = o[kh][m][n]; t.shbg += c.shbg; t.kg += c.kg; t.thieu += c.thieu;
    }
  }
  return KHUNG_CHO.map((k) => ({ khung_cho: k, theo_moc: Object.fromEntries(MOC.map((m) => [m, { ...cotMoc(o[k][m], null) }])) }));
}

/** Phân vị / trung bình / lớn nhất của ô giờ × BCVH × loại ngày, KHÔNG gồm bất kỳ giá trị nào ngoài các SHBG trong ô. */
function duDiaTheoGio(nang, loc) {
  const gop = new Map();
  for (const o of nang.cube.values()) {
    if (!khopLoc(o.d, loc)) continue;
    const loai = loaiNgay(o.d.thu);
    const k = `${o.d.gio}|${o.d.bcvh}|${loai}`;
    let t = gop.get(k);
    if (!t) { t = { gio: o.d.gio, ma_bcvh: o.d.bcvh, loai_ngay: loai, shbg: 0, kg: 0, thieu: 0, do: { xnd: 0, quet_tui_den: 0 }, kd: { xnd: 0, quet_tui_den: 0 }, e: { xnd: 0, quet_tui_den: 0 }, lo: 0, mauLo: 0, sat: { 30: 0, 60: 0, 90: 0 }, bienSum: 0, bienH: {}, choSum: 0, choMax: 0, choH: {}, duMin: Infinity, duH: {} }; gop.set(k, t); }
    t.shbg += o.shbg; t.kg += o.kg; t.thieu += o.thieu; t.lo += o.lo; t.mauLo += o.mauLo; t.bienSum += o.bienSum; t.choSum += o.choSum; if (o.choMax > t.choMax) t.choMax = o.choMax; if (o.duMin < t.duMin) t.duMin = o.duMin;
    for (const m of MOC) { t.do[m] += o.do[m]; t.kd[m] += o.kd[m]; t.e[m] += o.e[m]; }
    for (const p of SAT_GIO_PHUT) t.sat[p] += o.sat[p];
    hGop(t.bienH, o.bienH); hGop(t.choH, o.choH); hGop(t.duH, o.duH);
  }
  const gioPhut = (phut) => (phut === null ? null : r3(phut / 60));
  return [...gop.values()].map((t) => ({
    gio: t.gio, ma_bcvh: t.ma_bcvh, loai_ngay: t.loai_ngay,
    shbg: t.shbg, kg: t.shbg > 0 && t.thieu === t.shbg ? null : r3(t.kg), shbg_thieu_kg: t.thieu,
    theo_moc: Object.fromEntries(MOC.map((m) => [m, {
      khong_dat_da_di: t.kd[m], chua_di_qua_chi_tieu: t.e[m], do_duoc: t.do[m], ty_le_khong_dat: t.do[m] > 0 ? t.kd[m] / t.do[m] : null
    }])),
    lo_chuyen: { shbg: t.lo, mau_so: t.mauLo, ty_le: t.mauLo > 0 ? t.lo / t.mauLo : null },
    sat_gio: { 30: t.sat[30], 60: t.sat[60], 90: t.sat[90] },
    bien_an_toan_phut: { tb: t.shbg > 0 ? r3(t.bienSum / t.shbg) : null, p10: hPhanVi(t.bienH, BUOC_BIEN, 0.1) },
    cho_theo_lich_gio: { tb: t.shbg > 0 ? r3(t.choSum / t.shbg) : null, p90: gioPhut(hPhanVi(t.choH, BUOC_CHO, 0.9)), max: r3(t.choMax) },
    du_dia_gio: { min: Number.isFinite(t.duMin) ? r3(t.duMin / 60) : null, p10: gioPhut(hPhanVi(t.duH, BUOC_DU, 0.1)) }
  })).sort((a, b) => a.gio - b.gio || (a.ma_bcvh < b.ma_bcvh ? -1 : a.ma_bcvh > b.ma_bcvh ? 1 : 0) || (a.loai_ngay < b.loai_ngay ? -1 : 1));
}

const hhmm = (giay) => L.dinhDang(giay).slice(11, 16);
/** Đợt đến = BD10 đến. Xếp theo SỐ KHÔNG ĐẠT ĐÃ ĐI của mốc `moc` giảm dần (rồi chưa đi quá chỉ tiêu, rồi số SHBG). Biên an toàn / sát giờ / dư địa chỉ là bối cảnh. */
function dotDen(nang, loc, moc, bienSatGioPhut, top) {
  const gop = new Map();
  for (const o of nang.dot.values()) {
    if (!khopLoc(o.d, loc)) continue;
    let t = gop.get(o.d.bd10);
    if (!t) { t = { bd10: o.d.bd10, nguon: o.d.nguon, shbg: 0, kg: 0, thieu: 0, do: { xnd: 0, quet_tui_den: 0 }, kd: { xnd: 0, quet_tui_den: 0 }, e: { xnd: 0, quet_tui_den: 0 }, sat: { 30: 0, 60: 0, 90: 0 }, bienSum: 0, choSum: 0, duMin: Infinity, tMin: Infinity, tMax: -Infinity, chuyen: {} }; gop.set(o.d.bd10, t); }
    t.shbg += o.shbg; t.kg += o.kg; t.thieu += o.thieu; t.bienSum += o.bienSum; t.choSum += o.choSum; if (o.duMin < t.duMin) t.duMin = o.duMin; if (o.tMin < t.tMin) t.tMin = o.tMin; if (o.tMax > t.tMax) t.tMax = o.tMax;
    for (const m of MOC) { t.do[m] += o.do[m]; t.kd[m] += o.kd[m]; t.e[m] += o.e[m]; }
    for (const p of SAT_GIO_PHUT) t.sat[p] += o.sat[p];
    for (const [c, n] of Object.entries(o.chuyen)) { const key = `${o.d.bcvh}|${c}`; t.chuyen[key] = (t.chuyen[key] || 0) + n; }
  }
  const ds = [...gop.values()].filter((t) => t.kd[moc] + t.e[moc] > 0);
  ds.sort((a, b) => (b.kd[moc] - a.kd[moc]) || (b.e[moc] - a.e[moc]) || (b.shbg - a.shbg) || (a.bd10 < b.bd10 ? -1 : 1));
  const ten = (ma) => nang.nguonTen.get(ma) || ma;
  return ds.slice(0, top).map((t) => {
    const ke = Object.entries(t.chuyen).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    return {
      bd10_den: t.bd10, duong_thu: t.nguon, duong_thu_ten: ten(t.nguon), ngay: L.dinhDang(t.tMin).slice(0, 10), gio_dau: hhmm(t.tMin), gio_cuoi: hhmm(t.tMax),
      nhan: `${ten(t.nguon)} · ${L.dinhDang(t.tMin).slice(8, 10)}/${L.dinhDang(t.tMin).slice(5, 7)} · ${hhmm(t.tMin)}–${hhmm(t.tMax)}`,
      chuyen_ke: ke ? { ma_bcvh: ke[0].split('|')[0], gio_xuat_phat: ke[0].split('|')[1] } : null,
      shbg: t.shbg, kg: t.shbg > 0 && t.thieu === t.shbg ? null : r3(t.kg), shbg_thieu_kg: t.thieu,
      khong_dat_da_di: t.kd[moc], chua_di_qua_chi_tieu: t.e[moc], do_duoc: t.do[moc], ty_le_khong_dat: t.do[moc] > 0 ? t.kd[moc] / t.do[moc] : null,
      theo_moc: Object.fromEntries(MOC.map((m) => [m, { khong_dat_da_di: t.kd[m], chua_di_qua_chi_tieu: t.e[m], do_duoc: t.do[m], ty_le_khong_dat: t.do[m] > 0 ? t.kd[m] / t.do[m] : null }])),
      sat_gio: { bien_sat_gio_phut: bienSatGioPhut, shbg: t.sat[bienSatGioPhut], ty_le: t.shbg > 0 ? t.sat[bienSatGioPhut] / t.shbg : null },
      bien_an_toan_phut: t.shbg > 0 ? r3(t.bienSum / t.shbg) : null, cho_theo_lich_gio: t.shbg > 0 ? r3(t.choSum / t.shbg) : null, du_dia_gio: Number.isFinite(t.duMin) ? r3(t.duMin) : null
    };
  });
}

/** Tổng toàn bộ (theo bộ lọc), cả hai mốc: nhóm A–E, hai mức `tong`, truot_chuyen_ke, b / e chia theo số chuyến trễ, e_sat_gio. */
function tongNhom(nang, loc) {
  const demM = { xnd: demMoc(), quet_tui_den: demMoc() };
  const doM = { xnd: 0, quet_tui_den: 0 };
  let shbg = 0; let kg = 0; let thieu = 0;
  for (const o of nang.mau.values()) {
    if (!khopLoc(o.d, loc)) continue;
    shbg += o.shbg; kg += o.kg; thieu += o.thieu; doM.xnd += o.do.xnd; doM.quet_tui_den += o.do.quet_tui_den;
  }
  for (const o of nang.nn.values()) {
    if (!khopLoc(o.d, loc)) continue;
    for (const m of MOC) {
      const n = o.d.nhom[m];
      if (!n) continue;
      const d = demM[m]; const t = d.g[n];
      t.shbg += o.shbg; t.kg += o.kg; t.thieu += o.thieu;
      if (o.d.truotKe[m]) d.truotKe += o.shbg;
      if (n === 'B') d.b[o.d.soTre === '0' ? '1' : o.d.soTre] += o.shbg;
      if (n === 'E') { d.e[o.d.soTre] += o.shbg; if (o.d.satGio) d.eSat += o.shbg; }
    }
  }
  return {
    shbg, kg: shbg > 0 && thieu === shbg ? null : r3(kg), shbg_thieu_kg: thieu,
    theo_moc: Object.fromEntries(MOC.map((m) => {
      const k = ketQuaMoc(demM[m]);
      const dd = k.tong.da_di.shbg;
      const { tong, truot_chuyen_ke: truotKe, b_theo_so_chuyen_tre: bSo, e_theo_so_chuyen_tre: eSo, e_sat_gio: eSat } = k;
      return [m, {
        nhom: Object.fromEntries(NHOM.map((x) => [x, k[x]])), tong, khong_dat_da_di: dd, chua_di_qua_chi_tieu: k.E.shbg, do_duoc: doM[m], ty_le_khong_dat: doM[m] > 0 ? dd / doM[m] : null,
        truot_chuyen_ke: truotKe, b_theo_so_chuyen_tre: bSo, e_theo_so_chuyen_tre: eSo, e_sat_gio: eSat
      }];
    }))
  };
}

module.exports = {
  LOAI_CHI_TIET, coNguyenNhan, MOC, HAU_TO, NHOM, NHAN_NHOM, LY_DO_XEP_NHOM, SAT_GIO_PHUT, SAT_GIO_MAC_DINH, KHUNG_CHO, KHUNG_SO_CHUYEN, THU, KHOA_LOC,
  thuCua, loaiNgay, khungSoChuyen, khungCho, kgRo, phanNhom, danhGiaChuyenCua, phanNhomShbg,
  taoKhop, dongNguyenNhan, demTheoLoc, taoDemGon, nguyenNhanRong, ganGon, taoBo, gopNang, gomChieu, phanBoCho, duDiaTheoGio, dotDen, tongNhom, hPhanVi,
  BUOC_BIEN, BUOC_CHO, BUOC_DU
};
