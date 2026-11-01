// ==========================================
// Khối «Đánh giá» của trang Đối chiếu (KTT-16-4): hàm THUẦN `taoDanhGiaDoiChieu(nguon)` sinh danh sách nhận xét từ CHÍNH kết quả của /tong-hop, /thoi-gian-nhan, /chua-thay
// (kttDoiChieu.ghepTongHop / ghepThoiGianNhan / ghepChuyenMatDau / ghepChuaThay) cộng hai số mới của KTT-16-4 (chuyển tiếp chưa quét đi, chuyến chậm) và độ phủ KTT-16-1.
// Không đụng DB, không đọc đồng hồ. Mọi số trong câu lấy từ `nguon` (không nhập tay, không ngày / mã cứng); mục nào không đủ điều kiện thì KHÔNG sinh (không bịa).
// Khuôn bám kttDanhGia.js (KTT-5): backend sinh câu; câu trung tính, nêu số, không kết luận nguyên nhân; ngưỡng là hằng số đóng băng ở đầu file.
// Mỗi phần tử: { ma, loai: 'LUU_Y' | 'CANH_BAO' | 'THONG_TIN', tieu_de, noi_dung, so_lieu, sheet (1–6 | null), dieu_kien_hien }.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const DQ = require('./kttDiNgayQuery');
const DC = require('./kttDoiChieu');

const LOAI = Object.freeze({ THONG_TIN: 'THONG_TIN', LUU_Y: 'LUU_Y', CANH_BAO: 'CANH_BAO' });
/** Ngưỡng mục f («đến cùng ngày thấp»): BCVH có >= SO_MAU_TOI_THIEU mẫu, tỷ lệ đến cùng ngày < TY_LE_DUOI và thấp hơn mức chung của các BCVH đang xét ít nhất CHENH_TOI_THIEU. */
const NGUONG_DANH_GIA = Object.freeze({ cungNgayThap: Object.freeze({ SO_MAU_TOI_THIEU: 200, TY_LE_DUOI: 0.95, CHENH_TOI_THIEU: 0.03 }), toiDaNgayChuNhatNeu: 5 });

// ------------------------------------------
// Định dạng
// ------------------------------------------
const hopLe = (x) => typeof x === 'number' && Number.isFinite(x);
const so = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const pt = (tu, mau) => (hopLe(tu) && hopLe(mau) && mau > 0 ? `${String(Math.round((tu / mau) * 1000) / 10).replace('.', ',')}%` : null);
const ptSo = (x) => (hopLe(x) ? `${String(Math.round(x * 1000) / 10).replace('.', ',')}%` : null);
const ngayVn = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const tenBcvh = (ma) => (DQ.TEN_BCVH[ma] ? `${DQ.TEN_BCVH[ma]} (${ma})` : String(ma));
/** 'YYYY-MM-DD…' là Chủ nhật? (không phụ thuộc múi giờ máy chủ). */
const laChuNhat = (chuoi) => {
  const g = typeof chuoi === 'string' ? L.giayCua(`${chuoi.slice(0, 10)} 00:00:00`) : null;
  return g !== null && new Date(g * 1000).getUTCDay() === 0;
};
const lonNhat = (obj) => {
  let tot = null;
  for (const [k, n] of Object.entries(obj || {})) if (n > 0 && (tot === null || n > tot[1] || (n === tot[1] && k < tot[0]))) tot = [k, n];
  return tot;
};
const muc = (ma, loai, tieuDe, noiDung, soLieu, sheet, dieuKien) => ({ ma, loai, tieu_de: tieuDe, noi_dung: noiDung, so_lieu: soLieu, sheet, dieu_kien_hien: dieuKien });

// ------------------------------------------
// Các mục
// ------------------------------------------
function mucA(tc) {
  if (!(tc.tong > 0)) return null;
  const t = tc.trong_cua_so;
  let nd = '';
  if (t > 0) nd = `Nhóm «chưa đi trên 24 giờ» trong cửa sổ kiểm tra được có ${so(t)} SHBG: ${so(tc.tai_dich)} (${pt(tc.tai_dich, t)}) đã có tại BCVH đích, ${so(tc.bcvh_khac)} (${pt(tc.bcvh_khac, t)}) thấy ở BCVH khác, ${so(tc.chua_thay)} (${pt(tc.chua_thay, t)}) chưa thấy ở đâu.`;
  if (tc.ngoai_cua_so > 0) nd += `${nd ? ' ' : ''}${so(tc.ngoai_cua_so)} SHBG nằm ngoài cửa sổ nên chưa kiểm tra được.`;
  return muc('NHOM_CHUA_DI_24H', LOAI.LUU_Y, 'Nhóm chưa đi trên 24 giờ', nd,
    { trong_cua_so: t, tai_dich: tc.tai_dich, bcvh_khac: tc.bcvh_khac, chua_thay: tc.chua_thay, ngoai_cua_so: tc.ngoai_cua_so, tong: tc.tong }, null, 'tap_chinh.tong > 0');
}

