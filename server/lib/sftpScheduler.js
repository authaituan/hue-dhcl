// ==========================================
// SANLUONG-5e: HẸN GIỜ tự động nạp file từ SFTP — đường nạp CHÍNH hằng ngày (docs/ai/15_SFTP_SCHEDULER.md). MẶC ĐỊNH TẮT.
// Phần lập lịch THUẦN: không nạp thư viện SFTP (lớp kết nối ./sftpConnect.js nạp lười khi thật sự kết nối); đồng hồ, kết nối, nạp được tiêm để test
// không mạng và không chờ thật. Một lượt: kết nối → liệt kê → nạp tối đa SFTP_SYNC_MAX_FILES file đủ điều kiện, cũ trước (lõi sftpSync.js,
// trigger 'TIMER', «ổn định» xét qua bảng sftp_source_files giữa các lượt) → ngắt kết nối. Lỗi mạng/thư mục: thử lại ở chu kỳ sau. Lỗi XÁC THỰC hoặc
// VÂN TAY SAI: TẠM DỪNG đến khi khởi động lại máy chủ (Synology có thể chặn IP nếu sai mật khẩu liên tục). Không bao giờ ném lỗi ra ngoài.
// Không in tên đăng nhập, mật khẩu, nội dung file.
// ==========================================
'use strict';
const F = require('./sftpFiles');
const S = require('./sftpSync');

const MAC_DINH = Object.freeze({ chuKyPhut: 10, chuKyToiThieuPhut: 2, chuKyToiDaPhut: 1440, maxFiles: 5, troiDauMs: 30000 });
const TT = Object.freeze({ TAT: 'TAT', CAU_HINH_SAI: 'CAU_HINH_SAI', CHO: 'CHO', DANG_CHAY: 'DANG_CHAY', TAM_DUNG: 'TAM_DUNG', DA_DUNG: 'DA_DUNG', CHUA_KHOI_DONG: 'CHUA_KHOI_DONG' });
const KET_QUA_LUOT = Object.freeze({
  XONG: 'XONG', CO_LOI: 'CO_LOI', LOI_KET_NOI: 'LOI_KET_NOI', BI_KHOA_DB: 'BI_KHOA_DB', BI_KHOA_TIEN_TRINH: 'BI_KHOA_TIEN_TRINH', LOI_BAT_NGO: 'LOI_BAT_NGO', TAM_DUNG: 'TAM_DUNG'
});

const dongHoThat = {
  now: () => new Date(),
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, // unref: hẹn giờ không giữ tiến trình sống khi tắt máy chủ
  clearTimeout: (h) => clearTimeout(h)
};

const laMoiTruongTest = (env) => !!(env && (env.NODE_TEST_CONTEXT || env.NODE_ENV === 'test'));

