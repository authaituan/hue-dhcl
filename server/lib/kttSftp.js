// ==========================================
// «Hàng tại KTT» (KTT-6): tự động nạp từ SFTP — quét thư mục KTT, ghép cặp (túi + bưu gửi cùng <yyyymmdd>_<hhmmss>), chờ file ổn định, tải, nạp cả cặp
// trong MỘT giao dịch (server/lib/kttNapCap.js), ghi nhật ký cặp. BỘ NẠP RIÊNG, độc lập với «Hàng đến» (sftpSync.js KHÔNG bị sửa): dùng lại lớp kết nối
// (sftpConnect.js), đọc cấu hình, phân loại lỗi, che bí mật (sftpFiles.js) và khoá đọc-chỉ `luotDangChay` (sftpSync.js). Mặc định TẮT (cùng cờ SFTP_SYNC_ENABLED);
// không chạy trong test; sai / thiếu cấu hình chỉ ghi MỘT dòng log nêu TÊN biến, máy chủ vẫn chạy. Chỉ thao tác ĐỌC trên SFTP.
// Không in / lưu mật khẩu, tên đăng nhập, nội dung file. Đồng hồ, kết nối, ngủ được tiêm để test không mạng. Docs: docs/ai/39_KTT_NAP_SFTP.md.
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const F = require('./sftpFiles');
const S = require('./sftpSync');
const Sch = require('./sftpScheduler');
const K = require('./kttNapCap');
const CF = require('../config/ktt-nap');

const TT = Object.freeze({ TAT: 'TAT', CAU_HINH_SAI: 'CAU_HINH_SAI', CHO: 'CHO', DANG_CHAY: 'DANG_CHAY', TAM_DUNG: 'TAM_DUNG', DA_DUNG: 'DA_DUNG', CHUA_KHOI_DONG: 'CHUA_KHOI_DONG' });
const KET_QUA_LUOT = Object.freeze({ XONG: 'XONG', CO_LOI: 'CO_LOI', LOI_KET_NOI: 'LOI_KET_NOI', BI_KHOA_DB: 'BI_KHOA_DB', BI_KHOA_TIEN_TRINH: 'BI_KHOA_TIEN_TRINH', HANG_DEN_TAM_DUNG: 'HANG_DEN_TAM_DUNG', LOI_BAT_NGO: 'LOI_BAT_NGO', TAM_DUNG: 'TAM_DUNG' });
const TROI_DAU_MS = 45000; // lượt đầu sau khi khởi động (lệch với «Hàng đến» 30 giây)
const DOI_KHI_BUSY_MS = Object.freeze([2000, 5000, 10000]); // SQLITE_BUSY: thử lại tối đa 3 lần (tổng 4 lần chạy)

const laBusy = (e) => !!e && /^SQLITE_BUSY/.test(String(e.code || ''));

// ------------------------------------------
// Cấu hình
// ------------------------------------------
/**
 * env -> { bat: false } khi không bật (chỉ SFTP_SYNC_ENABLED = '1' mới bật). Bật thì đọc + kiểm: kết nối dùng chung SFTP_HOST / PORT / USER / PASSWORD / HOSTKEY_SHA256,
 * thư mục KTT từ SFTP_KTT_DIR (mặc định /CSV_Report_530100; KHÔNG cần SFTP_DIRS), SFTP_STABLE_SECONDS. Sai -> ném F.CauHinhLoi (chỉ nêu TÊN biến).
 */
function docCauHinhKtt(env) {
  if (String((env && env.SFTP_SYNC_ENABLED) ?? '').trim() !== '1') return { bat: false };
  const sai = [];
  const tho = String((env && env.SFTP_KTT_DIR) ?? '').trim();
  const thuMuc = tho || CF.THU_MUC_MAC_DINH;
  if (!/^\/[^,\u0000-\u001f]*$/.test(thuMuc) || thuMuc.length > 200 || thuMuc.split('/').includes('..')) sai.push('SFTP_KTT_DIR');
  let cfg = null;
  try { cfg = F.docCauHinh({ ...env, SFTP_DIRS: sai.length ? CF.THU_MUC_MAC_DINH : thuMuc }, { showFingerprint: false }); } catch (e) { if (e instanceof F.CauHinhLoi) sai.push(...e.thieu); else throw e; }
  let onDinhGiay = 0;
  try { onDinhGiay = S.docCauHinhSync(env, {}).onDinhGiay; } catch (e) { if (e instanceof F.CauHinhLoi) sai.push(...e.thieu); else throw e; }
  if (sai.length) throw new F.CauHinhLoi(`Cấu hình nạp KTT thiếu / sai: ${[...new Set(sai)].join(', ')}`, [...new Set(sai)]);
  return { bat: true, cfg, thuMuc, onDinhGiay };
}