function mucB(t1) {
  if (!(t1.tong > 0)) return null;
  const top = lonNhat(t1.theo_bcvh);
  const g = {};
  for (const l of t1.theo_ly_do) {
    const nhom = l.ma === 'KDN_DA_XAC_NHAN' || l.ma === 'KDN_CHUA_XAC_NHAN' ? 'kien_di_ngoai' : l.ma === 'TUI_CHUYEN_TIEP_DA_CHIA_SAN' ? 'tui_chuyen_tiep_da_chia_san' : l.ma === 'TUI_CHUA_QUET_DI' ? 'tui_khai_thac_chua_quet_di' : 'khac';
    g[nhom] = (g[nhom] || 0) + l.so_luong;
  }
  const ten = { kien_di_ngoai: 'kiện đi ngoài', tui_chuyen_tiep_da_chia_san: 'túi chuyển tiếp đã chia sẵn', tui_khai_thac_chua_quet_di: 'túi khai thác đến chưa quét đi', khac: 'khác' };
  const ds = Object.keys(ten).filter((k) => g[k] > 0).map((k) => `${ten[k]} ${so(g[k])}`).join(', ');
  const nd = `${so(t1.tong)} SHBG chưa thấy ở BCVH nào; ${tenBcvh(top[0])} chiếm nhiều nhất (${so(top[1])}, ${pt(top[1], t1.tong)}). Theo lý do: ${ds}.`;
  return muc('CHUA_THAY_O_DAU', LOAI.CANH_BAO, 'Chưa thấy ở đâu', nd,
    { chua_thay: t1.tong, bcvh_nhieu_nhat: top[0], so_bcvh_nhieu_nhat: top[1], theo_bcvh: t1.theo_bcvh, theo_ly_do: g, nghi_duong_tinh_gia: t1.nghi_duong_tinh_gia }, 1, 'nguon_chua_thay.thanh_1.tong > 0');
}

function mucC(md) {
  if (!(md.so_chuyen_mat_dau > 0)) return null;
  const cn = md.danh_sach.filter((c) => laChuNhat(c.gio_lap));
  const ngayCn = [...new Set(cn.map((c) => c.gio_lap.slice(0, 10)))].sort();
  const phan = [];
  if (md.mat_dau_chac.so_chuyen > 0) phan.push(`${so(md.mat_dau_chac.so_chuyen)} chuyến mất dấu chắc (${so(md.mat_dau_chac.so_shbg)} SHBG)`);
  if (md.nghi_thieu_file.so_chuyen > 0) phan.push(`${so(md.nghi_thieu_file.so_chuyen)} chuyến nghi thiếu file BCVH (${so(md.nghi_thieu_file.so_shbg)} SHBG)`);
  let nd = `Có ${phan.join(' và ')}: mọi SHBG của chuyến đều chưa thấy.`;
  if (ngayCn.length > 0) {
    const hien = ngayCn.slice(0, NGUONG_DANH_GIA.toiDaNgayChuNhatNeu).map(ngayVn).join(', ');
    nd += ` ${so(cn.length)} chuyến lập BD10 vào Chủ nhật (${hien}${ngayCn.length > NGUONG_DANH_GIA.toiDaNgayChuNhatNeu ? ` và ${ngayCn.length - NGUONG_DANH_GIA.toiDaNgayChuNhatNeu} ngày khác` : ''}).`;
  }
  return muc('CHUYEN_MAT_DAU', LOAI.LUU_Y, 'Chuyến mất dấu', nd,
    { so_chuyen: md.so_chuyen_mat_dau, mat_dau_chac: md.mat_dau_chac, nghi_thieu_file: md.nghi_thieu_file, so_chuyen_chu_nhat: cn.length, ngay_chu_nhat: ngayCn, tieu_chi: md.tieu_chi }, 2, 'chuyen_mat_dau.so_chuyen_mat_dau > 0');
}

function mucD(ct) {
  if (!(ct.tong > 0)) return null;
  const nd = `${so(ct.tong)} SHBG chuyển tiếp (KTT không mở túi) chưa quét đi sau hơn 24 giờ, trong đó ${so(ct.thuoc_bcvh_hue)} SHBG thuộc 6 BCVH Huế.`;
  return muc('CHUYEN_TIEP_CHUA_QUET_DI', LOAI.THONG_TIN, 'Chuyển tiếp chưa quét đi', nd, { tong: ct.tong, thuoc_bcvh_hue: ct.thuoc_bcvh_hue, khac: ct.khac }, 3, 'chuyen_tiep_chua_quet_di.tong > 0');
}

