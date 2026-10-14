// ==========================================
// Module «Xử lý và tỷ lệ phát» (PHAT-1, docs/ai/08_PHAT.md, 04_DECISIONS.md #75): file mẫu, bản kiểm tra, biên tập, nhập đợt,
// hoàn tác đợt, danh sách đợt, tỷ lệ.
// Quyền NHẬP (file mẫu, bản kiểm tra, commit): ADMIN, TTVH mọi BCVH; GDVH chỉ BCVH được gán trong user_bcvh (chưa gán -> 403); STAFF, TIVI -> 403
// (TIVI bị chặn bởi allowlist trong authRequired). Dùng đúng exp.allowedBcvhCodes của 3c-3.
// Bản kiểm tra thuộc NGƯỜI TẠO (PHAT-1b, #77): người tạo đọc / sửa / tải file lỗi / commit khi VẪN được nhập BCVH đó; ADMIN, TTVH chỉ XEM bản của
// người khác (GET draft, rows; 403 khi sửa / commit / tải file lỗi); người khác -> 404 (không lộ sự tồn tại). DELETE /drafts/:id (xoá cả bản): người tạo
// hoặc ADMIN, TTVH (mọi bản); không đụng đợt nhập, trạng thái, lịch sử, hoàn tác.
// Hoàn tác đợt: ADMIN, TTVH, hoặc chính người nhập (và vẫn được phép với BCVH đó). Danh sách đợt: chỉ đợt của BCVH mình được phép.
// Xem TỶ LỆ: ADMIN, TTVH, GDVH xem mọi BCVH (#72); STAFF, TIVI 403 (TIVI sẽ được cho phép ở PHAT-3).
// Mọi thao tác ghi vào nhật ký bảo mật; KHÔNG ghi nội dung dòng dữ liệu (SHBG, ghi chú).
// ==========================================
'use strict';
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../auth');
const { ROLES } = require('../roles');
const C = require('../config/phat');
const aq = require('../lib/arrivalsQuery');
const exp = require('../lib/arrivalsExport');
const P = require('../lib/phat');
const F = require('../lib/phatFile');
const { VALID_BCVH_CODES } = require('../lib/userBcvh');

const router = express.Router();
const { PhatError } = P;

// Xử lý lỗi chung: PhatError / QueryParamError -> JSON tiếng Việt; lỗi khác -> 500 không lộ chi tiết.
function wrap(fn, label) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PhatError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
      if (err instanceof aq.QueryParamError) return res.status(400).json({ error: err.message });
      console.error(`Phat ${label} error:`, err);
      return res.status(500).json({ error: 'Lỗi hệ thống khi xử lý kết quả phát' });
    }
  };
}

const nhapGuard = requireRoles(ROLES.ADMIN, ROLES.TTVH, ROLES.GDVH);
const xemGuard = requireRoles(ROLES.ADMIN, ROLES.TTVH, ROLES.GDVH); // xem tỷ lệ: mọi BCVH (#72), không theo BCVH được giao

const thieuQuyen = (req, hanhDong) => {
  const duoc = exp.allowedBcvhCodes(db, req.user);
  if (req.user.role === ROLES.GDVH && !duoc.length) {
    return new PhatError(403, `Tài khoản chưa được gán BCVH nào nên chưa ${hanhDong === 'xem' ? 'xem được danh sách đợt nhập' : 'nhập được kết quả phát'}. Liên hệ quản trị viên để được gán BCVH.`);
  }
  return new PhatError(403, hanhDong === 'xem' ? 'Bạn chỉ được xem các đợt nhập của BCVH được giao' : 'Bạn chỉ được nhập kết quả phát cho BCVH được giao');
};

