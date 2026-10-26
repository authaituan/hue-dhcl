// ==========================================
// Khối «Đánh giá» của «Hàng tại KTT» (KTT-5): hàm THUẦN `taoDanhGia(tongHop, tuyChon)` sinh danh sách nhận xét có số liệu từ kết quả `tongHopKtt` (kttQuery.js).
// Không đụng DB, không đọc đồng hồ. Mọi số trong câu lấy từ `tongHop` (không nhập tay); mỗi nhận xét chỉ sinh khi có số liệu (mẫu số > 0).
// Câu văn trung tính: nêu số, không kết luận lỗi cá nhân; «treo» và «nằm lâu» gắn câu «KTT cần kiểm tra và giải trình».
// Mỗi phần tử: { ma, mucDo: 'THONG_TIN' | 'LUU_Y' | 'CANH_BAO', cau, soLieu, loc }, `loc` = bộ lọc cho `chiTiet` ({ loai, maBcvh?, ngay? }) hoặc null.
// ==========================================
'use strict';
const { DIA_BAN_PHAT_MAC_DINH } = require('./kttSchema');

// Ngưỡng mức độ và ngưỡng «ngày bất thường» (cấu hình ở đây; có thể ghi đè một phần qua `tuyChon.nguong`).
//  - dungChuyen*: tỷ lệ đúng chuyến ≥ Tot -> THONG_TIN; ≥ CanhBao -> LUU_Y; thấp hơn -> CANH_BAO.
//  - treChuyenCanhBao: (đi chuyến sau + lỡ chuyến) / đã chấm ≥ ngưỡng -> CANH_BAO; > 0 -> LUU_Y.
//  - denSatGioSangChuyenKeLuuY: tỷ lệ «sang chuyến kế» trong hàng đến sát giờ ≥ ngưỡng -> LUU_Y.
//  - treoCanhBaoTyLe: treo / số túi xét ≥ ngưỡng, hoặc có túi treo trên 3 ngày -> CANH_BAO; còn treo -> LUU_Y.
//  - namLau*: nằm lâu / hàng đã đi đích BCVH Huế: ≥ CanhBao -> CANH_BAO; ≥ LuuY -> LUU_Y.
//  - xndSauGioDi*, quetDenSauGioDi*, khongRoDich*: tương tự (tỷ lệ so với mẫu số của từng câu).
//  - batThuong: ngày i bất thường khi tỷ lệ_i − TB(các ngày còn lại) > max(doLechChuan × độ lệch chuẩn(các ngày còn lại), chenhLechToiThieu);
//    chỉ xét ngày có ≥ soDonToiThieuMoiNgay đơn vị, và chỉ khi có ≥ soNgayToiThieu ngày như vậy.
const NGUONG_DANH_GIA = Object.freeze({
  dungChuyenTot: 0.9,
  dungChuyenCanhBao: 0.75,
  treChuyenCanhBao: 0.1,
  denSatGioSangChuyenKeLuuY: 0.5,
  treoCanhBaoTyLe: 0.05,
  namLauLuuY: 0.05,
  namLauCanhBao: 0.2,
  xndSauGioDiLuuY: 0.02,
  xndSauGioDiCanhBao: 0.1,
  quetDenSauGioDiLuuY: 0.02,
  quetDenSauGioDiCanhBao: 0.1,
  khongRoDichCanhBao: 0.05,
  quyAmCanhBao: 0.2,
  batThuong: Object.freeze({ soNgayToiThieu: 4, soDonToiThieuMoiNgay: 20, doLechChuan: 2, chenhLechToiThieu: 0.1 })
});

const MUC_DO = Object.freeze({ THONG_TIN: 'THONG_TIN', LUU_Y: 'LUU_Y', CANH_BAO: 'CANH_BAO' });
const TEN_BCVH = new Map(DIA_BAN_PHAT_MAC_DINH.map(([ma, ten]) => [ma, ten]));
const TEN_CHUYEN = { SANG: 'sáng', TRUA: 'trưa', TOI: 'tối' };
const THU_TU_CHUYEN = { SANG: 0, TRUA: 1, TOI: 2 };
const DON_VI = { TUI: 'túi', SHBG: 'bưu gửi' };
const CAU_GIAI_TRINH = 'KTT cần kiểm tra và giải trình.';

