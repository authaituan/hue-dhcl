// ==========================================
// Test VUHOI-2: API tỷ lệ «Đã vu hồi» theo NGÀY ĐẾN (GET /api/arrivals/dashboard/vu-hoi) và THÁNG (…/vu-hoi-thang).
// Server thật trên DB tạm; dữ liệu đến + lịch sử nhập GIẢ dựng thẳng vào DB (để điều khiển ngày nhập / hoàn tác). Không đụng data/.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { setTiviScope } = require('../server/lib/tivi');
const C = require('../server/config/phat');
const P = require('../server/lib/phat');
const PD = require('../server/lib/phatDashboard');

const PORT = 5980;
const NGAY = '/api/arrivals/dashboard/vu-hoi';
const THANG = '/api/arrivals/dashboard/vu-hoi-thang';
const KQP = '/api/arrivals/dashboard/ket-qua-phat';
const KQPT = '/api/arrivals/dashboard/ket-qua-phat-thang';
const B1 = '535470'; const B2 = '533140'; const B3 = '536250'; const B4 = '537015'; const B5 = '537220'; const B6 = '535790';
const TAT_CA = require('../server/lib/userBcvh').VALID_BCVH_CODES; // thứ tự thật của 6 BCVH
const tokens = {};
let ctx;
let adminId;
let n = 0;
const fileId = new Map();

