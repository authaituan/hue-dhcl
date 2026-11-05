// ==========================================
// «Hàng tại KTT» (KTT-KD-3b): màn «GIỜ ĐẾN TRONG NGÀY» — CÁC HÀM THUẦN: không DB, không giờ máy. Chỉ ĐỌC cột số theo ngày của kttBucTranh (`gop`), KHÔNG đổi quy tắc nào (#111, #112, #127).
// Tài liệu: docs/ai/42_KTT_API.md mục 22, quyết định #128.
//
// Đơn vị «đường thư» = MÃ đường thư (gộp mọi lịch, mọi cụm của bức tranh). Hàng chưa có mã đường thư là MỘT dòng riêng (khóa `__RONG__`, ma null). Tên thiếu: ten = null (KHÔNG gộp vào «Khác»).
// «Chuyến thư đến» của một đường thư = băng giờ dựng bằng ĐÚNG quy tắc bức tranh (chiaBang: tách khi hai lần đến cách TRÊN `gapPhut` (60) phút, băng dưới `cumNhoShbg` gộp vào băng gần nhất,
//   hai băng sát nửa đêm nối thành băng vắt đêm) nhưng nhóm theo MÃ đường thư (không tách theo lịch); dựng trên MỌI ngày / BCVH của cửa sổ, riêng cho từng mốc.
// «Giờ đến của một ngày» = MỖI CHUYẾN MỘT GIỜ: giờ giữa (trung vị) các lần đến của chuyến trong ngày đó. P10 / giờ giữa / P90 của đường thư tính trên các giờ-chuyến-ngày này, KHÔNG trên từng bưu gửi.
// Mốc A = giờ xác nhận BD10 đến (giờ trong ngày, vòng 24 giờ: `tod`), mốc B = giờ quét túi đến.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const BT = require('./kttBucTranh');
const NG = require('./kttNguon');
const { thoiGianThucGiay } = require('./quyThoiGian');
const { chiTieuGio, NGOAI_LE_CHI_TIEU } = require('./quyThoiGianChiTieu');
const { MA_BCVH_HUE } = require('./kttTinh');

const KHOA_CHUA_CO_MA = NG.MA_LOC_RONG; // khóa dòng «chưa có đường thư»
const SO_DONG_MAC_DINH = 5; // không chọn đường thư: hiện 5 đường lớn nhất, còn lại vào «Khác»
const SO_DONG_TOI_DA = 8;
const r3 = NG.r3;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const KIEN = BT.KIEN;
/** Ngưỡng mặc định = của bức tranh + khóa mới KTT-KD-3b (không sửa BT.NGUONG_MAC_DINH: nó nằm trong phản hồi của route cũ). */
const NGUONG_MAC_DINH = Object.freeze({ ...BT.NGUONG_MAC_DINH, sanLuongLonPhanVi: 80 });
const THU_CN = 'CN';

const khoaCua = (ma) => (ma ? ma : KHOA_CHUA_CO_MA);
const loaiCua = (d) => (d.thu === THU_CN ? 'chu_nhat' : 'thuong');
const phanViHhmm = (v) => (v === null ? null : BT.hhmm(v));

// ------------------------------------------
// Chuyến thư đến theo MÃ đường thư
// ------------------------------------------
/** Với mốc `moc`: Map dtI -> { bang[], tra: Int16Array(1440) } (băng giờ của đường thư trên MỌI dòng của R, không phụ thuộc bộ lọc). `chiDt` (tùy chọn): chỉ dựng cho đường thư này. */
function dungChuyen(R, moc, ng, chiDt = null) {
  const t = R.cot[`t${moc}`];
  const dem = new Map();
  for (let i = 0; i < R.n; i++) {
    if (Number.isNaN(t[i])) continue;
    const d = R.cot.dt[i];
    if (chiDt !== null && d !== chiDt) continue;
    let a = dem.get(d);
    if (!a) { a = new Int32Array(1440); dem.set(d, a); }
    a[BT.tod(t[i])]++;
  }
  const ra = new Map();
  for (const [d, a] of dem) {
    const bang = BT.chiaBang(a, ng.gapPhut, ng.cumNhoShbg);
    const tra = new Int16Array(1440).fill(-1);
    bang.forEach((b, j) => { for (let p = 0; p < 1440; p++) if (BT.trongBang(b, p)) tra[p] = j; });
    ra.set(d, { bang, tra });
  }
  return ra;
}