function mucE(tc) {
  if (!(tc.bcvh_khac > 0)) return null;
  const top = lonNhat(tc.bcvh_khac_theo_noi_den);
  const nd = `${so(tc.bcvh_khac)} SHBG chưa có ở BCVH đích dự kiến nhưng đã thấy ở BCVH khác${top ? `; nơi nhiều nhất: ${tenBcvh(top[0])} (${so(top[1])})` : ''}.`;
  return muc('THAY_O_BCVH_KHAC', LOAI.THONG_TIN, 'Thấy ở BCVH khác', nd, { bcvh_khac: tc.bcvh_khac, theo_noi_den: tc.bcvh_khac_theo_noi_den }, 4, 'tap_chinh.bcvh_khac > 0');
}

function mucF(tg, cham) {
  const N = NGUONG_DANH_GIA.cungNgayThap;
  const chung = tg.tong_cong.ty_le_cung_ngay;
  if (!hopLe(chung)) return null;
  const thap = Object.entries(tg.theo_bcvh)
    .filter(([, x]) => x.mau >= N.SO_MAU_TOI_THIEU && hopLe(x.ty_le_cung_ngay) && x.ty_le_cung_ngay < N.TY_LE_DUOI && chung - x.ty_le_cung_ngay >= N.CHENH_TOI_THIEU)
    .map(([ma, x]) => ({ ma, mau: x.mau, cung_ngay: x.cung_ngay, ty_le_cung_ngay: x.ty_le_cung_ngay }));
  if (thap.length === 0) return null;
  const ct = thap.map((x) => {
    const cc = cham.danh_sach.filter((c) => c.ma_bcvh_dich === x.ma);
    const khung = {};
    for (const c of cc) if (c.gio_lap) khung[c.gio_lap.slice(11, 13)] = (khung[c.gio_lap.slice(11, 13)] || 0) + 1;
    const k = lonNhat(khung);
    return { ...x, so_chuyen_cham: cc.length, khung_gio_lap_nhieu_nhat: k ? k[0] : null, so_chuyen_khung: k ? k[1] : 0 };
  });
  const cau = ct.map((x) => `${tenBcvh(x.ma)} ${ptSo(x.ty_le_cung_ngay)} (${so(x.mau - x.cung_ngay)}/${so(x.mau)} SHBG nhận sang ngày sau)`).join('; ');
  const tong = ct.reduce((s, x) => s + x.so_chuyen_cham, 0);
  let nd = `Đi cùng ngày chưa bằng đến cùng ngày: tỷ lệ BCVH nhận ngay trong ngày lập BD10 đi thấp hơn mức chung ${ptSo(chung)} ở ${cau}.`;
  if (tong > 0) {
    const co = ct.filter((x) => x.khung_gio_lap_nhieu_nhat !== null);
    nd += ` Tại đó có ${so(tong)} chuyến chậm (trung vị trên ${DC.CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO} giờ)${co.length === 1 ? `, nhiều nhất ở khung giờ lập ${co[0].khung_gio_lap_nhieu_nhat}:00 (${so(co[0].so_chuyen_khung)} chuyến)` : ''}.`;
  }
  return muc('DEN_CUNG_NGAY_THAP', LOAI.THONG_TIN, 'Đi cùng ngày chưa bằng đến cùng ngày', nd,
    { ty_le_cung_ngay_chung: chung, bcvh_thap: ct, nguong: N, trung_vi_chuyen_cham_gio_vuot: DC.CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO }, 5,
    `BCVH có >= ${N.SO_MAU_TOI_THIEU} mẫu, tỷ lệ đến cùng ngày < ${ptSo(N.TY_LE_DUOI)} và thấp hơn mức chung >= ${N.CHENH_TOI_THIEU * 100} điểm %`);
}

