// ==========================================
// «Hàng tại KTT» (KTT-7a): LỊCH CHUYẾN CHÍNH THỨC (giờ xe RỜI KTT, có ngày chạy) và các hàm THUẦN xếp một lượt hàng vào chuyến.
// Tài liệu: docs/ai/40_KTT_LICH_CHUYEN.md. Lịch lưu ở ktt_lich_chuyen, tham số ở ktt_lich_cau_hinh (schema: server/lib/kttSchema.js).
// Các hàm xepChuyen / chuyenTrongNgay / danhGiaDiChuyen KHÔNG đọc DB, KHÔNG dùng giờ máy, KHÔNG đổi đầu vào. Chỉ docLichChuyen đọc DB (không ném lỗi).
// Giờ nghiệp vụ là chuỗi `YYYY-MM-DD HH:MM:SS` giờ VN (như DB), tự tách chuỗi; thứ trong tuần và cộng ngày bằng Date.UTC(số) nên kết quả giống nhau ở mọi múi giờ.
// KTT-7a CHƯA nối vào kttQuery / kttTinh / kttDanhGia: các module đó vẫn dùng lịch V1 (ktt_cau_hinh_chuyen) đến KTT-7b.
// ==========================================
'use strict';
const { DIA_BAN_PHAT_MAC_DINH } = require('./kttSchema');

const MA_BCVH_HUE = Object.freeze(DIA_BAN_PHAT_MAC_DINH.map((b) => b[0])); // sáu BCVH Huế
const HAN_DEN_TRUOC_CHUYEN_PHUT = 60;
const SO_NGAY_TIM_TOI_DA = 7; // sau ngày đến, tìm tối đa chừng này ngày kế
const KHOA_HAN = 'han_den_truoc_chuyen_phut';
const LY_DO = Object.freeze({ KHONG_PHAI_BCVH_HUE: 'KHONG_PHAI_BCVH_HUE', THIEU_GIO_DEN: 'THIEU_GIO_DEN', GIO_DEN_SAI: 'GIO_DEN_SAI', KHONG_CO_LICH: 'KHONG_CO_LICH' });
const TRANG_THAI = Object.freeze({ DUNG_CHUYEN: 'DUNG_CHUYEN', TRUOT_CHUYEN: 'TRUOT_CHUYEN', CHUA_DEN_GIO: 'CHUA_DEN_GIO', LO_CHUYEN: 'LO_CHUYEN' });

