// ==========================================
// SANLUONG-5g-3: «Thay thế ngày của một BCVH» — THỰC HIỆN NGUYÊN KHỐI (docs/ai/16_THAY_THE_NGAY_THUC_HIEN.md, 04_DECISIONS.md #83).
// Xóa dữ liệu ĐÃ NẠP TRONG DB của (BCVH X, ngày D = ngày trong TÊN FILE) rồi nạp lại từ các file chuẩn trên nguồn SFTP. Hoặc xong hết, hoặc DB y nguyên.
// Nguồn SFTP chỉ ĐỌC (list / get / end). Mô-đun này KHÔNG nạp thư viện SFTP (client hoặc hàm ketNoi được tiêm; chỉ route / script nạp qua sftpConnect.js).
// Thứ tự (BẮT BUỘC): kiểm đầu vào + xác nhận → khoá thật (bảng sftp_sync_runs, như lõi đồng bộ) → liệt kê / tải / chuẩn bị file → so sánh + «mất thật» → sao lưu
// toàn DB (db.backup) → MỘT giao dịch đồng bộ (chép thùng rác → xóa → nạp → nhật ký) → dọn (thùng rác > 30 ngày, sao lưu > 5 bản, tệp tạm) → nhả khoá.
// Không có SHBG trong log, thông báo lỗi hay kết quả trả về (chỉ số lượng).
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const X = require('./thayTheXemTruoc');
const S = require('./sftpSync');
const { chuanBiFile, ghiFileDaChuanBi } = require('./arrivalsImport');
const CF = require('../config/thay-the');
const { xoaBoNhoBd10Share } = require('./arrivalsQuery');

const { XemTruocLoi, chuanHoaShbg } = X;

const MA_LOI = Object.freeze({
  ...X.MA_LOI,
  XAC_NHAN_SAI: 'XAC_NHAN_SAI', DANG_THAY_THE: 'DANG_THAY_THE', NGUON_DA_DOI: 'NGUON_DA_DOI', CAN_DONG_Y_MAT_DU_LIEU: 'CAN_DONG_Y_MAT_DU_LIEU',
  FILE_NGUON_LOI: 'FILE_NGUON_LOI', KHONG_CO_FILE_DE_THAY: 'KHONG_CO_FILE_DE_THAY', DU_LIEU_DA_DOI: 'DU_LIEU_DA_DOI',
  KHONG_DU_CHO_SAO_LUU: 'KHONG_DU_CHO_SAO_LUU', SAO_LUU_LOI: 'SAO_LUU_LOI', GHI_THAT_BAI: 'GHI_THAT_BAI'
});
const HTTP = Object.freeze({
  ...X.HTTP,
  XAC_NHAN_SAI: 400, DANG_THAY_THE: 409, NGUON_DA_DOI: 409, CAN_DONG_Y_MAT_DU_LIEU: 409, FILE_NGUON_LOI: 422, KHONG_CO_FILE_DE_THAY: 422, DU_LIEU_DA_DOI: 409,
  KHONG_DU_CHO_SAO_LUU: 507, SAO_LUU_LOI: 500, GHI_THAT_BAI: 500
});
// Mã thoát của scripts/thay-the-ngay.js: như thay-the-xem-truoc.js + 9 cần đồng ý mất dữ liệu · 10 nguồn đã đổi · 11 sao lưu lỗi.
const MA_THOAT = Object.freeze({ ...X.MA_THOAT, CAN_DONG_Y: 9, NGUON_DA_DOI: 10, SAO_LUU_LOI: 11 });
const THOAT_THEO_LOI = Object.freeze({
  ...X.THOAT_THEO_LOI,
  XAC_NHAN_SAI: 8, DANG_THAY_THE: 7, NGUON_DA_DOI: 10, CAN_DONG_Y_MAT_DU_LIEU: 9, FILE_NGUON_LOI: 1, KHONG_CO_FILE_DE_THAY: 1, DU_LIEU_DA_DOI: 1,
  KHONG_DU_CHO_SAO_LUU: 11, SAO_LUU_LOI: 11, GHI_THAT_BAI: 1
});

/** Lỗi có MÃ của thay thế (cùng lớp cha XemTruocLoi nên route xử lý chung): code ∈ MA_LOI, httpStatus ∈ HTTP. Thông báo tiếng Việt, đã che bí mật, không có SHBG. */
class ThayTheLoi extends XemTruocLoi {
  constructor(code, message) {
    super(code, message);
    this.httpStatus = HTTP[code] || 500;
  }
}

// ------------------------------------------
// Lược đồ (idempotent; gọi từ server/db.js và từ scripts/thay-the-ngay.js khi mở DB ghi). Giờ lưu UTC ISO (…Z), như các bảng đồng bộ.
// thung_rac_id (ở hai bảng thùng rác) = id của dòng thay_the_nhat_ky: mỗi lần thay là MỘT mẻ thùng rác. Cột `id` / `import_file_id` giữ NGUYÊN giá trị gốc
// để ticket hoàn tác (5g-5) khôi phục cùng id và cùng liên kết file ↔ dòng. KHÔNG có ràng buộc UNIQUE / khoá ngoại tới bảng sống (id gốc có thể bị dùng lại).
// ------------------------------------------
const COT_FILE = ['id', 'unit_code', 'file_name', 'file_date', 'file_time', 'file_size', 'sha256', 'row_count', 'inserted_count', 'ignored_duplicate_count', 'status', 'error', 'warning', 'source', 'imported_at'];
const COT_DONG = ['id', 'import_file_id', 'sender_code', 'receiver_code', 'route_name', 'tracking_no', 'bd10_no', 'bd8_no', 'bag_confirmed_at', 'item_confirmed_at', 'bd10_confirmed_at',
  'bd10_ttkt_confirmed_at', 'weight_g', 'service_code', 'service_name', 'note', 'ward_name', 'province_name', 'arrival_at', 'arrival_at_basis', 'arrival_date',
  'arrival_evidence_count', 'bag_date', 'bd10_date', 'item_date', 'ward_key'];

function ensureThayTheSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS thay_the_nhat_ky (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thoi_diem_utc TEXT NOT NULL,                 -- UTC ISO (YYYY-MM-DDTHH:MM:SS.sssZ)
      nguoi_thuc_hien TEXT NOT NULL,               -- mã HRM của ADMIN (route) hoặc 'script:<tên>'
      bcvh TEXT NOT NULL,
      ngay TEXT NOT NULL,                          -- ngày trong TÊN FILE (file_date)
      tap_file_cu TEXT NOT NULL,                   -- JSON [{id, file_name, status, source, row_count, so_dong_thuc}]
      tap_file_moi TEXT NOT NULL,                  -- JSON [{ten, sha256, trang_thai, so_dong, da_ghi, bo_qua_trung}]
      so_file_cu INTEGER NOT NULL DEFAULT 0,
      so_dong_cu INTEGER NOT NULL DEFAULT 0,
      so_file_moi INTEGER NOT NULL DEFAULT 0,
      so_dong_moi INTEGER NOT NULL DEFAULT 0,
      shbg_cu INTEGER NOT NULL DEFAULT 0,
      shbg_mat_that INTEGER NOT NULL DEFAULT 0,    -- có ở tập cũ, không có ở tập mới VÀ không còn dòng nào ở file ngoài tập (cùng BCVH)
      shbg_mat_can_tren INTEGER NOT NULL DEFAULT 0, -- có ở tập cũ, không có ở tập mới (chưa trừ file ngoài tập) — số của bản xem trước 5g-2
      muc_canh_bao TEXT NOT NULL CHECK (muc_canh_bao IN ('AN_TOAN', 'CAN_XAC_NHAN', 'DO')),
      dong_y_mat INTEGER NOT NULL DEFAULT 0,
      duong_dan_sao_luu TEXT,
      ket_qua TEXT NOT NULL CHECK (ket_qua IN ('THANH_CONG', 'DA_HOAN_TAC')),  -- DA_HOAN_TAC: chừa cho 5g-5
      thung_rac_het_han_luc TEXT NOT NULL,         -- UTC ISO; quá hạn thì bị dọn
      thung_rac_da_don INTEGER NOT NULL DEFAULT 0  -- 1 = thùng rác của lần thay này đã bị dọn (không còn khôi phục được)
    );
    CREATE INDEX IF NOT EXISTS ix_thay_the_nhat_ky_bcvh_ngay ON thay_the_nhat_ky(bcvh, ngay);

    CREATE TABLE IF NOT EXISTS thung_rac_file (
      rac_id INTEGER PRIMARY KEY AUTOINCREMENT,
      thung_rac_id INTEGER NOT NULL REFERENCES thay_the_nhat_ky(id),
      id INTEGER NOT NULL,                         -- id GỐC của arrival_import_files
      unit_code TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_date TEXT NOT NULL,
      file_time TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      ignored_duplicate_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      warning TEXT,
      source TEXT NOT NULL,
      imported_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS ix_thung_rac_file_mua ON thung_rac_file(thung_rac_id);

    CREATE TABLE IF NOT EXISTS thung_rac_dong (
      rac_id INTEGER PRIMARY KEY AUTOINCREMENT,
      thung_rac_id INTEGER NOT NULL REFERENCES thay_the_nhat_ky(id),
      id INTEGER NOT NULL,                         -- id GỐC của arrival_items
      import_file_id INTEGER NOT NULL,             -- id GỐC của file (= thung_rac_file.id cùng mẻ)
      sender_code TEXT NOT NULL,
      receiver_code TEXT NOT NULL,
      route_name TEXT NOT NULL,
      tracking_no TEXT NOT NULL,
      bd10_no TEXT NOT NULL,
      bd8_no TEXT NOT NULL,
      bag_confirmed_at TEXT,
      item_confirmed_at TEXT,
      bd10_confirmed_at TEXT,
      bd10_ttkt_confirmed_at TEXT,
      weight_g INTEGER,
      service_code TEXT NOT NULL,
      service_name TEXT NOT NULL,
      note TEXT NOT NULL,
      ward_name TEXT NOT NULL,
      province_name TEXT NOT NULL,
      arrival_at TEXT,
      arrival_at_basis TEXT,
      arrival_date TEXT,
      arrival_evidence_count INTEGER NOT NULL,
      bag_date TEXT,
      bd10_date TEXT,
      item_date TEXT,
      ward_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_thung_rac_dong_mua ON thung_rac_dong(thung_rac_id);

    -- SANLUONG-5g-5: nhật ký KHÔI PHỤC từ thùng rác (chỉ thêm; mỗi lần thay tối đa một lần khôi phục — nhat_ky_id UNIQUE). Khôi phục là BỔ SUNG, không phải hoàn lại,
    -- nên không đụng thay_the_nhat_ky.ket_qua (DA_HOAN_TAC vẫn chỉ là chỗ chừa).
    CREATE TABLE IF NOT EXISTS thay_the_khoi_phuc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nhat_ky_id INTEGER NOT NULL UNIQUE REFERENCES thay_the_nhat_ky(id),
      thoi_diem_utc TEXT NOT NULL,                 -- UTC ISO
      nguoi_thuc_hien TEXT NOT NULL,
      so_dong_trong_thung_rac INTEGER NOT NULL DEFAULT 0,
      so_dong_them INTEGER NOT NULL DEFAULT 0,
      so_dong_da_co INTEGER NOT NULL DEFAULT 0,    -- đã có ở DB (cùng khoá nghiệp vụ) nên bỏ qua
      so_dong_gan_sang_file_khac INTEGER NOT NULL DEFAULT 0, -- dòng thêm vào nhưng gắn vào bản ghi file hiện hành CÙNG TÊN (không phải bản ghi gốc)
      so_dong_khong_khoi_phuc INTEGER NOT NULL DEFAULT 0,    -- thuộc file REJECTED / CONFLICT hoặc file không tạo lại được
      so_file_tao_lai INTEGER NOT NULL DEFAULT 0,
      so_file_gan_vao_hien_hanh INTEGER NOT NULL DEFAULT 0,
      so_file_bo_qua INTEGER NOT NULL DEFAULT 0,
      duong_dan_sao_luu TEXT
    );
  `);
}

// ------------------------------------------
// Khoá: cùng cơ chế khoá lượt của lõi đồng bộ (bảng sftp_sync_runs: lượt chưa kết thúc bắt đầu cách đây < 30 phút = đang chạy). Bộ hẹn giờ và scripts/sftp-sync.js
// thấy khoá này (S.luotDangChay / S.batDauLuot) và bỏ qua lượt. Hàng khoá chỉ là CHỖ GIỮ: nhả khoá = xóa hàng đó (nó không phải một lượt đồng bộ thật).
// ------------------------------------------
const GHI_CHU_KHOA = 'Khóa tạm của «Thay thế ngày» (không phải lượt đồng bộ). Nếu còn treo, tự đóng sau 30 phút';

/** Giành khoá trong MỘT giao dịch ghi (chống hai tiến trình cùng vào). Trả id hàng khoá, hoặc ném DANG_CO_LUOT_DONG_BO. */
function batDauKhoa(db, batDau) {
  S.ensureSftpSyncSchema(db);
  return db.transaction(() => {
    const dang = S.luotDangChay(db, batDau.getTime());
    if (dang) throw new ThayTheLoi(MA_LOI.DANG_CO_LUOT_DONG_BO, `Đang có một lượt đồng bộ SFTP chạy (lượt #${dang.id}). Thử lại sau khi nó kết thúc.`);
    const treo = db.prepare('SELECT id FROM sftp_sync_runs WHERE finished_at IS NULL').all();
    for (const t of treo) {
      db.prepare('UPDATE sftp_sync_runs SET finished_at = ?, ghi_chu_loi = ? WHERE id = ?')
        .run(batDau.toISOString(), `Lượt treo quá ${S.KHOA_PHUT} phút, tự đóng khi bắt đầu «Thay thế ngày»`, t.id);
    }
    return Number(db.prepare('INSERT INTO sftp_sync_runs (started_at, "trigger", ghi_chu_loi) VALUES (?, ?, ?)').run(batDau.toISOString(), 'MANUAL', GHI_CHU_KHOA).lastInsertRowid);
  }).immediate();
}

