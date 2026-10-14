// ==========================================
// Test SANLUONG-5e: hẹn giờ tự động nạp file từ SFTP (server/lib/sftpScheduler.js + lớp kết nối sftpConnect.js).
// Đồng hồ GIẢ (không chờ thật), `client` GIẢ (không mạng, không ssh2), DB tạm của harness, CSV / SHBG GIẢ. Hẹn giờ KHÔNG chạy trong harness.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const Sch = require('../server/lib/sftpScheduler');
const F = require('../server/lib/sftpFiles');

const PORT = 5927;
const D1 = '/CSV_Report_533140';
const T0 = Date.parse('2026-10-14T05:00:00Z');
let ctx;
let tmpRoot;
let seq = 0;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-sftp-sched-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-sftp-sched-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
});
after(async () => {
  await Sch.stopSftpScheduler();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  for (const t of ['sftp_source_files', 'sftp_sync_files', 'sftp_sync_runs', 'arrival_items', 'arrival_import_files']) ctx.db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- dữ liệu giả ----------
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
function csv(ma, ymd, n = 3) {
  const lines = [EXPECTED_HEADER.map(qt).join(',')];
  for (let i = 0; i < n; i++) {
    seq++;
    const row = {
      Ma_BC_dong: '990001', BC_nhan_BG: ma, Ten_duong_thu: 'Đường A', SHBG: `ZZ${String(900000000 + seq)}VN`, So_hieu_BD10: '',
      'Thời gian XN túi': `${ymd} ${String(7 + (i % 14)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
      So_hieu_BD8: `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
    };
    lines.push(EXPECTED_HEADER.map((h) => qt(row[h] ?? '')).join(','));
  }
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n');
}
const ten = (ma, ymd, hms = '093012') => `HangDen_${ma}_${ymd.replace(/-/g, '')}_${hms}.csv`;
const f = (buf, mtime = 1760400000000) => ({ buf, mtime });

/** Máy chủ SFTP giả (như tests/sftp-sync.test.js): files = { thư mục: { tên: { buf, mtime } } }. */
function nguonGia(files, { chan = null } = {}) {
  const calls = { list: 0, get: [], end: 0 };
  return {
    calls,
    async list(dir) {
      calls.list++;
      if (chan) await chan;
      return Object.entries(files[dir] || {}).map(([name, x]) => ({ type: '-', name, size: x.buf.length, modifyTime: x.mtime }));
    },
    async get(xa, cucBo) { calls.get.push(xa.slice(xa.lastIndexOf('/') + 1)); const d = xa.slice(0, xa.lastIndexOf('/')); fs.writeFileSync(cucBo, files[d][xa.slice(xa.lastIndexOf('/') + 1)].buf); },
    async end() { calls.end++; }
  };
}

/** Đồng hồ giả: tien(ms) chạy các hẹn giờ đến hạn theo thứ tự, ĐỢI từng lượt chạy xong. */
function dongHoGia(batDau = T0) {
  let t = batDau;
  let id = 0;
  const hen = [];
  return {
    now: () => new Date(t),
    setTimeout: (fn, ms) => { const h = { id: ++id, at: t + ms, fn }; hen.push(h); return h; },
    clearTimeout: (h) => { const i = hen.indexOf(h); if (i >= 0) hen.splice(i, 1); },
    async tien(ms) {
      const dich = t + ms;
      for (;;) {
        const ke = hen.filter((h) => h.at <= dich).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!ke) break;
        hen.splice(hen.indexOf(ke), 1);
        t = Math.max(t, ke.at);
        await ke.fn();
      }
      t = dich;
    },
    soHen: () => hen.length,
    gio: () => t
  };
}

const ENV = Object.freeze({
  SFTP_SYNC_ENABLED: '1', SFTP_HOST: 'nas.gia.local', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia',
  SFTP_DIRS: D1, SFTP_HOSTKEY_SHA256: 'a'.repeat(64), SFTP_STABLE_SECONDS: '60'
});
const rows = (sql, ...p) => ctx.db.prepare(sql).all(...p);
const dem = (t) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const tmpSach = () => fs.readdirSync(tmpRoot).filter((n) => n.startsWith('hue-dhcl-sftp-')).length === 0;
const MIN = 60000;

/** Dựng bộ hẹn giờ cho test. ketNoi mặc định trả `client`. */
function dung({ env = ENV, client = null, ketNoi = null, clock = dongHoGia(), importFn = null, logs = [] } = {}) {
  const dsKetNoi = [];
  const b = Sch.taoBoHenGio({
    db: ctx.db, env, clock, tmpDir: tmpRoot, sleep: async () => {}, importFn: importFn || undefined, log: (m) => logs.push(m), choPhepTrongTest: true,
    ketNoi: ketNoi || (async (cfg) => { dsKetNoi.push(cfg.host); return client; })
  });
  b.batDau();
  return { b, clock, logs, dsKetNoi };
}

// ---------- cấu hình / mặc định tắt ----------
test('mặc định TẮT: không đặt biến, hoặc giá trị khác "1" -> không lên lịch, im lặng', () => {
  for (const env of [{}, { ...ENV, SFTP_SYNC_ENABLED: undefined }, { ...ENV, SFTP_SYNC_ENABLED: '0' }, { ...ENV, SFTP_SYNC_ENABLED: 'true' }, { ...ENV, SFTP_SYNC_ENABLED: 'yes' }, { ...ENV, SFTP_SYNC_ENABLED: '' }]) {
    const { b, clock, logs } = dung({ env });
    assert.equal(b.trangThai().trangThai, 'TAT', JSON.stringify(env.SFTP_SYNC_ENABLED));
    assert.equal(clock.soHen(), 0);
    assert.equal(logs.length, 0, 'không ghi log khi tắt');
  }
  assert.deepEqual(Sch.docCauHinhHenGio({}), { bat: false });
  // chỉ '1' mới bật (kể cả có khoảng trắng)
  const { b, clock } = dung({ env: { ...ENV, SFTP_SYNC_ENABLED: ' 1 ' } });
  assert.equal(b.trangThai().trangThai, 'CHO');
  assert.equal(clock.soHen(), 1);
});

test('bật nhưng thiếu / sai cấu hình: KHÔNG khởi động, KHÔNG ném lỗi, đúng MỘT dòng log nêu TÊN biến (không giá trị)', () => {
  const truong = [
    ['SFTP_HOST'], ['SFTP_USER'], ['SFTP_PASSWORD'], ['SFTP_DIRS'], ['SFTP_HOSTKEY_SHA256']
  ];
  for (const [k] of truong) {
    const env = { ...ENV }; delete env[k];
    const { b, clock, logs } = dung({ env });
    const s = b.trangThai();
    assert.equal(s.trangThai, 'CAU_HINH_SAI', k);
    assert.equal(clock.soHen(), 0);
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes(k), `nêu tên biến ${k}`);
    assert.ok(!logs[0].includes('mat-khau-gia') && !logs[0].includes('nguoi-dung-gia') && !logs[0].includes('nas.gia.local'), 'không in giá trị');
  }
  for (const [k, v] of [['SFTP_SYNC_INTERVAL_MINUTES', '1'], ['SFTP_SYNC_INTERVAL_MINUTES', 'abc'], ['SFTP_SYNC_INTERVAL_MINUTES', '5000'], ['SFTP_SYNC_MAX_FILES', '0'], ['SFTP_SYNC_MAX_FILES', 'x'],
    ['SFTP_PORT', '0'], ['SFTP_SYNC_DAYS', '-1'], ['SFTP_STABLE_SECONDS', '99999'], ['SFTP_HOSTKEY_SHA256', 'md5:xyz']]) {
    const { b, clock, logs } = dung({ env: { ...ENV, [k]: v } });
    assert.equal(b.trangThai().trangThai, 'CAU_HINH_SAI', `${k}=${v}`);
    assert.equal(clock.soHen(), 0);
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes(k) && !logs[0].includes(`${v}`.length > 2 ? v : '\u0000'), k);
  }
});

