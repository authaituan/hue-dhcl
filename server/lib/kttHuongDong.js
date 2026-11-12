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
const CFG = require('../config/ktt-huong-dong');

const NGAY_LECH_CU = 7; // chuyen_ghi_ngay_cu khi (ngày hàng đến − ngày đóng chuyến) > 7 ngày (KTT-DT-5b)
const NGUONG_IT_MAU = 20; // (N1 + N2) < 20 -> it_mau, ty_le = null
const LOAI_HINH = Object.freeze(['GD1', 'GD2_GD3', 'VHX', '531120', 'KHAC']);
const MA_KHACH_HANG_LON = '531120';
const MA_BCVH_LOAI = MA_BCVH_HUE; // MỘT nơi duy nhất định nghĩa 6 BCVH (kttTinh.js); không viết cứng thêm chỗ thứ hai
/** KTT-DC-3: «túi lớn» = số BG nội tỉnh trong túi TỪ ngưỡng trở lên. MỘT chỗ duy nhất: đổi sang «lớn hơn ngưỡng» chỉ cần sửa dấu ở dòng này (>= thành >). */
const laTuiLon = (soBg, nguong) => soBg >= nguong;

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
// `tui`: các túi có ≥ 1 bưu gửi N2 của nơi này trong ngày: [số BG nội tỉnh trong túi (N2 + N3), số BG N2 của túi, khóa chuyến thư của túi] — kích thước túi tính MỘT lần ở đây, ngưỡng áp lúc trả lời.
const noiMoi = () => ({ n1: 0, n2: 0, n3: 0, kg_n2: 0, cu: 0, sv: {}, bc: {}, lan: [], chuyen: [], tui: [] });

/**
 * Bó số liệu MỘT ngày hàng đến: { ngay, co_du_lieu, tong: { tong, n1, n2, n3 }, noi: { [from_pos]: {...} }, rows: [dòng N2 / N3] }.
 * `chuyen` (khóa Mailtrip 6 cột: from, to, loại, dịch vụ, ngày, số) = MỌI chuyến thư DEN vào 530100 có túi đến ngày này; `lan` ⊂ `chuyen` = chuyến chứa ≥ 1 bưu gửi N2 / N3.
 */
