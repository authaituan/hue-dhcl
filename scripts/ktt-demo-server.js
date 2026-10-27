// ==========================================
// KTT-9a-R: máy chủ DEMO cho trang «Hàng tại KTT» — DB tạm ở thư mục tạm của hệ điều hành + dữ liệu GIẢ (SHBG KTT-DEMO-xxxx) + tài khoản giả.
// KHÔNG ghi data/, KHÔNG đụng DB thật / .env. Dùng lại tests/helpers (chuyển hướng better-sqlite3 sang file tạm), không sửa server/.
// Chạy:  node scripts/ktt-demo-server.js   (cổng 5000, đổi bằng KTT_DEMO_PORT; vite proxy mặc định trỏ 5000)
// Rồi ở cửa sổ khác:  npm run dev:client   -> http://localhost:3000   (KHÔNG dùng `npm run dev`: nó khởi động cả server thật và tạo data/)
// Có thể require() để lấy napDuLieuGia(db) (không tự khởi động máy chủ).
// ==========================================
'use strict';
const path = require('path');
const { cachLySftpEnv } = require('../tests/helpers/khongMang');

const TH = '533140'; const HT = '535470'; const HTHUY = '536250'; const TA = '537015'; const PL = '537220'; const AL = '535790';
const BCVH = [TH, HT, HTHUY, TA, PL, AL];
// Đường thư đến GIẢ (tên giả, mã giả) + hồ sơ «xấu»: tre = cứ mỗi `tre` bưu gửi của nguồn thì 1 bưu gửi đi muộn (rớt lại / trượt chuyến); 0 = luôn đúng giờ.
const DUONG_THU = [
  { ma: 'DT-GIA-01', ten: 'Tuyến giả 1', tre: 0 }, { ma: 'DT-GIA-02', ten: 'Tuyến giả 2', tre: 6 }, { ma: 'DT-GIA-03', ten: 'Tuyến giả 3', tre: 3 },
  { ma: 'DT-GIA-04', ten: 'Tuyến giả 4', tre: 2 }, { ma: 'DT-GIA-05', ten: 'Tuyến giả 5', tre: 9 }, { ma: 'DT-GIA-06', ten: 'Tuyến giả 6', tre: 4 }, { ma: 'DT-GIA-07', ten: 'Tuyến giả 7', tre: 0 }
];
// Phân bố nguồn theo vòng (trọng số bằng số lần xuất hiện): 7 đường thư + nội tỉnh (53…) + không rõ nguồn.
const VONG_NGUON = [0, 1, 2, 0, 3, 4, 'NT', 5, 0, 1, 6, 2, 'NT', 3, 'KR', 0, 5, 1, 4, 2, 'NT', 6, 0, 3, 'KR', 1];
const USERS = [
  { hrm: 'KTT_DEMO_ADMIN', pass: 'KttDemo@2026', role: 'ADMIN' },
  { hrm: 'KTT_DEMO_TTVH', pass: 'KttDemo@2026', role: 'TTVH' },
  { hrm: 'KTT_DEMO_GDVH', pass: 'KttDemo@2026', role: 'GDVH' }
];

function homNayVn() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()); }
function dich(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }

/**
 * Nạp ~7 ngày (hôm nay-6 .. hôm nay) cho đủ 6 BCVH. Độ mới = hôm nay 10:00 -> các ngày ≤ hôm qua đã chốt, hôm nay «Số tạm».
 * Ngày hôm nay-4 để TRỐNG. Có hàng hoàn 531120, hàng «đang chờ chuyến» (hôm nay), hàng chưa đi đã lỡ chuyến, đi từ D+2.
 * Trả { tu, den, nguon }.
 */