test('mặc định chu kỳ 10 phút (tối thiểu 2), tối đa 5 file / lượt; đọc đúng từ biến', () => {
  assert.deepEqual([Sch.MAC_DINH.chuKyPhut, Sch.MAC_DINH.chuKyToiThieuPhut, Sch.MAC_DINH.maxFiles, Sch.MAC_DINH.troiDauMs], [10, 2, 5, 30000]);
  const c = Sch.docCauHinhHenGio(ENV);
  assert.deepEqual([c.bat, c.chuKyPhut, c.maxFiles, c.soNgay, c.onDinhGiay, c.cfg.port], [true, 10, 5, 3, 60, 5454]);
  const d = Sch.docCauHinhHenGio({ ...ENV, SFTP_SYNC_INTERVAL_MINUTES: '2', SFTP_SYNC_MAX_FILES: '9', SFTP_SYNC_DAYS: '7' });
  assert.deepEqual([d.chuKyPhut, d.maxFiles, d.soNgay], [2, 9, 7]);
});

test('KHÔNG chạy trong test / harness: có NODE_TEST_CONTEXT thì không bật dù cấu hình đủ; server harness không khởi động hẹn giờ', () => {
  const clock = dongHoGia();
  const b = Sch.taoBoHenGio({ db: ctx.db, env: { ...ENV, NODE_TEST_CONTEXT: 'child-v8' }, clock, log: () => {} });
  b.batDau();
  assert.equal(b.trangThai().trangThai, 'TAT');
  assert.equal(b.trangThai().lyDo, 'MOI_TRUONG_TEST');
  assert.equal(clock.soHen(), 0);
  assert.ok(Sch.laMoiTruongTest({ NODE_ENV: 'test' }));
  // server/index.js (harness) đã gọi startSftpScheduler(process.env): SFTP_SYNC_ENABLED không đặt -> TAT
  const tt = Sch.docTrangThaiSftp();
  assert.ok(['TAT', 'CHUA_KHOI_DONG'].includes(tt.trangThai));
  assert.equal(dem('sftp_sync_runs'), 0);
});