function tinhNgay(db, ngay, bayGio) {
  const b = { ngay, co_du_lieu: false, tong: { tong: 0, n1: 0, n2: 0, n3: 0 }, noi: {}, rows: [] };
  const tuiQ = db.prepare('SELECT from_pos, to_pos, mail_trip_type, service_code, year, mail_trip_number, post_bag_index, so_hieu_bd8, chuyen_thu_gio_dong FROM ktt_tui WHERE id = ?');
  const svQ = db.prepare('SELECT dich_vu_code, ten_dich_vu FROM ktt_buu_gui WHERE shbg = ? LIMIT 1');
  const e = (f) => b.noi[f] || (b.noi[f] = noiMoi());
  const lan = new Map(); // from_pos -> Set(khóa chuyến)
  const tuiMap = new Map(); // khóa túi (id dòng ktt_tui của túi đến; thiếu thì 'x:<shbg>') -> { from, size, n2, chuyen }
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
    const tuiKey = u.tuiDenId ? String(u.tuiDenId) : `x:${u.shbg}`;
    let ti = tuiMap.get(tuiKey);
    if (!ti) { ti = { from, size: 0, n2: 0, chuyen: khoa }; tuiMap.set(tuiKey, ti); }
    ti.size++; if (loai === 'N2') ti.n2++; // cỡ túi = BG nội tỉnh N2 + N3 trong túi (PO chốt 12/11/2026)
    if (loai === 'N2') {
      const k = `${chuoi(sv.dich_vu_code)}|${chuoi(sv.ten_dich_vu)}`; o.sv[k] = (o.sv[k] || 0) + 1;
      const bc = chuoi(u.maBcvh); o.bc[bc] = (o.bc[bc] || 0) + 1;
      if (cu) o.cu++;
    }
    if (khoa) { if (!lan.has(from)) lan.set(from, new Set()); lan.get(from).add(khoa); }
    b.rows.push({
      shbg: u.shbg, ngay_den: u.ngayDen, ngay_dong: dong, cu, noi: from, chuyen: khoa, so_chuyen: t ? chuoi(t.mail_trip_number) : '',
      loai_chuyen: t ? chuoi(t.mail_trip_type) : '', nam_chuyen: t ? chuoi(t.year) : '', dv_chuyen: t ? chuoi(t.service_code) : '',
      bcvh: chuoi(u.maBcvh), dv: chuoi(sv.dich_vu_code), dv_ten: chuoi(sv.ten_dich_vu), kg: typeof u.gam === 'number' ? Math.round(u.gam) / 1000 : null, chua_ro: loai === 'N3',
      tui_k: tuiKey, ma_tui: t ? chuoi(t.so_hieu_bd8) : '', khoa_tui: t ? `${maChuyen(t)}|${chuoi(t.post_bag_index)}` : '', bg_tui: 0
    });
  });
  for (const r of b.rows) r.bg_tui = tuiMap.get(r.tui_k).size;
  for (const ti of tuiMap.values()) if (ti.n2 > 0) e(ti.from).tui.push([ti.size, ti.n2, ti.chuyen]);
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
function tongHop(ds, danhMuc, loaiHinh = null, nguong = CFG.NGUONG_BG_TRONG_TUI) {
  const tong = { tong: 0, n1: 0, n2: 0, n3: 0 };
  const loai = new Set(MA_BCVH_LOAI);
  let do6 = 0; let cu6 = 0;
  const gop = new Map(); // from_pos -> số liệu cộng
  for (const d of ds) {
    for (const k of Object.keys(tong)) tong[k] += d.tong[k];
    for (const [f, o] of Object.entries(d.noi)) {
      if (loai.has(f)) { do6 += o.n2; cu6 += o.cu; continue; }
      const g = gop.get(f) || { f, n1: 0, n2: 0, n3: 0, kg: 0, cu: 0, sv: {}, bc: {}, lan: new Set(), chuyen: new Set(), ngayN2: 0, ngayCaHai: 0, lon: 0, soTuiLon: 0, chuyenLon: new Set(), tuiMax: 0 };
      g.n1 += o.n1; g.n2 += o.n2; g.n3 += o.n3; g.kg += o.kg_n2; g.cu += o.cu;
      for (const [k, v] of Object.entries(o.sv)) g.sv[k] = (g.sv[k] || 0) + v;
      for (const [k, v] of Object.entries(o.bc)) g.bc[k] = (g.bc[k] || 0) + v;
      for (const k of o.lan) g.lan.add(k);
      for (const k of o.chuyen) g.chuyen.add(k);
      for (const [size, n2, ck] of o.tui) {
        if (size > g.tuiMax) g.tuiMax = size;
        if (laTuiLon(size, nguong)) { g.lon += n2; g.soTuiLon++; if (ck) g.chuyenLon.add(ck); }
      }
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
      dong_chuyen_ghi_ngay_cu: g.cu,
      bg_trong_tui_lon: g.lon, bg_trong_tui_nho: g.n2 - g.lon, so_tui_lon: g.soTuiLon, chuyen_co_tui_lon: g.chuyenLon.size, so_bg_tui_lon_nhat: g.tuiMax
    });
  }
  dongNoi.sort((a, b) => b.dong_vao_530100 - a.dong_vao_530100 || (a.ma < b.ma ? -1 : 1));
  const theoLoaiMap = Object.fromEntries(LOAI_HINH.map((l) => [l, { nhom: l, dong_vao_530100: 0, so_noi: 0, bg_trong_tui_lon: 0, so_noi_dong_tui_lon: 0 }]));
  for (const r of dongNoi) { const x = theoLoaiMap[r.nhom_loai_hinh]; x.dong_vao_530100 += r.dong_vao_530100; x.so_noi++; x.bg_trong_tui_lon += r.bg_trong_tui_lon; if (r.bg_trong_tui_lon > 0) x.so_noi_dong_tui_lon++; }
  const theoLoai = (loaiHinh === null ? LOAI_HINH : [loaiHinh]).map((l) => theoLoaiMap[l]);
  const theoNgay = ds.map((d) => {
    let dv = 0; let so = 0; const lan = new Set(); let lon = 0; let noiLon = 0;
    for (const [f, o] of Object.entries(d.noi)) {
      if (loai.has(f) || !trongLoc(f) || o.n2 === 0) continue;
      dv += o.n2; so++; for (const k of o.lan) lan.add(k);
      let l = 0; for (const [size, n2] of o.tui) if (laTuiLon(size, nguong)) l += n2;
      lon += l; if (l > 0) noiLon++;
    }
    return { ngay: d.ngay, dong_vao_530100: dv, chuyen_co_lan: lan.size, so_noi_dong: so, bg_trong_tui_lon: lon, so_noi_dong_tui_lon: noiLon };
  });
  const tongDong = dongNoi.reduce((s, r) => s + r.dong_vao_530100, 0);
  const n2ToanTap = tong.n2 - do6;
  const soHangCu = dongNoi.reduce((s, r) => s + r.dong_chuyen_ghi_ngay_cu, 0);
  // KTT-DC-2: số CHUYẾN THƯ khác nhau có ≥ 1 bưu gửi N2 mang cờ ngày cũ (cùng phạm vi bảng: không 6 BCVH, theo bộ lọc); khóa chuyến = khóa 6 cột nên chuyến nhiều ngày không bị đếm đôi
  const trongBang = new Set(dongNoi.map((r) => r.ma));
  const chuyenCu = new Set();
  for (const d of ds) for (const r of d.rows) if (r.cu && !r.chua_ro && r.chuyen && trongBang.has(r.noi)) chuyenCu.add(r.chuyen);
  // «Chuyến lẫn» (KTT-DC-2, docs/ai/42 mục 23): chuyến thư vào 530100 có ≥ 1 bưu gửi nội tỉnh đến 6 BCVH N2 hoặc N3, của các nơi LIỆT KÊ trong bảng (không 6 BCVH, có N2 > 0, theo bộ lọc).
  // Nơi chỉ có N3 không có trong bảng nên chuyến của nó không tính — để Σ cột chuyen_co_lan của bảng = meta = trong_loc. Hợp các chuyến, không cộng theo nơi để chuyến nhiều ngày không bị đếm đôi.
  // «Chuyến vào 530100» (so_chuyen_vao_530100) thì vẫn tính MỌI nơi đóng không phải 6 BCVH thuộc nhóm đang lọc (kể cả nơi không có hàng nội tỉnh), nên lớn hơn Σ cột bảng.
  const lanAll = new Set(); const chuyenAll = new Set();
  for (const g of gop.values()) {
    if (!trongLoc(g.f)) continue;
    for (const k of g.chuyen) chuyenAll.add(k);
    if (g.n2 > 0) for (const k of g.lan) lanAll.add(k);
  }
  const top8 = dongNoi.slice(0, 8).reduce((s, r) => s + r.dong_vao_530100, 0);
  // KTT-DC-3: số theo «túi lớn» (cùng phạm vi bảng: không 6 BCVH, theo bộ lọc). Tỷ trọng 8 nơi đầu xếp theo bg_trong_tui_lon; null khi không có hàng trong túi lớn hoặc chỉ có ≤ 8 nơi có túi lớn (khi đó luôn = 100%).
  const bgLon = dongNoi.reduce((s, r) => s + r.bg_trong_tui_lon, 0);
  const bgNho = dongNoi.reduce((s, r) => s + r.bg_trong_tui_nho, 0);
  const soTuiLon = dongNoi.reduce((s, r) => s + r.so_tui_lon, 0);
  const noiLon = dongNoi.filter((r) => r.bg_trong_tui_lon > 0);
  const top8Lon = noiLon.map((r) => r.bg_trong_tui_lon).sort((a, b) => b - a).slice(0, 8).reduce((s, x) => s + x, 0);
  const tyTop8Lon = bgLon > 0 && noiLon.length > 8 ? top8Lon / bgLon : null;
  const meta = {
    cach_tinh_ngay: { ten: 'ngay_hang_den', mo_ta: 'Ngày hàng đến Khai thác như màn mục 2 «Nội tỉnh đến → 6 BCVH Huế»: ngày của giờ quét túi đến, thiếu thì ngày xác nhận BD10 đến (KTT-DT-5b). Không dùng ngày đóng chuyến thư.', cot_db: 'ktt_tui.gio_quet_tui_den, thiếu thì ktt_tui.bd10_den_xnd' },
    noi_dong: 'ktt_tui.from_pos (≙ Mailtrip.StartingCode), chuyến thư = khóa 6 cột (from_pos, to_pos, mail_trip_type, service_code, year, mail_trip_number)',
    bcvh_da_loai: MA_BCVH_LOAI.map((m) => ({ ma: m, ten: tenBcvh[m] || null })),
    loc: { loai_hinh: loaiHinh },
    nguong_bg_trong_tui: nguong,
    bg_trong_tui_lon: bgLon, bg_trong_tui_nho: bgNho, so_tui_lon: soTuiLon, so_noi_dong_tui_lon: noiLon.length, ty_trong_8_noi_dau_tui_lon: tyTop8Lon,
    tong_noi_tinh: tong.tong, n1: tong.n1, n2: tong.n2, n3: tong.n3,
    do_6_bcvh_dong: do6, dong_vao_530100: tongDong, dong_vao_530100_toan_tap: n2ToanTap, so_noi_dong: dongNoi.length,
    so_chuyen_vao_530100: chuyenAll.size, so_chuyen_co_lan: lanAll.size,
    so_hang_ghi_ngay_cu: soHangCu, so_hang_ghi_ngay_cu_ca_6_bcvh: soHangCu + (loaiHinh === null ? cu6 : 0), so_chuyen_thu_ghi_ngay_cu: chuyenCu.size,
    // KTT-DC-2: số «trong phạm vi đang lọc» — luôn có; không lọc thì bằng số toàn tập (không 6 BCVH). Giao diện dùng khối này, không tự cộng.
    trong_loc: { loai_hinh: loaiHinh, dong_vao_530100: tongDong, so_noi_dong: dongNoi.length, chuyen_co_lan: lanAll.size, ty_trong_8_noi_dau: tongDong > 0 ? top8 / tongDong : null,
      nguong_bg_trong_tui: nguong, bg_trong_tui_lon: bgLon, bg_trong_tui_nho: bgNho, so_tui_lon: soTuiLon, so_noi_dong_tui_lon: noiLon.length, ty_trong_8_noi_dau_tui_lon: tyTop8Lon },
    ghi_chu: [
      'Hàng «chưa rõ» (N3, có cả túi vào 530100 lẫn túi chuyển tiếp) KHÔNG cộng vào số hàng đóng vào 530100; chuyến chứa nó vẫn là «chuyến có lẫn» nếu nơi đóng có trong bảng (nơi chỉ có hàng N3, không có hàng đóng vào 530100, không liệt kê ở bảng và chuyến của nơi đó không tính vào chuyến lẫn).',
      'Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc (nơi gom, chặng sau). 6 BCVH không liệt kê làm nơi đóng; số của 6 BCVH nằm ở meta.do_6_bcvh_dong.',
      '«Ngày đóng cả hai kiểu» = số ngày trong khoảng nơi đó vừa có hàng đóng thẳng BCVH vừa có hàng đóng vào 530100. Tỷ lệ chỉ tính khi (đóng thẳng + đóng vào) ≥ 20.',
      'Cờ chuyen_ghi_ngay_cu = ngày hàng đến cách ngày đóng chuyến thư hơn 7 ngày (nghi ghi nhận chậm); không dùng nhóm này để nhắc đơn vị. meta.so_hang_ghi_ngay_cu đếm BƯU GỬI; meta.so_chuyen_thu_ghi_ngay_cu đếm CHUYẾN THƯ khác nhau.',
      'Túi lớn (KTT-DC-3): túi gửi vào 530100 có số bưu gửi NỘI TỈNH (N2 + N3, mọi BCVH đích, không đếm hàng đi tỉnh khác nằm cùng túi) từ ngưỡng trở lên; túi ít hơn là túi nhỏ và vẫn được phép. bg_trong_tui_lon + bg_trong_tui_nho = dong_vao_530100 (chỉ đếm hàng N2; hàng chưa rõ chỉ góp vào cỡ túi).',
      'meta.trong_loc = số trong phạm vi đang lọc (không lọc thì bằng số toàn tập không kể 6 BCVH); meta.n1, n2, n3, tong_noi_tinh luôn là toàn tập.'
    ]
  };
  return { meta, theo_noi_dong: dongNoi, theo_loai_hinh: theoLoai, theo_ngay: theoNgay };
}