/** BCVH phải thuộc 6 BCVH (400) và người gọi được nhập (hanhDong 'nhap') / xem đợt nhập ('xem') cho BCVH đó (403). */
function kiemTraBcvh(req, raw, hanhDong = 'nhap') {
  const bcvh = Array.isArray(raw) ? '' : String(raw ?? '').trim();
  if (!bcvh) throw new PhatError(400, 'Thiếu tham số "bcvh" (mã của một trong 6 BCVH)');
  if (!VALID_BCVH_CODES.includes(bcvh)) throw new PhatError(400, `Tham số "bcvh" phải là một trong: ${VALID_BCVH_CODES.join(', ')}`);
  if (!exp.allowedBcvhCodes(db, req.user).includes(bcvh)) throw thieuQuyen(req, hanhDong);
  return bcvh;
}

const laQuanLy = (user) => user.role === ROLES.ADMIN || user.role === ROLES.TTVH;
const KHONG_TIM_BAN = 'Không tìm thấy bản kiểm tra (có thể đã hết hạn sau 7 ngày). Hãy tải file lên lại.';

/**
 * Bản kiểm tra thuộc người tạo. chiXem: điểm cuối chỉ đọc (GET draft, rows) — ADMIN, TTVH được xem bản của người khác; xoa: DELETE bản — ADMIN, TTVH xoá được mọi bản.
 * Thứ tự: không có / không phải của mình (và không phải quản lý xem) -> 404; ADMIN, TTVH sửa bản người khác -> 403;
 * rồi quyền BCVH (người tạo bị bỏ gán BCVH -> 403, mất quyền ngay).
 */
function layDraft(req, { chiXem = false, xoa = false } = {}) {
  const d = P.layBanKiemTra(db, req.params.id);
  if (!d) throw new PhatError(404, KHONG_TIM_BAN);
  if (d.user_id !== req.user.id) {
    if (!laQuanLy(req.user)) throw new PhatError(404, KHONG_TIM_BAN);
    if (!chiXem && !xoa) throw new PhatError(403, 'Bản kiểm tra này của người khác: ADMIN, TTVH chỉ xem được, không sửa hay nhập thay');
  }
  kiemTraBcvh(req, d.bcvh);
  return d;
}

const audit = (req, event, extra) => req.app.locals.security.log({
  event, ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role, ...extra
});

const tenFileSach = (raw) => {
  const s = String(Array.isArray(raw) ? '' : raw ?? '').replace(/[\u0000-\u001f]/g, '').split(/[\\/]/).pop().trim();
  return s.slice(0, 120) || null;
};

