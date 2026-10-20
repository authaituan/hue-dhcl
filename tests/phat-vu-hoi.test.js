// ==========================================
// Test VUHOI-1: «Đã vu hồi» là CỜ PHỤ của PKTC (cột da_vu_hoi), không phải trạng thái thứ 6.
// 1 migration (DB schema cũ), 2 ánh xạ nhãn, 3 quy tắc danhGia, 4 ghi current + history, 5 hoàn tác, 6 vòng khứ hồi file mẫu tat-ca (+ file lỗi),
// 7 bất biến số liệu (demNgay, ty-le, ket-qua-phat, ket-qua-phat-thang, tai-ve), 8 API biên tập. Server thật trên DB tạm; CSV / SHBG / người dùng GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');
const Database = require('better-sqlite3'); // nạp TRƯỚC khi harness thay thế (ca migration cần DB riêng trong bộ nhớ)
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const C = require('../server/config/phat');
const P = require('../server/lib/phat');
const PD = require('../server/lib/phatDashboard');

const PORT = 5979;
const B = '535470';
const NGAY_A = '2026-10-02';
const NGAY_B = '2026-10-04';
const BOM = '\uFEFF';
const tokens = {};
let ctx;
let workDir;

const sh = (n) => `ZZ${String(900000000 + n)}VN`;
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;

// Dữ liệu đến giả: ngày A có sh(1..16) (giờ rải các khung), ngày B có sh(17), sh(18).
const GIO_A = ['07:00', '08:30', '10:15', '11:00', '12:30', '13:15', '14:20', '15:40', '16:10', '17:30', '18:05', '19:00', '09:00', '09:30', '11:30', '13:45'];
const DEN = [
  ...GIO_A.map((g, i) => ({ shbg: sh(i + 1), luc: `${NGAY_A} ${g}:00` })),
  { shbg: sh(17), luc: `${NGAY_B} 09:15:00` }, { shbg: sh(18), luc: `${NGAY_B} 14:00:00` }
];
function dongCsv(d, i) {
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: B, Ten_duong_thu: 'Đường A', SHBG: d.shbg, So_hieu_BD10: '', 'Thời gian XN túi': d.luc, 'Thời gian XN BG': 'NULL',
    Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: `VH${i + 1}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R',
    Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
function ghiCsv() {
  const theoNgay = new Map();
  DEN.forEach((d, i) => {
    const k = d.luc.slice(0, 10).replace(/-/g, '');
    if (!theoNgay.has(k)) theoNgay.set(k, []);
    theoNgay.get(k).push(dongCsv(d, i));
  });
  const files = [];
  for (const [ymd, rows] of theoNgay) {
    const file = path.join(workDir, 'csv', `HangDen_${B}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = [EXPECTED_HEADER.map(qt).join(','), ...rows.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))];
    fs.writeFileSync(file, BOM + lines.join('\r\n') + '\r\n');
    files.push(file);
  }
  return files.sort();
}

