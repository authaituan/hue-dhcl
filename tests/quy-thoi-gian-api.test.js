// ==========================================
// Test QUYTG-5: API «Quỹ thời gian» (/api/arrivals/quy-thoi-gian/tong-hop, /luot) + cache (server/lib/quyThoiGianCache.js).
// Server thật trên DB tạm (serverHarness); dữ liệu GIẢ (BCVH 539999 / 538888, SHBG và BD10 giả). Chỉ đọc.
// Đo bộ nhớ / thời gian ở quy mô ~116.000 SHBG: chỉ khi QTG_PERF=1 (nên chạy với node --expose-gc để số bộ nhớ ổn định).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { deriveArrival, ensureArrivalSchema } = require('../server/lib/arrivalsImport');
const QQ = require('../server/lib/quyThoiGianQuery');
const CACHE = require('../server/lib/quyThoiGianCache');
const PD = require('../server/lib/phatDashboard');

const PORT = 5990;
const BC = '539999';
const BC2 = '538888';
const USERS = {
  admin: { hrm: 'QA_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'QA_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'QA_GDVH', pass: 'Gdvh@123', role: 'GDVH' }, // KHÔNG được gán BCVH nào (#72: vẫn xem đủ)
  tivi: { hrm: 'QA_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
let ctx;
let idDong = 0;

const KTT_B = (n) => `530100${BC}6102${n}`;
const KHAC_B = (n) => `531120${BC}6102${n}`;
const NGOAI_B = (n) => `700916${BC}6102${n}`;
const insSql = `INSERT INTO arrival_items (id, import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
  bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
  VALUES (@id, 1, @recv, @trk, @bd10, '', @bag, @item, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @arrival_evidence_count, @bag_date, @bd10_date, @item_date)`;
function them(stmt, o) {
  const it = deriveArrival({ bag_confirmed_at: o.bag ?? null, item_confirmed_at: o.item ?? null, bd10_confirmed_at: o.xnd ?? null });
  stmt.run({
    id: ++idDong, recv: o.recv ?? BC, trk: o.trk, bd10: o.bd10 ?? '', bag: o.bag ?? null, item: o.item ?? null, xnd: o.xnd ?? null, ktt: o.ktt ?? null,
    arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis, arrival_date: it.arrival_date, arrival_evidence_count: it.arrival_evidence_count,
    bag_date: o.bag ? o.bag.slice(0, 10) : null, bd10_date: o.xnd ? o.xnd.slice(0, 10) : null, item_date: o.item ? o.item.slice(0, 10) : null
  });
}

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-quy-thoi-gian-api-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  ctx.db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,?,?,?,?,1,'x','OK')")
    .run(BC, 'HangDen_539999_20261021_093012.csv', '2026-10-21', '093012');
  const st = ctx.db.prepare(insSql);
  const T = (o) => them(st, o);
  T({ trk: 'QT0001VN', bd10: KTT_B(11), bag: '2026-10-21 07:40:00', xnd: '2026-10-21 07:45:14', ktt: '2026-10-20 15:25:00' });
  T({ trk: 'QT0002VN', bd10: KTT_B(12), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 11:00:00' });
  T({ trk: 'QT0003VN', bd10: KTT_B(13), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' });
  T({ trk: 'QT0004VN', bd10: KHAC_B(14), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' });
  T({ trk: 'QT0005VN', bd10: NGOAI_B(15), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00' });
  T({ trk: 'QT0006VN', bd10: KTT_B(16), bag: '2026-10-21 09:00:00', ktt: '2026-10-21 06:00:00' });
  T({ trk: 'QT0007VN', bd10: `${BC}530100610203`, bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 06:00:00' });
  T({ trk: 'QT0008VN', bd10: '', bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 06:00:00' });
  T({ trk: 'QT0009VN', bd10: '53012', bag: '2026-10-21 09:00:00', xnd: '2026-10-21 09:30:00', ktt: '2026-10-21 06:00:00' });
  T({ trk: 'QT0010VN', bd10: KTT_B(20), bag: '2026-10-21 07:50:00', xnd: '2026-10-21 08:00:00', ktt: '2026-10-10 08:00:00' }); // nghi ngờ
  T({ trk: 'QT0011VN', bd10: KHAC_B(21), bag: '2026-10-21 09:00:00', xnd: '2026-10-21 10:00:00', ktt: '2026-10-21 06:00:00' });
  T({ trk: 'QT0011VN', bd10: NGOAI_B(22), bag: '2026-10-21 07:30:00', xnd: '2026-10-21 08:00:00', ktt: '2026-10-20 23:00:00' });
  T({ trk: 'QT0011VN', bd10: KTT_B(23), bag: '2026-10-21 07:00:00', ktt: '2026-10-19 08:00:00' });
  T({ trk: 'QT0015VN', recv: BC2, bd10: `530100${BC2}610221`, bag: '2026-10-21 08:00:00', xnd: '2026-10-21 09:00:00', ktt: '2026-10-21 07:00:00' });
  T({ trk: 'QT0016VN', recv: BC2, bd10: `531120${BC2}610222`, bag: '2026-10-21 08:00:00', xnd: '2026-10-21 09:00:00' });
  themDuLieuTheoNgay();
  CACHE.xoaCache();
});
after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

const DAY = 'from=2026-10-21&to=2026-10-21';
const TH = '/api/arrivals/quy-thoi-gian/tong-hop';
const LUOT = '/api/arrivals/quy-thoi-gian/luot';
async function api(p, who) {
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}
const json = (x) => JSON.parse(JSON.stringify(x));

test('quyền: không token 401; ADMIN / TTVH / GDVH (chưa gán BCVH) 200; TIVI 403', async () => {
  for (const p of [TH, LUOT]) {
    assert.equal((await api(`${p}?${DAY}`)).status, 401, p);
    for (const who of ['admin', 'ttvh', 'gdvh']) {
      const r = await api(`${p}?${DAY}`, who);
      assert.equal(r.status, 200, `${who} ${p}`);
      assert.ok(r.body.meta, `${who} ${p} có meta`);
    }
    assert.equal((await api(`${p}?${DAY}`, 'tivi')).status, 403, `tivi ${p}`);
  }
  // GDVH chưa gán BCVH vẫn thấy đủ cả hai BCVH (#72)
  const g = await api(`${TH}?${DAY}`, 'gdvh');
  assert.deepEqual(g.body.theo_bcvh.map((b) => b.receiver_code), [BC2, BC]);
  assert.deepEqual(g.body, (await api(`${TH}?${DAY}`, 'admin')).body);
});

test('tham số sai -> 400 có thông báo (không 500)', async () => {
  const sai = ['', 'from=2026-10-21', 'to=2026-10-21', 'from=2026-13-40&to=2026-10-21', 'from=2026-10-22&to=2026-10-21', `${DAY}&khoa_la=1`, `${DAY}&receiver_code=abc`, `${DAY}&from=2026-10-21`];
  for (const q of sai) {
    for (const p of [TH, LUOT]) {
      const r = await api(`${p}?${q}`, 'admin');
      assert.equal(r.status, 400, `${p}?${q}`);
      assert.ok(typeof r.body.error === 'string' && r.body.error.length > 0);
    }
  }
  const rieng = ['page_size=201', 'page_size=0', 'page=0', 'nhom=XYZ', 'trang_thai=xyz', 'ly_do=XYZ', 'nghi_ngo=2', 'nghi_ngo=co', 'nghi_ngo=1&nghi_ngo=0', 'nhom=KTT&nhom=RONG'];
  for (const q of rieng) {
    const r = await api(`${LUOT}?${DAY}&${q}`, 'admin');
    assert.equal(r.status, 400, q);
    assert.ok(r.body.error);
  }
  // các khóa của /luot không hợp lệ ở /tong-hop
  for (const q of ['page=1', 'nhom=KTT', 'nghi_ngo=1']) assert.equal((await api(`${TH}?${DAY}&${q}`, 'admin')).status, 400, q);
  // date_basis được chấp nhận và bị bỏ qua
  assert.equal((await api(`${TH}?${DAY}&date_basis=bag`, 'admin')).status, 200);
});

test('/tong-hop khớp lõi gọi trực tiếp và khớp «Sản lượng đến» qua API', async () => {
  for (const q of [DAY, `${DAY}&receiver_code=${BC}`, `${DAY}&receiver_code=${BC2}`, `${DAY}&receiver_code=${BC},${BC2}`, 'from=2026-10-20&to=2026-10-22']) {
    CACHE.xoaCache();
    const r = await api(`${TH}?${q}`, 'admin');
    assert.equal(r.status, 200, q);
    const qObj = Object.fromEntries(new URLSearchParams(q));
    assert.deepEqual(r.body, json(QQ.tongHopQuyThoiGian(ctx.db, qObj)), q);
    const san = await api(`/api/arrivals/summary?${q}`, 'admin');
    assert.equal(san.status, 200);
    assert.equal(r.body.tong.tong_shbg, san.body.san_luong, q);
    assert.equal(Object.keys(r.body.theo_nhom).length, 6);
  }
  assert.equal((await api(`${TH}?${DAY}`, 'admin')).body.tong.tong_shbg, 13);
});

test('/luot: phân trang, lọc nhom / nghi_ngo / trang_thai / ly_do', async () => {
  const tat = (await api(`${LUOT}?${DAY}&page_size=200`, 'ttvh')).body;
  assert.equal(tat.pagination.total, 13);
  assert.deepEqual(tat.items, json(QQ.layLuotQuyThoiGian(ctx.db, Object.fromEntries(new URLSearchParams(`${DAY}&page_size=200`))).items));
  const ghep = [];
  const p1 = (await api(`${LUOT}?${DAY}&page_size=5&page=1`, 'ttvh')).body;
  assert.equal(p1.pagination.total_pages, 3);
  for (let p = 1; p <= 3; p++) ghep.push(...(await api(`${LUOT}?${DAY}&page_size=5&page=${p}`, 'ttvh')).body.items);
  assert.deepEqual(ghep, tat.items);
  assert.deepEqual((await api(`${LUOT}?${DAY}&page_size=5&page=9`, 'ttvh')).body.items, []);

  const nn = (await api(`${LUOT}?${DAY}&nghi_ngo=1`, 'admin')).body;
  assert.deepEqual(nn.items.map((i) => i.shbg), ['QT0010VN']);
  const nnTrue = (await api(`${LUOT}?${DAY}&nghi_ngo=true`, 'admin')).body;
  assert.deepEqual(nnTrue.items, nn.items);
  for (const v of ['0', 'false']) {
    const ko = (await api(`${LUOT}?${DAY}&nghi_ngo=${v}&page_size=200`, 'admin')).body;
    assert.equal(ko.pagination.total, 12);
    assert.ok(ko.items.every((i) => i.nghiNgo === false));
  }
  const khongTruyen = (await api(`${LUOT}?${DAY}&page_size=200`, 'admin')).body;
  assert.equal(khongTruyen.pagination.total, 13); // không truyền nghi_ngo -> không lọc

  const ktt = (await api(`${LUOT}?${DAY}&nhom=KTT&page_size=200`, 'admin')).body;
  assert.ok(ktt.items.length > 0 && ktt.items.every((i) => i.nhom === 'KTT'));
  assert.equal(ktt.pagination.total, 6); // QT0001, 02, 03, 06, 10, 15
  assert.equal((await api(`${LUOT}?${DAY}&trang_thai=AM`, 'admin')).body.pagination.total, 1);
  assert.equal((await api(`${LUOT}?${DAY}&ly_do=THIEU_XND_BCVH`, 'admin')).body.pagination.total, 1);
  assert.equal((await api(`${LUOT}?${DAY}&nhom=KTT&nghi_ngo=1`, 'admin')).body.pagination.total, 1);
  assert.equal((await api(`${LUOT}?${DAY}&nhom=RONG&nghi_ngo=1`, 'admin')).body.pagination.total, 0);
  assert.equal((await api(`${LUOT}?${DAY}&receiver_code=${BC2}`, 'admin')).body.pagination.total, 2);
});

test('cache: lần hai giống hệt, dùng chung danh sách cho mọi trang / bộ lọc, khóa theo khung', async () => {
  CACHE.xoaCache();
  const q = { from: '2026-10-21', to: '2026-10-21', page_size: '200' };
  const a = CACHE.luot(ctx.db, q);
  const b = CACHE.luot(ctx.db, { ...q, page: '1', page_size: '5', nhom: 'KTT', nghi_ngo: '0' });
  assert.deepEqual(CACHE.thongKe(), { tong: 0, danh_sach: 1 }); // trang và bộ lọc khác nhau vẫn một khóa
  assert.ok(b.items.every((i) => a.items.some((x) => x === i))); // cùng đối tượng lượt (không tính lại)
  const t1 = CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21' });
  const t2 = CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21' });
  assert.equal(t1, t2);
  assert.deepEqual(CACHE.thongKe(), { tong: 1, danh_sach: 1 }); // tổng hợp lấy từ danh sách đã có, không thêm khóa danh sách
  assert.deepEqual(t1, QQ.tongHopQuyThoiGian(ctx.db, { from: '2026-10-21', to: '2026-10-21' }));
  // mã BCVH khác thứ tự / lặp -> cùng khóa; bộ lọc khác -> khóa khác
  CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21', receiver_code: `${BC},${BC2}` });
  CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21', receiver_code: `${BC2}, ${BC},${BC2}` });
  assert.deepEqual(CACHE.thongKe(), { tong: 2, danh_sach: 2 });
  CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21', receiver_code: BC });
  CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21', receiver_code: BC2 });
  assert.equal(CACHE.thongKe().tong, 4);
  assert.equal(CACHE.thongKe().danh_sach, 3); // tối đa 3 khóa danh sách
  assert.notDeepEqual(CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21', receiver_code: BC2 }).tong, CACHE.tongHop(ctx.db, { from: '2026-10-21', to: '2026-10-21', receiver_code: BC }).tong);
});

test('cache: dữ liệu đổi (INSERT) -> không trả bản cũ; qua 10 phút -> tính lại', async () => {
  CACHE.xoaCache();
  const truoc = (await api(`${TH}?${DAY}`, 'admin')).body;
  const lt = (await api(`${LUOT}?${DAY}&page_size=200`, 'admin')).body;
  assert.equal(truoc.tong.tong_shbg, 13);
  assert.deepEqual((await api(`${TH}?${DAY}`, 'admin')).body, truoc); // lần hai giống hệt
  them(ctx.db.prepare(insSql), { trk: 'QT0099VN', bd10: KTT_B(99), bag: '2026-10-21 10:00:00', xnd: '2026-10-21 10:30:00', ktt: '2026-10-21 08:00:00' });
  const sau = (await api(`${TH}?${DAY}`, 'admin')).body;
  assert.equal(sau.tong.tong_shbg, 14);
  assert.equal(sau.theo_nhom.KTT.tong_shbg, truoc.theo_nhom.KTT.tong_shbg + 1);
  const ltSau = (await api(`${LUOT}?${DAY}&page_size=200`, 'admin')).body;
  assert.equal(ltSau.pagination.total, lt.pagination.total + 1);
  assert.ok(ltSau.items.some((i) => i.shbg === 'QT0099VN'));
  assert.equal((await api(`/api/arrivals/summary?${DAY}`, 'admin')).body.san_luong, 14);
  // hết hạn 10 phút: dùng `now` giả
  CACHE.xoaCache();
  const q = { from: '2026-10-21', to: '2026-10-21' };
  const t0 = Date.now();
  const x = CACHE.luot(ctx.db, q, t0);
  assert.equal(CACHE.luot(ctx.db, q, t0 + CACHE.CACHE_MAX_AGE_MS - 1).items[0], x.items[0]);
  assert.notEqual(CACHE.luot(ctx.db, q, t0 + CACHE.CACHE_MAX_AGE_MS).items[0], x.items[0]);
});

test('cache: vượt giới hạn số khóa không gây lỗi', () => {
  CACHE.xoaCache();
  for (let i = 0; i < CACHE.TONG_MAX + 20; i++) {
    const to = `2026-10-21 ${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`;
    CACHE.tongHop(ctx.db, { from: '2026-10-21', to });
  }
  const tk = CACHE.thongKe();
  assert.equal(tk.tong, CACHE.TONG_MAX);
  assert.equal(tk.danh_sach, CACHE.DANH_SACH_MAX);
});

test('chỉ đọc: gọi API không làm đổi dấu hiệu DB', async () => {
  CACHE.xoaCache();
  const truoc = PD.dauHieuDb(ctx.db);
  for (const p of [`${TH}?${DAY}`, `${LUOT}?${DAY}`, `${TH}?${DAY}&receiver_code=${BC}`, `${LUOT}?${DAY}&nghi_ngo=1`, `${LUOT}?${DAY}&page_size=201`]) await api(p, 'admin');
  assert.equal(PD.dauHieuDb(ctx.db), truoc);
});

// ------------------------------------------
// Đo bộ nhớ / thời gian (QTG_PERF=1): ~130.000 dòng giả, hạt giống cố định
// ------------------------------------------
test('đo cache ở quy mô ~116.000 SHBG (QTG_PERF=1)', { skip: !process.env.QTG_PERF }, () => {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  d.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT); CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, new_ward_name TEXT)');
  d.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,'539991','f.csv','2026-10-15','093012',1,'x','OK')").run();
  let seed = 123456789;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p2 = (n) => String(n).padStart(2, '0');
  const gio = (ngay, giay) => { const g = Math.floor(giay); return `2026-10-${p2(ngay)} ${p2(Math.floor(g / 3600))}:${p2(Math.floor((g % 3600) / 60))}:${p2(g % 60)}`; };
  const bcvhs = ['539991', '539992', '539993', '539994', '539995', '539996'];
  const st = d.prepare(insSql);
  let nSo = 0; let dem = 0;
  d.exec('BEGIN');
  while (dem < 130000) {
    nSo++;
    const trk = `PF${String(nSo).padStart(9, '0')}VN`;
    const recv = bcvhs[Math.floor(rnd() * 6)];
    const ngay = 1 + Math.floor(rnd() * 30);
    const bagS = 6 * 3600 + rnd() * 13 * 3600;
    const soDong = rnd() < 0.12 ? 2 : 1;
    for (let i = 0; i < soDong && dem < 130000; i++, dem++) {
      const u = rnd();
      let bd10 = u < 0.45 ? `530100${recv}6${String(dem).padStart(6, '0')}` : u < 0.62 ? `${recv}531120${String(dem).padStart(6, '0')}` : u < 0.82 ? `5311${p2(Math.floor(rnd() * 90))}${recv}${String(dem).padStart(5, '0')}`
        : u < 0.95 ? `7009${p2(Math.floor(rnd() * 90))}${recv}${String(dem).padStart(5, '0')}` : u < 0.98 ? '' : '53012';
      if (i > 0 && (bd10 === '' || bd10 === '53012')) bd10 = `7009${String(dem).padStart(8, '0')}`;
      const xndS = bagS + 600 + rnd() * 3 * 3600;
      const xnd = rnd() < 0.9 ? gio(ngay, xndS) : null;
      const lech = rnd() < 0.01;
      const ktt = rnd() < 0.85 ? (lech ? gio(Math.max(1, ngay - 12), 3600) : gio(ngay, Math.max(0, xndS - 3600 - rnd() * 20 * 3600))) : null;
      them(st, { trk, recv, bd10, bag: gio(ngay, bagS + i * 60), xnd, ktt });
    }
  }
  d.exec('COMMIT');
  const q = { from: '2026-10-01', to: '2026-10-31' };
  const ms = (a, b) => Math.round(Number(b - a) / 1e6);
  const mb = (x) => Math.round(x / 1048576 * 10) / 10;
  CACHE.xoaCache();
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  const a = CACHE.luot(d, { ...q, page_size: '200' }); // lần đầu: tính danh sách đầy đủ + cắt trang
  const t1 = process.hrtime.bigint();
  const b = CACHE.luot(d, { ...q, page_size: '200', page: '7', nhom: 'KTT' }); // lần hai: chỉ lọc + cắt trang
  const t2 = process.hrtime.bigint();
  const th1 = CACHE.tongHop(d, q); // tổng hợp từ danh sách đã cache
  const t3 = process.hrtime.bigint();
  const th2 = CACHE.tongHop(d, q); // trúng cache tổng hợp
  const t4 = process.hrtime.bigint();
  CACHE.theoNgay(d, q); // QUYTG-7: theo ngày khi danh sách đầy đủ đã có trong cache (chỉ gom lại)
  const t5 = process.hrtime.bigint();
  const nd2 = CACHE.theoNgay(d, q); // trúng cache
  const t6 = process.hrtime.bigint();
  CACHE.xoaCache();
  const t7 = process.hrtime.bigint();
  const nd3 = CACHE.theoNgay(d, q); // lần đầu từ đầu: tính danh sách đầy đủ + gom theo ngày
  const t8 = process.hrtime.bigint();
  assert.equal(CACHE.theoNgay(d, q), nd3);
  assert.equal(nd3.ngay.reduce((a, n) => a + n.den, 0), th1.tong.tong_shbg);
  assert.ok(nd2.ngay.length === 31);
  CACHE.luot(d, { ...q, page_size: '200' });
  if (global.gc) global.gc();
  const h1 = process.memoryUsage().heapUsed;
  console.log(`[QTG_PERF] ${nSo} SHBG: luot lần đầu ${ms(t0, t1)} ms; luot lần hai (lọc nhom + trang 7) ${ms(t1, t2)} ms; tongHop sau luot ${ms(t2, t3)} ms; tongHop lần hai ${ms(t3, t4)} ms; `
    + `theo-ngay (31 ngày): khi đã có danh sách ${ms(t4, t5)} ms, lần hai ${ms(t5, t6)} ms, lần đầu từ đầu (gồm tính danh sách) ${ms(t7, t8)} ms; `
    + `heap tăng ~${mb(h1 - h0)} MB cho 1 khóa danh sách (${a.pagination.total} lượt)${global.gc ? '' : ' [không có --expose-gc: số chỉ tham khảo]'}`);
  assert.equal(a.pagination.total, th1.tong.tong_shbg);
  assert.equal(th1, th2);
  assert.ok(b.pagination.total > 0);
  d.close();
});

// ------------------------------------------
// QUYTG-7: /theo-ngay, bộ lọc duong_thu / dai, khóa mới của /tong-hop. Dữ liệu GIẢ riêng ở tháng 9/2026 (không đụng các ca 21/10 ở trên).
// ------------------------------------------
const RANGE = 'from=2026-09-10&to=2026-09-12';
const THEO_NGAY = '/api/arrivals/quy-thoi-gian/theo-ngay';
function themDuLieuTheoNgay() { // gọi ở cuối before chính (cần dòng arrival_import_files đã có)
  const st = ctx.db.prepare(insSql);
  const upd = ctx.db.prepare('UPDATE arrival_items SET route_name = ? WHERE id = ?');
  const T = (o) => { them(st, { ...o, bag: o.xnd }); upd.run(o.duong ?? '', idDong); };
  T({ trk: 'TN0001VN', bd10: KTT_B(71), ktt: '2026-09-09 07:00:00', xnd: '2026-09-10 07:00:01', duong: 'Đường thư 1' }); // quỹ -1: QUA_HAN
  T({ trk: 'TN0002VN', bd10: KTT_B(72), ktt: '2026-09-10 07:00:00', xnd: '2026-09-10 19:00:01', duong: 'Đường thư 1' }); // quỹ 7.199: SAP_HET
  T({ trk: 'TN0003VN', bd10: KTT_B(73), ktt: '2026-09-10 07:00:00', xnd: '2026-09-10 19:00:00', duong: 'Đường thư 2' }); // quỹ 7.200: CON_2_6
  T({ trk: 'TN0004VN', bd10: KTT_B(74), ktt: '2026-09-10 07:00:00', xnd: '2026-09-10 15:00:00', duong: '' }); // quỹ 21.600: CON_TREN_6, đường thư rỗng
  T({ trk: 'TN0005VN', bd10: NGOAI_B(75), xnd: '2026-09-10 12:30:00', duong: 'Đường thư 2' }); // nhận trực tiếp
  T({ trk: 'TN0006VN', bd10: KTT_B(76), ktt: '2026-09-10 11:00:00', xnd: '2026-09-10 09:30:00', duong: 'Đường thư 1' }); // số âm
  T({ trk: 'TN0007VN', bd10: KTT_B(77), ktt: '2026-08-30 08:00:00', xnd: '2026-09-10 08:00:00', duong: 'Đường thư 1' }); // nghi ngờ
  T({ trk: 'TN0008VN', recv: BC2, bd10: `530100${BC2}610271`, ktt: '2026-09-09 07:00:00', xnd: '2026-09-10 07:00:01', duong: 'Đường thư 2' }); // quá hạn ở BCVH 2
  T({ trk: 'TN0009VN', bd10: KTT_B(78), ktt: '2026-09-12 07:00:00', xnd: '2026-09-12 08:00:00', duong: 'Đường thư 1' }); // ngày 12/9; 11/9 không có lượt
  CACHE.xoaCache();
}
const enc = encodeURIComponent;

test('QUYTG-7: /theo-ngay — quyền: 401 không token; ADMIN / TTVH / GDVH 200; TIVI 403', async () => {
  assert.equal((await api(`${THEO_NGAY}?${RANGE}`)).status, 401);
  for (const who of ['admin', 'ttvh', 'gdvh']) {
    const r = await api(`${THEO_NGAY}?${RANGE}`, who);
    assert.equal(r.status, 200, who);
    assert.ok(Array.isArray(r.body.ngay) && r.body.meta, who);
  }
  assert.equal((await api(`${THEO_NGAY}?${RANGE}`, 'tivi')).status, 403);
});

test('QUYTG-7: /theo-ngay — 400 cho tham số sai (không 500), khoảng đúng 31 ngày được, 32 ngày không', async () => {
  const sai = ['', 'from=2026-09-10', 'to=2026-09-10', 'from=2026-09-12&to=2026-09-10', 'from=2026-13-40&to=2026-09-10', `${RANGE}&khoa_la=1`, `${RANGE}&receiver_code=abc`,
    `${RANGE}&dai=QUA_HAN`, `${RANGE}&nhom=KTT`, `${RANGE}&page=1`, 'from=2026-09-20&to=2026-10-21', 'from=2026-01-01&to=2026-12-31'];
  for (const q of sai) {
    const r = await api(`${THEO_NGAY}?${q}`, 'admin');
    assert.equal(r.status, 400, q);
    assert.ok(typeof r.body.error === 'string' && r.body.error.length > 0, q);
  }
  const ok = await api(`${THEO_NGAY}?from=2026-09-21&to=2026-10-21`, 'admin');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ngay.length, 31);
  assert.equal((await api(`${THEO_NGAY}?${RANGE}&date_basis=bag`, 'admin')).status, 200); // date_basis được bỏ qua như hai route kia
});

test('QUYTG-7: /theo-ngay — đủ mọi ngày kể cả ngày 0 lượt, ngày giảm dần, khớp lõi và /tong-hop', async () => {
  CACHE.xoaCache();
  const r = await api(`${THEO_NGAY}?${RANGE}`, 'admin');
  assert.deepEqual(r.body, json(QQ.theoNgayQuyThoiGian(ctx.db, Object.fromEntries(new URLSearchParams(RANGE)))));
  assert.deepEqual(r.body.ngay.map((n) => n.ngay_den), ['2026-09-12', '2026-09-11', '2026-09-10']);
  const [n12, n11, n10] = r.body.ngay;
  assert.deepEqual([n11.den, n11.chinh, n11.ty_le_qua_han, n11.da_qua_trung_binh_giay], [0, 0, null, null]);
  assert.deepEqual([n10.den, n10.chinh, n10.truc_tiep, n10.lech_moc, n10.nghi_ngo, n10.khong_do_duoc], [8, 6, 1, 1, 1, 0]);
  assert.deepEqual(n10.dai, { QUA_HAN: 2, SAP_HET: 1, CON_2_6: 1, CON_TREN_6: 2 });
  assert.deepEqual([n10.qua_han, n10.sap_het, n10.ty_le_qua_han], [2, 1, 2 / 6]);
  assert.deepEqual([n12.den, n12.chinh, n12.dai.CON_TREN_6, n12.da_qua_trung_binh_giay], [1, 1, 1, 3600]);
  const th = (await api(`${TH}?${RANGE}`, 'admin')).body;
  assert.equal(r.body.ngay.reduce((a, n) => a + n.den, 0), th.tong.tong_shbg);
  assert.equal(r.body.ngay.reduce((a, n) => a + n.dai.QUA_HAN, 0), th.tong.dai.QUA_HAN);
  assert.equal(r.body.ngay.reduce((a, n) => a + n.chinh, 0), th.tong.chinh);
  assert.equal(th.tong.tong_shbg, (await api(`/api/arrivals/summary?${RANGE}`, 'admin')).body.san_luong);
  // lọc BCVH
  const b2 = (await api(`${THEO_NGAY}?${RANGE}&receiver_code=${BC2}`, 'admin')).body;
  assert.deepEqual(b2.ngay.map((n) => [n.ngay_den, n.den, n.qua_han]), [['2026-09-12', 0, 0], ['2026-09-11', 0, 0], ['2026-09-10', 1, 1]]);
});

test('QUYTG-7: /tong-hop — khóa mới (dải, đường thư, BCVH, khung giờ, meta); receiver_code của một BCVH cho theo_bcvh đúng một phần tử', async () => {
  const t = (await api(`${TH}?${RANGE}`, 'admin')).body;
  assert.deepEqual([t.tong.tong_shbg, t.tong.chinh, t.tong.truc_tiep, t.tong.lech_moc, t.tong.phuong_trong], [9, 7, 1, 1, 0]);
  assert.deepEqual(t.tong.dai, { QUA_HAN: 2, SAP_HET: 1, CON_2_6: 1, CON_TREN_6: 3 });
  assert.equal(t.tong.ty_le_qua_han, 2 / 7);
  assert.equal(t.meta.chi_tieu, 'F1_3');
  assert.equal(t.meta.nguong_sap_het_giay, 7200);
  assert.deepEqual(t.tong.theo_duong_thu.map((x) => [x.ten, x.den, x.chinh, x.truc_tiep, x.qua_han, x.sap_het]),
    [['Đường thư 1', 5, 3, 0, 1, 1], ['Đường thư 2', 3, 3, 1, 1, 0], ['Chưa rõ đường thư', 1, 1, 0, 0, 0]]);
  assert.equal(t.tong.theo_duong_thu.reduce((a, x) => a + x.qua_han, 0), t.tong.dai.QUA_HAN);
  assert.deepEqual(t.tong.theo_bcvh.map((x) => [x.ma_bcvh, x.den, x.chinh, x.qua_han]), [[BC, 8, 6, 1], [BC2, 1, 1, 1]]);
  assert.equal(t.tong.theo_bcvh.reduce((a, x) => a + x.qua_han, 0), t.tong.dai.QUA_HAN);
  assert.deepEqual(t.theo_bcvh.map((x) => x.receiver_code), [BC2, BC]); // khóa cũ giữ nguyên
  assert.deepEqual(t.theo_gio.map((g) => g.khung), ['Trước 10h', '10–12h', '12–14h', '14–16h', '16–18h', 'Sau 18h']);
  assert.deepEqual(t.theo_gio.map((g) => g.chinh), [3, 0, 1, 1, 0, 2]); // 07:00:01 ×2, 08:00:00 | 12:30:00 | 15:00:00 | 19:00:01, 19:00:00
  assert.equal(t.theo_gio.reduce((a, g) => a + g.chinh, 0), t.tong.chinh);
  for (const ma of [BC, BC2]) {
    const m = (await api(`${TH}?${RANGE}&receiver_code=${ma}`, 'admin')).body;
    assert.equal(m.tong.theo_bcvh.length, 1, ma);
    assert.equal(m.tong.theo_bcvh[0].ma_bcvh, ma);
    assert.equal(m.theo_bcvh.length, 1);
    const l = (await api(`${LUOT}?${RANGE}&receiver_code=${ma}&page_size=200`, 'admin')).body;
    assert.ok(l.items.length > 0 && l.items.every((i) => i.receiver_code === ma), ma);
    assert.equal(l.pagination.total, m.tong.tong_shbg);
  }
});

test('QUYTG-7: /luot — khóa mới trên lượt, lọc duong_thu / dai, 400 khi sai', async () => {
  const tat = (await api(`${LUOT}?${RANGE}&page_size=200`, 'admin')).body;
  assert.equal(tat.pagination.total, 9);
  for (const l of tat.items) {
    for (const k of ['duong_thu', 'ngay_den', 'nguon_moc_bat_dau', 'dai']) assert.ok(Object.prototype.hasOwnProperty.call(l, k), k);
  }
  const theo = (s) => tat.items.find((i) => i.shbg === s);
  assert.deepEqual([theo('TN0001VN').dai, theo('TN0001VN').nguon_moc_bat_dau, theo('TN0001VN').ngay_den], ['QUA_HAN', 'KTT', '2026-09-10']);
  assert.deepEqual([theo('TN0005VN').dai, theo('TN0005VN').nguon_moc_bat_dau], ['CON_TREN_6', 'XND_BCVH']);
  assert.deepEqual([theo('TN0006VN').dai, theo('TN0006VN').nguon_moc_bat_dau, theo('TN0007VN').dai, theo('TN0007VN').nghiNgo], [null, 'KTT', null, true]);
  assert.equal(theo('TN0004VN').duong_thu, 'Chưa rõ đường thư');
  assert.equal(theo('TN0009VN').ngay_den, '2026-09-12');
  const ids = async (q) => (await api(`${LUOT}?${RANGE}&page_size=200&${q}`, 'admin')).body.items.map((i) => i.shbg).sort();
  assert.deepEqual(await ids('dai=QUA_HAN'), ['TN0001VN', 'TN0008VN']);
  assert.deepEqual(await ids('dai=SAP_HET'), ['TN0002VN']);
  assert.deepEqual(await ids(`duong_thu=${enc('Đường thư 2')}`), ['TN0003VN', 'TN0005VN', 'TN0008VN']);
  assert.deepEqual(await ids(`duong_thu=${enc('Chưa rõ đường thư')}`), ['TN0004VN']);
  assert.deepEqual(await ids(`duong_thu=${enc('Đường thư 2')}&dai=QUA_HAN`), ['TN0008VN']);
  assert.deepEqual(await ids(`duong_thu=${enc('Đường thư 1')}&trang_thai=AM`), ['TN0006VN']);
  assert.deepEqual(await ids(`duong_thu=${enc('Đường thư 1')}&nghi_ngo=1`), ['TN0007VN']);
  assert.deepEqual(await ids('dai=QUA_HAN&nghi_ngo=1'), []);
  assert.deepEqual(await ids('nhom=NGOAI_53&dai=CON_TREN_6'), ['TN0005VN']);
  assert.equal((await ids('')).length, 9); // không truyền -> không đổi hành vi
  for (const q of ['dai=XYZ', 'dai=qua_han', 'dai=QUA_HAN&dai=SAP_HET', 'duong_thu=a&duong_thu=b']) {
    const r = await api(`${LUOT}?${RANGE}&${q}`, 'admin');
    assert.equal(r.status, 400, q);
    assert.ok(r.body.error, q);
  }
  for (const q of ['dai=QUA_HAN', `duong_thu=${enc('Đường thư 1')}`]) assert.equal((await api(`${TH}?${RANGE}&${q}`, 'admin')).status, 400, q); // chỉ /luot nhận
});

test('QUYTG-7: cache /theo-ngay — lần hai giống hệt, dùng chung danh sách đầy đủ, dữ liệu đổi thì tính lại; chỉ đọc', async () => {
  CACHE.xoaCache();
  const q = { from: '2026-09-10', to: '2026-09-12' };
  const a = CACHE.theoNgay(ctx.db, q);
  assert.deepEqual(CACHE.thongKe(), { tong: 0, danh_sach: 1 });
  assert.equal(CACHE.theoNgay(ctx.db, q), a);
  CACHE.tongHop(ctx.db, q);
  CACHE.luot(ctx.db, { ...q, dai: 'QUA_HAN', duong_thu: 'Đường thư 1' });
  assert.deepEqual(CACHE.thongKe(), { tong: 1, danh_sach: 1 }); // /theo-ngay, /tong-hop và /luot cùng một danh sách đầy đủ
  assert.deepEqual(a, QQ.theoNgayQuyThoiGian(ctx.db, q));
  // chỉ đọc
  CACHE.xoaCache();
  const truoc = PD.dauHieuDb(ctx.db);
  for (const p of [`${THEO_NGAY}?${RANGE}`, `${THEO_NGAY}?${RANGE}&receiver_code=${BC}`, `${THEO_NGAY}?from=2026-01-01&to=2026-12-31`, `${LUOT}?${RANGE}&dai=QUA_HAN`, `${TH}?${RANGE}`]) await api(p, 'admin');
  assert.equal(PD.dauHieuDb(ctx.db), truoc);
  // dữ liệu đổi -> không trả bản cũ
  const truocBody = (await api(`${THEO_NGAY}?${RANGE}`, 'admin')).body;
  assert.equal((await api(`${THEO_NGAY}?${RANGE}`, 'admin')).body.ngay[2].den, 8);
  them(ctx.db.prepare(insSql), { trk: 'TN0099VN', bd10: KTT_B(99), bag: '2026-09-11 10:00:00', xnd: '2026-09-11 10:30:00', ktt: '2026-09-11 08:00:00' });
  const sau = (await api(`${THEO_NGAY}?${RANGE}`, 'admin')).body;
  assert.equal(sau.ngay[1].den, 1);
  assert.equal(truocBody.ngay[1].den, 0);
});
