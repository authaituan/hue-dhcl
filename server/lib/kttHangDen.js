// ==========================================
// «Hàng tại KTT» — KTT-12: trang A «Hàng đến từ xe Cấp 1». CHỈ ĐỌC DB (SELECT).
// Đơn vị: một CẶP (xe, bưu gửi) = một số hiệu BD10 đến × một SHBG (đếm một lần mỗi cặp). «Xe Cấp 1» = BD10 đến có nơi gửi (bd10_den_ma_diem_gui) KHÔNG bắt đầu bằng '53'
// (cùng quy tắc nhóm nguồn của kttNguon). Gồm MỌI túi có BD10 đến — cả túi `DEN` (mở túi khai thác lại) lẫn `CHUYEN_TIEP_DI` (nguyên túi đi tiếp) — vì xe Cấp 1 chở cả hai.
// «Giờ xe đến» = giờ xác nhận BD10 đến (bd10_den_xnd, ConfirmDate), theo canvas A; túi thiếu giờ này KHÔNG vào các bảng theo ngày/giờ (đếm riêng ở `meta`).
// Hướng hàng (A5) theo ĐỊA CHỈ nhận: mã phường/xã → 6 BCVH Huế (ktt_dia_ban_phat); phường/xã không tra được nhưng mã tỉnh '53' → «Huế, chưa rõ BCVH»; '52' → Quảng Trị;
// thiếu mã tỉnh và phường/xã → «Không rõ»; còn lại → «Tỉnh khác». Tên tỉnh trong CSV hỏng dấu tiếng Việt nên CHỈ dùng mã.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const D = require('./kttDiNgay');
const { TEN_BCVH } = require('./kttDiNgayQuery');
const { MA_BCVH_HUE } = require('./kttTinh');

const KHOANG_DOT_PHUT = 120; // hai xe cùng đường thư cách nhau ≤ chừng này thì gộp một «đợt» (quy ước trình bày)
const NGUONG_DOT = 0.05; // đợt chiếm dưới 5% bưu gửi của đường thư thì không liệt kê
const TOI_DA_DOT = 6;
const MA_TINH_HUE = '53';
const MA_TINH_QUANG_TRI = '52';
const TOP_DUONG_THU_THEO_GIO = 8;
const DICH = Object.freeze({ HUE_CHUA_RO_BCVH: 'HUE_CHUA_RO_BCVH', QUANG_TRI: 'QUANG_TRI', TINH_KHAC: 'TINH_KHAC', KHONG_RO: 'KHONG_RO' });
const GIAY_NGAY = 86400;

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);
const chuoi = (x) => (x === null || x === undefined ? '' : String(x).trim());
const r3 = (x) => Math.round(x * 1000) / 1000;
const ty = (tu, mau) => (mau > 0 ? tu / mau : null);
const NOI_KHOA = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index'].map((c) => `b.${c} = t.${c}`).join(' AND ');

function docBangPhuongXa(db) {
  const bang = {};
  if (coBang(db, 'ktt_dia_ban_phat')) for (const r of db.prepare('SELECT ma_phuong_xa, ma_bcvh FROM ktt_dia_ban_phat').all()) bang[chuoi(r.ma_phuong_xa)] = chuoi(r.ma_bcvh);
  return bang;
}
function dichCua(px, tinh, bang) {
  if (px && Object.prototype.hasOwnProperty.call(bang, px) && bang[px]) return bang[px];
  if (tinh === MA_TINH_HUE) return DICH.HUE_CHUA_RO_BCVH;
  if (tinh === MA_TINH_QUANG_TRI) return DICH.QUANG_TRI;
  if (!tinh && !px) return DICH.KHONG_RO;
  return DICH.TINH_KHAC;
}
const laTpHue = (d) => MA_BCVH_HUE.includes(d) || d === DICH.HUE_CHUA_RO_BCVH;

/**
 * Tính toàn bộ số liệu A cho [tuNgay, denNgay] (ngày của giờ xe đến). Trả "bó" JSON thuần (khóa snake_case) để các endpoint cắt ra. Một lượt đọc SQL, không bảng phụ.
 */