function napDuLieuGia(db) {
  const K = require('../server/lib/kttNapCap');
  const TS = require('../server/lib/thamSo');
  let seq = 0;
  const them = (bang, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); };
  const today = homNayVn();
  const nguon = `${today} 10:00:00`;
  const NG = { nguon_xuat_luc: nguon, cap_nhat_luc: nguon };
  const tui = (o) => { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: today.replace(/-/g, ''), mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; };
  const bg = (t, shbg, gam) => them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: gam, ma_xa_phuong: '49122', ...NG });
  let n = 0;
  const kt = ({ quet, gioDi = null, nhan, diemGui = null }) => {
    const shbg = `KTT-DEMO-${String(++n).padStart(4, '0')}`;
    // khối lượng giả (g) đa dạng 40 g .. ~9 kg; cứ 23 bưu gửi thì 1 thiếu khối lượng
    const gam = n % 23 === 0 ? null : 40 + ((n * 937) % 8900);
    // nguồn: hàng hoàn giữ nơi gửi 531120; còn lại theo vòng (đường thư / nội tỉnh 53… / không rõ)
    let duong = null; let diem = diemGui;
    if (!diemGui) {
      const v = VONG_NGUON[n % VONG_NGUON.length];
      if (v === 'NT') diem = n % 2 ? '531200' : '532100';
      else if (v !== 'KR') duong = DUONG_THU[v];
      if (duong && duong.tre && gioDi && n % duong.tre === 0) gioDi = gioDi.endsWith('05:30:00') ? `${gioDi.slice(0, 10)} 13:00:00` : gioDi.endsWith('09:00:00') ? `${dich(gioDi.slice(0, 10), 1)} 06:00:00` : gioDi; // nguồn «xấu»: đi muộn hơn
    } else duong = DUONG_THU[n % DUONG_THU.length];
    const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: diem, bd10_den_ma_duong_thu: duong ? duong.ma : null, bd10_den_ten_duong_thu: duong ? duong.ten : null });
    bg(den, shbg, gam);
    const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan && gioDi ? nhan : '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: gioDi ? nhan : null });
    bg(di, shbg, gam);
  };
  const ngays = Array.from({ length: 7 }, (_, i) => dich(today, i - 6));
  ngays.forEach((d, i) => {
    if (i === 2) return; // ngày trống
    const homNay = d === today;
    const hqua = i === 5;
    BCVH.forEach((ma, j) => {
      const nhieu = 2 + ((i + j) % 3);
      for (let x = 0; x < nhieu + 2; x++) kt({ quet: `${d} 03:00:00`, gioDi: `${d} 05:30:00`, nhan: ma }); // t1
      for (let x = 0; x < 1 + ((i + j) % 2); x++) kt({ quet: `${d} 03:00:00`, gioDi: `${d} 09:00:00`, nhan: ma }); // t2
      if (homNay) {
        kt({ quet: `${d} 08:00:00`, nhan: ma }); // đang chờ chuyến
        kt({ quet: `${d} 08:30:00`, nhan: ma });
        return;
      }
      kt({ quet: `${d} 22:30:00`, gioDi: `${dich(d, 1)} 05:00:00`, nhan: ma }); // t3
      if (j % 2 === 0) kt({ quet: `${d} 22:30:00`, gioDi: `${dich(d, 1)} 11:00:00`, nhan: ma }); // t4
      if (!hqua) kt({ quet: `${d} 03:00:00`, gioDi: `${dich(d, 2)} 10:00:00`, nhan: ma }); // t5 (đi từ D+2, trượt)
      if (!hqua && j % 3 === 0) kt({ quet: `${d} 03:00:00`, gioDi: `${dich(d, 2)} 05:30:00`, nhan: ma }); // t5 đi D+2 nhưng đúng chuyến
      if (j % 2 === 1) kt({ quet: `${d} 11:00:00`, nhan: ma }); // chưa đi, đã lỡ chuyến (t5)
    });
    // thứ Bảy đến muộn về BCVH nghỉ Chủ nhật: chuyến kế là thứ Hai (D+2), đi đúng chuyến -> t5 «đi từ D+2 đúng chuyến»
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === 6 && dich(d, 2) <= today) kt({ quet: `${d} 22:30:00`, gioDi: `${dich(d, 2)} 06:00:00`, nhan: HTHUY });
    // hàng hoàn Tổ KHHH (531120) -> Thuận Hóa
    kt({ quet: `${d} 03:00:00`, gioDi: `${d} 05:30:00`, nhan: TH, diemGui: '531120' });
    if (!homNay) kt({ quet: `${d} 22:30:00`, gioDi: `${dich(d, 1)} 05:00:00`, nhan: TH, diemGui: '531120' });
  });
  K.ghiCap(db, { khoa_cap: `${today.replace(/-/g, '')}_100000`, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: nguon, nap_luc: nguon, cap_nhat_luc: nguon });
  TS.khoiTao(db);
  require('../server/lib/kttApi').xoaCache();
  return { tu: ngays[0], den: today, nguon };
}

async function main() {
  const fs = require('fs');
  const port = Number(process.env.KTT_DEMO_PORT) || 5000;
  const khoiPhuc = [cachLySftpEnv()]; // không SFTP, không mạng
  process.env.PHAT_WARM = '0';
  const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('../tests/helpers/serverHarness');
  const { seedUser } = require('../tests/helpers/fixtures');
  const ctx = startTestServer({ port, dbFileName: `dhcl-ktt-demo-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const u of USERS) seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
  const kq = napDuLieuGia(ctx.db);
  const thoat = async () => {
    try { await require('../server/lib/kttApi').dongNen(); } catch (e) { /* bỏ qua */ }
    await closeServer(ctx.server);
    cleanupDbFiles(ctx.testDbPath, ctx.db);
    process.exit(0); // 'exit' trong harness xóa data/ nếu rỗng
  };
  process.on('SIGINT', thoat); process.on('SIGTERM', thoat);
  console.log(`Máy chủ DEMO: ${ctx.baseUrl}  (DB tạm: ${ctx.testDbPath})`);
  console.log(`Dữ liệu giả KTT-DEMO: ${kq.tu} .. ${kq.den}, độ mới ${kq.nguon}`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(5)} đăng nhập: ${u.hrm}  /  ${u.pass}`);
  console.log('Mở cửa sổ khác: npm run dev:client  -> http://localhost:3000 . Dừng: Ctrl+C.');
  void fs; void path;
}

module.exports = { napDuLieuGia, BCVH, USERS };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
