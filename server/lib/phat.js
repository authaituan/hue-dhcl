// ==========================================
// Module «Xử lý và tỷ lệ phát» (PHAT-1, docs/ai/08_PHAT.md): lược đồ, chuẩn hoá, kiểm tra từng dòng, biên tập bản kiểm tra,
// nhập từng phần, tỷ lệ theo ngày. Trạng thái gắn với (BCVH, SHBG), KHÔNG gắn với ngày; «số liệu tính đến lúc» (nhap_luc) do
// MÁY CHỦ ghi lúc commit — không có tham số nào cho client đặt giờ.
// «SHBG đến ngày D» dùng đúng aq.buildCountedCte (R2, loại trùng) như tong-quan-den của dashboard (dashboardDenQuery.js).
// ==========================================
'use strict';
const crypto = require('crypto');
const C = require('../config/phat');
const aq = require('./arrivalsQuery');
const den = require('./dashboardDenQuery');

const { KET_QUA, MA_LOI } = C;

class PhatError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

// ------------------------------------------
// Lược đồ (idempotent, gọi từ server/db.js)
// ------------------------------------------
const sqlList = (arr) => arr.map((x) => `'${x}'`).join(', ');

function ensurePhatSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phat_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bcvh TEXT NOT NULL,
      user_id TEXT NOT NULL,
      nhap_luc TEXT NOT NULL,            -- UTC ISO (YYYY-MM-DDTHH:MM:SSZ) do MÁY CHỦ ghi lúc commit
      ten_file TEXT,
      sha256 TEXT,
      so_nhap INTEGER NOT NULL DEFAULT 0,
      so_bo_qua INTEGER NOT NULL DEFAULT 0,
      so_loi INTEGER NOT NULL DEFAULT 0,
      trang_thai TEXT NOT NULL DEFAULT 'da_nhap' CHECK (trang_thai IN (${sqlList(Object.values(C.TRANG_THAI_DOT))})),
      hoan_tac_luc TEXT,
      hoan_tac_boi TEXT,
      draft_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_phat_batches_bcvh ON phat_batches(bcvh, nhap_luc);
    CREATE INDEX IF NOT EXISTS ix_phat_batches_draft ON phat_batches(draft_id);

    CREATE TABLE IF NOT EXISTS phat_status_current (
      bcvh TEXT NOT NULL,
      shbg TEXT NOT NULL,
      trang_thai TEXT NOT NULL CHECK (trang_thai IN (${sqlList(C.TT_MA)})),
      ghi_chu TEXT,
      batch_id INTEGER NOT NULL,
      nhap_luc TEXT NOT NULL,
      gio_phat TEXT,                     -- chừa cho nguồn tự động có giờ phát; KHÔNG dùng ở PHAT-1
      PRIMARY KEY (bcvh, shbg)
    );
    CREATE INDEX IF NOT EXISTS ix_phat_current_batch ON phat_status_current(batch_id);

    CREATE TABLE IF NOT EXISTS phat_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bcvh TEXT NOT NULL,
      shbg TEXT NOT NULL,
      trang_thai TEXT NOT NULL,
      trang_thai_truoc TEXT,             -- rỗng = trước đó chưa có trạng thái
      ghi_chu TEXT,
      batch_id INTEGER NOT NULL,
      nhap_luc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_phat_history_shbg ON phat_status_history(bcvh, shbg, id);
    CREATE INDEX IF NOT EXISTS ix_phat_history_batch ON phat_status_history(batch_id);

    CREATE TABLE IF NOT EXISTS phat_drafts (
      id TEXT PRIMARY KEY,
      bcvh TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tao_luc TEXT NOT NULL,
      het_han_luc TEXT NOT NULL,
      ten_file TEXT,
      sha256 TEXT,
      trang_thai TEXT NOT NULL DEFAULT 'dang_mo'
    );
    CREATE INDEX IF NOT EXISTS ix_phat_drafts_het_han ON phat_drafts(het_han_luc);

    CREATE TABLE IF NOT EXISTS phat_draft_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id TEXT NOT NULL,
      so_dong_goc INTEGER NOT NULL,
      shbg TEXT NOT NULL,                -- đã chuẩn hoá (cắt khoảng trắng, viết hoa)
      trang_thai_file TEXT NOT NULL DEFAULT '',  -- chữ trong file (đã cắt khoảng trắng)
      trang_thai TEXT,                   -- mã đã nhận diện / đã sửa (NULL = trống hoặc ngoài danh sách)
      ghi_chu TEXT,
      loi_o TEXT,                        -- 'SHBG' | 'TRANG_THAI': ô chứa lỗi công thức trong file
      trang_thai_hien_co TEXT,           -- trạng thái hiện có (chưa có = CHUA_CO_TT); NULL nếu SHBG sai định dạng
      ket_qua TEXT NOT NULL DEFAULT 'BO_QUA_TRONG',
      ma_loi TEXT,
      chi_tiet_loi TEXT,
      canh_bao TEXT,
      batch_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS ix_phat_rows_ketqua ON phat_draft_rows(draft_id, ket_qua);
    CREATE INDEX IF NOT EXISTS ix_phat_rows_shbg ON phat_draft_rows(draft_id, shbg);
    CREATE INDEX IF NOT EXISTS ix_phat_rows_batch ON phat_draft_rows(batch_id);
  `);
}

/** Giờ máy chủ, UTC ISO đến giây. Chỉ máy chủ gọi hàm này để ghi nhap_luc / tao_luc. */
const nowIso = () => new Date().toISOString().slice(0, 19) + 'Z';
const plusDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 19) + 'Z';

/** Dọn bản kiểm tra hết hạn (khi khởi động và khi truy cập). Không đụng dữ liệu đã nhập. Trả số bản bị xoá. */
function purgeExpiredDrafts(db, now = nowIso()) {
  return db.transaction(() => {
    db.prepare('DELETE FROM phat_draft_rows WHERE draft_id IN (SELECT id FROM phat_drafts WHERE het_han_luc < ?)').run(now);
    return db.prepare('DELETE FROM phat_drafts WHERE het_han_luc < ?').run(now).changes;
  })();
}

// ------------------------------------------
// Chuẩn hoá
// ------------------------------------------
/** Bỏ dấu, thường, ký tự không chữ/số -> khoảng trắng, gộp khoảng trắng. */
function normalizeKey(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const TT_THEO_KHOA = new Map();
for (const t of C.TRANG_THAI) {
  TT_THEO_KHOA.set(normalizeKey(t.nhan), t.ma);
  TT_THEO_KHOA.set(normalizeKey(t.ma), t.ma);
}
/** Nhãn (không phân biệt hoa/thường/dấu) hoặc mã -> mã trạng thái; không khớp -> null. KHÔNG đoán trạng thái gần giống. */
function trangThaiTuChu(text) {
  const k = normalizeKey(text);
  return k ? (TT_THEO_KHOA.get(k) || null) : null;
}

const normShbg = (s) => String(s ?? '').trim().toUpperCase();
const normGhiChu = (s) => {
  const t = String(s ?? '').trim();
  return t.length > C.GIOI_HAN.MAX_GHI_CHU ? t.slice(0, C.GIOI_HAN.MAX_GHI_CHU) : t;
};

/** 'YYYY-MM-DD HH:MM:SS' -> khung giờ đến (mục của C.KHUNG_GIO_DEN); không đọc được -> null. */
function khungGio(t) {
  const m = /^\d{4}-\d{2}-\d{2}[ T](\d{2})/.exec(String(t || ''));
  if (!m) return null; // không có / sai dạng giờ: KHÔNG rơi vào «trước 10h»
  const h = Number(m[1]);
  if (h > 23) return null;
  return C.KHUNG_GIO_DEN.find((k) => h >= k.tu && (k.den === null || h < k.den)) || null;
}

const laTrong = (r) => r.trang_thai === null && !r.trang_thai_file && r.loi_o !== 'TRANG_THAI';

// ------------------------------------------
// Kiểm tra một dòng (thuần). ctx: { nhom: Map<shbg, number[]> (số dòng của nhóm trùng), trongDen: Map<shbg, 0|1>, hienCo: Map<shbg, mã> }
// Thứ tự lỗi: SAI_DINH_DANG > TRUNG_SHBG > TT_NGOAI_DS > KHONG_CO_TRONG_DEN > KHONG_DOI. Ô Trạng thái trống -> BO_QUA_TRONG.
// ------------------------------------------
function danhGia(r, ctx) {
  const dungDinhDang = C.SHBG_REGEX.test(r.shbg);
  const hienCo = dungDinhDang ? (ctx.hienCo.get(r.shbg) || C.TT_CHUA_CO) : null;
  const out = (ket_qua, ma_loi = null, chi_tiet_loi = null, canh_bao = null) => ({ trang_thai_hien_co: hienCo, ket_qua, ma_loi, chi_tiet_loi, canh_bao });

  if (laTrong(r)) return out(KET_QUA.BO_QUA_TRONG);
  const loi = (ma, chiTiet) => out(KET_QUA.LOI, ma, chiTiet);

  if (r.loi_o) return loi(MA_LOI.SAI_DINH_DANG, 'ô chứa lỗi công thức');
  if (!r.shbg) return loi(MA_LOI.SAI_DINH_DANG, 'SHBG để trống');
  if (!dungDinhDang) return loi(MA_LOI.SAI_DINH_DANG, `SHBG phải gồm ${C.SHBG_DO_DAI} ký tự: 2 chữ, 9 số, 2 chữ`);

  const nhom = ctx.nhom.get(r.shbg) || [];
  if (nhom.length > 1) {
    const dong = nhom.slice(0, 10).join(', ') + (nhom.length > 10 ? ` và ${nhom.length - 10} dòng khác` : '');
    return loi(MA_LOI.TRUNG_SHBG, `SHBG xuất hiện ${nhom.length} lần trong file, ở các dòng: ${dong}`);
  }

  if (r.trang_thai === null) {
    const raw = r.trang_thai_file.length > 40 ? `${r.trang_thai_file.slice(0, 40)}…` : r.trang_thai_file;
    return loi(MA_LOI.TT_NGOAI_DS, `Trạng thái "${raw}" không nằm trong danh sách (${C.TRANG_THAI.map((t) => t.nhan).join(', ')})`);
  }

  const tonTai = ctx.trongDen.get(r.shbg);
  if (tonTai === undefined) return loi(MA_LOI.KHONG_CO_TRONG_DEN, 'SHBG không có trong dữ liệu đến của BCVH này');
  if (tonTai === 0) return loi(MA_LOI.KHONG_CO_TRONG_DEN, 'có trong dữ liệu nhưng chưa có giờ đến BCVH');

  if (r.trang_thai === hienCo) return loi(MA_LOI.KHONG_DOI, `Trạng thái không đổi so với hiện có (${C.TT_NHAN[hienCo]})`);

  const canhBao = C.laChuyenBatThuong(hienCo, r.trang_thai)
    ? `Chuyển bất thường: ${C.TT_NHAN[hienCo]} → ${C.TT_NHAN[r.trang_thai]}` : null;
  return out(KET_QUA.HOP_LE, null, null, canhBao);
}

/**
 * Kiểm tra lại các dòng CHƯA nhập của bản kiểm tra. shbgSet = null: toàn bộ; Set: chỉ các dòng có SHBG đó (kể cả để cập nhật nhóm trùng).
 * Trạng thái hiện có và dữ liệu đến đọc tại THỜI ĐIỂM GỌI (commit gọi lại để bắt thay đổi từ lúc kiểm).
 */
function kiemTraLai(db, draft, shbgSet = null) {
  const rows = shbgSet
    ? db.prepare(`SELECT * FROM phat_draft_rows WHERE draft_id = @d AND ket_qua <> 'DA_NHAP' AND shbg IN (SELECT value FROM json_each(@j))`)
      .all({ d: draft.id, j: JSON.stringify([...shbgSet]) })
    : db.prepare("SELECT * FROM phat_draft_rows WHERE draft_id = ? AND ket_qua <> 'DA_NHAP'").all(draft.id);
  if (!rows.length) return 0;

  const nhom = new Map();
  for (const r of rows) {
    if (laTrong(r) || !r.shbg) continue;
    if (!nhom.has(r.shbg)) nhom.set(r.shbg, []);
    nhom.get(r.shbg).push(r.so_dong_goc);
  }
  for (const list of nhom.values()) list.sort((a, b) => a - b);

  const hopLe = [...new Set(rows.filter((r) => C.SHBG_REGEX.test(r.shbg)).map((r) => r.shbg))];
  const trongDen = new Map();
  const hienCo = new Map();
  if (hopLe.length) {
    const j = JSON.stringify(hopLe);
    for (const r of db.prepare(`SELECT tracking_no AS s, MAX(arrival_at IS NOT NULL) AS g FROM arrival_items
      WHERE receiver_code = @b AND tracking_no IN (SELECT value FROM json_each(@j)) GROUP BY tracking_no`).all({ b: draft.bcvh, j })) trongDen.set(r.s, r.g);
    for (const r of db.prepare(`SELECT shbg AS s, trang_thai AS t FROM phat_status_current
      WHERE bcvh = @b AND shbg IN (SELECT value FROM json_each(@j))`).all({ b: draft.bcvh, j })) hienCo.set(r.s, r.t);
  }

  const upd = db.prepare(`UPDATE phat_draft_rows SET trang_thai_hien_co = @h, ket_qua = @k, ma_loi = @m, chi_tiet_loi = @c, canh_bao = @w WHERE id = @id`);
  let doi = 0;
  db.transaction(() => {
    for (const r of rows) {
      const e = danhGia(r, { nhom, trongDen, hienCo });
      if (e.trang_thai_hien_co === r.trang_thai_hien_co && e.ket_qua === r.ket_qua && e.ma_loi === r.ma_loi
        && e.chi_tiet_loi === r.chi_tiet_loi && e.canh_bao === r.canh_bao) continue;
      upd.run({ id: r.id, h: e.trang_thai_hien_co, k: e.ket_qua, m: e.ma_loi, c: e.chi_tiet_loi, w: e.canh_bao });
      doi++;
    }
  })();
  return doi;
}

// ------------------------------------------
// Bản kiểm tra
// ------------------------------------------
/** dong: [{ so_dong_goc, shbg, trang_thai_file, ghi_chu, loi_o }] từ phatFile.docFileKiemTra. Trả bản kiểm tra (đã kiểm tra từng dòng). */
function taoBanKiemTra(db, { bcvh, userId, tenFile, sha256, dong }) {
  const now = nowIso();
  const draft = {
    id: crypto.randomUUID(), bcvh, user_id: userId, tao_luc: now,
    het_han_luc: plusDays(now, C.GIOI_HAN.GIU_BAN_KIEM_TRA_NGAY), ten_file: tenFile || null, sha256: sha256 || null
  };
  const ins = db.prepare(`INSERT INTO phat_draft_rows (draft_id, so_dong_goc, shbg, trang_thai_file, trang_thai, ghi_chu, loi_o)
    VALUES (@d, @n, @s, @f, @t, @g, @l)`);
  db.transaction(() => {
    db.prepare(`INSERT INTO phat_drafts (id, bcvh, user_id, tao_luc, het_han_luc, ten_file, sha256) VALUES (@id, @bcvh, @user_id, @tao_luc, @het_han_luc, @ten_file, @sha256)`).run(draft);
    for (const r of dong) {
      const chu = String(r.trang_thai_file || '').trim().slice(0, 200);
      ins.run({
        d: draft.id, n: r.so_dong_goc, s: normShbg(r.shbg), f: chu, t: trangThaiTuChu(chu),
        g: normGhiChu(r.ghi_chu) || null, l: r.loi_o || null
      });
    }
    kiemTraLai(db, draft, null);
  })();
  return draft;
}

function layBanKiemTra(db, id) {
  purgeExpiredDrafts(db);
  return db.prepare('SELECT * FROM phat_drafts WHERE id = ?').get(String(id)) || null;
}

function tongHop(db, draftId) {
  const out = {
    tong_dong: 0, hop_le: 0, bo_qua_trong: 0, loi: 0, da_nhap: 0, canh_bao: 0,
    loi_theo_ma: Object.fromEntries(Object.values(MA_LOI).map((m) => [m, 0]))
  };
  for (const r of db.prepare(`SELECT ket_qua, ma_loi, COUNT(*) AS n, SUM(canh_bao IS NOT NULL) AS cb FROM phat_draft_rows WHERE draft_id = ? GROUP BY ket_qua, ma_loi`).all(draftId)) {
    out.tong_dong += r.n;
    if (r.ket_qua === KET_QUA.HOP_LE) { out.hop_le += r.n; out.canh_bao += r.cb || 0; }
    else if (r.ket_qua === KET_QUA.BO_QUA_TRONG) out.bo_qua_trong += r.n;
    else if (r.ket_qua === KET_QUA.DA_NHAP) out.da_nhap += r.n;
    else { out.loi += r.n; if (r.ma_loi in out.loi_theo_ma) out.loi_theo_ma[r.ma_loi] += r.n; }
  }
  return out;
}

const dongRa = (r) => ({
  id: r.id, so_dong_goc: r.so_dong_goc, shbg: r.shbg,
  trang_thai: r.trang_thai, trang_thai_nhan: r.trang_thai ? C.TT_NHAN[r.trang_thai] : null, trang_thai_file: r.trang_thai_file,
  ghi_chu: r.ghi_chu || '', trang_thai_hien_co: r.trang_thai_hien_co, trang_thai_hien_co_nhan: r.trang_thai_hien_co ? C.TT_NHAN[r.trang_thai_hien_co] : null,
  ket_qua: r.ket_qua, ma_loi: r.ma_loi, ly_do: r.chi_tiet_loi, canh_bao: r.canh_bao
});

/** Bộ lọc dòng dùng chung cho danh sách / xoá / điền: { ket_qua, ma_loi, q (SHBG chứa), canh_bao }. */
function locDong(filter) {
  const f = filter && typeof filter === 'object' ? filter : {};
  const where = [];
  const params = {};
  if (f.ket_qua !== undefined && f.ket_qua !== null && f.ket_qua !== '') {
    if (!Object.values(KET_QUA).includes(f.ket_qua)) throw new PhatError(400, `Bộ lọc "ket_qua" phải là một trong: ${Object.values(KET_QUA).join(', ')}`);
    where.push('ket_qua = @f_kq'); params.f_kq = f.ket_qua;
  }
  if (f.ma_loi !== undefined && f.ma_loi !== null && f.ma_loi !== '') {
    if (!Object.values(MA_LOI).includes(f.ma_loi)) throw new PhatError(400, `Bộ lọc "ma_loi" phải là một trong: ${Object.values(MA_LOI).join(', ')}`);
    where.push('ma_loi = @f_ml'); params.f_ml = f.ma_loi;
  }
  if (f.q !== undefined && f.q !== null && String(f.q).trim() !== '') {
    where.push("shbg LIKE @f_q ESCAPE '\\'");
    params.f_q = `%${String(f.q).trim().toUpperCase().slice(0, 30).replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (f.canh_bao === true || f.canh_bao === '1' || f.canh_bao === 1) where.push('canh_bao IS NOT NULL');
  return { where: where.join(' AND '), params };
}

