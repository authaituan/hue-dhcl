// ==========================================
// «Hàng tại KTT» (KTT-6): nạp MỘT CẶP file (KTT_Tui_<ymd>_<hms>.csv + KTT_BuuGui_<ymd>_<hms>.csv) trong MỘT giao dịch, nhật ký theo cặp (ktt_nap_cap),
// «độ mới» của dữ liệu và các cảnh báo cho ADMIN. KHÔNG mạng, KHÔNG đọc SFTP (đó là server/lib/kttSftp.js); lõi từng file ở server/lib/kttImport.js.
// Không bao giờ ghi nội dung dòng dữ liệu vào nhật ký / cảnh báo: chỉ tên file, tên cột, mã và số đếm. Giờ dữ liệu là giờ VN (không đổi múi giờ);
// mọi phép tính giờ tự tách chuỗi (Date.UTC trên số), KHÔNG new Date(chuỗi) / Date.parse nên kết quả giống nhau ở mọi TZ.
// Tài liệu: docs/ai/39_KTT_NAP_SFTP.md.
// ==========================================
'use strict';
const I = require('./kttImport');
const { LOAI_FILE } = require('./kttSchema');
const CF = require('../config/ktt-nap');

const KET_QUA = Object.freeze({ OK: 'OK', CHO_CAP: 'CHO_CAP', TU_CHOI: 'TU_CHOI', LOI: 'LOI', DA_NAP: 'DA_NAP' });