// ---------- chu kỳ ----------
test('chu kỳ: lượt đầu sau ~30 giây (không chạy lúc khởi động), rồi mỗi 10 phút; trạng thái có lượt kế tiếp', async () => {
  const src = nguonGia({ [D1]: {} });
  const { b, clock, dsKetNoi } = dung({ client: src });
  let s = b.trangThai();
  assert.equal(s.trangThai, 'CHO');
  assert.equal(s.luotKeTiep, new Date(T0 + 30000).toISOString());
  assert.equal(s.batLuc, new Date(T0).toISOString());
  assert.equal(dsKetNoi.length, 0, 'không chạy ngay lúc khởi động');
  await clock.tien(29000);
  assert.equal(dsKetNoi.length, 0);
  await clock.tien(1000); // 30 giây
  assert.equal(dsKetNoi.length, 1);
  s = b.trangThai();
  assert.equal(s.luotGanNhat.ketQua, 'XONG');
  assert.equal(s.luotKeTiep, new Date(T0 + 30000 + 10 * MIN).toISOString());
  assert.equal(src.calls.end, 1, 'ngắt kết nối sau mỗi lượt');
  await clock.tien(10 * MIN - 1);
  assert.equal(dsKetNoi.length, 1);
  await clock.tien(1);
  assert.equal(dsKetNoi.length, 2);
  await clock.tien(30 * MIN);
  assert.equal(dsKetNoi.length, 5);
  assert.equal(b.trangThai().soLuot, 5);
  assert.equal(rows("SELECT DISTINCT \"trigger\" AS t FROM sftp_sync_runs").map((r) => r.t).join(), 'TIMER');
  // chu kỳ tuỳ chỉnh
  const c2 = dongHoGia();
  const x = dung({ env: { ...ENV, SFTP_SYNC_INTERVAL_MINUTES: '2' }, client: nguonGia({ [D1]: {} }), clock: c2 });
  await c2.tien(30000 + 2 * MIN);
  assert.equal(x.dsKetNoi.length, 2);
});

test('ổn định qua nhiều lượt: lượt 1 thấy file mới (chưa nạp), lượt 2 (sau ≥ SFTP_STABLE_SECONDS, không đổi) mới nạp; KHÔNG chờ trong lượt', async () => {
  const a = ten('533140', '2026-10-14');
  const files = { [D1]: { [a]: f(csv('533140', '2026-10-14')) } };
  const src = nguonGia(files);
  const { b, clock } = dung({ client: src });
  await clock.tien(30000);
  assert.equal(b.trangThai().luotGanNhat.dem.chuaOnDinh, 1);
  assert.equal(b.trangThai().luotGanNhat.dem.daNap, 0);
  assert.deepEqual(src.calls.get, []);
  assert.equal(dem('arrival_import_files'), 0);
  assert.equal(rows('SELECT so_lan_giu_nguyen FROM sftp_source_files')[0].so_lan_giu_nguyen, 0);
  await clock.tien(10 * MIN);
  assert.equal(b.trangThai().luotGanNhat.dem.daNap, 1);
  assert.deepEqual(src.calls.get, [a]);
  assert.equal(dem('arrival_import_files'), 1);
  assert.equal(rows('SELECT source FROM arrival_import_files')[0].source, 'SFTP');
  await clock.tien(10 * MIN);
  assert.equal(b.trangThai().luotGanNhat.dem.daCo, 1, 'lượt sau bỏ qua file đã nạp');
  assert.equal(src.calls.get.length, 1);
  assert.ok(tmpSach());
});