function dsDong(db, draft, query) {
  const { where, params } = locDong(query);
  const page = query.page === undefined || query.page === '' ? 1 : Number(query.page);
  const size = query.size === undefined || query.size === '' ? C.GIOI_HAN.TRANG_MAC_DINH : Number(query.size);
  if (!Number.isInteger(page) || page < 1) throw new PhatError(400, 'Tham số "page" phải là số nguyên ≥ 1');
  if (!Number.isInteger(size) || size < 1 || size > C.GIOI_HAN.TRANG_TOI_DA) throw new PhatError(400, `Tham số "size" phải là số nguyên 1..${C.GIOI_HAN.TRANG_TOI_DA}`);
  const cond = `draft_id = @d${where ? ` AND ${where}` : ''}`;
  const p = { ...params, d: draft.id };
  const total = db.prepare(`SELECT COUNT(*) AS n FROM phat_draft_rows WHERE ${cond}`).get(p).n;
  const rows = db.prepare(`SELECT * FROM phat_draft_rows WHERE ${cond} ORDER BY so_dong_goc, id LIMIT @lim OFFSET @off`).all({ ...p, lim: size, off: (page - 1) * size });
  return { items: rows.map(dongRa), pagination: { total, page, page_size: size, total_pages: Math.ceil(total / size) } };
}

