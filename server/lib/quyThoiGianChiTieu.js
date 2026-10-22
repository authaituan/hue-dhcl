// ==========================================
// Lõi THUẦN chỉ tiêu F1.3 theo từng lượt (QUYTG-7b): theo BCVH nhận và phường/xã nhận. Không đụng DB, không require module nào của app.
//
// Mốc đo KHÔNG đổi (QUYTG-2). Mặc định mọi lượt 14 giờ; ngoại lệ khai ở NGOAI_LE_CHI_TIEU (sau này nối vào «Tham số hệ thống»):
// bưu gửi của BCVH `maBcvh` có phường/xã nhận nằm trong `phuong` -> `gio`. Phường/xã rỗng hoặc không khớp -> mặc định.
//
// So khớp tên phường/xã (chuanHoaTenXaPhuong): ép chuỗi, NFC, Ð/ð -> Đ/đ, trim, gộp khoảng trắng, chữ thường, bỏ MỘT tiền tố hành chính ở đầu
// (Phường / Xã / Thị trấn / P. / X. / TT.); chữ NULL (không phân biệt hoa thường) = rỗng. GIỮ NGUYÊN dấu thanh và dấu mũ
// (khác wardKey của arrivalsImport.js vốn bỏ dấu): «Thuận Hòa» khác «Thuận Hóa». Khớp bằng nhau toàn chuỗi, không «chứa».
// Chỉ mục ngoại lệ được dựng MỘT lần khi nạp module từ mảng (đã đóng băng): sửa cấu hình = sửa mảng rồi nạp lại.
// ==========================================
'use strict';

const CHI_TIEU_MAC_DINH_GIO = 14;

const NGOAI_LE_CHI_TIEU = Object.freeze([
  Object.freeze({ maBcvh: '533140', phuong: Object.freeze(['Thuận Hóa', 'Phú Xuân']), gio: 12 })
]);

const TIEN_TO_RE = /^(?:(?:phường|xã|thị trấn)\s+|(?:tt|p|x)\.\s*)/;

/** Tên phường/xã -> dạng so khớp (chữ thường, giữ dấu, bỏ tiền tố hành chính); rỗng / null / undefined / 'NULL' -> ''. */
function chuanHoaTenXaPhuong(ten) {
  if (ten === null || ten === undefined) return '';
  const s = String(ten)
    .normalize('NFC')
    .replace(/[Ðð]/g, (c) => (c === 'Ð' ? 'Đ' : 'đ'))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (s === 'null') return '';
  return s.replace(TIEN_TO_RE, '').trim();
}

const chuanHoaMa = (ma) => (ma === null || ma === undefined ? '' : String(ma).trim());

const CHI_MUC = new Map(NGOAI_LE_CHI_TIEU.map((e) => [chuanHoaMa(e.maBcvh), { gio: e.gio, phuong: new Set(e.phuong.map(chuanHoaTenXaPhuong)) }]));

/** Mã BCVH có nằm trong cấu hình ngoại lệ không. */
function maCoNgoaiLe(maBcvh) {
  return CHI_MUC.has(chuanHoaMa(maBcvh));
}

/** Chỉ tiêu F1.3 (giờ) của một lượt: gio của ngoại lệ khi (mã BCVH, phường/xã) khớp, còn lại CHI_TIEU_MAC_DINH_GIO. */
function chiTieuGio(maBcvh, tenXaPhuong) {
  const m = CHI_MUC.get(chuanHoaMa(maBcvh));
  if (!m) return CHI_TIEU_MAC_DINH_GIO;
  const p = chuanHoaTenXaPhuong(tenXaPhuong);
  return p !== '' && m.phuong.has(p) ? m.gio : CHI_TIEU_MAC_DINH_GIO;
}

module.exports = { CHI_TIEU_MAC_DINH_GIO, NGOAI_LE_CHI_TIEU, chuanHoaTenXaPhuong, maCoNgoaiLe, chiTieuGio };
