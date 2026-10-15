// ==========================================
// SANLUONG-5c: lõi đồng bộ SFTP — quét thư mục, chọn file CHƯA nạp và ĐÃ ỔN ĐỊNH, tải về thư mục tạm (giữ nguyên tên gốc), gọi importer
// (arrivalsImport.importArrivalFile, source = 'SFTP'), ghi kết quả vào bảng «lượt lấy», xoá tệp tạm. Chạy tay (scripts/sftp-sync.js); CHƯA hẹn giờ (5e).
// KHÔNG nạp thư viện SFTP ở đây: `client` được tiêm vào (giao diện chỉ gồm list / get / end — nơi này chỉ gọi list và get; người gọi tự end()).
// Chỉ thao tác ĐỌC trên SFTP. Không sửa logic importer. Không in / lưu mật khẩu, nội dung file, mã vận đơn. Docs: docs/ai/13_SFTP_SYNC.md.
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const F = require('./sftpFiles');
const { VALID_BCVH_CODES } = require('./userBcvh');
const { importArrivalFile, FILE_NAME_RE } = require('./arrivalsImport');

const KHOA_PHUT = 30; // lượt chưa kết thúc bắt đầu cách đây < 30 phút = đang chạy; quá thế = treo
const MAC_DINH = Object.freeze({ soNgay: 3, onDinhGiay: 60, toiDa: 5 });
const KET_QUA = Object.freeze({ DA_NAP: 'DA_NAP', DA_CO: 'DA_CO', CHUA_ON_DINH: 'CHUA_ON_DINH', EMPTY: 'EMPTY', LOI: 'LOI', BO_QUA: 'BO_QUA', WOULD_IMPORT: 'WOULD_IMPORT' });
const KET_QUA_LIST = Object.values(KET_QUA);
// Importer KHÔNG kiểm mã đơn vị với danh mục BCVH (lấy mã từ tên file, nạp mọi mã) nên mã sai chính tả sẽ tạo «BCVH ma» trong số liệu.
// Từ SANLUONG-5e (PO duyệt) lõi đồng bộ BỎ QUA file mã lạ (BO_QUA + MA_LA): không tải, không nạp.
const MA_LA_GHI_CHU = (ma) => `Mã đơn vị ${F.tenAnToan(ma, 12)} không thuộc 6 BCVH — không tải, không nạp`;

