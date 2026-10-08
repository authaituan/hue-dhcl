// ==========================================
// Dashboard động — DANH SÁCH TRẮNG (whitelist) nguồn dữ liệu / trường nhóm / bộ lọc.
// Người dùng chỉ được gửi lên KHÓA trong bảng này; biểu thức SQL là hằng số viết sẵn ở
// đây, KHÔNG BAO GIỜ nối chuỗi từ input. Giá trị lọc luôn đi qua tham số `?`.
// v1 chỉ có số liệu đếm (COUNT).
// ==========================================
'use strict';

const UNKNOWN = 'Chưa xác định';

const CHART_TYPES = ['BAR', 'BAR_H', 'DONUT', 'LINE', 'LIST', 'TABLE', 'NUMBER'];
const SIZES = ['S', 'M', 'L', 'XL', 'FULL'];

// Giá trị rỗng/NULL ở trường nhóm hiển thị thành "Chưa xác định".
const norm = (expr) => `COALESCE(NULLIF(TRIM(CAST(${expr} AS TEXT)), ''), '${UNKNOWN}')`;

// ------------------------------------------
// Filter types: validate giá trị người dùng + sinh mệnh đề WHERE (tham số hoá).
// ------------------------------------------
function enumArrayFilter(label, allowed, sqlCol) {
  return {
    label, type: 'multi', options: allowed,
    validate(v) {
      if (!Array.isArray(v) || v.length > 50 || v.some((x) => typeof x !== 'string' || !allowed.includes(x))) {
        return `phải là mảng giá trị thuộc: ${allowed.join(', ')}`;
      }
      return null;
    },
    build(v) { return { sql: `${sqlCol} IN (${v.map(() => '?').join(',')})`, params: v }; }
  };
}

function idArrayFilter(label, sqlCol) {
  return {
    label, type: 'ids',
    validate(v) {
      if (!Array.isArray(v) || v.length > 100 || v.some((x) => typeof x !== 'string' || !x || x.length > 64)) {
        return 'phải là mảng mã (id) dạng chuỗi, tối đa 100 phần tử';
      }
      return null;
    },
    build(v) { return { sql: `${sqlCol} IN (${v.map(() => '?').join(',')})`, params: v }; }
  };
}

// ------------------------------------------
// Nguồn dữ liệu
// ------------------------------------------
const SOURCES = {
  POST_OFFICE: {
    label: 'Bưu cục / điểm phục vụ',
    from: `FROM post_offices p
      LEFT JOIN commune_post_offices c ON c.id = p.commune_id`,
    baseWhere: '1=1',
    fields: {
      type: { label: 'Loại hình', expr: () => norm('p.type') },
      operational_status: {
        label: 'Tình trạng',
        expr: () => norm(`CASE p.operational_status WHEN 'ACTIVE' THEN 'Hoạt động' WHEN 'INACTIVE' THEN 'Ngừng hoạt động' ELSE p.operational_status END`)
      },
      commune: { label: 'BĐX', expr: () => norm('c.name') },
      new_ward: { label: 'Phường/Xã mới', expr: () => norm('p.new_ward_name') },
      has_computer: { label: 'Có / không có máy', expr: () => `CASE WHEN p.has_computer = 0 THEN 'Không có máy' ELSE 'Có máy' END` },
      has_coordinates: {
        label: 'Có / chưa có tọa độ',
        expr: () => `CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN 'Có tọa độ' ELSE 'Chưa có tọa độ' END`
      }
    },
    filters: {
      commune_id: idArrayFilter('BĐX', 'p.commune_id'),
      operational_status: enumArrayFilter('Tình trạng', ['ACTIVE', 'INACTIVE'], 'p.operational_status')
    }
  }
};

// ------------------------------------------
// Loại biểu đồ hợp lệ theo trường
// ------------------------------------------
function chartTypesFor(field) {
  return CHART_TYPES.filter((t) => t !== 'NUMBER' && (t !== 'LINE' || field.ordered));
}