// ------------------------------------------
// Thống kê nhỏ
// ------------------------------------------
/** Sản lượng theo ngày của MỘT loại ngày: demNgay = Map chỉ số ngày (của R) -> số bưu gửi; cuaSo = [{ i (chỉ số ngày của R hoặc âm), loai }]. Độ lệch chuẩn chia N−1 (KTT-KD-3b). */
function thongKeNgay(demNgay, cuaSo, loai) {
  const cua = cuaSo.filter((d) => d.loai === loai);
  const co = cua.map((d) => demNgay.get(d.i) || 0).filter((x) => x > 0);
  const n = co.length;
  const tong = co.reduce((s, x) => s + x, 0);
  if (!n) return { so_ngay_cua_so: cua.length, so_ngay_co_hang: 0, tong: 0, tb_moi_ngay: cua.length ? 0 : null, tb_ngay_co_hang: null, do_lech_chuan: null, dao_dong: null };
  const tb = tong / n;
  const sd = n >= 2 ? Math.sqrt(co.reduce((s, x) => s + (x - tb) * (x - tb), 0) / (n - 1)) : null;
  return { so_ngay_cua_so: cua.length, so_ngay_co_hang: n, tong, tb_moi_ngay: r1(tong / cua.length), tb_ngay_co_hang: r1(tb), do_lech_chuan: sd === null ? null : r1(sd), dao_dong: sd !== null && tb > 0 ? r3(sd / tb) : null };
}
const theoGioRong = () => Array.from({ length: 24 }, () => ({ shbg: 0, kg: 0, kien_di_ngoai: 0 }));
const congGio = (dich, nguon) => { for (let h = 0; h < 24; h++) { dich[h].shbg += nguon[h].shbg; dich[h].kg += nguon[h].kg; dich[h].kien_di_ngoai += nguon[h].kien_di_ngoai; } };
const gioRa = (g) => g.map((x, h) => ({ gio: h, shbg: x.shbg, kg: r3(x.kg), kien_di_ngoai: x.kien_di_ngoai }));
const kgRa = (kg, thieu, shbg) => ({ kg: shbg > 0 && thieu === shbg ? null : r3(kg), shbg_thieu_kg: thieu });

// ------------------------------------------
// Dựng bảng đường thư × giờ cho MỘT mốc
// ------------------------------------------
/**
 * opts: { moc, loaiNgay, bcvh (mã | null), nguong, ngays (cả cửa sổ: [{ ngay, thu }]), chon (mảng khóa đường thư | []), nSong (số ngày của khoảng, mặc định ngays.length) }.
 * Trả { mau_so, do_duoc, khong_do_duoc, duong_thu[] (đã chọn / 5 lớn nhất), khac, tong, danh_sach[] (mọi đường thư: khóa, ten, shbg, co), nguong_ap_dung, thong_ke_co }.
 */