test('SFTP_STABLE_SECONDS lớn hơn chu kỳ: phải giữ nguyên đủ lâu mới nạp (600 giây > chu kỳ 5 phút)', async () => {
  const a = ten('533140', '2026-10-14');
  const src = nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } });
  const { b, clock } = dung({ env: { ...ENV, SFTP_STABLE_SECONDS: '600', SFTP_SYNC_INTERVAL_MINUTES: '5' }, client: src });
  await clock.tien(30000); // thấy lần đầu
  await clock.tien(5 * MIN); // giữ nguyên 5 phút < 10 phút
  assert.equal(src.calls.get.length, 0);
  assert.equal(b.trangThai().luotGanNhat.dem.chuaOnDinh, 1);
  await clock.tien(5 * MIN); // giữ nguyên 10 phút ≥ 600 giây
  assert.equal(src.calls.get.length, 1);
});

test('file đổi giữa hai lượt (đang được ghi) thì chưa nạp, đếm lại từ đầu', async () => {
  const a = ten('533140', '2026-10-14');
  const files = { [D1]: { [a]: f(csv('533140', '2026-10-14', 2), 1000) } };
  const src = nguonGia(files);
  const { b, clock } = dung({ client: src });
  await clock.tien(30000);
  files[D1][a] = f(csv('533140', '2026-10-14', 6), 2000);
  await clock.tien(10 * MIN);
  assert.equal(src.calls.get.length, 0);
  await clock.tien(10 * MIN);
  assert.equal(src.calls.get.length, 1);
  assert.equal(b.trangThai().luotGanNhat.dem.daNap, 1);
});