// ------------------------------------------
// Định dạng
// ------------------------------------------
const hopLe = (x) => typeof x === 'number' && Number.isFinite(x);
const tyLe = (a, b) => (hopLe(a) && hopLe(b) && b > 0 ? a / b : null);
const phanTram = (x) => `${String(Math.round(x * 1000) / 10).replace('.', ',')}%`;
const ptCua = (a, b) => phanTram(tyLe(a, b));
const ngayVn = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const tenBcvh = (ma) => (TEN_BCVH.has(ma) ? `${TEN_BCVH.get(ma)} (${ma})` : ma === 'KHONG_RO_BCVH' ? 'chưa rõ BCVH' : String(ma));
const gio = (phut) => (phut % 60 === 0 ? `${phut / 60} giờ` : `${phut} phút`);
const tong = (ds, f) => ds.reduce((s, x) => s + (hopLe(f(x)) ? f(x) : 0), 0);
const mang = (x) => (Array.isArray(x) ? x : []);
const NGUON_THU_TU = ['CHUYEN_TIEP_DI', 'KHAI_THAC_LAI'];
const donViCua = (nguon) => (nguon === 'CHUYEN_TIEP_DI' ? DON_VI.TUI : DON_VI.SHBG);
const moTaNguon = (nguon) => (nguon === 'CHUYEN_TIEP_DI' ? 'túi chuyển tiếp đi' : 'bưu gửi khai thác lại');

function mucTheoTyLe(x, luuY, canhBao) {
  if (x >= canhBao) return MUC_DO.CANH_BAO;
  if (x >= luuY) return MUC_DO.LUU_Y;
  return MUC_DO.THONG_TIN;
}

// ------------------------------------------
// Ngày bất thường: so một ngày với MẶT BẰNG CÁC NGÀY CÒN LẠI (không để chính ngày đó kéo trung bình / độ lệch lên)
// ------------------------------------------
/**
 * `ds` = [{ ngay, tu, mau }] (tu: số đơn vị «xấu», mau: số đơn vị xét). Trả các ngày bất thường [{ ngay, tu, mau, tyLe, trungBinhKhac, doLechChuanKhac }], tỷ lệ cao nhất trước.
 * Ngày i bất thường ⇔ tyLe_i − trungBinh(các ngày còn lại) > max(doLechChuan × độLệchChuẩn(các ngày còn lại), chenhLechToiThieu). Chỉ ngày có mau ≥ soDonToiThieuMoiNgay; cần ≥ soNgayToiThieu ngày như vậy.
 */
function ngayBatThuong(ds, cfg) {
  const dung = mang(ds).filter((x) => x && typeof x.ngay === 'string' && hopLe(x.tu) && hopLe(x.mau) && x.mau >= cfg.soDonToiThieuMoiNgay);
  if (dung.length < cfg.soNgayToiThieu) return [];
  const ra = [];
  for (const x of dung) {
    const khac = dung.filter((y) => y !== x).map((y) => y.tu / y.mau);
    const tb = khac.reduce((s, v) => s + v, 0) / khac.length;
    const lech = Math.sqrt(khac.reduce((s, v) => s + (v - tb) * (v - tb), 0) / khac.length);
    const r = x.tu / x.mau;
    if (r - tb > Math.max(cfg.doLechChuan * lech, cfg.chenhLechToiThieu)) {
      ra.push({ ngay: x.ngay, tu: x.tu, mau: x.mau, tyLe: r, trungBinhKhac: tb, doLechChuanKhac: lech });
    }
  }
  return ra.sort((a, b) => b.tyLe - a.tyLe || (a.ngay < b.ngay ? -1 : 1));
}

