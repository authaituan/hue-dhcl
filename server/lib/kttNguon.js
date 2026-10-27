// ==========================================
// «Hàng tại KTT» (KTT-8c): số kg và NHÓM THEO NGUỒN cho trang «Lưu thoát». CÁC HÀM THUẦN: không DB, không giờ máy. KHÔNG đổi quy tắc của kttLuuThoat.js —
// chỉ ĐỌC kết quả `phanLoaiShbg` (kq) và đơn vị SHBG (u) của kttQuery.js rồi cộng thêm. Tài liệu: docs/ai/41_KTT_LUU_THOAT.md mục «KTT-8c».
//
// Nhóm nguồn của một SHBG (xác định từ TÚI ĐẾN GHÉP, cùng túi dùng để xếp chuyến):
//   - nơi gửi của BD10 đến (`bd10_den_ma_diem_gui`) bắt đầu bằng '53' -> NOI_TINH («Nội tỉnh · các điểm khác»), bất kể đường thư;
//   - còn lại có mã đường thư đến (`bd10_den_ma_duong_thu`) -> nhóm theo đường thư (ma = mã đường thư, ten = tên đường thư);
//   - thiếu mã đường thư -> KHONG_RO_NGUON.
// Hàng hoàn Tổ KHHH KHÔNG vào theo_nguon (đã có khối `hang_hoan`); chỉ SHBG có trạng thái (t1…t5, đang chờ chuyến) mới vào nhóm.
// kg = khối lượng thực tế (gam) / 1000, làm tròn 3 chữ số; SHBG thiếu khối lượng tính 0. Mỗi SHBG đóng góp ĐÚNG MỘT lần (đơn vị SHBG đã gộp các dòng túi).
// ==========================================
'use strict';
const S = require('./kttLuuThoat');

const MA_NOI_TINH = 'NOI_TINH';
const TEN_NOI_TINH = 'Nội tỉnh · các điểm khác';
const MA_KHONG_RO = 'KHONG_RO_NGUON';
const TEN_KHONG_RO = 'Không rõ nguồn';
const TIEN_TO_NOI_TINH = '53';
const KHOA_TT = ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'];
/** Mã nguồn hợp lệ trong tham số `nguon` (chữ, số, _ . - / và khoảng trắng, ≤ 40 ký tự); giá trị chỉ đi vào so sánh chuỗi, không vào SQL. */
const RE_MA_NGUON = /^[\p{L}\p{N}_.\-/ ]{1,40}$/u;

const r3 = (x) => Math.round(x * 1000) / 1000;
const chuoi = (x) => (x === null || x === undefined ? '' : String(x).trim());

/** kg của một SHBG (đơn vị u của kttQuery): gam / 1000; thiếu -> 0. */
const kgCua = (u) => (typeof u.gam === 'number' && Number.isFinite(u.gam) ? u.gam / 1000 : 0);
const thieuKhoiLuong = (u) => !(typeof u.gam === 'number' && Number.isFinite(u.gam));

/** Nhóm nguồn { ma, ten } của một SHBG (u của kttQuery.dungDonShbg). */
function nguonCua(u) {
  const diem = chuoi(u.diemGuiDen);
  if (diem.startsWith(TIEN_TO_NOI_TINH)) return { ma: MA_NOI_TINH, ten: TEN_NOI_TINH };
  const ma = chuoi(u.duongThuDenMa);
  if (ma) return { ma, ten: chuoi(u.duongThuDenTen) || ma };
  return { ma: MA_KHONG_RO, ten: TEN_KHONG_RO };
}

// ------------------------------------------
// Bộ cộng kg theo khối (cùng phạm vi với taoKhoi: mỗi lần them() là một SHBG)
// ------------------------------------------
function taoKg() {
  let kg = 0;
  const tt = Object.fromEntries(KHOA_TT.map((t) => [t, 0]));
  return {
    them(kq, kgShbg) {
      kg += kgShbg;
      if (kq.trangThai) tt[kq.trangThai.toLowerCase()] += kgShbg;
    },
    ketQua() { return { kg: r3(kg), trang_thai: Object.fromEntries(KHOA_TT.map((t) => [t, r3(tt[t])])) }; }
  };
}
const kgRong = () => taoKg().ketQua();

/** Gắn kg vào một khối đã có (ketQua của taoKhoi): khoi.kg và khoi.trang_thai[t].kg. Chỉ THÊM trường. */
function ganKg(khoi, kgKq) {
  khoi.kg = kgKq.kg;
  for (const t of KHOA_TT) if (khoi.trang_thai[t]) khoi.trang_thai[t].kg = kgKq.trang_thai[t];
  return khoi;
}

// ------------------------------------------
// Bộ cộng theo nguồn (một ngày)
// ------------------------------------------
const nhomTrong = (ma, ten) => ({
  ma, ten, _tt: Object.fromEntries(KHOA_TT.map((t) => [t, { shbg: 0, kg: 0 }])), _truot: 0, _lo: 0, _dat: 0, _khongDat: 0, _bcvh: new Map()
});
const bcvhTrong = () => ({ shbg: 0, kg: 0, ro_lai: 0, truot_chuyen: 0, khong_dat: 0 });