// ------------------------------------------
// Việc 2 — file mẫu
// ------------------------------------------
router.get('/phat/template', authRequired, nhapGuard, wrap(async (req, res) => {
  for (const k of Object.keys(req.query)) if (!['bcvh', 'from', 'to', 'scope'].includes(k)) throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  const bcvh = kiemTraBcvh(req, req.query.bcvh);
  const scope = req.query.scope === undefined ? 'chua' : req.query.scope;
  if (scope !== 'chua' && scope !== 'tat-ca') throw new PhatError(400, 'Tham số "scope" phải là "chua" (chỉ SHBG chưa có trạng thái) hoặc "tat-ca"');
  for (const k of ['from', 'to']) {
    const v = req.query[k];
    if (typeof v !== 'string' || !aq.DATE_RE.test(v.trim())) throw new PhatError(400, `Tham số "${k}" bắt buộc, dạng YYYY-MM-DD`);
  }
  const f = aq.parseFilters({ from: req.query.from.trim(), to: req.query.to.trim(), receiver_code: bcvh }, { allowed: ['from', 'to', 'receiver_code'] });
  const arg = { bcvh, from: f.fromDate, to: f.toDate, scope };
  const tong = P.demDongMau(db, arg);
  if (tong > C.maxDong()) {
    throw new PhatError(400, `Khoảng ngày đã chọn có ${exp.formatCount(tong)} SHBG, vượt giới hạn ${exp.formatCount(C.maxDong())} dòng một file. Hãy thu hẹp khoảng ngày.`);
  }
  const buf = await F.taoFileMau({ ...arg, rows: P.layDongMau(db, arg) });
  audit(req, 'phat_template', { bcvh, from: f.fromDate, to: f.toDate, scope, rows: tong });
  res.status(200);
  res.setHeader('Content-Type', F.XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="PHAT_${bcvh}_${f.fromDate}_${f.toDate}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}, 'template'));

// ------------------------------------------
// Việc 3 — bản kiểm tra
// ------------------------------------------
// Nhận file thô (application/octet-stream), tối đa 10 MB; tên file ở query "ten_file". Lỗi kích thước -> JSON tiếng Việt.
const nhanFileTho = (req, res, next) => express.raw({ type: () => true, limit: C.GIOI_HAN.MAX_BYTES })(req, res, (err) => {
  if (!err) return next();
  if (err.type === 'entity.too.large') return res.status(413).json({ error: `File vượt quá giới hạn ${C.GIOI_HAN.MAX_BYTES / 1024 / 1024} MB` });
  return res.status(400).json({ error: 'Không đọc được nội dung file tải lên' });
});

const tomTat = (d, extra = {}) => ({
  id: d.id, bcvh: d.bcvh, ten_file: d.ten_file, tao_luc: d.tao_luc, het_han_luc: d.het_han_luc, ...extra
});

router.post('/phat/drafts', authRequired, nhapGuard, nhanFileTho, wrap(async (req, res) => {
  for (const k of Object.keys(req.query)) if (!['bcvh', 'ten_file'].includes(k)) throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  const bcvh = kiemTraBcvh(req, req.query.bcvh);
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    throw new PhatError(400, 'Chưa có nội dung file. Gửi file .xlsx hoặc .csv làm thân yêu cầu (Content-Type: application/octet-stream).');
  }
  const tenFile = tenFileSach(req.query.ten_file);
  const dong = await F.docFileKiemTra(req.body, tenFile, bcvh);
  if (!dong.length) throw new PhatError(400, 'File không có dòng dữ liệu nào.');
  const draft = P.taoBanKiemTra(db, {
    bcvh, userId: req.user.id, tenFile, sha256: crypto.createHash('sha256').update(req.body).digest('hex'), dong
  });
  const th = P.tongHop(db, draft.id);
  audit(req, 'phat_draft_create', { bcvh, draft_id: draft.id, ten_file: tenFile, sha256: draft.sha256, rows: dong.length, hop_le: th.hop_le, loi: th.loi });
  res.status(201).json(tomTat(draft, { tong_hop: th }));
}, 'draft-create'));

// PHAT-1b — danh sách bản kiểm tra CHƯA hết hạn của người gọi theo BCVH, mới nhất trước (không trả nội dung dòng).
// ADMIN, TTVH thêm tat_ca=1 để xem của mọi người. GDVH gửi tat_ca=1 -> 403.
router.get('/phat/drafts', authRequired, nhapGuard, wrap(async (req, res) => {
  for (const k of Object.keys(req.query)) if (!['bcvh', 'tat_ca'].includes(k)) throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  const bcvh = kiemTraBcvh(req, req.query.bcvh);
  const rawT = req.query.tat_ca;
  if (Array.isArray(rawT) || (rawT !== undefined && !['', '0', '1'].includes(String(rawT).trim()))) throw new PhatError(400, 'Tham số "tat_ca" chỉ nhận 1 (xem của mọi người) hoặc 0');
  const tatCa = rawT !== undefined && String(rawT).trim() === '1';
  if (tatCa && !laQuanLy(req.user)) throw new PhatError(403, 'Chỉ ADMIN, TTVH được xem bản kiểm tra của mọi người (tat_ca=1)');
  res.json({ items: P.dsBanKiemTra(db, { bcvh, user: req.user, tatCa }) });
}, 'draft-list'));

router.get('/phat/drafts/:id', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req, { chiXem: true });
  res.json(tomTat(d, { tong_hop: P.tongHop(db, d.id) }));
}, 'draft-get'));

