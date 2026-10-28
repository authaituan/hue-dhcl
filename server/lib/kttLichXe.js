// ==========================================
// «Hàng tại KTT» — KTT-12: B4 (giờ lập BD10 đi từng BCVH so với xe rời KTT theo lịch) và B6 (lịch xe, số hàng đến theo giờ, giờ lập BD10 thực tế). CHỈ ĐỌC DB.
// Đơn vị B4 = một BD10 đi (số hiệu khác nhau), mốc «đã đi» = giờ lập BD10 đi (bd10_di_gio_di, SendingTime). Gồm cả túi `DI` và `CHUYEN_TIEP_DI` (xe Cấp 1 đi thẳng Hương Trà).
// KHÔNG có cột «chuyến 1, 2, 3 theo hệ thống» trong CSV (`mail_trip_number` là số tăng liên tục, không phải thứ tự trong ngày), nên mỗi BD10 được GÁN cho chuyến của lịch chính thức
// (ktt_lich_chuyen) có giờ xuất phát GẦN giờ lập nhất trong ngày đó và hai ngày kề (hòa thì lấy chuyến sau). Đây là quy ước của KTT-12, ghi rõ ở tài liệu và trong phản hồi.
// ==========================================
'use strict';
const L = require('./kttLichChuyen');
const D = require('./kttDiNgay');
const { MA_BCVH_HUE } = require('./kttTinh');
const { TEN_BCVH } = require('./kttDiNgayQuery');

const THU_TU_BCVH_B6 = Object.freeze(['533140', '536250', '535470', '537015', '537220', '535790']); // thứ tự trên canvas: Thuận Hóa, Hương Thủy, Hương Trà, Thuận An, Phú Lộc, A Lưới
const MIN_BD10_MAC_DINH = 5;
const MIN_BD10_TOI_DA = 100;
const GIAY_NGAY = 86400;

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);
const chuoi = (x) => (x === null || x === undefined ? '' : String(x).trim());
const r1 = (x) => Math.round(x * 10) / 10;
const xeSec = (gio) => Number(gio.slice(0, 2)) * 3600 + Number(gio.slice(3, 5)) * 60;

/** Chuyến của lịch có giờ xuất phát gần giờ lập nhất (xét ngày lập và hai ngày kề). Trả { chuyen, lechGiay (giờ lập − giờ xuất phát; > 0 = lập SAU giờ xe) } hoặc null nếu BCVH không có lịch. */
function chuyenGanNhat(lich, ma, gioLap, hanPhut) {
  const g = L.giayCua(gioLap);
  if (g === null) return null;
  const ngay = L.dinhDang(g).slice(0, 10);
  let tot = null;
  for (const n of [-1, 0, 1]) {
    for (const c of L.chuyenTrongNgay(lich, ma, L.dinhDang(L.giayCua(`${ngay} 00:00:00`) + n * GIAY_NGAY).slice(0, 10), { hanDenTruocChuyenPhut: hanPhut })) {
      const lech = g - L.giayCua(c.xuat_phat_luc);
      if (tot === null || Math.abs(lech) < Math.abs(tot.lechGiay) || (Math.abs(lech) === Math.abs(tot.lechGiay) && lech < tot.lechGiay)) tot = { chuyen: c, lechGiay: lech };
    }
  }
  return tot;
}

/** Các BD10 đi về 6 BCVH Huế có giờ lập trong [tuNgay, denNgay]: [{ so, nhan, gio, dtMa, dtTen }] (mỗi BD10 một dòng). */
function docBd10Di(db, tuNgay, denNgay) {
  if (!coBang(db, 'ktt_tui')) return [];
  const den = L.dinhDang(L.giayCua(`${denNgay} 00:00:00`) + GIAY_NGAY);
  return db.prepare(`SELECT bd10_di_so_hieu AS so, bd10_di_ma_diem_nhan AS nhan, MIN(bd10_di_gio_di) AS gio, MAX(bd10_di_ma_duong_thu) AS dt_ma, MAX(bd10_di_ten_duong_thu) AS dt_ten
    FROM ktt_tui
    WHERE chieu IN ('DI', 'CHUYEN_TIEP_DI') AND bd10_di_so_hieu IS NOT NULL AND bd10_di_gio_di >= @tu AND bd10_di_gio_di < @den
      AND bd10_di_ma_diem_nhan IN (${MA_BCVH_HUE.map((m) => `'${m}'`).join(', ')})
    GROUP BY bd10_di_so_hieu, bd10_di_ma_diem_nhan`).all({ tu: `${tuNgay} 00:00:00`, den }).map((r) => ({ so: r.so, nhan: chuoi(r.nhan), gio: r.gio, dtMa: chuoi(r.dt_ma) || null, dtTen: chuoi(r.dt_ten) || null }));
}

