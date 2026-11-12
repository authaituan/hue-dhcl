// ==========================================
// «Hàng tại KTT» — KTT-DC-1: tab «Hướng đóng chuyến nội tỉnh». Hàng nội tỉnh đến 6 BCVH Huế (tập của mục 2 màn B, hướng `noi_tinh_den_bcvh`, không kể hàng hoàn)
// chia theo NƠI ĐÓNG CHUYẾN THƯ (`ktt_tui.from_pos` ≙ `Mailtrip.StartingCode`, đã kiểm ở KTT-DT-4):
//   N1 = chỉ có túi CHUYEN_TIEP_DI (đóng thẳng BCVH) · N2 = có túi DEN vào 530100 (Khai thác khai thác lại) · N3 = có cả hai loại túi (chưa rõ, đếm riêng).
// KHÔNG viết lại lõi: dùng `kttDiNgayQuery.chayShbg` (cùng tập, cùng «ngày hàng đến» như màn mục 2 B: `u.ngayDen = ngayCuaGio(quetDen || xndBd10)`, kttQuery.js dòng 307,
// theo KTT-DT-5b — KHÔNG đổi sang ngày đóng chuyến thư). Số liệu MỖI NGÀY là một «bó» JSON cộng được (như kttDiNgay.taoNgay), cache theo ngày ở kttApi.js.
// CHỈ ĐỌC DB. Không có tên người, địa chỉ, số điện thoại. Số hiệu bưu gửi chỉ có trong `rows` của bó (danh sách / xlsx chi tiết), không trong khối tổng hợp.
// Tài liệu: docs/ai/42_KTT_API.md mục 23.
// ==========================================
'use strict';
const DQ = require('./kttDiNgayQuery');
const D = require('./kttDiNgay');
const Q = require('./kttQuery');
const { MA_BCVH_HUE, MA_KTT } = require('./kttTinh');

const NGAY_LECH_CU = 7; // chuyen_ghi_ngay_cu khi (ngày hàng đến − ngày đóng chuyến) > 7 ngày (KTT-DT-5b)
const NGUONG_IT_MAU = 20; // (N1 + N2) < 20 -> it_mau, ty_le = null
const LOAI_HINH = Object.freeze(['GD1', 'GD2_GD3', 'VHX', '531120', 'KHAC']);
const MA_KHACH_HANG_LON = '531120';
const MA_BCVH_LOAI = MA_BCVH_HUE; // MỘT nơi duy nhất định nghĩa 6 BCVH (kttTinh.js); không viết cứng thêm chỗ thứ hai

const diffNgay = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const r1 = (x) => Math.round(x * 10) / 10;
const chuoi = (x) => (x === null || x === undefined ? '' : String(x).trim());
const maChuyen = (t) => [t.from_pos, t.to_pos, t.mail_trip_type, t.service_code, t.year, t.mail_trip_number].join('|');

/** Nhóm loại hình của một nơi đóng: 531120 riêng; GD1; GD2 + GD3; VHX; còn lại (kể cả mã không có trong danh mục) = KHAC. */
function nhomLoaiHinh(ma, loai) {
  if (ma === MA_KHACH_HANG_LON) return '531120';
  if (loai === 'GD1') return 'GD1';
  if (loai === 'GD2' || loai === 'GD3') return 'GD2_GD3';
  if (loai === 'VHX') return 'VHX';
  return 'KHAC';
}

// ------------------------------------------
// Bó một ngày
// ------------------------------------------
const noiMoi = () => ({ n1: 0, n2: 0, n3: 0, kg_n2: 0, cu: 0, sv: {}, bc: {}, lan: [], chuyen: [] });

/**
 * Bó số liệu MỘT ngày hàng đến: { ngay, co_du_lieu, tong: { tong, n1, n2, n3 }, noi: { [from_pos]: {...} }, rows: [dòng N2 / N3] }.
 * `chuyen` (khóa Mailtrip 6 cột: from, to, loại, dịch vụ, ngày, số) = MỌI chuyến thư DEN vào 530100 có túi đến ngày này; `lan` ⊂ `chuyen` = chuyến chứa ≥ 1 bưu gửi N2 / N3.
 */