// ------------------------------------------
// Từng nhóm nhận xét
// ------------------------------------------
function nhanXetDungChuyen(chuyen, ng, ra) {
  const hang = mang(chuyen.theoBcvhChuyen);
  for (const nguon of NGUON_THU_TU) {
    const ds = hang.filter((x) => x.nguon === nguon);
    const dung = tong(ds, (x) => x.DUNG_CHUYEN);
    const daCham = dung + tong(ds, (x) => x.TRE_CHUYEN) + tong(ds, (x) => x.LO_CHUYEN);
    if (!(daCham > 0)) continue;
    const dv = donViCua(nguon);
    const r = dung / daCham;
    // theo BCVH: tỷ lệ thấp nhất (chỉ nêu khi có từ hai BCVH)
    const theo = new Map();
    for (const x of ds) {
      const a = theo.get(x.maBcvh) || { maBcvh: x.maBcvh, dung: 0, daCham: 0 };
      a.dung += x.DUNG_CHUYEN; a.daCham += x.DUNG_CHUYEN + x.TRE_CHUYEN + x.LO_CHUYEN;
      theo.set(x.maBcvh, a);
    }
    const bcvh = [...theo.values()].filter((a) => a.daCham > 0).sort((a, b) => a.dung / a.daCham - b.dung / b.daCham || (a.maBcvh < b.maBcvh ? -1 : 1));
    let cau = `Hàng đi đúng chuyến (${moTaNguon(nguon)}): ${dung}/${daCham} ${dv} (${ptCua(dung, daCham)}) đi đúng chuyến.`;
    if (bcvh.length >= 2) cau += ` Thấp nhất: ${tenBcvh(bcvh[0].maBcvh)} ${bcvh[0].dung}/${bcvh[0].daCham} (${ptCua(bcvh[0].dung, bcvh[0].daCham)}).`;
    ra.push({
      ma: `DUNG_CHUYEN_${nguon}`, mucDo: r >= ng.dungChuyenTot ? MUC_DO.THONG_TIN : r >= ng.dungChuyenCanhBao ? MUC_DO.LUU_Y : MUC_DO.CANH_BAO, cau,
      soLieu: { nguon, donVi: dv, dungChuyen: dung, daCham, tyLe: r, theoBcvh: bcvh.map((a) => ({ maBcvh: a.maBcvh, dungChuyen: a.dung, daCham: a.daCham })) },
      loc: daCham > dung ? { loai: 'tre_chuyen' } : null
    });
  }
}

function nhanXetTheoGio(chuyen, ra) {
  const hang = mang(chuyen.theoGioQuetDen);
  for (const nguon of NGUON_THU_TU) {
    const theoGio = new Map();
    for (const x of hang.filter((h) => h.nguon === nguon && hopLe(h.gio) && h.tong > 0)) {
      const a = theoGio.get(x.gio) || { gio: x.gio, tong: 0, chuyen: [] };
      a.tong += x.tong; a.chuyen.push(x);
      theoGio.set(x.gio, a);
    }
    if (!theoGio.size) continue;
    const ds = [...theoGio.values()];
    const coNhieuChuyen = ds.filter((a) => a.chuyen.length >= 2);
    const chon = (coNhieuChuyen.length ? coNhieuChuyen : ds).sort((a, b) => b.tong - a.tong || a.gio - b.gio)[0];
    const c = chon.chuyen.slice().sort((a, b) => b.tong - a.tong || THU_TU_CHUYEN[a.chuyen] - THU_TU_CHUYEN[b.chuyen]);
    const dv = donViCua(nguon);
    let cau = `Quét đến ${chon.gio} giờ: ${c[0].tong} ${dv} vào chuyến ${TEN_CHUYEN[c[0].chuyen]}`;
    if (c.length >= 2) {
      const sau = c[1];
      cau += sau.tong < c[0].tong && THU_TU_CHUYEN[sau.chuyen] < THU_TU_CHUYEN[c[0].chuyen]
        ? `, chỉ ${sau.tong} ${dv} kịp chuyến ${TEN_CHUYEN[sau.chuyen]}`
        : `, ${sau.tong} ${dv} vào chuyến ${TEN_CHUYEN[sau.chuyen]}`;
    }
    cau += ` (${moTaNguon(nguon)}, giờ có nhiều ${dv} nhất).`;
    const tre = tong(chon.chuyen, (x) => x.treChuyen);
    ra.push({
      ma: `DUNG_CHUYEN_THEO_GIO_${nguon}`, mucDo: MUC_DO.THONG_TIN, cau,
      soLieu: { nguon, donVi: dv, gioQuetDen: chon.gio, tong: chon.tong, theoChuyen: c.map((x) => ({ chuyen: x.chuyen, tong: x.tong, dungChuyen: x.dungChuyen, treChuyen: x.treChuyen })) },
      loc: tre > 0 ? { loai: 'tre_chuyen' } : null
    });
  }
}

