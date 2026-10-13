// ==========================================
// Test: /api/arrivals/quality-mocs — tong_hop (du_trang_thai, co_xn_tui, co_xnd_bd10, khong_xnd_bd10, co_xn_bg) tính từ 7 tổ hợp mốc.
// (Tách ra từ tests/dashboard-api.test.js khi xoá API Dashboard SANLUONG-3e ở DASH-6b, #76; đây là phần bổ sung của 3b, không thuộc 3e.)
// Server thật trên DB tạm; dữ liệu là CSV GIẢ tự sinh trong thư mục tạm (không có số hiệu thật).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');

const PORT = 5913;
const USERS = {
  ttvh: { hrm: 'QM_TTVH', pass: 'Ttvh@123', role: 'TTVH' }
};
const tokens = {};
let ctx;
let workDir;

// 3 BCVH (mã cấu hình của hệ thống, không phải dữ liệu thật): A Thuận Hóa, B Hương Trà, D Thuận An.
const A = '533140'; const B = '535470'; const C = '536250'; const D = '537015';

// ------------------------------------------
// Sinh dữ liệu giả
// ------------------------------------------
let seq = 0;
const records = []; // bản ghi giả (để tính lại độc lập)
const pad = (n) => String(n).padStart(2, '0');
const parseTs = (s) => Date.parse(`${s.replace(' ', 'T')}Z`);
const fmtTs = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const addMin = (s, m) => fmtTs(parseTs(s) + m * 60000);
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`; // phút trong ngày -> HH:MM:00
const usTime = (s) => {
  if (!s) return '';
  const [d, t] = s.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi, se] = t.split(':').map(Number);
  return `${mo}/${da}/${y} ${((h + 11) % 12) + 1}:${pad(mi)}:${pad(se)} ${h >= 12 ? 'PM' : 'AM'}`;
};

/**
 * 1 dòng giả. hms = giờ XN túi (hoặc giờ XN bưu gửi nếu noBag). Mặc định: có XN túi + XN bưu gửi sau 5 phút.
 * o: noBag, noItem, gapMin, bd10 (true -> có XND BD10 cùng giờ), weight, route, service, ward, province, tracking, bd8, fileTime.
 */
function mk(day, recv, hms, o = {}) {
  seq++;
  const at = `${day} ${hms}`;
  const bag = o.noBag ? null : at;
  const item = o.noItem ? null : (o.noBag ? at : addMin(at, o.gapMin ?? 5));
  const bd10 = o.bd10 ? at : null;
  const rec = {
    day, recv, fileTime: o.fileTime || '163012', tracking: o.tracking || `ZZ3${String(seq).padStart(8, '0')}VN`, bag, item, bd10,
    bd8: o.bd8 || `T-${seq}`, weight: o.weight ?? 100, route: o.route ?? 'Đường thư giả', service: o.service || 'R',
    ward: o.ward ?? 'Phường An', province: o.province ?? 'Tỉnh Thử'
  };
  rec.arrival = [rec.bag, rec.item, rec.bd10].filter(Boolean).sort()[0];
  records.push(rec);
  return rec;
}

const SERVICE_NAME = { R: 'Bảo đảm giả', E: 'EMS giả', C: 'Bưu kiện giả' };
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
function writeFiles() {
  const byFile = new Map();
  for (const r of records) {
    const key = `${r.recv}|${r.day}|${r.fileTime}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(r);
  }
  const out = [];
  for (const [key, rows] of byFile) {
    const [recv, day, time] = key.split('|');
    const name = `HangDen_${recv}_${day.replace(/-/g, '')}_${time}.csv`;
    const lines = rows.map((r) => ({
      Ma_BC_dong: '990001', BC_nhan_BG: r.recv, Ten_duong_thu: r.route, SHBG: r.tracking, So_hieu_BD10: 'BD10-A',
      'Thời gian XN túi': usTime(r.bag), 'Thời gian XN BG': usTime(r.item), Ngay_gio_XND_BD10: usTime(r.bd10),
      Ngay_gio_XND_BD10_tai_TTKT: '', So_hieu_BD8: r.bd8, Khoi_luong_thuc_te: String(r.weight), Dich_vu_code: r.service,
      Ten_dich_vu: SERVICE_NAME[r.service] || '', Ghi_chu: 'Bộ;Giả (Túi)', Ten_Xa_Phuong: r.ward, Ten_Tinh_Thanh: r.province
    }));
    const file = path.join(workDir, name);
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(q).join(','), ...lines.map((l) => EXPECTED_HEADER.map((h) => q(l[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out;
}
// ---- Họ 1: ngày F1 = 2026-10-08 (thứ Năm); 4 ngày cùng thứ trước đó: 10-01, 09-24, 09-17, 09-10 ----
const F1 = '2026-10-08';
const WEEKS_F1 = ['2026-10-01', '2026-09-24', '2026-09-17', '2026-09-10'];
const ROUTE_PATTERN = [1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 0];
const routeOf = (i) => { const k = ROUTE_PATTERN[i % ROUTE_PATTERN.length]; return k ? `Đường thư giả ${k}` : ''; };
// n bưu gửi trước as_of (bước stepMin phút từ 06:00) + extra bưu gửi sau as_of (chiều 14:00).
function dayItems(day, recv, n, { step = 10, extra = 0, fileTime = '163012', offset = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(mk(day, recv, clock(360 + i * step), { fileTime, route: routeOf(i + offset), bd10: i % 5 === 0 }));
  for (let i = 0; i < extra; i++) out.push(mk(day, recv, clock(840 + i * 5), { fileTime, route: routeOf(i + offset) }));
  return out;
}

function buildFamily1() {
  // A: 4 tuần × (20 trước 10:00 + 7 sau), hôm qua 10 (gồm Yrep) + 3 sau, hôm nay 23 trước/đúng 10:00 + 4 sau.
  for (const w of WEEKS_F1) { dayItems(w, A, 20, { extra: 7 }); mk(w, A, '10:30:00'); } // 10:30 = sau as_of, trong giờ 10
  const yrep = mk('2026-10-07', A, '06:30:00', { tracking: 'ZZ3YREP0000VN' });
  dayItems('2026-10-07', A, 9, { step: 7, extra: 3, offset: 3 });
  dayItems(F1, A, 20, { fileTime: '100030' });
  mk(F1, A, '10:00:00', { fileTime: '100030' }); // đúng mốc as_of (gồm cả 2 đầu)
  mk(F1, A, '08:00:00', { fileTime: '100030', tracking: 'ZZ3DUP00000VN', bd8: 'T-DUP-1' }); // đến lại trong cùng ngày
  mk(F1, A, '09:00:00', { fileTime: '100030', tracking: 'ZZ3DUP00000VN', bd8: 'T-DUP-2' });
  mk(F1, A, '08:30:00', { fileTime: '100030', tracking: yrep.tracking, bd8: 'T-YREP-2' }); // đã đến hôm qua, đến lại hôm nay
  mk(F1, A, '10:00:01', { fileTime: '100030' }); // sau as_of 1 giây
  for (let i = 0; i < 3; i++) mk(F1, A, clock(660 + i * 5), { fileTime: '100030' });
  // B: chỉ có file của 10-01 và 09-17 (2 tuần cùng thứ); hôm nay 25 (= +25% so với 20), không có file hôm qua.
  for (const w of [WEEKS_F1[0], WEEKS_F1[2]]) dayItems(w, B, 20, { extra: 5 });
  dayItems(F1, B, 25, { step: 6, extra: 5, fileTime: '093012' });
  // C: chỉ có hôm nay (không có ngày cùng thứ nào).
  dayItems(F1, C, 10, { fileTime: '093012' });
  // D: 1 tuần (10-01) 20 bưu gửi; hôm nay 15 (= −25%).
  dayItems(WEEKS_F1[0], D, 20);
  dayItems(F1, D, 15, { fileTime: '090012' });
}

async function api(p, who) {
  const headers = {};
  if (who) headers.Authorization = `Bearer ${tokens[who]}`;
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers });
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}
const mgr = async (p) => { const r = await api(p, 'ttvh'); assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; };

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-quality-mocs-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-quality-mocs-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES ('po1', '533140', 'BCVH Thuận Hóa (tên trong danh mục)', 'PH1', 'c1', 'Phường An');
  `);
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    const r = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hrm_code: u.hrm, password: u.pass })
    });
    tokens[k] = (await r.json()).token;
  }
  buildFamily1();
  for (const file of writeFiles()) {
    const r = await importArrivalFile(ctx.db, file);
    assert.equal(r.status, 'OK', `${path.basename(file)}: ${JSON.stringify(r)}`);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});


test('/quality-mocs: tong_hop (du_trang_thai, co_xn_tui, co_xnd_bd10, khong_xnd_bd10, co_xn_bg) tính từ 7 tổ hợp, mẫu số = sản lượng', async () => {
  const m = await mgr('/api/arrivals/quality-mocs?from=2026-10-01&to=2026-10-08');
  const by = Object.fromEntries(m.to_hop.map((c) => [c.key, c.so_buu_gui]));
  const th = m.tong_hop;
  assert.equal(th.du_trang_thai.so_buu_gui, by['111']);
  assert.equal(th.co_xn_tui.so_buu_gui, by['111'] + by['110'] + by['101'] + by['100']);
  assert.equal(th.co_xnd_bd10.so_buu_gui, by['111'] + by['110'] + by['011'] + by['010']);
  assert.equal(th.co_xn_bg.so_buu_gui, by['111'] + by['101'] + by['011'] + by['001']);
  assert.equal(th.khong_xnd_bd10.so_buu_gui, by['101'] + by['100'] + by['001']);
  assert.equal(th.co_xnd_bd10.so_buu_gui + th.khong_xnd_bd10.so_buu_gui, m.san_luong);
  const FIVE = ['du_trang_thai', 'co_xn_tui', 'co_xnd_bd10', 'khong_xnd_bd10', 'co_xn_bg'];
  for (const k of FIVE) assert.equal(th[k].ty_le, Math.round((th[k].so_buu_gui / m.san_luong) * 10000) / 100, k);
  assert.ok(th.du_trang_thai.so_buu_gui > 0, 'dữ liệu giả có bưu gửi đủ 3 mốc? (túi + BD10 + bưu gửi)');
  // Khoảng rỗng: mọi số 0, không chia cho 0.
  const empty = (await mgr('/api/arrivals/quality-mocs?from=2025-01-01&to=2025-01-02')).tong_hop;
  assert.deepEqual(FIVE.map((k) => [empty[k].so_buu_gui, empty[k].ty_le]), Array(5).fill([0, 0]));
});