function tinhGioDen(R, opts) {
  const moc = opts.moc; const kia = moc === 'A' ? 'B' : 'A';
  const ng = { ...NGUONG_MAC_DINH, ...(opts.nguong || {}) };
  const loai = opts.loaiNgay || 'tat_ca';
  const bcvhLoc = opts.bcvh ? MA_BCVH_HUE.indexOf(opts.bcvh) : -1;
  const t = R.cot[`t${moc}`]; const tKia = R.cot[`t${kia}`];
  const chuyen = dungChuyen(R, moc, ng);
  const ngays = opts.ngays || R.ngays;
  const soNgay = ngays.length;
  const chiSoNgay = new Map(R.ngays.map((d, i) => [d.ngay, i]));
  const cuaSo = ngays.map((d, i) => ({ i: chiSoNgay.has(d.ngay) ? chiSoNgay.get(d.ngay) : -1 - i, loai: loaiCua(d) }));
  const loaiDuLieu = R.ngays.map(loaiCua);

  const mau = { tong: 0, coMoc: 0 };
  const hang = new Map(); // dtI -> bộ cộng
  const moiHang = () => ({ shbg: 0, kg: 0, thieu: 0, kien: 0, kienKg: 0, kienThieu: 0, chiaSan: 0, mo: 0, gio: theoGioRong(), demNgay: new Map(), cn: new Map(), cx: new Map(), bangShbg: new Map(), meo: new Map() });
  for (let i = 0; i < R.n; i++) {
    if (bcvhLoc >= 0 && R.cot.bcvh[i] !== bcvhLoc) continue;
    if (loai !== 'tat_ca' && loaiDuLieu[R.ngayI[i]] !== loai) continue;
    mau.tong++;
    if (Number.isNaN(t[i])) continue;
    mau.coMoc++;
    const d = R.cot.dt[i];
    let h = hang.get(d); if (!h) { h = moiHang(); hang.set(d, h); }
    const kg = R.cot.kg[i]; const coKg = !Number.isNaN(kg);
    const p = BT.tod(t[i]); const g = Math.floor(p / 60);
    const k = R.cot.kien[i];
    h.shbg++; if (coKg) h.kg += kg; else h.thieu++;
    h.gio[g].shbg++; if (coKg) h.gio[g].kg += kg;
    if (k === KIEN.DI_NGOAI) { h.kien++; h.gio[g].kien_di_ngoai++; if (coKg) h.kienKg += kg; else h.kienThieu++; } else if (k === KIEN.CHIA_SAN) h.chiaSan++; else if (k === KIEN.MO_TUI) h.mo++;
    h.demNgay.set(R.ngayI[i], (h.demNgay.get(R.ngayI[i]) || 0) + 1);
    const cu = chuyen.get(d); const j = cu ? cu.tra[p] : -1;
    if (j >= 0) {
      const b = cu.bang[j];
      const kcn = `${j}|${R.ngayI[i]}`;
      let c = h.cn.get(kcn); if (!c) { c = { j, v: [] }; h.cn.set(kcn, c); }
      c.v.push(BT.trai(b, p));
      h.bangShbg.set(j, (h.bangShbg.get(j) || 0) + 1);
      if (moc === 'A' && !Number.isNaN(tKia[i])) { let m = h.meo.get(j); if (!m) { m = { a: [], b: [] }; h.meo.set(j, m); } m.a.push(BT.trai(b, p)); m.b.push(BT.trai(b, BT.tod(tKia[i]))); }
    }
  }

  const dd = [];
  const mauToiThieu = Math.ceil(ng.mauToiThieu * (opts.nSong || soNgay) / 30);
  const dong = [];
  for (const [d, h] of hang) {
    const gia = [...h.cn.values()].map((c) => BT.phanVi(BT.sapTang(c.v), 0.5)); // giờ giữa mỗi (chuyến, ngày), trải liền
    const sx = BT.sapTang(gia);
    const p10 = BT.phanVi(sx, 0.1); const p50 = BT.phanVi(sx, 0.5); const p90 = BT.phanVi(sx, 0.9);
    const ngayThuong = thongKeNgay(h.demNgay, cuaSo, 'thuong');
    const chuNhat = thongKeNgay(h.demNgay, cuaSo, 'chu_nhat');
    const ngayCoHang = new Set([...h.demNgay.keys()]).size;
    const bangCua = chuyen.get(d);
    const meo = moc !== 'A' ? null : (h.meo.size ? [...h.meo.values()].some((m) => Math.abs(BT.phanVi(BT.sapTang(m.a), 0.5) - BT.phanVi(BT.sapTang(m.b), 0.5)) >= ng.meoTheoLoPhut) : null);
    const daoDong = loai === 'chu_nhat' ? chuNhat.dao_dong : ngayThuong.dao_dong;
    const doRong = p10 === null ? null : Math.round(p90 - p10);
    const ma = R.tu.dt[d] || null;
    const mauIt = h.shbg < mauToiThieu;
    const r = {
      khoa: khoaCua(ma), ma, ten: R.tu.dtTen[d] || null, thu_hang: 0, shbg: h.shbg, ...kgRa(h.kg, h.thieu, h.shbg), ty_le_shbg: null,
      theo_gio: gioRa(h.gio),
      san_luong_ngay: { ngay_thuong: ngayThuong, chu_nhat: chuNhat, so_ngay_co_hang: ngayCoHang },
      gio_den_ngay: {
        moc, so_mau: sx.length, p10: phanViHhmm(p10), trung_vi: phanViHhmm(p50), p90: phanViHhmm(p90), p10_phut: p10 === null ? null : BT.tod(p10), trung_vi_phut: p50 === null ? null : BT.tod(p50), p90_phut: p90 === null ? null : BT.tod(p90),
        do_rong_phut: doRong, so_chuyen: h.bangShbg.size, so_chuyen_ngay: ngayCoHang > 0 ? r1(sx.length / ngayCoHang) : null
      },
      kien_di_ngoai: { shbg: h.kien, ...kgRa(h.kienKg, h.kienThieu, h.kien), ty_le: h.shbg > 0 ? h.kien / h.shbg : null },
      trong_tui: { shbg: h.shbg - h.kien, ty_le: h.shbg > 0 ? (h.shbg - h.kien) / h.shbg : null, chia_san: h.chiaSan, mo: h.mo },
      chuyen: [...h.bangShbg.entries()].sort((x, y) => x[0] - y[0]).map(([j, n]) => ({ thu_tu: j + 1, bang_gio: { tu: BT.hhmm(bangCua.bang[j].dau), den: BT.hhmm(bangCua.bang[j].cuoi), vat_dem: bangCua.bang[j].vat }, shbg: n })),
      co: {}, co_gia_tri_do: { dao_dong: daoDong, do_rong_gio_den_phut: doRong, ty_le_kien_di_ngoai: h.shbg > 0 ? h.kien / h.shbg : null, shbg: h.shbg },
      meo_theo_lo: meo, _mauIt: mauIt, _h: h
    };
    dong.push(r); if (!mauIt) dd.push(r);
  }

  // ---- dấu hiệu CẤP ĐƯỜNG THƯ (ngưỡng tương đối trên các đường thư ĐỦ MẪU của bộ lọc; không phụ thuộc đường thư được chọn hiển thị)
  const nguongDao = BT.nguongTuongDoi(dd.map((r) => r.co_gia_tri_do.dao_dong), ng.phanViTuongDoi);
  const nguongRong = BT.nguongTuongDoi(dd.map((r) => r.co_gia_tri_do.do_rong_gio_den_phut), ng.phanViTuongDoi);
  const nguongKien = BT.nguongTuongDoi(dd.map((r) => r.kien_di_ngoai.ty_le), ng.kienNgoaiPhanVi);
  const nguongLon = BT.nguongTuongDoi(dd.map((r) => r.shbg), ng.sanLuongLonPhanVi);
  for (const r of dong) {
    const mi = r._mauIt; const v = r.co_gia_tri_do;
    r.co = {
      mau_it: mi,
      san_luong_khong_deu: !mi && nguongDao !== null && v.dao_dong !== null && v.dao_dong >= nguongDao,
      gio_den_khong_co_dinh: !mi && nguongRong !== null && v.do_rong_gio_den_phut !== null && v.do_rong_gio_den_phut >= nguongRong,
      nhieu_kien_di_ngoai: !mi && v.ty_le_kien_di_ngoai !== null && v.ty_le_kien_di_ngoai >= ng.kienDiNgoaiPct / 100 && nguongKien !== null && v.ty_le_kien_di_ngoai >= nguongKien,
      san_luong_lon: !mi && nguongLon !== null && r.shbg >= nguongLon
    };
  }
  dong.sort((x, y) => (y.shbg - x.shbg) || (x.khoa < y.khoa ? -1 : 1));
  const tongShbg = dong.reduce((s, r) => s + r.shbg, 0);
  dong.forEach((r, i) => { r.thu_hang = i + 1; r.ty_le_shbg = tongShbg > 0 ? r.shbg / tongShbg : null; });

  // ---- chọn dòng hiển thị, «Khác», «Tổng»
  const chon = opts.chon && opts.chon.length ? new Set(opts.chon) : null;
  const hien = chon ? dong.filter((r) => chon.has(r.khoa)) : dong.slice(0, SO_DONG_MAC_DINH);
  const hienKhoa = new Set(hien.map((r) => r.khoa));
  const cong = (ds) => {
    const o = { shbg: 0, kg: 0, thieu: 0, kien: 0, kienKg: 0, kienThieu: 0, gio: theoGioRong() };
    for (const r of ds) { const h = r._h; o.shbg += h.shbg; o.kg += h.kg; o.thieu += h.thieu; o.kien += h.kien; o.kienKg += h.kienKg; o.kienThieu += h.kienThieu; congGio(o.gio, h.gio); }
    return o;
  };
  const gom = (ds) => { const o = cong(ds); return { so_duong_thu: ds.length, shbg: o.shbg, ...kgRa(o.kg, o.thieu, o.shbg), kien_di_ngoai: { shbg: o.kien, ...kgRa(o.kienKg, o.kienThieu, o.kien), ty_le: o.shbg > 0 ? o.kien / o.shbg : null }, theo_gio: gioRa(o.gio) }; };
  const khac = gom(dong.filter((r) => !hienKhoa.has(r.khoa)));
  const tong = { ...gom(dong), so_ngay_cua_so: soNgay };
  const sach = (r) => { const { _mauIt, _h, ...x } = r; return x; };
  const hienRa = hien.map(sach);
  const demCo = (co) => ({ so_bi_gan_co: dd.filter((r) => r.co[co]).length, so_duong_thu_du_mau: dd.length });
  return {
    moc, mau_so: mau.tong, do_duoc: mau.coMoc, khong_do_duoc: mau.tong - mau.coMoc,
    duong_thu: hienRa, khac, tong,
    danh_sach: dong.map((r) => ({ khoa: r.khoa, ma: r.ma, ten: r.ten, thu_hang: r.thu_hang, shbg: r.shbg, kg: r.kg, co: r.co })),
    nguong_ap_dung: {
      gap_cum_phut: ng.gapPhut, cum_nho_shbg: ng.cumNhoShbg, mau_toi_thieu_30_ngay: ng.mauToiThieu, so_ngay_khoang: opts.nSong || soNgay, mau_toi_thieu_ap_dung: mauToiThieu,
      phan_vi_tuong_doi: ng.phanViTuongDoi, kien_di_ngoai_pct: ng.kienDiNgoaiPct, kien_ngoai_phan_vi: ng.kienNgoaiPhanVi, san_luong_lon_phan_vi: ng.sanLuongLonPhanVi, meo_theo_lo_phut: ng.meoTheoLoPhut,
      muc_san_luong_khong_deu: nguongDao, muc_gio_den_khong_co_dinh_phut: nguongRong, muc_nhieu_kien_di_ngoai: nguongKien, muc_san_luong_lon_shbg: nguongLon, so_duong_thu_tinh_nguong: dd.length
    },
    thong_ke_co: { mau_it: { so_bi_gan_co: dong.filter((r) => r.co.mau_it).length, so_duong_thu: dong.length }, san_luong_khong_deu: demCo('san_luong_khong_deu'), gio_den_khong_co_dinh: demCo('gio_den_khong_co_dinh'), nhieu_kien_di_ngoai: demCo('nhieu_kien_di_ngoai'), san_luong_lon: demCo('san_luong_lon') }
  };
}

