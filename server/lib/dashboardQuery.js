// ==========================================
// Danh mục 6 BCVH của Trung tâm cho các màn Dashboard (docs/ai/04_DECISIONS.md #41).
// Từ DASH-6b (#76) file này CHỈ còn danh mục + tên BCVH: API Dashboard cũ của SANLUONG-3e (overview, trend, wards-surge, center)
// đã xoá vì giao diện không còn gọi. Dashboard hiện hành: server/lib/dashboardDenQuery.js.
// ==========================================
'use strict';

// 6 BCVH của Trung tâm (PO 08–09/10/2026, #41). Tên lấy từ post_offices theo mã nếu khớp; không khớp dùng tên dưới đây.
const DASHBOARD_BCVH = Object.freeze([
  Object.freeze({ ma: '533140', ten: 'BCVH Thuận Hóa' }),
  Object.freeze({ ma: '535470', ten: 'BCVH Hương Trà' }),
  Object.freeze({ ma: '536250', ten: 'BCVH Hương Thủy' }),
  Object.freeze({ ma: '537015', ten: 'BCVH Thuận An' }),
  Object.freeze({ ma: '537220', ten: 'BCVH Phú Lộc' }),
  Object.freeze({ ma: '535790', ten: 'BCVH A Lưới' })
]);
const codesJson = JSON.stringify(DASHBOARD_BCVH.map((b) => b.ma));

// Tên BCVH: post_offices theo mã nếu khớp, không thì tên cấu hình.
function bcvhNames(db) {
  const rows = db.prepare('SELECT code, name FROM post_offices WHERE code IN (SELECT value FROM json_each(@codes))').all({ codes: codesJson });
  const map = new Map();
  for (const r of rows) if (r.name && !map.has(r.code)) map.set(r.code, r.name);
  return new Map(DASHBOARD_BCVH.map((b) => [b.ma, map.get(b.ma) || b.ten]));
}

module.exports = { DASHBOARD_BCVH, bcvhNames };
