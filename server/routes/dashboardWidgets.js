const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authRequired, requireAdmin } = require('../auth');
const { SIZES, validateChartConfig, computeWidgetData, buildMeta } = require('../lib/dashboardSources');
const { resetDefaultWidgets } = require('../lib/dashboardDefaults');

const router = express.Router();

// ==========================================
// DASHBOARD ĐỘNG — cấu hình ô (widget). Lưu trong DB, áp dụng cho mọi người dùng.
// Đọc: mọi người dùng đã đăng nhập. Ghi + meta: chỉ ADMIN (requireAdmin).
// Tên route tĩnh (widgets-meta/-data/-order/-reset) khác hẳn /widgets/:id nên không xung đột.
// ==========================================

const MAX_WIDGETS = 30;
const CHART_EDITABLE = ['title', 'source', 'group_by', 'chart_type', 'top_n', 'filters', 'size'];

function parseFilters(s) {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
  }
}

function toApi(r) {
  return {
    id: r.id,
    kind: r.kind,
    system_key: r.system_key,
    title: r.title,
    source: r.source,
    group_by: r.group_by,
    chart_type: r.chart_type,
    top_n: r.top_n,
    filters: parseFilters(r.filters),
    size: r.size,
    position: r.position,
    visible: !!r.visible,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

const getRow = (id) => db.prepare('SELECT * FROM dashboard_widgets WHERE id = ?').get(id);
const listAll = () => db.prepare('SELECT * FROM dashboard_widgets ORDER BY position, created_at').all().map(toApi);

function sendError(res, error, label) {
  // Không để SQL/stack trace lọt ra response.
  console.error(label, error);
  return res.status(500).json({ error: 'Lỗi hệ thống khi xử lý cấu hình Dashboard' });
}

const bad = (res, msg) => res.status(400).json({ error: msg });
const isVisibleValue = (v) => typeof v === 'boolean' || v === 0 || v === 1;

// GET /api/dashboard/widgets — mọi người dùng; STAFF/MANAGER chỉ thấy ô visible=1, ADMIN thấy tất cả.
router.get('/dashboard/widgets', authRequired, (req, res) => {
  try {
    const rows = req.user.role === 'ADMIN'
      ? db.prepare('SELECT * FROM dashboard_widgets ORDER BY position, created_at').all()
      : db.prepare('SELECT * FROM dashboard_widgets WHERE visible = 1 ORDER BY position, created_at').all();
    res.json({ items: rows.map(toApi) });
  } catch (error) {
    sendError(res, error, 'Dashboard widgets list error:');
  }
});

// GET /api/dashboard/widgets-data — dữ liệu MỌI ô CHART đang hiển thị, 1 lần. Lỗi 1 ô không hỏng cả response.
// ?include_hidden=1: CHỈ ADMIN mới tính cả ô CHART đang ẩn (chế độ chỉnh sửa); người khác bị bỏ qua tham số.
router.get('/dashboard/widgets-data', authRequired, (req, res) => {
  try {
    const includeHidden = req.query.include_hidden === '1' && req.user.role === 'ADMIN';
    const rows = db.prepare(
      `SELECT * FROM dashboard_widgets WHERE kind = 'CHART'${includeHidden ? '' : ' AND visible = 1'} ORDER BY position`
    ).all();
    const out = {};
    for (const r of rows) {
      try {
        out[r.id] = computeWidgetData(db, { ...r, filters: parseFilters(r.filters) });
      } catch (e) {
        console.error(`Dashboard widget ${r.id} data error:`, e);
        out[r.id] = { error: 'Không tính được dữ liệu của ô này' };
      }
    }
    res.json(out);
  } catch (error) {
    sendError(res, error, 'Dashboard widgets-data error:');
  }
});

// GET /api/dashboard/widgets-meta — ADMIN: whitelist cho giao diện chỉnh sửa.
router.get('/dashboard/widgets-meta', authRequired, requireAdmin, (req, res) => {
  try {
    res.json(buildMeta(db));
  } catch (error) {
    sendError(res, error, 'Dashboard widgets-meta error:');
  }
});

// POST /api/dashboard/widgets-preview — ADMIN: xem trước cấu hình ô CHART CHƯA lưu (cùng validate + cách tính
// với POST /widgets và widgets-data). KHÔNG ghi DB. Trả { data: { total, items, other? } }.
router.post('/dashboard/widgets-preview', authRequired, requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b !== 'object' || Array.isArray(b)) return bad(res, 'Dữ liệu gửi lên không hợp lệ');
    const v = validateChartConfig(b);
    if (v.error) return bad(res, v.error);
    res.json({ data: computeWidgetData(db, v.value) });
  } catch (error) {
    sendError(res, error, 'Dashboard widgets-preview error:');
  }
});

// PUT /api/dashboard/widgets-order  { ids: [...] } — phải đủ và đúng tập id hiện có.
router.put('/dashboard/widgets-order', authRequired, requireAdmin, (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) return bad(res, 'ids phải là mảng id (chuỗi)');
    const current = db.prepare('SELECT id FROM dashboard_widgets').all().map((r) => r.id);
    const sameSet = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
    if (!sameSet) return bad(res, 'ids phải gồm đúng và đủ tất cả ô hiện có, không trùng lặp');

    const upd = db.prepare('UPDATE dashboard_widgets SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    db.transaction(() => { ids.forEach((id, i) => upd.run(i + 1, id)); })();
    res.json({ message: 'Đã cập nhật thứ tự các ô', items: listAll() });
  } catch (error) {
    sendError(res, error, 'Dashboard widgets-order error:');
  }
});