/**
 * B4 — giờ lập BD10 đi theo (BCVH, đường thư đi, chuyến lịch). Trả { dong, tong_bd10, so_nhom_bi_loc, quy_uoc, canh_bao }. dong: chỉ nhóm có ≥ minBd10 BD10.
 * `truoc_xe_tb_gio` = giờ xuất phát − giờ lập TB (số dương = lập trước xe; âm = lập sau xe); `so_bd10_lap_sau_gio_xe` đếm từng BD10 có giờ lập sau giờ xe của chuyến được gán.
 */
function gioLapBd10(db, { tuNgay, denNgay, minBd10 = MIN_BD10_MAC_DINH } = {}) {
  const lichDoc = L.docLichChuyen(db);
  const nhom = new Map();
  let tong = 0;
  let ngayDau = null;
  let ngayCuoi = null;
  for (const b of docBd10Di(db, tuNgay, denNgay)) {
    tong++;
    const ng = b.gio.slice(0, 10);
    if (ngayDau === null || ng < ngayDau) ngayDau = ng;
    if (ngayCuoi === null || ng > ngayCuoi) ngayCuoi = ng;
    const g = chuyenGanNhat(lichDoc.lich, b.nhan, b.gio, lichDoc.hanDenTruocChuyenPhut);
    const gioXe = g ? g.chuyen.gio_xuat_phat : null;
    const khoa = `${b.nhan}|${b.dtMa || ''}|${gioXe || ''}`;
    let e = nhom.get(khoa);
    if (!e) { e = { ma_bcvh: b.nhan, duong_thu_ma: b.dtMa, duong_thu_ten: b.dtTen, gio_xuat_phat: gioXe, so: 0, tongLech: 0, minLech: null, maxLech: null, sau: 0 }; nhom.set(khoa, e); }
    if (!e.duong_thu_ten && b.dtTen) e.duong_thu_ten = b.dtTen;
    e.so++;
    if (g) {
      e.tongLech += g.lechGiay; e.minLech = e.minLech === null ? g.lechGiay : Math.min(e.minLech, g.lechGiay); e.maxLech = e.maxLech === null ? g.lechGiay : Math.max(e.maxLech, g.lechGiay);
      if (g.lechGiay > 0) e.sau++;
    }
  }
  const lichCua = (ma, gio) => lichDoc.lich.find((r) => r.ma_bcvh === ma && r.gio_xuat_phat === gio && r.dang_dung !== 0) || null;
  const dong = [...nhom.values()].filter((e) => e.so >= minBd10).map((e) => {
    const tb = e.gio_xuat_phat ? e.tongLech / e.so : null;
    const ve = (lech) => (e.gio_xuat_phat && lech !== null ? D.hhmm(((xeSec(e.gio_xuat_phat) + lech) % GIAY_NGAY + GIAY_NGAY) % GIAY_NGAY) : null);
    const lich = e.gio_xuat_phat ? lichCua(e.ma_bcvh, e.gio_xuat_phat) : null;
    return {
      ma_bcvh: e.ma_bcvh, ten_bcvh: TEN_BCVH[e.ma_bcvh] || null, duong_thu_ma: e.duong_thu_ma, duong_thu_ten: e.duong_thu_ten || (e.duong_thu_ma ? '(chưa có tên)' : '(không rõ đường thư)'),
      xe_roi_ktt: e.gio_xuat_phat, ngay_chay: lich ? lich.ngay_chay : null, so_bd10: e.so,
      gio_lap_tb: ve(tb), gio_lap_som_nhat: ve(e.minLech), gio_lap_muon_nhat: ve(e.maxLech),
      truoc_xe_tb_gio: tb === null ? null : r1(-tb / 3600), so_bd10_lap_sau_gio_xe: e.sau, ty_le_lap_sau_gio_xe: e.so > 0 ? e.sau / e.so : null
    };
  }).sort((a, b) => (THU_TU_BCVH_B6.indexOf(a.ma_bcvh) - THU_TU_BCVH_B6.indexOf(b.ma_bcvh)) || String(a.duong_thu_ma).localeCompare(String(b.duong_thu_ma)) || String(a.xe_roi_ktt).localeCompare(String(b.xe_roi_ktt)));
  return {
    dong, tong_bd10: tong, cua_so_thuc_te: { tu_ngay: ngayDau, den_ngay: ngayCuoi }, so_nhom_bi_loc: nhom.size - dong.length, min_bd10: minBd10,
    quy_uoc: 'Mỗi BD10 đi được gán cho chuyến của lịch chính thức có giờ xuất phát gần giờ lập nhất (hòa thì chuyến sau); CSV không có số thứ tự chuyến trong ngày của hệ thống.',
    canh_bao: [...lichDoc.canhBao]
  };
}