test('mỗi lượt nạp tối đa SFTP_SYNC_MAX_FILES file, cũ trước; phần còn lại để lượt sau', async () => {
  const ds = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'].map((d) => ten('533140', d));
  const files = { [D1]: Object.fromEntries(ds.map((n, i) => [n, f(csv('533140', ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'][i]))])) };
  const src = nguonGia(files);
  const { b, clock } = dung({ env: { ...ENV, SFTP_SYNC_MAX_FILES: '2', SFTP_SYNC_DAYS: '10' }, client: src });
  await clock.tien(30000); // lượt 1: thấy lần đầu
  await clock.tien(10 * MIN); // lượt 2: nạp 2 file cũ nhất
  assert.deepEqual(src.calls.get, [ds[0], ds[1]]);
  assert.equal(b.trangThai().luotGanNhat.dem.daNap, 2);
  await clock.tien(10 * MIN);
  assert.deepEqual(src.calls.get, [ds[0], ds[1], ds[2], ds[3]]);
  await clock.tien(10 * MIN);
  assert.deepEqual(src.calls.get, ds);
  assert.equal(dem('arrival_import_files'), 5);
});

test('file mã LẠ không được tải / nạp; file mã hợp lệ cùng thư mục vẫn nạp', async () => {
  const la = ten('999999', '2026-10-14');
  const ok = ten('535470', '2026-10-14');
  const src = nguonGia({ [D1]: { [la]: f(csv('999999', '2026-10-14')), [ok]: f(csv('535470', '2026-10-14')) } });
  const { b, clock, logs } = dung({ client: src });
  await clock.tien(30000 + 10 * MIN);
  assert.deepEqual(src.calls.get, [ok]);
  assert.equal(rows('SELECT 1 FROM arrival_import_files WHERE file_name = ?', la).length, 0);
  assert.equal(b.trangThai().luotGanNhat.dem.maLa, 1);
  assert.ok(logs.some((l) => /mã lạ 1/.test(l)));
  assert.equal(rows('SELECT ma_loi FROM sftp_sync_files WHERE ten_file = ? ORDER BY id DESC', la)[0].ma_loi, 'MA_LA');
});

// ---------- lỗi ----------
test('lỗi mạng khi kết nối: ghi vào lượt, KHÔNG tạm dừng, thử lại ở chu kỳ sau và thành công', async () => {
  let lan = 0;
  const src = nguonGia({ [D1]: {} });
  const ketNoi = async () => { lan++; if (lan === 1) throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5454'), { code: 'ECONNREFUSED' }); return src; };
  const { b, clock, logs } = dung({ ketNoi });
  await clock.tien(30000);
  let s = b.trangThai();
  assert.equal(s.trangThai, 'CHO');
  assert.equal(s.luotGanNhat.ketQua, 'LOI_KET_NOI');
  assert.equal(s.luotGanNhat.loi, 'mang');
  const r = rows('SELECT * FROM sftp_sync_runs')[0];
  assert.deepEqual([r.trigger, r.loi], ['TIMER', 1]);
  assert.ok(r.finished_at && /mạng|mang/i.test(r.ghi_chu_loi));
  assert.ok(!r.ghi_chu_loi.includes('mat-khau-gia'));
  assert.equal(s.luotKeTiep, new Date(T0 + 30000 + 10 * MIN).toISOString());
  await clock.tien(10 * MIN);
  assert.equal(lan, 2);
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'XONG');
  assert.equal(dem('sftp_sync_runs'), 2);
  assert.ok(logs.length >= 2);
});

test('lỗi thư mục (không có) trong lượt: ghi lại, tiếp tục chu kỳ, không tạm dừng', async () => {
  const src = nguonGia({});
  src.list = async () => { throw Object.assign(new Error('No such file /CSV_Report_533140'), { code: 2 }); };
  const { b, clock } = dung({ client: src });
  await clock.tien(30000);
  const s = b.trangThai();
  assert.equal(s.trangThai, 'CHO');
  assert.equal(s.luotGanNhat.ketQua, 'CO_LOI');
  assert.equal(rows('SELECT loi FROM sftp_sync_runs')[0].loi, 1);
});

test('lỗi XÁC THỰC: TẠM DỪNG hẹn giờ, KHÔNG thử lại (kể cả sau nhiều ngày), ghi lý do vào lượt và log; chỉ khởi động lại mới chạy lại', async () => {
  let lan = 0;
  const ketNoi = async () => { lan++; throw Object.assign(new Error('All configured authentication methods failed'), { code: 'ERR_GENERIC_CLIENT' }); };
  const { b, clock, logs } = dung({ ketNoi });
  await clock.tien(30000);
  const s = b.trangThai();
  assert.equal(s.trangThai, 'TAM_DUNG');
  assert.equal(s.lyDo, 'XAC_THUC');
  assert.equal(s.luotGanNhat.ketQua, 'TAM_DUNG');
  assert.equal(s.luotKeTiep, null);
  assert.equal(clock.soHen(), 0, 'không còn hẹn giờ nào');
  await clock.tien(3 * 24 * 60 * MIN);
  assert.equal(lan, 1, 'không thử lại mật khẩu sai');
  assert.equal(dem('sftp_sync_runs'), 1);
  const r = rows('SELECT * FROM sftp_sync_runs')[0];
  assert.match(r.ghi_chu_loi, /Tạm dừng hẹn giờ/);
  assert.match(r.ghi_chu_loi, /khởi động lại/);
  assert.ok(logs.some((l) => /TẠM DỪNG/.test(l) && /XAC_THUC/.test(l)));
  assert.ok(!logs.join('\n').includes('mat-khau-gia'));
  // chayNgay() trong khi tạm dừng cũng không kết nối
  await b.chayNgay();
  assert.equal(lan, 1);
  // bộ hẹn giờ MỚI (khởi động lại máy chủ) chạy lại được
  const x = dung({ client: nguonGia({ [D1]: {} }) });
  await x.clock.tien(30000);
  assert.equal(x.b.trangThai().luotGanNhat.ketQua, 'XONG');
});

test('lỗi VÂN TAY SAI: TẠM DỪNG (lý do VAN_TAY_SAI), không thử lại', async () => {
  let lan = 0;
  const ketNoi = async () => { lan++; throw Object.assign(new Error('Handshake failed: giả'), { saiVanTay: true }); };
  const { b, clock } = dung({ ketNoi });
  await clock.tien(30000);
  assert.deepEqual([b.trangThai().trangThai, b.trangThai().lyDo], ['TAM_DUNG', 'VAN_TAY_SAI']);
  await clock.tien(24 * 60 * MIN);
  assert.equal(lan, 1);
  assert.match(rows('SELECT ghi_chu_loi FROM sftp_sync_runs')[0].ghi_chu_loi, /Vân tay|vân tay/);
});

test('lỗi lạ không phân loại: lượt sau thử lại, ghi đầy đủ; lỗi ném bất ngờ không làm sập hẹn giờ', async () => {
  let lan = 0;
  const ketNoi = async () => { lan++; if (lan === 1) throw new Error('điều gì đó rất lạ'); return nguonGia({ [D1]: {} }); };
  const { b, clock } = dung({ ketNoi });
  await clock.tien(30000);
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'LOI_KET_NOI');
  assert.equal(b.trangThai().luotGanNhat.loi, 'khac');
  assert.equal(b.trangThai().trangThai, 'CHO');
  assert.match(rows('SELECT ghi_chu_loi FROM sftp_sync_runs')[0].ghi_chu_loi, /điều gì đó rất lạ/);
  await clock.tien(10 * MIN);
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'XONG');

  // importer ném lỗi: chỉ file đó LOI, hẹn giờ vẫn chạy tiếp
  const a = ten('533140', '2026-10-14');
  const src = nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } });
  const x = dung({ client: src, importFn: async () => { throw new Error('nổ giả'); } });
  await x.clock.tien(30000 + 10 * MIN);
  assert.equal(x.b.trangThai().luotGanNhat.ketQua, 'CO_LOI');
  assert.equal(x.b.trangThai().trangThai, 'CHO');
  assert.ok(tmpSach());
});

// ---------- khoá chống chạy chồng ----------
test('khoá trong tiến trình: lượt đang chạy thì chayNgay() bỏ qua và ghi nhận (chỉ kết nối MỘT lần)', async () => {
  let mo; const chan = new Promise((r) => { mo = r; });
  const src = nguonGia({ [D1]: {} }, { chan });
  const { b, clock, dsKetNoi } = dung({ client: src });
  const p1 = b.chayNgay();
  assert.equal(b.trangThai().trangThai, 'DANG_CHAY');
  const p2 = await b.chayNgay();
  assert.equal(p2.ketQua, 'BI_KHOA_TIEN_TRINH');
  assert.equal(dsKetNoi.length, 1);
  mo();
  await p1;
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'XONG');
  assert.equal(b.trangThai().trangThai, 'CHO');
  assert.equal(clock.soHen(), 1);
});