router.delete('/phat/drafts/:id', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req, { xoa: true });
  const soDong = P.xoaBanKiemTra(db, d.id);
  audit(req, 'phat_draft_delete', { bcvh: d.bcvh, draft_id: d.id, rows: soDong, cua_nguoi_khac: d.user_id !== req.user.id });
  res.json({ id: d.id, da_xoa: true, so_dong: soDong });
}, 'draft-remove'));

router.get('/phat/drafts/:id/rows', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req, { chiXem: true });
  for (const k of Object.keys(req.query)) if (!['ket_qua', 'ma_loi', 'q', 'canh_bao', 'page', 'size'].includes(k)) throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  res.json(P.dsDong(db, d, req.query));
}, 'draft-rows'));

router.patch('/phat/drafts/:id/rows', authRequired, nhapGuard, express.json({ limit: '5mb' }), wrap(async (req, res) => {
  const d = layDraft(req);
  const kq = P.suaDong(db, d, (req.body || {}).rows);
  audit(req, 'phat_draft_edit', { bcvh: d.bcvh, draft_id: d.id, action: 'sua', rows: kq.da_sua });
  res.json(kq);
}, 'draft-patch'));

router.delete('/phat/drafts/:id/rows', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req);
  const kq = P.xoaDong(db, d, req.body);
  audit(req, 'phat_draft_edit', { bcvh: d.bcvh, draft_id: d.id, action: 'xoa', rows: kq.da_xoa });
  res.json(kq);
}, 'draft-delete'));

router.post('/phat/drafts/:id/fill', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req);
  const kq = P.dienTrangThai(db, d, req.body);
  audit(req, 'phat_draft_edit', { bcvh: d.bcvh, draft_id: d.id, action: 'dien', rows: kq.da_dien });
  res.json(kq);
}, 'draft-fill'));

router.post('/phat/drafts/:id/assign-list', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req);
  const kq = P.ganDanhSach(db, d, req.body);
  audit(req, 'phat_draft_edit', { bcvh: d.bcvh, draft_id: d.id, action: 'gan-nhanh', rows: kq.so_dong_khop });
  res.json(kq);
}, 'draft-assign'));

