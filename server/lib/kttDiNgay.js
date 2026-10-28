// ==========================================
// «Hàng tại KTT» — KTT-12: tỷ lệ ĐI CÙNG NGÀY (B1, B2, B3), hàng rớt lại theo đường thư, bảng B5 và số hàng đến theo giờ cho B6. CÁC HÀM THUẦN: không DB, không giờ máy
// («bây giờ» luôn là tham số). KHÔNG đổi quy tắc của kttLuuThoat.js: hàng đi về 6 BCVH Huế lấy trạng thái từ chính `phanLoaiShbg` (cùng một định nghĩa «cùng ngày»);
// chỉ hướng «nội tỉnh đi liên tỉnh» (xe Cấp 1, không có lịch chuyến) so ngày trực tiếp. Phần truy vấn nằm ở kttDiNgayQuery.js. Tài liệu: docs/ai/43_KTT_DI_CUNG_NGAY_API.md.
//
// Năm nhóm đi (mẫu số = tổng năm nhóm, khớp `luu_thoat.mau_so` của /luu-thoat khi cùng phạm vi):
//   cung_ngay (T1+T2: BD10 đi trước 24:00 ngày đến) · hom_sau (T3+T4) · tu_2_ngay (đã đi từ D+2) · chua_di_duoi_24h · chua_di_tren_24h (chưa đi; chờ tính liên tục từ giờ quét túi đến).
// Ngoài mẫu số: dang_cho_chuyen (chưa đi, chưa tới giờ xe — như /luu-thoat) và khong_phan_loai (thiếu giờ quét túi đến / không xếp được chuyến).
// rớt lại = mẫu số − cung_ngay (= t3 + t4 + t5 của /luu-thoat).
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const S = require('./kttLuuThoat');
const NG = require('./kttNguon');

const HUONG = Object.freeze({
  LIEN_TINH_DEN_BCVH: 'lien_tinh_den_bcvh', // nơi gửi BD10 đến không bắt đầu bằng '53', đích 6 BCVH Huế
  NOI_TINH_DEN_BCVH: 'noi_tinh_den_bcvh', // nơi gửi '53…', đích 6 BCVH Huế, KHÔNG kể hàng hoàn Tổ KHHH
  NOI_TINH_HANG_HOAN: 'noi_tinh_hang_hoan', // hàng hoàn Tổ KHHH (531120 → Thuận Hóa), tách riêng, không cộng vào tổng và tỷ lệ
  NOI_TINH_DI_LIEN_TINH: 'noi_tinh_di_lien_tinh' // nơi gửi '53…', đích ngoài 6 BCVH Huế (xe Cấp 1)
});
const KHOA_HUONG = Object.values(HUONG);
const CAC_NHOM = Object.freeze(['cung_ngay', 'hom_sau', 'tu_2_ngay', 'chua_di_duoi_24h', 'chua_di_tren_24h']);
const KHOA_PHU = Object.freeze(['dang_cho_chuyen', 'khong_phan_loai']);
const SO_GIAY_24H = 86400;
const CHU_NHAT = 0;