/** Nhả khoá: xóa hàng giữ chỗ; nếu không xóa được thì đóng nó (finished_at). Không bao giờ ném lỗi. */
function nhaKhoa(db, id, now) {
  try { db.prepare('DELETE FROM sftp_sync_runs WHERE id = ?').run(id); return; } catch (e) { /* thử đóng hàng */ }
  try { db.prepare('UPDATE sftp_sync_runs SET finished_at = ? WHERE id = ?').run(now().toISOString(), id); } catch (e) { /* hết cách: tự đóng sau 30 phút */ }
}

// ------------------------------------------
// Đầu vào
// ------------------------------------------
const SHA_RE = /^[0-9a-f]{64}$/;

/** tap_file_nguon dự kiến (từ bản xem trước): mảng [{ten, sha256}] tối đa 200, tên không trùng. Trả mảng chuẩn hoá; sai -> THAM_SO_SAI. */
function kiemTraDuKien(duKien) {
  const sai = () => new XemTruocLoi(X.MA_LOI.THAM_SO_SAI, 'Tham số "tap_file_nguon" phải là danh sách {ten, sha256} lấy từ bản xem trước');
  if (!Array.isArray(duKien) || duKien.length > 200) throw sai();
  const ten = new Set();
  const out = duKien.map((x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.ten !== 'string' || !x.ten || x.ten.length > 120 || typeof x.sha256 !== 'string' || !SHA_RE.test(x.sha256)) throw sai();
    if (Object.keys(x).some((k) => !['ten', 'sha256', 'kich_thuoc'].includes(k))) throw sai();
    if (ten.has(x.ten)) throw sai();
    ten.add(x.ten);
    return { ten: x.ten, sha256: x.sha256 };
  });
  return out;
}