function taoNguon() {
  const m = new Map();
  return {
    /** u: đơn vị SHBG; kq: kết quả phanLoaiShbg (nhóm PHAN_LOAI, KHÔNG phải hàng hoàn). SHBG chưa phân loại được (trangThai null) bị bỏ qua. */
    them(u, kq) {
      if (!kq.trangThai) return;
      const { ma, ten } = nguonCua(u);
      let g = m.get(ma);
      if (!g) { g = nhomTrong(ma, ten); m.set(ma, g); }
      const kg = kgCua(u);
      const t = kq.trangThai.toLowerCase();
      g._tt[t].shbg++; g._tt[t].kg += kg;
      // đạt / không đạt: cùng phạm vi với khối dat_khong_dat (mọi SHBG có trạng thái, kể cả đang chờ chuyến)
      const d = kq.datKhongDat ? kq.datKhongDat.trangThai : null;
      if (d === S.DAT.DAT) g._dat++; else if (d === S.DAT.KHONG_DAT) g._khongDat++;
      const dangCho = kq.trangThai === S.TRANG_THAI.DANG_CHO_CHUYEN;
      const truot = !dangCho && kq.chuyenKq === 'TRUOT' ? 1 : 0;
      const lo = !dangCho && kq.chuyenKq === 'LO' ? 1 : 0;
      g._truot += truot; g._lo += lo;
      const roLai = t === 't3' || t === 't4' || t === 't5' ? 1 : 0;
      let b = null;
      if (u.maBcvh) {
        b = g._bcvh.get(u.maBcvh);
        if (!b) { b = bcvhTrong(); g._bcvh.set(u.maBcvh, b); }
        b.khong_dat += d === S.DAT.KHONG_DAT ? 1 : 0;
        if (!dangCho) { b.shbg++; b.kg += kg; b.ro_lai += roLai; b.truot_chuyen += truot + lo; }
      }
    },
    ketQua() { return xuatNhom([...m.values()]); }
  };
}

/** Nhóm nội bộ -> đối tượng trả về. `shbg`, `kg` = phần MẪU SỐ năm trạng thái (t1…t5); `trang_thai.dang_cho_chuyen` tách riêng, không vào shbg / kg / ro_lai. */
function xuatNhom(ds) {
  return ds.map((g) => {
    const tt = Object.fromEntries(KHOA_TT.map((t) => [t, { shbg: g._tt[t].shbg, kg: r3(g._tt[t].kg) }]));
    const nam = KHOA_TT.slice(0, 5);
    const shbg = nam.reduce((s, t) => s + g._tt[t].shbg, 0);
    const kg = r3(nam.reduce((s, t) => s + g._tt[t].kg, 0));
    const dat = g._dat; const khongDat = g._khongDat;
    // theo_bcvh: chỉ liệt kê BCVH có SHBG; shbg / kg / ro_lai / truot_chuyen / khong_dat của BCVH cùng phạm vi với shbg của nhóm (t1…t5, không có đang chờ chuyến)
    return {
      ma: g.ma, ten: g.ten, shbg, kg, trang_thai: tt,
      ro_lai: g._tt.t3.shbg + g._tt.t4.shbg + g._tt.t5.shbg, truot_chuyen: g._truot + g._lo,
      dat_khong_dat: { dat, khong_dat: khongDat, ty_le_dat: dat + khongDat > 0 ? dat / (dat + khongDat) : null },
      theo_bcvh: Object.fromEntries([...g._bcvh.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ma, b]) => [ma, { shbg: b.shbg, kg: r3(b.kg), ro_lai: b.ro_lai, truot_chuyen: b.truot_chuyen, khong_dat: b.khong_dat }]))
    };
  }).sort(soSanhNhom);
}
/** Sắp theo `shbg` giảm dần; bằng nhau thì theo mã tăng dần (ổn định). */
const soSanhNhom = (a, b) => (b.shbg - a.shbg) || (a.ma < b.ma ? -1 : a.ma > b.ma ? 1 : 0);

const congMap = (a, b, f) => { const r = { ...a }; for (const [k, v] of Object.entries(b)) r[k] = k in r ? f(r[k], v) : v; return r; };

/** Cộng nhiều danh sách nhóm (một danh sách mỗi ngày) thành một danh sách. */
function congNguon(dsNgay) {
  const m = new Map();
  for (const ds of dsNgay) for (const g of ds || []) {
    const c = m.get(g.ma);
    if (!c) { m.set(g.ma, JSON.parse(JSON.stringify(g))); continue; }
    c.shbg += g.shbg; c.kg = r3(c.kg + g.kg); c.ro_lai += g.ro_lai; c.truot_chuyen += g.truot_chuyen;
    for (const t of KHOA_TT) { c.trang_thai[t].shbg += g.trang_thai[t].shbg; c.trang_thai[t].kg = r3(c.trang_thai[t].kg + g.trang_thai[t].kg); }
    c.dat_khong_dat.dat += g.dat_khong_dat.dat; c.dat_khong_dat.khong_dat += g.dat_khong_dat.khong_dat;
    c.theo_bcvh = congMap(c.theo_bcvh, g.theo_bcvh, (x, y) => ({
      shbg: x.shbg + y.shbg, kg: r3(x.kg + y.kg), ro_lai: x.ro_lai + y.ro_lai, truot_chuyen: x.truot_chuyen + y.truot_chuyen, khong_dat: x.khong_dat + y.khong_dat
    }));
  }
  const kq = [...m.values()];
  for (const g of kq) {
    const { dat, khong_dat: kd } = g.dat_khong_dat;
    g.dat_khong_dat.ty_le_dat = dat + kd > 0 ? dat / (dat + kd) : null;
    g.theo_bcvh = Object.fromEntries(Object.entries(g.theo_bcvh).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  }
  return kq.sort(soSanhNhom);
}

module.exports = { MA_NOI_TINH, MA_KHONG_RO, TEN_NOI_TINH, TEN_KHONG_RO, RE_MA_NGUON, KHOA_TT, r3, kgCua, thieuKhoiLuong, nguonCua, taoKg, kgRong, ganKg, taoNguon, congNguon };