const r3 = (x) => Math.round(x * 1000) / 1000;
const ty = (tu, mau) => (mau > 0 ? tu / mau : null);
const giay = (x) => (typeof x === 'string' ? L.giayCua(x) : null);
const ngayCua = (g) => L.dinhDang(g).slice(0, 10);
const gioTrongNgayGiay = (gio) => { const g = giay(gio); return g === null ? null : g - L.giayCua(`${gio.trim().slice(0, 10)} 00:00:00`); };
const gioCua = (gio) => (giay(gio) === null ? null : Number(gio.trim().slice(11, 13)));
const hhmm = (sec) => { const m = Math.round(sec / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const laChuNhat = (ymd) => L.giayCua(`${ymd} 00:00:00`) !== null && new Date(L.giayCua(`${ymd} 00:00:00`) * 1000).getUTCDay() === CHU_NHAT;

// ------------------------------------------
// Phân loại MỘT SHBG
// ------------------------------------------
function nhomTheoNgayDi(ngayD, gioDi) {
  const ngayDi = ngayCua(giay(gioDi));
  if (ngayDi <= ngayD) return 'cung_ngay';
  return ngayDi === S.ngayKe(ngayD) ? 'hom_sau' : 'tu_2_ngay';
}
function nhomChuaDi(gioMoc, bayGioGiay) {
  const cho = bayGioGiay - giay(gioMoc);
  return cho > SO_GIAY_24H ? 'chua_di_tren_24h' : 'chua_di_duoi_24h';
}

/**
 * u: đơn vị SHBG (kttQuery); kq: kết quả S.phanLoaiShbg(u); bayGioGiay: «bây giờ» (độ mới dữ liệu) tính bằng giây (L.giayCua).
 * Trả null khi SHBG không thuộc nhóm nào của B (đích không rõ, liên tỉnh đi liên tỉnh, đích KTT) — kèm `bo` để đếm vào meta; ngược lại
 * { huong, hanHoan, nhom (một trong CAC_NHOM) | khac ('dang_cho_chuyen' | 'khong_phan_loai') }.
 */
function phanLoaiDi(u, kq, bayGioGiay) {
  if (u.nhom === 'KHONG_RO') return { bo: 'khong_ro_dich' };
  const noiTinh = NG.nguonCua(u).ma === NG.MA_NOI_TINH;
  if (u.nhom === 'BCVH_HUE') {
    const hanHoan = kq.nhom === S.NHOM.HANG_HOAN;
    const huong = hanHoan ? HUONG.NOI_TINH_HANG_HOAN : (noiTinh ? HUONG.NOI_TINH_DEN_BCVH : HUONG.LIEN_TINH_DEN_BCVH);
    const o = { huong, hanHoan };
    if (kq.trangThai === null || kq.trangThai === undefined) return { ...o, khac: 'khong_phan_loai' };
    switch (kq.trangThai) {
      case S.TRANG_THAI.T1: case S.TRANG_THAI.T2: return { ...o, nhom: 'cung_ngay' };
      case S.TRANG_THAI.T3: case S.TRANG_THAI.T4: return { ...o, nhom: 'hom_sau' };
      case S.TRANG_THAI.T5: return { ...o, nhom: giay(u.gioBd10Di) !== null ? 'tu_2_ngay' : nhomChuaDi(u.quetDen, bayGioGiay) };
      default: return { ...o, khac: 'dang_cho_chuyen' };
    }
  }
  if (noiTinh && (u.nhom === 'KHAC' || u.nhom === 'HE1_530900')) {
    const o = { huong: HUONG.NOI_TINH_DI_LIEN_TINH, hanHoan: false };
    const moc = giay(u.quetDen) !== null ? u.quetDen : (giay(u.xndBd10) !== null ? u.xndBd10 : null);
    if (moc === null || !u.ngayDen) return { ...o, khac: 'khong_phan_loai' };
    return { ...o, nhom: giay(u.gioBd10Di) !== null ? nhomTheoNgayDi(u.ngayDen, u.gioBd10Di) : nhomChuaDi(moc, bayGioGiay) };
  }
  return { bo: 'ngoai_nhom_b' };
}

// ------------------------------------------
// Khối đếm (cộng được giữa các ngày)
// ------------------------------------------
const khoiMoi = () => ({ cung_ngay: 0, hom_sau: 0, tu_2_ngay: 0, chua_di_duoi_24h: 0, chua_di_tren_24h: 0, dang_cho_chuyen: 0, khong_phan_loai: 0, kg: 0, kg_ro_lai: 0 });
function themKhoi(k, pl, kg) {
  if (pl.khac) k[pl.khac]++;
  else { k[pl.nhom]++; if (pl.nhom !== 'cung_ngay') k.kg_ro_lai += kg; }
  k.kg += kg;
}
function congKhoiThanh(a, b) { for (const key of Object.keys(a)) a[key] += b[key] || 0; return a; }
const sao = (k) => ({ ...k });

/** Khối đếm -> kết quả trả về (tỷ lệ tính trên mẫu số = tổng năm nhóm; null khi mẫu số 0). */
function ketQuaKhoi(k) {
  const mau = CAC_NHOM.reduce((s, c) => s + k[c], 0);
  const roLai = mau - k.cung_ngay;
  return {
    tong_shbg: mau + k.dang_cho_chuyen + k.khong_phan_loai, mau_so: mau,
    cung_ngay: k.cung_ngay, hom_sau: k.hom_sau, tu_2_ngay: k.tu_2_ngay, chua_di_duoi_24h: k.chua_di_duoi_24h, chua_di_tren_24h: k.chua_di_tren_24h,
    ro_lai: roLai, dang_cho_chuyen: k.dang_cho_chuyen, khong_phan_loai: k.khong_phan_loai,
    ty_le: {
      cung_ngay: ty(k.cung_ngay, mau), hom_sau: ty(k.hom_sau, mau), tu_2_ngay: ty(k.tu_2_ngay, mau), chua_di_duoi_24h: ty(k.chua_di_duoi_24h, mau), chua_di_tren_24h: ty(k.chua_di_tren_24h, mau), ro_lai: ty(roLai, mau)
    },
    kg: r3(k.kg), kg_ro_lai: r3(k.kg_ro_lai)
  };
}

// ------------------------------------------
// Bó số liệu MỘT NGÀY (JSON thuần, cộng được)
// ------------------------------------------
const moi24 = () => Array.from({ length: 24 }, () => 0);
function taoNgay(ngay) {
  return {
    ngay, co_du_lieu: false,
    huong: Object.fromEntries(KHOA_HUONG.map((h) => [h, khoiMoi()])),
    gio: Array.from({ length: 24 }, khoiMoi), // 6 BCVH Huế, không kể hàng hoàn, theo giờ của giờ quét túi đến
    duong_thu: {}, // khóa `${huong}|${H|T}|${nơi gửi}|${đường thư}`
    bcvh: {}, // B6: { mã BCVH: { shbg, kg, gio_quet: [24], gio_xnd: [24] } } — mọi SHBG đích BCVH (kể cả hàng hoàn)
    bo: { khong_ro_dich: 0, ngoai_nhom_b: 0 }
  };
}

/** Thêm MỘT SHBG vào bó của ngày. pl = phanLoaiDi(...) (không null/bo). */
function themShbg(b, u, pl) {
  const kg = NG.kgCua(u);
  b.co_du_lieu = true;
  themKhoi(b.huong[pl.huong], pl, kg);
  const gioQuet = gioCua(u.quetDen);
  if (pl.huong !== HUONG.NOI_TINH_HANG_HOAN && pl.huong !== HUONG.NOI_TINH_DI_LIEN_TINH && gioQuet !== null) themKhoi(b.gio[gioQuet], pl, kg);

  const noiGui = String(u.diemGuiDen || '').trim();
  const dt = String(u.duongThuDenMa || '').trim();
  const khoa = `${pl.huong === HUONG.NOI_TINH_HANG_HOAN ? HUONG.NOI_TINH_DEN_BCVH : pl.huong}|${pl.hanHoan ? 'H' : 'T'}|${noiGui}|${dt}`;
  let e = b.duong_thu[khoa];
  if (!e) {
    e = b.duong_thu[khoa] = {
      huong: pl.huong === HUONG.NOI_TINH_HANG_HOAN ? HUONG.NOI_TINH_DEN_BCVH : pl.huong, hang_hoan: pl.hanHoan, noi_gui_ma: noiGui || null, noi_gui_ten: u.diemGuiDenTen || null,
      duong_thu_ma: dt || null, duong_thu_ten: u.duongThuDenTen || null, khoi: khoiMoi(), huong_bcvh: {}, gio_sum: 0, gio_n: 0, gio_min: null, gio_max: null
    };
  }
  if (!e.noi_gui_ten && u.diemGuiDenTen) e.noi_gui_ten = u.diemGuiDenTen;
  if (!e.duong_thu_ten && u.duongThuDenTen) e.duong_thu_ten = u.duongThuDenTen;
  themKhoi(e.khoi, pl, kg);
  if (u.maBcvh) e.huong_bcvh[u.maBcvh] = (e.huong_bcvh[u.maBcvh] || 0) + 1;
  const gs = gioTrongNgayGiay(u.quetDen);
  if (gs !== null) { e.gio_sum += gs; e.gio_n++; e.gio_min = e.gio_min === null ? gs : Math.min(e.gio_min, gs); e.gio_max = e.gio_max === null ? gs : Math.max(e.gio_max, gs); }

  if (u.maBcvh) {
    const c = b.bcvh[u.maBcvh] || (b.bcvh[u.maBcvh] = { shbg: 0, kg: 0, gio_quet: moi24(), gio_xnd: moi24() });
    c.shbg++; c.kg += kg;
    if (gioQuet !== null) c.gio_quet[gioQuet]++;
    const gx = gioCua(u.xndBd10);
    if (gx !== null) c.gio_xnd[gx]++;
  }
}

// ------------------------------------------
// Cộng các bó ngày thành bó khoảng
// ------------------------------------------
function congDuongThu(a, e) {
  const x = a[`${e.huong}|${e.hang_hoan ? 'H' : 'T'}|${e.noi_gui_ma || ''}|${e.duong_thu_ma || ''}`];
  const khoa = `${e.huong}|${e.hang_hoan ? 'H' : 'T'}|${e.noi_gui_ma || ''}|${e.duong_thu_ma || ''}`;
  if (!x) { a[khoa] = { ...e, khoi: sao(e.khoi), huong_bcvh: { ...e.huong_bcvh } }; return; }
  congKhoiThanh(x.khoi, e.khoi);
  for (const [m, n] of Object.entries(e.huong_bcvh)) x.huong_bcvh[m] = (x.huong_bcvh[m] || 0) + n;
  x.gio_sum += e.gio_sum; x.gio_n += e.gio_n;
  if (e.gio_min !== null) x.gio_min = x.gio_min === null ? e.gio_min : Math.min(x.gio_min, e.gio_min);
  if (e.gio_max !== null) x.gio_max = x.gio_max === null ? e.gio_max : Math.max(x.gio_max, e.gio_max);
  if (!x.noi_gui_ten) x.noi_gui_ten = e.noi_gui_ten;
  if (!x.duong_thu_ten) x.duong_thu_ten = e.duong_thu_ten;
}

/** ds: các bó ngày (đã có `ngay`). Trả bó khoảng: cùng cấu trúc, cộng mọi số; `so_ngay_co_du_lieu`, `ngay_dau`, `ngay_cuoi` = cửa sổ thực tế có dữ liệu. */
function congCacNgay(ds) {
  const m = taoNgay(null);
  m.so_ngay_co_du_lieu = 0; m.ngay_dau = null; m.ngay_cuoi = null;
  for (const d of ds) {
    for (const h of KHOA_HUONG) congKhoiThanh(m.huong[h], d.huong[h]);
    for (let i = 0; i < 24; i++) congKhoiThanh(m.gio[i], d.gio[i]);
    for (const e of Object.values(d.duong_thu)) congDuongThu(m.duong_thu, e);
    for (const [ma, c] of Object.entries(d.bcvh)) {
      const x = m.bcvh[ma] || (m.bcvh[ma] = { shbg: 0, kg: 0, gio_quet: moi24(), gio_xnd: moi24() });
      x.shbg += c.shbg; x.kg += c.kg;
      for (let i = 0; i < 24; i++) { x.gio_quet[i] += c.gio_quet[i]; x.gio_xnd[i] += c.gio_xnd[i]; }
    }
    m.bo.khong_ro_dich += d.bo.khong_ro_dich; m.bo.ngoai_nhom_b += d.bo.ngoai_nhom_b;
    if (d.co_du_lieu) { m.co_du_lieu = true; m.so_ngay_co_du_lieu++; m.ngay_dau = m.ngay_dau || d.ngay; m.ngay_cuoi = d.ngay; }
  }
  return m;
}

// ------------------------------------------
// Kết quả của từng endpoint (từ bó khoảng `m` hoặc danh sách bó ngày)
// ------------------------------------------
const congHai = (a, b) => congKhoiThanh(sao(a), b);

/** B1 — thẻ tổng hợp ba hướng. Nội tỉnh đi BCVH có hai cách đếm: không kể hàng hoàn (khớp /luu-thoat `tong`) và có hàng hoàn. */
function tongHop(m) {
  const h = m.huong;
  const coHoan = congHai(h[HUONG.NOI_TINH_DEN_BCVH], h[HUONG.NOI_TINH_HANG_HOAN]);
  const tatCa = congHai(h[HUONG.LIEN_TINH_DEN_BCVH], h[HUONG.NOI_TINH_DEN_BCVH]);
  return {
    lien_tinh_den_bcvh: ketQuaKhoi(h[HUONG.LIEN_TINH_DEN_BCVH]),
    noi_tinh_den_bcvh: { khong_hang_hoan: ketQuaKhoi(h[HUONG.NOI_TINH_DEN_BCVH]), co_hang_hoan: ketQuaKhoi(coHoan), hang_hoan: ketQuaKhoi(h[HUONG.NOI_TINH_HANG_HOAN]) },
    noi_tinh_di_lien_tinh: ketQuaKhoi(h[HUONG.NOI_TINH_DI_LIEN_TINH]),
    bcvh_hue_khong_hang_hoan: ketQuaKhoi(tatCa),
    bo_qua: { khong_ro_dich: m.bo.khong_ro_dich, ngoai_nhom_b: m.bo.ngoai_nhom_b }
  };
}

/** B2 — từng ngày: % cùng ngày của hàng đi 6 BCVH Huế (không kể hàng hoàn), cờ Chủ nhật, cờ đã chốt. */
function theoNgay(dsNgay, daChotTheoNgay) {
  return dsNgay.map((d) => {
    const bcvh = congHai(d.huong[HUONG.LIEN_TINH_DEN_BCVH], d.huong[HUONG.NOI_TINH_DEN_BCVH]);
    return {
      ngay: d.ngay, chu_nhat: laChuNhat(d.ngay), da_chot: !!(daChotTheoNgay && daChotTheoNgay[d.ngay]), co_du_lieu: d.co_du_lieu,
      bcvh_hue: ketQuaKhoi(bcvh),
      lien_tinh_den_bcvh: ketQuaKhoi(d.huong[HUONG.LIEN_TINH_DEN_BCVH]), noi_tinh_den_bcvh: ketQuaKhoi(d.huong[HUONG.NOI_TINH_DEN_BCVH]),
      hang_hoan: ketQuaKhoi(d.huong[HUONG.NOI_TINH_HANG_HOAN]), noi_tinh_di_lien_tinh: ketQuaKhoi(d.huong[HUONG.NOI_TINH_DI_LIEN_TINH])
    };
  });
}

/** B2 phụ — trung bình Chủ nhật so với ngày thường (chỉ ngày có dữ liệu và đã có mẫu số). */
function soSanhChuNhat(ds) {
  const gom = (cn) => {
    const x = ds.filter((d) => d.chu_nhat === cn && d.bcvh_hue.mau_so > 0);
    const tu = x.reduce((s, d) => s + d.bcvh_hue.cung_ngay, 0);
    const mau = x.reduce((s, d) => s + d.bcvh_hue.mau_so, 0);
    const tb = x.length ? x.reduce((s, d) => s + d.bcvh_hue.ty_le.cung_ngay, 0) / x.length : null;
    return { so_ngay: x.length, cung_ngay: tu, mau_so: mau, ty_le_gop: ty(tu, mau), ty_le_trung_binh_ngay: tb };
  };
  return { chu_nhat: gom(true), ngay_thuong: gom(false) };
}

/** B3 — theo giờ của giờ quét túi đến (0..23): số bưu gửi từng nhóm đi và % cùng ngày. */
function theoGio(m) {
  return m.gio.map((k, gio) => ({ gio, ...ketQuaKhoi(k) }));
}

/** B3 phụ — tách trước 12 giờ / từ 12 giờ (giờ quét túi đến), cùng cách đếm như theoGio. */
function chia12h(m) {
  const truoc = khoiMoi();
  const tu = khoiMoi();
  m.gio.forEach((k, i) => congKhoiThanh(i < 12 ? truoc : tu, k));
  return { truoc_12h: ketQuaKhoi(truoc), tu_12h: ketQuaKhoi(tu) };
}

function nhanDuongThu(e) { return e.duong_thu_ma ? (e.duong_thu_ten || '(chưa có tên)') : '(không rõ đường thư)'; }

/** Hai BCVH nhận nhiều nhất của đường thư: [{ ma_bcvh, shbg, ty_le }]. */
function dichChinh(huongBcvh, top = 2) {
  const tong = Object.values(huongBcvh).reduce((s, n) => s + n, 0);
  return Object.entries(huongBcvh).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1)).slice(0, top).map(([ma, n]) => ({ ma_bcvh: ma, shbg: n, ty_le: ty(n, tong) }));
}