/** Số nguyên trong [lo, hi] hoặc null. */
const so = (raw, lo, hi) => { const n = Number(String(raw).trim()); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

/**
 * env -> { bat: false } khi không bật (chỉ giá trị '1' của SFTP_SYNC_ENABLED mới bật); bật thì đọc + kiểm cấu hình, sai -> ném F.CauHinhLoi
 * (thông báo chỉ nêu TÊN biến). Dùng lại SFTP_HOST/PORT/USER/PASSWORD/DIRS/HOSTKEY_SHA256 (F.docCauHinh), SFTP_SYNC_DAYS, SFTP_STABLE_SECONDS (S.docCauHinhSync).
 */
function docCauHinhHenGio(env) {
  if (String((env && env.SFTP_SYNC_ENABLED) ?? '').trim() !== '1') return { bat: false };
  const sai = [];
  const cfg = (() => { try { return F.docCauHinh(env, { showFingerprint: false }); } catch (e) { if (e instanceof F.CauHinhLoi) { sai.push(...e.thieu); return null; } throw e; } })();
  let dongBo = null;
  try { dongBo = S.docCauHinhSync(env, {}); } catch (e) { if (e instanceof F.CauHinhLoi) sai.push(...e.thieu); else throw e; }
  const tho = (k) => String((env && env[k]) ?? '').trim();
  let chuKyPhut = MAC_DINH.chuKyPhut;
  if (tho('SFTP_SYNC_INTERVAL_MINUTES')) {
    chuKyPhut = so(tho('SFTP_SYNC_INTERVAL_MINUTES'), MAC_DINH.chuKyToiThieuPhut, MAC_DINH.chuKyToiDaPhut);
    if (chuKyPhut === null) { sai.push('SFTP_SYNC_INTERVAL_MINUTES'); chuKyPhut = MAC_DINH.chuKyPhut; }
  }
  let maxFiles = MAC_DINH.maxFiles;
  if (tho('SFTP_SYNC_MAX_FILES')) {
    maxFiles = so(tho('SFTP_SYNC_MAX_FILES'), 1, 1000);
    if (maxFiles === null) { sai.push('SFTP_SYNC_MAX_FILES'); maxFiles = MAC_DINH.maxFiles; }
  }
  if (sai.length) throw new F.CauHinhLoi(`Cấu hình hẹn giờ SFTP thiếu / sai: ${[...new Set(sai)].join(', ')}`, [...new Set(sai)]);
  return { bat: true, cfg, soNgay: dongBo.soNgay, onDinhGiay: dongBo.onDinhGiay, chuKyPhut, maxFiles };
}

/**
 * Tạo bộ hẹn giờ (chưa lên lịch; gọi .batDau()). opts: { db, env, clock, sleep, ketNoi (cfg -> client), importFn, log, tmpDir, troiDauMs, choPhepTrongTest }.
 * Trả { batDau(), dung() (Promise), chayNgay() (Promise, một lượt NGAY — dùng cho test / ticket API sau), trangThai() }.
 */
function taoBoHenGio({ db, env = process.env, clock = dongHoThat, sleep, ketNoi, importFn, log = (...a) => console.log(...a), tmpDir, troiDauMs = MAC_DINH.troiDauMs, choPhepTrongTest = false } = {}) {
  const nhatKy = (m) => { try { log(`[sftp-sync] ${m}`); } catch (e) { /* log hỏng không được làm sập */ } };
  const st = {
    trangThai: TT.TAT, lyDo: null, batLuc: null, luotGanNhat: null, luotKeTiep: null, chuKyPhut: null, maxFiles: null, soLuot: 0
  };
  let cauHinh = null;
  let hen = null;
  let dangChay = null; // Promise của lượt đang chạy (khoá trong tiến trình)
  let daDung = false;
  let bimat = [];

  const huyHen = () => { if (hen !== null) { clock.clearTimeout(hen); hen = null; } st.luotKeTiep = null; };
  const lenLich = (ms) => {
    if (daDung || st.trangThai === TT.TAM_DUNG) return;
    huyHen();
    st.luotKeTiep = new Date(clock.now().getTime() + ms).toISOString();
    st.trangThai = TT.CHO;
    hen = clock.setTimeout(() => { hen = null; st.luotKeTiep = null; return chayNgay().catch(() => {}); }, ms); // trả Promise để đồng hồ giả (test) đợi lượt chạy xong
  };

  function batDau() {
    if (st.trangThai !== TT.TAT || st.batLuc) return;
    if (!choPhepTrongTest && laMoiTruongTest(env)) { st.lyDo = 'MOI_TRUONG_TEST'; return; } // KHÔNG chạy trong test / harness
    let c;
    try {
      c = docCauHinhHenGio(env);
    } catch (err) {
      st.trangThai = TT.CAU_HINH_SAI;
      st.lyDo = err instanceof F.CauHinhLoi ? err.message : 'Lỗi đọc cấu hình';
      nhatKy(`${st.lyDo}. Hẹn giờ KHÔNG khởi động (máy chủ vẫn chạy bình thường).`); // MỘT dòng, chỉ tên biến
      return;
    }
    if (!c.bat) return; // mặc định tắt: im lặng
    cauHinh = c;
    bimat = [c.cfg.password, c.cfg.user];
    st.chuKyPhut = c.chuKyPhut;
    st.maxFiles = c.maxFiles;
    st.batLuc = clock.now().toISOString();
    nhatKy(`Bật hẹn giờ: chu kỳ ${c.chuKyPhut} phút, tối đa ${c.maxFiles} file/lượt, ${c.cfg.dirs.length} thư mục (${c.cfg.host}:${c.cfg.port}); lượt đầu sau ${Math.round(troiDauMs / 1000)} giây.`);
    lenLich(troiDauMs);
  }

  /** Chạy MỘT lượt ngay. Không bao giờ ném lỗi. Trả luotGanNhat. */
  function chayNgay() {
    if (!cauHinh || daDung || st.trangThai === TT.TAM_DUNG) return Promise.resolve(st.luotGanNhat);
    if (dangChay) {
      st.luotGanNhat = { luc: clock.now().toISOString(), ketQua: KET_QUA_LUOT.BI_KHOA_TIEN_TRINH };
      nhatKy('Bỏ qua: lượt trước vẫn đang chạy (khoá trong tiến trình).');
      return Promise.resolve(st.luotGanNhat);
    }
    dangChay = motLuot().catch((err) => {
      st.luotGanNhat = { luc: clock.now().toISOString(), ketQua: KET_QUA_LUOT.LOI_BAT_NGO, loi: S.lamSach(err && err.message, bimat, 120) };
      nhatKy(`Lỗi bất ngờ (lượt sau thử lại): ${st.luotGanNhat.loi}`);
    }).then(() => {
      dangChay = null;
      if (!daDung && st.trangThai !== TT.TAM_DUNG) lenLich(cauHinh.chuKyPhut * 60000);
      return st.luotGanNhat;
    });
    return dangChay;
  }

  function tamDung(lyDo, chiTiet) {
    st.trangThai = TT.TAM_DUNG;
    st.lyDo = lyDo;
    huyHen();
    nhatKy(`TẠM DỪNG hẹn giờ (${lyDo}): ${chiTiet}. Sửa cấu hình rồi KHỞI ĐỘNG LẠI máy chủ để chạy lại; không tự thử lại để tránh bị NAS chặn IP.`);
  }

  async function motLuot() {
    st.trangThai = TT.DANG_CHAY;
    st.soLuot++;
    const bd = clock.now();
    const xong = (kq) => { st.luotGanNhat = { luc: bd.toISOString(), thoiGianMs: clock.now().getTime() - bd.getTime(), ...kq }; };
    if (S.luotDangChay(db, bd.getTime())) {
      xong({ ketQua: KET_QUA_LUOT.BI_KHOA_DB });
      nhatKy('Bỏ qua: đang có một lượt khác chạy (khoá trong DB, vd script chạy tay).');
      return;
    }
    let client = null;
    try {
      try {
        client = await (ketNoi || ((cfg) => require('./sftpConnect').ketNoiSftp(cfg)))(cauHinh.cfg);
      } catch (err) {
        const p = F.phanLoaiLoi(err, { saiVanTay: !!(err && err.saiVanTay) });
        const lyDo = p.nhom === 'van_tay' ? 'VAN_TAY_SAI' : p.nhom === 'xac_thuc' ? 'XAC_THUC' : null;
        const chiTiet = `${p.thongBao}${p.nhom === 'mang' || p.nhom === 'khac' ? `: ${S.lamSach(err && err.message, bimat, 150)}` : ''}`;
        const ghi = lyDo ? `Tạm dừng hẹn giờ: ${chiTiet}. Sửa SFTP_PASSWORD / SFTP_HOSTKEY_SHA256 rồi khởi động lại máy chủ.` : `Không kết nối được (${p.nhom}): ${chiTiet}. Thử lại ở chu kỳ sau.`;
        const runId = S.ghiLuotThatBai(db, clock.now(), 'TIMER', ghi, bimat);
        xong({ ketQua: lyDo ? KET_QUA_LUOT.TAM_DUNG : KET_QUA_LUOT.LOI_KET_NOI, runId, loi: p.nhom });
        if (lyDo) tamDung(lyDo, chiTiet); else nhatKy(`Lượt #${runId}: ${ghi}`);
        return;
      }
      const kq = await S.syncSftpOnce({
        client, db, dirs: cauHinh.cfg.dirs, now: () => clock.now(), sleep: sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
        tmpDir: tmpDir || require('os').tmpdir(),
        options: {
          trigger: 'TIMER', oDinh: 'BANG', soNgay: cauHinh.soNgay, onDinhGiay: cauHinh.onDinhGiay, toiDa: cauHinh.maxFiles,
          bimat, huy: () => daDung, ...(importFn ? { importFn } : {})
        }
      });
      if (kq.biKhoa) {
        xong({ ketQua: KET_QUA_LUOT.BI_KHOA_DB, luotKhac: kq.luotDangChay });
        nhatKy(`Bỏ qua: lượt #${kq.luotDangChay} đang chạy (khoá trong DB).`);
        return;
      }
      const d = kq.dem;
      const xacThuc = kq.loiThuMuc.find((t) => t.ma === F.MA_THOAT.XAC_THUC || t.ma === F.MA_THOAT.VAN_TAY);
      xong({
        ketQua: S.maThoat(kq) === 0 ? KET_QUA_LUOT.XONG : KET_QUA_LUOT.CO_LOI, runId: kq.runId,
        dem: { daNap: d.daNap, daCo: d.daCo, chuaOnDinh: d.chuaOnDinh, rong: d.rong, boQuaKhac: d.boQuaKhac, loi: d.loi, maLa: d.maLa }
      });
      nhatKy(`Lượt #${kq.runId}: nạp ${d.daNap}, đã có ${d.daCo}, chưa ổn định ${d.chuaOnDinh}, rỗng ${d.rong}, bỏ qua ${d.boQuaKhac}, lỗi ${d.loi}${d.maLa ? `, mã lạ ${d.maLa} (không nạp)` : ''} — ${st.luotGanNhat.thoiGianMs} ms.`);
      if (kq.loiThuMuc.length) nhatKy(`Lỗi thư mục: ${kq.loiThuMuc.map((t) => `${F.tenAnToan(t.thuMuc, 60)} [${t.nhom}]`).join('; ')}`);
      if (xacThuc) tamDung(xacThuc.ma === F.MA_THOAT.VAN_TAY ? 'VAN_TAY_SAI' : 'XAC_THUC', xacThuc.nhom);
    } finally {
      if (client) { try { await client.end(); } catch (e) { /* đã đóng */ } }
    }
  }

  async function dung() {
    daDung = true;
    huyHen();
    if (st.trangThai !== TT.TAM_DUNG) { st.trangThai = TT.DA_DUNG; }
    if (dangChay) { try { await dangChay; } catch (e) { /* đã được xử lý */ } }
    if (st.trangThai !== TT.TAM_DUNG) st.trangThai = TT.DA_DUNG;
    return true;
  }

  const trangThai = () => ({ ...st, luotGanNhat: st.luotGanNhat ? { ...st.luotGanNhat } : null });
  return { batDau, dung, chayNgay, trangThai };
}

// ---------- một bộ hẹn giờ cho cả máy chủ ----------
let hienTai = null;

/** Khởi động hẹn giờ. KHÔNG ném lỗi. Trả đối tượng điều khiển (hoặc bộ ở trạng thái TAT / CAU_HINH_SAI). */
function startSftpScheduler(opts = {}) {
  try {
    hienTai = taoBoHenGio(opts);
    hienTai.batDau();
    return hienTai;
  } catch (err) {
    try { console.error(`[sftp-sync] Không khởi động được hẹn giờ: ${S.lamSach(err && err.message, [], 120)}`); } catch (e) { /* bỏ qua */ }
    return null;
  }
}

/** Dừng gọn: huỷ hẹn giờ, đợi lượt đang chạy (nếu có) kết thúc file hiện tại. */
async function stopSftpScheduler() {
  if (hienTai) await hienTai.dung();
  return true;
}

/** Trạng thái cho nơi khác (ticket API sau): { trangThai (TAT | CAU_HINH_SAI | CHO | DANG_CHAY | TAM_DUNG | DA_DUNG), lyDo, batLuc, luotGanNhat, luotKeTiep, chuKyPhut, maxFiles, soLuot }. */
function docTrangThaiSftp() {
  return hienTai ? hienTai.trangThai() : { trangThai: TT.CHUA_KHOI_DONG, lyDo: null, batLuc: null, luotGanNhat: null, luotKeTiep: null, chuKyPhut: null, maxFiles: null, soLuot: 0 };
}

module.exports = { MAC_DINH, TT, KET_QUA_LUOT, docCauHinhHenGio, taoBoHenGio, startSftpScheduler, stopSftpScheduler, docTrangThaiSftp, laMoiTruongTest };