// ------------------------------------------
// Validate cấu hình ô CHART (đã gộp). Trả { error } hoặc { value } chuẩn hoá.
// ------------------------------------------
function validateChartConfig(cfg) {
  const title = typeof cfg.title === 'string' ? cfg.title.trim() : '';
  if (!title) return { error: 'Tiêu đề (title) không được để trống' };
  if (title.length > 80) return { error: 'Tiêu đề (title) tối đa 80 ký tự' };

  if (typeof cfg.source !== 'string' || !Object.prototype.hasOwnProperty.call(SOURCES, cfg.source)) {
    return { error: `Nguồn dữ liệu (source) không hợp lệ. Chọn một trong: ${Object.keys(SOURCES).join(', ')}` };
  }
  const src = SOURCES[cfg.source];

  let groupBy = cfg.group_by;
  if (groupBy === undefined || groupBy === '') groupBy = null;
  if (groupBy !== null && (typeof groupBy !== 'string' || !Object.prototype.hasOwnProperty.call(src.fields, groupBy))) {
    return { error: `Trường nhóm theo (group_by) không hợp lệ cho nguồn ${cfg.source}. Chọn một trong: ${Object.keys(src.fields).join(', ')}` };
  }

  if (typeof cfg.chart_type !== 'string' || !CHART_TYPES.includes(cfg.chart_type)) {
    return { error: `Loại biểu đồ (chart_type) không hợp lệ. Chọn một trong: ${CHART_TYPES.join(', ')}` };
  }
  if (cfg.chart_type === 'NUMBER') {
    if (groupBy !== null) return { error: 'Loại NUMBER phải để trống group_by (chỉ hiển thị một con số tổng)' };
  } else {
    if (groupBy === null) return { error: `Loại ${cfg.chart_type} bắt buộc phải có trường nhóm theo (group_by)` };
    if (cfg.chart_type === 'LINE' && !src.fields[groupBy].ordered) {
      return { error: 'Biểu đồ LINE chỉ dùng cho trường có thứ tự' };
    }
  }

  let topN = cfg.top_n;
  if (topN === undefined || topN === null || topN === '') topN = 10;
  if (!Number.isInteger(topN) || topN < 3 || topN > 30) return { error: 'top_n phải là số nguyên từ 3 đến 30' };

  const size = cfg.size === undefined || cfg.size === null ? 'M' : cfg.size;
  if (!SIZES.includes(size)) return { error: `Kích cỡ (size) không hợp lệ. Chọn một trong: ${SIZES.join(', ')}` };

  const filtersIn = cfg.filters === undefined || cfg.filters === null ? {} : cfg.filters;
  if (typeof filtersIn !== 'object' || Array.isArray(filtersIn)) return { error: 'filters phải là một đối tượng (object)' };
  const filters = {};
  for (const [k, v] of Object.entries(filtersIn)) {
    if (!Object.prototype.hasOwnProperty.call(src.filters, k)) {
      return { error: `Bộ lọc "${k}" không hợp lệ cho nguồn ${cfg.source}. Chọn trong: ${Object.keys(src.filters).join(', ')}` };
    }
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue; // bỏ bộ lọc rỗng
    const err = src.filters[k].validate(v);
    if (err) return { error: `Bộ lọc "${k}" ${err}` };
    filters[k] = v;
  }

  return { value: { title, source: cfg.source, group_by: groupBy, chart_type: cfg.chart_type, top_n: topN, filters, size } };
}

// ------------------------------------------
// Tính dữ liệu 1 ô CHART -> { total, items:[{label,count}], other? }
// ------------------------------------------
function computeWidgetData(db, w) {
  const src = SOURCES[w.source];
  if (!src) throw new Error('Nguồn dữ liệu không hợp lệ');
  const filters = w.filters || {};

  const where = [src.baseWhere];
  const params = [];
  for (const [k, v] of Object.entries(filters)) {
    const f = src.filters[k];
    if (!f) throw new Error(`Bộ lọc "${k}" không hợp lệ`);
    const b = f.build(v);
    where.push(b.sql);
    params.push(...b.params);
  }
  const whereSql = where.join(' AND ');

  if (!w.group_by) {
    const total = db.prepare(`SELECT COUNT(*) AS n ${src.from} WHERE ${whereSql}`).get(...params).n;
    return { total, items: [] };
  }

  const field = src.fields[w.group_by];
  if (!field) throw new Error('Trường nhóm theo không hợp lệ');
  const rows = db.prepare(`
    SELECT label, COUNT(*) AS count FROM (SELECT ${field.expr()} AS label ${src.from} WHERE ${whereSql}) GROUP BY label
  `).all(...params);

  const total = rows.reduce((s, r) => s + r.count, 0);
  const isLine = w.chart_type === 'LINE';

  if (field.ordered && (isLine)) {
    // Thứ tự tự nhiên; "Chưa xác định" luôn cuối.
    const rank = (l) => (field.order ? field.order.indexOf(l) : -1);
    rows.sort((a, b) => {
      if (a.label === UNKNOWN) return 1;
      if (b.label === UNKNOWN) return -1;
      if (field.order) return rank(a.label) - rank(b.label);
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    return { total, items: rows.map((r) => ({ label: r.label, count: r.count })) };
  }

  rows.sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const topN = w.top_n || 10;
  const items = rows.slice(0, topN).map((r) => ({ label: r.label, count: r.count }));
  const otherCount = rows.slice(topN).reduce((s, r) => s + r.count, 0);
  const out = { total, items };
  if (otherCount > 0) out.other = otherCount;
  return out;
}

// ------------------------------------------
// Meta cho giao diện chỉnh sửa (ADMIN)
// ------------------------------------------
function buildMeta(db) {
  const communes = db.prepare('SELECT id, name FROM commune_post_offices ORDER BY name').all();
  const optionsFor = {
    'POST_OFFICE.commune_id': communes.map((c) => ({ value: c.id, label: c.name })),
    'POST_OFFICE.operational_status': [{ value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Ngừng hoạt động' }]
  };

  const sources = Object.entries(SOURCES).map(([key, s]) => ({
    key,
    label: s.label,
    fields: Object.entries(s.fields).map(([fk, f]) => ({
      key: fk, label: f.label, ordered: !!f.ordered, chartTypes: chartTypesFor(f)
    })),
    filters: Object.entries(s.filters).map(([fk, f]) => ({
      key: fk, label: f.label, type: f.type, options: optionsFor[`${key}.${fk}`] || null
    }))
  }));
  return { sources, chartTypes: CHART_TYPES, sizes: SIZES, topN: { min: 3, max: 30, default: 10 }, maxWidgets: 30 };
}

module.exports = { SOURCES, CHART_TYPES, SIZES, UNKNOWN, validateChartConfig, computeWidgetData, buildMeta };