/** Người dùng phải gõ lại đúng mã BCVH và ngày. Sai / thiếu -> XAC_NHAN_SAI (400). */
function kiemTraXacNhan(xacNhan, bcvh, ngay) {
  if (!xacNhan || typeof xacNhan !== 'object' || Array.isArray(xacNhan) || xacNhan.ma_bcvh !== bcvh || xacNhan.ngay !== ngay) {
    throw new ThayTheLoi(MA_LOI.XAC_NHAN_SAI, 'Xác nhận không khớp: phải gõ lại đúng mã BCVH và ngày (YYYY-MM-DD) cần thay');
  }
}

// Cờ trong bộ nhớ: hai lần thay không chạy cùng lúc.
let dangThayThe = false;

/**
 * SANLUONG-5g-5: khoá CHUNG cho «Khôi phục» — cùng cờ bộ nhớ và cùng hàng khoá sftp_sync_runs như thayTheNgay (một lượt tại một thời điểm với đồng bộ SFTP,
 * hẹn giờ, «Lấy ngay»/«Lấy lại» và «Thay thế»). ĐỒNG BỘ (không await). Trả nha() — gọi trong finally. Ném ThayTheLoi DANG_THAY_THE / DANG_CO_LUOT_DONG_BO.
 * Không kiểm hẹn giờ TAM_DUNG (khôi phục không chạm mạng).
 */
function giuKhoaChung(db, batDau, options = {}, now = () => new Date()) {
  if (dangThayThe) throw new ThayTheLoi(MA_LOI.DANG_THAY_THE, 'Đang có một lần thay thế khác chạy. Thử lại sau khi nó kết thúc.');
  X.kiemTraKhoa(db, batDau, options);
  dangThayThe = true;
  let idKhoa;
  try { idKhoa = batDauKhoa(db, batDau); } catch (e) { dangThayThe = false; throw e; }
  let daNha = false;
  return () => {
    if (daNha) return;
    daNha = true;
    nhaKhoa(db, idKhoa, now);
    dangThayThe = false;
  };
}

// «Mất thật»: định nghĩa nằm ở X.tinhMatThat (thayTheXemTruoc.js) — xem trước và thay thế dùng CHUNG một nguồn (5g-3b). Hành vi giữ nguyên.
const { tinhMatThat } = X;

// ------------------------------------------
// Sao lưu toàn DB (db.backup) — quy ước: <thư mục chứa DB>/backups/, tên truoc-thay-the_<bcvh>_<ngày>_<UTC>.db, giữ SO_BAN_SAO_LUU_GIU bản gần nhất
// ------------------------------------------
const TEN_SAO_LUU_RE = /^truoc-(?:thay-the|khoi-phuc)_\d+_\d{4}-\d{2}-\d{2}_(\d{8}T\d{6}Z)(?:_(\d+))?\.db$/;
const dauThoiGian = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

function dungLuongTrong(thuMuc) {
  try { const s = fs.statfsSync(thuMuc); return Number(s.bavail) * Number(s.bsize); } catch (e) { return null; } // không biết thì để db.backup tự báo lỗi
}
function coDb(db) {
  let kt = 0;
  for (const hau of ['', '-wal']) { try { kt += fs.statSync(db.name + hau).size; } catch (e) { /* chưa có / DB trong bộ nhớ */ } }
  return kt;
}

/** Danh sách bản sao lưu của thay thế trong thư mục, MỚI nhất trước. */
function dsSaoLuu(thuMuc) {
  let ten;
  try { ten = fs.readdirSync(thuMuc); } catch (e) { return []; }
  return ten.map((t) => ({ t, m: TEN_SAO_LUU_RE.exec(t) })).filter((x) => x.m)
    .map((x) => ({ ten: x.t, khoa: `${x.m[1]}_${String(x.m[2] || 1).padStart(6, '0')}` }))
    .sort((a, b) => (a.khoa < b.khoa ? 1 : a.khoa > b.khoa ? -1 : 0));
}

/** o: { dungLuongTrong?, tienToSaoLuu? ('truoc-thay-the' mặc định; 5g-5: 'truoc-khoi-phuc' — cùng thư mục và cùng hạn giữ 5 bản) }. */
async function saoLuu(db, thuMuc, bcvh, ngay, batDau, o) {
  let dich = null;
  try {
    fs.mkdirSync(thuMuc, { recursive: true });
    const can = Math.ceil(coDb(db) * 1.2) + CF.DEM_SAO_LUU_BYTE;
    const trong = o.dungLuongTrong ? o.dungLuongTrong(thuMuc) : dungLuongTrong(thuMuc);
    if (trong !== null && trong < can) {
      throw new ThayTheLoi(MA_LOI.KHONG_DU_CHO_SAO_LUU, `Không đủ chỗ sao lưu: còn ${Math.floor(trong / 1048576)} MB, cần ít nhất ${Math.ceil(can / 1048576)} MB. Chưa thay gì`);
    }
    const goc = `${o.tienToSaoLuu || 'truoc-thay-the'}_${bcvh}_${ngay}_${dauThoiGian(batDau)}`;
    let tt = 1;
    dich = path.join(thuMuc, `${goc}.db`);
    while (fs.existsSync(dich)) { tt++; dich = path.join(thuMuc, `${goc}_${tt}.db`); }
    await db.backup(dich);
    const kichThuoc = fs.statSync(dich).size;
    if (!(kichThuoc > 0)) throw Object.assign(new Error('Bản sao lưu rỗng'), { code: 'SAO_LUU_RONG' });
    return { duong_dan: dich, tep: path.basename(dich), kich_thuoc: kichThuoc };
  } catch (err) {
    if (dich) { try { fs.rmSync(dich, { force: true }); } catch (e) { /* bỏ qua */ } }
    if (err instanceof ThayTheLoi) throw err;
    const ma = String((err && err.code) || 'LOI').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
    throw new ThayTheLoi(ma === 'ENOSPC' ? MA_LOI.KHONG_DU_CHO_SAO_LUU : MA_LOI.SAO_LUU_LOI, `Sao lưu DB thất bại (${ma}) — chưa thay gì`);
  }
}

