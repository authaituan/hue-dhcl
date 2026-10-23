// ==========================================
// Lõi THUẦN tính toán «Hàng tại KTT» (KTT-4): đích, chỉ tiêu F1.3, thời gian nằm, chuyến, «đến sát giờ», «nằm lâu», «treo».
// Quy tắc: KTT-quy-tac-tinh.md (V1, PO chốt 23/10/2026) mục 2, 3, 4, 5, 8. Dữ liệu nguồn: docs/ai/36_KTT_TU_DIEN_DU_LIEU.md.
// Không đụng DB, không require module nào ngoài ./quyThoiGian (đã có docGiay, thoiGianThucGiay, quyConLaiGiay, CHI_TIEU_GIO). Chưa gắn vào API.
//
// Quy ước:
//  - Giờ là chuỗi giờ địa phương `YYYY-MM-DD HH:MM:SS` (như DB). Đọc bằng docGiay; mọi phép trừ bằng GIÂY UTC cố định, không làm tròn, không phụ thuộc TZ máy.
//    Không dùng hàm phân tích chuỗi ngày của JS. Giây -> chuỗi (dinhDangGiay) tính bằng số học thuần.
//  - KHÔNG chỉnh mốc: số âm và NULL là kết quả hợp lệ, có nhãn riêng, không đổi về 0.
//  - Chỉ chấm F1.3 và chuyến cho hàng có đích là một trong 6 BCVH Huế. Đích khác: chỉ trả giờ nằm.
//  - Không đối chiếu dữ liệu phát phía BCVH. «Treo» là bằng chứng KTT không làm đúng quy trình, không phải tồn thật.
//  - `bay_gio` (giờ hiện tại, cùng dạng chuỗi) do bên gọi truyền vào: hàm không đọc đồng hồ. Thiếu cả `gioDi` lẫn `bay_gio` -> nhãn THIEU_BAY_GIO / KHONG_AP_DUNG.
// ==========================================
'use strict';
const { docGiay, thoiGianThucGiay, quyConLaiGiay, CHI_TIEU_GIO } = require('./quyThoiGian');

const MA_KTT = '530100';
const MA_HE1 = '530900';
const MA_BCVH_HUE = Object.freeze(['535790', '536250', '535470', '537220', '537015', '533140']);
const NHOM_DICH = Object.freeze({ BCVH_HUE: 'BCVH_HUE', HE1_530900: 'HE1_530900', KTT: 'KTT', KHAC: 'KHAC', KHONG_RO: 'KHONG_RO' });

// Phường Thuận Hóa / Phú Xuân (theo bảng địa bàn): chỉ tiêu 12 giờ thay vì 14 giờ.
const PHUONG_THUAN_HOA_PHU_XUAN = Object.freeze(['49135', '49133']);

// Mặc định khi thiếu ngưỡng; bằng dữ liệu mặc định V1 của ktt_cau_hinh (server/lib/kttSchema.js).
const NGUONG_MAC_DINH = Object.freeze({ treoPhut: 180, namLauToiDaPhut: 1440, chiTieuF13Gio: CHI_TIEU_GIO.F1_3, chiTieuF13GioThuanHoaPhuXuan: 12 });

const GIAY_NGAY = 86400;
const GIAY_7_NGAY = 7 * GIAY_NGAY;
const SO_NGAY_TOI_THIEU = 4;
const SO_NGAY_TOI_DA = 400;

const maChuoi = (x) => (x === null || x === undefined ? '' : String(x).trim());
// Ngưỡng thiếu / rỗng / không phải số dương -> mặc định.
const nguongHopLe = (nguong, khoa) => {
  const tho = nguong ? nguong[khoa] : null;
  const v = tho === null || tho === undefined || tho === '' ? NaN : Number(tho);
  return Number.isFinite(v) && v > 0 ? v : NGUONG_MAC_DINH[khoa];
};