/** Mục g: chất lượng dữ liệu BCVH từ độ phủ KTT-16-1 (các ngày của yêu cầu, các BCVH đang xét) + độ trễ âm của thoi-gian-nhan. */
function mucG({ doPhu, ngays, maBcvh, thoiGianNhan }) {
  const tapNgay = new Set(ngays);
  let khongFile = 0; let chiRong = 0; let dong = 0; let thieuMoc = 0;
  const bcvhThieu = {};
  for (const b of doPhu.bcvh) {
    if (maBcvh && b.ma !== maBcvh) continue;
    for (const d of b.theo_ngay) {
      if (!tapNgay.has(d.ngay)) continue;
      if (d.trang_thai === 'KHONG_CO_FILE') { khongFile++; bcvhThieu[b.ma] = (bcvhThieu[b.ma] || 0) + 1; }
      else if (d.trang_thai === 'CHI_FILE_RONG') { chiRong++; bcvhThieu[b.ma] = (bcvhThieu[b.ma] || 0) + 1; }
      if (hopLe(d.so_dong) && d.so_dong > 0 && hopLe(d.ty_le_thieu_gio_nhan)) { dong += d.so_dong; thieuMoc += d.ty_le_thieu_gio_nhan * d.so_dong; }
    }
  }
  const am = thoiGianNhan.tong_cong.am;
  const tyThieu = dong > 0 ? thieuMoc / dong : null;
  if (khongFile === 0 && chiRong === 0 && !(am > 0) && !(tyThieu > 0)) return null;
  const phan = [];
  if (khongFile + chiRong > 0) phan.push(`${so(khongFile + chiRong)} lượt (BCVH, ngày) không có file hoặc chỉ có file rỗng (${so(khongFile)} không có file, ${so(chiRong)} file rỗng), nên «chưa thấy» ở các ngày đó có thể là dương tính giả`);
  if (am > 0) phan.push(`${so(am)} SHBG có mốc BCVH nhận trước giờ lập BD10 đi`);
  if (tyThieu > 0) phan.push(`${ptSo(tyThieu)} dòng «Hàng đến BCVH» thiếu mốc xác nhận đến`);
  return muc('CHAT_LUONG_DU_LIEU_BCVH', LOAI.LUU_Y, 'Chất lượng dữ liệu BCVH', `Dữ liệu BCVH: ${phan.join('; ')}.`,
    { luot_khong_co_file: khongFile, luot_chi_file_rong: chiRong, theo_bcvh_thieu_file: bcvhThieu, so_shbg_do_tre_am: am, ty_le_thieu_moc_xac_nhan: tyThieu, so_dong_bcvh_do: dong }, null,
    'có (BCVH, ngày) không có file / chỉ file rỗng, hoặc có độ trễ âm, hoặc có dòng BCVH thiếu mốc xác nhận');
}

function mucH(t2) {
  if (!(t2.tong > 0)) return null;
  const ten = { chuyen_tiep: 'kiện đi ngoài', da_chia_san: 'túi chuyển tiếp đã chia sẵn', khai_thac: 'túi khai thác' };
  const nguon = t2.chua_thay.theo_nguon.map((n) => `${ten[n.ma] || n.nhan} ${so(n.so_luong)}`).join(', ');
  let nd = `${so(t2.tong)} SHBG đã ghi đi nhưng thiếu giờ quét túi đến ở KTT: ${so(t2.da_thay.tong)} đã thấy ở BCVH, ${so(t2.chua_thay.tong)} chưa thấy`;
  if (t2.ngoai_cua_so > 0) nd += `, ${so(t2.ngoai_cua_so)} ngoài cửa sổ`;
  nd += '.';
  if (nguon) nd += ` Chưa thấy theo nguồn: ${nguon}.`;
  return muc('THIEU_GIO_QUET_DEN', LOAI.THONG_TIN, 'Thiếu giờ quét túi đến ở KTT', nd,
    { tong: t2.tong, da_thay: t2.da_thay.tong, chua_thay: t2.chua_thay.tong, ngoai_cua_so: t2.ngoai_cua_so, theo_nguon: t2.chua_thay.theo_nguon }, null, 'thieu_gio_quet_den.tong > 0');
}

/**
 * nguon: { tongHop (ghepTongHop), thoiGianNhan (ghepThoiGianNhan), chuaThay: { chuyen_mat_dau, nguon_chua_thay }, chuyenTiep (ghepChuyenTiepChuaQuet), chuyenCham (ghepChuyenCham),
 *          doPhu, ngays, maBcvh }. Trả mảng mục (thứ tự a–h), bỏ mục không đủ điều kiện.
 */
function taoDanhGiaDoiChieu(nguon) {
  const tc = nguon.tongHop.tong_cong.tap_chinh;
  return [
    mucA(tc), mucB(nguon.chuaThay.nguon_chua_thay.thanh_1), mucC(nguon.chuaThay.chuyen_mat_dau), mucD(nguon.chuyenTiep), mucE(tc),
    mucF(nguon.thoiGianNhan, nguon.chuyenCham), mucG(nguon), mucH(nguon.chuaThay.nguon_chua_thay.thieu_gio_quet_den)
  ].filter(Boolean);
}

module.exports = { LOAI, NGUONG_DANH_GIA, taoDanhGiaDoiChieu };