/**
 * B6 — mỗi BCVH: bưu gửi + kg, số hàng đến mỗi giờ (trung bình ngày) theo hai mốc, vạch lịch xe, giờ lập BD10 thực tế (gộp các đường thư).
 * m = bó khoảng của D.congCacNgay (số bưu gửi đến theo giờ lấy từ SHBG đã xử lý ở /dicungngay); b4 = kết quả gioLapBd10 (minBd10 = 1 để không mất chuyến nào).
 */
function theoBcvh(db, m, b4) {
  const lichDoc = L.docLichChuyen(db);
  const soNgay = m.so_ngay_co_du_lieu || 0;
  const tb = (arr) => arr.map((n, gio) => ({ gio, so_bd_tb: soNgay > 0 ? Math.round((n / soNgay) * 10) / 10 : null, tong: n }));
  return THU_TU_BCVH_B6.map((ma) => {
    const c = m.bcvh[ma] || { shbg: 0, kg: 0, gio_quet: Array(24).fill(0), gio_xnd: Array(24).fill(0) };
    const lich = lichDoc.lich.filter((r) => r.ma_bcvh === ma && r.dang_dung !== 0).map((r) => ({ xe_roi_ktt: r.gio_xuat_phat, ngay_chay: r.ngay_chay, chay_chu_nhat: r.ngay_chay === 'CA_TUAN', nhan: r.nhan }));
    const thucTe = new Map();
    for (const r of b4.dong.filter((x) => x.ma_bcvh === ma && x.xe_roi_ktt)) {
      let e = thucTe.get(r.xe_roi_ktt);
      if (!e) { e = { xe_roi_ktt: r.xe_roi_ktt, so_bd10: 0, tongTruoc: 0, sau: 0 }; thucTe.set(r.xe_roi_ktt, e); }
      e.so_bd10 += r.so_bd10; e.tongTruoc += (r.truoc_xe_tb_gio || 0) * r.so_bd10; e.sau += r.so_bd10_lap_sau_gio_xe;
    }
    return {
      ma_bcvh: ma, ten_bcvh: TEN_BCVH[ma] || null, shbg: c.shbg, kg: D.r3(c.kg), so_chuyen_moi_ngay: lich.length, lich,
      hang_den_theo_gio: { so_ngay_chia: soNgay, gio_quet_tui_den: tb(c.gio_quet), gio_xac_nhan_bd10: tb(c.gio_xnd) },
      gio_lap_bd10_thuc_te: [...thucTe.values()].sort((a, b) => a.xe_roi_ktt.localeCompare(b.xe_roi_ktt)).map((e) => ({
        xe_roi_ktt: e.xe_roi_ktt, so_bd10: e.so_bd10, truoc_xe_tb_gio: e.so_bd10 ? r1(e.tongTruoc / e.so_bd10) : null, so_bd10_lap_sau_gio_xe: e.sau,
        gio_lap_tb: e.so_bd10 ? D.hhmm((((xeSec(e.xe_roi_ktt) - Math.round((e.tongTruoc / e.so_bd10) * 3600)) % GIAY_NGAY) + GIAY_NGAY) % GIAY_NGAY) : null // vị trí «tam giác vàng» trên biểu đồ
      }))
    };
  });
}

module.exports = { gioLapBd10, theoBcvh, chuyenGanNhat, docBd10Di, THU_TU_BCVH_B6, MIN_BD10_MAC_DINH, MIN_BD10_TOI_DA };