/** Xóa các bản sao lưu cũ, giữ SO_BAN_SAO_LUU_GIU bản mới nhất. Trả số bản đã xóa. Không ném lỗi. */
function donSaoLuu(thuMuc, giu = CF.SO_BAN_SAO_LUU_GIU) {
  let da = 0;
  for (const b of dsSaoLuu(thuMuc).slice(giu)) {
    try { fs.rmSync(path.join(thuMuc, b.ten), { force: true }); da++; } catch (e) { /* bỏ qua */ }
  }
  return da;
}

/** Dọn thùng rác quá hạn (thung_rac_het_han_luc <= now): xóa dòng + file của mẻ, đánh dấu thung_rac_da_don = 1 (nhật ký giữ lại). Trả { mua, dong, file }. */
function donThungRac(db, now = new Date()) {
  const iso = now.toISOString();
  return db.transaction(() => {
    const mua = db.prepare('SELECT id FROM thay_the_nhat_ky WHERE thung_rac_da_don = 0 AND thung_rac_het_han_luc <= ?').all(iso).map((r) => r.id);
    let dong = 0;
    let file = 0;
    const xoaDong = db.prepare('DELETE FROM thung_rac_dong WHERE thung_rac_id = ?');
    const xoaFile = db.prepare('DELETE FROM thung_rac_file WHERE thung_rac_id = ?');
    const danhDau = db.prepare('UPDATE thay_the_nhat_ky SET thung_rac_da_don = 1 WHERE id = ?');
    for (const id of mua) { dong += xoaDong.run(id).changes; file += xoaFile.run(id).changes; danhDau.run(id); }
    return { mua: mua.length, dong, file };
  })();
}

// ------------------------------------------
// Lõi
// ------------------------------------------
const rutGon = (arr, n = 4) => arr.slice(0, n).join('; ') + (arr.length > n ? `; … (+${arr.length - n})` : '');

/**
 * thayTheNgay({ client | ketNoi, dirs, db, bcvh, ngay, tapFile, tapFileNguonDuKien, xacNhan, dongYMat, nguoiThucHien, tmpDir, sauLuuDir, now, bimat, options })
 *  client: { list(thuMuc), get(duongDanTuXa, duongDanCucBo), end() } hoặc ketNoi: () => Promise<client> (gọi SAU khi qua kiểm đầu vào + khoá). LUÔN gọi client.end().
 *  tapFile: tên file dùng để thay (null = tất cả file của (BCVH, ngày) trên nguồn). tapFileNguonDuKien: [{ten, sha256}] của bản xem trước — mã băm phải KHỚP, nếu không NGUON_DA_DOI.
 *  xacNhan: { ma_bcvh, ngay } phải đúng bcvh / ngay. dongYMat: phải === true nếu «mất thật» > 0. sauLuuDir: thư mục sao lưu (mặc định <thư mục DB>/backups).
 *  options: { chayKho (chỉ tính + trả kết quả: không khoá, không sao lưu, không ghi; db có thể mở readonly), dangDongBo, dungLuongTrong(thuMuc) -> byte, ghiFn (mặc định ghiFileDaChuanBi),
 *    sauKhiXoa() (gọi TRONG giao dịch ngay sau khi xóa — để test), truocGiaoDich() (async, sau sao lưu — để test) }.
 * Trả tóm tắt (chỉ số lượng, không SHBG). Ném ThayTheLoi / XemTruocLoi (code ∈ MA_LOI).
 */