// ------------------------------------------
// «Ổn định» của file qua nhiều lượt quét (bảng RIÊNG ktt_nguon_file, cùng quy tắc với sftp_source_files của «Hàng đến»)
// ------------------------------------------
/** khop: [{ name, size, mtime }]. Trả Set tên file ỔN ĐỊNH: kích thước + mtime giữ nguyên qua ≥ 2 lượt và ≥ stableMs kể từ lần đầu thấy cặp giá trị hiện tại. */
function capNhatNguonKtt(db, khop, nowDate, stableMs) {
  const iso = nowDate.toISOString();
  const cu = new Map(db.prepare('SELECT * FROM ktt_nguon_file').all().map((r) => [r.ten_file, r]));
  const ins = db.prepare('INSERT INTO ktt_nguon_file (ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, giu_nguyen_tu, so_lan_giu_nguyen, con_tren_nguon) VALUES (?, ?, ?, ?, ?, ?, 0, 1)');
  const giu = db.prepare('UPDATE ktt_nguon_file SET lan_cuoi_thay = ?, so_lan_giu_nguyen = so_lan_giu_nguyen + 1, con_tren_nguon = 1 WHERE ten_file = ?');
  const doi = db.prepare('UPDATE ktt_nguon_file SET kich_thuoc = ?, mtime = ?, lan_cuoi_thay = ?, giu_nguyen_tu = ?, so_lan_giu_nguyen = 0, con_tren_nguon = 1 WHERE ten_file = ?');
  const mat = db.prepare('UPDATE ktt_nguon_file SET con_tren_nguon = 0 WHERE ten_file = ?');
  const onDinh = new Set();
  db.transaction(() => {
    const thay = new Set();
    for (const f of khop) {
      thay.add(f.name);
      const r = cu.get(f.name);
      if (!r) { ins.run(f.name, f.size, f.mtime, iso, iso, iso); continue; }
      if (Number(r.kich_thuoc) === f.size && Number(r.mtime) === f.mtime) {
        giu.run(iso, f.name);
        if (nowDate.getTime() - K.giayCua(r.giu_nguyen_tu) * 1000 >= stableMs) onDinh.add(f.name);
      } else doi.run(f.size, f.mtime, iso, iso, f.name);
    }
    for (const [ten, r] of cu) if (!thay.has(ten) && r.con_tren_nguon) mat.run(ten);
  })();
  return onDinh;
}

// ------------------------------------------
// Chạy lại khi SQLITE_BUSY (máy chủ KHÔNG đặt busy_timeout riêng: dùng mặc định của better-sqlite3)
// ------------------------------------------
async function thuLaiKhiBusy(fn, sleep, nhatKy) {
  for (let lan = 0; ; lan++) {
    try { return fn(); } catch (e) {
      if (!laBusy(e) || lan >= DOI_KHI_BUSY_MS.length) throw e;
      nhatKy(`Cơ sở dữ liệu đang bận (SQLITE_BUSY), thử lại sau ${DOI_KHI_BUSY_MS[lan] / 1000} giây (lần ${lan + 1}/${DOI_KHI_BUSY_MS.length}).`);
      await sleep(DOI_KHI_BUSY_MS[lan]);
    }
  }
}

// ------------------------------------------
// Một lượt quét
// ------------------------------------------
/** Dòng cặp khớp (kích thước + mtime) với lần đã thấy: không cần tải lại. */
const khopNguon = (r, t, b) => !!r && r.size_tui === t.size && r.mtime_tui === t.mtime && r.size_buu_gui === b.size && r.mtime_buu_gui === b.mtime;