async function api(method, p, body, { binary = false } = {}) {
  const headers = { Authorization: `Bearer ${tokens.admin}` };
  let payload;
  if (Buffer.isBuffer(body)) { headers['Content-Type'] = 'application/octet-stream'; payload = body; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${ctx.baseUrl}${p}`, { method, headers, body: payload });
  if (binary) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}
async function fileNhap(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['SHBG', 'Trạng thái', 'Ghi chú']);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const docXlsx = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
const taiLenBuf = (buf, ten = 'vh.xlsx') => api('POST', `/api/phat/drafts?bcvh=${B}&ten_file=${encodeURIComponent(ten)}`, buf);
const taiLen = async (rows) => taiLenBuf(await fileNhap(rows));
const dongBan = async (id) => (await api('GET', `/api/phat/drafts/${id}/rows?size=200`)).body.items;
const theoShbg = (items) => Object.fromEntries(items.map((i) => [i.shbg, i]));
const commit = (id) => api('POST', `/api/phat/drafts/${id}/commit`, { mode: 'hop-le' });
async function nhap(rows) {
  const up = await taiLen(rows);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const c = await commit(up.body.id);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body;
}
const hienTai = (s) => {
  const x = ctx.db.prepare('SELECT trang_thai, da_vu_hoi FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(B, s);
  return x ? [x.trang_thai, x.da_vu_hoi] : null;
};
const lichSu = (s) => ctx.db.prepare('SELECT trang_thai, da_vu_hoi, trang_thai_truoc FROM phat_status_history WHERE bcvh = ? AND shbg = ? ORDER BY id').all(B, s)
  .map((h) => [h.trang_thai, h.da_vu_hoi, h.trang_thai_truoc]);
const hoanTac = (id) => api('POST', `/api/phat/batches/${id}/undo`);

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-vuhoi-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-vuhoi-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  seedUser(ctx.db, { hrmCode: 'VH_ADMIN', fullName: 'VH_ADMIN', role: 'ADMIN', password: 'Admin@123' });
  tokens.admin = (await loginAs(ctx.baseUrl, 'VH_ADMIN', 'Admin@123')).body.token;
  for (const f of ghiCsv()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

// ---------------- 1. Migration ----------------
test('1. migration trên DB schema cũ: ensurePhatSchema 2 lần, dòng cũ cờ 0, mã cũ vẫn ghi được, CHECK chặn cờ khi trạng thái khác PKTC', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE phat_status_current (bcvh TEXT NOT NULL, shbg TEXT NOT NULL,
      trang_thai TEXT NOT NULL CHECK (trang_thai IN ('PTC','PKTC','CHUYEN_HOAN','CHUA_CO_TT','LAC_HUONG')),
      ghi_chu TEXT, batch_id INTEGER NOT NULL, nhap_luc TEXT NOT NULL, gio_phat TEXT, PRIMARY KEY (bcvh, shbg));
    CREATE TABLE phat_status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, bcvh TEXT NOT NULL, shbg TEXT NOT NULL, trang_thai TEXT NOT NULL,
      trang_thai_truoc TEXT, ghi_chu TEXT, batch_id INTEGER NOT NULL, nhap_luc TEXT NOT NULL);
    CREATE TABLE phat_draft_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, draft_id TEXT NOT NULL, so_dong_goc INTEGER NOT NULL, shbg TEXT NOT NULL,
      trang_thai_file TEXT NOT NULL DEFAULT '', trang_thai TEXT, ghi_chu TEXT, ghi_chu_bi_cat INTEGER NOT NULL DEFAULT 0, loi_o TEXT,
      trang_thai_hien_co TEXT, ket_qua TEXT NOT NULL DEFAULT 'BO_QUA_TRONG', ma_loi TEXT, chi_tiet_loi TEXT, canh_bao TEXT, batch_id INTEGER);
    INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES ('1', 'A', 'PTC', 1, 'x'), ('1', 'B', 'PKTC', 1, 'x');
    INSERT INTO phat_status_history (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES ('1', 'A', 'PTC', 1, 'x');
    INSERT INTO phat_draft_rows (draft_id, so_dong_goc, shbg) VALUES ('d', 2, 'A');`);
  P.ensurePhatSchema(db);
  P.ensurePhatSchema(db); // lần hai: không lỗi, không thêm trùng
  const cot = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  for (const t of ['phat_status_current', 'phat_status_history', 'phat_draft_rows']) assert.equal(cot(t).filter((c) => c === 'da_vu_hoi').length, 1, t);
  assert.ok(cot('phat_draft_rows').includes('hien_co_vu_hoi'));
  assert.deepEqual(db.prepare('SELECT da_vu_hoi AS v FROM phat_status_current ORDER BY shbg').all().map((x) => x.v), [0, 0], 'dòng cũ đọc ra 0');
  assert.equal(db.prepare('SELECT da_vu_hoi AS v FROM phat_status_history').get().v, 0);
  assert.deepEqual(Object.values(db.prepare('SELECT da_vu_hoi, hien_co_vu_hoi FROM phat_draft_rows').get()), [0, 0]);

  // Câu lệnh kiểu cũ (không nêu cột mới) vẫn chạy
  db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES ('1', 'C', 'LAC_HUONG', 2, 'x')").run();
  db.prepare("INSERT INTO phat_status_history (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES ('1', 'C', 'LAC_HUONG', 2, 'x')").run();

  // CHECK chéo: cờ chỉ đi với PKTC; giá trị ngoài 0/1 bị chặn
  db.prepare("UPDATE phat_status_current SET da_vu_hoi = 1 WHERE shbg = 'B'").run();
  assert.throws(() => db.prepare("UPDATE phat_status_current SET da_vu_hoi = 1 WHERE shbg = 'A'").run(), /CHECK/);
  assert.throws(() => db.prepare("UPDATE phat_status_current SET trang_thai = 'PTC' WHERE shbg = 'B'").run(), /CHECK/, 'đổi trạng thái mà giữ cờ');
  assert.throws(() => db.prepare("UPDATE phat_status_current SET da_vu_hoi = 2 WHERE shbg = 'B'").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO phat_status_history (bcvh, shbg, trang_thai, da_vu_hoi, batch_id, nhap_luc) VALUES ('1', 'D', 'PTC', 1, 3, 'x')").run(), /CHECK/);
  db.prepare("INSERT INTO phat_status_history (bcvh, shbg, trang_thai, da_vu_hoi, batch_id, nhap_luc) VALUES ('1', 'D', 'PKTC', 1, 3, 'x')").run();
  assert.throws(() => db.prepare('UPDATE phat_draft_rows SET da_vu_hoi = 2').run(), /CHECK/);
  // CHECK 5 mã của trang_thai không đổi: DA_VU_HOI không phải mã trạng thái
  assert.throws(() => db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES ('1', 'E', 'DA_VU_HOI', 4, 'x')").run(), /CHECK/);
  db.close();

  // DB trống: cùng cột, cùng CHECK
  const moi = new Database(':memory:');
  P.ensurePhatSchema(moi);
  moi.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, da_vu_hoi, batch_id, nhap_luc) VALUES ('1', 'A', 'PKTC', 1, 1, 'x')").run();
  assert.throws(() => moi.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, da_vu_hoi, batch_id, nhap_luc) VALUES ('1', 'B', 'CHUYEN_HOAN', 1, 1, 'x')").run(), /CHECK/);
  moi.close();
});