function tinhNgay(db, ngay, bayGio) {
  const b = { ngay, co_du_lieu: false, tong: { tong: 0, n1: 0, n2: 0, n3: 0 }, noi: {}, rows: [] };
  const tuiQ = db.prepare('SELECT from_pos, to_pos, mail_trip_type, service_code, year, mail_trip_number, chuyen_thu_gio_dong FROM ktt_tui WHERE id = ?');
  const svQ = db.prepare('SELECT dich_vu_code, ten_dich_vu FROM ktt_buu_gui WHERE shbg = ? LIMIT 1');
  const e = (f) => b.noi[f] || (b.noi[f] = noiMoi());
  const lan = new Map(); // from_pos -> Set(khóa chuyến)
  DQ.chayShbg(db, { tuNgay: ngay, denNgay: ngay, bayGio }, (u, kq, pl) => {
    if (pl.bo || pl.huong !== D.HUONG.NOI_TINH_DEN_BCVH) return; // đúng tập «nội tỉnh đến 6 BCVH», không kể hàng hoàn (như D.tongHop().noi_tinh_den_bcvh.khong_hang_hoan)
    b.co_du_lieu = true;
    b.tong.tong++;
    const loai = u.coCaHaiLoaiTui ? 'N3' : (u.nguonHang === Q.NGUON_HANG.KHAI_THAC ? 'N2' : 'N1');
    const t = u.tuiDenId ? tuiQ.get(u.tuiDenId) : null;
    const from = chuoi(t && t.from_pos);
    const o = e(from);
    if (loai === 'N1') { b.tong.n1++; o.n1++; return; }
    if (loai === 'N3') { b.tong.n3++; o.n3++; } else { b.tong.n2++; o.n2++; o.kg_n2 += (typeof u.gam === 'number' ? u.gam : 0) / 1000; }
    const sv = svQ.get(u.shbg) || {};
    const dong = t && t.chuyen_thu_gio_dong ? String(t.chuyen_thu_gio_dong).slice(0, 10) : null;
    const cu = !!dong && diffNgay(u.ngayDen, dong) > NGAY_LECH_CU;
    const khoa = t ? maChuyen(t) : null;
    if (loai === 'N2') {
      const k = `${chuoi(sv.dich_vu_code)}|${chuoi(sv.ten_dich_vu)}`; o.sv[k] = (o.sv[k] || 0) + 1;
      const bc = chuoi(u.maBcvh); o.bc[bc] = (o.bc[bc] || 0) + 1;
      if (cu) o.cu++;
    }
    if (khoa) { if (!lan.has(from)) lan.set(from, new Set()); lan.get(from).add(khoa); }
    b.rows.push({
      shbg: u.shbg, ngay_den: u.ngayDen, ngay_dong: dong, cu, noi: from, chuyen: khoa, so_chuyen: t ? chuoi(t.mail_trip_number) : '',
      loai_chuyen: t ? chuoi(t.mail_trip_type) : '', nam_chuyen: t ? chuoi(t.year) : '', dv_chuyen: t ? chuoi(t.service_code) : '',
      bcvh: chuoi(u.maBcvh), dv: chuoi(sv.dich_vu_code), dv_ten: chuoi(sv.ten_dich_vu), kg: typeof u.gam === 'number' ? Math.round(u.gam) / 1000 : null, chua_ro: loai === 'N3'
    });
  });
  // mọi chuyến thư DEN vào 530100 có túi đến trong ngày (kể cả chuyến không có hàng nội tỉnh)
  const tuGio = `${ngay} 00:00:00`; const denGio = `${Q.ngayKeTiep(ngay)} 00:00:00`;
  const ts = db.prepare(`SELECT DISTINCT from_pos, to_pos, mail_trip_type, service_code, year, mail_trip_number FROM ktt_tui WHERE +chieu = 'DEN' AND to_pos = @ktt AND ((gio_quet_tui_den >= @tu AND gio_quet_tui_den < @den) OR (gio_quet_tui_den IS NULL AND bd10_den_xnd >= @tu AND bd10_den_xnd < @den))`).all({ ktt: MA_KTT, tu: tuGio, den: denGio });
  const chuyen = new Map();
  for (const t of ts) { const f = chuoi(t.from_pos); if (!chuyen.has(f)) chuyen.set(f, new Set()); chuyen.get(f).add(maChuyen(t)); }
  for (const [f, s] of lan) { if (!chuyen.has(f)) chuyen.set(f, new Set()); for (const k of s) chuyen.get(f).add(k); } // bảo đảm lan ⊂ chuyen
  for (const [f, s] of chuyen) e(f).chuyen = [...s];
  for (const [f, s] of lan) b.noi[f].lan = [...s];
  if (ts.length) b.co_du_lieu = true;
  return b;
}