/**
 * client: { list(dir), get(xa, cucBo) }. Trả { dem: {...}, cap: [{ khoa, ketQua }], loiThuMuc }.
 * Quy tắc: chỉ nạp khi ĐỦ cặp và CẢ HAI file ổn định; cũ trước (tối đa SO_CAP_TOI_DA_MOI_LUOT cặp mỗi lượt); cặp đã OK / TU_CHOI cùng kích thước + mtime thì không tải lại;
 * cặp LOI thử lại tối đa SO_LAN_THU_TOI_DA lần cho cùng kích thước + mtime.
 */
async function quetMotLan({ client, db, thuMuc, napFn = K.napCap, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tmpDir = os.tmpdir(), onDinhGiay = 60, bimat = [], log = () => {}, huy = () => false }) {
  const dem = { tongListKe: 0, fileLa: 0, capNap: 0, capDaCo: 0, capChoCap: 0, capChuaOnDinh: 0, capTuChoi: 0, capLoi: 0, capVuotToiDa: 0 };
  const kq = { dem, cap: [] };
  const lietKe = await client.list(thuMuc);
  dem.tongListKe = lietKe.length;
  const nhom = new Map(); // khoa -> { TUI, BUU_GUI }
  const khop = [];
  for (const e of lietKe) {
    const ten = String(e.name);
    const p = e.type === '-' ? K.phanTichTenKtt(ten) : null;
    if (!p) { dem.fileLa++; continue; }
    const f = { name: ten, size: Number(e.size) || 0, mtime: Number(e.modifyTime) || 0, ...p };
    khop.push(f);
    if (!nhom.has(p.khoa)) nhom.set(p.khoa, {});
    nhom.get(p.khoa)[p.loai] = f;
  }
  const nowDate = now();
  const onDinh = capNhatNguonKtt(db, khop, nowDate, onDinhGiay * 1000);
  const khoas = [...nhom.keys()].sort();
  let thuMucTam = null;
  try {
    for (const khoa of khoas) {
      if (huy()) { kq.daHuy = true; break; }
      const { TUI: t, BUU_GUI: b } = nhom.get(khoa);
      if (!t || !b) {
        const cu = K.ghiChoCap(db, { khoa, loai: t ? 'TUI' : 'BUU_GUI', ten: (t || b).name, size: (t || b).size, mtime: (t || b).mtime, now: nowDate });
        if (cu.ket_qua === K.KET_QUA.CHO_CAP) { dem.capChoCap++; kq.cap.push({ khoa, ketQua: 'CHO_CAP' }); } else dem.capDaCo++;
        continue;
      }
      const chinh = K.docCap(db, khoa);
      const bien = db.prepare("SELECT * FROM ktt_nap_cap WHERE substr(khoa_cap, 1, 16) = ? AND ket_qua IN ('TU_CHOI', 'LOI')").all(`${khoa}!`);
      const daXong = (r) => khopNguon(r, t, b) && (r.ket_qua === K.KET_QUA.OK || r.ket_qua === K.KET_QUA.TU_CHOI || (r.ket_qua === K.KET_QUA.LOI && r.so_lan_thu >= CF.SO_LAN_THU_TOI_DA));
      if (daXong(chinh) || bien.some(daXong)) { dem.capDaCo++; continue; }
      if (!onDinh.has(t.name) || !onDinh.has(b.name)) { dem.capChuaOnDinh++; continue; }
      if (dem.capNap + dem.capTuChoi + dem.capLoi >= CF.SO_CAP_TOI_DA_MOI_LUOT) { dem.capVuotToiDa++; continue; }

      if (!thuMucTam) thuMucTam = fs.mkdtempSync(path.join(tmpDir, `hue-dhcl-ktt-${crypto.randomBytes(4).toString('hex')}-`));
      const c = { khoa, nguonTen: t.nguon, tui: { path: path.join(thuMucTam, t.name), name: t.name, size: t.size, mtime: t.mtime }, buuGui: { path: path.join(thuMucTam, b.name), name: b.name, size: b.size, mtime: b.mtime } };
      try {
        for (const [f, x] of [[c.tui, t], [c.buuGui, b]]) {
          await client.get(`${thuMuc.replace(/\/+$/, '')}/${x.name}`, f.path);
          const size = fs.statSync(f.path).size;
          if (size !== x.size) throw Object.assign(new Error(`Tải về ${size} byte nhưng danh sách báo ${x.size} byte (file có thể đang được ghi)`), { code: 'KICH_THUOC_LECH' });
        }
        const r = await thuLaiKhiBusy(() => napFn(db, c, { now: nowDate }), sleep, log);
        kq.cap.push({ khoa, ketQua: r.ketQua });
        if (r.ketQua === K.KET_QUA.TU_CHOI) dem.capTuChoi++; else if (r.ketQua === K.KET_QUA.OK) dem.capNap++; else dem.capDaCo++;
      } catch (err) {
        dem.capLoi++;
        kq.cap.push({ khoa, ketQua: 'LOI' });
        const ma = laBusy(err) ? 'SQLITE_BUSY' : (String((err && err.code) || '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase().slice(0, 40) || 'LOI_TAI_HOAC_NAP');
        try { K.ghiLoiCap(db, c, { ma, thongBao: S.lamSach(err && err.message, bimat, 200), now: nowDate }); } catch (e2) { log(`Không ghi được nhật ký lỗi của cặp ${khoa}: ${laBusy(e2) ? 'SQLITE_BUSY' : 'lỗi ghi'}`); }
      } finally {
        for (const f of [c.tui.path, c.buuGui.path]) { try { fs.rmSync(f, { force: true }); } catch (e) { /* tệp tạm */ } }
      }
      await new Promise((r) => setImmediate(r)); // nhường vòng lặp sự kiện giữa hai cặp
    }
  } finally {
    if (thuMucTam) { try { fs.rmSync(thuMucTam, { recursive: true, force: true }); } catch (e) { /* tệp tạm */ } }
  }
  return kq;
}

// ------------------------------------------
// Hẹn giờ
// ------------------------------------------
const dongHoThat = {
  now: () => new Date(),
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
  clearTimeout: (h) => clearTimeout(h)
};

/**
 * Tạo bộ hẹn giờ KTT (chưa lên lịch; gọi .batDau()). opts: { db, env, clock, sleep, ketNoi (cfg -> client), log, tmpDir, troiDauMs, choPhepTrongTest, hangDen (() -> trạng thái hẹn giờ «Hàng đến»), tamDungHangDen }.
 Chu kỳ lấy từ tham số ktt_chu_ky_quet_phut MỖI lần hẹn lại. Trả { batDau, dung, chayNgay, trangThai }.
 Không chạy chồng: khoá trong tiến trình + bỏ qua khi `sftp_sync_runs` có lượt «Hàng đến» đang chạy (chỉ ĐỌC). Không kết nối khi hẹn giờ «Hàng đến» đang TẠM DỪNG vì xác thực / vân tay (tránh bị NAS chặn IP).
 Lỗi XÁC THỰC / VÂN TAY SAI: tạm dừng KTT (và «Hàng đến», qua tamDungHenGio có sẵn) đến khi khởi động lại.
 */
function taoBoHenGioKtt({ db, env = process.env, clock = dongHoThat, sleep, ketNoi, log = (...a) => console.log(...a), tmpDir, troiDauMs = TROI_DAU_MS, choPhepTrongTest = false,
  hangDen = Sch.docTrangThaiSftp, tamDungHangDen = Sch.tamDungHenGio } = {}) {
  const nhatKy = (m) => { try { log(`[ktt-sftp] ${m}`); } catch (e) { /* log hỏng không được làm sập */ } };
  const st = { trangThai: TT.TAT, lyDo: null, batLuc: null, luotGanNhat: null, luotKeTiep: null, chuKyPhut: null, thuMuc: null, soLuot: 0 };
  let cauHinh = null; let hen = null; let dangChay = null; let daDung = false; let bimat = [];

  const huyHen = () => { if (hen !== null) { clock.clearTimeout(hen); hen = null; } st.luotKeTiep = null; };
  const lenLich = (ms) => {
    if (daDung || st.trangThai === TT.TAM_DUNG) return;
    huyHen();
    st.luotKeTiep = new Date(clock.now().getTime() + ms).toISOString();
    st.trangThai = TT.CHO;
    hen = clock.setTimeout(() => { hen = null; st.luotKeTiep = null; return chayNgay().catch(() => {}); }, ms);
  };

  function batDau() {
    if (st.trangThai !== TT.TAT || st.batLuc) return;
    if (!choPhepTrongTest && Sch.laMoiTruongTest(env)) { st.lyDo = 'MOI_TRUONG_TEST'; return; }
    let c;
    try { c = docCauHinhKtt(env); } catch (err) {
      st.trangThai = TT.CAU_HINH_SAI;
      st.lyDo = err instanceof F.CauHinhLoi ? err.message : 'Lỗi đọc cấu hình';
      nhatKy(`${st.lyDo}. Bộ nạp KTT KHÔNG khởi động (máy chủ vẫn chạy bình thường).`);
      return;
    }
    if (!c.bat) return;
    cauHinh = c;
    bimat = [c.cfg.password, c.cfg.user];
    st.chuKyPhut = CF.CHU_KY_QUET_PHUT;
    st.thuMuc = c.thuMuc;
    st.batLuc = clock.now().toISOString();
    nhatKy(`Bật bộ nạp KTT: chu kỳ ${st.chuKyPhut} phút, thư mục ${F.tenAnToan(c.thuMuc, 60)} (${c.cfg.host}:${c.cfg.port}); lượt đầu sau ${Math.round(troiDauMs / 1000)} giây.`);
    lenLich(troiDauMs);
  }

  function chayNgay() {
    if (!cauHinh || daDung || st.trangThai === TT.TAM_DUNG) return Promise.resolve(st.luotGanNhat);
    if (dangChay) {
      st.luotGanNhat = { luc: clock.now().toISOString(), ketQua: KET_QUA_LUOT.BI_KHOA_TIEN_TRINH };
      return Promise.resolve(st.luotGanNhat);
    }
    dangChay = motLuot().catch((err) => {
      st.luotGanNhat = { luc: clock.now().toISOString(), ketQua: KET_QUA_LUOT.LOI_BAT_NGO, loi: S.lamSach(err && err.message, bimat, 120) };
      nhatKy(`Lỗi bất ngờ (lượt sau thử lại): ${st.luotGanNhat.loi}`);
    }).then(() => {
      dangChay = null;
      if (!daDung && st.trangThai !== TT.TAM_DUNG) { st.chuKyPhut = CF.CHU_KY_QUET_PHUT; lenLich(st.chuKyPhut * 60000); }
      return st.luotGanNhat;
    });
    return dangChay;
  }

  function tamDung(lyDo, chiTiet) {
    st.trangThai = TT.TAM_DUNG; st.lyDo = lyDo; huyHen();
    nhatKy(`TẠM DỪNG bộ nạp KTT (${lyDo}): ${chiTiet}. Sửa cấu hình rồi KHỞI ĐỘNG LẠI máy chủ; không tự thử lại để tránh bị NAS chặn IP.`);
    try { tamDungHangDen(lyDo, chiTiet); } catch (e) { /* «Hàng đến» có thể chưa bật */ }
  }

  async function motLuot() {
    st.trangThai = TT.DANG_CHAY; st.soLuot++;
    const bd = clock.now();
    const xong = (kq) => { st.luotGanNhat = { luc: bd.toISOString(), thoiGianMs: clock.now().getTime() - bd.getTime(), ...kq }; };
    const hd = (() => { try { return hangDen(); } catch (e) { return null; } })();
    if (hd && hd.trangThai === Sch.TT.TAM_DUNG) { xong({ ketQua: KET_QUA_LUOT.HANG_DEN_TAM_DUNG }); nhatKy('Bỏ qua: hẹn giờ «Hàng đến» đang tạm dừng vì xác thực / vân tay — không kết nối để tránh bị NAS chặn IP.'); return; }
    if (S.luotDangChay(db, bd.getTime())) { xong({ ketQua: KET_QUA_LUOT.BI_KHOA_DB }); nhatKy('Bỏ qua: đang có lượt đồng bộ «Hàng đến» chạy (khoá trong DB); thử lại ở chu kỳ sau.'); return; }
    let client = null;
    try {
      try {
        client = await (ketNoi || ((cfg) => require('./sftpConnect').ketNoiSftp(cfg)))(cauHinh.cfg);
      } catch (err) {
        const p = F.phanLoaiLoi(err, { saiVanTay: !!(err && err.saiVanTay) });
        const lyDo = p.nhom === 'van_tay' ? 'VAN_TAY_SAI' : p.nhom === 'xac_thuc' ? 'XAC_THUC' : null;
        const chiTiet = `${p.thongBao}${p.nhom === 'mang' || p.nhom === 'khac' ? `: ${S.lamSach(err && err.message, bimat, 150)}` : ''}`;
        xong({ ketQua: lyDo ? KET_QUA_LUOT.TAM_DUNG : KET_QUA_LUOT.LOI_KET_NOI, loi: p.nhom });
        if (lyDo) tamDung(lyDo, chiTiet); else nhatKy(`Không kết nối được (${p.nhom}): ${chiTiet}. Thử lại ở chu kỳ sau.`);
        return;
      }
      let kq;
      try {
        kq = await quetMotLan({ client, db, thuMuc: cauHinh.thuMuc, now: () => clock.now(), sleep: sleep || ((ms) => new Promise((r) => setTimeout(r, ms))), tmpDir: tmpDir || os.tmpdir(), onDinhGiay: cauHinh.onDinhGiay, bimat, log: nhatKy, huy: () => daDung });
      } catch (err) {
        const p = F.phanLoaiLoi(err);
        xong({ ketQua: KET_QUA_LUOT.CO_LOI, loi: p.nhom });
        nhatKy(`Lỗi khi liệt kê / quét thư mục (${p.nhom}): ${p.thongBao}. Thử lại ở chu kỳ sau.`);
        return;
      }
      const d = kq.dem;
      xong({ ketQua: d.capLoi || d.capTuChoi ? KET_QUA_LUOT.CO_LOI : KET_QUA_LUOT.XONG, dem: { ...d } });
      nhatKy(`Quét xong: nạp ${d.capNap} cặp, đã có ${d.capDaCo}, chờ cặp ${d.capChoCap}, chưa ổn định ${d.capChuaOnDinh}, từ chối ${d.capTuChoi}, lỗi ${d.capLoi}${d.capVuotToiDa ? `, hoãn ${d.capVuotToiDa}` : ''}${d.fileLa ? `, file lạ ${d.fileLa}` : ''} — ${st.luotGanNhat.thoiGianMs} ms.`);
      const cb = K.canhBao(db, clock.now());
      if (cb.length) { const dm = {}; for (const x of cb) dm[x.ma] = (dm[x.ma] || 0) + 1; nhatKy(`Cảnh báo đang mở: ${Object.entries(dm).map(([k, v]) => `${k}=${v}`).join(', ')}.`); }
    } finally {
      if (client) { try { await client.end(); } catch (e) { /* đã đóng */ } }
    }
  }

  async function dung() {
    daDung = true; huyHen();
    if (st.trangThai !== TT.TAM_DUNG) st.trangThai = TT.DA_DUNG;
    if (dangChay) { try { await dangChay; } catch (e) { /* đã xử lý */ } }
    if (st.trangThai !== TT.TAM_DUNG) st.trangThai = TT.DA_DUNG;
    return true;
  }

  const trangThai = () => ({ ...st, luotGanNhat: st.luotGanNhat ? { ...st.luotGanNhat } : null });
  return { batDau, dung, chayNgay, trangThai };
}

// ---------- một bộ hẹn giờ KTT cho cả máy chủ ----------
let hienTai = null;

/** Khởi động hẹn giờ KTT. KHÔNG ném lỗi. Trả đối tượng điều khiển (hoặc null nếu lỗi bất ngờ). */
function startKttScheduler(opts = {}) {
  try {
    hienTai = taoBoHenGioKtt(opts);
    hienTai.batDau();
    return hienTai;
  } catch (err) {
    try { console.error(`[ktt-sftp] Không khởi động được bộ nạp KTT: ${S.lamSach(err && err.message, [], 120)}`); } catch (e) { /* bỏ qua */ }
    return null;
  }
}
async function stopKttScheduler() { if (hienTai) await hienTai.dung(); return true; }
function docTrangThaiKtt() {
  return hienTai ? hienTai.trangThai() : { trangThai: TT.CHUA_KHOI_DONG, lyDo: null, batLuc: null, luotGanNhat: null, luotKeTiep: null, chuKyPhut: null, thuMuc: null, soLuot: 0 };
}

module.exports = { TT, KET_QUA_LUOT, DOI_KHI_BUSY_MS, docCauHinhKtt, capNhatNguonKtt, thuLaiKhiBusy, quetMotLan, taoBoHenGioKtt, startKttScheduler, stopKttScheduler, docTrangThaiKtt };