// ---------------- 2. Ánh xạ nhãn ----------------
test('2. ánh xạ: «Đã vu hồi» (hoa/thường/không dấu) và DA_VU_HOI -> PKTC + cờ; nhãn lạ vẫn TT_NGOAI_DS; 5 trạng thái không đổi', async () => {
  const vuHoi = { trang_thai: 'PKTC', da_vu_hoi: 1 };
  for (const t of ['Đã vu hồi', 'đã vu hồi', 'ĐÃ VU HỒI', 'da vu hoi', 'Da Vu Hoi', '  Đã  vu   hồi  ', 'DA_VU_HOI', 'da_vu_hoi']) assert.deepEqual(P.trangThaiVuHoiTuChu(t), vuHoi, t);
  assert.deepEqual(P.trangThaiVuHoiTuChu('Phát thành công'), { trang_thai: 'PTC', da_vu_hoi: 0 });
  assert.deepEqual(P.trangThaiVuHoiTuChu('PKTC'), { trang_thai: 'PKTC', da_vu_hoi: 0 });
  for (const t of ['vu hồi', 'Đã vu', 'Đã vu hồi rồi', '', null, undefined]) assert.equal(P.trangThaiVuHoiTuChu(t), null, String(t));
  assert.equal(P.trangThaiTuChu('Đã vu hồi'), null, 'trangThaiTuChu chỉ biết 5 trạng thái');
  assert.deepEqual(C.TT_MA, ['PTC', 'PKTC', 'CHUYEN_HOAN', 'CHUA_CO_TT', 'LAC_HUONG']);
  assert.deepEqual(Object.keys(P.zeroMap()), C.TT_MA);
  assert.deepEqual(C.DANH_SACH_NHAN, ['Phát thành công', 'Phát không thành công', 'Chuyển hoàn', 'Chưa có thông tin phát', 'Lạc hướng', 'Đã vu hồi']);
  assert.ok(`"${C.DANH_SACH_NHAN.join(',')}"`.length <= 255, 'danh sách chọn Excel ≤ 255 ký tự');

  const up = await taiLen([[sh(1), 'Đã vu hồi rồi', null], [sh(2), 'DA_VU_HOI', null]]);
  assert.equal(up.status, 201);
  const it = theoShbg(await dongBan(up.body.id));
  assert.equal(it[sh(1)].ma_loi, 'TT_NGOAI_DS');
  assert.ok(it[sh(1)].ly_do.includes(C.DANH_SACH_NHAN.join(', ')), 'thông báo liệt kê đủ 6 nhãn');
  assert.deepEqual([it[sh(2)].trang_thai, it[sh(2)].da_vu_hoi, it[sh(2)].ket_qua], ['PKTC', 1, 'HOP_LE'], 'mã DA_VU_HOI trong file');
  await api('DELETE', `/api/phat/drafts/${up.body.id}`);
});

