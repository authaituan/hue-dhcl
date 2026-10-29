// ==========================================
// KTT-16-1: ĐỘ PHỦ dữ liệu «Hàng đến BCVH» (arrival_import_files, arrival_items) cho đối chiếu «Hàng tại KTT» ↔ BCVH.
// Mục đích duy nhất: với mỗi BCVH và mỗi ngày, biết dữ liệu «Hàng đến» CÓ hay KHÔNG — để các ticket đối chiếu sau không coi «BCVH chưa có file» là «chưa thấy hàng».
// CHỈ ĐỌC; KHÔNG ghép KTT↔BCVH; KHÔNG đọc bảng ktt_*; KHÔNG đổi importer (EMPTY vẫn là «đã nhận» ở importer, truy vấn sản lượng vẫn bỏ qua). Tài liệu: docs/ai/44_KTT_DO_PHU_BCVH.md.
//
// Hai lớp:
//  - tinhDoPhu(): HÀM THUẦN (không DB, không đồng hồ, không múi giờ máy) trên số đã tổng hợp.
//  - docDoPhu(db, { tuNgay, denNgay }): đọc DB (ba truy vấn nhỏ) rồi gọi tinhDoPhu.
// «Ngày» của một (BCVH, ngày) = file_date (ngày trong TÊN file — cùng quy ước màn «Nạp dữ liệu nguồn»), không phải ngày đến của từng dòng.
// Chỉ file đã được chấp nhận (status OK hoặc EMPTY) được tính; REJECTED / CONFLICT coi như không có file.
// ==========================================
'use strict';
const Q = require('./kttQuery');
const L = require('./kttLichChuyen');
const { MA_BCVH_HUE } = require('./kttTinh');
const { dotCua } = require('./napNguonDoc');

const TRANG_THAI = Object.freeze({ CO_DU_LIEU: 'CO_DU_LIEU', CHI_FILE_RONG: 'CHI_FILE_RONG', KHONG_CO_FILE: 'KHONG_CO_FILE' });
const SO_NGAY_TOI_DA = 31;
/** D chỉ kiểm tra được khi dữ liệu BCVH đích phủ tới D + 48 giờ (hàng KTT lập BD10 đi ngày D còn đang trên đường tới 48 giờ sau). */
const GIO_SAU_NGAY_D = 48;
/** Cờ «có thể dương tính giả» xét ba ngày D, D+1, D+2 của BCVH đích. */
const NGAY_SAU_D_XET_CO = 2;

const GIAY_NGAY = 86400;
const ngayCong = (ngay, n) => L.dinhDang(L.giayCua(`${ngay} 00:00:00`) + n * GIAY_NGAY).slice(0, 10);
const dsNgay = (tu, den) => { const ds = []; for (let d = tu; d <= den; d = ngayCong(d, 1)) ds.push(d); return ds; };
const lamTron4 = (x) => Math.round(x * 10000) / 10000;

function trangThaiNgay(soOk, soEmpty) {
  if (soOk > 0) return TRANG_THAI.CO_DU_LIEU;
  if (soEmpty > 0) return TRANG_THAI.CHI_FILE_RONG;
  return TRANG_THAI.KHONG_CO_FILE;
}

/** Kiểm khoảng ngày: YYYY-MM-DD có thật, tu ≤ den, ≤ SO_NGAY_TOI_DA ngày. Trả danh sách ngày. */
function kiemKhoang(tuNgay, denNgay) {
  if (!Q.ngayHopLe(tuNgay) || !Q.ngayHopLe(denNgay)) throw new Q.LoiKtt('KTT_NGAY_SAI', 'tuNgay / denNgay phải có dạng YYYY-MM-DD.');
  if (tuNgay > denNgay) throw new Q.LoiKtt('KTT_KHOANG_NGAY_SAI', 'tuNgay phải không sau denNgay.');
  const soNgay = (L.giayCua(`${denNgay} 00:00:00`) - L.giayCua(`${tuNgay} 00:00:00`)) / GIAY_NGAY + 1;
  if (soNgay > SO_NGAY_TOI_DA) throw new Q.LoiKtt('KTT_KHOANG_QUA_DAI', `Khoảng ngày tối đa ${SO_NGAY_TOI_DA} ngày (đang chọn ${soNgay} ngày).`);
  return dsNgay(tuNgay, denNgay);
}

/**
 * Cửa sổ đối chiếu được của MỘT BCVH đích X (toàn cục, không phụ thuộc khoảng yêu cầu):
 *   D ≥ ngày đầu của X  VÀ  D + 48 giờ ≤ độ mới của X,   D tính từ 00:00:00 của ngày D (theo đúng công thức của ticket).
 * ngày đầu = ngày nhỏ nhất có file OK; độ mới = file_date + file_time lớn nhất của file OK (EMPTY không tính: không chứng minh có hàng).
 * Trả { cua_so: {tu, den} | null, ly_do: null | 'CHUA_CO_DU_LIEU' | 'DO_MOI_CHUA_DU_48_GIO' }.
 */
