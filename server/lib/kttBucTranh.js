// ==========================================
// «Hàng tại KTT» (KTT-KD-1 pha 2, bản sửa 2): «BỨC TRANH ĐƯỜNG THƯ ĐẾN». CÁC HÀM THUẦN: không DB, không giờ máy.
// KHÔNG đổi quy tắc nào của kttLuuThoat.js / kttLichChuyen.js: chỉ ĐỌC kết quả `phanLoaiShbg` rồi cộng thêm, trong CÙNG lượt duyệt `luuThoatTheoNgay`.
// Tài liệu: docs/ai/41_KTT_LUU_THOAT.md mục 20, docs/ai/42_KTT_API.md mục 20, quyết định #126.
//
// «CHUYẾN THƯ ĐẾN» (cụm) = (đường thư của BD10 đến, lịch của BD10 đến, BĂNG GIỜ). Băng giờ dựng trên trục «giờ trong ngày» của cửa sổ đang xem:
//   các lần đến của cùng (đường thư, lịch) xếp theo giờ trong ngày, TÁCH khi hai lần đến liền nhau cách TRÊN `gapPhut` (60) phút; băng dưới `cumNhoShbg` (5) bưu gửi gộp vào
//   băng gần nhất cùng (đường thư, lịch); hai băng sát nửa đêm (cách ≤ gap qua 00:00) nối thành một băng «vắt đêm». Băng dựng trên MỌI ngày / BCVH của cửa sổ (không phụ thuộc bộ lọc
//   `loai_ngay` / `bcvh`) nên định danh cụm không đổi khi đổi bộ lọc. Hai mốc dựng băng RIÊNG (mốc A = xác nhận BD10 đến `bd10_den_xnd`; mốc B = quét túi đến).
// Đơn vị: một SHBG thuộc MẪU SỐ lưu thoát (6 BCVH, không hàng hoàn, có giờ quét túi đến, xếp được chuyến) — cùng tập với t1…t5 + «đang chờ chuyến».
//
// Hai phần:
//   - BỘ CỘNG THEO NGÀY (`taoBo`): mỗi SHBG một dòng cột số (đủ để dựng mọi bảng ở truy vấn); cộng được giữa các ngày (`gop`);
//   - DỰNG BẢNG (`tinhMoc`): cụm, chuyến xe cấp 2, ô (cụm × BCVH × loại ngày), cờ đánh giá theo ngưỡng TƯƠNG ĐỐI, Pareto.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const { thoiGianThucGiay } = require('./quyThoiGian');
const { MA_BCVH_HUE } = require('./kttTinh');
const NG = require('./kttNguon');

const MOC_BT = Object.freeze({ A: 'xnd', B: 'quet_tui_den' }); // tên mốc của API bức tranh -> mốc của chi_tieu_14h
const HAI_MOC = Object.freeze(['A', 'B']);
const MOC_MAC_DINH = 'A'; // PO 04/11/2026: mốc mặc định của khối mới = mốc A (BD10 đến); API vẫn trả cả hai mốc
const THU_CN = 'CN';
const r3 = NG.r3;
const r1 = (x) => Math.round(x * 10) / 10;
const NGAY_PHUT = 1440;

/** Ngưỡng mặc định (khớp server/config/tham-so-mac-dinh.js; `nguong` thật đọc từ tham số hệ thống ở kttApi). */
const NGUONG_MAC_DINH = Object.freeze({
  gapPhut: 60, cumNhoShbg: 5, mauToiThieu: 100, phanViTuongDoi: 80, kienDiNgoaiPct: 30, chuyenGomHeSo: 1.5, satGioChotPhut: 60, ngayToiThieu: 20,
  conLaiGio: 3, tyLeNganConLaiPct: 25, meoTheoLoPhut: 120
});
const CO = Object.freeze({
  THAT_THUONG: 'that_thuong', KHONG_CO_LICH: 'khong_co_lich_co_dinh', NHIEU_KIEN: 'nhieu_kien_di_ngoai', CHUYEN_GOM: 'chuyen_gom_nhieu_hang', SAT_GIO_CHOT: 'sat_gio_chot', SAT_CHI_TIEU: 'sat_chi_tieu', MAU_IT: 'mau_it'
});
/** Cấp độ của từng cờ (sát giờ chốt LUÔN là theo dõi: số đo 1b chưa ủng hộ). */
const MUC_CO = Object.freeze({
  [CO.SAT_CHI_TIEU]: 'canh_bao', [CO.THAT_THUONG]: 'luu_y', [CO.KHONG_CO_LICH]: 'luu_y', [CO.CHUYEN_GOM]: 'luu_y', [CO.NHIEU_KIEN]: 'thong_tin', [CO.SAT_GIO_CHOT]: 'theo_doi', [CO.MAU_IT]: 'thong_tin'
});
const NHAN_CO = Object.freeze({
  [CO.THAT_THUONG]: 'Thất thường', [CO.KHONG_CO_LICH]: 'Không có lịch cố định', [CO.NHIEU_KIEN]: 'Nhiều kiện đi ngoài', [CO.CHUYEN_GOM]: 'Chuyến gom nhiều hàng',
  [CO.SAT_GIO_CHOT]: 'Sát giờ chốt chuyến', [CO.SAT_CHI_TIEU]: 'Sát chỉ tiêu', [CO.MAU_IT]: 'Mẫu ít, chưa kết luận'
});