// ------------------------------------------
// Biên tập: sửa, xoá, điền hàng loạt, gán nhanh bằng danh sách. Dòng DA_NHAP bị khoá. Mọi thao tác kiểm tra lại dòng bị ảnh hưởng.
// ------------------------------------------
/** Đọc giá trị trạng thái từ API: '' / null = xoá trạng thái; còn lại phải là nhãn hoặc mã hợp lệ (nếu không -> 400). */
function docTrangThaiApi(v, { choPhepTrong }) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
    if (choPhepTrong) return null;
    throw new PhatError(400, `Thiếu trạng thái. Chọn một trong: ${C.TRANG_THAI.map((t) => t.nhan).join(', ')}`);
  }
  const ma = typeof v === 'string' ? trangThaiTuChu(v) : null;
  if (!ma) throw new PhatError(400, `Trạng thái không hợp lệ. Chọn một trong: ${C.TRANG_THAI.map((t) => `${t.ma} (${t.nhan})`).join(', ')}`);
  return ma;
}

function chonDong(db, draftId, sel) {
  if (sel && Array.isArray(sel.ids)) {
    if (!sel.ids.length) throw new PhatError(400, 'Danh sách ids rỗng');
    if (sel.ids.length > C.GIOI_HAN.MAX_DONG) throw new PhatError(400, `Danh sách ids vượt giới hạn ${C.GIOI_HAN.MAX_DONG} dòng`);
    if (!sel.ids.every((x) => Number.isInteger(x))) throw new PhatError(400, 'ids phải là số nguyên (id dòng)');
    const rows = db.prepare('SELECT id, shbg, ket_qua FROM phat_draft_rows WHERE draft_id = @d AND id IN (SELECT value FROM json_each(@j))')
      .all({ d: draftId, j: JSON.stringify(sel.ids) });
    return { rows, khong_tim_thay: new Set(sel.ids).size - rows.length };
  }
  if (sel && sel.filter && typeof sel.filter === 'object') {
    const { where, params } = locDong(sel.filter);
    return { rows: db.prepare(`SELECT id, shbg, ket_qua FROM phat_draft_rows WHERE draft_id = @d${where ? ` AND ${where}` : ''}`).all({ ...params, d: draftId }), khong_tim_thay: 0 };
  }
  throw new PhatError(400, 'Cần "ids" (danh sách id dòng) hoặc "filter" (bộ lọc, có thể là {} để chọn mọi dòng chưa nhập)');
}