// POST /api/dashboard/widgets-reset — xoá cấu hình + seed lại mặc định (1 transaction).
router.post('/dashboard/widgets-reset', authRequired, requireAdmin, (req, res) => {
  try {
    resetDefaultWidgets(db);
    res.json({ message: 'Đã khôi phục Dashboard mặc định', items: listAll() });
  } catch (error) {
    sendError(res, error, 'Dashboard widgets-reset error:');
  }
});

// POST /api/dashboard/widgets — tạo ô CHART (tối đa 30 ô, position cuối cùng).
router.post('/dashboard/widgets', authRequired, requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b !== 'object' || Array.isArray(b)) return bad(res, 'Dữ liệu gửi lên không hợp lệ');
    const v = validateChartConfig(b);
    if (v.error) return bad(res, v.error);
    if (b.visible !== undefined && !isVisibleValue(b.visible)) return bad(res, 'visible phải là true/false');

    const total = db.prepare('SELECT COUNT(*) AS n FROM dashboard_widgets').get().n;
    if (total >= MAX_WIDGETS) return bad(res, `Đã đạt tối đa ${MAX_WIDGETS} ô trên Dashboard, hãy xoá bớt trước khi thêm`);

    const c = v.value;
    const id = crypto.randomUUID();
    const pos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM dashboard_widgets').get().m + 1;
    db.prepare(`
      INSERT INTO dashboard_widgets (id, kind, system_key, title, source, group_by, chart_type, top_n, filters, size, position, visible)
      VALUES (?, 'CHART', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, c.title, c.source, c.group_by, c.chart_type, c.top_n, JSON.stringify(c.filters), c.size, pos,
      b.visible === false || b.visible === 0 ? 0 : 1);
    res.status(201).json({ message: 'Đã thêm ô vào Dashboard', item: toApi(getRow(id)) });
  } catch (error) {
    sendError(res, error, 'Dashboard widget create error:');
  }
});

// PUT /api/dashboard/widgets/:id
//  - CHART: sửa mọi trường cấu hình (validate lại toàn bộ sau khi gộp).
//  - SYSTEM: CHỈ title, size, visible. Các key khác (source, group_by, position...) bị BỎ QUA im lặng
//    (không đổi) để giao diện có thể gửi nguyên đối tượng ô mà không bị lỗi.
router.put('/dashboard/widgets/:id', authRequired, requireAdmin, (req, res) => {
  try {
    const existing = getRow(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy ô' });
    const b = req.body || {};
    if (typeof b !== 'object' || Array.isArray(b)) return bad(res, 'Dữ liệu gửi lên không hợp lệ');
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    if (has('visible') && !isVisibleValue(b.visible)) return bad(res, 'visible phải là true/false');

    const visible = has('visible') ? (b.visible === true || b.visible === 1 ? 1 : 0) : existing.visible;

    if (existing.kind === 'SYSTEM') {
      let title = existing.title;
      let size = existing.size;
      if (has('title')) {
        title = typeof b.title === 'string' ? b.title.trim() : '';
        if (!title) return bad(res, 'Tiêu đề (title) không được để trống');
        if (title.length > 80) return bad(res, 'Tiêu đề (title) tối đa 80 ký tự');
      }
      if (has('size')) {
        if (!SIZES.includes(b.size)) return bad(res, `Kích cỡ (size) không hợp lệ. Chọn một trong: ${SIZES.join(', ')}`);
        size = b.size;
      }
      db.prepare('UPDATE dashboard_widgets SET title = ?, size = ?, visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(title, size, visible, existing.id);
      return res.json({ message: 'Đã cập nhật ô', item: toApi(getRow(existing.id)) });
    }

    const merged = { ...toApi(existing) };
    CHART_EDITABLE.forEach((k) => { if (has(k)) merged[k] = b[k]; });
    // Đổi nguồn mà không gửi group_by/filters mới -> giá trị cũ thuộc nguồn khác sẽ bị validate từ chối (an toàn).
    const v = validateChartConfig(merged);
    if (v.error) return bad(res, v.error);
    const c = v.value;
    db.prepare(`
      UPDATE dashboard_widgets SET title = ?, source = ?, group_by = ?, chart_type = ?, top_n = ?, filters = ?,
        size = ?, visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(c.title, c.source, c.group_by, c.chart_type, c.top_n, JSON.stringify(c.filters), c.size, visible, existing.id);
    res.json({ message: 'Đã cập nhật ô', item: toApi(getRow(existing.id)) });
  } catch (error) {
    sendError(res, error, 'Dashboard widget update error:');
  }
});

// DELETE /api/dashboard/widgets/:id — chỉ ô CHART (ô SYSTEM chỉ ẩn được).
router.delete('/dashboard/widgets/:id', authRequired, requireAdmin, (req, res) => {
  try {
    const existing = getRow(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy ô' });
    if (existing.kind === 'SYSTEM') return bad(res, 'Không xoá được ô hệ thống, chỉ có thể ẩn (visible = false)');
    db.prepare('DELETE FROM dashboard_widgets WHERE id = ?').run(existing.id);
    res.json({ message: 'Đã xoá ô khỏi Dashboard' });
  } catch (error) {
    sendError(res, error, 'Dashboard widget delete error:');
  }
});

module.exports = router;