router.get('/phat/drafts/:id/errors.xlsx', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req);
  for (const k of Object.keys(req.query)) if (k !== 'loai_tru') throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  // loai_tru=KHONG_DOI (hoặc nhiều mã, cách nhau dấu phẩy): bỏ các dòng loại lỗi đó khỏi file (dòng «không đổi» không cần sửa gì).
  const raw = req.query.loai_tru;
  if (Array.isArray(raw)) throw new PhatError(400, 'Tham số "loai_tru" chỉ nhận 1 giá trị (nhiều mã cách nhau dấu phẩy)');
  const loaiTru = raw === undefined || raw === '' ? [] : String(raw).split(',').map((x) => x.trim()).filter(Boolean);
  const hopLe = Object.values(C.MA_LOI);
  const sai = loaiTru.find((m) => !hopLe.includes(m));
  if (sai) throw new PhatError(400, `Tham số "loai_tru" chứa mã không hợp lệ "${sai.slice(0, 40)}". Chỉ nhận: ${hopLe.join(', ')}`);
  const rows = P.layDongLoi(db, d, { loaiTru });
  const buf = await F.taoFileLoi({ bcvh: d.bcvh, rows });
  audit(req, 'phat_draft_errors', { bcvh: d.bcvh, draft_id: d.id, rows: rows.length, loai_tru: loaiTru.join(',') || null });
  res.status(200);
  res.setHeader('Content-Type', F.XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="PHAT_LOI_${d.bcvh}_${d.tao_luc.slice(0, 10)}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}, 'draft-errors'));

router.post('/phat/drafts/:id/commit', authRequired, nhapGuard, wrap(async (req, res) => {
  const d = layDraft(req);
  const kq = P.nhapDot(db, d, req.user, req.body);
  audit(req, 'phat_commit', { bcvh: d.bcvh, draft_id: d.id, batch_id: kq.batch_id, rows: kq.so_nhap, khong_ghi: kq.so_khong_ghi });
  res.json(kq);
}, 'draft-commit'));

// ------------------------------------------
// Việc 4, 5 — danh sách đợt nhập, hoàn tác
// ------------------------------------------
router.get('/phat/batches', authRequired, nhapGuard, wrap(async (req, res) => {
  for (const k of Object.keys(req.query)) if (!['bcvh', 'page', 'size'].includes(k)) throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  const duoc = exp.allowedBcvhCodes(db, req.user);
  const raw = Array.isArray(req.query.bcvh) ? '' : String(req.query.bcvh ?? '').trim();
  let codes;
  if (!raw || raw === 'all') {
    if (!duoc.length) throw thieuQuyen(req, 'xem');
    codes = duoc; // chỉ các BCVH mình được phép
  } else {
    codes = [kiemTraBcvh(req, raw, 'xem')];
  }
  const page = req.query.page === undefined || req.query.page === '' ? 1 : Number(req.query.page);
  const size = req.query.size === undefined || req.query.size === '' ? C.GIOI_HAN.TRANG_MAC_DINH : Number(req.query.size);
  if (!Number.isInteger(page) || page < 1) throw new PhatError(400, 'Tham số "page" phải là số nguyên ≥ 1');
  if (!Number.isInteger(size) || size < 1 || size > C.GIOI_HAN.TRANG_TOI_DA) throw new PhatError(400, `Tham số "size" phải là số nguyên 1..${C.GIOI_HAN.TRANG_TOI_DA}`);
  res.json(P.dsDot(db, { codes, page, size, user: req.user }));
}, 'batches'));

router.post('/phat/batches/:id/undo', authRequired, nhapGuard, wrap(async (req, res) => {
  const b = P.layDot(db, req.params.id);
  if (!b) throw new PhatError(404, 'Không tìm thấy đợt nhập');
  kiemTraBcvh(req, b.bcvh); // vẫn phải được phép với BCVH của đợt (GDVH bị bỏ gán thì không hoàn tác được)
  const quanLy = req.user.role === ROLES.ADMIN || req.user.role === ROLES.TTVH;
  if (!quanLy && b.user_id !== req.user.id) throw new PhatError(403, 'Chỉ ADMIN, TTVH hoặc chính người nhập đợt này mới được hoàn tác');
  const kq = P.hoanTacDot(db, b, req.user);
  audit(req, 'phat_undo', { bcvh: b.bcvh, batch_id: b.id, rows: kq.so_hoan_tac });
  res.json(kq);
}, 'undo'));

// ------------------------------------------
// Việc 6 — tỷ lệ
// ------------------------------------------
router.get('/phat/ty-le', authRequired, xemGuard, wrap(async (req, res) => {
  for (const k of Object.keys(req.query)) if (!['bcvh', 'ngay'].includes(k)) throw new PhatError(400, `Tham số không hỗ trợ: "${k}"`);
  const rawB = Array.isArray(req.query.bcvh) ? null : String(req.query.bcvh ?? 'all').trim() || 'all';
  if (rawB === null || (rawB !== 'all' && !VALID_BCVH_CODES.includes(rawB))) throw new PhatError(400, `Tham số "bcvh" phải là "all" hoặc một trong: ${VALID_BCVH_CODES.join(', ')}`);
  let ngay = null;
  if (req.query.ngay !== undefined && req.query.ngay !== '') {
    const v = Array.isArray(req.query.ngay) ? '' : String(req.query.ngay).trim();
    const m = aq.DATE_RE.exec(v);
    if (!m || !aq.validYmd(+m[1], +m[2], +m[3])) throw new PhatError(400, 'Tham số "ngay" phải là ngày hợp lệ dạng YYYY-MM-DD');
    ngay = v;
  }
  res.json(P.tyLeApi(db, { bcvh: rawB, ngay }));
}, 'ty-le'));

module.exports = router;