/** Bó rỗng của một ngày chưa có dữ liệu (chưa nạp cặp nào). */
const boRong = (ngay) => ({ ngay, co_du_lieu: false, tong: { tong: 0, n1: 0, n2: 0, n3: 0 }, noi: {}, rows: [] });

// ------------------------------------------
// Tổng hợp một khoảng
// ------------------------------------------
/**
 * ds: các bó ngày; danhMuc: { [mã]: { ten, loai, bdx } } (post_offices); loaiHinh: null | một giá trị của LOAI_HINH.
 * Trả { meta, theo_noi_dong, theo_loai_hinh, theo_ngay } (phần đầu chung — khoảng ngày, độ mới — do kttApi thêm).
 */
function tongHop(ds, danhMuc, loaiHinh = null) {
  const tong = { tong: 0, n1: 0, n2: 0, n3: 0 };
  const loai = new Set(MA_BCVH_LOAI);
  let do6 = 0; let cu6 = 0;
  const gop = new Map(); // from_pos -> số liệu cộng
  for (const d of ds) {
    for (const k of Object.keys(tong)) tong[k] += d.tong[k];
    for (const [f, o] of Object.entries(d.noi)) {
      if (loai.has(f)) { do6 += o.n2; cu6 += o.cu; continue; }
      const g = gop.get(f) || { f, n1: 0, n2: 0, n3: 0, kg: 0, cu: 0, sv: {}, bc: {}, lan: new Set(), chuyen: new Set(), ngayN2: 0, ngayCaHai: 0 };
      g.n1 += o.n1; g.n2 += o.n2; g.n3 += o.n3; g.kg += o.kg_n2; g.cu += o.cu;
      for (const [k, v] of Object.entries(o.sv)) g.sv[k] = (g.sv[k] || 0) + v;
      for (const [k, v] of Object.entries(o.bc)) g.bc[k] = (g.bc[k] || 0) + v;
      for (const k of o.lan) g.lan.add(k);
      for (const k of o.chuyen) g.chuyen.add(k);
      if (o.n2 > 0) g.ngayN2++;
      if (o.n2 > 0 && o.n1 > 0) g.ngayCaHai++;
      gop.set(f, g);
    }
  }
  const tenBcvh = DQ.TEN_BCVH;
  const dm = (f) => danhMuc[f] || null;
  const nhomCua = (f) => nhomLoaiHinh(f, dm(f) ? dm(f).loai : null);
  const trongLoc = (f) => loaiHinh === null || nhomCua(f) === loaiHinh;
  const top1 = (m, tao) => { const a = Object.entries(m).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]; return a ? tao(a[0], a[1]) : null; };
  const dongNoi = [];
  for (const g of gop.values()) {
    if (g.n2 === 0 && g.n3 === 0 && !g.lan.size) continue;
    if (g.n2 === 0) continue; // bảng chỉ liệt kê nơi có hàng đóng vào 530100 (N2 > 0)
    if (!trongLoc(g.f)) continue;
    const p = dm(g.f);
    const itMau = g.n1 + g.n2 < NGUONG_IT_MAU;
    dongNoi.push({
      ma: g.f, ten: p ? p.ten : null, loai_hinh: p ? p.loai : null, nhom_loai_hinh: nhomCua(g.f), bdx: p ? p.bdx : null,
      dong_vao_530100: g.n2, dong_thang_bcvh: g.n1, chua_ro: g.n3,
      ty_le: itMau ? null : g.n2 / (g.n1 + g.n2), it_mau: itMau,
      chuyen_vao_530100: g.chuyen.size, chuyen_co_lan: g.lan.size, ngay_co_dong_vao_530100: g.ngayN2, ngay_dong_ca_hai_kieu: g.ngayCaHai,
      kg: Math.round(g.kg * 10) / 10,
      dich_vu_nhieu_nhat: top1(g.sv, (k, so) => { const [ma, ten] = k.split('|'); return { ma: ma || null, ten: ten || null, so }; }),
      bcvh_dich_nhieu_nhat: top1(g.bc, (k, so) => ({ ma: k || null, ten: tenBcvh[k] || null, so })),
      dong_chuyen_ghi_ngay_cu: g.cu
    });
  }
  dongNoi.sort((a, b) => b.dong_vao_530100 - a.dong_vao_530100 || (a.ma < b.ma ? -1 : 1));
  const theoLoaiMap = Object.fromEntries(LOAI_HINH.map((l) => [l, { nhom: l, dong_vao_530100: 0, so_noi: 0 }]));
  for (const r of dongNoi) { const x = theoLoaiMap[r.nhom_loai_hinh]; x.dong_vao_530100 += r.dong_vao_530100; x.so_noi++; }
  const theoLoai = (loaiHinh === null ? LOAI_HINH : [loaiHinh]).map((l) => theoLoaiMap[l]);
  const theoNgay = ds.map((d) => {
    let dv = 0; let so = 0; const lan = new Set();
    for (const [f, o] of Object.entries(d.noi)) {
      if (loai.has(f) || !trongLoc(f) || o.n2 === 0) continue;
      dv += o.n2; so++; for (const k of o.lan) lan.add(k);
    }
    return { ngay: d.ngay, dong_vao_530100: dv, chuyen_co_lan: lan.size, so_noi_dong: so };
  });
  const tongDong = dongNoi.reduce((s, r) => s + r.dong_vao_530100, 0);
  const n2ToanTap = tong.n2 - do6;
  const soChuyenCu = dongNoi.reduce((s, r) => s + r.dong_chuyen_ghi_ngay_cu, 0);
  // số chuyến lẫn / vào 530100 toàn khoảng (không tính 6 BCVH, theo bộ lọc): hợp các chuyến, không cộng theo nơi để chuyến nhiều ngày không bị đếm đôi
  const lanAll = new Set(); const chuyenAll = new Set();
  for (const g of gop.values()) { if (!trongLoc(g.f)) continue; for (const k of g.lan) lanAll.add(k); for (const k of g.chuyen) chuyenAll.add(k); }
  const meta = {
    cach_tinh_ngay: { ten: 'ngay_hang_den', mo_ta: 'Ngày hàng đến Khai thác như màn mục 2 «Nội tỉnh đến → 6 BCVH Huế»: ngày của giờ quét túi đến, thiếu thì ngày xác nhận BD10 đến (KTT-DT-5b). Không dùng ngày đóng chuyến thư.', cot_db: 'ktt_tui.gio_quet_tui_den, thiếu thì ktt_tui.bd10_den_xnd' },
    noi_dong: 'ktt_tui.from_pos (≙ Mailtrip.StartingCode), chuyến thư = khóa 6 cột (from_pos, to_pos, mail_trip_type, service_code, year, mail_trip_number)',
    bcvh_da_loai: MA_BCVH_LOAI.map((m) => ({ ma: m, ten: tenBcvh[m] || null })),
    loc: { loai_hinh: loaiHinh },
    tong_noi_tinh: tong.tong, n1: tong.n1, n2: tong.n2, n3: tong.n3,
    do_6_bcvh_dong: do6, dong_vao_530100: tongDong, dong_vao_530100_toan_tap: n2ToanTap, so_noi_dong: dongNoi.length,
    so_chuyen_vao_530100: chuyenAll.size, so_chuyen_co_lan: lanAll.size,
    so_chuyen_ghi_ngay_cu: soChuyenCu, so_chuyen_ghi_ngay_cu_ca_6_bcvh: soChuyenCu + (loaiHinh === null ? cu6 : 0),
    ghi_chu: [
      'Hàng «chưa rõ» (N3, có cả túi vào 530100 lẫn túi chuyển tiếp) KHÔNG cộng vào số hàng đóng vào 530100; vẫn tính chuyến chứa nó là «chuyến có lẫn».',
      'Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc (nơi gom, chặng sau). 6 BCVH không liệt kê làm nơi đóng; số của 6 BCVH nằm ở meta.do_6_bcvh_dong.',
      '«Ngày đóng cả hai kiểu» = số ngày trong khoảng nơi đó vừa có hàng đóng thẳng BCVH vừa có hàng đóng vào 530100. Tỷ lệ chỉ tính khi (đóng thẳng + đóng vào) ≥ 20.',
      'Cờ chuyen_ghi_ngay_cu = ngày hàng đến cách ngày đóng chuyến thư hơn 7 ngày (nghi ghi nhận chậm); không dùng nhóm này để nhắc đơn vị.'
    ]
  };
  return { meta, theo_noi_dong: dongNoi, theo_loai_hinh: theoLoai, theo_ngay: theoNgay };
}