const tachKhoa = (rows) => ({
  mo: rows.filter((r) => r.ket_qua !== KET_QUA.DA_NHAP),
  khoa: rows.filter((r) => r.ket_qua === KET_QUA.DA_NHAP)
});

function suaDong(db, draft, items) {
  if (!Array.isArray(items) || !items.length) throw new PhatError(400, 'Cần "rows": danh sách { id, trang_thai?, ghi_chu? }');
  if (items.length > C.GIOI_HAN.MAX_SUA_MOT_LAN) throw new PhatError(400, `Mỗi lần chỉ sửa tối đa ${C.GIOI_HAN.MAX_SUA_MOT_LAN} dòng`);
  const plan = items.map((it) => {
    if (!it || !Number.isInteger(it.id)) throw new PhatError(400, 'Mỗi phần tử cần "id" là số nguyên');
    const p = { id: it.id };
    if ('trang_thai' in it) p.trang_thai = docTrangThaiApi(it.trang_thai, { choPhepTrong: true });
    if ('ghi_chu' in it) {
      if (it.ghi_chu !== null && typeof it.ghi_chu !== 'string') throw new PhatError(400, '"ghi_chu" phải là chuỗi');
      p.ghi_chu = normGhiChu(it.ghi_chu) || null;
    }
    return p;
  });
  const { rows, khong_tim_thay } = chonDong(db, draft.id, { ids: plan.map((p) => p.id) });
  const { mo, khoa } = tachKhoa(rows);
  const moIds = new Set(mo.map((r) => r.id));
  const cur = new Map(db.prepare('SELECT id, shbg, loi_o FROM phat_draft_rows WHERE id IN (SELECT value FROM json_each(@j))').all({ j: JSON.stringify([...moIds]) }).map((r) => [r.id, r]));
  const shbgs = new Set();
  let daSua = 0;
  db.transaction(() => {
    for (const p of plan) {
      if (!moIds.has(p.id)) continue;
      const sets = []; const prm = { id: p.id };
      if ('trang_thai' in p) {
        sets.push('trang_thai = @t'); prm.t = p.trang_thai;
        if (p.trang_thai === null) sets.push("trang_thai_file = ''");
        if (cur.get(p.id).loi_o === 'TRANG_THAI') sets.push('loi_o = NULL');
      }
      if ('ghi_chu' in p) { sets.push('ghi_chu = @g'); prm.g = p.ghi_chu; }
      if (!sets.length) continue;
      db.prepare(`UPDATE phat_draft_rows SET ${sets.join(', ')} WHERE id = @id`).run(prm);
      shbgs.add(cur.get(p.id).shbg);
      daSua++;
    }
    if (shbgs.size) kiemTraLai(db, draft, shbgs);
  })();
  return { da_sua: daSua, bi_khoa: khoa.map((r) => r.id), khong_tim_thay, tong_hop: tongHop(db, draft.id) };
}