test('khoá trong DB: script chạy tay đang chạy (lượt chưa kết thúc < 30 phút) -> hẹn giờ bỏ qua, ghi nhận, không kết nối; hết khoá thì chạy', async () => {
  const src = nguonGia({ [D1]: {} });
  const { b, clock, dsKetNoi, logs } = dung({ client: src });
  const id = Number(ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at, "trigger") VALUES (?, \'MANUAL\')').run(new Date(T0).toISOString()).lastInsertRowid);
  await clock.tien(30000);
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'BI_KHOA_DB');
  assert.equal(dsKetNoi.length, 0);
  assert.equal(dem('sftp_sync_runs'), 1);
  assert.ok(logs.some((l) => /Bỏ qua/.test(l)));
  assert.equal(b.trangThai().trangThai, 'CHO', 'vẫn lên lịch lượt sau');
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ? WHERE id = ?').run(new Date(T0 + 40000).toISOString(), id);
  await clock.tien(10 * MIN);
  assert.equal(dsKetNoi.length, 1);
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'XONG');
  // lượt treo > 30 phút bị đóng và cho chạy
  ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(new Date(clock.gio() - 31 * MIN).toISOString());
  await clock.tien(10 * MIN);
  assert.equal(dsKetNoi.length, 2);
  assert.match(rows("SELECT ghi_chu_loi FROM sftp_sync_runs WHERE ghi_chu_loi LIKE '%treo%'")[0].ghi_chu_loi, /treo/);
});