function nhanXetTre(chuyen, ng, ra) {
  const hang = mang(chuyen.theoBcvhChuyen);
  for (const nguon of NGUON_THU_TU) {
    const ds = hang.filter((x) => x.nguon === nguon);
    const dung = tong(ds, (x) => x.DUNG_CHUYEN);
    const tre = tong(ds, (x) => x.TRE_CHUYEN);
    const lo = tong(ds, (x) => x.LO_CHUYEN);
    const daCham = dung + tre + lo;
    if (!(daCham > 0)) continue;
    const dv = donViCua(nguon);
    const tre2 = tong(ds, (x) => x.treTu2Ngay);
    const cau = tre + lo === 0
      ? `Hàng đi trễ (${moTaNguon(nguon)}): không có ${dv} nào đi chuyến sau hoặc lỡ chuyến trong ${daCham} ${dv} đã chấm.`
      : `Hàng đi trễ (${moTaNguon(nguon)}): ${tre} ${dv} đi chuyến sau (${tre2} ${dv} đi muộn từ 2 ngày), ${lo} ${dv} lỡ chuyến (chưa đi dù đã quá mốc), trên ${daCham} ${dv} đã chấm.`;
    const r = (tre + lo) / daCham;
    ra.push({
      ma: `DI_TRE_${nguon}`,
      mucDo: tre + lo === 0 ? MUC_DO.THONG_TIN : r >= ng.treChuyenCanhBao ? MUC_DO.CANH_BAO : MUC_DO.LUU_Y,
      cau,
      soLieu: { nguon, donVi: dv, daCham, treChuyen: tre, treTu2Ngay: tre2, loChuyen: lo, tyLe: r },
      loc: tre > 0 ? { loai: 'tre_chuyen' } : lo > 0 ? { loai: 'lo_chuyen' } : null
    });
  }
}

function nhanXetSatGio(chuyen, ng, ra) {
  const hang = mang(chuyen.denSatGio);
  const chot = mang(chuyen.chotTruocPhut);
  const khoang = chot.length === 1 ? `${chot[0]} phút cuối trước mốc chuyến` : 'khoảng chốt cuối trước mốc chuyến';
  for (const nguon of NGUON_THU_TU) {
    const ds = hang.filter((x) => x.nguon === nguon);
    const sat = tong(ds, (x) => x.soDenSatGio);
    if (!(sat > 0)) continue;
    const kip = tong(ds, (x) => x.kipChuyenSat);
    const sang = tong(ds, (x) => x.sangChuyenKe);
    const chua = tong(ds, (x) => x.chuaDi);
    const dv = donViCua(nguon);
    let cau = `Đến sát giờ (${moTaNguon(nguon)}): ${sat} ${dv} quét đến trong ${khoang}; ${kip} (${ptCua(kip, sat)}) kịp chuyến, ${sang} (${ptCua(sang, sat)}) sang chuyến kế`;
    cau += chua > 0 ? `, ${chua} chưa đi.` : '.';
    ra.push({
      ma: `DEN_SAT_GIO_${nguon}`, mucDo: sang / sat >= ng.denSatGioSangChuyenKeLuuY ? MUC_DO.LUU_Y : MUC_DO.THONG_TIN, cau,
      soLieu: { nguon, donVi: dv, denSatGio: sat, kipChuyenSat: kip, sangChuyenKe: sang, chuaDi: chua, tyLeKip: kip / sat, tyLeSangChuyenKe: sang / sat },
      loc: { loai: 'den_sat_gio' }
    });
  }
}