function xoaDong(db, draft, sel) {
  const { rows, khong_tim_thay } = chonDong(db, draft.id, sel);
  const { mo, khoa } = tachKhoa(rows);
  db.transaction(() => {
    db.prepare('DELETE FROM phat_draft_rows WHERE draft_id = @d AND id IN (SELECT value FROM json_each(@j))').run({ d: draft.id, j: JSON.stringify(mo.map((r) => r.id)) });
    const shbgs = new Set(mo.map((r) => r.shbg).filter(Boolean));
    if (shbgs.size) kiemTraLai(db, draft, shbgs); // dòng còn lại cùng SHBG hết trùng
  })();
  return { da_xoa: mo.length, bi_khoa: khoa.map((r) => r.id), khong_tim_thay, tong_hop: tongHop(db, draft.id) };
}

function datTrangThai(db, draft, ids, ma) {
  const shbgs = new Set();
  db.transaction(() => {
    db.prepare(`UPDATE phat_draft_rows SET trang_thai = @t, loi_o = CASE WHEN loi_o = 'TRANG_THAI' THEN NULL ELSE loi_o END
      WHERE draft_id = @d AND ket_qua <> 'DA_NHAP' AND id IN (SELECT value FROM json_each(@j))`).run({ t: ma, d: draft.id, j: JSON.stringify(ids) });
    for (const r of db.prepare('SELECT DISTINCT shbg FROM phat_draft_rows WHERE draft_id = @d AND id IN (SELECT value FROM json_each(@j))').all({ d: draft.id, j: JSON.stringify(ids) })) shbgs.add(r.shbg);
    kiemTraLai(db, draft, shbgs);
  })();
}