/** Mọi khóa đường thư có trong R (kể cả hàng chưa có mã): dùng kiểm `duong_thu` lạ. */
function khoaDuongThuCoTrong(R) { return new Set(R.tu.dt.map(khoaCua)); }

// ------------------------------------------
// Từng ngày của MỘT đường thư
// ------------------------------------------
/** opts: { moc, loaiNgay, bcvh, khoa, nguong, ngays }. Trả null khi khóa không có trong R. Mọi ngày của cửa sổ đều có dòng (co_hang false khi không có hàng). */
function tinhTheoNgay(R, opts) {
  const ng = { ...NGUONG_MAC_DINH, ...(opts.nguong || {}) };
  const dtI = R.tu.dt.findIndex((m) => khoaCua(m) === opts.khoa);
  if (dtI < 0) return null;
  const moc = opts.moc; const t = R.cot[`t${moc}`];
  const loai = opts.loaiNgay || 'tat_ca';
  const bcvhLoc = opts.bcvh ? MA_BCVH_HUE.indexOf(opts.bcvh) : -1;
  const chuyen = dungChuyen(R, moc, ng, dtI).get(dtI) || { bang: [], tra: new Int16Array(1440).fill(-1) };
  const ngays = opts.ngays || R.ngays;
  const chiSoNgay = new Map(R.ngays.map((d, i) => [d.ngay, i]));
  const theoNgay = new Map(); // ngayI -> { shbg, kg, thieu, kien, kienKg, kienThieu, cn: Map j -> {...} }
  for (let i = 0; i < R.n; i++) {
    if (R.cot.dt[i] !== dtI || Number.isNaN(t[i])) continue;
    if (bcvhLoc >= 0 && R.cot.bcvh[i] !== bcvhLoc) continue;
    const ni = R.ngayI[i];
    let e = theoNgay.get(ni); if (!e) { e = { shbg: 0, kg: 0, thieu: 0, kien: 0, kienKg: 0, kienThieu: 0, cn: new Map() }; theoNgay.set(ni, e); }
    const kg = R.cot.kg[i]; const coKg = !Number.isNaN(kg); const k = R.cot.kien[i] === KIEN.DI_NGOAI;
    const p = BT.tod(t[i]); const j = chuyen.tra[p];
    const c = (() => { let x = e.cn.get(j); if (!x) { x = { shbg: 0, kg: 0, thieu: 0, kien: 0, kienKg: 0, kienThieu: 0, v: [] }; e.cn.set(j, x); } return x; })();
    for (const o of [e, c]) { o.shbg++; if (coKg) o.kg += kg; else o.thieu++; if (k) { o.kien++; if (coKg) o.kienKg += kg; else o.kienThieu++; } }
    c.v.push(j >= 0 ? BT.trai(chuyen.bang[j], p) : p);
  }
  const ra = [];
  const giaTri = []; // giờ giữa trải liền của các (chuyến, ngày) thuộc loại ngày đang xem
  let tongNgayLoai = 0; let coHangLoai = 0;
  for (const d of ngays) {
    const ni = chiSoNgay.has(d.ngay) ? chiSoNgay.get(d.ngay) : -1;
    const e = ni >= 0 ? theoNgay.get(ni) : undefined;
    const dong = { ngay: d.ngay, la_chu_nhat: d.thu === THU_CN, co_hang: !!e, shbg: e ? e.shbg : 0, kg: e ? kgRa(e.kg, e.thieu, e.shbg).kg : 0, shbg_thieu_kg: e ? e.thieu : 0, kien_di_ngoai: { shbg: e ? e.kien : 0, kg: e ? kgRa(e.kienKg, e.kienThieu, e.kien).kg : 0 }, trong_tui: { shbg: e ? e.shbg - e.kien : 0 }, chuyen: [] };
    if (e) {
      for (const [j, c] of [...e.cn.entries()].sort((x, y) => x[0] - y[0])) {
        const gm = BT.phanVi(BT.sapTang(c.v), 0.5);
        dong.chuyen.push({ thu_tu: j >= 0 ? j + 1 : null, gio_giua: BT.hhmm(gm), gio_giua_phut: BT.tod(gm), shbg: c.shbg, ...kgRa(c.kg, c.thieu, c.shbg), kien_di_ngoai: { shbg: c.kien, ...kgRa(c.kienKg, c.kienThieu, c.kien) } });
        if (loai === 'tat_ca' || loaiCua(d) === loai) giaTri.push(gm);
      }
    }
    if (loai === 'tat_ca' || loaiCua(d) === loai) { tongNgayLoai++; if (e) coHangLoai++; }
    ra.push(dong);
  }
  const sx = BT.sapTang(giaTri);
  const p10 = BT.phanVi(sx, 0.1); const p50 = BT.phanVi(sx, 0.5); const p90 = BT.phanVi(sx, 0.9);
  const tongLoai = ra.filter((x) => x.co_hang && (loai === 'tat_ca' || (x.la_chu_nhat ? 'chu_nhat' : 'thuong') === loai)).reduce((s, x) => s + x.shbg, 0);
  return {
    moc, ngay: ra,
    dai_thuong_gap: { so_mau: sx.length, p10: phanViHhmm(p10), trung_vi: phanViHhmm(p50), p90: phanViHhmm(p90), do_rong_phut: p10 === null ? null : Math.round(p90 - p10) },
    so_ngay_cua_so: tongNgayLoai, so_ngay_co_hang: coHangLoai, tb_ngay_co_hang: coHangLoai > 0 ? r1(tongLoai / coHangLoai) : null,
    chuyen_cua_duong_thu: chuyen.bang.map((b, j) => ({ thu_tu: j + 1, bang_gio: { tu: BT.hhmm(b.dau), den: BT.hhmm(b.cuoi), vat_dem: b.vat }, shbg: b.shbg }))
  };
}