const NHAN_LOAI_TREO = { CHUA_QUET_DI: 'chưa quét đi', CHUA_MO_TUI: 'chưa mở túi' };
function nhanXetTreo(treo, ng, ra) {
  const tongXet = tong(mang(treo.theoNgay), (x) => x.tong);
  const tuiTreo = treo.tong && hopLe(treo.tong.tui) ? treo.tong.tui : 0;
  if (!(tongXet > 0) && !(tuiTreo > 0)) return;
  if (!(tuiTreo > 0)) {
    ra.push({ ma: 'TREO', mucDo: MUC_DO.THONG_TIN, cau: `Treo: không có túi nào treo trong ${tongXet} túi đã xét.`, soLieu: { tui: 0, shbg: 0, tongXet }, loc: null });
    return;
  }
  const shbg = treo.tong.shbg || 0;
  const loai = ['CHUA_QUET_DI', 'CHUA_MO_TUI']
    .map((l) => ({ loai: l, tui: tong(mang(treo.theoLoai).filter((x) => x.loai === l), (x) => x.tui) }))
    .filter((x) => x.tui > 0);
  const tren3N = tong(mang(treo.theoTuoi).filter((x) => x.tuoi === 'T_TREN_3N'), (x) => x.tui);
  const nhieuNhat = mang(treo.theoBcvh).filter((x) => x.maBcvh !== 'KHONG_RO_BCVH')[0] || null;
  const nguong = hopLe(treo.treoPhut) ? ` quá ${gio(treo.treoPhut)}` : '';
  let cau = `Treo: ${tuiTreo} túi (${shbg} bưu gửi) có mã quét đến mà chưa có bước tiếp theo${nguong}`;
  if (loai.length) cau += ` (${loai.map((x) => `${NHAN_LOAI_TREO[x.loai]} ${x.tui} túi`).join(', ')})`;
  cau += `; ${tren3N} túi treo trên 3 ngày`;
  if (nhieuNhat) cau += `; BCVH đích nhiều nhất: ${tenBcvh(nhieuNhat.maBcvh)} ${nhieuNhat.tui} túi`;
  cau += `. ${CAU_GIAI_TRINH}`;
  const r = tyLe(tuiTreo, tongXet);
  ra.push({
    ma: 'TREO',
    mucDo: tren3N > 0 || (r !== null && r >= ng.treoCanhBaoTyLe) ? MUC_DO.CANH_BAO : MUC_DO.LUU_Y,
    cau,
    soLieu: { tui: tuiTreo, shbg, tongXet, tyLe: r, tren3Ngay: tren3N, theoLoai: loai, bcvhNhieuNhat: nhieuNhat ? { maBcvh: nhieuNhat.maBcvh, tui: nhieuNhat.tui } : null },
    loc: { loai: 'treo' }
  });
}