// ------------------------------------------
// Danh sách bưu gửi của một nơi
// ------------------------------------------
/** Các dòng (N2 hoặc N3) của một nơi đóng trong các bó ngày, sắp theo (ngày hàng đến, số hiệu). */
function dongCuaNoi(ds, ma, { chua_ro = false, chiCu = false, chiTuiLon = false, nguong = CFG.NGUONG_BG_TRONG_TUI } = {}) {
  const out = [];
  for (const d of ds) for (const r of d.rows) { if (r.noi !== ma || r.chua_ro !== chua_ro) continue; if (chiCu && !r.cu) continue; if (chiTuiLon && !laTuiLon(r.bg_tui, nguong)) continue; out.push(r); }
  out.sort((a, b) => (a.ngay_den < b.ngay_den ? -1 : a.ngay_den > b.ngay_den ? 1 : a.shbg < b.shbg ? -1 : a.shbg > b.shbg ? 1 : 0));
  return out;
}
/** Một dòng JSON của danh sách (không có tên, địa chỉ, số điện thoại). */
function dongApi(r, danhMuc, nguong = CFG.NGUONG_BG_TRONG_TUI) {
  const p = danhMuc[r.noi] || null;
  return {
    shbg: r.shbg, ngay_den: r.ngay_den, ngay_dong_chuyen: r.ngay_dong, chuyen_ghi_ngay_cu: r.cu, so_chuyen_thu: r.so_chuyen || null,
    ma_noi_dong: r.noi, ten_noi_dong: p ? p.ten : null, bcvh_dich: { ma: r.bcvh || null, ten: DQ.TEN_BCVH[r.bcvh] || null },
    dich_vu: { ma: r.dv || null, ten: r.dv_ten || null }, kg: r.kg, chua_ro: r.chua_ro,
    so_bg_trong_tui: r.bg_tui, tui_lon: laTuiLon(r.bg_tui, nguong), ma_tui: r.ma_tui || null, khoa_tui: r.khoa_tui || null
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

module.exports = { laTuiLon, tinhNgay, boRong, tongHop, dongCuaNoi, dongApi, docDanhMuc, nhomLoaiHinh, LOAI_HINH, MA_BCVH_LOAI, NGAY_LECH_CU, NGUONG_IT_MAU };