// ------------------------------------------
// Dải «còn so với chỉ tiêu» theo giờ (máy chủ tính; giao diện KHÔNG hard-code lịch hay chỉ tiêu)
// ------------------------------------------
// Ngày mẫu chỉ để xác định THỨ (lịch chuyến khác nhau ở Chủ nhật): 03/11/2026 là thứ Ba; 01/11/2026 là Chủ nhật.
const NGAY_MAU = Object.freeze({ thuong: '2026-11-03', chu_nhat: '2026-11-01' });
const LOAI_NGAY_MAU = Object.freeze(['thuong', 'chu_nhat']);

/**
 * Hàng đến giờ g coi như đến phút :30 của giờ g. Với mỗi (BCVH, loại ngày, giờ): xếp chuyến bằng L.xepChuyen (giờ chốt = giờ rời − hạn, mặc định 60 phút), thời gian lưu thoát theo lịch =
 * thoiGianThucGiay(giờ đến, giờ xe rời) (đã trừ 21:00–07:00), còn lại = chỉ tiêu − lưu thoát (có thể ÂM). Không tính được -> null (không trả 0).
 * lich / hanPhut: từ docLichChuyen. opts: { bcvh, loaiNgay ('thuong'|'chu_nhat'|'tat_ca'), tenBcvh (mã -> tên) }.
 */