const BAC_NHAN = { A_DEN_3H: 'đến 3 giờ', B_3_6H: '3–6 giờ', C_6_12H: '6–12 giờ', D_12_24H: '12–24 giờ', E_TREN_24H: 'trên 24 giờ', AM: 'quét đến sau giờ đi' };
function nhanXetNamLau(namLau, ng, ra) {
  const hang = mang(namLau.theoBac);
  for (const nguon of NGUON_THU_TU) {
    const ds = hang.filter((x) => x.nguon === nguon && x.nhom === 'BCVH_HUE');
    const daDi = tong(ds, (x) => x.soDon);
    if (!(daDi > 0)) continue;
    const dv = donViCua(nguon);
    const nl = tong(ds, (x) => x.namLau);
    const theoBac = Object.keys(BAC_NHAN).map((b) => ({ bac: b, soDon: tong(ds.filter((x) => x.bac === b), (x) => x.soDon), namLau: tong(ds.filter((x) => x.bac === b), (x) => x.namLau) }));
    const dem = { soDon: tong(ds.filter((x) => x.caQuet === 'DEM'), (x) => x.soDon), namLau: tong(ds.filter((x) => x.caQuet === 'DEM'), (x) => x.namLau) };
    const ngay = { soDon: tong(ds.filter((x) => x.caQuet === 'NGAY'), (x) => x.soDon), namLau: tong(ds.filter((x) => x.caQuet === 'NGAY'), (x) => x.namLau) };
    const nguongGio = hopLe(namLau.namLauToiDaPhut) ? gio(namLau.namLauToiDaPhut) : null;
    let cau = `Nằm lâu (${moTaNguon(nguon)}): ${nl}/${daDi} ${dv} đã đi (${ptCua(nl, daDi)}) nằm lâu (đi trễ chuyến${nguongGio ? ` hoặc nằm quá ${nguongGio}` : ''}).`;
    const bacCo = theoBac.filter((b) => b.soDon > 0);
    if (bacCo.length) cau += ` Theo bậc giờ nằm: ${bacCo.map((b) => `${BAC_NHAN[b.bac]} ${b.soDon}`).join(', ')}.`;
    if (dem.soDon > 0 && ngay.soDon > 0) cau += ` Quét đến ban đêm: ${dem.namLau}/${dem.soDon} (${ptCua(dem.namLau, dem.soDon)}); ban ngày: ${ngay.namLau}/${ngay.soDon} (${ptCua(ngay.namLau, ngay.soDon)}).`;
    cau += ` ${CAU_GIAI_TRINH}`;
    ra.push({
      ma: `NAM_LAU_${nguon}`, mucDo: mucTheoTyLe(nl / daDi, ng.namLauLuuY, ng.namLauCanhBao), cau,
      soLieu: { nguon, donVi: dv, daDi, namLau: nl, tyLe: nl / daDi, theoBac, dem, ngay },
      loc: nl > 0 ? { loai: 'nam_lau' } : null
    });
  }
}

function nhanXetBatThuong(tongHop, ng, ra) {
  const cfg = ng.batThuong;
  const treo = ngayBatThuong(mang((tongHop.tonTreo || {}).theoNgay).map((x) => ({ ngay: x.ngay, tu: x.treo, mau: x.tong })), cfg);
  const theoNgay = new Map();
  for (const x of mang((tongHop.chuyen || {}).theoNgay)) {
    const a = theoNgay.get(x.ngay) || { ngay: x.ngay, tu: 0, mau: 0 };
    a.tu += (x.treChuyen || 0) + (x.loChuyen || 0); a.mau += x.daCham || 0;
    theoNgay.set(x.ngay, a);
  }
  const tre = ngayBatThuong([...theoNgay.values()], cfg);
  const mo = (ds, ten, loai) => {
    if (!ds.length) return;
    const nhin = ds.slice(0, 3);
    const cau = `Ngày bất thường về ${ten}: ${nhin.map((d) => `${ngayVn(d.ngay)} (${phanTram(d.tyLe)}, ${d.tu}/${d.mau}; trung bình các ngày còn lại ${phanTram(d.trungBinhKhac)})`).join('; ')}.`;
    ra.push({
      ma: `BAT_THUONG_NGAY_${loai.toUpperCase()}`, mucDo: MUC_DO.LUU_Y, cau,
      soLieu: { ngay: nhin.map((d) => ({ ngay: d.ngay, tu: d.tu, mau: d.mau, tyLe: d.tyLe, trungBinhKhac: d.trungBinhKhac, doLechChuanKhac: d.doLechChuanKhac })) },
      loc: { loai, ngay: nhin[0].ngay }
    });
  };
  mo(treo, 'tỷ lệ treo', 'treo');
  mo(tre, 'tỷ lệ hàng đi trễ hoặc lỡ chuyến', 'tre_chuyen');
}

