// Đo hiệu năng «kết quả phát từ đầu tháng» (DASH-12b-4) trên CSDL RAM, DỮ LIỆU GIẢ (không đụng data/ hay DB thật). Có NGÂN SÁCH thời gian (mặc định 110 giây,
// quá thì in «KHÔNG ĐO XONG» và thoát mã 2) và in tiến độ ngay từng bước. Cỡ thật ≈ 1350 SHBG/BCVH-ngày (~243.000 dòng); cỡ xấu nhất = 4000 (720.000 dòng).
// Dùng: node scripts/bench-phat-thang.js <SHBG mỗi BCVH-ngày> [ngân sách giây]
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
const AI = require(path.join(ROOT, 'server', 'lib', 'arrivalsImport'));
const P = require(path.join(ROOT, 'server', 'lib', 'phat'));
const PD = require(path.join(ROOT, 'server', 'lib', 'phatDashboard'));
const { monitorEventLoopDelay } = require('perf_hooks');
const N = Number(process.argv[2]) || 1350;
const BUDGET = (Number(process.argv[3]) || 110) * 1000;
const T0 = Date.now();
const log = (m) => { console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`); };
const kiem = (buoc) => { if (Date.now() - T0 > BUDGET) { log(`KHÔNG ĐO XONG: quá ngân sách ${BUDGET / 1000}s trước bước «${buoc}»`); process.exit(2); } };

const db = new Database(':memory:');
db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, hrm_code TEXT, full_name TEXT); CREATE TABLE province_post_offices (code TEXT, name TEXT); INSERT INTO users VALUES ('u','h','n')");
AI.ensureArrivalSchema(db);
P.ensurePhatSchema(db);
const BC = ['533140', '535470', '536250', '537015', '537220', '535790'];
const DAYS = 30; // 01/09 .. 30/09/2026 (tháng 30 ngày)
const insFile = db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, ?, ?, '093012', 1, ?, ?, ?, 'OK')");
const insItem = db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key) VALUES (?, ?, 'Đường A', ?, ?, ?, ?, 'bag', ?, 1, ?, 'phuong an')`);
const insB = db.prepare("INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, 'u', '2026-09-01T10:00:00Z', 0)");
const insH = db.prepare("INSERT INTO phat_status_history (bcvh, shbg, trang_thai, trang_thai_truoc, batch_id, nhap_luc) VALUES (?, ?, ?, NULL, ?, '2026-10-01T10:00:00Z')");
const d0 = Date.UTC(2026, 8, 1);
const dstr = (k) => new Date(d0 + k * 86400000).toISOString().slice(0, 10);
const TT = ['PTC', 'PTC', 'PTC', 'PKTC', 'CHUYEN_HOAN', 'PTC', 'PTC', 'PTC', 'PTC', 'PTC'];
let n = 0;
let shDauTien = null;
db.transaction(() => {
  for (const bc of BC) {
    const bid = insB.run(bc).lastInsertRowid;
    for (let k = 0; k < DAYS; k++) {
      const day = dstr(k);
      const fid = insFile.run(bc, `P_${bc}_${day}.csv`, day, `${bc}${day}`, N, N).lastInsertRowid;
      for (let i = 0; i < N; i++) {
        const s = `ZP${String(100000000 + (++n))}VN`;
        if (!shDauTien && k === 3) shDauTien = { bc, s, day };
        const t = `${day} ${String(6 + (i % 16)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`;
        insItem.run(fid, bc, s, `B${n}`, t, t, day, day);
        insH.run(bc, s, TT[i % 10], bid); // 90% đã nhập (Chưa có TT ~0%: mọi ngày «đủ số liệu»)
      }
    }
  }
})();
log(`nạp ${n} dòng (${BC.length} BCVH × ${DAYS} ngày × ${N}/ngày)`);

const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
const pAll = { bcvh: 'all', ngay: dstr(DAYS - 1) };
const dem = () => PD.soLanDemNgay();
const buoc = (ten, f) => { kiem(ten); const c = dem(); const [t] = ms(f); log(`${ten}: ${t.toFixed(0)} ms (tính lại ${dem() - c} ngày-BCVH)`); return t; };