function cuaSoCuaBcvh(ngayDau, doMoi) {
  if (!ngayDau || !doMoi) return { cua_so: null, ly_do: 'CHUA_CO_DU_LIEU' };
  const giay = L.giayCua(doMoi);
  if (giay === null) return { cua_so: null, ly_do: 'CHUA_CO_DU_LIEU' };
  const den = L.dinhDang(giay - GIO_SAU_NGAY_D * 3600).slice(0, 10);
  if (den < ngayDau) return { cua_so: null, ly_do: 'DO_MOI_CHUA_DU_48_GIO' };
  return { cua_so: { tu: ngayDau, den }, ly_do: null };
}

/**
 * HÀM THUẦN. Đầu vào:
 *  - tuNgay, denNgay: khoảng yêu cầu (≤ 31 ngày).
 *  - maBcvh: danh sách mã BCVH đích (mặc định 6 BCVH Huế = kttTinh.MA_BCVH_HUE).
 *  - ngayFile: [{ ma, ngay, so_file_ok, so_file_empty, so_dong, so_dong_thieu_gio_nhan, dot: ['S'|'C'…], gio_file_moi_nhat }] — mỗi (BCVH, ngày) tối đa một phần tử;
 *    phải phủ [tuNgay, denNgay + 2 ngày] (cờ chất lượng nhìn tới D+2); (BCVH, ngày) vắng mặt = không có file.
 *  - toanCuc: [{ ma, ngay_dau, do_moi }] — trên TOÀN BỘ dữ liệu (không chỉ khoảng yêu cầu); BCVH vắng mặt = chưa có dữ liệu.
 * Đầu ra: xem docs/ai/44_KTT_DO_PHU_BCVH.md mục 2.
 */
function tinhDoPhu({ tuNgay, denNgay, maBcvh = MA_BCVH_HUE, ngayFile = [], toanCuc = [], tenBcvh = null }) {
  const ngays = kiemKhoang(tuNgay, denNgay);
  const denXet = ngayCong(denNgay, NGAY_SAU_D_XET_CO);
  const theoKhoa = new Map(ngayFile.map((f) => [`${f.ma}|${f.ngay}`, f]));
  const cucBo = new Map(toanCuc.map((c) => [c.ma, c]));

  const bcvh = maBcvh.map((ma) => {
    const tc = cucBo.get(ma) || {};
    const ngayDau = tc.ngay_dau || null;
    const doMoi = tc.do_moi || null;
    const { cua_so: cuaSo, ly_do: lyDoKhongCoCuaSo } = cuaSoCuaBcvh(ngayDau, doMoi);

    const trangThaiTheoNgay = new Map(); // gồm D+1, D+2 của ngày cuối
    for (const d of dsNgay(tuNgay, denXet)) {
      const f = theoKhoa.get(`${ma}|${d}`);
      trangThaiTheoNgay.set(d, trangThaiNgay(f ? f.so_file_ok : 0, f ? f.so_file_empty : 0));
    }

    const ngayKhongCoFile = [];
    const ngayChiFileRong = [];
    const theoNgay = ngays.map((d) => {
      const f = theoKhoa.get(`${ma}|${d}`) || {};
      const trangThai = trangThaiTheoNgay.get(d);
      if (trangThai === TRANG_THAI.KHONG_CO_FILE) ngayKhongCoFile.push(d);
      else if (trangThai === TRANG_THAI.CHI_FILE_RONG) ngayChiFileRong.push(d);
      const thieu = [];
      for (let i = 0; i <= NGAY_SAU_D_XET_CO; i++) {
        const x = ngayCong(d, i);
        if (trangThaiTheoNgay.get(x) !== TRANG_THAI.CO_DU_LIEU) thieu.push(x);
      }
      const soDong = f.so_dong || 0;
      const dot = Array.isArray(f.dot) ? [...new Set(f.dot)].sort() : [];
      return {
        ngay: d,
        trang_thai: trangThai,
        so_file_ok: f.so_file_ok || 0,
        so_file_empty: f.so_file_empty || 0,
        so_dong: soDong,
        so_dot: dot.length,
        gio_file_moi_nhat: f.gio_file_moi_nhat || null,
        ty_le_thieu_gio_nhan: soDong > 0 ? lamTron4((f.so_dong_thieu_gio_nhan || 0) / soDong) : null,
        co_the_duong_tinh_gia: thieu.length > 0,
        ngay_thieu_trong_d_d2: thieu,
        trong_cua_so: cuaSo !== null && d >= cuaSo.tu && d <= cuaSo.den
      };
    });

    return {
      ma,
      ten: tenBcvh && tenBcvh.get ? (tenBcvh.get(ma) || null) : null,
      ngay_dau: ngayDau,
      ngay_cuoi: doMoi ? doMoi.slice(0, 10) : null,
      do_moi: doMoi,
      cua_so: cuaSo,
      ly_do_khong_co_cua_so: lyDoKhongCoCuaSo,
      ngay_khong_co_file: ngayKhongCoFile,
      ngay_chi_file_rong: ngayChiFileRong,
      theo_ngay: theoNgay
    };
  });

  // Cửa sổ chung = giao sáu cửa sổ riêng.
  const chan = bcvh.filter((b) => b.cua_so === null).map((b) => b.ma);
  let cuaSoChung = null;
  if (chan.length === 0 && bcvh.length > 0) {
    const tu = bcvh.map((b) => b.cua_so.tu).reduce((a, b) => (a > b ? a : b));
    const den = bcvh.map((b) => b.cua_so.den).reduce((a, b) => (a < b ? a : b));
    if (tu <= den) cuaSoChung = { tu, den };
  }
  const cuaSoThucTe = cuaSoChung ? giaoKhoang(cuaSoChung, { tu: tuNgay, den: denNgay }) : null;

  return {
    tu: tuNgay,
    den: denNgay,
    so_ngay: ngays.length,
    bcvh,
    cua_so_chung: cuaSoChung,
    bcvh_chan_cua_so_chung: cuaSoChung ? [] : chan,
    cua_so_thuc_te: cuaSoThucTe,
    meta: {
      ngay_theo: 'file_date',
      gio_sau_ngay_d: GIO_SAU_NGAY_D,
      ngay_sau_d_xet_co: NGAY_SAU_D_XET_CO,
      trang_thai: Object.values(TRANG_THAI)
    }
  };
}