// ------------------------------------------
// Hàm thuần nhỏ
// ------------------------------------------
const thuCua = (ngay) => { const g = L.giayCua(`${ngay} 00:00:00`); if (g === null) return null; const d = new Date(g * 1000).getUTCDay(); return d === 0 ? THU_CN : String(d + 1); };
const loaiNgayCua = (ngay) => (thuCua(ngay) === THU_CN ? 'chu_nhat' : 'thuong');
const hhmm = (phut) => { const p = ((Math.round(phut) % NGAY_PHUT) + NGAY_PHUT) % NGAY_PHUT; return `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`; };
/** Phân vị p (0..1) của mảng ĐÃ SẮP: phần tử thứ floor(p·n) (cùng cách xếp với hPhanVi của kttKhongDat14h). null nếu rỗng. */
const phanVi = (daSap, p) => (daSap.length ? daSap[Math.min(daSap.length - 1, Math.floor(p * daSap.length))] : null);
const sapTang = (mang) => mang.slice().sort((a, b) => a - b);
const cuaMoc = (moc) => { if (moc === 'A' || moc === 'B') return moc; throw new Error(`moc không hợp lệ: ${moc}`); };

// ------------------------------------------
// Bộ cộng THEO NGÀY: cột số (mỗi SHBG một dòng)
// ------------------------------------------
const COT = ['dt', 'lich', 'bcvh', 'nh', 'kien', 'kg', 'ctg', 'tA', 'ckA', 'choA', 'bienA', 'hsA', 'tB', 'ckB', 'choB', 'bienB', 'hsB'];
const CHI_SO_BCVH = new Map(MA_BCVH_HUE.map((m, i) => [m, i]));
const KIEN = Object.freeze({ MO_TUI: 0, CHIA_SAN: 1, DI_NGOAI: 2, KHAC: 3 });

function kienCua(u) {
  if (u.luong === 'DI_NGOAI' || (!!u.soHieuBd8 && u.soHieuBd8 === u.shbg)) return KIEN.DI_NGOAI; // định nghĩa PO (44 mục 10): luồng DI_NGOAI HOẶC BD8 = SHBG
  if (u.luong === 'DA_CHIA_SAN') return KIEN.CHIA_SAN;
  if (u.luong === 'KHAI_THAC_DEN') return KIEN.MO_TUI;
  return KIEN.KHAC;
}

/**
 * Bộ cộng của MỘT ngày đến. `them(u, kq, ngu)`: gọi cho mọi SHBG đã qua phanLoaiShbg có nhom = PHAN_LOAI và có chuyến (đúng tập t1…t5 + đang chờ chuyến).
 * `ketQua()`: { ngay, thu, n, cot (các mảng cùng độ dài), tu (từ điển chuỗi) } — nhỏ, giữ trong bộ nhớ đệm theo ngày cùng kết quả `luuThoatTheoNgay`.
 */
function taoBo() {
  const cot = Object.fromEntries(COT.map((k) => [k, []]));
  const tu = { dt: [], dtTen: [], lich: [], lichTen: [], ck: [] };
  const idx = { dt: new Map(), lich: new Map(), ck: new Map() };
  const lay = (loai, ma, ten) => {
    let i = idx[loai].get(ma);
    if (i === undefined) { i = tu[loai].length; tu[loai].push(ma); idx[loai].set(ma, i); if (loai !== 'ck') tu[`${loai}Ten`].push(ten || null); }
    else if (loai !== 'ck' && !tu[`${loai}Ten`][i] && ten) tu[`${loai}Ten`][i] = ten;
    return i;
  };
  const memo = { A: new Map(), B: new Map() }; // mốc -> BCVH -> giờ -> { t, ck, cho, bien, hs } (hai tầng Map: không ghép chuỗi cho mỗi SHBG)
  let ngay = null; let goc = 0; let n = 0;
  const tinhMoc = (ngu, bcvh, gio, ma) => {
    let mb = memo[ma].get(bcvh);
    if (!mb) { mb = new Map(); memo[ma].set(bcvh, mb); }
    let m = mb.get(gio);
    if (m !== undefined) return m;
    const x = L.xepChuyen(ngu.lich, bcvh, gio, { hanDenTruocChuyenPhut: ngu.hanPhut });
    if (!x.ok) { m = null; } else {
      const g = L.giayCua(gio);
      const ch = x.chuyen;
      const cho = thoiGianThucGiay(gio, ch.xuat_phat_luc);
      m = { t: (g - goc) / 60, ck: lay('ck', `${bcvh}|${ch.gio_xuat_phat}|${ch.han_den_luc.slice(11, 16)}`), cho: cho === null ? 0 : cho, bien: (L.giayCua(ch.han_den_luc) - g) / 60, hs: ch.ngay !== ngay ? 1 : 0 };
    }
    mb.set(gio, m);
    return m;
  };
  return {
    them(u, kq, ngu) {
      if (ngay === null) { ngay = u.ngayDen; goc = L.giayCua(`${ngay} 00:00:00`); }
      const bcvh = u.maBcvh;
      const kg = u.gam;
      cot.dt.push(lay('dt', u.duongThuDenMa || '', u.duongThuDenTen));
      cot.lich.push(lay('lich', u.lichDenMa || '', u.lichDenTen));
      cot.bcvh.push(CHI_SO_BCVH.get(bcvh) ?? -1);
      cot.nh.push(u.nguonHang === 'chuyen_tiep' ? 1 : 0);
      cot.kien.push(kienCua(u));
      cot.kg.push(typeof kg === 'number' && Number.isFinite(kg) && kg > 0 ? kg / 1000 : NaN);
      cot.ctg.push(kq.chiTieu14h.xnd.chiTieuGio);
      // mốc B: giờ quét túi đến (đúng chuyến mà phanLoaiShbg đã xếp); mốc A: giờ xác nhận BD10 đến (xếp chuyến riêng theo giờ đó)
      const mB = tinhMoc(ngu, bcvh, u.quetDen, 'B');
      const mA = u.xndBd10 ? tinhMoc(ngu, bcvh, u.xndBd10, 'A') : null;
      for (const [h, m] of [['A', mA], ['B', mB]]) {
        cot[`t${h}`].push(m ? m.t : NaN); cot[`ck${h}`].push(m ? m.ck : -1); cot[`cho${h}`].push(m ? m.cho : NaN); cot[`bien${h}`].push(m ? m.bien : NaN); cot[`hs${h}`].push(m ? m.hs : 0);
      }
      n++;
    },
    ketQua() { return { ngay, thu: ngay ? thuCua(ngay) : null, n, cot, tu }; }
  };
}