const hai = (n) => String(n).padStart(2, '0');
/** Số giây UTC cố định -> `YYYY-MM-DD HH:MM:SS` (tính lịch dương thuần số học, không dùng đối tượng ngày của JS). */
function dinhDangGiay(giay) {
  const ngay = Math.floor(giay / GIAY_NGAY);
  const r = giay - ngay * GIAY_NGAY;
  // ngày kể từ 1970-01-01 -> năm / tháng / ngày (thuật toán civil_from_days)
  const z = ngay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${hai(m)}-${hai(d)} ${hai(Math.floor(r / 3600))}:${hai(Math.floor((r % 3600) / 60))}:${hai(r % 60)}`;
}

/** Điểm kết thúc đo: `gioDi` nếu đã đi (đọc được), ngược lại `bay_gio`. { giay, daDi } hoặc null. */
function mocKetThuc(gioDi, bayGio) {
  const di = docGiay(gioDi);
  if (di !== null) return { giay: di, daDi: true };
  const bg = docGiay(bayGio);
  return bg === null ? null : { giay: bg, daDi: false };
}

// ------------------------------------------
// Đích
// ------------------------------------------
function nhomTuMa(ma) {
  if (MA_BCVH_HUE.includes(ma)) return { nhom: NHOM_DICH.BCVH_HUE, maBcvh: ma };
  if (ma === MA_HE1) return { nhom: NHOM_DICH.HE1_530900, maBcvh: null };
  if (ma === MA_KTT) return { nhom: NHOM_DICH.KTT, maBcvh: null };
  return { nhom: NHOM_DICH.KHAC, maBcvh: null };
}

/**
 * Phân nhóm đích của một túi / bưu gửi. Ưu tiên: đã có BD10 đi -> `maNhanBd10Di`; chưa có -> tra `maPhuongXa` trong `bangPhuongXa` ({ maPhuong: maBcvh });
 * không tra được -> KHONG_RO (không chấm F1.3, vẫn tính sản lượng và khối lượng). `chieu`, `maNhanTui` được nhận nhưng V1 chưa dùng (theo ticket KTT-4).
 * Trả { nhom: 'BCVH_HUE' | 'HE1_530900' | 'KTT' | 'KHAC' | 'KHONG_RO', maBcvh: mã BCVH Huế | null, nguon: 'BD10_DI' | 'PHUONG_XA' | null }.
 */
function phanNhomDich({ maNhanBd10Di, maPhuongXa, bangPhuongXa } = {}) {
  const maDi = maChuoi(maNhanBd10Di);
  if (maDi) return { ...nhomTuMa(maDi), nguon: 'BD10_DI' };
  const phuong = maChuoi(maPhuongXa);
  const tra = phuong && bangPhuongXa && Object.prototype.hasOwnProperty.call(bangPhuongXa, phuong) ? maChuoi(bangPhuongXa[phuong]) : '';
  if (!tra) return { nhom: NHOM_DICH.KHONG_RO, maBcvh: null, nguon: null };
  return { ...nhomTuMa(tra), nguon: 'PHUONG_XA' };
}

// ------------------------------------------
// Chỉ tiêu F1.3 (thời gian thực trừ khung 21:00–07:00, QUYTG-2)
// ------------------------------------------
/**
 * Mốc bắt đầu = `xnd` (xác nhận đến sớm nhất); mốc kết thúc = `gioDi`, chưa đi thì `bay_gio`.
 * trangThai: DO_DUOC | XND_SAU_GIO_DI (hiệu số âm, không tính quỹ) | CHUA_XAC_NHAN_DEN (xnd rỗng) | CAN_KIEM_TRA_LAI (hai mốc cách nhau > 7 ngày)
 *            | KHONG_CHAM (đích không phải BCVH Huế) | THIEU_BAY_GIO (chưa đi và không có bay_gio).
 * Trả { trangThai, daQuaGiay (giây thực, trừ khung; có thể âm), conLaiGiay (quỹ; null khi không tính), chiTieuGio }.
 */
function tinhChiTieu({ xnd, gioDi, bay_gio: bayGio, maBcvh, maPhuong, nguong } = {}) {
  const thuanHoa = PHUONG_THUAN_HOA_PHU_XUAN.includes(maChuoi(maPhuong));
  const chiTieuGio = thuanHoa ? nguongHopLe(nguong, 'chiTieuF13GioThuanHoaPhuXuan') : nguongHopLe(nguong, 'chiTieuF13Gio');
  const khong = (trangThai) => ({ trangThai, daQuaGiay: null, conLaiGiay: null, chiTieuGio });
  if (!MA_BCVH_HUE.includes(maChuoi(maBcvh))) return khong('KHONG_CHAM');
  const dau = docGiay(xnd);
  if (dau === null) return khong('CHUA_XAC_NHAN_DEN');
  const cuoi = mocKetThuc(gioDi, bayGio);
  if (!cuoi) return khong('THIEU_BAY_GIO');
  const daQuaGiay = thoiGianThucGiay(xnd, dinhDangGiay(cuoi.giay));
  if (Math.abs(cuoi.giay - dau) > GIAY_7_NGAY) {
    return { trangThai: 'CAN_KIEM_TRA_LAI', daQuaGiay, conLaiGiay: chiTieuGio * 3600 - daQuaGiay, chiTieuGio };
  }
  if (cuoi.giay < dau) return { trangThai: 'XND_SAU_GIO_DI', daQuaGiay, conLaiGiay: null, chiTieuGio };
  return { trangThai: 'DO_DUOC', daQuaGiay, conLaiGiay: quyConLaiGiay(xnd, dinhDangGiay(cuoi.giay), chiTieuGio), chiTieuGio };
}

// ------------------------------------------
// Thời gian nằm và độ trễ xác nhận (đồng hồ liên tục, KHÔNG trừ khung đêm)
// ------------------------------------------
/** Giây liên tục từ `quetDen` (mã 4) đến `gioDi` (chưa đi: `bay_gio`). trangThai: DO_DUOC | QUET_DEN_SAU_GIO_DI (âm) | KHONG_CO_MOC_QUET_DEN | THIEU_BAY_GIO. Trả { trangThai, giay, daDi }. */
function namThucTe({ quetDen, gioDi, bay_gio: bayGio } = {}) {
  const dau = docGiay(quetDen);
  if (dau === null) return { trangThai: 'KHONG_CO_MOC_QUET_DEN', giay: null, daDi: false };
  const cuoi = mocKetThuc(gioDi, bayGio);
  if (!cuoi) return { trangThai: 'THIEU_BAY_GIO', giay: null, daDi: false };
  const giay = cuoi.giay - dau;
  return { trangThai: giay < 0 ? 'QUET_DEN_SAU_GIO_DI' : 'DO_DUOC', giay, daDi: cuoi.daDi };
}

/** Độ trễ xác nhận = `xnd − quetDen` giây liên tục (chỉ để xem; có thể âm). Trả { trangThai: 'DO_DUOC' | 'THIEU_MOC', giay }. */
function doTreXacNhan({ quetDen, xnd } = {}) {
  const a = docGiay(quetDen);
  const b = docGiay(xnd);
  if (a === null || b === null) return { trangThai: 'THIEU_MOC', giay: null };
  return { trangThai: 'DO_DUOC', giay: b - a };
}

/** Bậc nằm lâu theo số giây: AM (< 0) | A_DEN_3H (≤ 3 giờ) | B_3_6H | C_6_12H | D_12_24H | E_TREN_24H; null/không phải số -> KHONG_RO. Biên: bậc cao hơn chỉ khi VƯỢT mốc. */
function phanBacNamLau(giay) {
  if (typeof giay !== 'number' || !Number.isFinite(giay)) return 'KHONG_RO';
  if (giay < 0) return 'AM';
  if (giay <= 3 * 3600) return 'A_DEN_3H';
  if (giay <= 6 * 3600) return 'B_3_6H';
  if (giay <= 12 * 3600) return 'C_6_12H';
  if (giay <= 24 * 3600) return 'D_12_24H';
  return 'E_TREN_24H';
}

// ------------------------------------------
// Chuyến
// ------------------------------------------
/** Danh sách mốc chuyến (giây UTC cố định, tăng dần) của các ngày [ngayDau, ngayDau + soNgay): mỗi mục { ten, moc (giây), chotTruocPhut }. Mục lịch sai dạng bị bỏ. */
function sinhMocChuyen(lich, ngayDauGiay, soNgay) {
  const mauMoc = [];
  for (const c of lich || []) {
    const m = /^(\d{2}):(\d{2})$/.exec(maChuoi(c && c.gioMoc));
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) continue;
    const chot = Number.isFinite(Number(c.chotTruocPhut)) ? Number(c.chotTruocPhut) : 0;
    mauMoc.push({ ten: c.ten, giayTrongNgay: Number(m[1]) * 3600 + Number(m[2]) * 60, chotTruocPhut: chot });
  }
  const ds = [];
  for (let k = 0; k < soNgay; k++) {
    for (const c of mauMoc) ds.push({ ten: c.ten, moc: ngayDauGiay + k * GIAY_NGAY + c.giayTrongNgay, chotTruocPhut: c.chotTruocPhut });
  }
  return ds.sort((a, b) => a.moc - b.moc);
}

const chuyenRa = (c) => (c ? { ten: c.ten, moc: dinhDangGiay(c.moc) } : null);

/**
 * Đánh giá chuyến của một hàng đích BCVH Huế. `cauHinh` = kết quả docCauHinhKtt (dùng `cauHinh.lich[maBcvh]`).
 * Chuyến đáng lẽ đi = chuyến SỚM NHẤT có `mốc − chotTruocPhut ≥ quetDen`. Mốc sinh theo ngày, từ ngày quét đến, tối thiểu 4 ngày và đủ phủ tới `gioDi` / `bay_gio`.
 * trangThai: DUNG_CHUYEN (đã đi, gioDi ≤ mốc dự kiến) | TRE_CHUYEN (đã đi sau mốc dự kiến) | LO_CHUYEN (chưa đi, bay_gio > mốc dự kiến) | CHUA_DEN_MOC | KHONG_AP_DUNG (+ lyDo).
 * soChuyenTre = số mốc m với mốcDựKiến ≤ m < gioDi (TRE_CHUYEN) hoặc < bay_gio (LO_CHUYEN); các trạng thái khác 0; KHONG_AP_DUNG null.
 * denSatGio = quetDen ∈ (mốc − chot, mốc] của một chuyến (chuyến đó coi là lỡ); kipChuyenSat = gioDi ≤ mốc của chuyến sát giờ đó, null khi không sát giờ hoặc chưa đi.
 * Trả { trangThai, lyDo, chuyenDuKien: { ten, moc } | null, soChuyenTre, denSatGio, kipChuyenSat, chuyenSatGio: { ten, moc } | null, gioDiTruocQuetDen }.
 */
function danhGiaChuyen({ quetDen, gioDi, bay_gio: bayGio, maBcvh, cauHinh } = {}) {
  const khongApDung = (lyDo) => ({ trangThai: 'KHONG_AP_DUNG', lyDo, chuyenDuKien: null, soChuyenTre: null, denSatGio: false, kipChuyenSat: null, chuyenSatGio: null, gioDiTruocQuetDen: false });
  const ma = maChuoi(maBcvh);
  if (!MA_BCVH_HUE.includes(ma)) return khongApDung('DICH_KHONG_PHAI_BCVH_HUE');
  const lich = cauHinh && cauHinh.lich && cauHinh.lich[ma];
  if (!Array.isArray(lich) || !lich.length) return khongApDung('KHONG_CO_LICH');
  const quet = docGiay(quetDen);
  if (quet === null) return khongApDung('THIEU_MOC_QUET_DEN');
  const di = docGiay(gioDi);
  const bayGioGiay = docGiay(bayGio);
  if (di === null && bayGioGiay === null) return khongApDung('THIEU_BAY_GIO');

  const ngayDau = Math.floor(quet / GIAY_NGAY) * GIAY_NGAY;
  const cuoi = di !== null ? di : bayGioGiay;
  const soNgay = Math.min(SO_NGAY_TOI_DA, Math.max(SO_NGAY_TOI_THIEU, Math.floor((cuoi - ngayDau) / GIAY_NGAY) + 2));
  const mocs = sinhMocChuyen(lich, ngayDau, soNgay);
  const duKien = mocs.find((c) => c.moc - c.chotTruocPhut * 60 >= quet);
  if (!duKien) return khongApDung('KHONG_CO_LICH');
  const satGio = mocs.find((c) => quet > c.moc - c.chotTruocPhut * 60 && quet <= c.moc) || null;

  let trangThai;
  let soChuyenTre = 0;
  if (di !== null) {
    if (di <= duKien.moc) trangThai = 'DUNG_CHUYEN';
    else { trangThai = 'TRE_CHUYEN'; soChuyenTre = mocs.filter((c) => c.moc >= duKien.moc && c.moc < di).length; }
  } else if (bayGioGiay > duKien.moc) {
    trangThai = 'LO_CHUYEN';
    soChuyenTre = mocs.filter((c) => c.moc >= duKien.moc && c.moc < bayGioGiay).length;
  } else trangThai = 'CHUA_DEN_MOC';

  return {
    trangThai,
    lyDo: null,
    chuyenDuKien: chuyenRa(duKien),
    soChuyenTre,
    denSatGio: !!satGio,
    kipChuyenSat: satGio && di !== null ? di <= satGio.moc : null,
    chuyenSatGio: chuyenRa(satGio),
    gioDiTruocQuetDen: di !== null && di < quet
  };
}

// ------------------------------------------
// Nằm lâu (chỉ hàng ĐÃ đi)
// ------------------------------------------
/**
 * NAM_LAU khi chuyến TRE_CHUYEN hoặc `giayNam > namLauToiDaPhut × 60`; ngược lại BINH_THUONG. Đích không phải BCVH Huế, chưa đi, thiếu / âm giờ nằm -> KHONG_DANH_GIA (kèm lyDo).
 * `danhGiaChuyen` = kết quả của danhGiaChuyen (chỉ đọc `.trangThai`). Trả { trangThai, lyDo }.
 */
function trangThaiNamLau({ nhomDich, gioDi, giayNam, danhGiaChuyen: chuyen, nguong } = {}) {
  if (nhomDich !== NHOM_DICH.BCVH_HUE) return { trangThai: 'KHONG_DANH_GIA', lyDo: 'DICH_KHONG_PHAI_BCVH_HUE' };
  if (docGiay(gioDi) === null) return { trangThai: 'KHONG_DANH_GIA', lyDo: 'CHUA_DI' };
  if (chuyen && chuyen.trangThai === 'TRE_CHUYEN') return { trangThai: 'NAM_LAU', lyDo: 'TRE_CHUYEN' };
  if (typeof giayNam !== 'number' || !Number.isFinite(giayNam)) return { trangThai: 'KHONG_DANH_GIA', lyDo: 'THIEU_SO_LIEU' };
  if (giayNam < 0) return { trangThai: 'KHONG_DANH_GIA', lyDo: 'GIO_NAM_AM' };
  if (giayNam > nguongHopLe(nguong, 'namLauToiDaPhut') * 60) return { trangThai: 'NAM_LAU', lyDo: 'QUA_NGUONG' };
  return { trangThai: 'BINH_THUONG', lyDo: null };
}

// ------------------------------------------
// Treo (bằng chứng KTT không làm đúng quy trình)
// ------------------------------------------
function phanBacTuoi(giay) {
  if (giay < 3 * 3600) return 'DUOI_3H'; // chỉ xảy ra khi treoPhut cấu hình < 180
  if (giay <= 12 * 3600) return 'T_3_12H';
  if (giay <= 24 * 3600) return 'T_12_24H';
  if (giay <= 3 * GIAY_NGAY) return 'T_1_3N';
  return 'T_TREN_3N';
}

/**
 * Hàng có mã quét đến (mã 4) mà không có dấu hiệu đã xử lý tiếp, nằm quá `treoPhut` (đồng hồ liên tục, nghiêm ngặt: đúng ngưỡng chưa treo).
 *  - CHUA_QUET_DI: chiều CHUYEN_TIEP_DI, đích khác 530900, không mã 3 (coQuetDi), không BD10 đi (coBd10Di).
 *  - CHUA_MO_TUI: chiều DEN (MỌI luồng, kể cả DI_NGOAI và KHAI_THAC_DEN; `luong` được nhận nhưng không xét), không mở túi (coMoTui). Túi chiều đi (kể cả KHAI_THAC_DI) không thuộc loại này.
 *  - CHUA_DEN_NGUONG: thuộc hai loại trên nhưng chưa nằm quá ngưỡng; KHONG_CO_MOC_QUET_DEN: thuộc hai loại trên nhưng thiếu mã 4; THIEU_BAY_GIO; KHONG_TREO: các hàng còn lại.
 * Trả { trangThai, tuoiGiay (bay_gio − quetDen; null khi không đo được), tuoi: bậc tuổi chỉ khi treo (T_3_12H | T_12_24H | T_1_3N | T_TREN_3N) }.
 */
function trangThaiTreo({ chieu, luong, nhomDich, quetDen, coMoTui, coQuetDi, coBd10Di, bay_gio: bayGio, nguong } = {}) {
  const ra = (trangThai, tuoiGiay = null, tuoi = null) => ({ trangThai, tuoiGiay, tuoi });
  let loai = null;
  if (chieu === 'CHUYEN_TIEP_DI' && nhomDich !== NHOM_DICH.HE1_530900 && !coQuetDi && !coBd10Di) loai = 'CHUA_QUET_DI';
  else if (chieu === 'DEN' && !coMoTui) loai = 'CHUA_MO_TUI';
  if (!loai) return ra('KHONG_TREO');
  const quet = docGiay(quetDen);
  if (quet === null) return ra('KHONG_CO_MOC_QUET_DEN');
  const bg = docGiay(bayGio);
  if (bg === null) return ra('THIEU_BAY_GIO');
  const tuoiGiay = bg - quet;
  if (tuoiGiay <= nguongHopLe(nguong, 'treoPhut') * 60) return ra('CHUA_DEN_NGUONG', tuoiGiay);
  return ra(loai, tuoiGiay, phanBacTuoi(tuoiGiay));
}

module.exports = {
  MA_KTT, MA_HE1, MA_BCVH_HUE, NHOM_DICH, PHUONG_THUAN_HOA_PHU_XUAN, NGUONG_MAC_DINH,
  dinhDangGiay, phanNhomDich, tinhChiTieu, namThucTe, doTreXacNhan, phanBacNamLau, sinhMocChuyen, danhGiaChuyen, trangThaiNamLau, trangThaiTreo
};