const luu = (bc, day, shbg, gio = '09:00') => {
  const k = `${bc}|${day}`;
  if (!fileId.has(k)) {
    fileId.set(k, ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, ?, ?, '093012', 1, ?, 1, 1, 'OK')")
      .run(bc, `T_${bc}_${day}.csv`, day, `${bc}${day}`).lastInsertRowid);
  }
  const t = `${day} ${gio}:00`;
  ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key)
    VALUES (?, ?, 'Đường A', ?, ?, ?, ?, 'bag', ?, 1, ?, 'phuong an')`).run(fileId.get(k), bc, shbg, `B${shbg}${day}`, t, t, day, day);
};
const batch = (bc, nhapLuc, huy = false) => ctx.db.prepare("INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap, trang_thai) VALUES (?, ?, ?, 1, ?)")
  .run(bc, adminId, nhapLuc, huy ? C.TRANG_THAI_DOT.DA_HOAN_TAC : C.TRANG_THAI_DOT.DA_NHAP).lastInsertRowid;
const nhapLs = (bc, shbg, tt, vh, nhapLuc, huy = false) => ctx.db.prepare('INSERT INTO phat_status_history (bcvh, shbg, trang_thai, da_vu_hoi, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?, ?)')
  .run(bc, shbg, tt, vh, batch(bc, nhapLuc, huy), nhapLuc);
/** (BCVH, ngày): pktc SHBG PKTC (vh trong số đó có cờ) + ptc SHBG PTC; bản nhập cùng ngày (10:00 UTC = 17:00 VN). */
function dung(bc, day, pktc, vh, ptc = 0) {
  const nl = `${day}T10:00:00Z`;
  for (let i = 0; i < pktc + ptc; i++) {
    const s = `ZT${String(900000000 + (++n))}VN`;
    luu(bc, day, s, `${String(6 + (i % 14)).padStart(2, '0')}:00`);
    if (i < pktc) nhapLs(bc, s, 'PKTC', i < vh ? 1 : 0, nl);
    else nhapLs(bc, s, 'PTC', 0, nl);
  }
}

async function call(p, who = 'admin') {
  const headers = who ? { Authorization: `Bearer ${tokens[who]}` } : {};
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  return { status: res.status, body: await res.json() };
}
const ok = async (p, who) => { const r = await call(p, who); assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; };
const bc = (body, ma) => body.theo_bcvh.find((x) => x.bcvh === ma);
const gom = (x) => [x.pktc, x.da_vu_hoi, x.ty_le, x.hien_thi];

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-vuhoi-tyle-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  const USERS = {
    admin: { role: 'ADMIN' }, ttvh: { role: 'TTVH' }, gdvh: { role: 'GDVH' }, tivi: { role: 'TIVI' }, tivi_b1: { role: 'TIVI', scope: B1 }
  };
  for (const [k, u] of Object.entries(USERS)) {
    const id = seedUser(ctx.db, { hrmCode: `VT_${k}`, fullName: `VT_${k}`, role: u.role, password: 'Test@12345' });
    if (k === 'admin') adminId = id;
    if (k === 'tivi') setTiviScope(ctx.db, id, 'all');
    if (u.scope) setTiviScope(ctx.db, id, u.scope);
    tokens[k] = (await loginAs(ctx.baseUrl, `VT_${k}`, 'Test@12345')).body.token;
  }
  // Ca số học (ngày 02/10 và 05/10); B4 không có dữ liệu.
  dung(B1, '2026-10-02', 12, 3, 88);   // 3/12 -> 0,25 TY_LE
  dung(B1, '2026-10-05', 10, 2, 15);   // biên 10 -> TY_LE
  dung(B2, '2026-10-02', 9, 1, 30);    // biên 9 -> SO_TUYET_DOI
  dung(B2, '2026-10-05', 3, 0, 20);    // 0/3 -> CHUA_CO_SO_LIEU
  dung(B3, '2026-10-02', 12, 0, 20);   // 0/12
  dung(B5, '2026-10-02', 3, 1, 20);    // 1/3 -> SO_TUYET_DOI
  // Ranh giới tháng: 30/09 và 01/11 không thuộc tháng 10; 01/10 và 31/10 thuộc.
  dung(B1, '2026-09-30', 10, 5, 5);
  dung(B1, '2026-11-01', 10, 5, 5);
  dung(B1, '2026-10-01', 10, 4, 0);
  dung(B1, '2026-10-31', 10, 1, 0);
  // #92: X đến 03/10 và 08/10; bản nhập vu hồi lúc 05/10 10:00 VN (03:00Z) ∈ [03/10, 08/10) -> chỉ tính cho 03/10. Y đến 08/10, nhập vu hồi 09/10 -> chỉ tính cho 08/10.
  luu(B6, '2026-10-03', 'ZTX1VN'); luu(B6, '2026-10-08', 'ZTX1VN');
  nhapLs(B6, 'ZTX1VN', 'PKTC', 1, '2026-10-05T03:00:00Z');
  luu(B6, '2026-10-08', 'ZTY1VN');
  nhapLs(B6, 'ZTY1VN', 'PKTC', 1, '2026-10-09T03:00:00Z');
  // Bản cuối quyết định / hoàn tác, ngày 12/10 của B6.
  for (const s of ['ZTZ1VN', 'ZTZ2VN', 'ZTZ3VN', 'ZTZ4VN', 'ZTZ5VN']) luu(B6, '2026-10-12', s);
  nhapLs(B6, 'ZTZ1VN', 'PKTC', 1, '2026-10-12T02:00:00Z'); nhapLs(B6, 'ZTZ1VN', 'PTC', 0, '2026-10-13T02:00:00Z');   // vu hồi rồi PTC -> không PKTC
  nhapLs(B6, 'ZTZ2VN', 'PKTC', 1, '2026-10-12T02:00:00Z'); nhapLs(B6, 'ZTZ2VN', 'PKTC', 0, '2026-10-13T02:00:00Z');  // vu hồi rồi PKTC không cờ -> không cờ
  nhapLs(B6, 'ZTZ3VN', 'PKTC', 1, '2026-10-12T02:00:00Z'); nhapLs(B6, 'ZTZ3VN', 'PKTC', 0, '2026-10-13T02:00:00Z', true); // đợt «bỏ cờ» bị hoàn tác -> cờ trở lại
  nhapLs(B6, 'ZTZ4VN', 'PKTC', 0, '2026-10-12T02:00:00Z'); nhapLs(B6, 'ZTZ4VN', 'PKTC', 1, '2026-10-13T02:00:00Z', true); // đợt vu hồi bị hoàn tác -> không cờ
  nhapLs(B6, 'ZTZ5VN', 'PKTC', 1, '2026-10-12T02:00:00Z');
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

test('1. tính đúng: 12 PKTC, 3 vu hồi -> ty_le 0,25 TY_LE; nguong_mau_so = 10; khóa phản hồi', async () => {
  const r = await ok(`${NGAY}?ngay_den=2026-10-02&bcvh=${B1}`);
  assert.deepEqual(gom(r.tong), [12, 3, 0.25, 'TY_LE']);
  assert.deepEqual(Object.keys(r), ['ngay_den', 'bcvh', 'nguong_mau_so', 'tong', 'theo_bcvh']);
  assert.deepEqual([r.ngay_den, r.bcvh, r.nguong_mau_so], ['2026-10-02', B1, 10]);
  assert.deepEqual(r.theo_bcvh, [{ bcvh: B1, pktc: 12, da_vu_hoi: 3, ty_le: 0.25, hien_thi: 'TY_LE' }]);
  assert.equal(C.NGUONG_MAU_SO_VU_HOI, 10);
});

test('2. tử số 0 -> CHUA_CO_SO_LIEU, ty_le null (0/12, 0/0, 0/3)', async () => {
  const r = await ok(`${NGAY}?ngay_den=2026-10-02&bcvh=all`);
  assert.deepEqual(gom(bc(r, B3)), [12, 0, null, 'CHUA_CO_SO_LIEU'], '0/12');
  assert.deepEqual(gom(bc(r, B4)), [0, 0, null, 'CHUA_CO_SO_LIEU'], '0/0');
  const r5 = await ok(`${NGAY}?ngay_den=2026-10-05&bcvh=${B2}`);
  assert.deepEqual(gom(r5.tong), [3, 0, null, 'CHUA_CO_SO_LIEU'], '0/3: tử số 0 thắng mẫu số < 10');
  assert.deepEqual(r.theo_bcvh.map((x) => x.bcvh), TAT_CA, 'đủ 6 BCVH, kể cả mẫu số 0');
});

test('3. mẫu số < 10 -> SO_TUYET_DOI (1/3); biên 10 -> TY_LE, 9 -> SO_TUYET_DOI', async () => {
  const r = await ok(`${NGAY}?ngay_den=2026-10-02&bcvh=all`);
  assert.deepEqual(gom(bc(r, B5)), [3, 1, null, 'SO_TUYET_DOI']);
  assert.deepEqual(gom(bc(r, B2)), [9, 1, null, 'SO_TUYET_DOI'], 'biên 9');
  const r5 = await ok(`${NGAY}?ngay_den=2026-10-05&bcvh=${B1}`);
  assert.deepEqual(gom(r5.tong), [10, 2, 0.2, 'TY_LE'], 'biên 10');
  // tổng toàn Trung tâm = cộng các BCVH rồi áp quy tắc (12+9+12+3 = 36 PKTC; 3+1+0+1 = 5 vu hồi)
  assert.deepEqual([r.tong.pktc, r.tong.da_vu_hoi, r.tong.hien_thi], [36, 5, 'TY_LE']);
  assert.equal(r.tong.ty_le, 5 / 36, 'không làm tròn ở máy chủ');
  assert.deepEqual([r.tong.pktc, r.tong.da_vu_hoi], [r.theo_bcvh.reduce((a, x) => a + x.pktc, 0), r.theo_bcvh.reduce((a, x) => a + x.da_vu_hoi, 0)]);
});

test('4. khớp mẫu số: pktc bằng PKTC của ket-qua-phat (ngày) và ket-qua-phat-thang (tháng), cả khi có vu hồi', async () => {
  PD.xoaCachePhatThang();
  for (const d of ['2026-10-02', '2026-10-05']) {
    for (const ma of TAT_CA) {
      const mine = bc(await ok(`${NGAY}?ngay_den=${d}&bcvh=${ma}`), ma);
      const k = await ok(`${KQP}?bcvh=${ma}&ngay=${d}`);
      assert.equal(mine.pktc, k.theo_trang_thai.PKTC.so, `${ma} ${d}`);
    }
    const all = await ok(`${NGAY}?ngay_den=${d}&bcvh=all`);
    const k = await ok(`${KQP}?bcvh=all&ngay=${d}`);
    assert.equal(all.tong.pktc, k.theo_trang_thai.PKTC.so, `all ${d}`);
  }
  // Tháng: luy_ke của ket-qua-phat-thang (ngày 05/10, các ngày đủ số liệu) = cộng dồn theo_ngay 01..05/10 của API mới.
  for (const ma of [B1, B2]) {
    const t = await ok(`${THANG}?thang=2026-10&bcvh=${ma}`);
    const den05 = t.theo_ngay.filter((x) => x.ngay_den <= '2026-10-05').reduce((a, x) => a + x.pktc, 0);
    const kt = await ok(`${KQPT}?bcvh=${ma}&ngay=2026-10-05`);
    assert.equal(den05, kt.luy_ke.theo_trang_thai.PKTC.so, `tháng ${ma}`);
  }
});

test('5. #92: SHBG đến hai ngày — bản nhập vu hồi ngày nhập N, D1 <= N < D2 -> tính cho D1, không cho D2', async () => {
  const d1 = await ok(`${NGAY}?ngay_den=2026-10-03&bcvh=${B6}`);
  assert.deepEqual(gom(d1.tong), [1, 1, null, 'SO_TUYET_DOI'], 'D1 nhận bản nhập vu hồi');
  const d2 = await ok(`${NGAY}?ngay_den=2026-10-08&bcvh=${B6}`);
  // 08/10 của B6: X (đến lại, không có bản nhập từ 08/10) + Y (vu hồi nhập 09/10) -> chỉ Y
  assert.deepEqual(gom(d2.tong), [1, 1, null, 'SO_TUYET_DOI'], 'D2 chỉ có Y; X không bị tính vu hồi');
  assert.equal(P.demNgay(ctx.db, B6, '2026-10-08', { theoLichSu: true }).tong.PKTC, 1, 'đối chiếu demNgay theoLichSu');
});

test('6. bản cuối quyết định; đợt đã hoàn tác bị bỏ qua', async () => {
  const r = await ok(`${NGAY}?ngay_den=2026-10-12&bcvh=${B6}`);
  // Z1 PTC (mất), Z2 PKTC không cờ, Z3 cờ trở lại (đợt bỏ cờ bị hoàn tác), Z4 không cờ (đợt vu hồi bị hoàn tác), Z5 vu hồi -> PKTC 4, vu hồi 2
  assert.deepEqual(gom(r.tong), [4, 2, null, 'SO_TUYET_DOI']);
});

test('7. tháng: tổng theo_ngay = tong; all = tổng theo_bcvh; ngày trống 0/0; ranh giới tháng', async () => {
  const t = await ok(`${THANG}?thang=2026-10&bcvh=all`);
  assert.deepEqual(Object.keys(t), ['thang', 'bcvh', 'nguong_mau_so', 'tong', 'theo_bcvh', 'theo_ngay']);
  assert.equal(t.theo_ngay.length, 31);
  assert.deepEqual([t.theo_ngay[0].ngay_den, t.theo_ngay[30].ngay_den], ['2026-10-01', '2026-10-31']);
  const s = (ds, k) => ds.reduce((a, x) => a + x[k], 0);
  for (const k of ['pktc', 'da_vu_hoi']) {
    assert.equal(s(t.theo_ngay, k), t.tong[k], `Σ theo_ngay.${k}`);
    assert.equal(s(t.theo_bcvh, k), t.tong[k], `Σ theo_bcvh.${k}`);
  }
  assert.deepEqual(t.theo_bcvh.map((x) => x.bcvh), TAT_CA);
  assert.deepEqual(gom(t.theo_ngay.find((x) => x.ngay_den === '2026-10-04')), [0, 0, null, 'CHUA_CO_SO_LIEU'], 'ngày không có hàng đến');
  // B1 tháng 10: 02/10 12/3, 05/10 10/2, 01/10 10/4, 31/10 10/1 -> 42/10; 30/09 và 01/11 không tính
  const b1 = await ok(`${THANG}?thang=2026-10&bcvh=${B1}`);
  assert.deepEqual(gom(b1.tong), [42, 10, 10 / 42, 'TY_LE']);
  assert.deepEqual(gom(b1.theo_ngay[0]), [10, 4, 0.4, 'TY_LE'], '01/10');
  assert.deepEqual(gom(b1.theo_ngay[30]), [10, 1, 0.1, 'TY_LE'], '31/10');
  assert.equal(b1.theo_bcvh.length, 1);
  // Tháng liền kề: 09 và 11 chỉ có 1 ngày dữ liệu mỗi tháng
  assert.deepEqual(gom((await ok(`${THANG}?thang=2026-09&bcvh=${B1}`)).tong), [10, 5, 0.5, 'TY_LE']);
  assert.deepEqual(gom((await ok(`${THANG}?thang=2026-11&bcvh=${B1}`)).tong), [10, 5, 0.5, 'TY_LE']);
  // Tháng không có dữ liệu, tương lai: 0/0
  const trong = await ok(`${THANG}?thang=2027-02&bcvh=all`);
  assert.equal(trong.theo_ngay.length, 28);
  assert.deepEqual(gom(trong.tong), [0, 0, null, 'CHUA_CO_SO_LIEU']);
  assert.deepEqual(gom((await ok(`${NGAY}?ngay_den=2030-01-01`)).tong), [0, 0, null, 'CHUA_CO_SO_LIEU']);
});

test('8. quyền như ket-qua-phat-thang; ngày: TIVI theo allowlist; không đăng nhập; tham số sai -> 400', async () => {
  for (const who of ['admin', 'ttvh', 'gdvh', 'tivi', 'tivi_b1', null]) {
    const ref = await call(`${KQPT}?bcvh=all&ngay=2026-10-02`, who);
    const t = await call(`${THANG}?thang=2026-10&bcvh=all`, who);
    const d = await call(`${NGAY}?ngay_den=2026-10-02&bcvh=all`, who);
    assert.equal(t.status, ref.status, `tháng ${who}`);
    assert.equal(d.status, ref.status, `ngày ${who}`);
  }
  assert.equal((await call(`${NGAY}?ngay_den=2026-10-02`, null)).status, 401);
  for (const who of ['tivi', 'tivi_b1']) {
    assert.equal((await call(`${NGAY}?ngay_den=2026-10-02`, who)).status, 403, `TIVI (${who}) không xem số vu hồi: ngày`);
    assert.equal((await call(`${THANG}?thang=2026-10`, who)).status, 403, `TIVI (${who}) không xem số vu hồi: tháng`);
  }
  for (const p of [`${NGAY}`, `${NGAY}?ngay_den=2026-13-01`, `${NGAY}?ngay_den=02/10/2026`, `${NGAY}?ngay_den=2026-10-02&bcvh=999999`, `${NGAY}?ngay_den=2026-10-02&x=1`,
    `${NGAY}?ngay_den=2026-10-02&ngay_den=2026-10-03`, `${NGAY}?ngay=2026-10-02`,
    `${THANG}`, `${THANG}?thang=2026-13`, `${THANG}?thang=2026-10-02`, `${THANG}?thang=2026-10&bcvh=abc`, `${THANG}?thang=2026-10&ngay=2026-10-02`]) {
    const r = await call(p, 'admin');
    assert.equal(r.status, 400, p);
    assert.ok(r.body.error && r.body.error.length > 10, p);
  }
});

test('9. bất biến: gọi hai API mới không đổi demNgay, ty-le, ket-qua-phat, ket-qua-phat-thang; tai-ve vẫn 8 cột', async () => {
  const chup = async () => {
    PD.xoaCachePhatThang();
    const tv = await call(`/api/phat/tai-ve?ngay_den=2026-10-02&bcvh=${B1}`);
    assert.equal(tv.status, 200);
    const bang = [];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tv.buf);
    wb.worksheets[0].eachRow({ includeEmpty: false }, (row) => bang.push(Array.from({ length: 8 }, (_, i) => row.getCell(i + 1).value)));
    return {
      demNgay: ['2026-10-02', '2026-10-05'].map((d) => P.demNgay(ctx.db, B1, d, { demLoaiBo: true, theoLichSu: true })),
      tyLe: await ok(`/api/phat/ty-le?bcvh=${B1}&ngay=2026-10-02`),
      ketQuaPhat: [await ok(`${KQP}?bcvh=all&ngay=2026-10-02`), await ok(`${KQP}?bcvh=${B1}&ngay=2026-10-05`)],
      ketQuaPhatThang: await ok(`${KQPT}?bcvh=all&ngay=2026-10-05`),
      taiVe: bang
    };
  };
  const truoc = await chup();
  await ok(`${NGAY}?ngay_den=2026-10-02&bcvh=all`);
  await ok(`${THANG}?thang=2026-10&bcvh=all`);
  const sau = await chup();
  assert.deepEqual(sau, truoc);
  assert.equal(sau.taiVe[0].length, 8);
  assert.equal(sau.taiVe.length - 1, sau.tyLe.mau_so, 'số dòng tai-ve = mẫu số ty-le');
});

test('10. bộ nhớ đệm vh1|: nhập mới / hoàn tác đợt vô hiệu ngay; không đổi dữ liệu thì kết quả giống hệt', async () => {
  const url = `${NGAY}?ngay_den=2026-10-05&bcvh=${B2}`;
  const thang = `${THANG}?thang=2026-10&bcvh=${B2}`;
  const a = await ok(url);
  const ta = await ok(thang);
  assert.deepEqual(await ok(url), a, 'lần hai (trúng cache) giống lần đầu');
  assert.deepEqual(gom(a.tong), [3, 0, null, 'CHUA_CO_SO_LIEU']);
  const s = ctx.db.prepare(`SELECT h.shbg AS s FROM phat_status_history h JOIN arrival_items a ON a.tracking_no = h.shbg AND a.receiver_code = h.bcvh
    WHERE h.bcvh = ? AND a.arrival_date = '2026-10-05' AND h.trang_thai = 'PKTC' ORDER BY h.id LIMIT 1`).get(B2).s;
  const id = nhapLs(B2, s, 'PKTC', 1, '2026-10-06T03:00:00Z').lastInsertRowid; // đợt nhập mới (ghi DB -> dấu hiệu DB đổi)
  assert.deepEqual(gom((await ok(url)).tong), [3, 1, null, 'SO_TUYET_DOI'], 'nhập mới');
  assert.equal((await ok(thang)).tong.da_vu_hoi, ta.tong.da_vu_hoi + 1, 'tháng cũng đổi');
  const bid = ctx.db.prepare('SELECT batch_id AS b FROM phat_status_history WHERE id = ?').get(id).b;
  ctx.db.prepare("UPDATE phat_batches SET trang_thai = ?, hoan_tac_luc = '2026-10-06T04:00:00Z' WHERE id = ?").run(C.TRANG_THAI_DOT.DA_HOAN_TAC, bid); // hoàn tác đợt
  assert.deepEqual(await ok(url), a, 'hoàn tác đợt -> về như cũ');
  assert.deepEqual(await ok(thang), ta);
});

test('11. tháng dùng đúng tập ngày của ket-qua-phat-thang: ngày KHÔNG có file và ngày có file nhưng chưa «đủ số liệu» bị loại', async () => {
  // B4 tháng 12/2026: 01/12 hợp lệ (10 PKTC, 2 vu hồi); 02/12 KHÔNG có file (4 PKTC, 3 vu hồi); 03/12 có file nhưng chưa đủ số liệu (4 PKTC, 2 vu hồi + 6 SHBG chưa có TT = 60%)
  dung(B4, '2026-12-01', 10, 2, 5);
  const fid = fileId.get(`${B4}|2026-12-01`);
  const them = (day, shbg, fi) => ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key)
    VALUES (?, ?, 'Đường A', ?, ?, ?, ?, 'bag', ?, 1, ?, 'phuong an')`).run(fi, B4, shbg, `B${shbg}${day}`, `${day} 09:00:00`, `${day} 09:00:00`, day, day);
  for (let i = 0; i < 4; i++) { const sh = `ZTK${i}VN`; them('2026-12-02', sh, fid); nhapLs(B4, sh, 'PKTC', i < 3 ? 1 : 0, '2026-12-02T10:00:00Z'); }
  dung(B4, '2026-12-03', 4, 2, 0);
  for (let i = 0; i < 6; i++) luu(B4, '2026-12-03', `ZTC${i}VN`);
  PD.xoaCachePhatThang();
  const kqpt = await ok(`${KQPT}?bcvh=${B4}&ngay=2026-12-31`);
  const theoNgay = Object.fromEntries(kqpt.theo_ngay.map((x) => [x.ngay, x.du_so_lieu]));
  assert.deepEqual([theoNgay['2026-12-01'], theoNgay['2026-12-02'], theoNgay['2026-12-03']], [true, false, false], 'tiền đề: đúng điều kiện thật của ket-qua-phat-thang');
  const t = await ok(`${THANG}?thang=2026-12&bcvh=${B4}`);
  assert.deepEqual(gom(t.tong), [10, 2, 0.2, 'TY_LE'], 'chỉ ngày 01/12');
  assert.deepEqual(gom(t.theo_ngay[1]), [0, 0, null, 'CHUA_CO_SO_LIEU'], 'ngày không file bị loại');
  assert.deepEqual(gom(t.theo_ngay[2]), [0, 0, null, 'CHUA_CO_SO_LIEU'], 'ngày chưa đủ số liệu bị loại');
  assert.deepEqual(t.theo_ngay.map((x) => x.du_so_lieu).slice(0, 3), [true, false, false]);
  assert.equal(t.theo_ngay.length, 31);
  // Mọi BCVH, hai tháng: pktc tháng = PKTC lũy kế của ket-qua-phat-thang
  for (const [thang, cuoi] of [['2026-12', '2026-12-31'], ['2026-10', '2026-10-31']]) {
    const all = await ok(`${THANG}?thang=${thang}&bcvh=all`);
    for (const ma of TAT_CA) {
      const mine = bc(await ok(`${THANG}?thang=${thang}&bcvh=${ma}`), ma);
      const ref = (await ok(`${KQPT}?bcvh=${ma}&ngay=${cuoi}`)).luy_ke.theo_trang_thai.PKTC.so;
      assert.equal(mine.pktc, ref, `${thang} ${ma}`);
    }
    // all: so với ket-qua-phat-thang bcvh=all (đủ số liệu xét trên tập gộp), không phải Σ từng BCVH
    assert.equal(all.tong.pktc, (await ok(`${KQPT}?bcvh=all&ngay=${cuoi}`)).luy_ke.theo_trang_thai.PKTC.so, `${thang}: tong all = PKTC lũy kế ket-qua-phat-thang all`);
    assert.equal(all.theo_bcvh.reduce((x, y) => x + y.pktc, 0), all.tong.pktc, `${thang}: Σ theo_bcvh = tong`);
  }
});

