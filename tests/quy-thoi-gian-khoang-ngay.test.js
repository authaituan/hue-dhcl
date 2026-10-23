// ==========================================
// Test QUYTG-9a: «Thời gian Khai thác-Vận chuyển» — khoảng ngày CỘNG TỪNG NGÀY, trần 31 ngày, và lũy kế tháng (GET …/quy-thoi-gian/luy-ke) + cache theo chữ ký.
// Server thật trên DB tạm (serverHarness) cho quyền / 400 / route; các ca cần DB riêng (tháng chưa có ngày 01, kịch bản đo) dùng DB trong bộ nhớ.
// Dữ liệu GIẢ (mã BCVH thật nhưng SHBG và BD10 giả, ngày 9–10/2026). Chỉ đọc API; ghi trực tiếp vào DB tạm để dựng tình huống.
// Đo thời gian ở quy mô 6 BCVH × 31 ngày × 1.500 SHBG/ngày: chỉ khi QTG_PERF=1.
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

const PORT = 5991;
const A = '535470';
const B = '536250';
const USERS = {
  admin: { hrm: 'KN_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KN_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KN_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KN_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
let ctx;

const p2 = (n) => String(n).padStart(2, '0');
const t10 = (n) => `2026-10-${p2(n)}`;
const t09 = (n) => `2026-09-${p2(n)}`;
const truoc10 = (n) => (n === 1 ? '2026-09-30' : t10(n - 1));

const INS = `INSERT INTO arrival_items (id, import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
  bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
  VALUES (@id, 1, @recv, @trk, @bd10, '', @bag, NULL, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @arrival_evidence_count, @bag_date, @bd10_date, NULL)`;

/** Bộ dựng dữ liệu giả trên một handle better-sqlite3 bất kỳ (DB tạm của server hoặc DB trong bộ nhớ). */
function boDung(db) {
  const st = db.prepare(INS);
  const st2 = db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (?, ?, ?, ?, 1, ?, ?)");
  let idDong = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM arrival_items').get().m;
  let seq = idDong; // tiếp số thứ tự sau các dòng đã có (khóa chống trùng theo SHBG + BD10)
  if (!db.prepare("SELECT 1 FROM arrival_import_files WHERE id = 1").get()) {
    db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (1, ?, 'HangDen_535470_20260801_000000.csv', '2026-08-01', '000000', 1, 'goc', 'REJECTED', 'giả')").run(A);
  }
  const them = (o) => {
    const it = deriveArrival({ bag_confirmed_at: o.bag ?? null, item_confirmed_at: null, bd10_confirmed_at: o.xnd ?? null });
    st.run({
      id: ++idDong, recv: o.recv, trk: o.trk, bd10: o.bd10 ?? '', bag: o.bag ?? null, xnd: o.xnd ?? null, ktt: o.ktt ?? null,
      arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis, arrival_date: it.arrival_date, arrival_evidence_count: it.arrival_evidence_count,
      bag_date: o.bag ? o.bag.slice(0, 10) : null, bd10_date: o.xnd ? o.xnd.slice(0, 10) : null
    });
    return idDong;
  };
  /** `n` lượt đến (recv, ngày YYYY-MM-DD): `qh` lượt đầu QUÁ HẠN (quỹ −1 giây), còn lại CON_TREN_6. Cả hai là lượt chính. */
  const nap = (recv, ngay, n, qh = 0) => {
    const truoc = new Date(Date.parse(`${ngay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    for (let i = 0; i < n; i++) {
      seq++;
      const bd10 = `530100${recv}6${String(seq).padStart(6, '0')}`;
      if (i < qh) them({ recv, trk: `GV${String(seq).padStart(7, '0')}VN`, bd10, ktt: `${truoc} 07:00:00`, xnd: `${ngay} 07:00:01`, bag: `${ngay} 07:00:01` });
      else them({ recv, trk: `GV${String(seq).padStart(7, '0')}VN`, bd10, ktt: `${ngay} 07:00:00`, xnd: `${ngay} 15:00:00`, bag: `${ngay} 15:00:00` });
    }
  };
  /** `soFile` file nạp OK (hoặc status khác) của (recv, file_date). */
  const taoFile = (recv, ngay, soFile = 2, status = 'OK') => {
    for (let i = 0; i < soFile; i++) st2.run(recv, `HangDen_${recv}_${ngay.replace(/-/g, '')}_${p2(9 + i * 6)}0000.csv`, ngay, `${p2(9 + i * 6)}0000`, `s${recv}${ngay}${i}`, status);
  };
  return { them, nap, taoFile };
}
function dbBoNho() {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  return d;
}

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-quy-thoi-gian-khoang-ngay-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  const b = boDung(ctx.db);
  // ---- Tháng 10/2026 cho lũy kế. A: ngày 1 (60, 10 quá hạn), 2 (100, 20), 3 (không file), 4 (30 lượt: dưới sàn), 5 (80, 0), 6 (70, 7 — chỉ 1 file: đang cập nhật).
  //      B: ngày 1 (55, 5), 5 (60, 6), 6 (90, 9). Ngày mới nhất của phạm vi = 6.
  for (const [recv, ngay, n, qh, soFile] of [[A, 1, 60, 10, 2], [A, 2, 100, 20, 2], [A, 4, 30, 3, 2], [A, 5, 80, 0, 2], [A, 6, 70, 7, 1], [B, 1, 55, 5, 2], [B, 5, 60, 6, 2], [B, 6, 90, 9, 2]]) {
    b.nap(recv, t10(ngay), n, qh);
    b.taoFile(recv, t10(ngay), soFile);
  }
  // ---- Tháng 9/2026 cho các ca khoảng ngày (cộng từng ngày). Không tạo file (tong-hop / luot không cần).
  const T = b.them;
  const KTT = (recv, n) => `530100${recv}6${String(900000 + n)}`;
  // SHBG đến lại (A): ngày 5 và ngày 7, BD10 khác nhau
  T({ recv: A, trk: 'RA0001VN', bd10: KTT(A, 1), ktt: `${t09(5)} 05:00:00`, bag: `${t09(5)} 08:30:00`, xnd: `${t09(5)} 09:00:00` });
  T({ recv: A, trk: 'RA0001VN', bd10: KTT(A, 2), ktt: `${t09(7)} 05:00:00`, bag: `${t09(7)} 08:30:00`, xnd: `${t09(7)} 09:00:00` });
  T({ recv: A, trk: 'RA0002VN', bd10: KTT(A, 3), ktt: `${t09(5)} 05:00:00`, bag: `${t09(5)} 08:30:00`, xnd: `${t09(5)} 10:00:00` });
  T({ recv: A, trk: 'RA0003VN', bd10: KTT(A, 4), ktt: `${t09(6)} 05:00:00`, bag: `${t09(6)} 08:30:00`, xnd: `${t09(6)} 10:00:00` });
  T({ recv: A, trk: 'RA0004VN', bd10: KTT(A, 5), ktt: `${t09(7)} 05:00:00`, bag: `${t09(7)} 08:30:00`, xnd: `${t09(7)} 10:00:00` });
  // SHBG đến lại với KTT cách XNĐ > 7 ngày (nghi ngờ): ngày 10 và ngày 12
  T({ recv: A, trk: 'RN0001VN', bd10: KTT(A, 6), ktt: `${t09(1)} 05:00:00`, bag: `${t09(10)} 08:30:00`, xnd: `${t09(10)} 09:00:00` });
  T({ recv: A, trk: 'RN0001VN', bd10: KTT(A, 7), ktt: `${t09(12)} 05:00:00`, bag: `${t09(12)} 08:30:00`, xnd: `${t09(12)} 09:00:00` });
  // SHBG qua hai BCVH cùng ngày 15
  T({ recv: A, trk: 'XB0001VN', bd10: KTT(A, 8), ktt: `${t09(15)} 05:00:00`, bag: `${t09(15)} 08:30:00`, xnd: `${t09(15)} 09:00:00` });
  T({ recv: B, trk: 'XB0001VN', bd10: KTT(B, 9), ktt: `${t09(15)} 06:00:00`, bag: `${t09(15)} 10:30:00`, xnd: `${t09(15)} 11:00:00` });
  // SHBG ở A ngày 16 và ở B ngày 17: mỗi lượt đo bằng dòng của CHÍNH BCVH đó
  T({ recv: A, trk: 'XB0002VN', bd10: KTT(A, 10), ktt: `${t09(16)} 05:00:00`, bag: `${t09(16)} 08:30:00`, xnd: `${t09(16)} 09:00:00` });
  T({ recv: B, trk: 'XB0002VN', bd10: KTT(B, 11), ktt: `${t09(17)} 05:00:00`, bag: `${t09(17)} 11:30:00`, xnd: `${t09(17)} 12:00:00` });
  CACHE.xoaCache();
});
after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

const TH = '/api/arrivals/quy-thoi-gian/tong-hop';
const LUOT = '/api/arrivals/quy-thoi-gian/luot';
const TN = '/api/arrivals/quy-thoi-gian/theo-ngay';
const LK = '/api/arrivals/quy-thoi-gian/luy-ke';
async function api(p, who) {
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}
const json = (x) => JSON.parse(JSON.stringify(x));
const RA = `from=${t09(5)}&to=${t09(7)}&receiver_code=${A}`;

// ------------------------------------------
// Khoảng ngày: cộng từng ngày
// ------------------------------------------
test('khoảng nhiều ngày CỘNG TỪNG NGÀY: SHBG đến lại tính ở mỗi ngày đến; tổng = Σ các ngày = tổng số lượt; một ngày đơn lẻ không đổi', async () => {
  CACHE.xoaCache();
  const th = (await api(`${TH}?${RA}`, 'admin')).body;
  const tn = (await api(`${TN}?${RA}`, 'admin')).body;
  const lt = (await api(`${LUOT}?${RA}&page_size=200`, 'admin')).body;
  assert.equal(th.tong.tong_shbg, 5); // ngày 5: RA0001, RA0002 | ngày 6: RA0003 | ngày 7: RA0001 (đến lại), RA0004
  assert.deepEqual(tn.ngay.map((n) => [n.ngay_den, n.den]), [[t09(7), 2], [t09(6), 1], [t09(5), 2]]);
  assert.equal(tn.ngay.reduce((a, n) => a + n.den, 0), th.tong.tong_shbg);
  assert.equal(lt.pagination.total, th.tong.tong_shbg);
  const ra = lt.items.filter((i) => i.shbg === 'RA0001VN');
  assert.deepEqual(ra.map((i) => i.ngay_den).sort(), [t09(5), t09(7)]);
  // từng ngày lẻ: tổng các ngày lẻ = tổng khoảng
  let cong = 0;
  for (const d of [5, 6, 7]) cong += (await api(`${TH}?from=${t09(d)}&to=${t09(d)}&receiver_code=${A}`, 'admin')).body.tong.tong_shbg;
  assert.equal(cong, th.tong.tong_shbg);
  // /summary vẫn đếm mỗi SHBG một lần trên cả khoảng: lệch đúng một lượt đến lại (cố ý, xem docs/ai/35)
  assert.equal((await api(`/api/arrivals/summary?${RA}`, 'admin')).body.san_luong, th.tong.tong_shbg - 1); // 4 SHBG khác nhau
  // một ngày: y như «Sản lượng đến» cùng bộ lọc
  const mot = `from=${t09(7)}&to=${t09(7)}&receiver_code=${A}`;
  assert.equal((await api(`${TH}?${mot}`, 'admin')).body.tong.tong_shbg, (await api(`/api/arrivals/summary?${mot}`, 'admin')).body.san_luong);
});

test('lượt đến lại có KTT cách XNĐ > 7 ngày vẫn là «nghi ngờ», không vào lượt chính (chinh) và không bị tính hai lần', async () => {
  const q = `from=${t09(10)}&to=${t09(12)}&receiver_code=${A}`;
  const th = (await api(`${TH}?${q}`, 'admin')).body;
  assert.equal(th.tong.tong_shbg, 2);
  assert.equal(th.tong.nghi_ngo, 2); // cùng dòng đo (XNĐ sớm nhất, KTT ngày 1) cho cả hai lượt
  assert.equal(th.tong.chinh, 0);
  assert.equal(th.tong.ty_le_qua_han, null);
  const lt = (await api(`${LUOT}?${q}&page_size=200`, 'admin')).body;
  assert.deepEqual(lt.items.map((i) => [i.shbg, i.ngay_den, i.nghiNgo, i.dai]).sort(), [['RN0001VN', t09(10), true, null], ['RN0001VN', t09(12), true, null]]);
  const tn = (await api(`${TN}?${q}`, 'admin')).body;
  assert.equal(tn.ngay.reduce((a, n) => a + n.chinh, 0), 0);
});

test('lượt đến lại (mốc không nghi ngờ) dùng cùng dòng đo với lần đến đầu — hành vi hiện tại, còn nợ (ghi ở docs/ai/35)', async () => {
  const lt = (await api(`${LUOT}?${RA}&page_size=200`, 'admin')).body.items.filter((i) => i.shbg === 'RA0001VN').sort((a, b) => (a.ngay_den < b.ngay_den ? -1 : 1));
  assert.equal(lt.length, 2);
  assert.equal(lt[0].xnd, `${t09(5)} 09:00:00`);
  assert.equal(lt[1].xnd, `${t09(5)} 09:00:00`); // lượt ngày 7 đo bằng dòng XNĐ sớm nhất = dòng của lần đến ngày 5
  assert.equal(lt[1].ngay_den, t09(7));
});

test('không lọc BCVH: SHBG qua hai BCVH cùng ngày là MỘT lượt (xuyên BCVH trong ngày); lọc từng BCVH thì mỗi nơi một lượt', async () => {
  const ngay = `from=${t09(15)}&to=${t09(15)}`;
  assert.equal((await api(`${TH}?${ngay}`, 'admin')).body.tong.tong_shbg, 1);
  assert.equal((await api(`${TH}?${ngay}&receiver_code=${A}`, 'admin')).body.tong.tong_shbg, 1);
  assert.equal((await api(`${TH}?${ngay}&receiver_code=${B}`, 'admin')).body.tong.tong_shbg, 1);
});

test('dòng đo chọn theo (SHBG, BCVH): SHBG ở A ngày 16 và ở B ngày 17 cho hai lượt, mỗi lượt đo bằng dòng của chính BCVH đó', async () => {
  const lt = (await api(`${LUOT}?from=${t09(16)}&to=${t09(17)}&page_size=200`, 'admin')).body.items.filter((i) => i.shbg === 'XB0002VN');
  assert.equal(lt.length, 2);
  const a = lt.find((i) => i.receiver_code === A);
  const b = lt.find((i) => i.receiver_code === B);
  assert.equal(a.xnd, `${t09(16)} 09:00:00`);
  assert.equal(b.xnd, `${t09(17)} 12:00:00`); // KHÔNG phải XNĐ sớm nhất của SHBG ở A
  assert.equal(b.ktt, `${t09(17)} 05:00:00`);
});

test('trần 31 ngày áp cho CẢ BA route: 31 ngày được, 32 ngày 400 (đếm theo ngày của from / to)', async () => {
  for (const p of [TH, LUOT, TN]) {
    const ok = await api(`${p}?from=2026-10-01&to=2026-10-31`, 'admin');
    assert.equal(ok.status, 200, p);
    const qua = await api(`${p}?from=2026-10-01&to=2026-11-01`, 'admin');
    assert.equal(qua.status, 400, p);
    assert.match(qua.body.error, /tối đa 31 ngày/, p);
    const gio = await api(`${p}?from=2026-10-01 00:00&to=2026-11-01 00:00`, 'admin'); // 32 ngày theo ngày của from / to dù đủ 31 ngày về giờ
    assert.equal(gio.status, 400, p);
    assert.equal((await api(`${p}?from=2026-01-01&to=2026-12-31`, 'admin')).status, 400, p);
  }
});

// ------------------------------------------
// /luy-ke
// ------------------------------------------
test('/luy-ke — quyền: 401 không token; ADMIN / TTVH / GDVH 200; TIVI 403', async () => {
  assert.equal((await api(LK)).status, 401);
  for (const who of ['admin', 'ttvh', 'gdvh']) {
    const r = await api(LK, who);
    assert.equal(r.status, 200, who);
    for (const k of ['tu', 'den', 'thang', 'ngay_moi_nhat', 'ngay_dang_cap_nhat', 'so_ngay_co_du_lieu', 'bcvh', 'tong', 'theo_ngay', 'meta']) assert.ok(Object.prototype.hasOwnProperty.call(r.body, k), `${who} ${k}`);
  }
  assert.equal((await api(LK, 'tivi')).status, 403);
});

test('/luy-ke — 400 (không 500) cho tham số sai: khóa lạ, from / to / ward_key, den sai, mã BCVH ngoài danh mục', async () => {
  const sai = ['khoa_la=1', 'from=2026-10-01&to=2026-10-06', 'ward_key=x', 'den=abc', 'den=2026-13-40', 'den=2026-10-06&den=2026-10-05', 'receiver_code=539999', `receiver_code=${A},abc`, 'receiver_code=abc', 'page=1'];
  for (const q of sai) {
    const r = await api(`${LK}?${q}`, 'admin');
    assert.equal(r.status, 400, q);
    assert.ok(typeof r.body.error === 'string' && r.body.error.length > 0, q);
    assert.ok(!/Quỹ thời gian/i.test(r.body.error), q);
  }
  assert.equal((await api(`${LK}?den=`, 'admin')).status, 200); // rỗng = vắng
});

test('/luy-ke — Tất cả BCVH: ngày thiếu file / dưới sàn / đang cập nhật; tổng cộng đúng các cặp (BCVH, ngày) có dữ liệu', async () => {
  CACHE.xoaCache();
  const r = (await api(LK, 'admin')).body;
  assert.deepEqual([r.tu, r.den, r.thang, r.ngay_moi_nhat], [t10(1), t10(6), '2026-10', t10(6)]);
  assert.deepEqual(r.bcvh, QQ_CODES()); // cả 6 BCVH, sắp xếp
  assert.equal(r.theo_ngay.length, 6);
  const d = (n) => r.theo_ngay[n - 1];
  assert.equal(d(1).ngay, t10(1));
  // ngày 1: A 60 + B 55; quá hạn 10 + 5
  assert.deepEqual([d(1).co_du_lieu, d(1).so_bcvh_trong_ngay, d(1).den, d(1).chinh, d(1).qua_han], [true, 2, 115, 115, 15]);
  assert.equal(d(1).ty_le_qua_han, 15 / 115);
  assert.equal(d(1).luy_ke_ty_le, 15 / 115);
  // ngày 2: chỉ A (B không có file)
  assert.deepEqual([d(2).co_du_lieu, d(2).so_bcvh_trong_ngay, d(2).den, d(2).qua_han, d(2).luy_ke_qua_han, d(2).luy_ke_chinh], [true, 1, 100, 20, 35, 215]);
  assert.ok(d(2).bcvh_thieu.some((x) => x.ma === B && x.ly_do === 'THIEU_FILE'));
  // ngày 3: không BCVH nào có file -> THIEU_FILE; lũy kế giữ nguyên
  assert.deepEqual([d(3).co_du_lieu, d(3).ly_do, d(3).den, d(3).ty_le_qua_han, d(3).luy_ke_qua_han, d(3).luy_ke_chinh], [false, 'THIEU_FILE', 0, null, 35, 215]);
  assert.equal(d(3).luy_ke_ty_le, 35 / 215);
  // ngày 4: A có file nhưng chỉ 30 lượt (< sàn 50), B thiếu file -> DUOI_SAN
  assert.deepEqual([d(4).co_du_lieu, d(4).ly_do], [false, 'DUOI_SAN']);
  assert.ok(d(4).bcvh_thieu.some((x) => x.ma === A && x.ly_do === 'DUOI_SAN'));
  assert.equal(d(4).luy_ke_ty_le, 35 / 215);
  // ngày 5: A 80 (0) + B 60 (6)
  assert.deepEqual([d(5).co_du_lieu, d(5).den, d(5).qua_han, d(5).luy_ke_qua_han, d(5).luy_ke_chinh], [true, 140, 6, 41, 355]);
  // ngày 6 (ngày mới nhất): A chỉ 1 file -> đang cập nhật, chưa gồm; B đủ 2 file -> gồm
  assert.deepEqual([d(6).co_du_lieu, d(6).so_bcvh_trong_ngay, d(6).den, d(6).qua_han], [true, 1, 90, 9]);
  assert.deepEqual(d(6).bcvh_thieu.filter((x) => x.ma === A), [{ ma: A, ly_do: 'DANG_CAP_NHAT' }]);
  assert.equal(r.ngay_dang_cap_nhat, t10(6));
  assert.equal(r.meta.dang_cap_nhat, true);
  assert.deepEqual(r.meta.bcvh_dang_cap_nhat, [A]);
  assert.equal(r.meta.san_ngay_co_du_lieu, 50);
  assert.equal(r.so_ngay_co_du_lieu, 4);
  // tổng
  assert.deepEqual([r.tong.tong_shbg, r.tong.do_duoc, r.tong.chinh, r.tong.truc_tiep, r.tong.dai.QUA_HAN], [445, 445, 445, 0, 50]);
  assert.equal(r.tong.dai.CON_TREN_6, 395);
  assert.equal(r.tong.ty_le_qua_han, 50 / 445);
  assert.equal(r.tong.theo_bcvh, undefined);
  assert.equal(r.theo_ngay.reduce((a, n) => a + n.den, 0), r.tong.tong_shbg);
  assert.equal(d(6).luy_ke_ty_le, r.tong.ty_le_qua_han);
});

test('/luy-ke — một BCVH: tỉ lệ = Σ quá hạn / Σ chinh (không phải trung bình tỉ lệ ngày); ngày đang cập nhật vào tổng khi có file thứ hai', async () => {
  CACHE.xoaCache();
  const r = (await api(`${LK}?receiver_code=${A}`, 'admin')).body;
  assert.deepEqual(r.bcvh, [A]);
  assert.deepEqual([r.tong.tong_shbg, r.tong.dai.QUA_HAN], [240, 30]); // ngày 1, 2, 5; ngày 4 dưới sàn; ngày 6 đang cập nhật
  assert.equal(r.tong.ty_le_qua_han, 30 / 240);
  const tbNgay = [10 / 60, 20 / 100, 0 / 80].reduce((a, x) => a + x, 0) / 3;
  assert.notEqual(r.tong.ty_le_qua_han, tbNgay);
  const d6 = r.theo_ngay[5];
  assert.deepEqual([d6.co_du_lieu, d6.ly_do, d6.den, d6.ty_le_qua_han], [false, 'DANG_CAP_NHAT', 0, null]);
  assert.equal(r.ngay_dang_cap_nhat, t10(6));
  assert.equal(r.theo_ngay[3].ly_do, 'DUOI_SAN');
  assert.equal(r.theo_ngay[2].ly_do, 'THIEU_FILE');
  // thêm file thứ hai của (A, ngày 6) -> ngày được gồm
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (?, ?, ?, '150000', 1, 'them', 'OK')")
    .run(A, `HangDen_${A}_${t10(6).replace(/-/g, '')}_150000.csv`, t10(6));
  const sau = (await api(`${LK}?receiver_code=${A}`, 'admin')).body;
  assert.deepEqual([sau.tong.tong_shbg, sau.tong.dai.QUA_HAN], [310, 37]);
  assert.equal(sau.ngay_dang_cap_nhat, null);
  assert.equal(sau.meta.dang_cap_nhat, false);
  assert.equal(sau.theo_ngay[5].co_du_lieu, true);
  assert.equal(sau.tong.ty_le_qua_han, 37 / 310);
  ctx.db.prepare("DELETE FROM arrival_import_files WHERE sha256 = 'them'").run();
});

test('/luy-ke — khớp /theo-ngay của cùng BCVH ở các ngày có dữ liệu, và khớp lõi không cache', async () => {
  CACHE.xoaCache();
  const lk = (await api(`${LK}?receiver_code=${A}`, 'admin')).body;
  const tn = (await api(`${TN}?from=${t10(1)}&to=${t10(6)}&receiver_code=${A}`, 'admin')).body;
  for (const n of lk.theo_ngay.filter((x) => x.co_du_lieu)) {
    const o = tn.ngay.find((x) => x.ngay_den === n.ngay);
    assert.deepEqual([n.den, n.chinh, n.qua_han], [o.den, o.chinh, o.qua_han], n.ngay);
  }
  assert.deepEqual(lk, json(QQ.luyKeQuyThoiGian(ctx.db, { receiver_code: A })));
  assert.deepEqual(json(CACHE.luyKe(ctx.db, {})), json(QQ.luyKeQuyThoiGian(ctx.db, {})));
  // den nhỏ hơn ngày mới nhất: cắt ở den, không có ngày đang cập nhật
  const den5 = (await api(`${LK}?den=${t10(5)}`, 'admin')).body;
  assert.deepEqual([den5.den, den5.theo_ngay.length, den5.ngay_dang_cap_nhat, den5.ngay_moi_nhat], [t10(5), 5, null, t10(6)]);
  assert.equal(den5.tong.tong_shbg, 355);
  // nhiều mã = cùng kết quả khi liệt kê đủ cả hai BCVH có dữ liệu
  const ab = (await api(`${LK}?receiver_code=${B},${A},${A}`, 'admin')).body;
  assert.deepEqual(ab.bcvh, [A, B]);
  assert.equal(ab.tong.tong_shbg, 445);
});

test('/luy-ke — chưa có file OK nào: kết quả rỗng, không lỗi', () => {
  const d = dbBoNho();
  const r = QQ.luyKeQuyThoiGian(d, {});
  assert.deepEqual([r.tu, r.den, r.thang, r.ngay_moi_nhat, r.ngay_dang_cap_nhat, r.so_ngay_co_du_lieu], [null, null, null, null, null, 0]);
  assert.deepEqual(r.theo_ngay, []);
  assert.equal(r.tong.tong_shbg, 0);
  assert.equal(r.tong.ty_le_qua_han, null);
  assert.equal(CACHE.luyKe(d, {}).tong.tong_shbg, 0);
  d.close();
});

test('/luy-ke — ngày 01 của tháng mới chưa về: ngày mới nhất vẫn ở tháng trước -> trả tháng trước', () => {
  const d = dbBoNho();
  const b = boDung(d);
  for (const n of [28, 29, 30]) { b.nap(A, t09(n), 60, 6); b.taoFile(A, t09(n), 2); }
  const r = QQ.luyKeQuyThoiGian(d, { receiver_code: A });
  assert.deepEqual([r.tu, r.den, r.thang, r.so_ngay_co_du_lieu], ['2026-09-01', t09(30), '2026-09', 3]);
  assert.equal(r.theo_ngay.length, 30);
  assert.equal(r.theo_ngay[0].luy_ke_ty_le, null); // ngày 1..27 không có file: lũy kế chưa có chinh
  assert.equal(r.tong.ty_le_qua_han, 18 / 180);
  d.close();
});

// ------------------------------------------
// Cache lũy kế
// ------------------------------------------
test('cache /luy-ke — lần hai không tính lại; ghi KHÔNG liên quan (trạng thái phát) giữ nguyên số đếm; chỉ đọc không đổi dấu hiệu DB', async () => {
  CACHE.xoaCache();
  const truoc = PD.dauHieuDb(ctx.db);
  const a = (await api(LK, 'admin')).body;
  assert.equal(PD.dauHieuDb(ctx.db), truoc); // chỉ đọc
  const t1 = CACHE.thongKeLuyKe();
  assert.deepEqual([t1.lanChuKy, t1.lanTinh, t1.capTinhLai], [1, 1, 36]); // 6 BCVH × 6 ngày
  const b = (await api(LK, 'admin')).body;
  assert.deepEqual(b, a);
  assert.deepEqual(CACHE.thongKeLuyKe(), t1); // đường nhanh: không tính chữ ký, không tính lại
  // ghi vào bảng phát
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, 'GV0000001VN', 'PTC', 1, '2026-10-06T10:00:00Z')").run(A);
  const c = (await api(LK, 'admin')).body;
  assert.deepEqual(c, a);
  const t2 = CACHE.thongKeLuyKe();
  assert.equal(t2.lanChuKy, 2); // dấu hiệu DB đổi -> kiểm chữ ký
  assert.equal(t2.lanTinh, t1.lanTinh); // nhưng KHÔNG tính lại số đếm
  assert.equal(t2.capTinhLai, t1.capTinhLai);
  ctx.db.prepare("DELETE FROM phat_status_current WHERE shbg = 'GV0000001VN'").run();
});

test('cache /luy-ke — thêm dòng đến của MỘT (BCVH, ngày) chỉ tính lại cặp đó; sửa tại chỗ KTT cũng được bắt; kết quả luôn khớp lõi không cache', async () => {
  CACHE.xoaCache();
  await api(LK, 'admin');
  const t0 = CACHE.thongKeLuyKe();
  const them = boDung(ctx.db);
  them.nap(A, t10(5), 3, 3); // 3 lượt quá hạn mới cho (A, ngày 5)
  const a = (await api(LK, 'admin')).body;
  const t1 = CACHE.thongKeLuyKe();
  assert.equal(t1.capTinhLai - t0.capTinhLai, 1);
  assert.equal(t1.lanTinh - t0.lanTinh, 1);
  assert.deepEqual(a, json(QQ.luyKeQuyThoiGian(ctx.db, {})));
  assert.equal(a.theo_ngay[4].den, 143); // 80 + 60 + 3
  assert.equal(a.theo_ngay[4].qua_han, 9);
  assert.equal(a.tong.tong_shbg, 448);
  // sửa tại chỗ KTT của 5 lượt CON_TREN_6 của (A, ngày 5): thành quá hạn
  const ids = ctx.db.prepare("SELECT id FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? AND bd10_ttkt_confirmed_at = ? LIMIT 5").all(A, t10(5), `${t10(5)} 07:00:00`).map((r) => r.id);
  assert.equal(ids.length, 5);
  for (const id of ids) ctx.db.prepare('UPDATE arrival_items SET bd10_ttkt_confirmed_at = ? WHERE id = ?').run(`${t10(4)} 07:00:00`, id);
  const b = (await api(LK, 'admin')).body;
  const t2 = CACHE.thongKeLuyKe();
  assert.equal(t2.capTinhLai - t1.capTinhLai, 1);
  assert.equal(b.theo_ngay[4].qua_han, 14);
  assert.deepEqual(b, json(QQ.luyKeQuyThoiGian(ctx.db, {})));
  // xóa dòng -> số lượt giảm
  ctx.db.prepare("DELETE FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? AND bd10_ttkt_confirmed_at = ?").run(A, t10(4), `${t10(4)} 07:00:00`);
  const c = (await api(LK, 'admin')).body;
  assert.deepEqual(c, json(QQ.luyKeQuyThoiGian(ctx.db, {})));
  assert.ok(c.tong.tong_shbg <= b.tong.tong_shbg);
});

test('cache /luy-ke — tuổi tối đa theo TẦNG: ngày gần 10 phút, ngày xa (> 3 ngày so với ngày mới nhất) 6 giờ; xoaCache dọn cả lũy kế; số khóa có trần', () => {
  CACHE.xoaCache();
  const t0 = Date.now();
  const ketQua0 = CACHE.luyKe(ctx.db, {}, t0); // ngày mới nhất 6/10: ngày xa = 1, 2 (12 cặp), ngày gần = 3..6 (24 cặp)
  const a = CACHE.thongKeLuyKe();
  assert.equal(a.capTinhLai, 36);
  CACHE.luyKe(ctx.db, {}, t0 + CACHE.CACHE_MAX_AGE_MS - 1);
  assert.equal(CACHE.thongKeLuyKe().lanChuKy, a.lanChuKy); // còn hạn: đường nhanh
  const dem = () => CACHE.thongKeLuyKe().capTinhLai;
  let truoc = dem();
  const k1 = CACHE.luyKe(ctx.db, {}, t0 + CACHE.CACHE_MAX_AGE_MS); // quá 10 phút: chỉ ngày GẦN tính lại
  assert.equal(CACHE.thongKeLuyKe().lanChuKy, a.lanChuKy + 1);
  assert.equal(dem() - truoc, 24);
  assert.deepEqual(k1, ketQua0); // dữ liệu không đổi -> kết quả y nguyên
  truoc = dem();
  CACHE.luyKe(ctx.db, {}, t0 + CACHE.LUY_KE_TUOI_NGAY_XA_MS - 1); // ngày xa còn hạn (6 giờ), ngày gần quá 10 phút
  assert.equal(dem() - truoc, 24);
  truoc = dem();
  // một ghi không liên quan làm dấu hiệu DB đổi để buộc đường chậm (kết quả vừa tính còn mới nên đường nhanh sẽ không xét tuổi từng cặp)
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, 'GV0000003VN', 'PTC', 1, '2026-10-06T10:00:00Z')").run(A);
  CACHE.luyKe(ctx.db, {}, t0 + CACHE.LUY_KE_TUOI_NGAY_XA_MS); // ngày xa chạm trần 6 giờ: tính lại; ngày gần vừa tính lại nên còn hạn
  assert.equal(dem() - truoc, 12);
  ctx.db.prepare("DELETE FROM phat_status_current WHERE shbg = 'GV0000003VN'").run();
  CACHE.xoaCache();
  assert.deepEqual([CACHE.thongKeLuyKe().ket_qua, CACHE.thongKeLuyKe().ngay], [0, 0]);
  for (let i = 0; i < CACHE.LUY_KE_KET_QUA_MAX + 40; i++) CACHE.luyKe(ctx.db, { den: new Date(Date.parse('2026-07-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10), receiver_code: i % 2 ? A : B });
  assert.equal(CACHE.thongKeLuyKe().ket_qua, CACHE.LUY_KE_KET_QUA_MAX);
  CACHE.xoaCache();
});

test('cache /luy-ke — nạp / «Thay thế» một ngày XA (> 3 ngày so với ngày mới nhất) phản ánh NGAY, tính lại đúng cặp đó, không chờ trần 6 giờ', async () => {
  CACHE.xoaCache();
  const truocBody = (await api(LK, 'admin')).body;
  const t0 = CACHE.thongKeLuyKe();
  const xa1 = truocBody.theo_ngay[0]; // ngày 1/10: cách ngày mới nhất 6/10 là 5 ngày
  const xa2 = truocBody.theo_ngay[1]; // ngày 2/10
  assert.deepEqual([xa1.ngay, xa2.ngay, truocBody.ngay_moi_nhat], [t10(1), t10(2), t10(6)]);
  // (1) NẠP thêm 4 lượt quá hạn vào (A, ngày 1)
  boDung(ctx.db).nap(A, t10(1), 4, 4);
  const sau1 = (await api(LK, 'admin')).body;
  const t1 = CACHE.thongKeLuyKe();
  assert.equal(t1.capTinhLai - t0.capTinhLai, 1); // đúng một cặp, ngày gần không bị tính lại
  assert.deepEqual([sau1.theo_ngay[0].den, sau1.theo_ngay[0].qua_han], [xa1.den + 4, xa1.qua_han + 4]);
  assert.deepEqual(sau1, json(QQ.luyKeQuyThoiGian(ctx.db, {})));
  // (2) «THAY THẾ» ngày 2 của A trong MỘT giao dịch: xóa dòng cũ, nạp lại cùng 100 lượt nhưng 40 quá hạn (trước: 20)
  const idsCu = ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items WHERE receiver_code = ? AND arrival_date = ?').get(A, t10(2)).n;
  assert.equal(idsCu, 100);
  const thayThe = boDung(ctx.db);
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM arrival_items WHERE receiver_code = ? AND arrival_date = ?').run(A, t10(2));
    thayThe.nap(A, t10(2), 100, 40);
  })();
  const sau2 = (await api(LK, 'admin')).body;
  const t2 = CACHE.thongKeLuyKe();
  assert.equal(t2.capTinhLai - t1.capTinhLai, 1);
  assert.deepEqual([sau2.theo_ngay[1].den, sau2.theo_ngay[1].qua_han], [xa2.den, xa2.qua_han + 20]);
  assert.equal(sau2.tong.dai.QUA_HAN, sau1.tong.dai.QUA_HAN + 20);
  assert.deepEqual(sau2, json(QQ.luyKeQuyThoiGian(ctx.db, {})));
  // (3) ngày xa KHÔNG đổi thì không tính lại dù có ghi khác (trần 6 giờ chỉ là trần)
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, 'GV0000002VN', 'PTC', 1, '2026-10-06T10:00:00Z')").run(A);
  await api(LK, 'admin');
  assert.equal(CACHE.thongKeLuyKe().capTinhLai, t2.capTinhLai);
  ctx.db.prepare("DELETE FROM phat_status_current WHERE shbg = 'GV0000002VN'").run();
});

test('tên gọi: thông báo lỗi và meta không dùng chữ «Quỹ thời gian»', async () => {
  const chuoi = [];
  for (const p of [`${TH}?from=2026-10-01&to=2026-11-05`, `${LUOT}?from=2026-10-01&to=2026-11-05`, `${TN}?from=2026-10-01&to=2026-11-05`, `${LK}?den=x`, `${TH}?khoa_la=1&from=2026-10-01&to=2026-10-02`]) chuoi.push(JSON.stringify((await api(p, 'admin')).body));
  chuoi.push(JSON.stringify((await api(LK, 'admin')).body.meta));
  for (const s of chuoi) assert.ok(!/quỹ thời gian/i.test(s), s);
});

// ------------------------------------------
// Đo (QTG_PERF=1): 6 BCVH × 31 ngày × 1.500 SHBG/ngày, DB trong bộ nhớ
// ------------------------------------------
test('đo lũy kế: lạnh / chỉ ghi bảng phát / một ngày đổi (QTG_PERF=1)', { skip: !process.env.QTG_PERF }, () => {
  const d = dbBoNho();
  d.exec('CREATE TABLE phat_status_current (bcvh TEXT, shbg TEXT)');
  const b = boDung(d);
  const ma = QQ_CODES();
  const t0 = process.hrtime.bigint();
  d.exec('BEGIN');
  for (const recv of ma) for (let n = 1; n <= 31; n++) { b.nap(recv, t10(n), 1500, 150); b.taoFile(recv, t10(n), 2); }
  d.exec('COMMIT');
  const ms = (x, y) => Math.round(Number(y - x) / 1e5) / 10;
  const dung = ms(t0, process.hrtime.bigint());
  CACHE.xoaCache();
  const m0 = process.hrtime.bigint(); const lanh = CACHE.luyKe(d, {}); const m1 = process.hrtime.bigint();
  const s0 = CACHE.thongKeLuyKe();
  CACHE.luyKe(d, {}); const m2 = process.hrtime.bigint();
  d.prepare("INSERT INTO phat_status_current (bcvh, shbg) VALUES ('x', 'y')").run();
  const p0 = process.hrtime.bigint(); const sauPhat = CACHE.luyKe(d, {}); const p1 = process.hrtime.bigint();
  const s1 = CACHE.thongKeLuyKe();
  b.nap(ma[0], t10(15), 5, 5); // MỘT (BCVH, ngày) đổi
  const n0 = process.hrtime.bigint(); const sauNgay = CACHE.luyKe(d, {}); const n1 = process.hrtime.bigint();
  const s2 = CACHE.thongKeLuyKe();
  const ngoai = QQ.luyKeQuyThoiGian(d, {}); const n2 = process.hrtime.bigint();
  // ---- QUYTG-9a điểm 8: tuổi tối đa theo tầng. Dùng `now` giả để đi qua 10 phút / 6 giờ.
  const goc = Date.now();
  const dem = () => CACHE.thongKeLuyKe().capTinhLai;
  let c0 = dem(); const g0 = process.hrtime.bigint();
  const sau10p = CACHE.luyKe(d, {}, goc + 11 * 60 * 1000); // quá 10 phút, dữ liệu không đổi: chỉ 4 ngày gần nhất (28..31) × 6 BCVH tính lại
  const g1 = process.hrtime.bigint(); const cap10p = dem() - c0;
  b.nap(ma[1], t10(5), 3, 3); // một cặp NGÀY XA (ngày 5, cách ngày mới nhất 26 ngày) đổi chữ ký
  c0 = dem(); const x0 = process.hrtime.bigint();
  const sauXa = CACHE.luyKe(d, {}, goc + 11 * 60 * 1000 + 1000);
  const x1 = process.hrtime.bigint(); const capXa = dem() - c0;
  d.prepare("INSERT INTO phat_status_current (bcvh, shbg) VALUES ('x', 'z')").run(); // buộc đường chậm; ngày xa chạm trần 6 giờ
  c0 = dem(); const y0 = process.hrtime.bigint();
  CACHE.luyKe(d, {}, goc + CACHE.LUY_KE_TUOI_NGAY_XA_MS + 1000);
  const y1 = process.hrtime.bigint(); const capTran = dem() - c0;
  console.log(`[QTG_PERF] diem 8: quá 10 phút (dữ liệu không đổi) ${ms(g0, g1)} ms (tính lại ${cap10p} cặp = ngày gần); một ngày XA đổi chữ ký ${ms(x0, x1)} ms (tính lại ${capXa} cặp, phản ánh ngay); `
    + `chạm trần 6 giờ ${ms(y0, y1)} ms (tính lại ${capTran} cặp)`);
  assert.deepEqual(sau10p, sauNgay);
  assert.equal(cap10p, 24);
  assert.equal(capXa, 1);
  assert.equal(sauXa.tong.tong_shbg, sauNgay.tong.tong_shbg + 3);
  assert.equal(capTran, 185); // 186 cặp trừ cặp ngày xa vừa tính lại ở bước trên
  console.log(`[QTG_PERF] luy-ke 6 BCVH × 31 ngày × 1.500 (dựng DB ${dung} ms): lạnh ${ms(m0, m1)} ms (${lanh.tong.tong_shbg} lượt); nóng ${ms(m1, m2)} ms; `
    + `sau ghi bảng phát ${ms(p0, p1)} ms (tính lại ${s1.capTinhLai - s0.capTinhLai} cặp); sau MỘT (BCVH, ngày) đổi ${ms(n0, n1)} ms (tính lại ${s2.capTinhLai - s1.capTinhLai} cặp); lõi không cache ${ms(n1, n2)} ms`);
  assert.equal(lanh.tong.tong_shbg, 6 * 31 * 1500);
  assert.deepEqual(sauPhat, lanh);
  assert.equal(s1.capTinhLai, s0.capTinhLai);
  assert.equal(s2.capTinhLai - s1.capTinhLai, 1);
  assert.equal(sauNgay.tong.tong_shbg, lanh.tong.tong_shbg + 5);
  assert.deepEqual(sauNgay, ngoai);
  assert.ok(ms(m0, m1) <= 5000, 'lạnh ≤ 5 giây');
  assert.ok(ms(p0, p1) <= 500, 'sau ghi bảng phát ≤ 0,5 giây');
  d.close();
});
function QQ_CODES() { return require('../server/lib/userBcvh').VALID_BCVH_CODES.slice().sort(); }