/** Ghép các ngày: mảng cột cộng nối, chỉ số từ điển đổi sang từ điển CHUNG. Trả { n, ngayI (chỉ số ngày), ngays, cot, tu }. */
function gop(ds) {
  const tu = { dt: [], dtTen: [], lich: [], lichTen: [], ck: [] };
  const idx = { dt: new Map(), lich: new Map(), ck: new Map() };
  const doi = (loai, ma, ten) => {
    let i = idx[loai].get(ma);
    if (i === undefined) { i = tu[loai].length; tu[loai].push(ma); idx[loai].set(ma, i); if (loai !== 'ck') tu[`${loai}Ten`].push(ten || null); }
    else if (loai !== 'ck' && !tu[`${loai}Ten`][i] && ten) tu[`${loai}Ten`][i] = ten;
    return i;
  };
  const cot = Object.fromEntries(COT.map((k) => [k, []]));
  const ngayI = []; const ngays = [];
  for (const d of ds) {
    if (!d || !d.n) continue;
    const bd = ngays.length; ngays.push({ ngay: d.ngay, thu: d.thu });
    const mdt = d.tu.dt.map((m, i) => doi('dt', m, d.tu.dtTen[i]));
    const mlich = d.tu.lich.map((m, i) => doi('lich', m, d.tu.lichTen[i]));
    const mck = d.tu.ck.map((m) => doi('ck', m));
    for (let i = 0; i < d.n; i++) ngayI.push(bd);
    for (const k of COT) {
      const src = d.cot[k];
      if (k === 'dt') for (const v of src) cot.dt.push(mdt[v]);
      else if (k === 'lich') for (const v of src) cot.lich.push(mlich[v]);
      else if (k === 'ckA' || k === 'ckB') for (const v of src) cot[k].push(v < 0 ? -1 : mck[v]);
      else for (const v of src) cot[k].push(v);
    }
  }
  return { n: ngayI.length, ngayI, ngays, cot, tu };
}

// ------------------------------------------
// Băng giờ (cụm) trên trục giờ-trong-ngày
// ------------------------------------------
/** Giờ trong ngày (phút nguyên 0..1439) từ phút kể từ 00:00 của ngày đến (có thể âm hoặc ≥ 1440 với mốc A). */
const tod = (t) => ((Math.round(t) % NGAY_PHUT) + NGAY_PHUT) % NGAY_PHUT;

/** Chia một nhóm (đường thư, lịch) thành các băng. dem = mảng 1440 ô đếm. Trả [{ dau, cuoi, shbg, vat }] theo giờ tăng; `vat` = băng vắt qua nửa đêm (dau > cuoi). */
function chiaBang(dem, gapPhut, cumNho) {
  const ev = [];
  for (let p = 0; p < NGAY_PHUT; p++) if (dem[p] > 0) ev.push(p);
  if (!ev.length) return [];
  let bang = [];
  for (const p of ev) {
    const c = bang[bang.length - 1];
    if (c && p - c.cuoi <= gapPhut) { c.cuoi = p; c.shbg += dem[p]; } else bang.push({ dau: p, cuoi: p, shbg: dem[p], vat: false });
  }
  // gộp băng nhỏ vào băng gần nhất (cùng nhóm)
  let nho;
  while (bang.length > 1 && (nho = bang.findIndex((b) => b.shbg < cumNho)) >= 0) {
    const b = bang[nho];
    const cachTrai = nho > 0 ? b.dau - bang[nho - 1].cuoi : Infinity;
    const cachPhai = nho < bang.length - 1 ? bang[nho + 1].dau - b.cuoi : Infinity;
    const k = cachTrai <= cachPhai ? nho - 1 : nho + 1;
    const g = bang[k];
    g.dau = Math.min(g.dau, b.dau); g.cuoi = Math.max(g.cuoi, b.cuoi); g.shbg += b.shbg;
    bang.splice(nho, 1);
  }
  // nối băng đầu và băng cuối qua nửa đêm
  if (bang.length > 1 && bang[0].dau + NGAY_PHUT - bang[bang.length - 1].cuoi <= gapPhut) {
    const dauB = bang.shift();
    const cuoiB = bang[bang.length - 1];
    cuoiB.cuoi = dauB.cuoi; cuoiB.shbg += dauB.shbg; cuoiB.vat = true;
  }
  return bang;
}
const trongBang = (b, p) => (b.vat ? p >= b.dau || p <= b.cuoi : p >= b.dau && p <= b.cuoi);
/** Giờ trong ngày -> giá trị trải liền (băng vắt đêm: giờ trước 12:00 cộng 24 giờ) để lấy phân vị. */
const trai = (b, p) => (b.vat && p < NGAY_PHUT / 2 ? p + NGAY_PHUT : p);

