// ==========================================
// «Hàng tại KTT» (KTT-15): LÀM NÓNG bộ nhớ đệm nền. Sau mỗi lần nạp cặp CSV KTT thành công và một lần sau khi máy chủ khởi động, tính sẵn — từng ngày một, tuần tự,
// nhường luồng chính giữa các ngày — những mục mà kttApi.js sẽ cần khi người dùng mở trang, để lần mở đầu không gặp lần nguội 16–21 giây (cửa sổ 30 ngày).
// CHỈ ĐỌC DB. Không có đường tính riêng: gọi ĐÚNG layNgay / layNgayB / layHangDen / layGioLapBd10 của kttApi.js (request thật đến giữa chừng dùng chung lần tính đang chạy,
// không tính trùng) nên kết quả nóng = kết quả nguội. Không đổi định nghĩa, không bảng DB mới, không giữ thêm tập SHBG (chỉ các mục đệm sẵn có).
// Thứ tự: (1) các ngày trong cửa sổ nạp (từ ngày của độ mới lùi CUA_SO_NAP_NGAY ngày), mỗi ngày: bó B + /luu-thoat mốc `xnd` + mốc `quet_tui_den`;
//         (2) mục theo khoảng (hang-den A, gio-lap-bd10 B4/B6) cho hai cửa sổ chuẩn 7 và 30 ngày kết thúc ở ngày của độ mới (chạy ở worker, TTL 10 phút như request);
//         (3) lượt THƯA: các ngày cũ hơn đến đủ KTT_WARM_NGAY ngày (mặc định 31), nghỉ lâu hơn giữa các ngày — ngày nào còn trong cache 6 giờ thì không tính lại.
// Biến môi trường: KTT_WARM=0 tắt hẳn (mặc định BẬT); KTT_WARM_NGAY=1..31 số ngày làm nóng tối đa (mặc định 31; 9 = chỉ cửa sổ nạp).
// Một lượt chạy tại một thời điểm; lượt mới (nạp tiếp) hủy lượt đang chạy ở ranh giới ngày rồi chạy lại với độ mới mới. Lỗi không bao giờ ném ra ngoài: chỉ một dòng log, KHÔNG có số liệu thật.
// ==========================================
'use strict';
const Api = require('./kttApi');
const QL = require('./kttLuuThoatQuery');
const S = require('./kttLuuThoat');

const { layNgay, layNgayB, layHangDen, layGioLapBd10, dongBoPhienBan, ngayLui, CUA_SO_NAP_NGAY } = Api.noiBoNong;
const NGAY_TOI_DA = 31;
const NGHI_CUA_SO_MS = 25; // giữa hai ngày trong cửa sổ nạp
const NGHI_THUA_MS = 150; // giữa hai ngày của lượt thưa
const COC_CUA_SO = [7, 30]; // cửa sổ chuẩn của trang (số ngày kết thúc ở ngày của độ mới)
const MOC = [S.MOC_CHI_TIEU_MAC_DINH, ...Object.values(S.MOC_CHI_TIEU).filter((m) => m !== S.MOC_CHI_TIEU_MAC_DINH)];

const trangThai = { dangChay: false, lan: 0, lanCuoi: null };
let the = 0; // số thứ tự lượt mới nhất; lượt cũ thấy `the` đổi thì dừng
let hangCho = Promise.resolve();