function giaoKhoang(a, b) {
  const tu = a.tu > b.tu ? a.tu : b.tu;
  const den = a.den < b.den ? a.den : b.den;
  return tu <= den ? { tu, den } : null;
}

// ------------------------------------------
// Đọc DB (chỉ đọc; không chạm bảng ktt_*)
// ------------------------------------------
/** Đọc arrival_import_files / arrival_items rồi gọi tinhDoPhu. Ba truy vấn có chỉ mục (unit_code, file_date) và import_file_id. */
function docDoPhu(db, { tuNgay, denNgay, tenBcvh = null }) {
  kiemKhoang(tuNgay, denNgay); // kiểm trước khi đụng DB
  const denXet = ngayCong(denNgay, NGAY_SAU_D_XET_CO);
  const tham = { m: JSON.stringify(MA_BCVH_HUE), tu: tuNgay, den: denXet, denYc: denNgay };

  const files = db.prepare(`SELECT unit_code AS ma, file_date AS ngay, file_time AS gio, status FROM arrival_import_files
    WHERE unit_code IN (SELECT value FROM json_each(@m)) AND file_date BETWEEN @tu AND @den AND status IN ('OK', 'EMPTY')`).all(tham);
  const dong = db.prepare(`SELECT f.unit_code AS ma, f.file_date AS ngay, COUNT(*) AS n,
      SUM(CASE WHEN i.arrival_at IS NULL OR i.arrival_at = '' THEN 1 ELSE 0 END) AS thieu
    FROM arrival_import_files f JOIN arrival_items i ON i.import_file_id = f.id
    WHERE f.unit_code IN (SELECT value FROM json_each(@m)) AND f.file_date BETWEEN @tu AND @denYc AND f.status = 'OK'
    GROUP BY f.unit_code, f.file_date`).all(tham);
  const toanCuc = db.prepare(`SELECT unit_code AS ma, MIN(file_date) AS ngay_dau, MAX(file_date || ' ' || file_time) AS do_moi FROM arrival_import_files
    WHERE unit_code IN (SELECT value FROM json_each(@m)) AND status = 'OK' GROUP BY unit_code`).all({ m: tham.m });

  const gop = new Map();
  for (const f of files) {
    const k = `${f.ma}|${f.ngay}`;
    const o = gop.get(k) || { ma: f.ma, ngay: f.ngay, so_file_ok: 0, so_file_empty: 0, so_dong: 0, so_dong_thieu_gio_nhan: 0, dot: [], gio_file_moi_nhat: null };
    if (f.status === 'OK') o.so_file_ok++; else o.so_file_empty++;
    o.dot.push(dotCua(f.gio));
    if (o.gio_file_moi_nhat === null || f.gio > o.gio_file_moi_nhat) o.gio_file_moi_nhat = f.gio;
    gop.set(k, o);
  }
  for (const r of dong) {
    const o = gop.get(`${r.ma}|${r.ngay}`);
    if (o) { o.so_dong = r.n; o.so_dong_thieu_gio_nhan = r.thieu; }
  }
  return tinhDoPhu({ tuNgay, denNgay, ngayFile: [...gop.values()], toanCuc, tenBcvh });
}

module.exports = { TRANG_THAI, SO_NGAY_TOI_DA, GIO_SAU_NGAY_D, NGAY_SAU_D_XET_CO, tinhDoPhu, docDoPhu, cuaSoCuaBcvh };