function tinh(db, { tuNgay, denNgay }) {
  const bo = { tong: { shbg: 0, kg: 0 }, xe: new Map(), ngay: new Map(), gio: Array.from({ length: 24 }, () => ({ shbg: 0, kg: 0, dt: new Map() })), dt: new Map(), dich: new Map(), thieuKg: 0 };
  const meta = { so_tui_thieu_gio_xe_den: 0, so_ngay: 0 };
  if (!coBang(db, 'ktt_tui') || !coBang(db, 'ktt_buu_gui')) return ketQua(bo, meta, tuNgay, denNgay);
  const tu = `${tuNgay} 00:00:00`;
  const den = L.dinhDang(L.giayCua(`${denNgay} 00:00:00`) + GIAY_NGAY);
  const bang = docBangPhuongXa(db);
  const daThay = new Set();
  const sql = `SELECT t.bd10_den_so_hieu AS bd10, t.bd10_den_xnd AS xnd, t.bd10_den_ma_duong_thu AS dt_ma, t.bd10_den_ten_duong_thu AS dt_ten, t.bd10_den_ma_diem_gui AS gui,
      b.shbg, b.khoi_luong_thuc_te_g AS gam, b.ma_tinh_thanh AS tinh, b.ma_xa_phuong AS px
    FROM ktt_tui t JOIN ktt_buu_gui b ON ${NOI_KHOA}
    WHERE t.bd10_den_so_hieu IS NOT NULL AND t.bd10_den_xnd >= @tu AND t.bd10_den_xnd < @den AND COALESCE(t.bd10_den_ma_diem_gui, '') NOT LIKE '53%'
    ORDER BY t.bd10_den_xnd, t.bd10_den_so_hieu`;
  for (const r of db.prepare(sql).iterate({ tu, den })) {
    const khoa = `${r.bd10}|${r.shbg}`;
    if (daThay.has(khoa)) continue;
    daThay.add(khoa);
    const kg = typeof r.gam === 'number' && Number.isFinite(r.gam) ? r.gam / 1000 : 0;
    if (!(typeof r.gam === 'number' && Number.isFinite(r.gam))) bo.thieuKg++;
    const ngay = r.xnd.slice(0, 10);
    const gio = Number(r.xnd.slice(11, 13));
    const giayTrongNgay = L.giayCua(r.xnd) - L.giayCua(`${ngay} 00:00:00`);
    const dtMa = chuoi(r.dt_ma);
    const dtTen = chuoi(r.dt_ten);
    const d = dichCua(chuoi(r.px), chuoi(r.tinh), bang);
    bo.tong.shbg++; bo.tong.kg += kg;
    bo.dich.set(d, (bo.dich.get(d) || 0) + 1);

    let x = bo.xe.get(r.bd10);
    if (!x) { x = { bd10: r.bd10, xnd: r.xnd, giay: giayTrongNgay, dt_ma: dtMa || null, dt_ten: dtTen || null, noi_gui: chuoi(r.gui) || null, shbg: 0, kg: 0 }; bo.xe.set(r.bd10, x); }
    x.shbg++; x.kg += kg;
    let n = bo.ngay.get(ngay);
    if (!n) { n = { ngay, shbg: 0, kg: 0, xe: new Set() }; bo.ngay.set(ngay, n); }
    n.shbg++; n.kg += kg; n.xe.add(r.bd10);
    const g = bo.gio[gio];
    g.shbg++; g.kg += kg; g.dt.set(dtMa, (g.dt.get(dtMa) || 0) + 1);
    let e = bo.dt.get(dtMa);
    if (!e) { e = { ma: dtMa || null, ten: dtTen || null, shbg: 0, kg: 0, xe: new Map(), dich: new Map() }; bo.dt.set(dtMa, e); }
    if (!e.ten && dtTen) e.ten = dtTen;
    e.shbg++; e.kg += kg;
    e.xe.set(r.bd10, { giay: giayTrongNgay, shbg: ((e.xe.get(r.bd10) || {}).shbg || 0) + 1 });
    e.dich.set(d, (e.dich.get(d) || 0) + 1);
  }
  meta.so_tui_thieu_gio_xe_den = db.prepare(`SELECT COUNT(*) AS n FROM ktt_tui WHERE bd10_den_so_hieu IS NOT NULL AND bd10_den_xnd IS NULL AND gio_quet_tui_den >= @tu AND gio_quet_tui_den < @den
    AND COALESCE(bd10_den_ma_diem_gui, '') NOT LIKE '53%'`).get({ tu, den }).n;
  return ketQua(bo, meta, tuNgay, denNgay);
}

const nhanDt = (e) => (e.ma ? (e.ten || '(chưa có tên)') : '(không rõ đường thư)');
function dichKq(map, tong) {
  const lay = (k) => map.get(k) || 0;
  const bcvh = Object.fromEntries(MA_BCVH_HUE.map((m) => [m, lay(m)]));
  const xacDinh = Object.values(bcvh).reduce((s, n) => s + n, 0);
  const tpHue = xacDinh + lay(DICH.HUE_CHUA_RO_BCVH);
  return {
    tp_hue: { shbg: tpHue, ty_le: ty(tpHue, tong), xac_dinh_bcvh: xacDinh }, theo_bcvh: bcvh, hue_chua_ro_bcvh: lay(DICH.HUE_CHUA_RO_BCVH),
    ngoai_hue: { shbg: lay(DICH.QUANG_TRI) + lay(DICH.TINH_KHAC) + lay(DICH.KHONG_RO), quang_tri: lay(DICH.QUANG_TRI), tinh_khac: lay(DICH.TINH_KHAC), khong_ro: lay(DICH.KHONG_RO) }
  };
}