// ------------------------------------------
// Giờ
// ------------------------------------------
const nowUtc = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
/** Giờ VN (UTC+7 cố định, VN không có giờ mùa hè) của một Date, dạng 'YYYY-MM-DD HH:MM:SS'. */
const nowVn = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const RE_GIO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
/** 'YYYY-MM-DD HH:MM:SS' -> số phút kể từ gốc (so sánh / trừ nhau; cùng hệ quy chiếu nên không phụ thuộc TZ máy). null nếu sai dạng. */
function phutCua(s) {
  const m = RE_GIO.exec(String(s ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 60000 : null;
}
/** Như phutCua nhưng theo GIÂY (có giây và phần ms của ISO). Dùng cho mốc ISO UTC do chính máy chủ ghi. */
function giayCua(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/.exec(String(s ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? +m[7].padEnd(3, '0') : 0) / 1000 : null;
}
const ngayThang = (ymd, n) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n)).toISOString().slice(0, 10);

/** Số phút nằm trong khung [tuGio:00, denGio:00) mỗi ngày giữa hai mốc giờ VN a ≤ b (chuỗi). */
function phutTrongKhung(a, b, tuGio, denGio) {
  const pa = phutCua(a); const pb = phutCua(b);
  if (pa === null || pb === null || pb <= pa) return 0;
  let tong = 0;
  for (let d = a.slice(0, 10); d <= b.slice(0, 10); d = ngayThang(d, 1)) {
    const goc = phutCua(`${d} 00:00:00`);
    const lo = Math.max(pa, goc + tuGio * 60); const hi = Math.min(pb, goc + denGio * 60);
    if (hi > lo) tong += hi - lo;
  }
  return tong;
}

/** Tên file KTT -> { loai: 'TUI' | 'BUU_GUI', khoa: 'yyyymmdd_hhmmss', nguon: 'YYYY-MM-DD HH:MM:SS' } | null (sai mẫu hoặc ngày giờ không có thật). */
function phanTichTenKtt(ten) {
  for (const cfg of Object.values(LOAI_FILE)) {
    const m = cfg.mauTen.exec(String(ten));
    if (!m) continue;
    const [y, mo, d, h, mi, s] = [m[1].slice(0, 4), m[1].slice(4, 6), m[1].slice(6, 8), m[2].slice(0, 2), m[2].slice(2, 4), m[2].slice(4, 6)].map(Number);
    if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return { loai: cfg.loai, khoa: `${m[1]}_${m[2]}`, nguon: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}` };
  }
  return null;
}

/** Làm sạch một câu trước khi lưu: bỏ ký tự điều khiển, dãy ≥ 15 chữ số (có thể là số hiệu), cắt ngắn. */
const lamSach = (s, max = 300) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\d{15,}/g, '[số dài]').slice(0, max);

class CapTuChoi extends Error {
  constructor(ma, message) { super(message); this.ma = ma; }
}

// ------------------------------------------
// Ghi nhật ký cặp
// ------------------------------------------
const COT_CAP = [
  'khoa_cap', 'ten_file_tui', 'ten_file_buu_gui', 'sha_tui', 'sha_buu_gui', 'size_tui', 'mtime_tui', 'size_buu_gui', 'mtime_buu_gui', 'nguon_xuat_luc', 'gio_min', 'gio_max',
  'tui_doc', 'tui_them', 'tui_cap_nhat', 'tui_bo_qua', 'tui_loi', 'tui_trung', 'tui_khong_con', 'bg_doc', 'bg_them', 'bg_cap_nhat', 'bg_bo_qua', 'bg_loi', 'bg_trung', 'bg_khong_con',
  'ket_qua', 'ma_loi', 'thong_bao', 'so_lan_thu', 'thay_dau_luc', 'nap_luc', 'cap_nhat_luc'
];
const SO_0 = Object.fromEntries(['tui', 'bg'].flatMap((p) => ['doc', 'them', 'cap_nhat', 'bo_qua', 'loi', 'trung', 'khong_con'].map((k) => [`${p}_${k}`, 0])));

/** UPSERT một dòng theo khoa_cap. `v` có thể thiếu cột (mặc định NULL / 0); thay_dau_luc chỉ đặt lúc tạo (giữ nguyên khi cập nhật). */
function ghiCap(db, v) {
  const row = { ma_loi: null, thong_bao: null, so_lan_thu: 0, nap_luc: null, ...SO_0, ...v };
  for (const c of COT_CAP) if (row[c] === undefined) row[c] = null;
  const capNhat = COT_CAP.filter((c) => c !== 'khoa_cap' && c !== 'thay_dau_luc');
  db.prepare(`INSERT INTO ktt_nap_cap (${COT_CAP.join(', ')}) VALUES (${COT_CAP.map((c) => `@${c}`).join(', ')})
    ON CONFLICT(khoa_cap) DO UPDATE SET ${capNhat.map((c) => `${c} = excluded.${c}`).join(', ')}`).run(row);
}

const docCap = (db, khoa) => db.prepare('SELECT * FROM ktt_nap_cap WHERE khoa_cap = ?').get(khoa) || null;

/** Mới có MỘT file của cặp: ghi / cập nhật dòng CHO_CAP (giữ nguyên thay_dau_luc = lần đầu thấy). Không đụng dòng đã OK / TU_CHOI / LOI. */
function ghiChoCap(db, { khoa, loai, ten, size, mtime, now = new Date() }) {
  const cu = docCap(db, khoa);
  if (cu && cu.ket_qua !== KET_QUA.CHO_CAP) return cu;
  const t = nowUtc(now);
  const k = loai === 'TUI' ? 'tui' : 'buu_gui';
  ghiCap(db, { ...(cu || {}), khoa_cap: khoa, [`ten_file_${k}`]: ten, [`size_${k}`]: size, [`mtime_${k}`]: mtime, ket_qua: KET_QUA.CHO_CAP, thay_dau_luc: t, cap_nhat_luc: t });
  return docCap(db, khoa);
}

/**
 * Ghi một lần TỪ CHỐI / LỖI của cặp. Nếu cặp ĐÃ OK trước đó thì KHÔNG đè dòng OK (mất độ mới): ghi dòng «biến thể» khoa_cap = '<khoa>!<sha ngắn>'
 * và (chỉ khi từ chối) cập nhật kích thước / mtime đã thấy trên dòng OK để không tải lại mỗi lượt.
 */
function ghiLoiCap(db, c, { ma, thongBao, now = new Date(), tuChoi = false }) {
  const t = nowUtc(now);
  const chinh = docCap(db, c.khoa);
  let khoa = c.khoa;
  if (chinh && chinh.ket_qua === KET_QUA.OK) {
    let bien = 'x';
    try { bien = `${I.bamFile(c.tui.path).slice(0, 6)}${I.bamFile(c.buuGui.path).slice(0, 6)}`; } catch (e) { /* tệp tạm đã mất: dùng nhãn chung */ }
    khoa = `${c.khoa}!${bien}`;
    if (tuChoi) {
      db.prepare('UPDATE ktt_nap_cap SET size_tui = ?, mtime_tui = ?, size_buu_gui = ?, mtime_buu_gui = ? WHERE khoa_cap = ?').run(c.tui.size ?? null, c.tui.mtime ?? null, c.buuGui.size ?? null, c.buuGui.mtime ?? null, c.khoa);
    }
  }
  const cu = docCap(db, khoa);
  const thuMoi = tuChoi ? 0 : ((cu && cu.ket_qua === KET_QUA.LOI ? cu.so_lan_thu : 0) + 1);
  ghiCap(db, {
    khoa_cap: khoa, ten_file_tui: c.tui.name, ten_file_buu_gui: c.buuGui.name, size_tui: c.tui.size ?? null, mtime_tui: c.tui.mtime ?? null, size_buu_gui: c.buuGui.size ?? null, mtime_buu_gui: c.buuGui.mtime ?? null,
    nguon_xuat_luc: chinh ? chinh.nguon_xuat_luc : null,
    ket_qua: tuChoi ? KET_QUA.TU_CHOI : KET_QUA.LOI, ma_loi: ma, thong_bao: lamSach(thongBao), so_lan_thu: thuMoi,
    thay_dau_luc: cu ? cu.thay_dau_luc : t, cap_nhat_luc: t
  });
}

// ------------------------------------------
// Nạp một cặp
// ------------------------------------------
/**
 * c: { khoa: 'yyyymmdd_hhmmss', nguonTen: 'YYYY-MM-DD HH:MM:SS', tui: { path, name, size?, mtime? }, buuGui: { path, name, size?, mtime? } } (file đã nằm sẵn trên đĩa cục bộ).
 * Trả { ketQua: 'OK' | 'DA_NAP' | 'TU_CHOI', ma?, thongBao?, cap }. KHÔNG bắt lỗi hệ thống (SQLITE_BUSY, I/O): ném ra để người gọi thử lại / ghi LOI.
 *  - Cùng TÊN file nhưng khác nội dung (sha256) với bản ĐÃ NẠP OK: TU_CHOI, không đụng dữ liệu.
 *  - Một trong hai file sai tiêu đề / sai CSV / sai tên: TU_CHOI và hoàn tác CẢ CẶP (ktt_tui, ktt_buu_gui, ktt_nap_lan không đổi).
 *  - Cả hai file đã nạp OK trước đó (cùng sha256): DA_NAP, không làm gì (chỉ cập nhật kích thước / mtime đã thấy).
 *  - File rỗng (0 byte / chỉ BOM) hợp lệ: cặp vẫn OK với 0 dòng.
 */
function napCap(db, c, { now = new Date() } = {}) {
  const t = nowUtc(now);
  const sha = { TUI: I.bamFile(c.tui.path), BUU_GUI: I.bamFile(c.buuGui.path) };
  const tenCua = { TUI: c.tui.name, BUU_GUI: c.buuGui.name };
  const trungTen = db.prepare("SELECT 1 FROM ktt_nap_lan WHERE loai = ? AND ten_file = ? AND trang_thai = 'OK' AND sha256 <> ? LIMIT 1");
  for (const loai of ['TUI', 'BUU_GUI']) {
    if (trungTen.get(loai, tenCua[loai], sha[loai])) {
      const thongBao = `File ${tenCua[loai]} trùng tên với bản đã nạp nhưng nội dung khác — từ chối, không nạp cặp này`;
      db.transaction(() => ghiLoiCap(db, c, { ma: 'TRUNG_TEN_KHAC_NOI_DUNG', thongBao, now, tuChoi: true }))();
      return { ketQua: KET_QUA.TU_CHOI, ma: 'TRUNG_TEN_KHAC_NOI_DUNG', thongBao, cap: docCap(db, c.khoa) };
    }
  }
  const kiemTra = (r) => {
    if (r.status === 'OK' || r.status === 'DA_NAP') return;
    throw new CapTuChoi(r.status === 'SAI_TEN' ? 'SAI_TEN' : 'FILE_SAI', `${r.fileName}: ${r.error || r.status}`);
  };
  try {
    return db.transaction(() => {
      const r1 = I.napFile(db, 'TUI', c.tui.path, { choPhepRong: true, cuaSoDen: c.nguonTen });
      kiemTra(r1);
      const r2 = I.napFile(db, 'BUU_GUI', c.buuGui.path, { choPhepRong: true, cuaSoDen: c.nguonTen });
      kiemTra(r2);
      const cu = docCap(db, c.khoa);
      const nguonDaCo = (r) => (r.nguonXuat || (r.napLanId ? db.prepare(`SELECT MAX(nguon_xuat_luc) AS m FROM ${LOAI_FILE[r.loai].bang} WHERE nap_lan_id = ?`).get(r.napLanId).m : null));
      if (r1.status === 'DA_NAP' && r2.status === 'DA_NAP' && cu && cu.ket_qua === KET_QUA.OK && cu.sha_tui === sha.TUI && cu.sha_buu_gui === sha.BUU_GUI) {
        db.prepare('UPDATE ktt_nap_cap SET size_tui = ?, mtime_tui = ?, size_buu_gui = ?, mtime_buu_gui = ?, cap_nhat_luc = ? WHERE khoa_cap = ?')
          .run(c.tui.size ?? null, c.tui.mtime ?? null, c.buuGui.size ?? null, c.buuGui.mtime ?? null, t, c.khoa);
        return { ketQua: KET_QUA.DA_NAP, cap: docCap(db, c.khoa) };
      }
      const nguons = [nguonDaCo(r1), nguonDaCo(r2)].filter(Boolean).sort();
      const gios = [r1.gioMin, r2.gioMin, r1.gioMax, r2.gioMax].filter(Boolean).sort();
      const dem = (r, p) => ({ [`${p}_doc`]: r.dong, [`${p}_them`]: r.them, [`${p}_cap_nhat`]: r.capNhat, [`${p}_bo_qua`]: r.boQua, [`${p}_loi`]: r.loi, [`${p}_trung`]: r.trung || 0, [`${p}_khong_con`]: r.khongCon || 0 });
      db.prepare("DELETE FROM ktt_nap_cap WHERE substr(khoa_cap, 1, 16) = ? AND ket_qua = 'LOI'").run(`${c.khoa}!`); // lỗi tạm cũ của cùng cặp không còn ý nghĩa
      ghiCap(db, {
        khoa_cap: c.khoa, ten_file_tui: c.tui.name, ten_file_buu_gui: c.buuGui.name, sha_tui: sha.TUI, sha_buu_gui: sha.BUU_GUI,
        size_tui: c.tui.size ?? null, mtime_tui: c.tui.mtime ?? null, size_buu_gui: c.buuGui.size ?? null, mtime_buu_gui: c.buuGui.mtime ?? null,
        nguon_xuat_luc: nguons.length ? nguons[nguons.length - 1] : c.nguonTen, gio_min: gios[0] || null, gio_max: gios.length ? gios[gios.length - 1] : null,
        ...dem(r1, 'tui'), ...dem(r2, 'bg'), ket_qua: KET_QUA.OK, ma_loi: null, thong_bao: null, so_lan_thu: 0, thay_dau_luc: cu ? cu.thay_dau_luc : t, nap_luc: t, cap_nhat_luc: t
      });
      return { ketQua: KET_QUA.OK, cap: docCap(db, c.khoa) };
    }).immediate();
  } catch (e) {
    if (!(e instanceof CapTuChoi)) throw e;
    // Cả cặp đã hoàn tác (kể cả dòng ktt_nap_lan REJECTED do I.napFile ghi): chỉ giữ dòng nhật ký cặp.
    db.transaction(() => ghiLoiCap(db, c, { ma: e.ma, thongBao: e.message, now, tuChoi: true }))();
    return { ketQua: KET_QUA.TU_CHOI, ma: e.ma, thongBao: lamSach(e.message), cap: docCap(db, c.khoa) };
  }
}

// ------------------------------------------
// Độ mới, trạng thái, cảnh báo
// ------------------------------------------
/** Độ mới: { nguon_xuat_luc (giờ VN, lớn nhất của cặp OK), nap_luc (UTC), khoa_cap } | null nếu chưa có cặp OK nào. */
function docDoMoi(db) {
  return db.prepare("SELECT nguon_xuat_luc, nap_luc, khoa_cap FROM ktt_nap_cap WHERE ket_qua = 'OK' AND nguon_xuat_luc IS NOT NULL ORDER BY nguon_xuat_luc DESC, id DESC LIMIT 1").get() || null;
}

/**
 * Cảnh báo đang mở (tính từ nhật ký cặp, không lưu): mỗi phần tử { ma, ... } chỉ có tên file / ngày / số đếm.
 *  THIEU_FILE (a) · THIEU_CAP_NGAY (b) · CAP_TU_CHOI / CAP_LOI (c) · DU_LIEU_CU (d)
 */
function canhBao(db, now = new Date()) {
  const ra = [];
  const utc = nowUtc(now); const vn = nowVn(now);
  // (a) mới có một file, file kia chưa đến sau CHO_CAP_PHUT
  for (const r of db.prepare("SELECT * FROM ktt_nap_cap WHERE ket_qua = 'CHO_CAP' ORDER BY khoa_cap").all()) {
    const phut = Math.floor(phutCua(utc) - phutCua(r.thay_dau_luc));
    if (phut < CF.CHO_CAP_PHUT) continue;
    ra.push({ ma: 'THIEU_FILE', khoa_cap: r.khoa_cap, co_file: r.ten_file_tui || r.ten_file_buu_gui, thieu: r.ten_file_tui ? 'BUU_GUI' : 'TUI', phut_cho: phut });
  }
  // (b) ngày đã qua (kể từ ngày có cặp OK đầu tiên, tối đa SO_NGAY_XEM_LAI ngày) có ít hơn SO_CAP_TOI_THIEU_NGAY cặp OK
  const dau = db.prepare("SELECT MIN(substr(nguon_xuat_luc, 1, 10)) AS d FROM ktt_nap_cap WHERE ket_qua = 'OK' AND nguon_xuat_luc IS NOT NULL").get().d;
  if (dau) {
    const homNay = vn.slice(0, 10);
    const dem = new Map(db.prepare("SELECT substr(nguon_xuat_luc, 1, 10) AS d, COUNT(*) AS n FROM ktt_nap_cap WHERE ket_qua = 'OK' AND nguon_xuat_luc IS NOT NULL GROUP BY 1").all().map((r) => [r.d, r.n]));
    const tu = ngayThang(homNay, -CF.SO_NGAY_XEM_LAI);
    for (let d = dau > tu ? dau : tu; d < homNay; d = ngayThang(d, 1)) {
      const n = dem.get(d) || 0;
      if (n < CF.SO_CAP_TOI_THIEU_NGAY) ra.push({ ma: 'THIEU_CAP_NGAY', ngay: d, so_cap_ok: n, can: CF.SO_CAP_TOI_THIEU_NGAY });
    }
  }
  // (c) cặp bị từ chối / lỗi (trong SO_NGAY_GIU_CANH_BAO ngày gần đây theo lần xử lý cuối)
  const tuUtc = `${ngayThang(utc.slice(0, 10), -CF.SO_NGAY_GIU_CANH_BAO)} ${utc.slice(11)}`;
  for (const r of db.prepare("SELECT * FROM ktt_nap_cap WHERE ket_qua IN ('TU_CHOI', 'LOI') AND cap_nhat_luc >= ? ORDER BY khoa_cap").all(tuUtc)) {
    ra.push({ ma: r.ket_qua === 'TU_CHOI' ? 'CAP_TU_CHOI' : 'CAP_LOI', khoa_cap: r.khoa_cap.split('!')[0], ten_file_tui: r.ten_file_tui, ten_file_buu_gui: r.ten_file_buu_gui, ma_loi: r.ma_loi, thong_bao: r.thong_bao, so_lan_thu: r.so_lan_thu });
  }
  // (d) dữ liệu cũ: số giờ NẰM TRONG khung theo dõi kể từ nguon_xuat_luc của cặp OK gần nhất vượt CU_GIO (chưa có cặp OK nào: cũng báo)
  const moi = docDoMoi(db);
  const phutKhung = moi ? phutTrongKhung(moi.nguon_xuat_luc, vn, CF.KHUNG_GIO_TU, CF.KHUNG_GIO_DEN) : null;
  if (!moi || phutKhung > CF.CU_GIO * 60) {
    ra.push({ ma: 'DU_LIEU_CU', nguon_xuat_luc: moi ? moi.nguon_xuat_luc : null, gio_trong_khung: moi ? Math.round((phutKhung / 60) * 10) / 10 : null, nguong_gio: CF.CU_GIO });
  }
  return ra;
}

/** Danh sách cặp gần nhất (mới trước): chỉ tên file, giờ, số đếm, kết quả — không nội dung dòng, không sha256. */
function dsCap(db, soCap = 20) {
  return db.prepare('SELECT * FROM ktt_nap_cap ORDER BY khoa_cap DESC LIMIT ?').all(soCap).map((r) => ({
    khoa_cap: r.khoa_cap, ket_qua: r.ket_qua, ma_loi: r.ma_loi, thong_bao: r.thong_bao, so_lan_thu: r.so_lan_thu,
    ten_file_tui: r.ten_file_tui, ten_file_buu_gui: r.ten_file_buu_gui, nguon_xuat_luc: r.nguon_xuat_luc, gio_du_lieu_min: r.gio_min, gio_du_lieu_max: r.gio_max,
    tui: { doc: r.tui_doc, them: r.tui_them, cap_nhat: r.tui_cap_nhat, bo_qua: r.tui_bo_qua, loi: r.tui_loi, trung_trong_file: r.tui_trung, khong_con_trong_anh_chup: r.tui_khong_con },
    buu_gui: { doc: r.bg_doc, them: r.bg_them, cap_nhat: r.bg_cap_nhat, bo_qua: r.bg_bo_qua, loi: r.bg_loi, trung_trong_file: r.bg_trung, khong_con_trong_anh_chup: r.bg_khong_con },
    thay_dau_luc: r.thay_dau_luc, nap_luc: r.nap_luc, cap_nhat_luc: r.cap_nhat_luc
  }));
}

module.exports = {
  KET_QUA, nowUtc, nowVn, phutCua, giayCua, phutTrongKhung, phanTichTenKtt, lamSach, ghiCap, docCap, ghiChoCap, ghiLoiCap, napCap, docDoMoi, canhBao, dsCap
};