// ---------------- 3. Quy tắc danhGia ----------------
function danhGia({ den, denVh = 0, hien = null, hienVh = 0 }) {
  const s = sh(1);
  return P.danhGia({ shbg: s, trang_thai: den, trang_thai_file: 'x', loi_o: null, da_vu_hoi: denVh },
    { nhom: new Map(), trongDen: new Map([[s, 1]]), hienCo: new Map(hien ? [[s, hien]] : []), hienCoVh: new Map([[s, hienVh]]) });
}
const tom = (e) => [e.ket_qua, e.ma_loi, e.canh_bao];
test('3. quy tắc: so theo cặp (trang_thai, da_vu_hoi); cảnh báo vàng theo bảng Việc 3', () => {
  // PKTC (không cờ) -> Đã vu hồi: hợp lệ, không cảnh báo
  assert.deepEqual(tom(danhGia({ den: 'PKTC', denVh: 1, hien: 'PKTC' })), ['HOP_LE', null, null]);
  // Đã vu hồi -> Đã vu hồi: KHONG_DOI (nhãn trong lý do là «Đã vu hồi»)
  const kd = danhGia({ den: 'PKTC', denVh: 1, hien: 'PKTC', hienVh: 1 });
  assert.deepEqual([kd.ket_qua, kd.ma_loi], ['LOI', 'KHONG_DOI']);
  assert.match(kd.chi_tiet_loi, /\(Đã vu hồi\)/);
  assert.equal(danhGia({ den: 'PKTC', hien: 'PKTC' }).ma_loi, 'KHONG_DOI', 'PKTC -> PKTC vẫn KHONG_DOI');
  // Chưa có TT -> Đã vu hồi: hợp lệ, không cảnh báo
  const moi = danhGia({ den: 'PKTC', denVh: 1 });
  assert.deepEqual([...tom(moi), moi.trang_thai_hien_co, moi.hien_co_vu_hoi], ['HOP_LE', null, null, 'CHUA_CO_TT', 0]);
  // PKTC có cờ -> PKTC không cờ: hợp lệ + «Bỏ đánh dấu vu hồi»
  assert.deepEqual(tom(danhGia({ den: 'PKTC', hien: 'PKTC', hienVh: 1 })), ['HOP_LE', null, 'Bỏ đánh dấu vu hồi']);
  // PTC / Chuyển hoàn / Lạc hướng -> Đã vu hồi: cùng cảnh báo như đích PKTC, vẫn nhập
  for (const hien of ['PTC', 'CHUYEN_HOAN', 'LAC_HUONG']) {
    const vh = danhGia({ den: 'PKTC', denVh: 1, hien });
    const pk = danhGia({ den: 'PKTC', hien });
    assert.equal(vh.ket_qua, 'HOP_LE', hien);
    assert.equal(vh.canh_bao, pk.canh_bao && pk.canh_bao.replace('Phát không thành công', 'Đã vu hồi'), hien);
  }
  assert.equal(danhGia({ den: 'PKTC', denVh: 1, hien: 'CHUYEN_HOAN' }).canh_bao, 'Chuyển bất thường: Chuyển hoàn → Đã vu hồi');
  // Đã vu hồi -> PTC / Chuyển hoàn / Lạc hướng / Chưa có TT: theo bảng của PKTC
  for (const den of ['PTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT']) {
    const vh = danhGia({ den, hien: 'PKTC', hienVh: 1 });
    const pk = danhGia({ den, hien: 'PKTC' });
    assert.equal(vh.ket_qua, 'HOP_LE', den);
    assert.equal(vh.canh_bao, pk.canh_bao && pk.canh_bao.replace('Phát không thành công', 'Đã vu hồi'), den);
  }
  assert.equal(danhGia({ den: 'CHUA_CO_TT', hien: 'PKTC', hienVh: 1 }).canh_bao, 'Chuyển bất thường: Đã vu hồi → Chưa có thông tin phát');
  // ctx cũ (không có hienCoVh) vẫn chạy như trước
  const s = sh(1);
  const cu = P.danhGia({ shbg: s, trang_thai: 'PKTC', trang_thai_file: 'x', loi_o: null }, { nhom: new Map(), trongDen: new Map([[s, 1]]), hienCo: new Map([[s, 'PKTC']]) });
  assert.equal(cu.ma_loi, 'KHONG_DOI');
});

// ---------------- 4. Ghi current + history ----------------
test('4. nhập «Đã vu hồi»: current + history mang cờ; PKTC -> vu hồi được nhập; nhập trạng thái khác sau đó thì cờ mất', async () => {
  const up = await taiLen([[sh(1), 'Đã vu hồi', 'ghi chú'], [sh(2), 'Phát không thành công', null]]);
  const it = theoShbg(await dongBan(up.body.id));
  assert.deepEqual([it[sh(1)].trang_thai, it[sh(1)].da_vu_hoi, it[sh(1)].ket_qua, it[sh(1)].canh_bao], ['PKTC', 1, 'HOP_LE', null]);
  assert.equal(it[sh(1)].trang_thai_nhan, 'Đã vu hồi', 'VUHOI-4b0: nhãn dòng có cờ là «Đã vu hồi»; mã trang_thai vẫn PKTC');
  assert.equal((await commit(up.body.id)).status, 200);
  assert.deepEqual(hienTai(sh(1)), ['PKTC', 1]);
  assert.deepEqual(hienTai(sh(2)), ['PKTC', 0]);
  assert.deepEqual(lichSu(sh(1)), [['PKTC', 1, null]]);
  assert.equal(theoShbg(await dongBan(up.body.id))[sh(1)].da_vu_hoi, 1, 'dòng DA_NHAP vẫn mang cờ');

  // PKTC -> Đã vu hồi (ca thường gặp nhất) được nhập; Đã vu hồi -> Đã vu hồi là KHONG_DOI
  const up2 = await taiLen([[sh(1), 'Đã vu hồi', null], [sh(2), 'Đã vu hồi', null]]);
  const it2 = theoShbg(await dongBan(up2.body.id));
  assert.deepEqual([it2[sh(1)].ma_loi, it2[sh(1)].hien_co_vu_hoi], ['KHONG_DOI', 1]);
  assert.deepEqual([it2[sh(2)].ket_qua, it2[sh(2)].canh_bao, it2[sh(2)].hien_co_vu_hoi], ['HOP_LE', null, 0]);
  const c2 = await commit(up2.body.id);
  assert.equal(c2.status, 200);
  assert.equal(c2.body.so_nhap, 1);
  assert.deepEqual(hienTai(sh(2)), ['PKTC', 1]);
  assert.deepEqual(lichSu(sh(2)), [['PKTC', 0, null], ['PKTC', 1, 'PKTC']]);

  // Nhập trạng thái khác sau đó: cờ mất (bản nhập cuối quyết định)
  await nhap([[sh(1), 'Phát thành công', null]]);
  assert.deepEqual(hienTai(sh(1)), ['PTC', 0]);
  assert.deepEqual(lichSu(sh(1)), [['PKTC', 1, null], ['PTC', 0, 'PKTC']]);
});