const RE_GIO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;
const RE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** 'YYYY-MM-DD HH:MM:SS' (có thể có phần ms, bị cắt) -> số giây kể từ gốc (cùng hệ quy chiếu, KHÔNG phải mốc UTC thật), hoặc null nếu sai dạng / ngày giờ không có thật. */
function giayCua(chuoi) {
  const m = RE_GIO.exec(String(chuoi ?? '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
}
/** Số giây -> 'YYYY-MM-DD HH:MM:SS'. */
const dinhDang = (giay) => { const ms = giay * 1000; return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); };
const ngayCua = (giay) => dinhDang(giay).slice(0, 10);
const gocNgay = (ymd) => giayCua(`${ymd} 00:00:00`);
/** Ngày 'YYYY-MM-DD' + n ngày -> 'YYYY-MM-DD'. */
const congNgay = (ymd, n) => ngayCua(gocNgay(ymd) + n * 86400);
/** 0 = Chủ nhật … 6 = Thứ bảy. */
const thuCua = (ymd) => new Date(gocNgay(ymd) * 1000).getUTCDay();

function chuanHanPhut(tuyChon) {
  const v = tuyChon && tuyChon.hanDenTruocChuyenPhut;
  return Number.isFinite(v) && v >= 0 ? v : HAN_DEN_TRUOC_CHUYEN_PHUT;
}

/** Dòng lịch hợp lệ và đang dùng? lich: [{ ma_bcvh, gio_xuat_phat 'HH:MM', ngay_chay 'CA_TUAN' | 'NGHI_CN', nhan?, dang_dung? (mặc định đang dùng) }]. */
const dongDungDuoc = (r) => !!r && RE_HHMM.test(String(r.gio_xuat_phat)) && (r.ngay_chay === 'CA_TUAN' || r.ngay_chay === 'NGHI_CN') && !(r.dang_dung === 0 || r.dang_dung === false);

function dungChuyen(r, ymd, hanPhut) {
  const xuatPhat = gocNgay(ymd) + (Number(r.gio_xuat_phat.slice(0, 2)) * 60 + Number(r.gio_xuat_phat.slice(3, 5))) * 60;
  return {
    ma_bcvh: r.ma_bcvh, ngay: ymd, gio_xuat_phat: r.gio_xuat_phat, xuat_phat_luc: dinhDang(xuatPhat), han_den_luc: dinhDang(xuatPhat - hanPhut * 60), nhan: r.nhan ?? null,
    _giayHan: xuatPhat - hanPhut * 60
  };
}
const boTam = ({ _giayHan, ...c }) => c;

/** Các chuyến của BCVH chạy trong ngày `ngay` ('YYYY-MM-DD'), đã loại dòng nghỉ Chủ nhật vào Chủ nhật và dòng tắt, sắp tăng theo giờ. Ngày sai dạng -> []. */
function chuyenTrongNgay(lich, maBcvh, ngay, tuyChon) {
  if (giayCua(`${ngay} 00:00:00`) === null || !/^\d{4}-\d{2}-\d{2}$/.test(String(ngay))) return [];
  const hanPhut = chuanHanPhut(tuyChon);
  const cn = thuCua(ngay) === 0;
  return (lich || []).filter((r) => dongDungDuoc(r) && r.ma_bcvh === maBcvh && !(cn && r.ngay_chay === 'NGHI_CN'))
    .map((r) => dungChuyen(r, ngay, hanPhut)).sort((a, b) => (a.gio_xuat_phat < b.gio_xuat_phat ? -1 : a.gio_xuat_phat > b.gio_xuat_phat ? 1 : 0)).map(boTam);
}

/**
 * Xếp một lượt hàng vào chuyến. gioDen = Gio_quet_tui_den ('YYYY-MM-DD HH:MM:SS' giờ VN). tuyChon: { hanDenTruocChuyenPhut (mặc định 60) }.
 * Chuyến thuộc = chuyến SỚM NHẤT của BCVH, từ ngày đến, có gioDen ≤ han_den_luc (= giờ rời KTT − hạn; đến đúng hạn vẫn kịp). Hết chuyến trong ngày đến thì sang ngày kế
 * (bỏ ngày chuyến không chạy), tối đa SO_NGAY_TIM_TOI_DA ngày kế, quá thì KHONG_CO_LICH.
 * Trả { ok: true, chuyen: { ma_bcvh, ngay, gio_xuat_phat, xuat_phat_luc, han_den_luc, nhan }, qua_dem } hoặc { ok: false, ly_do }.
 */
function xepChuyenKhongDem(lich, maBcvh, gioDen, tuyChon) {
  if (!MA_BCVH_HUE.includes(maBcvh)) return { ok: false, ly_do: LY_DO.KHONG_PHAI_BCVH_HUE };
  if (gioDen === null || gioDen === undefined || String(gioDen).trim() === '') return { ok: false, ly_do: LY_DO.THIEU_GIO_DEN };
  const giayDen = giayCua(gioDen);
  if (giayDen === null) return { ok: false, ly_do: LY_DO.GIO_DEN_SAI };
  const hanPhut = chuanHanPhut(tuyChon);
  const ngayDen = ngayCua(giayDen);
  for (let i = 0; i <= SO_NGAY_TIM_TOI_DA; i++) {
    const ngay = congNgay(ngayDen, i);
    const cn = thuCua(ngay) === 0;
    const ung = (lich || []).filter((r) => dongDungDuoc(r) && r.ma_bcvh === maBcvh && !(cn && r.ngay_chay === 'NGHI_CN'))
      .map((r) => dungChuyen(r, ngay, hanPhut)).sort((a, b) => a._giayHan - b._giayHan);
    const trung = ung.find((c) => giayDen <= c._giayHan);
    if (trung) return { ok: true, chuyen: boTam(trung), qua_dem: trung.ngay !== ngayDen };
  }
  return { ok: false, ly_do: LY_DO.KHONG_CO_LICH };
}

// KTT-8: BỘ NHỚ ĐỆM của xepChuyen trong MỘT lần tính. Khóa ngoài = chính mảng `lich` (WeakMap: mỗi lần docLichChuyen trả mảng mới nên bộ nhớ chết cùng lần tính; không giữ giữa các
// lần gọi API), khóa trong = (BCVH, giờ quét đến, hạn). Nhiều SHBG cùng túi / cùng giờ quét đến chỉ xếp MỘT lần. Kết quả trả về được ĐÓNG BĂNG (dùng chung giữa các lần gọi). Nếu số dòng của
// `lich` đổi giữa hai lần gọi thì bỏ bộ nhớ. KHÔNG đổi quy tắc: xepChuyenKhongDem cho kết quả y hệt (có test so khớp).
const BO_NHO_XEP = new WeakMap();
const BO_NHO_TOI_DA = 50000;
const dongBang = (v) => { if (v && typeof v === 'object') { for (const k of Object.keys(v)) dongBang(v[k]); Object.freeze(v); } return v; };
function xepChuyen(lich, maBcvh, gioDen, tuyChon) {
  if (!Array.isArray(lich) || typeof maBcvh !== 'string' || typeof gioDen !== 'string') return xepChuyenKhongDem(lich, maBcvh, gioDen, tuyChon);
  let b = BO_NHO_XEP.get(lich);
  if (!b || b.n !== lich.length) { b = { n: lich.length, m: new Map() }; BO_NHO_XEP.set(lich, b); }
  const khoa = `${maBcvh}|${gioDen}|${chuanHanPhut(tuyChon)}`;
  let r = b.m.get(khoa);
  if (r === undefined) {
    r = dongBang(xepChuyenKhongDem(lich, maBcvh, gioDen, tuyChon));
    if (b.m.size >= BO_NHO_TOI_DA) b.m.clear();
    b.m.set(khoa, r);
  }
  return r;
}

/**
 * Đánh giá đi chuyến. { chuyen (từ xepChuyen), gioLapBd10Di (bd10_di_gio_di), bayGio (bắt buộc khi chưa có BD10 đi; hàm KHÔNG tự lấy giờ máy), gioDen? (Gio_quet_tui_den, để gắn cờ) }.
 * Có giờ lập BD10 đi: DUNG_CHUYEN nếu ≤ xuat_phat_luc, ngược lại TRUOT_CHUYEN; di_truoc_khi_den = true nếu giờ lập < gioDen (KTT-7b tách riêng nhóm này).
 * Chưa có BD10 đi: CHUA_DEN_GIO nếu bayGio ≤ xuat_phat_luc, ngược lại LO_CHUYEN. Đầu vào sai -> { trang_thai: null, ly_do }.
 */
function danhGiaDiChuyen({ chuyen, gioLapBd10Di, bayGio, gioDen } = {}) {
  const xuatPhat = chuyen ? giayCua(chuyen.xuat_phat_luc) : null;
  if (xuatPhat === null) return { trang_thai: null, ly_do: 'CHUYEN_SAI' };
  const coBd10 = !(gioLapBd10Di === null || gioLapBd10Di === undefined || String(gioLapBd10Di).trim() === '');
  if (coBd10) {
    const lap = giayCua(gioLapBd10Di);
    if (lap === null) return { trang_thai: null, ly_do: 'GIO_BD10_SAI' };
    const den = gioDen === null || gioDen === undefined || String(gioDen).trim() === '' ? null : giayCua(gioDen);
    return { trang_thai: lap <= xuatPhat ? TRANG_THAI.DUNG_CHUYEN : TRANG_THAI.TRUOT_CHUYEN, di_truoc_khi_den: den !== null && lap < den };
  }
  const bay = giayCua(bayGio);
  if (bay === null) return { trang_thai: null, ly_do: bayGio === null || bayGio === undefined || String(bayGio).trim() === '' ? 'THIEU_BAY_GIO' : 'BAY_GIO_SAI' };
  return { trang_thai: bay <= xuatPhat ? TRANG_THAI.CHUA_DEN_GIO : TRANG_THAI.LO_CHUYEN, di_truoc_khi_den: false };
}

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);