function dienTrangThai(db, draft, body) {
  const ma = docTrangThaiApi(body && body.trang_thai, { choPhepTrong: false });
  const { rows, khong_tim_thay } = chonDong(db, draft.id, body);
  const { mo, khoa } = tachKhoa(rows);
  if (mo.length) datTrangThai(db, draft, mo.map((r) => r.id), ma);
  return { da_dien: mo.length, bi_khoa: khoa.map((r) => r.id), khong_tim_thay, tong_hop: tongHop(db, draft.id) };
}

function ganDanhSach(db, draft, body) {
  const ma = docTrangThaiApi(body && body.trang_thai, { choPhepTrong: false });
  const ds = body && body.shbg;
  if (!Array.isArray(ds) || !ds.length) throw new PhatError(400, 'Cần "shbg": danh sách SHBG (mảng chuỗi)');
  if (ds.length > C.GIOI_HAN.MAX_DONG) throw new PhatError(400, `Danh sách SHBG vượt giới hạn ${C.GIOI_HAN.MAX_DONG} dòng`);
  const want = [...new Set(ds.map(normShbg).filter(Boolean))];
  const found = db.prepare('SELECT id, shbg, ket_qua FROM phat_draft_rows WHERE draft_id = @d AND shbg IN (SELECT value FROM json_each(@j))')
    .all({ d: draft.id, j: JSON.stringify(want) });
  const { mo, khoa } = tachKhoa(found);
  if (mo.length) datTrangThai(db, draft, mo.map((r) => r.id), ma);
  const trongFile = new Set(found.map((r) => r.shbg));
  const khongCo = want.filter((s) => !trongFile.has(s));
  return {
    so_dong_khop: mo.length, so_shbg_khop: new Set(mo.map((r) => r.shbg)).size, bi_khoa: khoa.map((r) => r.id),
    so_shbg_khong_co_trong_file: khongCo.length, shbg_khong_co_trong_file: khongCo.slice(0, 1000),
    tong_hop: tongHop(db, draft.id)
  };
}

/** Các dòng lỗi (cho file lỗi) kèm ngày đến / đường thư tra từ dữ liệu đến (nếu SHBG có trong dữ liệu). */
function layDongLoi(db, draft) {
  const rows = db.prepare("SELECT * FROM phat_draft_rows WHERE draft_id = ? AND ket_qua = 'LOI' ORDER BY so_dong_goc, id").all(draft.id);
  const hopLe = [...new Set(rows.map((r) => r.shbg).filter((s) => C.SHBG_REGEX.test(s)))];
  const info = new Map();
  if (hopLe.length) {
    for (const r of db.prepare(`SELECT tracking_no AS s, arrival_at AS t, route_name AS d FROM (
      SELECT tracking_no, arrival_at, route_name, ROW_NUMBER() OVER (PARTITION BY tracking_no ORDER BY arrival_at, id) AS rn
      FROM arrival_items WHERE receiver_code = @b AND arrival_at IS NOT NULL AND tracking_no IN (SELECT value FROM json_each(@j))) WHERE rn = 1`)
      .all({ b: draft.bcvh, j: JSON.stringify(hopLe) })) info.set(r.s, r);
  }
  return rows.map((r) => {
    const i = info.get(r.shbg);
    return {
      shbg: r.shbg, t: i ? i.t : null, duong_thu: i ? i.d : null, hien_co: r.trang_thai_hien_co,
      trang_thai: r.trang_thai ? C.TT_NHAN[r.trang_thai] : r.trang_thai_file, ghi_chu: r.ghi_chu || '',
      so_dong_goc: r.so_dong_goc, ly_do: r.chi_tiet_loi || ''
    };
  });
}

// ------------------------------------------
// File mẫu: mỗi SHBG đúng MỘT dòng (SHBG đến trong khoảng ngày theo R2, loại trùng — aq.buildCountedCte như dashboard)
// ------------------------------------------
function khungKhoang(bcvh, from, to) {
  return { dateBasis: 'arrival', receiverCodes: [bcvh], wardKey: null, heavyG: aq.HEAVY_THRESHOLD_G_DEFAULT, from: `${from} 00:00:00`, to: `${to} 23:59:59`, fromDate: from, toDate: to };
}