// ---------- dừng gọn ----------
test('dừng gọn: huỷ hẹn giờ, trạng thái DA_DUNG, không chạy thêm; lượt đang chạy kết thúc và không lên lịch lại', async () => {
  const { b, clock, dsKetNoi } = dung({ client: nguonGia({ [D1]: {} }) });
  await clock.tien(30000);
  assert.equal(dsKetNoi.length, 1);
  await b.dung();
  assert.equal(b.trangThai().trangThai, 'DA_DUNG');
  assert.equal(b.trangThai().luotKeTiep, null);
  assert.equal(clock.soHen(), 0);
  await clock.tien(60 * MIN);
  assert.equal(dsKetNoi.length, 1);

  // dừng khi một lượt đang chạy
  let mo; const chan = new Promise((r) => { mo = r; });
  const x = dung({ client: nguonGia({ [D1]: {} }, { chan }) });
  const p = x.b.chayNgay();
  const dung2 = x.b.dung();
  mo();
  await Promise.all([p, dung2]);
  assert.equal(x.b.trangThai().trangThai, 'DA_DUNG');
  assert.equal(x.clock.soHen(), 0, 'không lên lịch lại sau khi dừng');
  assert.ok(tmpSach());
});

test('dừng giữa chừng: không bắt đầu file kế tiếp (huy)', async () => {
  const ds = ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => ten('533140', d));
  const files = { [D1]: Object.fromEntries(ds.map((n, i) => [n, f(csv('533140', ['2026-10-12', '2026-10-13', '2026-10-14'][i]))])) };
  const src = nguonGia(files);
  let truongDung = null;
  const ket = { b: null };
  const importFn = async (...a) => { const r = await require('../server/lib/arrivalsImport').importArrivalFile(...a); if (!truongDung) truongDung = ket.b.dung(); return r; };
  const x = dung({ client: src, importFn });
  ket.b = x.b;
  await x.clock.tien(30000); // thấy file lần đầu
  await x.clock.tien(10 * MIN); // nạp: sau file đầu thì gọi dung()
  await truongDung;
  assert.equal(dem('arrival_import_files'), 1, 'chỉ file đầu được nạp');
  assert.equal(x.b.trangThai().trangThai, 'DA_DUNG');
  assert.ok(tmpSach());
});

// ---------- bảng nguồn ----------
test('sftp_source_files: ghi danh sách file trên nguồn; giữ file đã biến mất (lần cuối thấy); mã lạ cũng được ghi để màn quản trị thấy', async () => {
  const a = ten('533140', '2026-10-14', '093012');
  const b2 = ten('535470', '2026-10-14', '093012');
  const files = { [D1]: { [a]: f(csv('533140', '2026-10-14'), 111), [b2]: f(csv('535470', '2026-10-14'), 222) } };
  const src = nguonGia(files);
  const { b, clock } = dung({ client: src });
  await clock.tien(30000);
  let rs = rows('SELECT * FROM sftp_source_files ORDER BY ten_file');
  assert.equal(rs.length, 2);
  assert.deepEqual(rs.map((r) => [r.thu_muc, r.mtime, r.con_tren_nguon, r.so_lan_giu_nguyen]), [[D1, 111, 1, 0], [D1, 222, 1, 0]]);
  delete files[D1][b2];
  await clock.tien(10 * MIN);
  rs = rows('SELECT * FROM sftp_source_files ORDER BY ten_file');
  assert.equal(rs.length, 2, 'giữ file đã biến mất');
  const rb = rs.find((r) => r.ten_file === b2);
  assert.equal(rb.con_tren_nguon, 0);
  assert.equal(rb.lan_cuoi_thay, new Date(T0 + 30000).toISOString());
  assert.equal(rs.find((r) => r.ten_file === a).con_tren_nguon, 1);
  // phân biệt «nguồn có file, chưa nạp» (chưa có trong arrival_import_files) với «nguồn chưa có file»
  const chuaNap = rows(`SELECT s.ten_file FROM sftp_source_files s WHERE s.con_tren_nguon = 1
    AND NOT EXISTS (SELECT 1 FROM arrival_import_files i WHERE i.file_name = s.ten_file AND i.status IN ('OK', 'EMPTY'))`);
  assert.equal(chuaNap.length, 0, 'file a đã được nạp ở lượt 2');
  assert.equal(b.trangThai().luotGanNhat.dem.daNap, 1);
});

test('lược đồ sftp_source_files và idempotent', () => {
  const cols = ctx.db.prepare('PRAGMA table_info(sftp_source_files)').all().map((c) => c.name);
  assert.deepEqual(cols, ['thu_muc', 'ten_file', 'kich_thuoc', 'mtime', 'lan_dau_thay', 'lan_cuoi_thay', 'so_lan_giu_nguyen', 'giu_nguyen_tu', 'con_tren_nguon']);
  assert.doesNotThrow(() => require('../server/lib/sftpSync').ensureSftpSyncSchema(ctx.db));
});