// ---------------- 5. Hoàn tác ----------------
test('5. hoàn tác: đợt vu hồi bị hoàn tác -> về PKTC không cờ; hoàn tác đợt «bỏ cờ» -> cờ trở lại; không có prev -> xoá', async () => {
  const d1 = await nhap([[sh(3), 'Phát không thành công', null]]);
  const d2 = await nhap([[sh(3), 'Đã vu hồi', null], [sh(4), 'Đã vu hồi', null]]);
  assert.deepEqual([hienTai(sh(3)), hienTai(sh(4))], [['PKTC', 1], ['PKTC', 1]]);

  const up = await taiLen([[sh(4), 'Phát không thành công', null]]);
  const dong = (await dongBan(up.body.id))[0];
  assert.deepEqual([dong.ket_qua, dong.canh_bao, dong.hien_co_vu_hoi], ['HOP_LE', 'Bỏ đánh dấu vu hồi', 1]);
  const d3 = await commit(up.body.id);
  assert.equal(d3.status, 200);
  assert.equal(d3.body.so_canh_bao, 1);
  assert.deepEqual(hienTai(sh(4)), ['PKTC', 0]);

  // Hoàn tác đợt «bỏ cờ»: cờ trở lại; dòng lịch sử của lần hoàn tác ghi cờ đã khôi phục
  const u3 = await hoanTac(d3.body.batch_id);
  assert.equal(u3.status, 200, JSON.stringify(u3.body));
  assert.deepEqual(hienTai(sh(4)), ['PKTC', 1]);
  assert.deepEqual(lichSu(sh(4)).at(-1), ['PKTC', 1, 'PKTC']);

  // Hoàn tác đợt vu hồi: sh(3) về PKTC không cờ (prev = đợt d1); sh(4) trước đó chưa có -> xoá
  const u2 = await hoanTac(d2.batch_id);
  assert.equal(u2.status, 200, JSON.stringify(u2.body));
  assert.deepEqual(hienTai(sh(3)), ['PKTC', 0]);
  assert.equal(hienTai(sh(4)), null);
  assert.deepEqual(lichSu(sh(3)).at(-1), ['PKTC', 0, 'PKTC']);
  assert.ok(d1.batch_id < d2.batch_id);
  for (const t of ['phat_status_current', 'phat_status_history']) {
    assert.equal(ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE da_vu_hoi = 1 AND trang_thai <> 'PKTC'`).get().n, 0, t);
  }
});

// ---------------- 6. File mẫu tat-ca: vòng khứ hồi; file lỗi ----------------
test('6. vòng khứ hồi: file mẫu tat-ca ghi «Đã vu hồi» ở hiện có và Trạng thái; nhập lại không sửa gì -> mọi dòng KHONG_DOI, cờ không mất', async () => {
  await nhap([[sh(6), 'Lạc hướng', null], [sh(7), 'Chưa có thông tin phát', null]]);
  assert.deepEqual(hienTai(sh(2)), ['PKTC', 1], 'tiền đề: sh(2) đang vu hồi');
  const mau = await api('GET', `/api/phat/template?bcvh=${B}&from=${NGAY_A}&to=${NGAY_A}&scope=tat-ca`, undefined, { binary: true });
  assert.equal(mau.status, 200);
  const ws = (await docXlsx(mau.buf)).getWorksheet('PHAT');
  const o = {};
  ws.eachRow((row, n) => { if (n > 1) o[row.getCell(1).value] = [row.getCell(5).value, row.getCell(6).value]; });
  assert.deepEqual(o[sh(2)], ['Đã vu hồi', 'Đã vu hồi']);
  assert.deepEqual(o[sh(3)], ['Phát không thành công', 'Phát không thành công']);
  assert.deepEqual(o[sh(6)], ['Lạc hướng', 'Lạc hướng']);
  assert.equal(o[sh(12)][0], 'Chưa có thông tin phát');
  assert.ok(o[sh(12)][1] == null, 'chưa có trạng thái: cột Trạng thái để trống');
  assert.equal(ws.dataValidations.model.F2.formulae[0], `"${C.DANH_SACH_NHAN.join(',')}"`);

  const up = await taiLenBuf(mau.buf, 'mau.xlsx');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const items = await dongBan(up.body.id);
  assert.equal(items.length, 16);
  for (const it of items) {
    if (it.trang_thai_file === '') assert.equal(it.ket_qua, 'BO_QUA_TRONG', it.shbg);
    else assert.deepEqual([it.ket_qua, it.ma_loi], ['LOI', 'KHONG_DOI'], `${it.shbg}: ${it.trang_thai_file}`);
  }
  const vh = theoShbg(items)[sh(2)];
  assert.deepEqual([vh.trang_thai, vh.da_vu_hoi, vh.trang_thai_hien_co, vh.hien_co_vu_hoi], ['PKTC', 1, 'PKTC', 1]);
  assert.equal((await commit(up.body.id)).status, 400, 'không có dòng nào để nhập');
  assert.deepEqual(hienTai(sh(2)), ['PKTC', 1], 'cờ không mất');
  await api('DELETE', `/api/phat/drafts/${up.body.id}`);
});

test('6b. file lỗi giữ nhãn «Đã vu hồi» ở cột Trạng thái và «Trạng thái hiện có»', async () => {
  const up = await taiLen([[sh(2), 'Phát thành công', null], [sh(2), 'Phát thành công', null], [sh(19), 'Đã vu hồi', null], [sh(19), 'đã vu hồi', null]]);
  assert.equal(up.status, 201);
  const f = await api('GET', `/api/phat/drafts/${up.body.id}/errors.xlsx`, undefined, { binary: true });
  assert.equal(f.status, 200);
  const ws = (await docXlsx(f.buf)).getWorksheet('PHAT');
  const ds = [];
  ws.eachRow((row, n) => { if (n > 1) ds.push([row.getCell(1).value, row.getCell(5).value, row.getCell(6).value]); });
  assert.equal(ds.length, 4);
  assert.ok(ds.filter((d) => d[0] === sh(2)).every((d) => d[1] === 'Đã vu hồi' && d[2] === 'Phát thành công'));
  assert.ok(ds.filter((d) => d[0] === sh(19)).every((d) => d[2] === 'Đã vu hồi'), 'nhãn đã nhận diện ghi lại dạng chuẩn');
  await api('DELETE', `/api/phat/drafts/${up.body.id}`);
});

// ---------------- 7. Bất biến số liệu ----------------
async function chupSoLieu() {
  PD.xoaCachePhatThang();
  const lay = async (p) => { const o = await api('GET', p); assert.equal(o.status, 200, p); return o.body; };
  const tv = await api('GET', `/api/phat/tai-ve?ngay_den=${NGAY_A}&bcvh=${B}`, undefined, { binary: true });
  assert.equal(tv.status, 200);
  const bang = [];
  (await docXlsx(tv.buf)).worksheets[0].eachRow({ includeEmpty: false }, (row) => bang.push(Array.from({ length: 9 }, (_, i) => row.getCell(i + 1).value)));
  return {
    demNgay: [NGAY_A, NGAY_B].flatMap((d) => [P.demNgay(ctx.db, B, d), P.demNgay(ctx.db, B, d, { demLoaiBo: true, theoLichSu: true })]),
    tyLe: [await lay(`/api/phat/ty-le?bcvh=${B}&ngay=${NGAY_A}`), await lay(`/api/phat/ty-le?bcvh=${B}&ngay=${NGAY_B}`)],
    ketQuaPhat: [await lay(`/api/arrivals/dashboard/ket-qua-phat?bcvh=all&ngay=${NGAY_A}`), await lay(`/api/arrivals/dashboard/ket-qua-phat?bcvh=${B}&ngay=${NGAY_B}`)],
    ketQuaPhatThang: [await lay(`/api/arrivals/dashboard/ket-qua-phat-thang?bcvh=all&ngay=${NGAY_A}`), await lay(`/api/arrivals/dashboard/ket-qua-phat-thang?bcvh=${B}&ngay=${NGAY_B}`)],
    taiVe: bang
  };
}
test('7. bất biến: cùng dữ liệu giả, bật cờ trên các dòng PKTC -> demNgay, ty-le, ket-qua-phat, ket-qua-phat-thang, tai-ve giống hệt', async () => {
  await nhap([[sh(12), 'Phát không thành công', null], [sh(13), 'Phát thành công', 'ok'], [sh(14), 'Chuyển hoàn', null],
    [sh(15), 'Đã vu hồi', null], [sh(17), 'Phát không thành công', null], [sh(18), 'Phát thành công', null]]);
  ctx.db.prepare('UPDATE phat_status_current SET da_vu_hoi = 0').run();
  ctx.db.prepare('UPDATE phat_status_history SET da_vu_hoi = 0').run();
  const truoc = await chupSoLieu();
  assert.ok(truoc.demNgay[0].tong.PKTC >= 3 && truoc.demNgay[2].tong.PKTC >= 1, 'có dòng PKTC ở cả hai ngày');

  ctx.db.prepare("UPDATE phat_status_current SET da_vu_hoi = 1 WHERE trang_thai = 'PKTC'").run();
  ctx.db.prepare("UPDATE phat_status_history SET da_vu_hoi = 1 WHERE trang_thai = 'PKTC'").run();
  assert.ok(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_status_current WHERE da_vu_hoi = 1').get().n >= 4);
  const sau = await chupSoLieu();

  assert.deepEqual(sau.demNgay, truoc.demNgay, 'demNgay (hiện tại + theo lịch sử)');
  assert.deepEqual(sau.tyLe, truoc.tyLe, '/api/phat/ty-le');
  assert.deepEqual(sau.ketQuaPhat, truoc.ketQuaPhat, 'ket-qua-phat');
  assert.deepEqual(sau.ketQuaPhatThang, truoc.ketQuaPhatThang, 'ket-qua-phat-thang: khoá và giá trị');
  // TAIVE-3: cột «Đã vu hồi» (chỉ số 4) là cột duy nhất được đổi theo cờ; 8 cột còn lại, số dòng, giá trị giữ nguyên.
  const boCot = (b) => b.map((d) => d.filter((_, i) => i !== 4));
  assert.deepEqual(boCot(sau.taiVe), boCot(truoc.taiVe), 'tai-ve: số dòng, 8 cột ngoài «Đã vu hồi», giá trị');
  assert.ok(truoc.taiVe.slice(1).every((d) => d[4] == null), 'chưa có cờ: cột «Đã vu hồi» trống');
  assert.ok(sau.taiVe.slice(1).some((d) => d[4] === 'Có'), 'bật cờ: cột «Đã vu hồi» có «Có»');
  assert.equal(sau.taiVe[0].length, 9);
  assert.equal(sau.taiVe.length - 1, sau.tyLe[0].mau_so, 'số dòng tai-ve = mẫu số ty-le');
  assert.ok(sau.taiVe.some((d) => d[0] === sh(15) && d[3] === 'Phát không thành công'), 'dòng vu hồi hiện như PKTC');
  assert.deepEqual(Object.keys(sau.tyLe[0].theo_trang_thai), C.TT_MA, 'vẫn 5 trạng thái');
});

// ---------------- 8. API biên tập ----------------
test('8. PATCH rows / fill / assign-list nhận «Đã vu hồi» và DA_VU_HOI; đổi sang trạng thái khác thì cờ về 0; dongRa có da_vu_hoi', async () => {
  const up = await taiLen([[sh(9), null, null], [sh(10), null, null], [sh(11), null, null], [sh(16), null, null]]);
  const id = up.body.id;
  const lay = async () => theoShbg(await dongBan(id));
  let it = await lay();
  assert.deepEqual(Object.keys(it[sh(9)]).slice(0, 13), ['id', 'so_dong_goc', 'shbg', 'trang_thai', 'trang_thai_nhan', 'trang_thai_file', 'ghi_chu',
    'trang_thai_hien_co', 'trang_thai_hien_co_nhan', 'ket_qua', 'ma_loi', 'ly_do', 'canh_bao'], 'trường cũ giữ nguyên');
  assert.equal(it[sh(9)].da_vu_hoi, 0);
  const sua = (trangThai) => api('PATCH', `/api/phat/drafts/${id}/rows`, { rows: [{ id: it[sh(9)].id, trang_thai: trangThai }] });

  assert.equal((await sua('Đã vu hồi')).status, 200);
  assert.deepEqual([(await lay())[sh(9)].trang_thai, (await lay())[sh(9)].da_vu_hoi, (await lay())[sh(9)].ket_qua], ['PKTC', 1, 'HOP_LE']);
  await sua('Phát thành công');
  assert.deepEqual([(await lay())[sh(9)].trang_thai, (await lay())[sh(9)].da_vu_hoi], ['PTC', 0]);
  await sua('DA_VU_HOI');
  assert.equal((await lay())[sh(9)].da_vu_hoi, 1, 'nhận mã DA_VU_HOI');
  await sua('');
  assert.deepEqual([(await lay())[sh(9)].trang_thai, (await lay())[sh(9)].da_vu_hoi], [null, 0], 'xoá trạng thái thì xoá cờ');

  const f = await api('POST', `/api/phat/drafts/${id}/fill`, { ids: [it[sh(10)].id], trang_thai: 'đã vu hồi' });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  const g = await api('POST', `/api/phat/drafts/${id}/assign-list`, { shbg: [sh(11), sh(16)], trang_thai: 'Đã vu hồi' });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.so_dong_khop, 2);
  it = await lay();
  for (const s of [sh(10), sh(11), sh(16)]) assert.deepEqual([it[s].trang_thai, it[s].da_vu_hoi], ['PKTC', 1], s);
  await api('POST', `/api/phat/drafts/${id}/fill`, { ids: [it[sh(10)].id], trang_thai: 'Chuyển hoàn' });
  assert.deepEqual([(await lay())[sh(10)].trang_thai, (await lay())[sh(10)].da_vu_hoi], ['CHUYEN_HOAN', 0]);

  const sai = await sua('vu hồi');
  assert.equal(sai.status, 400);
  assert.match(JSON.stringify(sai.body), /DA_VU_HOI \(Đã vu hồi\)/);
  const thieu = await api('POST', `/api/phat/drafts/${id}/fill`, { ids: [it[sh(10)].id], trang_thai: '' });
  assert.equal(thieu.status, 400);
  assert.match(JSON.stringify(thieu.body), /Lạc hướng, Đã vu hồi/);

  assert.equal((await commit(id)).status, 200);
  assert.deepEqual([hienTai(sh(10)), hienTai(sh(11)), hienTai(sh(16))], [['CHUYEN_HOAN', 0], ['PKTC', 1], ['PKTC', 1]]);
});

// ---------------- 9. Nhãn dòng nháp (VUHOI-4b0) ----------------
test('9. dongRa: trang_thai_nhan / trang_thai_hien_co_nhan trả «Đã vu hồi» khi có cờ; mã giữ nguyên; dòng không cờ giữ nhãn cũ; bỏ cờ vẫn cảnh báo', async () => {
  // (i)(ii)(iv) nhãn của dòng nháp
  const up = await taiLen([[sh(5), 'Đã vu hồi', null], [sh(8), 'Phát không thành công', null], [sh(13), 'Phát thành công', null],
    [sh(14), 'Chuyển hoàn', null], [sh(17), 'Lạc hướng', null], [sh(18), 'Chưa có thông tin phát', null]]);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  let it = theoShbg(await dongBan(up.body.id));
  assert.deepEqual([it[sh(5)].trang_thai, it[sh(5)].trang_thai_nhan, it[sh(5)].da_vu_hoi], ['PKTC', 'Đã vu hồi', 1]);
  assert.deepEqual([it[sh(8)].trang_thai, it[sh(8)].trang_thai_nhan, it[sh(8)].da_vu_hoi], ['PKTC', 'Phát không thành công', 0]);
  assert.equal(it[sh(13)].trang_thai_nhan, 'Phát thành công');
  assert.equal(it[sh(14)].trang_thai_nhan, 'Chuyển hoàn');
  assert.equal(it[sh(17)].trang_thai_nhan, 'Lạc hướng');
  assert.equal(it[sh(18)].trang_thai_nhan, 'Chưa có thông tin phát');
  await api('DELETE', `/api/phat/drafts/${up.body.id}`);

  // (iii) trạng thái hiện có là PKTC có cờ; (iv) hiện có PTC giữ nhãn cũ
  await nhap([[sh(5), 'Đã vu hồi', null], [sh(8), 'Phát thành công', null]]);
  const up2 = await taiLen([[sh(5), 'Đã vu hồi', null], [sh(8), 'Chuyển hoàn', null]]);
  it = theoShbg(await dongBan(up2.body.id));
  assert.deepEqual([it[sh(5)].trang_thai_hien_co, it[sh(5)].trang_thai_hien_co_nhan, it[sh(5)].hien_co_vu_hoi], ['PKTC', 'Đã vu hồi', 1]);
  assert.deepEqual([it[sh(8)].trang_thai_hien_co, it[sh(8)].trang_thai_hien_co_nhan, it[sh(8)].hien_co_vu_hoi], ['PTC', 'Phát thành công', 0]);
  await api('DELETE', `/api/phat/drafts/${up2.body.id}`);

  // (v) bỏ cờ: hiện có «Đã vu hồi», đích «Phát không thành công», cảnh báo giữ nguyên
  const up3 = await taiLen([[sh(5), 'Phát không thành công', null]]);
  const d = (await dongBan(up3.body.id))[0];
  assert.deepEqual([d.trang_thai, d.trang_thai_nhan, d.da_vu_hoi], ['PKTC', 'Phát không thành công', 0]);
  assert.deepEqual([d.trang_thai_hien_co, d.trang_thai_hien_co_nhan, d.hien_co_vu_hoi], ['PKTC', 'Đã vu hồi', 1]);
  assert.equal(d.canh_bao, 'Bỏ đánh dấu vu hồi');
  await api('DELETE', `/api/phat/drafts/${up3.body.id}`);
});