// ------------------------------------------
// Lược đồ «lượt lấy» (idempotent; gọi từ server/db.js và từ scripts/sftp-sync.js khi mở DB ghi)
// ------------------------------------------
function ensureSftpSyncSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sftp_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,            -- UTC ISO (YYYY-MM-DDTHH:MM:SS.sssZ)
      finished_at TEXT,                    -- NULL = đang chạy (hoặc treo); luôn được đặt khi lượt kết thúc, kể cả lỗi
      "trigger" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("trigger" IN ('MANUAL', 'TIMER')),
      dry_run INTEGER NOT NULL DEFAULT 0,  -- chừa chỗ; 5c không ghi lượt chạy khô nên luôn 0
      tong_liet_ke INTEGER NOT NULL DEFAULT 0,
      da_nap INTEGER NOT NULL DEFAULT 0,
      da_co INTEGER NOT NULL DEFAULT 0,
      chua_on_dinh INTEGER NOT NULL DEFAULT 0,
      rong INTEGER NOT NULL DEFAULT 0,
      bo_qua_khac INTEGER NOT NULL DEFAULT 0,
      loi INTEGER NOT NULL DEFAULT 0,
      ghi_chu_loi TEXT                     -- đã che bí mật và số dài; không chứa nội dung file
    );
    CREATE INDEX IF NOT EXISTS ix_sftp_runs_started ON sftp_sync_runs(started_at);
    CREATE TABLE IF NOT EXISTS sftp_sync_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES sftp_sync_runs(id),
      thu_muc TEXT NOT NULL,
      ten_file TEXT NOT NULL,
      ket_qua TEXT NOT NULL CHECK (ket_qua IN (${KET_QUA_LIST.map((k) => `'${k}'`).join(', ')})),
      so_dong INTEGER,                     -- số dòng importer đọc được (NULL nếu không nạp)
      thoi_gian_ms INTEGER,                -- thời gian tải + nạp một file
      ma_loi TEXT,                         -- mã ngắn (vd REJECTED, MA_LA, VUOT_TOI_DA); không có nội dung dữ liệu
      chi_tiet TEXT                        -- câu ngắn đã che (cảnh báo / lý do importer); có thể NULL
    );
    CREATE INDEX IF NOT EXISTS ix_sftp_files_run ON sftp_sync_files(run_id);
    CREATE INDEX IF NOT EXISTS ix_sftp_files_name ON sftp_sync_files(ten_file);
    -- Danh sách file đang / đã thấy trên nguồn (SANLUONG-5e): dùng để xét «file ổn định» qua nhiều lượt (không chờ trong một lượt) và để màn quản trị
    -- sau này phân biệt «nguồn có file, chưa nạp» với «nguồn chưa có file». Giữ cả file đã biến mất khỏi nguồn (con_tren_nguon = 0, lan_cuoi_thay = lần cuối thấy).
    CREATE TABLE IF NOT EXISTS sftp_source_files (
      thu_muc TEXT NOT NULL,
      ten_file TEXT NOT NULL,
      kich_thuoc INTEGER NOT NULL,
      mtime INTEGER NOT NULL,              -- ms từ epoch, đúng như máy chủ SFTP báo (KHÔNG so với đồng hồ máy)
      lan_dau_thay TEXT NOT NULL,          -- UTC ISO
      lan_cuoi_thay TEXT NOT NULL,
      so_lan_giu_nguyen INTEGER NOT NULL DEFAULT 0, -- số lượt liên tiếp (sau lần đầu) kích thước + mtime không đổi
      giu_nguyen_tu TEXT NOT NULL,         -- lần đầu thấy cặp (kích thước, mtime) hiện tại
      con_tren_nguon INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (thu_muc, ten_file)
    );
  `);
}

// ------------------------------------------
// Tham số / cấu hình
// ------------------------------------------
const intTrong = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

/** env: SFTP_SYNC_DAYS (mặc định 3), SFTP_STABLE_SECONDS (mặc định 60). Giá trị sai -> CauHinhLoi (nêu TÊN biến). args: kết quả docThamSoSync. */
function docCauHinhSync(env, args = {}) {
  const sai = [];
  const doc = (ten, mac, lo, hi) => {
    const raw = String(env[ten] ?? '').trim();
    if (!raw) return mac;
    const n = intTrong(raw, lo, hi);
    if (n === null) { sai.push(ten); return mac; }
    return n;
  };
  const soNgay = doc('SFTP_SYNC_DAYS', MAC_DINH.soNgay, 0, 3650);
  const onDinhGiay = args.onDinhGiay != null ? args.onDinhGiay : doc('SFTP_STABLE_SECONDS', MAC_DINH.onDinhGiay, 0, 600);
  if (sai.length) throw new F.CauHinhLoi(`Cấu hình giá trị không hợp lệ: ${sai.join(', ')}`, sai);
  return { soNgay, onDinhGiay, tuNgay: args.tuNgay || null, toiDa: args.toiDa != null ? args.toiDa : MAC_DINH.toiDa };
}

/** argv -> { chayThat, tuNgay ('YYYY-MM-DD' | null), toiDa, onDinhGiay | null, troGiup }. Sai -> CauHinhLoi. */
function docThamSoSync(argv) {
  const out = { chayThat: false, tuNgay: null, toiDa: MAC_DINH.toiDa, onDinhGiay: null, troGiup: false };
  for (const a of argv) {
    let m;
    if (a === '--chay-that') out.chayThat = true;
    else if (a === '--help' || a === '-h') out.troGiup = true;
    else if ((m = /^--tu-ngay=(\d{8})$/.exec(a))) {
      const d = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
      if (!ngayCoThat(d)) throw new F.CauHinhLoi('--tu-ngay=yyyymmdd phải là ngày có thật');
      out.tuNgay = d;
    } else if ((m = /^--toi-da=(\d+)$/.exec(a))) {
      const n = intTrong(m[1], 1, 1000);
      if (n === null) throw new F.CauHinhLoi('--toi-da=N phải từ 1 đến 1000');
      out.toiDa = n;
    } else if ((m = /^--on-dinh=(\d+)$/.exec(a))) {
      const n = intTrong(m[1], 0, 600);
      if (n === null) throw new F.CauHinhLoi('--on-dinh=GIÂY phải từ 0 đến 600');
      out.onDinhGiay = n;
    } else throw new F.CauHinhLoi(`Tuỳ chọn không hỗ trợ: ${F.tenAnToan(a, 40)}`);
  }
  return out;
}

function ngayCoThat(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

const FMT_NGAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Ngày (YYYY-MM-DD) theo giờ Asia/Bangkok của một Date. */
const ngayBangkok = (d) => FMT_NGAY.format(d);
const congNgay = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ------------------------------------------
// An toàn
// ------------------------------------------
/** Tên tệp tạm phải là MỘT tên file trơn khớp mẫu nguồn: không '/', '\\', '..', NUL, không phải đường dẫn. Ném lỗi nếu không. */
function kiemTraTenTep(ten) {
  const s = String(ten);
  if (!s || s.length > 120 || /[\\/\u0000]/.test(s) || s.includes('..') || s !== path.basename(s) || !FILE_NAME_RE.test(s)) {
    throw Object.assign(new Error('Tên tệp tạm không an toàn'), { code: 'TEN_TEP_KHONG_AN_TOAN' });
  }
  return s;
}

/** Làm sạch một câu trước khi lưu / in: che bí mật, bỏ dãy số ≥ 15 chữ số (có thể là số hiệu), bỏ ký tự điều khiển, cắt ngắn. */
function lamSach(text, bimat = [], max = 200) {
  return F.tenAnToan(F.anBiMat(text, bimat).replace(/\d{15,}/g, '[số dài]'), max);
}
const maLoiNgan = (err, mac = 'LOI') => {
  const c = String((err && err.code) || '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase().slice(0, 40);
  return c || mac;
};

// ------------------------------------------
// Khoá chống chạy chồng + ghi lượt
// ------------------------------------------
function bangLuotTonTai(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sftp_sync_runs'").get();
}

/** Lượt chưa kết thúc bắt đầu cách đây < KHOA_PHUT phút (null nếu không có hoặc bảng chưa tạo). Không ghi gì. */
function luotDangChay(db, nowMs) {
  if (!bangLuotTonTai(db)) return null;
  const rows = db.prepare('SELECT id, started_at FROM sftp_sync_runs WHERE finished_at IS NULL ORDER BY id DESC').all();
  return rows.find((r) => nowMs - Date.parse(r.started_at) < KHOA_PHUT * 60000) || null;
}

/** Bắt đầu lượt trong MỘT giao dịch ghi (chống hai tiến trình cùng vào): đóng các lượt treo > 30 phút, từ chối nếu còn lượt đang chạy. */
function batDauLuot(db, now, trigger) {
  return db.transaction(() => {
    const nowMs = now.getTime();
    const dang = luotDangChay(db, nowMs);
    if (dang) return { biKhoa: true, luotDangChay: dang.id };
    const treo = db.prepare('SELECT id FROM sftp_sync_runs WHERE finished_at IS NULL').all();
    for (const t of treo) {
      db.prepare('UPDATE sftp_sync_runs SET finished_at = ?, ghi_chu_loi = ? WHERE id = ?')
        .run(now.toISOString(), `Lượt treo quá ${KHOA_PHUT} phút, tự đóng khi bắt đầu lượt mới`, t.id);
    }
    const id = db.prepare('INSERT INTO sftp_sync_runs (started_at, "trigger") VALUES (?, ?)').run(now.toISOString(), trigger).lastInsertRowid;
    return { biKhoa: false, runId: Number(id), luotTreoDaDong: treo.map((t) => t.id) };
  }).immediate();
}

// ------------------------------------------
// Lõi
// ------------------------------------------
// Thứ tự nạp: ngày/giờ trong tên tăng dần; cùng thời điểm thì theo mã đơn vị tăng dần (lượt lặp lại cho kết quả giống nhau); rồi tên, thư mục.
const choNguoc = (a, b) => (a.khoa < b.khoa ? -1 : a.khoa > b.khoa ? 1 : F.soSanhMa(a.maDonVi, b.maDonVi) || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.thuMuc < b.thuMuc ? -1 : a.thuMuc > b.thuMuc ? 1 : 0));

/**
 * Một lượt đồng bộ.
 *  client: { list(thuMuc) -> [{type,name,size,modifyTime}], get(duongDanTuXa, duongDanCucBo) } (ssh2-sftp-client thoả; người gọi tự end()).
 *  db: handle better-sqlite3 (chạy khô: có thể mở readonly — hàm KHÔNG ghi gì khi dryRun). dirs: ['/CSV_Report_533140', …].
 *  now: () => Date. sleep: (ms) => Promise. tmpDir: thư mục gốc cho tệp tạm (mặc định os.tmpdir()).
 *  options: { dryRun, tuNgay ('YYYY-MM-DD'), soNgay (mặc định 3), onDinhGiay (60), toiDa (5), trigger ('MANUAL' | 'TIMER'), importFn (mặc định importArrivalFile), maDaBiet (mặc định 6 BCVH), bimat: [chuỗi cần che], log(fn),
 *    oDinh ('HAI_LAN' mặc định: liệt kê hai lần cách onDinhGiay giây; 'BANG': MỘT lần liệt kê, ổn định xét qua bảng sftp_source_files giữa các lượt — dùng cho hẹn giờ),
 *    nhuong() (mặc định setImmediate: nhường vòng lặp sự kiện giữa hai file), huy() (true = dừng trước file kế tiếp),
 *    luotCoSan (id hàng sftp_sync_runs đã được giữ sẵn bởi người gọi — bỏ qua bước giành khoá; 5f-2) }
 * Một thư mục có thể chứa file của NHIỀU mã đơn vị (mã lấy từ TÊN FILE, như importer); `toiDa` và «từ ngày» áp dụng chung cho mọi mã.
 * Trả { biKhoa, runId, tuNgay, dryRun, dem: {…, maLa}, theoMa: {mã: {tong, daNap, sapNap, daCo, chuaOnDinh, rong, loi, boQua, laMa}}, files: [{thuMuc, tenFile, maDonVi, ketQua, soDong, thoiGianMs, maLoi, chiTiet}], loiThuMuc: [{thuMuc, ma, nhom, thongBao}] }.
 */
async function syncSftpOnce({ client, db, dirs, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tmpDir = os.tmpdir(), options = {} }) {
  const o = {
    dryRun: false, soNgay: MAC_DINH.soNgay, onDinhGiay: MAC_DINH.onDinhGiay, toiDa: MAC_DINH.toiDa, trigger: 'MANUAL',
    importFn: importArrivalFile, maDaBiet: VALID_BCVH_CODES, bimat: [], log: () => {}, oDinh: 'HAI_LAN',
    nhuong: () => new Promise((r) => setImmediate(r)), huy: () => false, ...options
  };
  const bang = o.oDinh === 'BANG' && !o.dryRun; // chạy khô không ghi gì nên luôn dùng cách hai lần liệt kê
  const batDau = now();
  const tuNgay = o.tuNgay || congNgay(ngayBangkok(batDau), -o.soNgay);
  const ketQua = {
    biKhoa: false, runId: null, tuNgay, dryRun: !!o.dryRun,
    dem: { tongListKe: 0, daNap: 0, daCo: 0, chuaOnDinh: 0, rong: 0, boQuaKhac: 0, loi: 0, wouldImport: 0, maLa: 0 },
    theoMa: {}, files: [], loiThuMuc: []
  };
  // Thống kê theo mã đơn vị: mã đã biết luôn có mặt (kể cả 0 file) để thấy BCVH nào chưa có file; mã lạ xuất hiện khi gặp.
  const moTa = (ma) => (ketQua.theoMa[ma] = ketQua.theoMa[ma] || { tong: 0, daNap: 0, sapNap: 0, daCo: 0, chuaOnDinh: 0, rong: 0, loi: 0, boQua: 0, laMa: !o.maDaBiet.includes(ma) });
  for (const ma of o.maDaBiet) moTa(ma);
  const COT = { DA_NAP: 'daNap', WOULD_IMPORT: 'sapNap', DA_CO: 'daCo', CHUA_ON_DINH: 'chuaOnDinh', EMPTY: 'rong', LOI: 'loi', BO_QUA: 'boQua' };

  // ---- khoá + ghi lượt (không làm gì khi chạy khô)
  if (o.dryRun) {
    const dang = luotDangChay(db, batDau.getTime());
    if (dang) ketQua.luotDangChay = dang.id; // chỉ để báo; chạy khô không ghi nên không cần chặn
  } else {
    if (o.luotCoSan != null) {
      ketQua.runId = o.luotCoSan; // SANLUONG-5f-2: người gọi đã giữ khoá và tạo hàng lượt; hàm này chỉ ghi kết quả vào hàng đó rồi đóng nó
    } else {
      const k = batDauLuot(db, batDau, o.trigger);
      if (k.biKhoa) return { ...ketQua, biKhoa: true, luotDangChay: k.luotDangChay };
      ketQua.runId = k.runId;
    }
  }

  const ghiFile = db && !o.dryRun ? db.prepare('INSERT INTO sftp_sync_files (run_id, thu_muc, ten_file, ket_qua, so_dong, thoi_gian_ms, ma_loi, chi_tiet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)') : null;
  const ghiLoiChung = [];
  const them = (r) => {
    moTa(r.maDonVi)[COT[r.ketQua]]++;
    ketQua.files.push(r);
    if (ghiFile) ghiFile.run(ketQua.runId, r.thuMuc, r.tenFile, r.ketQua, r.soDong ?? null, r.thoiGianMs ?? null, r.maLoi ?? null, r.chiTiet ?? null);
    o.log(`${r.ketQua}  ${r.thuMuc}/${r.tenFile}${r.soDong != null ? `  ${r.soDong} dòng` : ''}${r.thoiGianMs != null ? `  ${r.thoiGianMs} ms` : ''}${r.maLoi ? `  [${r.maLoi}]` : ''}`);
  };

  let thuMucTam = null;
  try {
    // ---- liệt kê lần 1 (mỗi thư mục lỗi riêng, không dừng thư mục khác)
    const lan1 = new Map();
    const dsDirs = [];
    for (const dir of dirs) {
      try {
        lan1.set(dir, await client.list(dir));
        dsDirs.push(dir);
      } catch (err) {
        const p = F.phanLoaiLoi(err);
        ketQua.loiThuMuc.push({ thuMuc: dir, ma: p.ma, nhom: p.nhom, thongBao: lamSach(`${p.thongBao}: ${err && err.message}`, o.bimat) });
        ketQua.dem.loi++;
        ghiLoiChung.push(`${dir}: ${p.nhom}`);
      }
    }

    // ---- «ổn định»: (HAI_LAN) chờ rồi liệt kê lần 2, chỉ so giữa hai lần liệt kê (KHÔNG so mtime với đồng hồ máy);
    //      (BANG) một lần liệt kê, cập nhật sftp_source_files và xét qua các lượt trước.
    const lan2 = new Map();
    const onDinhBang = new Map();
    if (bang) {
      const nowDate = now();
      const stableMs = o.onDinhGiay * 1000;
      for (const dir of dsDirs) {
        lan2.set(dir, lan1.get(dir));
        onDinhBang.set(dir, capNhatNguon(db, dir, F.locMuc(lan1.get(dir)).khop, nowDate, stableMs));
      }
    } else {
      if (dsDirs.length) await sleep(o.onDinhGiay * 1000);
      for (const dir of dsDirs) {
        try {
          lan2.set(dir, await client.list(dir));
        } catch (err) {
          const p = F.phanLoaiLoi(err);
          ketQua.loiThuMuc.push({ thuMuc: dir, ma: p.ma, nhom: p.nhom, thongBao: lamSach(`${p.thongBao}: ${err && err.message}`, o.bimat) });
          ketQua.dem.loi++;
          ghiLoiChung.push(`${dir}: ${p.nhom}`);
        }
      }
    }

    // ---- chọn file
    const daNapStmt = db.prepare("SELECT file_size, status FROM arrival_import_files WHERE file_name = ? AND status IN ('OK', 'EMPTY') LIMIT 1");
    const tuChoiStmt = db.prepare("SELECT file_size, status, error FROM arrival_import_files WHERE file_name = ? AND status IN ('REJECTED', 'CONFLICT') ORDER BY id DESC LIMIT 1");
    const canNap = [];
    for (const dir of lan2.keys()) {
      const entries2 = lan2.get(dir);
      ketQua.dem.tongListKe += entries2.length;
      const l = F.locMuc(entries2);
      ketQua.dem.boQuaKhac += l.boQua.tong;
      const onDinh = bang ? onDinhBang.get(dir) : new Set(F.fileOnDinh(lan1.get(dir).filter((e) => e.type === '-'), entries2.filter((e) => e.type === '-')).onDinh);
      for (const f of l.khop) {
        const base = { thuMuc: dir, tenFile: f.name, maDonVi: f.maDonVi };
        moTa(f.maDonVi).tong++;
        if (f.ngay < tuNgay) { ketQua.dem.boQuaKhac++; moTa(f.maDonVi).boQua++; continue; } // ngoài cửa sổ «từ ngày»: chỉ đếm, không ghi từng file
        if (!o.maDaBiet.includes(f.maDonVi)) { ketQua.dem.boQuaKhac++; ketQua.dem.maLa++; them({ ...base, ketQua: KET_QUA.BO_QUA, maLoi: 'MA_LA', chiTiet: MA_LA_GHI_CHU(f.maDonVi) }); continue; }
        if (!f.ngayHopLe) { ketQua.dem.boQuaKhac++; them({ ...base, ketQua: KET_QUA.BO_QUA, maLoi: 'NGAY_KHONG_HOP_LE', chiTiet: 'Ngày/giờ trong tên file không có thật — không nạp' }); continue; }
        const co = daNapStmt.get(f.name);
        if (co) {
          ketQua.dem.daCo++;
          const lech = Number(co.file_size) !== f.size;
          them({ ...base, ketQua: KET_QUA.DA_CO, maLoi: lech ? 'KICH_THUOC_KHAC_BAN_DA_NAP' : null,
            chiTiet: lech ? 'Kích thước trên SFTP khác bản đã nạp (nguồn có thể đã ghi đè); KHÔNG nạp lại' : null });
          continue;
        }
        if (!onDinh.has(f.name)) { ketQua.dem.chuaOnDinh++; them({ ...base, ketQua: KET_QUA.CHUA_ON_DINH, chiTiet: bang ? 'Mới thấy hoặc kích thước / mtime còn đổi, hoặc chưa đủ thời gian giữ nguyên — để lượt sau' : 'Kích thước / mtime thay đổi giữa hai lần liệt kê hoặc mới xuất hiện — để lần sau' }); continue; }
        // File ≤ 3 byte (chỉ BOM / rỗng) KHÔNG bị bỏ qua: sau khi qua kiểm tra ổn định vẫn được tải (rất nhẹ) và đưa cho importer để nó ghi đợt EMPTY
        // vào arrival_import_files (đủ «2 file/ngày» cho getMissingBatches); lượt sau thấy tên đã có -> DA_CO.
        const tc = tuChoiStmt.get(f.name);
        if (tc && Number(tc.file_size) === f.size && !/^Lỗi hệ thống/.test(String(tc.error || ''))) {
          ketQua.dem.boQuaKhac++;
          them({ ...base, ketQua: KET_QUA.BO_QUA, maLoi: 'DA_TU_CHOI', chiTiet: `Importer đã ${tc.status === 'CONFLICT' ? 'báo trùng tên khác nội dung' : 'từ chối'} file cùng tên và kích thước; không thử lại` });
          continue;
        }
        canNap.push({ ...f, thuMuc: dir });
      }
    }

    // ---- nạp lần lượt, cũ trước mới sau, tối đa toiDa file mỗi lượt
    canNap.sort(choNguoc);
    const duocNap = canNap.slice(0, o.toiDa);
    for (const f of canNap.slice(o.toiDa)) {
      ketQua.dem.boQuaKhac++;
      them({ thuMuc: f.thuMuc, tenFile: f.name, maDonVi: f.maDonVi, ketQua: KET_QUA.BO_QUA, maLoi: 'VUOT_TOI_DA', chiTiet: `Vượt giới hạn ${o.toiDa} file mỗi lượt — để lần sau` });
    }

    if (o.dryRun) {
      for (const f of duocNap) {
        ketQua.dem.wouldImport++;
        them({ thuMuc: f.thuMuc, tenFile: f.name, maDonVi: f.maDonVi, ketQua: KET_QUA.WOULD_IMPORT, chiTiet: `${f.size} byte — sẽ tải và nạp (chạy khô: không làm gì)` });
      }
    } else if (duocNap.length) {
      thuMucTam = fs.mkdtempSync(path.join(tmpDir, `hue-dhcl-sftp-${crypto.randomBytes(4).toString('hex')}-`));
      for (const f of duocNap) {
        if (o.huy()) { ketQua.daHuy = true; break; } // dừng máy chủ: không bắt đầu file kế tiếp
        await napMotFile({ f, client, db, o, ketQua, thuMucTam, them, ghiLoiChung });
        await o.nhuong(); // nhường vòng lặp sự kiện để máy chủ phục vụ người dùng giữa hai file
      }
    }
  } catch (err) {
    ketQua.dem.loi++;
    ghiLoiChung.push(`lượt: ${maLoiNgan(err)} ${lamSach(err && err.message, o.bimat, 120)}`);
    ketQua.loiChung = lamSach(err && err.message, o.bimat);
  } finally {
    if (thuMucTam) { try { fs.rmSync(thuMucTam, { recursive: true, force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
    if (!o.dryRun && ketQua.runId != null) {
      const d = ketQua.dem;
      db.prepare(`UPDATE sftp_sync_runs SET finished_at = ?, tong_liet_ke = ?, da_nap = ?, da_co = ?, chua_on_dinh = ?, rong = ?, bo_qua_khac = ?, loi = ?, ghi_chu_loi = ? WHERE id = ?`)
        .run(now().toISOString(), d.tongListKe, d.daNap, d.daCo, d.chuaOnDinh, d.rong, d.boQuaKhac, d.loi, ghiLoiChung.length ? lamSach(ghiLoiChung.join(' | '), o.bimat, 500) : null, ketQua.runId);
    }
  }
  return ketQua;
}

async function napMotFile({ f, client, db, o, ketQua, thuMucTam, them, ghiLoiChung }) {
  const base = { thuMuc: f.thuMuc, tenFile: f.name, maDonVi: f.maDonVi };
  const t0 = process.hrtime.bigint();
  const ms = () => Number((process.hrtime.bigint() - t0) / 1000000n);
  let cucBo = null;
  try {
    const ten = kiemTraTenTep(f.name);
    cucBo = path.join(thuMucTam, ten);
    const xa = `${f.thuMuc.replace(/\/+$/, '')}/${ten}`;
    await client.get(xa, cucBo);
    const size = fs.statSync(cucBo).size;
    if (size !== f.size) {
      const err = Object.assign(new Error(`Tải về ${size} byte nhưng danh sách báo ${f.size} byte (file có thể đang được ghi)`), { code: 'KICH_THUOC_LECH' });
      throw err;
    }
    const r = await o.importFn(db, cucBo, { source: 'SFTP' });
    const chiTiet = lamSach([r.warning, r.error].filter(Boolean).join(' | '), o.bimat) || null;
    if (r.status === 'OK' || r.status === 'EMPTY') {
      if (r.alreadyImported) { ketQua.dem.daCo++; them({ ...base, ketQua: KET_QUA.DA_CO, soDong: r.rowCount ?? null, thoiGianMs: ms(), chiTiet: 'Đã được nạp trước đó (importer)' }); return; }
      if (r.status === 'EMPTY') { ketQua.dem.rong++; them({ ...base, ketQua: KET_QUA.EMPTY, soDong: 0, thoiGianMs: ms(), chiTiet: chiTiet || 'Importer ghi nhận đợt rỗng (chỉ BOM / chỉ tiêu đề)' }); return; }
      ketQua.dem.daNap++;
      them({ ...base, ketQua: KET_QUA.DA_NAP, soDong: r.rowCount ?? null, thoiGianMs: ms(), chiTiet });
      return;
    }
    // REJECTED / CONFLICT / SKIPPED_NAME
    ketQua.dem.loi++;
    ghiLoiChung.push(`${f.name}: ${r.status}`);
    them({ ...base, ketQua: KET_QUA.LOI, thoiGianMs: ms(), maLoi: r.status, chiTiet });
  } catch (err) {
    ketQua.dem.loi++;
    const ma = maLoiNgan(err, 'LOI_TAI_HOAC_NAP');
    ghiLoiChung.push(`${f.name}: ${ma}`);
    them({ ...base, ketQua: KET_QUA.LOI, thoiGianMs: ms(), maLoi: ma, chiTiet: lamSach(err && err.message, o.bimat) });
  } finally {
    if (cucBo) { try { fs.rmSync(cucBo, { force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
  }
}

/**
 * Cập nhật sftp_source_files cho MỘT thư mục sau một lần liệt kê (một giao dịch) và trả Set tên file ỔN ĐỊNH: kích thước + mtime giữ nguyên qua
 * ít nhất 2 lượt liên tiếp (so_lan_giu_nguyen ≥ 1) và đã giữ nguyên ≥ stableMs kể từ lần đầu thấy cặp giá trị hiện tại. File mới / đổi → chưa ổn định.
 * File có trong bảng nhưng không còn trên nguồn: con_tren_nguon = 0, giữ nguyên lan_cuoi_thay (lần cuối thấy). khop: kết quả F.locMuc(...).khop.
 */
function capNhatNguon(db, dir, khop, nowDate, stableMs) {
  const iso = nowDate.toISOString();
  const cu = new Map(db.prepare('SELECT * FROM sftp_source_files WHERE thu_muc = ?').all(dir).map((r) => [r.ten_file, r]));
  const ins = db.prepare('INSERT INTO sftp_source_files (thu_muc, ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, so_lan_giu_nguyen, giu_nguyen_tu, con_tren_nguon) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)');
  const giu = db.prepare('UPDATE sftp_source_files SET lan_cuoi_thay = ?, so_lan_giu_nguyen = so_lan_giu_nguyen + 1, con_tren_nguon = 1 WHERE thu_muc = ? AND ten_file = ?');
  const doi = db.prepare('UPDATE sftp_source_files SET kich_thuoc = ?, mtime = ?, lan_cuoi_thay = ?, so_lan_giu_nguyen = 0, giu_nguyen_tu = ?, con_tren_nguon = 1 WHERE thu_muc = ? AND ten_file = ?');
  const mat = db.prepare('UPDATE sftp_source_files SET con_tren_nguon = 0 WHERE thu_muc = ? AND ten_file = ?');
  const onDinh = new Set();
  db.transaction(() => {
    const thay = new Set();
    for (const f of khop) {
      thay.add(f.name);
      const r = cu.get(f.name);
      if (!r) { ins.run(dir, f.name, f.size, f.mtime, iso, iso, iso); continue; }
      if (Number(r.kich_thuoc) === f.size && Number(r.mtime) === f.mtime) {
        giu.run(iso, dir, f.name);
        // đã thấy ≥ 2 lượt với cùng giá trị (lượt này + lượt trước) và đủ lâu
        if (nowDate.getTime() - Date.parse(r.giu_nguyen_tu) >= stableMs) onDinh.add(f.name);
      } else doi.run(f.size, f.mtime, iso, iso, dir, f.name);
    }
    for (const [ten, r] of cu) if (!thay.has(ten) && r.con_tren_nguon) mat.run(dir, ten);
  })();
  return onDinh;
}

/** Ghi MỘT lượt thất bại ngay lúc bắt đầu (vd không kết nối được nên chưa có lượt thật): đã kết thúc, loi = 1, ghi chú đã che. Trả id lượt. */
function ghiLuotThatBai(db, now, trigger, ghiChu, bimat = []) {
  const iso = now.toISOString();
  return Number(db.prepare('INSERT INTO sftp_sync_runs (started_at, finished_at, "trigger", loi, ghi_chu_loi) VALUES (?, ?, ?, 1, ?)').run(iso, iso, trigger, lamSach(ghiChu, bimat, 500)).lastInsertRowid);
}

/** Kết quả một lượt -> mã thoát của scripts/sftp-sync.js: 7 đang có lượt khác; mã của thư mục lỗi đầu tiên (3 mạng / 4 xác thực / 6 thư mục); 1 có file lỗi; 0 còn lại. */
function maThoat(kq) {
  if (kq.biKhoa) return 7;
  if (kq.loiThuMuc && kq.loiThuMuc.length) return kq.loiThuMuc[0].ma;
  if (kq.dem.loi > 0 || kq.loiChung) return 1;
  return 0;
}

module.exports = {
  maThoat, capNhatNguon, ghiLuotThatBai, KET_QUA, MAC_DINH, KHOA_PHUT,
  ensureSftpSyncSchema, docCauHinhSync, docThamSoSync, kiemTraTenTep, lamSach, ngayBangkok, congNgay, luotDangChay, syncSftpOnce
};