// ------------------------------------------
// Danh sách bưu gửi của một nơi
// ------------------------------------------
/** Các dòng (N2 hoặc N3) của một nơi đóng trong các bó ngày, sắp theo (ngày hàng đến, số hiệu). */
function dongCuaNoi(ds, ma, { chua_ro = false, chiCu = false } = {}) {
  const out = [];
  for (const d of ds) for (const r of d.rows) { if (r.noi !== ma || r.chua_ro !== chua_ro) continue; if (chiCu && !r.cu) continue; out.push(r); }
  out.sort((a, b) => (a.ngay_den < b.ngay_den ? -1 : a.ngay_den > b.ngay_den ? 1 : a.shbg < b.shbg ? -1 : a.shbg > b.shbg ? 1 : 0));
  return out;
}
/** Một dòng JSON của danh sách (không có tên, địa chỉ, số điện thoại). */
function dongApi(r, danhMuc) {
  const p = danhMuc[r.noi] || null;
  return {
    shbg: r.shbg, ngay_den: r.ngay_den, ngay_dong_chuyen: r.ngay_dong, chuyen_ghi_ngay_cu: r.cu, so_chuyen_thu: r.so_chuyen || null,
    ma_noi_dong: r.noi, ten_noi_dong: p ? p.ten : null, bcvh_dich: { ma: r.bcvh || null, ten: DQ.TEN_BCVH[r.bcvh] || null },
    dich_vu: { ma: r.dv || null, ten: r.dv_ten || null }, kg: r.kg, chua_ro: r.chua_ro
  };
}

/** Đọc danh mục bưu cục: { [mã]: { ten, loai, bdx } }. Mã không có -> không có khóa (tên null). */
function docDanhMuc(db) {
  const m = {};
  try {
    for (const r of db.prepare('SELECT p.code AS ma, p.name AS ten, p.type AS loai, c.name AS bdx FROM post_offices p LEFT JOIN commune_post_offices c ON c.id = p.commune_id').all()) m[chuoi(r.ma)] = { ten: r.ten || null, loai: r.loai || null, bdx: r.bdx || null };
  } catch (e) { /* chưa có bảng danh mục: để tên null */ }
  return m;
}

module.exports = { tinhNgay, boRong, tongHop, dongCuaNoi, dongApi, docDanhMuc, nhomLoaiHinh, LOAI_HINH, MA_BCVH_LOAI, NGAY_LECH_CU, NGUONG_IT_MAU };