/** Bật mặc định; chỉ KTT_WARM=0 mới tắt. */
const dangBat = (env = process.env) => String(env.KTT_WARM ?? '').trim() !== '0';
function soNgay(env = process.env) {
  const n = Number(String(env.KTT_WARM_NGAY ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= NGAY_TOI_DA ? n : NGAY_TOI_DA;
}
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function mot(db, ngay, doMoi) {
  // Cùng khóa cache với request: /luu-thoat (hai mốc) và bó B (B1–B6, danh-sach, tong-quan).
  await layNgayB(db, ngay, doMoi, Date.now());
  for (const moc of MOC) await layNgay(db, ngay, doMoi, Date.now(), moc);
}

async function chayLuot(db, { lyDo, env, dung, nghiCuaSoMs, nghiThuaMs }, soThuTu) {
  const bd = Date.now();
  const tk = { ly_do: lyDo, ngay_cua_so: 0, ngay_thua: 0, muc_khoang: 0, bi_huy: false, loi: null, ms: 0 };
  const huy = () => the !== soThuTu || (typeof dung === 'function' && dung());
  try {
    const doMoi = QL.docDoMoi(db);
    if (!doMoi) { tk.ly_do = 'CHUA_CO_DU_LIEU'; return tk; }
    const nguonXuat = doMoi.nguon_xuat_luc;
    const den = nguonXuat.slice(0, 10);
    const tongNgay = soNgay(env);
    dongBoPhienBan(db);
    // (1) cửa sổ nạp: mới nhất trước (trang mở theo ngày gần đây)
    const trongCuaSo = Math.min(tongNgay, CUA_SO_NAP_NGAY + 1);
    for (let i = 0; i < trongCuaSo; i++) {
      if (huy()) { tk.bi_huy = true; return tk; }
      await mot(db, ngayLui(den, i), nguonXuat);
      tk.ngay_cua_so++;
      await nghi(nghiCuaSoMs);
    }
    // (2) mục theo khoảng cho hai cửa sổ chuẩn: chạy ở worker; chỉ làm khi các ngày của khoảng đã nằm trong cache (ngày cũ chưa làm nóng vẫn đúng, chỉ là chưa nhanh)
    for (const n of COC_CUA_SO) {
      if (n > tongNgay) continue;
      if (huy()) { tk.bi_huy = true; return tk; }
      const k = { tuNgay: ngayLui(den, n - 1), denNgay: den };
      await layHangDen(db, k, Date.now());
      for (const minBd10 of [5, 1]) await layGioLapBd10(db, k, minBd10, Date.now()); // 5 = mặc định B4; 1 = B6
      tk.muc_khoang++;
      await nghi(nghiCuaSoMs);
    }
    // (3) lượt thưa: các ngày cũ hơn cửa sổ nạp
    for (let i = trongCuaSo; i < tongNgay; i++) {
      if (huy()) { tk.bi_huy = true; return tk; }
      await mot(db, ngayLui(den, i), nguonXuat);
      tk.ngay_thua++;
      await nghi(nghiThuaMs);
    }
  } catch (e) {
    tk.loi = e && e.code ? String(e.code).slice(0, 40) : (e && e.name ? String(e.name).slice(0, 40) : 'LOI');
  } finally {
    tk.ms = Date.now() - bd;
  }
  return tk;
}

/**
 * Bắt đầu làm nóng (không chặn: trả Promise của lượt này, người gọi không cần await). opts: { lyDo ('SAU_NAP' | 'KHOI_DONG'), env, dung (() -> bool), log, nghiCuaSoMs, nghiThuaMs }.
 * Tắt (KTT_WARM=0) -> không làm gì, trả { da_chay: false, ly_do: 'TAT' }. KHÔNG bao giờ ném lỗi hay từ chối Promise.
 */
function batDauNong(db, opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || ((m) => console.log(m));
  if (!dangBat(env)) return Promise.resolve({ da_chay: false, ly_do: 'TAT' });
  const soThuTu = ++the;
  const lyDo = opts.lyDo || 'SAU_NAP';
  const chay = hangCho.then(async () => {
    if (the !== soThuTu) return { da_chay: false, ly_do: 'DA_CO_LUOT_MOI' }; // lượt mới hơn đã xếp hàng: bỏ lượt này
    trangThai.dangChay = true; trangThai.lan++;
    const tk = await chayLuot(db, { lyDo, env, dung: opts.dung, nghiCuaSoMs: opts.nghiCuaSoMs ?? NGHI_CUA_SO_MS, nghiThuaMs: opts.nghiThuaMs ?? NGHI_THUA_MS }, soThuTu);
    trangThai.dangChay = false; trangThai.lanCuoi = tk;
    try {
      log(`[ktt-nong] ${lyDo}: ${tk.ngay_cua_so}+${tk.ngay_thua} ngày, ${tk.muc_khoang} mục khoảng trong ${tk.ms} ms${tk.bi_huy ? ' (bị hủy)' : ''}${tk.loi ? ` (lỗi: ${tk.loi})` : ''}`);
    } catch (e) { /* log hỏng không được làm sập */ }
    return { da_chay: true, ...tk };
  }).catch(() => ({ da_chay: false, ly_do: 'LOI' }));
  hangCho = chay;
  return chay;
}

const docTrangThai = () => ({ dang_chay: trangThai.dangChay, so_lan: trangThai.lan, lan_cuoi: trangThai.lanCuoi ? { ...trangThai.lanCuoi } : null });
/** Chỉ cho test: đặt lại bộ đếm lượt. */
function datLai() { the++; hangCho = Promise.resolve(); trangThai.dangChay = false; trangThai.lan = 0; trangThai.lanCuoi = null; }

module.exports = { batDauNong, dangBat, soNgay, docTrangThai, datLai, NGAY_TOI_DA, COC_CUA_SO };