/** Hàng rớt lại: đường thư Cấp 1 lớn nhất đi 6 BCVH Huế (gộp mọi nơi gửi cùng đường thư; không kể hàng hoàn). Sắp theo tổng bưu gửi giảm dần. */
function rotLaiTheoDuongThu(m, top = 8) {
  const gom = new Map();
  for (const e of Object.values(m.duong_thu)) {
    if (e.huong !== HUONG.LIEN_TINH_DEN_BCVH) continue;
    const key = e.duong_thu_ma || '';
    let g = gom.get(key);
    if (!g) { g = { duong_thu_ma: e.duong_thu_ma, duong_thu_ten: e.duong_thu_ten, khoi: khoiMoi(), huong_bcvh: {} }; gom.set(key, g); }
    if (!g.duong_thu_ten) g.duong_thu_ten = e.duong_thu_ten;
    congKhoiThanh(g.khoi, e.khoi);
    for (const [ma, n] of Object.entries(e.huong_bcvh)) g.huong_bcvh[ma] = (g.huong_bcvh[ma] || 0) + n;
  }
  const dong = [...gom.values()].map((g) => ({ ...g, k: ketQuaKhoi(g.khoi) })).sort((a, b) => (b.k.tong_shbg - a.k.tong_shbg) || String(a.duong_thu_ma).localeCompare(String(b.duong_thu_ma)));
  const lay = dong.slice(0, top);
  const hang = (g) => ({
    duong_thu_ma: g.duong_thu_ma, duong_thu_ten: nhanDuongThu(g), ...g.k, dich_chinh: dichChinh(g.huong_bcvh)
  });
  const cong = lay.reduce((s, g) => congKhoiThanh(s, g.khoi), khoiMoi());
  const tongLienTinh = dong.reduce((s, g) => congKhoiThanh(s, g.khoi), khoiMoi());
  return {
    top, so_duong_thu: dong.length, dong: lay.map(hang),
    cong_top: ketQuaKhoi(cong), tong_lien_tinh_den_bcvh: ketQuaKhoi(tongLienTinh)
  };
}