// ---------- an toàn ----------
test('không có dãy ≥ 15 chữ số và không lộ tên đăng nhập / mật khẩu trong log, trạng thái, DB (kể cả khi lỗi mang số dài / bí mật)', async () => {
  const soDai = '1234567'.repeat(3);
  const ketNoi = async () => { throw Object.assign(new Error(`getaddrinfo ENOTFOUND nas ${soDai} mat-khau-gia nguoi-dung-gia`), { code: 'ENOTFOUND' }); };
  const { b, clock, logs } = dung({ ketNoi });
  await clock.tien(30000);
  const tatCa = JSON.stringify([logs, b.trangThai(), rows('SELECT * FROM sftp_sync_runs')]);
  assert.ok(!/\d{15,}/.test(tatCa));
  assert.ok(!tatCa.includes('mat-khau-gia') && !tatCa.includes('nguoi-dung-gia'));
  assert.ok(logs.length >= 1);
});

test('singleton: startSftpScheduler không ném lỗi dù env sai; docTrangThaiSftp / stopSftpScheduler dùng được', async () => {
  const kq = Sch.startSftpScheduler({ db: ctx.db, env: { SFTP_SYNC_ENABLED: '1' }, clock: dongHoGia(), log: () => {}, choPhepTrongTest: true });
  assert.ok(kq);
  assert.equal(Sch.docTrangThaiSftp().trangThai, 'CAU_HINH_SAI');
  await Sch.stopSftpScheduler();
  const tt = Sch.docTrangThaiSftp();
  for (const k of ['trangThai', 'lyDo', 'batLuc', 'luotGanNhat', 'luotKeTiep', 'chuKyPhut', 'maxFiles', 'soLuot']) assert.ok(k in tt, k);
});

// ---------- kiểm tĩnh ----------
const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CAM = ['put', 'fastPut', 'delete', 'rename', 'posixRename', 'mkdir', 'rmdir', 'chmod', 'append', 'uploadDir', 'downloadDir', 'createWriteStream', 'rcopy', 'stat', 'exists', 'cwd'];

test('kiểm tĩnh: phần lập lịch không nạp thư viện SFTP; lớp kết nối chỉ connect / list / get / end; không lệnh ghi SFTP', () => {
  const sch = boChuThich(doc('server', 'lib', 'sftpScheduler.js'));
  assert.ok(!sch.includes('ssh2'), 'sftpScheduler.js không nhắc ssh2');
  assert.ok(!/require\(['"]ssh2/.test(sch));
  assert.ok(/require\('\.\/sftpConnect'\)/.test(sch), 'chỉ nạp lớp kết nối (lười, trong hàm)');
  assert.ok(!/setInterval/.test(sch), 'dùng setTimeout nối tiếp, không setInterval');
  const sy = boChuThich(doc('server', 'lib', 'sftpSync.js'));
  assert.ok(!sy.includes('ssh2'));
  const cn = boChuThich(doc('server', 'lib', 'sftpConnect.js'));
  const used = new Set([...cn.matchAll(/\bsftp\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ['connect', 'end', 'get', 'list']);
  for (const [ten2, code] of [['sftpScheduler', sch], ['sftpSync', sy], ['sftpConnect', cn]]) {
    for (const c of CAM) assert.ok(!new RegExp(`\\.${c}\\s*\\(`).test(code), `${ten2}: .${c}(`);
    assert.ok(!/require\(['"]\.\.?\/db/.test(code), `${ten2} không require db`);
  }
});

test('kiểm tĩnh: log trong sftpScheduler / sftpConnect không in user / password; server/index.js chỉ khởi động hẹn giờ có bảo vệ', () => {
  for (const file of ['sftpScheduler.js', 'sftpConnect.js']) {
    const code = boChuThich(doc('server', 'lib', file));
    for (const l of code.split('\n').filter((x) => /\b(nhatKy|log|console\.\w+)\s*\(/.test(x))) {
      assert.ok(!/cfg\.(user|password)\b|SFTP_(USER|PASSWORD)\b|\.password\b|\.user\b/.test(l), `${file}: ${l.trim()}`);
    }
  }
  const idx = boChuThich(doc('server', 'index.js'));
  assert.ok(/startSftpScheduler\(/.test(idx) && /try \{/.test(idx), 'khởi động trong try/catch');
  assert.ok(!/setInterval/.test(idx));
});