/**
 * Đọc lịch từ DB (CHỈ ĐỌC). KHÔNG ném lỗi: thiếu / hỏng bảng -> lịch rỗng (hoặc hạn mặc định 60) kèm canhBao.
 * Trả { lich: [{ ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung }] (gồm cả dòng tắt; sắp theo mã, giờ), hanDenTruocChuyenPhut, canhBao: [string] }.
 */
function docLichChuyen(db) {
  const canhBao = [];
  let lich = [];
  let han = HAN_DEN_TRUOC_CHUYEN_PHUT;
  try {
    if (!coBang(db, 'ktt_lich_chuyen')) canhBao.push('Thiếu bảng ktt_lich_chuyen: lịch chuyến để trống.');
    else {
      const dong = db.prepare('SELECT ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung FROM ktt_lich_chuyen ORDER BY ma_bcvh, gio_xuat_phat').all();
      for (const r of dong) {
        if (!dongDungDuoc({ ...r, dang_dung: 1 })) { canhBao.push(`Bỏ qua dòng lịch chuyến không hợp lệ của BCVH ${String(r.ma_bcvh).slice(0, 10)}.`); continue; }
        lich.push({ ma_bcvh: r.ma_bcvh, gio_xuat_phat: r.gio_xuat_phat, ngay_chay: r.ngay_chay, nhan: r.nhan ?? null, dang_dung: Number(r.dang_dung) === 0 ? 0 : 1 });
      }
      if (!dong.length) canhBao.push('Bảng ktt_lich_chuyen chưa có dòng nào: lịch chuyến để trống.');
    }
  } catch (e) {
    lich = [];
    canhBao.push('Không đọc được ktt_lich_chuyen: lịch chuyến để trống.');
  }
  try {
    if (!coBang(db, 'ktt_lich_cau_hinh')) canhBao.push(`Thiếu bảng ktt_lich_cau_hinh: dùng ${KHOA_HAN} mặc định ${HAN_DEN_TRUOC_CHUYEN_PHUT}.`);
    else {
      const r = db.prepare('SELECT gia_tri FROM ktt_lich_cau_hinh WHERE khoa = ?').get(KHOA_HAN);
      if (!r) canhBao.push(`Thiếu khóa ${KHOA_HAN}: dùng mặc định ${HAN_DEN_TRUOC_CHUYEN_PHUT}.`);
      else if (typeof r.gia_tri === 'number' && Number.isFinite(r.gia_tri) && r.gia_tri >= 0) han = r.gia_tri;
      else canhBao.push(`Giá trị ${KHOA_HAN} không hợp lệ: dùng mặc định ${HAN_DEN_TRUOC_CHUYEN_PHUT}.`);
    }
  } catch (e) {
    canhBao.push('Không đọc được ktt_lich_cau_hinh: dùng hạn mặc định.');
  }
  return { lich, hanDenTruocChuyenPhut: han, canhBao };
}

module.exports = {
  MA_BCVH_HUE, HAN_DEN_TRUOC_CHUYEN_PHUT, SO_NGAY_TIM_TOI_DA, LY_DO, TRANG_THAI,
  giayCua, dinhDang, xepChuyen, xepChuyenKhongDem, chuyenTrongNgay, danhGiaDiChuyen, docLichChuyen
};