const MAU_JOIN = 'FROM s LEFT JOIN phat_status_current p ON p.bcvh = @bcvh AND p.shbg = s.tracking_no';
const MAU_WHERE = "WHERE (@chua = 0 OR p.trang_thai IS NULL OR p.trang_thai = 'CHUA_CO_TT')";

function demDongMau(db, { bcvh, from, to, scope }) {
  return den.runCounted(db, khungKhoang(bcvh, from, to), `SELECT COUNT(*) AS n ${MAU_JOIN} ${MAU_WHERE}`, { bcvh, chua: scope === 'chua' ? 1 : 0 })[0].n;
}

function layDongMau(db, { bcvh, from, to, scope }) {
  return den.runCounted(db, khungKhoang(bcvh, from, to), `SELECT s.tracking_no AS shbg, s.t AS t, s.route_name AS duong_thu, p.trang_thai AS hien_co, p.ghi_chu AS ghi_chu
    ${MAU_JOIN} ${MAU_WHERE} ORDER BY s.t, s.tracking_no`, { bcvh, chua: scope === 'chua' ? 1 : 0 });
}

// ------------------------------------------
// Tỷ lệ theo ngày đến (mẫu số = SHBG đến ngày D, đúng bằng san_luong.buu_gui của tong-quan-den cùng ngày)
// ------------------------------------------
const ratio4 = (n, d) => (d ? Math.round((n / d) * 10000) / 10000 : null);

function tyLeNgay(db, bcvh, day) {
  const rows = den.runCounted(db, den.windowFilter(bcvh, day, '23:59:59'),
    `SELECT COALESCE(p.trang_thai, 'CHUA_CO_TT') AS tt, COUNT(*) AS n ${MAU_JOIN} GROUP BY tt`, { bcvh });
  const so = Object.fromEntries(C.TT_MA.map((m) => [m, 0]));
  for (const r of rows) so[r.tt] += r.n;
  const mau = Object.values(so).reduce((a, x) => a + x, 0);
  const ty = (m) => ratio4(so[m], mau);
  return {
    ngay: day, mau_so: mau,
    theo_trang_thai: Object.fromEntries(C.TT_MA.map((m) => [m, { so: so[m], ty_le: ty(m) }])),
    muc_cap_nhat: mau ? Math.round((1 - so[C.TT_CHUA_CO] / mau) * 10000) / 10000 : null
  };
}

/** Các ngày đến (arrival_date) của những SHBG này tại BCVH; tối đa GIOI_HAN.MAX_NGAY_LIEN_QUAN ngày gần nhất, tăng dần. */
function ngayLienQuan(db, bcvh, shbgs) {
  if (!shbgs.length) return [];
  const ds = db.prepare(`SELECT DISTINCT arrival_date AS d FROM arrival_items WHERE receiver_code = @b AND arrival_date IS NOT NULL
    AND tracking_no IN (SELECT value FROM json_each(@j)) ORDER BY d DESC LIMIT @lim`).all({ b: bcvh, j: JSON.stringify(shbgs), lim: C.GIOI_HAN.MAX_NGAY_LIEN_QUAN }).map((r) => r.d);
  return ds.reverse();
}