/** B5 — theo (nơi gửi, đường thư đến), ba mục như canvas. Dòng của hàng hoàn có `hang_hoan: true`. */
function theoDuongThu(m, tops = {}) {
  const gioTb = (e) => (e.gio_n > 0 ? e.gio_sum / e.gio_n : null);
  const muc = (huong, top) => {
    const ds = Object.values(m.duong_thu).filter((e) => e.huong === huong).map((e) => ({ e, k: ketQuaKhoi(e.khoi) })).sort((a, b) => (b.k.tong_shbg - a.k.tong_shbg) || String(a.e.duong_thu_ma).localeCompare(String(b.e.duong_thu_ma)) || String(a.e.noi_gui_ma).localeCompare(String(b.e.noi_gui_ma)));
    const lay = ds.slice(0, top);
    return {
      top, so_dong: ds.length,
      dong: lay.map(({ e, k }) => ({
        noi_gui_ma: e.noi_gui_ma, noi_gui_ten: e.noi_gui_ten, duong_thu_ma: e.duong_thu_ma, duong_thu_ten: nhanDuongThu(e), hang_hoan: e.hang_hoan,
        gio_nhan_tb: gioTb(e) === null ? null : hhmm(gioTb(e)), gio_nhan_som_nhat: e.gio_min === null ? null : hhmm(e.gio_min), gio_nhan_muon_nhat: e.gio_max === null ? null : hhmm(e.gio_max), ...k
      })),
      cong: ketQuaKhoi(lay.reduce((s, { e }) => (e.hang_hoan ? s : congKhoiThanh(s, e.khoi)), khoiMoi())) // hàng hoàn Tổ KHHH hiện riêng, không cộng vào tổng
    };
  };
  return {
    lien_tinh_den_bcvh: muc(HUONG.LIEN_TINH_DEN_BCVH, tops.lien_tinh_den_bcvh || 8),
    noi_tinh_den_bcvh: muc(HUONG.NOI_TINH_DEN_BCVH, tops.noi_tinh_den_bcvh || 8),
    noi_tinh_di_lien_tinh: muc(HUONG.NOI_TINH_DI_LIEN_TINH, tops.noi_tinh_di_lien_tinh || 4)
  };
}

module.exports = {
  HUONG, KHOA_HUONG, CAC_NHOM, KHOA_PHU, phanLoaiDi, nhomTheoNgayDi, nhomChuaDi, khoiMoi, themKhoi, ketQuaKhoi, taoNgay, themShbg, congCacNgay,
  tongHop, theoNgay, soSanhChuNhat, theoGio, chia12h, rotLaiTheoDuongThu, theoDuongThu, dichChinh, nhanDuongThu, hhmm, laChuNhat, r3, ty
};