/** Gán mỗi dòng một băng cho mốc `moc` ('A' | 'B'). Trả { cum: Int32Array (-1 = không có mốc), ds: [{ id, dtI, lichI, k, dau, cuoi, vat, ten… }] }. */
function dungCum(R, moc, ng) {
  const t = R.cot[`t${moc}`];
  const nhomDem = new Map(); // `${dt}|${lich}` -> Int32Array(1440)
  for (let i = 0; i < R.n; i++) {
    if (Number.isNaN(t[i])) continue;
    const k = `${R.cot.dt[i]}|${R.cot.lich[i]}`;
    let a = nhomDem.get(k);
    if (!a) { a = new Int32Array(NGAY_PHUT); nhomDem.set(k, a); }
    a[tod(t[i])]++;
  }
  const bangCua = new Map(); // k -> { bang[], tra: Int16Array(1440) }
  const ds = [];
  for (const [k, a] of nhomDem) {
    const [dtI, lichI] = k.split('|').map(Number);
    const bang = chiaBang(a, ng.gapPhut, ng.cumNhoShbg);
    const tra = new Int16Array(NGAY_PHUT).fill(-1);
    bang.forEach((b, j) => { for (let p = 0; p < NGAY_PHUT; p++) if (trongBang(b, p)) tra[p] = j; });
    // phút nằm giữa hai băng (không có lần đến nào) không xuất hiện ở dữ liệu; phút còn thiếu được gán băng gần nhất khi tra
    bangCua.set(k, { bang, tra, goc: ds.length });
    bang.forEach((b, j) => ds.push({ dtI, lichI, k: j + 1, soBangNhom: bang.length, dau: b.dau, cuoi: b.cuoi, vat: b.vat, shbgTong: b.shbg }));
  }
  const cum = new Int32Array(R.n).fill(-1);
  for (let i = 0; i < R.n; i++) {
    if (Number.isNaN(t[i])) continue;
    const e = bangCua.get(`${R.cot.dt[i]}|${R.cot.lich[i]}`);
    const j = e.tra[tod(t[i])];
    if (j >= 0) cum[i] = e.goc + j;
  }
  ds.forEach((c, i) => { c.i = i; });
  return { cum, ds };
}

// ------------------------------------------
// Thống kê
// ------------------------------------------
const demKg = () => ({ shbg: 0, kg: 0, thieu: 0 });
const congKg = (o, kg) => { o.shbg++; if (Number.isNaN(kg)) o.thieu++; else o.kg += kg; };
const kgRa = (o) => ({ shbg: o.shbg, kg: o.shbg > 0 && o.thieu === o.shbg ? null : r3(o.kg), shbg_thieu_kg: o.thieu });

function thongKeNgay(demNgay, danhSachNgay, loai) {
  const cua = danhSachNgay.filter((d) => d.loai === loai);
  const co = cua.filter((d) => (demNgay.get(d.i) || 0) > 0).map((d) => demNgay.get(d.i));
  const n = co.length;
  if (!n) return { so_ngay_cua_so: cua.length, so_ngay_co_hang: 0, tb: null, do_lech_chuan: null, dao_dong: null };
  const tb = co.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(co.reduce((s, x) => s + (x - tb) * (x - tb), 0) / n); // độ lệch chuẩn chia N (như báo cáo 1c)
  return { so_ngay_cua_so: cua.length, so_ngay_co_hang: n, tb: r1(tb), do_lech_chuan: r1(sd), dao_dong: n >= 2 && tb > 0 ? r3(sd / tb) : null };
}

/** Ngưỡng TƯƠNG ĐỐI: phân vị `pv` (0..100) của các giá trị khác null; cờ khi giá trị ≥ ngưỡng. Không đủ 2 giá trị: không có ngưỡng. */
function nguongTuongDoi(giaTri, pv) {
  const x = sapTang(giaTri.filter((v) => v !== null && v !== undefined && Number.isFinite(v)));
  if (x.length < 2) return null;
  return x[Math.min(x.length - 1, Math.floor((pv / 100) * x.length))];
}

const tenCum = (R, c) => {
  const ten = R.tu.dtTen[c.dtI] || (R.tu.dt[c.dtI] ? R.tu.dt[c.dtI] : '(chưa có đường thư)');
  const lich = R.tu.lichTen[c.lichI] || R.tu.lich[c.lichI] || null;
  const goc = lich && lich.toLowerCase().includes(ten.toLowerCase()) ? lich : (lich ? `${ten} · ${lich}` : ten); // tên lịch thường đã chứa tên đường thư
  return { ten: c.soBangNhom > 1 ? `${goc} · ${hhmm(c.dau)}–${hhmm(c.cuoi)}` : goc };
};