test('12. all dùng tập ngày «đủ số liệu» của all: B có file, riêng chưa đủ nhưng gộp với A thì đủ', async () => {
  // Tháng 11/2026 (B3 = 536250 là A, B5 = 537220 là B): 03/11 A 20 PKTC (4 vu hồi) + 80 PTC; B 5 PKTC (2 vu hồi) + 5 SHBG chưa có TT (50% -> riêng chưa đủ; gộp 5/110 -> đủ)
  dung(B3, '2026-11-03', 20, 4, 80);
  dung(B5, '2026-11-03', 5, 2, 0);
  for (let i = 0; i < 5; i++) luu(B5, '2026-11-03', `ZTN${i}VN`);
  PD.xoaCachePhatThang();
  const cuoi = '2026-11-30';
  const kAll = (await ok(`${KQPT}?bcvh=all&ngay=${cuoi}`)).luy_ke.theo_trang_thai.PKTC.so;
  const kB = (await ok(`${KQPT}?bcvh=${B5}&ngay=${cuoi}`)).luy_ke.theo_trang_thai.PKTC.so;
  assert.equal(kB, 0, 'B riêng chưa đủ số liệu');
  let tongRieng = 0;
  for (const ma of TAT_CA) tongRieng += (await ok(`${KQPT}?bcvh=${ma}&ngay=${cuoi}`)).luy_ke.theo_trang_thai.PKTC.so;
  assert.equal(kAll - tongRieng, 5, 'tiền đề: ket-qua-phat-thang all tính thêm đúng 5 PKTC của B so với Σ từng BCVH');
  const all = await ok(`${THANG}?thang=2026-11&bcvh=all`);
  assert.equal(all.tong.pktc, kAll, 'tong all = PKTC lũy kế ket-qua-phat-thang all');
  assert.equal(all.theo_bcvh.reduce((x, y) => x + y.pktc, 0), all.tong.pktc, 'Σ theo_bcvh = tong');
  assert.deepEqual(gom(bc(all, B5)).slice(0, 2), [5, 2], 'B trong all: 5/2');
  assert.equal(all.theo_ngay.find((x) => x.ngay_den === '2026-11-03').du_so_lieu, true);
  const b = bc(await ok(`${THANG}?thang=2026-11&bcvh=${B5}`), B5);
  assert.equal(b.pktc, kB, 'bcvh=B vẫn bằng ket-qua-phat-thang bcvh=B');
  assert.equal(b.pktc, 0);
});