// ------------------------------------------
// Nhập đợt (commit): MỘT giao dịch; kiểm tra lại từng dòng tại thời điểm commit; chỉ ghi dòng vẫn hợp lệ.
// mode 'hop-le': mọi dòng hợp lệ; 'da-chon': các dòng trong ids (chỉ ghi dòng vẫn hợp lệ). Dòng lỗi / trống ở lại bản kiểm tra.
// ------------------------------------------
function nhapDot(db, draft, user, body) {
  const mode = body && body.mode;
  if (mode !== 'hop-le' && mode !== 'da-chon') throw new PhatError(400, 'Tham số "mode" phải là "hop-le" hoặc "da-chon"');
  let ids = null;
  if (mode === 'da-chon') {
    ids = body.ids;
    if (!Array.isArray(ids) || !ids.length || !ids.every((x) => Number.isInteger(x))) throw new PhatError(400, 'mode "da-chon" cần "ids": danh sách id dòng (số nguyên, không rỗng)');
    if (ids.length > C.GIOI_HAN.MAX_DONG) throw new PhatError(400, `Danh sách ids vượt giới hạn ${C.GIOI_HAN.MAX_DONG} dòng`);
  }

  const ketQua = db.transaction(() => {
    const truocHopLe = new Set(db.prepare("SELECT id FROM phat_draft_rows WHERE draft_id = ? AND ket_qua = 'HOP_LE'").all(draft.id).map((r) => r.id));
    kiemTraLai(db, draft, null); // trạng thái hiện có có thể đã đổi từ lúc kiểm
    const get = (idList) => db.prepare('SELECT * FROM phat_draft_rows WHERE draft_id = @d AND id IN (SELECT value FROM json_each(@j)) ORDER BY so_dong_goc, id')
      .all({ d: draft.id, j: JSON.stringify(idList) });
    const lyDo = (r) => (r.ket_qua === KET_QUA.DA_NHAP ? 'Dòng đã nhập ở đợt trước'
      : r.ket_qua === KET_QUA.BO_QUA_TRONG ? 'Dòng chưa có trạng thái' : (r.chi_tiet_loi || 'Dòng không còn hợp lệ'));
    const khongGhi = [];
    let ungVien;
    if (mode === 'hop-le') {
      ungVien = db.prepare("SELECT * FROM phat_draft_rows WHERE draft_id = ? AND ket_qua = 'HOP_LE' ORDER BY so_dong_goc, id").all(draft.id);
      const conHopLe = new Set(ungVien.map((r) => r.id));
      const hetHopLe = [...truocHopLe].filter((id) => !conHopLe.has(id));
      if (hetHopLe.length) for (const r of get(hetHopLe)) khongGhi.push({ id: r.id, so_dong_goc: r.so_dong_goc, shbg: r.shbg, ly_do: `Không còn hợp lệ tại thời điểm nhập: ${lyDo(r)}` });
    } else {
      const found = get(ids);
      const foundIds = new Set(found.map((r) => r.id));
      for (const id of new Set(ids)) if (!foundIds.has(id)) khongGhi.push({ id, so_dong_goc: null, shbg: null, ly_do: 'Không tìm thấy dòng trong bản kiểm tra' });
      ungVien = [];
      for (const r of found) {
        if (r.ket_qua === KET_QUA.HOP_LE) ungVien.push(r);
        else khongGhi.push({ id: r.id, so_dong_goc: r.so_dong_goc, shbg: r.shbg, ly_do: lyDo(r) });
      }
    }
    if (!ungVien.length) return { ghi: false, khongGhi };

    const nhapLuc = nowIso(); // giờ MÁY CHỦ; không đọc từ request
    const ngay = ngayLienQuan(db, draft.bcvh, ungVien.map((r) => r.shbg));
    const truoc = ngay.map((d) => tyLeNgay(db, draft.bcvh, d));

    const daoDong = db.prepare("SELECT COUNT(*) AS n FROM phat_draft_rows WHERE draft_id = ? AND ket_qua = ?");
    const soBoQua = daoDong.get(draft.id, KET_QUA.BO_QUA_TRONG).n;
    const soLoi = daoDong.get(draft.id, KET_QUA.LOI).n;
    const batchId = Number(db.prepare(`INSERT INTO phat_batches (bcvh, user_id, nhap_luc, ten_file, sha256, so_nhap, so_bo_qua, so_loi, draft_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(draft.bcvh, user.id, nhapLuc, draft.ten_file, draft.sha256, ungVien.length, soBoQua, soLoi, draft.id).lastInsertRowid);

    const cur = db.prepare('SELECT trang_thai FROM phat_status_current WHERE bcvh = ? AND shbg = ?');
    const up = db.prepare(`INSERT INTO phat_status_current (bcvh, shbg, trang_thai, ghi_chu, batch_id, nhap_luc) VALUES (@b, @s, @t, @g, @bt, @n)
      ON CONFLICT(bcvh, shbg) DO UPDATE SET trang_thai = excluded.trang_thai, ghi_chu = excluded.ghi_chu, batch_id = excluded.batch_id, nhap_luc = excluded.nhap_luc`);
    const his = db.prepare(`INSERT INTO phat_status_history (bcvh, shbg, trang_thai, trang_thai_truoc, ghi_chu, batch_id, nhap_luc) VALUES (@b, @s, @t, @tt, @g, @bt, @n)`);
    const mark = db.prepare("UPDATE phat_draft_rows SET ket_qua = 'DA_NHAP', ma_loi = NULL, chi_tiet_loi = NULL, canh_bao = NULL, batch_id = ? WHERE id = ?");
    for (const r of ungVien) {
      const prev = cur.get(draft.bcvh, r.shbg);
      const p = { b: draft.bcvh, s: r.shbg, t: r.trang_thai, g: r.ghi_chu || null, bt: batchId, n: nhapLuc };
      his.run({ ...p, tt: prev ? prev.trang_thai : null });
      up.run(p);
      mark.run(batchId, r.id);
    }
    const sau = ngay.map((d) => tyLeNgay(db, draft.bcvh, d));
    return { ghi: true, batchId, nhapLuc, soNhap: ungVien.length, khongGhi, truoc, sau };
  })();

  const th = tongHop(db, draft.id);
  if (!ketQua.ghi) {
    throw new PhatError(400, 'Không có dòng hợp lệ nào để nhập. Dòng lỗi và dòng trống được giữ lại trong bản kiểm tra.', { khong_ghi: ketQua.khongGhi.slice(0, 200), tong_hop: th });
  }
  return {
    batch_id: ketQua.batchId, nhap_luc: ketQua.nhapLuc, so_nhap: ketQua.soNhap,
    so_khong_ghi: ketQua.khongGhi.length, khong_ghi: ketQua.khongGhi.slice(0, 200),
    ty_le_truoc: ketQua.truoc, ty_le_sau: ketQua.sau, tong_hop: th
  };
}

module.exports = {
  PhatError, ensurePhatSchema, nowIso, purgeExpiredDrafts, normalizeKey, trangThaiTuChu, normShbg, normGhiChu, khungGio, laTrong, danhGia,
  kiemTraLai, taoBanKiemTra, layBanKiemTra, tongHop, dongRa, dsDong, suaDong, xoaDong, dienTrangThai, ganDanhSach, layDongLoi,
  demDongMau, layDongMau, tyLeNgay, ngayLienQuan, nhapDot
};