function nhanXetXndSauGioDi(chiTieu, ng, ra) {
  const t = chiTieu.tongCong;
  if (!t) return;
  const sau = t.XND_SAU_GIO_DI || 0;
  const mau = (t.soDoDuoc || 0) + sau;
  if (!(mau > 0)) return;
  const r = sau / mau;
  ra.push({
    ma: 'XND_SAU_GIO_DI', mucDo: sau === 0 ? MUC_DO.THONG_TIN : mucTheoTyLe(r, ng.xndSauGioDiLuuY, ng.xndSauGioDiCanhBao),
    cau: sau === 0
      ? `Xác nhận đến sau giờ BD10 đi: không có bưu gửi nào trong ${mau} bưu gửi đo được chỉ tiêu F1.3.`
      : `Xác nhận đến sau giờ BD10 đi: ${sau}/${mau} bưu gửi (${phanTram(r)}) trong số bưu gửi đo được chỉ tiêu F1.3 (đích BCVH Huế); không tính thời gian thực.`,
    soLieu: { donVi: DON_VI.SHBG, xndSauGioDi: sau, mau, tyLe: r },
    loc: sau > 0 ? { loai: 'xnd_sau_gio_di' } : null
  });
}

function nhanXetQuetDenSauGioDi(namLau, ng, ra) {
  for (const nguon of NGUON_THU_TU) {
    const ds = mang(namLau.theoBac).filter((x) => x.nguon === nguon);
    const daDi = tong(ds, (x) => x.soDon);
    if (!(daDi > 0)) continue;
    const am = tong(ds.filter((x) => x.bac === 'AM'), (x) => x.soDon);
    const dv = donViCua(nguon);
    const r = am / daDi;
    ra.push({
      ma: `QUET_DEN_SAU_GIO_DI_${nguon}`, mucDo: am === 0 ? MUC_DO.THONG_TIN : mucTheoTyLe(r, ng.quetDenSauGioDiLuuY, ng.quetDenSauGioDiCanhBao),
      cau: am === 0
        ? `Quét đến sau giờ BD10 đi (${moTaNguon(nguon)}): không có ${dv} nào trong ${daDi} ${dv} đã đi.`
        : `Quét đến sau giờ BD10 đi (${moTaNguon(nguon)}): ${am}/${daDi} ${dv} đã đi (${phanTram(r)}); giữ nguyên số liệu nguồn, không chỉnh mốc.`,
      soLieu: { nguon, donVi: dv, quetDenSauGioDi: am, daDi, tyLe: r },
      loc: am > 0 ? { loai: 'quet_den_sau_gio_di' } : null
    });
  }
}

const NHAN_QUY = { AM: 'âm (quá chỉ tiêu)', T0_2H: '0–2 giờ', T2_6H: '2–6 giờ', TREN_6H: 'trên 6 giờ' };
function nhanXetF13(chiTieu, ng, ra) {
  const t = chiTieu.tongCong;
  if (!t || !(t.soDoDuoc > 0) || !t.quy) return;
  const am = t.quy.AM || 0;
  const cau = `Chỉ tiêu F1.3: ${t.soDoDuoc} bưu gửi đo được; quỹ thời gian còn lại: ${Object.keys(NHAN_QUY).map((k) => `${NHAN_QUY[k]} ${t.quy[k] || 0}`).join(', ')}.`;
  ra.push({
    ma: 'CHI_TIEU_F13', mucDo: am === 0 ? MUC_DO.THONG_TIN : (am / t.soDoDuoc >= ng.quyAmCanhBao ? MUC_DO.CANH_BAO : MUC_DO.LUU_Y), cau,
    soLieu: { donVi: DON_VI.SHBG, soDoDuoc: t.soDoDuoc, quy: { ...t.quy }, tyLeAm: am / t.soDoDuoc }, loc: null
  });
}