/** Gộp xe của một đường thư thành «đợt» (quy ước: cách nhau ≤ KHOANG_DOT_PHUT thì cùng đợt; chỉ giữ đợt ≥ 5% bưu gửi, tối đa 6, sắp theo giờ). */
function gomDot(xe, tong) {
  const ds = [...xe.values()].sort((a, b) => a.giay - b.giay);
  const dot = [];
  for (const x of ds) {
    const c = dot[dot.length - 1];
    if (c && x.giay - c.cuoi <= KHOANG_DOT_PHUT * 60) { c.cuoi = x.giay; c.xe++; c.shbg += x.shbg; c.tongTrongSo += x.giay * x.shbg; } else dot.push({ cuoi: x.giay, xe: 1, shbg: x.shbg, tongTrongSo: x.giay * x.shbg });
  }
  return dot.filter((c) => tong > 0 && c.shbg / tong >= NGUONG_DOT).sort((a, b) => b.shbg - a.shbg).slice(0, TOI_DA_DOT)
    .map((c) => ({ gio: D.hhmm(c.tongTrongSo / c.shbg), so_xe: c.xe, shbg: c.shbg, ty_le: c.shbg / tong })).sort((a, b) => a.gio.localeCompare(b.gio));
}

function ketQua(bo, meta, tuNgay, denNgay) {
  const nhomNgay = [...bo.ngay.values()].sort((a, b) => a.ngay.localeCompare(b.ngay));
  const soNgay = nhomNgay.length;
  const tongXe = bo.xe.size;
  const dt = [...bo.dt.values()].sort((a, b) => (b.shbg - a.shbg) || String(a.ma).localeCompare(String(b.ma)));
  const topDt = dt.slice(0, TOP_DUONG_THU_THEO_GIO).map((e) => e.ma || '');
  return {
    cua_so: { tu_ngay: nhomNgay.length ? nhomNgay[0].ngay : null, den_ngay: nhomNgay.length ? nhomNgay[nhomNgay.length - 1].ngay : null, so_ngay_co_du_lieu: soNgay },
    meta: { ...meta, so_ngay_co_du_lieu: soNgay, shbg_thieu_khoi_luong: bo.thieuKg, quy_uoc: { don_vi: 'cặp (xe, bưu gửi)', gio_xe_den: 'bd10_den_xnd', xe_cap_1: "nơi gửi BD10 đến không bắt đầu bằng '53'", khoang_dot_phut: KHOANG_DOT_PHUT } },
    tong_hop: {
      shbg: bo.tong.shbg, kg: r3(bo.tong.kg), kg_tb_moi_shbg: bo.tong.shbg > 0 ? r3(bo.tong.kg / bo.tong.shbg) : null, xe: tongXe,
      xe_tb_moi_ngay: soNgay > 0 ? Math.round((tongXe / soNgay) * 10) / 10 : null, shbg_tb_moi_ngay: soNgay > 0 ? Math.round(bo.tong.shbg / soNgay) : null,
      dich: dichKq(bo.dich, bo.tong.shbg),
      theo_ngay: nhomNgay.map((n) => ({ ngay: n.ngay, chu_nhat: D.laChuNhat(n.ngay), shbg: n.shbg, kg: r3(n.kg), xe: n.xe.size }))
    },
    theo_gio: bo.gio.map((g, gio) => {
      const theo = {}; let khac = 0;
      for (const [ma, n] of g.dt) { if (topDt.includes(ma)) theo[ma || ''] = n; else khac += n; }
      return { gio, shbg: g.shbg, kg: r3(g.kg), theo_duong_thu: theo, khac };
    }),
    duong_thu_hang_dau: topDt,
    theo_duong_thu: dt.map((e) => {
      const xeN = e.xe.size;
      return {
        duong_thu_ma: e.ma, duong_thu_ten: nhanDt(e), xe: xeN, xe_tb_moi_ngay: soNgay > 0 ? Math.round((xeN / soNgay) * 10) / 10 : null, shbg: e.shbg, kg: r3(e.kg), kg_tb_moi_shbg: e.shbg > 0 ? r3(e.kg / e.shbg) : null,
        dot_chinh: gomDot(e.xe, e.shbg), huong_hang: { ...dichKq(e.dich, e.shbg), tong: e.shbg }
      };
    }),
    xe: [...bo.xe.values()].sort((a, b) => a.xnd.localeCompare(b.xnd) || String(a.bd10).localeCompare(String(b.bd10))).map((x) => ({
      bd10: x.bd10, xac_nhan_luc: x.xnd, gio: x.xnd.slice(11, 16), duong_thu_ma: x.dt_ma, duong_thu_ten: x.dt_ma ? (x.dt_ten || '(chưa có tên)') : '(không rõ đường thư)', noi_gui_ma: x.noi_gui, shbg: x.shbg, kg: r3(x.kg)
    })),
    ten_bcvh: TEN_BCVH
  };
}

module.exports = { tinh, dichCua, gomDot, KHOANG_DOT_PHUT, DICH };