function conLaiTheoGio(lich, hanPhut, opts = {}) {
  const loais = !opts.loaiNgay || opts.loaiNgay === 'tat_ca' ? LOAI_NGAY_MAU : [opts.loaiNgay];
  const dsBcvh = opts.bcvh ? [opts.bcvh] : MA_BCVH_HUE;
  const ngoaiLe = (ma) => NGOAI_LE_CHI_TIEU.find((e) => e.maBcvh === ma) || null;
  return dsBcvh.map((ma) => {
    const nl = ngoaiLe(ma);
    return {
      ma_bcvh: ma, ten_bcvh: (opts.tenBcvh && opts.tenBcvh[ma]) || null, chi_tieu_gio: chiTieuGio(ma, null),
      chi_tieu_gio_ngoai_le: nl ? { gio: nl.gio, phuong_xa: nl.phuong.slice() } : null,
      loai_ngay: loais.map((loai) => ({
        loai_ngay: loai,
        gio: Array.from({ length: 24 }, (_, g) => {
          const den = `${NGAY_MAU[loai]} ${String(g).padStart(2, '0')}:30:00`;
          const x = L.xepChuyen(lich, ma, den, { hanDenTruocChuyenPhut: hanPhut });
          const trong = { gio: g, gio_den: `${String(g).padStart(2, '0')}:30`, con_lai_gio: null, cho_theo_lich_gio: null, chi_tieu_gio: chiTieuGio(ma, null), gio_xe_ke_tiep: null, gio_chot: null, sang_ngay_sau: null, con_lai_12h: null };
          if (!x.ok) return trong;
          const ch = x.chuyen;
          const cho = thoiGianThucGiay(den, ch.xuat_phat_luc);
          const choGio = cho === null ? null : cho / 3600;
          return {
            ...trong, cho_theo_lich_gio: choGio === null ? null : r2(choGio), con_lai_gio: choGio === null ? null : r2(trong.chi_tieu_gio - choGio),
            gio_xe_ke_tiep: ch.gio_xuat_phat, gio_chot: ch.han_den_luc.slice(11, 16), sang_ngay_sau: ch.ngay !== NGAY_MAU[loai],
            con_lai_12h: nl && choGio !== null ? r2(nl.gio - choGio) : null
          };
        })
      }))
    };
  });
}

module.exports = { KHOA_CHUA_CO_MA, SO_DONG_MAC_DINH, SO_DONG_TOI_DA, NGAY_MAU, dungChuyen, tinhGioDen, tinhTheoNgay, khoaDuongThuCoTrong, conLaiTheoGio, khoaCua };