function nhanXetChatLuong(cl, ng, ra) {
  if (!cl) return;
  if (cl.shbgKhongRoDich > 0 && cl.shbgKhaiThacLai > 0) {
    const r = cl.shbgKhongRoDich / cl.shbgKhaiThacLai;
    ra.push({
      ma: 'CHAT_LUONG_KHONG_RO_DICH', mucDo: r >= ng.khongRoDichCanhBao ? MUC_DO.CANH_BAO : MUC_DO.LUU_Y,
      cau: `Chất lượng dữ liệu: ${cl.shbgKhongRoDich}/${cl.shbgKhaiThacLai} bưu gửi (${phanTram(r)}) không rõ đích (chưa vào BD10 đi và không tra được phường/xã); chưa chấm chỉ tiêu F1.3 và chuyến, vẫn tính sản lượng.`,
      soLieu: { donVi: DON_VI.SHBG, khongRoDich: cl.shbgKhongRoDich, tong: cl.shbgKhaiThacLai, tyLe: r }, loc: { loai: 'khong_ro_dich' }
    });
  }
  if (cl.bd10DenChuaXacNhan > 0 && cl.bd10Den > 0) {
    ra.push({
      ma: 'CHAT_LUONG_BD10_CHUA_XND', mucDo: MUC_DO.LUU_Y,
      cau: `Chất lượng dữ liệu: ${cl.bd10DenChuaXacNhan}/${cl.bd10Den} BD10 đến chưa có xác nhận đến (${ptCua(cl.bd10DenChuaXacNhan, cl.bd10Den)}); các bưu gửi thuộc BD10 này chưa đo được chỉ tiêu F1.3 nếu thiếu cả xác nhận ở mức bưu gửi.`,
      soLieu: { bd10DenChuaXacNhan: cl.bd10DenChuaXacNhan, bd10Den: cl.bd10Den, tyLe: cl.bd10DenChuaXacNhan / cl.bd10Den }, loc: null
    });
  }
  const ktl = (cl.shbgCanKiemTraLai || 0) + (cl.tuiCanKiemTraLai || 0);
  if (ktl > 0) {
    ra.push({
      ma: 'CHAT_LUONG_CAN_KIEM_TRA_LAI', mucDo: MUC_DO.LUU_Y,
      cau: `Chất lượng dữ liệu: ${cl.shbgCanKiemTraLai || 0} bưu gửi và ${cl.tuiCanKiemTraLai || 0} túi có hai mốc cách nhau quá 7 ngày («Cần kiểm tra lại»); không tính vào thống kê chính.`,
      soLieu: { shbg: cl.shbgCanKiemTraLai || 0, tui: cl.tuiCanKiemTraLai || 0 }, loc: { loai: 'can_kiem_tra_lai' }
    });
  }
}

const CHUOI_XAU = /NaN|undefined|Infinity|\[object/;

/**
 * Sinh danh sách nhận xét từ kết quả `tongHopKtt`. `tuyChon.nguong` ghi đè một phần NGUONG_DANH_GIA (kể cả `batThuong`).
 * Đầu vào rỗng / khoảng ngày không có số liệu -> mảng rỗng. Câu nào chứa NaN / undefined / Infinity bị loại (không bao giờ trả câu sai).
 */
function taoDanhGia(tongHop, tuyChon) {
  if (!tongHop || typeof tongHop !== 'object') return [];
  const nguong = { ...NGUONG_DANH_GIA, ...((tuyChon && tuyChon.nguong) || {}) };
  nguong.batThuong = { ...NGUONG_DANH_GIA.batThuong, ...((tuyChon && tuyChon.nguong && tuyChon.nguong.batThuong) || {}) };
  const chuyen = tongHop.chuyen || {};
  const ra = [];
  nhanXetDungChuyen(chuyen, nguong, ra);
  nhanXetTheoGio(chuyen, ra);
  nhanXetTre(chuyen, nguong, ra);
  nhanXetSatGio(chuyen, nguong, ra);
  nhanXetTreo(tongHop.tonTreo || {}, nguong, ra);
  nhanXetNamLau(tongHop.namLau || {}, nguong, ra);
  nhanXetBatThuong(tongHop, nguong, ra);
  nhanXetXndSauGioDi(tongHop.chiTieuF13 || {}, nguong, ra);
  nhanXetQuetDenSauGioDi(tongHop.namLau || {}, nguong, ra);
  nhanXetF13(tongHop.chiTieuF13 || {}, nguong, ra);
  nhanXetChatLuong(tongHop.chatLuongDuLieu, nguong, ra);
  return ra.filter((x) => !CHUOI_XAU.test(x.cau));
}

module.exports = { NGUONG_DANH_GIA, MUC_DO, CAU_GIAI_TRINH, taoDanhGia, ngayBatThuong };