async function thayTheNgay({ client = null, ketNoi = null, dirs = [], db, bcvh, ngay, tapFile = null, tapFileNguonDuKien = null, xacNhan = null, dongYMat = false,
  nguoiThucHien = null, tmpDir = os.tmpdir(), sauLuuDir = null, now = () => new Date(), bimat = [], options = {} }) {
  const o = { chayKho: false, ghiFn: ghiFileDaChuanBi, dungLuongTrong: null, sauKhiXoa: null, truocGiaoDich: null, ...options };
  let ketNoiXong = client;
  let giuCo = false;
  let idKhoa = null;
  let thuMucTam = null;
  const t0 = Date.now();
  try {
    // ---- 1. đầu vào + xác nhận (chưa động đến khoá hay mạng)
    X.kiemTraDauVao({ bcvh, ngay, tapFile });
    const duKien = o.chayKho && tapFileNguonDuKien == null ? null : kiemTraDuKien(tapFileNguonDuKien);
    if (!o.chayKho) kiemTraXacNhan(xacNhan, bcvh, ngay);
    if (!Array.isArray(dirs) || !dirs.length) throw new XemTruocLoi(X.MA_LOI.CHUA_CAU_HINH_SFTP, 'Chưa có thư mục nguồn SFTP (SFTP_DIRS)');

    // ---- 2. giữ khoá thật (đồng bộ từ lúc kiểm đến lúc ghi hàng khoá — không có await ở giữa)
    const batDau = now();
    if (!o.chayKho) {
      if (dangThayThe) throw new ThayTheLoi(MA_LOI.DANG_THAY_THE, 'Đang có một lần thay thế khác chạy. Thử lại sau khi nó kết thúc.');
      X.kiemTraKhoa(db, batDau, o);
      dangThayThe = true;
      giuCo = true;
      idKhoa = batDauKhoa(db, batDau);
    } else {
      X.kiemTraKhoa(db, batDau, o); // chạy khô: chỉ báo nếu đang có lượt khác, không giữ khoá
    }

    // ---- 3. liệt kê nguồn, chọn đúng tập file, tải (giữ tên gốc), chuẩn bị (không db)
    if (!ketNoiXong) {
      if (typeof ketNoi !== 'function') throw new XemTruocLoi(X.MA_LOI.CHUA_CAU_HINH_SFTP, 'Chưa có kết nối nguồn SFTP');
      try { ketNoiXong = await ketNoi(); } catch (err) { throw X.loiNguon(err, bimat); }
    }
    const ds = await X.lietKeNguonCuaNgay(ketNoiXong, dirs, bcvh, ngay, bimat);
    const duocChon = tapFile === null ? null : new Set(tapFile);
    if (duocChon) {
      for (const t of duocChon) {
        if (ds.daThay.has(t)) continue;
        if (duKien && duKien.some((x) => x.ten === t)) throw new ThayTheLoi(MA_LOI.NGUON_DA_DOI, 'Nguồn đã đổi so với bản xem trước (một file đã chọn không còn trên nguồn). Hãy xem trước lại.');
        throw new XemTruocLoi(X.MA_LOI.TAP_FILE_KHONG_HOP_LE, 'Tham số "tap_file" có tên không nằm trong các file của (BCVH, ngày) trên nguồn');
      }
    }
    const chon = ds.khop.filter((f) => !duocChon || duocChon.has(f.name));
    const sanSang = []; // READY, theo thứ tự thời gian trong tên
    const ghiTheoThuTu = []; // READY + EMPTY_FILE (file ≤ BOM sẽ ghi bản ghi EMPTY)
    const hong = [];
    for (const f of chon) {
      let cucBo = null;
      try {
        if (!thuMucTam) thuMucTam = fs.mkdtempSync(path.join(tmpDir, 'hue-dhcl-thaythe-'));
        const tenAnToan = S.kiemTraTenTep(f.name);
        cucBo = path.join(thuMucTam, tenAnToan);
        await ketNoiXong.get(`${f.thuMuc.replace(/\/+$/, '')}/${tenAnToan}`, cucBo);
        const tai = fs.statSync(cucBo).size;
        if (tai !== f.size) throw Object.assign(new Error('Kích thước tải về khác danh sách'), { code: 'KICH_THUOC_LECH' });
        const d = await chuanBiFile(cucBo, { source: 'SFTP' });
        if (d.ketLuan === 'READY') { sanSang.push(d); ghiTheoThuTu.push(d); }
        else if (d.ketLuan === 'EMPTY_FILE') ghiTheoThuTu.push(d);
        else hong.push(`${f.name} (${S.lamSach(d.error || d.ketLuan, bimat, 100)})`);
      } catch (err) {
        hong.push(`${f.name} (không tải / đọc được: ${S.lamSach(String((err && err.code) || (err && err.name) || 'LOI'), bimat, 40)})`);
      } finally {
        if (cucBo) { try { fs.rmSync(cucBo, { force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
      }
    }
    if (hong.length) {
      throw new ThayTheLoi(MA_LOI.FILE_NGUON_LOI, `${hong.length} file trong tập chọn không dùng được nên KHÔNG thay gì: ${rutGon(hong)}. Bỏ tích file đó (nếu không dùng) rồi xem trước lại.`);
    }
    if (!sanSang.length) throw new ThayTheLoi(MA_LOI.KHONG_CO_FILE_DE_THAY, 'Tập file mới rỗng (không có file nào dùng được để thay) — KHÔNG thay gì');
    const shaMoi = new Map(sanSang.map((d) => [d.fileName, d.meta.sha256]));
    if (duKien) {
      const lech = duKien.filter((x) => shaMoi.get(x.ten) !== x.sha256).length + [...shaMoi.keys()].filter((t) => !duKien.some((x) => x.ten === t)).length;
      if (lech) throw new ThayTheLoi(MA_LOI.NGUON_DA_DOI, 'Nguồn đã đổi so với bản xem trước (mã băm hoặc tập file khác). KHÔNG thay gì — hãy xem trước lại.');
    }

    // ---- 4. so sánh (lõi 5g-2) + «mất thật»; thiếu đồng ý thì dừng
    const cu = X.docPhiaDb(db, bcvh, ngay);
    const ss = X.tinhSoSanh(db, cu, sanSang);
    const matThat = tinhMatThat(db, bcvh, cu, ss.chiOCu);
    const mucCanhBao = X.mucCanhBaoTheo(matThat.length, cu.shbg.size);
    const tyLe = (n) => (cu.shbg.size ? Math.round((n / cu.shbg.size) * 10000) / 10000 : 0);
    const matSet = new Set(matThat);
    const conSauThay = new Set([...ss.moi.shbg, ...[...cu.shbg].filter((s) => !matSet.has(s))]);
    const tomTat = {
      bcvh, ngay,
      db: { tap_file: cu.files, tong_dong: cu.tongDong, shbg_khac_nhau: cu.shbg.size },
      so_sanh: {
        dong_cu: cu.tongDong, dong_moi_sau_loc_trung: ss.moi.dongSauLoc, dong_moi_trung_du_lieu_con_lai: ss.trungConLai,
        shbg_cu: cu.shbg.size, shbg_moi: ss.moi.shbg.size, shbg_mat_can_tren: ss.chiOCu.length, shbg_mat_that: matThat.length,
        ty_le_mat_can_tren: ss.tyLeMat, ty_le_mat_that: tyLe(matThat.length)
      },
      canh_bao: { muc: mucCanhBao, can_dong_y_mat: matThat.length > 0, nguong_do: CF.NGUONG_MAT_SHBG_DO },
      phat: X.docPhiaPhat(db, bcvh, cu.shbg, conSauThay),
      tap_file_nguon: sanSang.map((d) => ({ ten: d.fileName, kich_thuoc: d.meta.file_size, sha256: d.meta.sha256, so_dong: d.rowCount })),
      tap_file_rong: ghiTheoThuTu.filter((d) => d.ketLuan === 'EMPTY_FILE').map((d) => d.fileName)
    };
    if (o.chayKho) return { chay_kho: true, ...tomTat, thoi_gian_ms: Date.now() - t0 };
    if (matThat.length > 0 && dongYMat !== true) {
      throw new ThayTheLoi(MA_LOI.CAN_DONG_Y_MAT_DU_LIEU,
        `Việc thay sẽ làm MẤT ${matThat.length}/${cu.shbg.size} SHBG (mức ${mucCanhBao}). Cần đồng ý rõ ràng (dong_y_mat_du_lieu) — KHÔNG thay gì.`);
    }

    // ---- 5. kiểm chỗ trống + sao lưu toàn DB (chỉ sau khi chắc chắn sẽ thay)
    const thuMucSaoLuu = sauLuuDir || path.join(path.dirname(path.resolve(db.name)), 'backups');
    const sl = await saoLuu(db, thuMucSaoLuu, bcvh, ngay, batDau, o);
    if (typeof o.truocGiaoDich === 'function') await o.truocGiaoDich();

    // ---- 6. MỘT giao dịch đồng bộ: chép thùng rác → xóa → nạp → kiểm → nhật ký
    const luc = now();
    const hetHan = new Date(luc.getTime() + CF.SO_NGAY_GIU_THUNG_RAC * 86400000).toISOString();
    const cotF = COT_FILE.join(', ');
    const cotD = COT_DONG.join(', ');
    const ketQuaGhi = [];
    let nhatKyId = null;
    let soDongXoa = 0;
    let soFileXoa = 0;
    const thucHien = db.transaction(() => {
      const hienTai = X.docPhiaDb(db, bcvh, ngay);
      if (hienTai.ids !== cu.ids || hienTai.tongDong !== cu.tongDong) {
        throw new ThayTheLoi(MA_LOI.DU_LIEU_DA_DOI, 'Dữ liệu của (BCVH, ngày) đã đổi trong lúc chuẩn bị (có người nạp / xóa). Đã hoàn tác, KHÔNG thay gì — hãy xem trước lại.');
      }
      nhatKyId = Number(db.prepare(`INSERT INTO thay_the_nhat_ky (thoi_diem_utc, nguoi_thuc_hien, bcvh, ngay, tap_file_cu, tap_file_moi, so_file_cu, so_dong_cu, shbg_cu,
        shbg_mat_that, shbg_mat_can_tren, muc_canh_bao, dong_y_mat, duong_dan_sao_luu, ket_qua, thung_rac_het_han_luc)
        VALUES (@luc, @nguoi, @b, @d, @cu, '[]', @sfc, @sdc, @shc, @mt, @mct, @muc, @dy, @sl, 'THANH_CONG', @het)`).run({
        luc: luc.toISOString(), nguoi: String(nguoiThucHien || 'khong-ro').slice(0, 80), b: bcvh, d: ngay, cu: JSON.stringify(cu.files), sfc: cu.files.length, sdc: cu.tongDong,
        shc: cu.shbg.size, mt: matThat.length, mct: ss.chiOCu.length, muc: mucCanhBao, dy: dongYMat === true ? 1 : 0, sl: sl.duong_dan, het: hetHan
      }).lastInsertRowid);
      // (a) chép bản sao các dòng và bản ghi file sắp xóa vào thùng rác (cùng id, cùng liên kết file ↔ dòng)
      db.prepare(`INSERT INTO thung_rac_file (thung_rac_id, ${cotF}) SELECT @t, ${cotF} FROM arrival_import_files WHERE id IN (SELECT value FROM json_each(@ids)) ORDER BY id`)
        .run({ t: nhatKyId, ids: cu.ids });
      db.prepare(`INSERT INTO thung_rac_dong (thung_rac_id, ${cotD}) SELECT @t, ${cotD} FROM arrival_items WHERE import_file_id IN (SELECT value FROM json_each(@ids)) ORDER BY id`)
        .run({ t: nhatKyId, ids: cu.ids });
      // (b) xóa dòng rồi bản ghi file (khóa ngoại bật: dòng trước)
      soDongXoa = db.prepare('DELETE FROM arrival_items WHERE import_file_id IN (SELECT value FROM json_each(@ids))').run({ ids: cu.ids }).changes;
      soFileXoa = db.prepare('DELETE FROM arrival_import_files WHERE id IN (SELECT value FROM json_each(@ids))').run({ ids: cu.ids }).changes;
      if (soDongXoa !== cu.tongDong || soFileXoa !== cu.files.length) {
        throw new ThayTheLoi(MA_LOI.GHI_THAT_BAI, 'Số dòng / file đã xóa không khớp số đã tính — hoàn tác toàn bộ');
      }
      if (typeof o.sauKhiXoa === 'function') o.sauKhiXoa();
      // (c) + (d) nạp từng file mới; hàm ghi chỉ TRẢ trạng thái từ chối (không ném) nên phải kiểm và tự ném để hoàn tác toàn bộ
      for (const d of ghiTheoThuTu) {
        const r = o.ghiFn(db, d, { ghiTuChoi: false, source: 'SFTP' });
        if (!r || !['OK', 'EMPTY'].includes(r.status) || r.alreadyImported) {
          throw new ThayTheLoi(MA_LOI.GHI_THAT_BAI,
            `Nạp file ${d.fileName} thất bại (${r && r.status ? r.status : 'KHONG_RO'}${r && r.error ? `: ${S.lamSach(r.error, bimat, 100)}` : ''}) — đã hoàn tác toàn bộ, DB y nguyên`);
        }
        ketQuaGhi.push({ ten: d.fileName, sha256: d.meta.sha256, trang_thai: r.status, so_dong: r.rowCount ?? 0, da_ghi: r.inserted ?? 0, bo_qua_trung: r.ignored ?? 0 });
      }
      // (e) nhật ký (dòng đã tạo ở đầu giao dịch để có id mẻ thùng rác; nay điền kết quả nạp)
      const soDongMoi = ketQuaGhi.reduce((a, k) => a + k.da_ghi, 0);
      db.prepare('UPDATE thay_the_nhat_ky SET tap_file_moi = @m, so_file_moi = @sf, so_dong_moi = @sd WHERE id = @id')
        .run({ m: JSON.stringify(ketQuaGhi), sf: ketQuaGhi.length, sd: soDongMoi, id: nhatKyId });
    });
    try {
      thucHien.immediate();
    } catch (err) {
      if (err instanceof XemTruocLoi) throw err;
      throw new ThayTheLoi(MA_LOI.GHI_THAT_BAI, `Giao dịch thay thế thất bại (${S.lamSach(String((err && err.code) || (err && err.name) || 'LOI'), bimat, 40)}) — đã hoàn tác toàn bộ, DB y nguyên`);
    }

    xoaBoNhoBd10Share(db); // dữ liệu ngày đã đổi: buộc tính lại tỷ lệ tiêu chí bd10 (5g-5, #87)

    // ---- 7. dọn (lỗi dọn KHÔNG làm hỏng lần thay đã xong)
    const don = { thung_rac: { mua: 0, dong: 0, file: 0 }, sao_luu: 0, loi: [] };
    try { don.thung_rac = donThungRac(db, luc); } catch (err) { don.loi.push('thung_rac'); }
    try { don.sao_luu = donSaoLuu(thuMucSaoLuu); } catch (err) { don.loi.push('sao_luu'); }
    return {
      chay_kho: false, ...tomTat,
      nhat_ky_id: nhatKyId, so_dong_xoa: soDongXoa, so_file_xoa: soFileXoa, so_dong_nap: ketQuaGhi.reduce((a, k) => a + k.da_ghi, 0), so_file_nap: ketQuaGhi.length, tap_file_moi: ketQuaGhi,
      dong_y_mat: dongYMat === true,
      sao_luu: { duong_dan: sl.duong_dan, tep: sl.tep, kich_thuoc: sl.kich_thuoc },
      thung_rac: { het_han_luc: hetHan, so_dong: soDongXoa, so_file: soFileXoa },
      da_don: don, thoi_gian_ms: Date.now() - t0
    };
  } finally {
    if (thuMucTam) { try { fs.rmSync(thuMucTam, { recursive: true, force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
    if (idKhoa !== null) nhaKhoa(db, idKhoa, now);
    if (giuCo) dangThayThe = false;
    if (ketNoiXong && typeof ketNoiXong.end === 'function') { try { await ketNoiXong.end(); } catch (e) { /* đã đóng */ } }
  }
}

module.exports = {
  MA_LOI, HTTP, MA_THOAT, THOAT_THEO_LOI, ThayTheLoi, COT_FILE, COT_DONG, ensureThayTheSchema, thayTheNgay, donThungRac, donSaoLuu, dsSaoLuu, tinhMatThat, kiemTraDuKien, kiemTraXacNhan,
  giuKhoaChung, saoLuu, dauThoiGian
};
