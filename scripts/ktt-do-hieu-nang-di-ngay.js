#!/usr/bin/env node
// ==========================================
// KTT-12b: đo thời gian từng endpoint KTT-12 (đi cùng ngày, rớt lại, lịch xe, danh sách, hàng đến, tổng quan) ở cửa sổ 30 ngày cuối của dữ liệu —
// lần đầu (cache trống) và lần cache. CHỈ ĐỌC, chạy trên MỘT BẢN SAO DB (chép vào thư mục tạm TRƯỚC; từ chối đường dẫn nằm trong data/ của dự án). Không in số hiệu bưu gửi.
//   KTT_PERF=1 node scripts/ktt-do-hieu-nang-di-ngay.js <đường dẫn bản sao hue-dhcl.db> [số_ngày=30]
// (Không chạy trong bộ test: serverHarness chuyển hướng mọi `new Database()` sang DB tạm của test.)
// ==========================================
'use strict';
const path = require('path');
const fs = require('fs');

if (!process.env.KTT_PERF) { console.error('Đặt KTT_PERF=1 để đo (tránh chạy nhầm).'); process.exit(2); }
const duongDan = process.argv[2];
const soNgay = Number(process.argv[3] || 30);
if (!duongDan || !fs.existsSync(duongDan) || !Number.isInteger(soNgay) || soNgay < 1 || soNgay > 31) { console.error('Dùng: KTT_PERF=1 node scripts/ktt-do-hieu-nang-di-ngay.js <bản sao hue-dhcl.db> [số_ngày 1..31]'); process.exit(2); }
const goc = path.resolve(__dirname, '..', 'data') + path.sep;
if (path.resolve(duongDan).toLowerCase().startsWith(goc.toLowerCase())) { console.error('Từ chối: đây là data/ của dự án. Hãy chép DB sang thư mục tạm rồi đo trên bản sao.'); process.exit(2); }

const Database = require('better-sqlite3');
const L = require('../server/lib/kttLichChuyen');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');

(async () => {
  const db = new Database(duongDan, { fileMustExist: true });
  try {
    const doMoi = QL.docDoMoi(db);
    if (!doMoi) { console.error('Bản sao chưa có cặp OK (không có độ mới).'); process.exitCode = 1; return; }
    const den = doMoi.nguon_xuat_luc.slice(0, 10);
    const tu = L.dinhDang(L.giayCua(`${den} 00:00:00`) - (soNgay - 1) * 86400).slice(0, 10);
    const q = { tu, den };
    const ms = async (f) => { const t0 = process.hrtime.bigint(); const r = await f(); return { r, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e5) / 10 }; };
    const DS = [
      ['luu-thoat (đối chứng KTT-8)', () => Api.luuThoat(db, q)],
      ['dicungngay/tong-hop', () => Api.diCungNgayTongHop(db, q)], ['dicungngay/theo-ngay', () => Api.diCungNgayTheoNgay(db, q)], ['dicungngay/theo-gio', () => Api.diCungNgayTheoGio(db, q)],
      ['rotlai/theo-duong-thu', () => Api.rotLaiTheoDuongThu(db, q)], ['lich-xe/gio-lap-bd10', () => Api.lichXeGioLapBd10(db, q)], ['lich-xe/theo-duong-thu', () => Api.lichXeTheoDuongThu(db, q)],
      ['lich-xe/theo-bcvh', () => Api.lichXeTheoBcvh(db, q)], ['danh-sach hom-sau (trang 1)', () => Api.danhSachDiNgay(db, { ...q, loai: 'hom-sau' })],
      ['danh-sach chua-di-24h (trang 1)', () => Api.danhSachDiNgay(db, { ...q, loai: 'chua-di-24h' })],
      ['hang-den/tong-hop', () => Api.hangDenTongHop(db, q)], ['hang-den/theo-gio', () => Api.hangDenTheoGio(db, q)], ['hang-den/theo-duong-thu', () => Api.hangDenTheoDuongThu(db, q)], ['hang-den/xe', () => Api.hangDenXe(db, q)],
      ['tong-quan', () => Api.tongQuan(db, q)]
    ];
    await ms(() => Api.hangDenTongHop(db, { tu: den, den })); // khởi động worker_thread trước khi đo
    console.log(`Cửa sổ ${tu}..${den} (${soNgay} ngày); độ mới ${doMoi.nguon_xuat_luc}`);
    console.log('endpoint | lần đầu (ms) | lần cache (ms)');
    for (const [ten, f] of DS) {
      Api.xoaCache();
      const a = await ms(f);
      const b = await ms(f);
      console.log(`${ten} | ${a.ms} | ${b.ms}`);
    }
    Api.xoaCache();
    const dau = await ms(() => Api.diCungNgayTongHop(db, q));
    const sau = await ms(() => Promise.all([Api.diCungNgayTheoNgay(db, q), Api.diCungNgayTheoGio(db, q), Api.rotLaiTheoDuongThu(db, q), Api.lichXeTheoDuongThu(db, q), Api.tongQuan(db, q)]));
    console.log(`(thứ tự dùng thật) dicungngay/tong-hop nguội ${dau.ms}; rồi theo-ngay + theo-gio + rotlai + lich-xe/theo-duong-thu + tong-quan song song ${sau.ms}`);
  } finally { db.close(); await Api.dongNen(); }
})().catch((e) => { console.error('Lỗi:', e && e.code ? e.code : (e && e.message)); process.exit(1); });