// 1. lần đầu sau khởi động (cache trống)
buoc('1. lần đầu sau khởi động (cache trống)', () => PD.ketQuaPhatThang(db, BC, pAll));
buoc('2. trúng cache (cùng khoá, DB không đổi)', () => PD.ketQuaPhatThang(db, BC, pAll));
// 3. đợt nhập phát mới của 1 BCVH
db.prepare("INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, 'u', '2026-10-02T01:00:00Z', 0)").run(BC[0]);
buoc('3. sau 1 đợt nhập phát của 1 BCVH', () => PD.ketQuaPhatThang(db, BC, pAll));
// 4. file hàng đến mới (EMPTY, không dòng) ở ngày dữ liệu
db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, 'MOI.csv', ?, '235959', 1, 'moi', 0, 0, 'EMPTY')").run(BC[0], dstr(DAYS - 1));
buoc('4. sau 1 file mới (không dòng) ở ngày dữ liệu', () => PD.ketQuaPhatThang(db, BC, pAll));
// 5. file mới có 1 dòng MỚI ở ngày dữ liệu
{
  const fid = db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, 'MOI2.csv', ?, '235959', 1, 'moi2', 1, 1, 'OK')").run(BC[0], dstr(DAYS - 1)).lastInsertRowid;
  const t = `${dstr(DAYS - 1)} 12:00:00`;
  insItem.run(fid, BC[0], 'ZPMOI00001VN', 'BMOI1', t, t, dstr(DAYS - 1), dstr(DAYS - 1));
}
buoc('5. sau 1 file mới có 1 dòng mới ở ngày dữ liệu', () => PD.ketQuaPhatThang(db, BC, pAll));
// 6. file mới có SHBG đã đến ngày trước (đến lại)
{
  const fid = db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, 'LAI.csv', ?, '235959', 1, 'lai', 1, 1, 'OK')").run(shDauTien.bc, dstr(DAYS - 1)).lastInsertRowid;
  const t = `${dstr(DAYS - 1)} 13:00:00`;
  insItem.run(fid, shDauTien.bc, shDauTien.s, 'BLAI1', t, t, dstr(DAYS - 1), dstr(DAYS - 1));
}
buoc('6. sau 1 file mới có SHBG đến lại (ngày 04)', () => PD.ketQuaPhatThang(db, BC, pAll));
// 7. ghi không liên quan
db.prepare("UPDATE users SET full_name = full_name || 'x'").run();
buoc('7. sau 1 ghi KHÔNG liên quan (chỉ chữ ký)', () => PD.ketQuaPhatThang(db, BC, pAll));

// 8. khởi động nóng: lát dài nhất + độ trễ vòng lặp
kiem('8. khởi động nóng');
PD.xoaCachePhatThang();
const hist = monitorEventLoopDelay({ resolution: 5 });
hist.enable();
let moc = process.hrtime.bigint();
let latMax = 0;
let latTen = 0;
(async () => {
  const r = await PD.khoiDongNong(db, {
    nghi: (f) => { const t = Number(process.hrtime.bigint() - moc) / 1e6; if (t > latMax) latMax = t; latTen += 1; setImmediate(() => { moc = process.hrtime.bigint(); f(); }); },
    dung: () => Date.now() - T0 > BUDGET
  });
  hist.disable();
  if (Date.now() - T0 > BUDGET) log('KHÔNG ĐO XONG khởi động nóng: quá ngân sách (số liệu dở bên dưới)');
  log(`8. khởi động nóng: ${r.ms} ms tổng, ${r.so_lat} lát, ${r.so_ngay_bcvh_tinh} ngày-BCVH; LÁT dài nhất ${latMax.toFixed(0)} ms; độ trễ vòng lặp: p50 ${(hist.percentile(50) / 1e6).toFixed(0)} ms, p99 ${(hist.percentile(99) / 1e6).toFixed(0)} ms, max ${(hist.max / 1e6).toFixed(0)} ms${r.loi ? ` LỖI ${r.loi}` : ''}`);
  const c = dem();
  const [t] = ms(() => PD.ketQuaPhatThang(db, BC, pAll));
  log(`9. sau khởi động nóng, yêu cầu đầu: ${t.toFixed(0)} ms (tính lại ${dem() - c} ngày-BCVH)`);
})();