/**
 * Dựng toàn bộ bảng của MỘT mốc. opts: { moc ('A'|'B'), loaiNgay ('thuong'|'chu_nhat'|'tat_ca'), bcvh (mã | null), nguong, lich (cho số chuyến / luu_y_lich), soNgayCuaSo (danh sách ngày của cửa sổ) }.
 Trả { mau_so, do_duoc, cum[], o[], chuyen[], the[], nguong_ap_dung, thong_ke_co }.
 `R` = kết quả gop(); `ngays` = [{ ngay, thu }] của TOÀN cửa sổ (kể cả ngày không có hàng).
*/
function tinhMoc(R, opts) {
  const moc = cuaMoc(opts.moc);
  const kia = moc === 'A' ? 'B' : 'A';
  const ng = { ...NGUONG_MAC_DINH, ...(opts.nguong || {}) };
  const loai = opts.loaiNgay || 'tat_ca';
  const can = { o: true, chuyen: true, the: true, ...(opts.can || {}) }; // bỏ phần không cần (route /buc-tranh-duong-thu chỉ cần cụm) để giảm thời gian tính
  const bcvhLoc = opts.bcvh ? MA_BCVH_HUE.indexOf(opts.bcvh) : -1;
  const t = R.cot[`t${moc}`]; const tKia = R.cot[`t${kia}`];
  const ck = R.cot[`ck${moc}`]; const cho = R.cot[`cho${moc}`]; const bien = R.cot[`bien${moc}`]; const hs = R.cot[`hs${moc}`];
  const { cum, ds } = dungCum(R, moc, ng);

  // loại ngày của từng ngày trong dữ liệu + của cả cửa sổ
  const ngayCuaSo = (opts.ngays || R.ngays).map((d, i) => ({ i, ngay: d.ngay, loai: d.thu === THU_CN ? 'chu_nhat' : 'thuong' }));
  const chiSoNgay = new Map(R.ngays.map((d, i) => [d.ngay, i]));
  const ngayDuLieu = R.ngays.map((d) => (d.thu === THU_CN ? 'chu_nhat' : 'thuong'));
  const ngayChoThongKe = ngayCuaSo.map((d) => ({ i: chiSoNgay.has(d.ngay) ? chiSoNgay.get(d.ngay) : -1 - d.i, loai: d.loai })); // ngày không có dữ liệu: chỉ số âm (không bao giờ có hàng)

  const mau = { tong: 0, coMoc: 0 };
  // gom theo cụm
  const A = ds.map(() => ({ kg: demKg(), kien: 0, kienKg: demKg(), chiaSan: 0, mo: 0, khac: 0, nh: [0, 0], demNgay: new Map(), gio: [], gioKia: [], coMocKia: 0, ngayCo: new Set(), nTong: 0 }));
  for (let i = 0; i < R.n; i++) {
    if (bcvhLoc >= 0 && R.cot.bcvh[i] !== bcvhLoc) continue;
    if (loai !== 'tat_ca' && ngayDuLieu[R.ngayI[i]] !== loai) continue;
    mau.tong++;
    if (cum[i] < 0) continue;
    mau.coMoc++;
    const a = A[cum[i]];
    const kg = R.cot.kg[i];
    congKg(a.kg, kg);
    const k = R.cot.kien[i];
    if (k === KIEN.DI_NGOAI) { a.kien++; congKg(a.kienKg, kg); } else if (k === KIEN.CHIA_SAN) a.chiaSan++; else if (k === KIEN.MO_TUI) a.mo++; else a.khac++;
    a.nh[R.cot.nh[i]]++;
    a.demNgay.set(R.ngayI[i], (a.demNgay.get(R.ngayI[i]) || 0) + 1);
    const c = ds[cum[i]];
    const p = tod(t[i]);
    a.gio.push(trai(c, p));
    if (!Number.isNaN(tKia[i])) { a.gioKia.push(trai(c, tod(tKia[i]))); a.coMocKia++; }
  }
  // cụm không có dòng nào sau lọc: bỏ
  const tongShbg = A.reduce((s, a) => s + a.kg.shbg, 0);
  const cumKq = [];
  ds.forEach((c, i) => {
    const a = A[i];
    if (!a.kg.shbg) return;
    const gio = sapTang(a.gio);
    const tv = phanVi(gio, 0.5); const p10 = phanVi(gio, 0.1); const p90 = phanVi(gio, 0.9);
    const kiaS = sapTang(a.gioKia);
    const tvKia = phanVi(kiaS, 0.5);
    const lech = (m) => { const n = gio.length; const d = gio.filter((x) => Math.abs(x - tv) <= m).length; return { shbg: d, ty_le: n > 0 ? d / n : null }; };
    const ngayThuong = thongKeNgay(a.demNgay, ngayChoThongKe, 'thuong');
    const chuNhat = thongKeNgay(a.demNgay, ngayChoThongKe, 'chu_nhat');
    const meo = moc === 'A' && tvKia !== null ? Math.abs(tv - tvKia) >= ng.meoTheoLoPhut : null;
    cumKq.push({
      id: `${R.tu.dt[c.dtI]}|${R.tu.lich[c.lichI]}|${c.k}`, ...(() => { const t0 = tenCum(R, c); return { duong_thu: { ma: R.tu.dt[c.dtI] || null, ten: R.tu.dtTen[c.dtI] || null }, lich: { ma: R.tu.lich[c.lichI] || null, ten: R.tu.lichTen[c.lichI] || null }, ten: t0.ten }; })(),
      thu_tu_bang: c.k, so_bang_cua_nhom: c.soBangNhom, bang_gio: { tu: hhmm(c.dau), den: hhmm(c.cuoi), vat_dem: c.vat },
      ...kgRa(a.kg), ty_le_shbg: null, luy_ke_pct: null, ngay_co_hang: ngayThuong.so_ngay_co_hang + chuNhat.so_ngay_co_hang,
      san_luong_ngay: { ngay_thuong: ngayThuong, chu_nhat: chuNhat },
      gio_den: {
        moc, do_duoc: gio.length, mau_so: a.kg.shbg, trung_vi_phut: tv === null ? null : tod(tv), trung_vi: tv === null ? null : hhmm(tv), p10: p10 === null ? null : hhmm(p10), p90: p90 === null ? null : hhmm(p90),
        do_rong_phut: p10 === null ? null : Math.round(p90 - p10), trung_vi_moc_kia: tvKia === null ? null : { moc: kia, trung_vi: hhmm(tvKia), do_duoc: kiaS.length }, meo_theo_lo: meo
      },
      lech_so_voi_trung_vi: { trong_30p: lech(30), trong_60p: lech(60), trong_90p: lech(90) },
      kien_di_ngoai: { ...kgRa(a.kienKg), ty_le: a.kg.shbg > 0 ? a.kien / a.kg.shbg : null },
      trong_tui: { chia_san: a.chiaSan, mo: a.mo, khac: a.khac },
      nguon_hang: { khai_thac: a.nh[0], chuyen_tiep: a.nh[1] },
      co: {}, so_do: { dao_dong: ngayThuong.dao_dong, do_rong_gio_den_phut: p10 === null ? null : Math.round(p90 - p10), ty_le_kien_di_ngoai: a.kg.shbg > 0 ? a.kien / a.kg.shbg : null },
      _i: i
    });
  });
  cumKq.sort((x, y) => (y.shbg - x.shbg) || (x.id < y.id ? -1 : 1));
  let luyKe = 0;
  for (const c of cumKq) { luyKe += c.shbg; c.ty_le_shbg = tongShbg > 0 ? c.shbg / tongShbg : null; c.luy_ke_pct = tongShbg > 0 ? r1((luyKe / tongShbg) * 100) : null; }

  // ---- cờ cấp cụm
  const dd = cumKq.filter((c) => c.shbg >= ng.mauToiThieu);
  const nguongDaoDong = nguongTuongDoi(dd.map((c) => c.so_do.dao_dong), ng.phanViTuongDoi);
  const nguongDoRong = nguongTuongDoi(dd.map((c) => c.so_do.do_rong_gio_den_phut), ng.phanViTuongDoi);
  for (const c of cumKq) {
    const mauIt = c.shbg < ng.mauToiThieu;
    c.co = {
      [CO.MAU_IT]: mauIt,
      [CO.THAT_THUONG]: !mauIt && nguongDaoDong !== null && c.so_do.dao_dong !== null && c.so_do.dao_dong >= nguongDaoDong,
      [CO.KHONG_CO_LICH]: !mauIt && nguongDoRong !== null && c.so_do.do_rong_gio_den_phut !== null && c.so_do.do_rong_gio_den_phut >= nguongDoRong,
      [CO.NHIEU_KIEN]: !mauIt && c.kien_di_ngoai.ty_le !== null && c.kien_di_ngoai.ty_le >= ng.kienDiNgoaiPct / 100
    };
  }
  const cumTheoI = new Map(cumKq.map((c) => [c._i, c]));
  for (const c of cumKq) delete c._i;

  // ---- ô (cụm × BCVH × loại ngày) và chuyến (BCVH × loại ngày × giờ rời)
  const nChuyenCua = (maBcvh, loaiN) => {
    const dong = (opts.lich || []).filter((r) => r.ma_bcvh === maBcvh && !(r.dang_dung === 0 || r.dang_dung === false) && (loaiN === 'chu_nhat' ? r.ngay_chay === 'CA_TUAN' : true));
    return Math.max(1, dong.length);
  };
  const luuY = new Set((opts.lich || []).filter((r) => r.ngay_chay === 'NGHI_CN' && !(r.dang_dung === 0 || r.dang_dung === false)).map((r) => r.ma_bcvh)); // BCVH có chuyến nghỉ Chủ nhật: lịch Chủ nhật chưa tin cậy (KTT-LICH-2)
  const tong = { o: new Map(), ch: new Map(), bcvhLoai: new Map() };
  const lamO = can.o || can.chuyen || can.the;
  const layO = (mapa, khoa, tao) => { let e = mapa.get(khoa); if (!e) { e = tao(); mapa.set(khoa, e); } return e; };
  const moiNhom = () => ({ kg: demKg(), cho: [], conLai: [], bien: [], ngay: new Set(), duoi: 0, qua: 0, homSau: 0 });
  const them = (e, i) => {
    congKg(e.kg, R.cot.kg[i]);
    const c = cho[i];
    e.cho.push(c);
    const cl = R.cot.ctg[i] - c / 3600;
    e.conLai.push(cl); if (cl < ng.conLaiGio) e.duoi++; if (cl < 0) e.qua++;
    e.bien.push(bien[i]);
    e.ngay.add(R.ngayI[i]);
    if (hs[i]) e.homSau++;
  };
  for (let i = 0; i < R.n && lamO; i++) {
    if (cum[i] < 0 || ck[i] < 0) continue;
    if (bcvhLoc >= 0 && R.cot.bcvh[i] !== bcvhLoc) continue;
    const loaiN = ngayDuLieu[R.ngayI[i]];
    if (loai !== 'tat_ca' && loaiN !== loai) continue;
    const bi = R.cot.bcvh[i];
    them(layO(tong.o, `${cum[i]}|${bi}|${loaiN}`, () => ({ cum: cum[i], bcvh: bi, loai: loaiN, ...moiNhom() })), i);
    const ch = layO(tong.ch, `${bi}|${loaiN}|${ck[i]}`, () => ({ bcvh: bi, loai: loaiN, ckI: ck[i], ...moiNhom(), nguon: new Map() }));
    them(ch, i);
    ch.nguon.set(cum[i], (ch.nguon.get(cum[i]) || 0) + 1);
    const bl = layO(tong.bcvhLoai, `${bi}|${loaiN}`, () => ({ shbg: 0 }));
    bl.shbg++;
  }
  const thongKeNhom = (e) => {
    const cs = sapTang(e.cho.map((x) => x / 3600)); const cl = sapTang(e.conLai); const bs = sapTang(e.bien);
    const n = e.kg.shbg;
    return {
      luu_thoat_theo_lich: { trung_vi_gio: phanVi(cs, 0.5) === null ? null : r1(phanVi(cs, 0.5)), p90_gio: phanVi(cs, 0.9) === null ? null : r1(phanVi(cs, 0.9)) },
      con_lai: { trung_vi_gio: phanVi(cl, 0.5) === null ? null : r1(phanVi(cl, 0.5)), p10_gio: phanVi(cl, 0.1) === null ? null : r1(phanVi(cl, 0.1)), duoi_nguong: e.duoi, ty_le_duoi_nguong: n > 0 ? e.duoi / n : null, qua_chi_tieu: e.qua, ty_le_qua_chi_tieu: n > 0 ? e.qua / n : null, nguong_gio: ng.conLaiGio },
      sat_gio_chot: { phut_trung_vi: phanVi(bs, 0.5) === null ? null : Math.round(phanVi(bs, 0.5)), shbg: bs.filter((x) => x < ng.satGioChotPhut).length, ty_le: n > 0 ? bs.filter((x) => x < ng.satGioChotPhut).length / n : null, nguong_phut: ng.satGioChotPhut },
      ngay_co_hang: e.ngay.size, hom_sau: { shbg: e.homSau, ty_le: n > 0 ? e.homSau / n : null }
    };
  };
  const oKq = (can.o || can.the ? [...tong.o.values()] : []).map((e) => {
    const c = cumTheoI.get(e.cum);
    const s = thongKeNhom(e);
    const mauIt = e.kg.shbg < ng.mauToiThieu;
    return {
      cum_id: c ? c.id : null, cum_ten: c ? c.ten : null, ma_bcvh: MA_BCVH_HUE[e.bcvh], loai_ngay: e.loai, ...kgRa(e.kg), ...s, luu_y_lich: e.loai === 'chu_nhat' && luuY.has(MA_BCVH_HUE[e.bcvh]),
      co: {
        [CO.MAU_IT]: mauIt,
        [CO.SAT_GIO_CHOT]: !mauIt && e.ngay.size >= ng.ngayToiThieu && s.sat_gio_chot.phut_trung_vi !== null && s.sat_gio_chot.phut_trung_vi < ng.satGioChotPhut,
        [CO.SAT_CHI_TIEU]: !mauIt && s.con_lai.ty_le_duoi_nguong !== null && s.con_lai.ty_le_duoi_nguong >= ng.tyLeNganConLaiPct / 100
      }
    };
  }).sort((x, y) => (y.shbg - x.shbg) || (x.cum_id + x.ma_bcvh < y.cum_id + y.ma_bcvh ? -1 : 1));
  const chuyenKq = (can.chuyen || can.the ? [...tong.ch.values()] : []).map((e) => {
    const [bcvh, gio, chot] = R.tu.ck[e.ckI].split('|');
    const bl = tong.bcvhLoai.get(`${e.bcvh}|${e.loai}`).shbg;
    const nCh = nChuyenCua(bcvh, e.loai);
    const tyTrong = bl > 0 ? e.kg.shbg / bl : null;
    const nguonCum = [...e.nguon.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([ci, n]) => { const c = cumTheoI.get(ci); return { cum_id: c ? c.id : null, ten: c ? c.ten : null, shbg: n, ty_le: n / e.kg.shbg }; });
    return {
      ma_bcvh: bcvh, loai_ngay: e.loai, gio_xuat_phat: gio, gio_chot: chot, ...kgRa(e.kg), ty_le_san_luong_bcvh: tyTrong, so_chuyen_trong_ngay: nCh, ty_trong_chia_deu: 1 / nCh,
      ...thongKeNhom(e), nguon_cum: nguonCum, luu_y_lich: e.loai === 'chu_nhat' && luuY.has(bcvh),
      co: { [CO.CHUYEN_GOM]: bl >= ng.mauToiThieu && tyTrong !== null && tyTrong >= (ng.chuyenGomHeSo / nCh) }
    };
  }).sort((x, y) => (y.shbg - x.shbg) || (x.ma_bcvh + x.gio_xuat_phat < y.ma_bcvh + y.gio_xuat_phat ? -1 : 1));

  // ---- danh sách «thẻ» đánh giá, xếp Pareto theo số bưu gửi bị ảnh hưởng
  const the = [];
  const dua = (co, loaiDt, id, ten, shbg, giaTri, nguongAp, lyGiai) => the.push({ muc: MUC_CO[co], co, nhan: NHAN_CO[co], doi_tuong: { loai: loaiDt, id, ten }, shbg_anh_huong: shbg, gia_tri_do: giaTri, nguong_ap_dung: nguongAp, ly_giai: lyGiai });
  for (const c of cumKq) {
    if (c.co[CO.THAT_THUONG]) dua(CO.THAT_THUONG, 'cum', c.id, c.ten, c.shbg, c.so_do.dao_dong, nguongDaoDong, `Sản lượng ngày thường dao động ${(c.so_do.dao_dong * 100).toFixed(0)}% so với mức trung bình (từ phân vị ${ng.phanViTuongDoi} của các cụm: ${(nguongDaoDong * 100).toFixed(0)}%)`);
    if (c.co[CO.KHONG_CO_LICH]) dua(CO.KHONG_CO_LICH, 'cum', c.id, c.ten, c.shbg, c.so_do.do_rong_gio_den_phut, nguongDoRong, `Giờ đến trải ${c.so_do.do_rong_gio_den_phut} phút (từ phân vị ${ng.phanViTuongDoi} của các cụm: ${nguongDoRong} phút)`);
    if (c.co[CO.NHIEU_KIEN]) dua(CO.NHIEU_KIEN, 'cum', c.id, c.ten, c.kien_di_ngoai.shbg, c.kien_di_ngoai.ty_le, ng.kienDiNgoaiPct / 100, `Kiện đi ngoài chiếm ${(c.kien_di_ngoai.ty_le * 100).toFixed(0)}% (từ ${ng.kienDiNgoaiPct}%)`);
  }
  for (const e of chuyenKq) if (e.co[CO.CHUYEN_GOM]) dua(CO.CHUYEN_GOM, 'chuyen', `${e.ma_bcvh}|${e.loai_ngay}|${e.gio_xuat_phat}`, `${e.ma_bcvh} · chuyến ${e.gio_xuat_phat}`, e.shbg, e.ty_le_san_luong_bcvh, ng.chuyenGomHeSo / e.so_chuyen_trong_ngay, `Chuyến nhận ${(e.ty_le_san_luong_bcvh * 100).toFixed(0)}% sản lượng của BCVH trong ngày (từ ${ng.chuyenGomHeSo} lần mức chia đều ${(100 / e.so_chuyen_trong_ngay).toFixed(0)}%)`);
  for (const o of oKq) {
    if (o.co[CO.SAT_GIO_CHOT]) dua(CO.SAT_GIO_CHOT, 'o', `${o.cum_id}|${o.ma_bcvh}|${o.loai_ngay}`, `${o.cum_ten} → ${o.ma_bcvh}`, o.shbg, o.sat_gio_chot.phut_trung_vi, ng.satGioChotPhut, `Hàng thường đến cách giờ chốt chuyến ${o.sat_gio_chot.phut_trung_vi} phút (dưới ${ng.satGioChotPhut}); có hàng ${o.ngay_co_hang} ngày`);
    if (o.co[CO.SAT_CHI_TIEU]) dua(CO.SAT_CHI_TIEU, 'o', `${o.cum_id}|${o.ma_bcvh}|${o.loai_ngay}`, `${o.cum_ten} → ${o.ma_bcvh}`, o.shbg, o.con_lai.ty_le_duoi_nguong, ng.tyLeNganConLaiPct / 100, `${(o.con_lai.ty_le_duoi_nguong * 100).toFixed(0)}% bưu gửi còn dưới ${ng.conLaiGio} giờ so với chỉ tiêu nếu xe đi đúng lịch (từ ${ng.tyLeNganConLaiPct}%)`);
  }
  the.sort((x, y) => (y.shbg_anh_huong - x.shbg_anh_huong) || (x.co + x.doi_tuong.id < y.co + y.doi_tuong.id ? -1 : 1));
  const tongAh = the.reduce((s, x) => s + x.shbg_anh_huong, 0);
  let lk = 0;
  for (const x of the) { lk += x.shbg_anh_huong; x.luy_ke_pct = tongAh > 0 ? r1((lk / tongAh) * 100) : null; }

  const demCo = (arr, co) => ({ so_doi_tuong: arr.length, so_bi_gan_co: arr.filter((x) => x.co[co]).length, ty_le: arr.length > 0 ? arr.filter((x) => x.co[co]).length / arr.length : null });
  const duDK = cumKq.filter((c) => !c.co[CO.MAU_IT]);
  const duO = oKq.filter((o) => !o.co[CO.MAU_IT]);
  const thongKeCo = {
    [CO.THAT_THUONG]: { don_vi: 'cum', ...demCo(duDK, CO.THAT_THUONG) }, [CO.KHONG_CO_LICH]: { don_vi: 'cum', ...demCo(duDK, CO.KHONG_CO_LICH) }, [CO.NHIEU_KIEN]: { don_vi: 'cum', ...demCo(duDK, CO.NHIEU_KIEN) },
    [CO.CHUYEN_GOM]: { don_vi: 'chuyen', ...demCo(chuyenKq, CO.CHUYEN_GOM) }, [CO.SAT_GIO_CHOT]: { don_vi: 'o', ...demCo(duO, CO.SAT_GIO_CHOT) }, [CO.SAT_CHI_TIEU]: { don_vi: 'o', ...demCo(duO, CO.SAT_CHI_TIEU) },
    [CO.MAU_IT]: { don_vi: 'cum', ...demCo(cumKq, CO.MAU_IT) }
  };
  return {
    moc, mau_so: mau.tong, do_duoc: mau.coMoc, khong_do_duoc: mau.tong - mau.coMoc,
    cum: cumKq, o: can.o ? oKq : [], chuyen: can.chuyen ? chuyenKq : [], the: can.the ? the : [],
    nguong_ap_dung: { ...ng, phan_vi_dao_dong: nguongDaoDong, phan_vi_do_rong_phut: nguongDoRong, so_cum_tinh_nguong: dd.length },
    thong_ke_co: thongKeCo, mau_it: cumKq.filter((c) => c.co[CO.MAU_IT]).map((c) => ({ id: c.id, ten: c.ten, shbg: c.shbg, ghi_chu: 'mẫu ít, chưa kết luận' }))
  };
}

module.exports = {
  MOC_BT, HAI_MOC, MOC_MAC_DINH, NGUONG_MAC_DINH, CO, MUC_CO, NHAN_CO, KIEN, COT,
  thuCua, loaiNgayCua, hhmm, phanVi, nguongTuongDoi, taoBo, gop, chiaBang, dungCum, tinhMoc
};
