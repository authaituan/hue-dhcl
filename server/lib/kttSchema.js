// ==========================================
// Lớp dữ liệu «Hàng tại KTT» (KTT-2): schema SQLite + bảng ánh xạ cột CSV -> cột DB + dữ liệu cấu hình mặc định V1.
// Sáu bảng: ktt_nap_lan, ktt_tui, ktt_buu_gui (dữ liệu) và ktt_cau_hinh_chuyen, ktt_cau_hinh, ktt_dia_ban_phat (cấu hình / danh mục; ktt_dia_ban_phat thêm ở KTT-5).
// Nguồn CSV: script SQL chạy tay trên CSDL KTT (POSCode 530100), hai file KTT_Tui_*.csv và KTT_BuuGui_*.csv. Chỉ LƯU NGUYÊN giá trị nguồn:
// KHÔNG tính «treo», «nằm lâu», «trễ chuyến» ở đây (đó là KTT-4). Mọi giờ là giờ địa phương VN (không đổi múi giờ), lưu TEXT `YYYY-MM-DD HH:MM:SS`;
// riêng `cap_nhat_luc` / `nap_luc` là UTC.
// Cột CHƯA từng lưu (cố ý bỏ khỏi bảng ánh xạ): BD10_di_status, BD10_di_TransferDate, DestinationPOSCode, tên lái xe, biển số, người thao tác, tài khoản CSDL.
// Idempotent: gọi từ server/db.js và từ công cụ dòng lệnh (theo mẫu ensureArrivalSchema).
// ==========================================
'use strict';

// Kiểu giá trị của một cột CSV: text (chuỗi, trim, rỗng -> NULL), int, real (dấu chấm thập phân kiểu SSMS), bool (0/1), time (-> YYYY-MM-DD HH:MM:SS, bỏ phần ms).
const SQL_TYPE = { text: 'TEXT', time: 'TEXT', int: 'INTEGER', bool: 'INTEGER', real: 'REAL' };

// Bảy cột khóa túi (CHỮ, không ép số, giữ số 0 đầu). Cột `Year` thực chất là NGÀY dạng 20261020; `PostBagIndex` / `MailTripNumber` chỉ là số thứ tự nhỏ.
// `alias`: tên CSV khác cũng được chấp nhận (tên CHÍNH XÁC trong file xuất là `Tui_*`, đã đối chiếu ở KTT-2b; alias chỉ để dung sai). `luonNull`: script chưa tra, luôn NULL — vắng cột cũng không báo.
const KHOA_TUI = [
  { csv: 'Tui_FromPOSCode', alias: ['FromPOSCode'], db: 'from_pos', kind: 'text', key: true },
  { csv: 'Tui_ToPOSCode', alias: ['ToPOSCode'], db: 'to_pos', kind: 'text', key: true },
  { csv: 'Tui_MailTripType', alias: ['MailTripType'], db: 'mail_trip_type', kind: 'text', key: true },
  { csv: 'Tui_ServiceCode', alias: ['ServiceCode'], db: 'service_code', kind: 'text', key: true },
  { csv: 'Tui_Year', alias: ['Year'], db: 'year', kind: 'text', key: true },
  { csv: 'Tui_MailTripNumber', alias: ['MailTripNumber'], db: 'mail_trip_number', kind: 'text', key: true },
  { csv: 'Tui_PostBagIndex', alias: ['PostBagIndex'], db: 'post_bag_index', kind: 'text', key: true }
];

const NGUON_XUAT = { csv: 'Nguon_xuat_luc', db: 'nguon_xuat_luc', kind: 'time', required: true };

// Bảng ánh xạ CSV -> DB của file túi (NGUỒN SỰ THẬT: schema và importer đều sinh từ đây). `required` = thiếu cột này thì dừng file.
const COT_TUI = [
  ...KHOA_TUI,
  { csv: 'So_hieu_BD8', db: 'so_hieu_bd8', kind: 'text' },
  { csv: 'Ma_loai_tui', db: 'ma_loai_tui', kind: 'text' },
  { csv: 'Chieu', db: 'chieu', kind: 'text' }, // DEN / DI / CHUYEN_TIEP_DI (lưu nguyên, không CHECK)
  { csv: 'Dich_nhom', db: 'dich_nhom', kind: 'text' }, // BCVH_HUE / HE1_530900 / KTT / KHAC
  { csv: 'Luong', db: 'luong', kind: 'text' }, // DI_NGOAI / KHAI_THAC_DEN / KHAI_THAC_DI / DA_CHIA_SAN
  { csv: 'Co_mo_tui', db: 'co_mo_tui', kind: 'bool' },
  { csv: 'Co_dong_tui', db: 'co_dong_tui', kind: 'bool' },
  { csv: 'Chuyen_thu_gio_dong', db: 'chuyen_thu_gio_dong', kind: 'time' },
  { csv: 'Chuyen_thu_gio_mo', db: 'chuyen_thu_gio_mo', kind: 'time' },
  { csv: 'So_luong_tui', db: 'so_luong_tui', kind: 'int' },
  { csv: 'So_dong_dispatch', db: 'so_dong_dispatch', kind: 'int' },
  { csv: 'Khoi_luong_tui', db: 'khoi_luong_tui_kg', kind: 'real' }, // kg
  { csv: 'Khoi_luong_quy_doi_tui', db: 'khoi_luong_quy_doi_tui', kind: 'real' }, // đang đều = 1, chưa rõ nghĩa: lưu nguyên, không dùng
  { csv: 'Dich_vu_code', db: 'dich_vu_code', kind: 'text' },
  { csv: 'Ten_dich_vu', db: 'ten_dich_vu', kind: 'text' },
  { csv: 'BD10_den_so_hieu', db: 'bd10_den_so_hieu', kind: 'text' },
  { csv: 'BD10_den_XND', db: 'bd10_den_xnd', kind: 'time' },
  { csv: 'BD10_den_ma_diem_gui', db: 'bd10_den_ma_diem_gui', kind: 'text' },
  { csv: 'BD10_den_ten_diem_gui', db: 'bd10_den_ten_diem_gui', kind: 'text' },
  { csv: 'BD10_den_ma_duong_thu', db: 'bd10_den_ma_duong_thu', kind: 'text' },
  { csv: 'BD10_den_ten_duong_thu', db: 'bd10_den_ten_duong_thu', kind: 'text' },
  { csv: 'BD10_den_ma_hinh_thuc_vc', db: 'bd10_den_ma_hinh_thuc_vc', kind: 'text' },
  { csv: 'BD10_den_ten_hinh_thuc_vc', db: 'bd10_den_ten_hinh_thuc_vc', kind: 'text' },
  { csv: 'BD10_den_ma_lich', db: 'bd10_den_ma_lich', kind: 'text' },
  { csv: 'BD10_den_ten_lich', db: 'bd10_den_ten_lich', kind: 'text' },
  { csv: 'So_bd10_den', db: 'so_bd10_den', kind: 'int' },
  { csv: 'Gio_quet_tui_den', db: 'gio_quet_tui_den', kind: 'time' },
  { csv: 'So_lan_quet_den', db: 'so_lan_quet_den', kind: 'int' },
  { csv: 'BD10_di_so_hieu', db: 'bd10_di_so_hieu', kind: 'text' },
  { csv: 'BD10_di_gio_di', db: 'bd10_di_gio_di', kind: 'time' },
  { csv: 'BD10_di_ma_diem_nhan', db: 'bd10_di_ma_diem_nhan', kind: 'text' },
  { csv: 'BD10_di_ten_diem_nhan', db: 'bd10_di_ten_diem_nhan', kind: 'text' },
  { csv: 'BD10_di_ma_duong_thu', db: 'bd10_di_ma_duong_thu', kind: 'text' },
  { csv: 'BD10_di_ten_duong_thu', db: 'bd10_di_ten_duong_thu', kind: 'text' },
  { csv: 'BD10_di_ma_hinh_thuc_vc', db: 'bd10_di_ma_hinh_thuc_vc', kind: 'text' },
  { csv: 'BD10_di_ten_hinh_thuc_vc', db: 'bd10_di_ten_hinh_thuc_vc', kind: 'text' },
  { csv: 'BD10_di_ma_lich', db: 'bd10_di_ma_lich', kind: 'text' },
  { csv: 'BD10_di_ten_lich', db: 'bd10_di_ten_lich', kind: 'text' },
  { csv: 'Gio_quet_tui_di', db: 'gio_quet_tui_di', kind: 'time' },
  NGUON_XUAT
];

// Bảng ánh xạ của file bưu gửi-trong-túi: 7 cột khóa túi + SHBG (khóa) + thuộc tính. Khối lượng tính bằng GAM.
const COT_BUU_GUI = [
  ...KHOA_TUI,
  { csv: 'SHBG', db: 'shbg', kind: 'text', key: true, hoa: true }, // hoa: chuẩn hóa chữ HOA, Ð -> Đ (khóa so khớp ổn định)
  { csv: 'Khoi_luong_thuc_te', db: 'khoi_luong_thuc_te_g', kind: 'real' }, // gam
  { csv: 'Khoi_luong_quy_doi', db: 'khoi_luong_quy_doi', kind: 'real' }, // đang đều = 1, chưa rõ nghĩa: lưu nguyên, không dùng
  { csv: 'Dich_vu_code', db: 'dich_vu_code', kind: 'text' },
  { csv: 'Ten_dich_vu', db: 'ten_dich_vu', kind: 'text' },
  { csv: 'Ma_Xa_Phuong', db: 'ma_xa_phuong', kind: 'text' },
  { csv: 'Ten_Xa_Phuong', db: 'ten_xa_phuong', kind: 'text' },
  { csv: 'Ma_Tinh_Thanh', db: 'ma_tinh_thanh', kind: 'text' },
  { csv: 'Ten_Tinh_Thanh', db: 'ten_tinh_thanh', kind: 'text' },
  { csv: 'Ma_Quan_Huyen', db: 'ma_quan_huyen', kind: 'text' },
  { csv: 'Ten_Quan_Huyen', db: 'ten_quan_huyen', kind: 'text', luonNull: true }, // script chưa tra tên: luôn NULL (chấp nhận, không phải lỗi)
  { csv: 'Ma_loai_buu_gui', db: 'ma_loai_buu_gui', kind: 'text' },
  { csv: 'Ten_loai_buu_gui', db: 'ten_loai_buu_gui', kind: 'text', luonNull: true }, // script chưa tra tên: luôn NULL
  { csv: 'TI_den_theo_tui_luc', db: 'ti_den_theo_tui_luc', kind: 'time' },
  { csv: 'TI_xac_nhan_den_luc', db: 'ti_xac_nhan_den_luc', kind: 'time' },
  { csv: 'TI_dong_chuyen_thu_di_luc', db: 'ti_dong_chuyen_thu_di_luc', kind: 'time' },
  NGUON_XUAT
];

// KTT-17-1: danh sách SHBG hàng hoàn (ItemReturn của CSDL BCCP), file RIÊNG KTT_HangHoan_<yyyymmdd>_<hhmmss>.csv, KHÔNG ghép cặp với Tui / BuuGui. Chỉ lấy SHBG; CỘNG DỒN (không xóa).
// Dùng chung lõi đọc của kttImport.docFile nên khai báo cùng dạng với LOAI_FILE (bang, cot, khoa, gioCot), nhưng KHÔNG nằm trong LOAI_FILE (tránh ảnh hưởng ghép cặp / ktt_nap_lan).
const COT_HANG_HOAN = [
  { csv: 'SHBG', db: 'shbg', kind: 'text', key: true, hoa: true }, // chuẩn hóa như ktt_buu_gui.shbg (HOA, Ð -> Đ)
  NGUON_XUAT
];
const FILE_HANG_HOAN = { loai: 'HANG_HOAN', bang: 'ktt_hang_hoan', mauTen: /^KTT_HangHoan_(\d{8})_(\d{6})\.csv$/, mau: 'KTT_HangHoan_<yyyymmdd>_<hhmmss>.csv', cot: COT_HANG_HOAN, khoa: ['shbg'], gioCot: 'nguon_xuat_luc' };

// Mỗi loại file: bảng đích, gioCot (cột giờ ghi giờ dữ liệu nhỏ nhất / lớn nhất của file vào nhật ký cặp, KTT-6), mẫu tên file, bảng ánh xạ cột, khóa tự nhiên (theo cột DB).
const LOAI_FILE = {
  TUI: { loai: 'TUI', bang: 'ktt_tui', mauTen: /^KTT_Tui_(\d{8})_(\d{6})\.csv$/, mau: 'KTT_Tui_<yyyymmdd>_<hhmmss>.csv', cot: COT_TUI, gioCot: 'gio_quet_tui_den' },
  BUU_GUI: { loai: 'BUU_GUI', bang: 'ktt_buu_gui', mauTen: /^KTT_BuuGui_(\d{8})_(\d{6})\.csv$/, mau: 'KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv', cot: COT_BUU_GUI, gioCot: 'ti_den_theo_tui_luc' }
};
for (const cfg of Object.values(LOAI_FILE)) cfg.khoa = cfg.cot.filter((c) => c.key).map((c) => c.db);

// Lịch V1 (ktt_cau_hinh_chuyen, ước lượng 23/10/2026): đã BỎ seed ở KTT-LICH-2 (05/11/2026). Lịch chuẩn là `ktt_lich_chuyen`; không còn nơi nào xếp chuyến theo V1. Bảng vẫn được tạo (DB cũ còn dòng thì để nguyên).
const GHI_CHU_CHUYEN_V1 = 'V1 ước lượng từ giờ đi thực tế, chờ PO cung cấp giờ chính xác';
const CHUYEN_MAC_DINH = [];
const NGUONG_MAC_DINH = [
  ['treo_phut', 180, 'Túi có mã quét đến mà không có dấu hiệu đi sau bằng này phút liên tục thì xét «treo» (V1: 3 giờ)'],
  ['nam_lau_toi_da_phut', 1440, 'Hàng nằm tại KTT quá bằng này phút thì xét «nằm lâu» (V1: 24 giờ)'],
  ['chi_tieu_f13_gio', 14, 'Chỉ tiêu F1.3, đơn vị giờ'],
  ['chi_tieu_f13_gio_thuan_hoa_phu_xuan', 12, 'Chỉ tiêu F1.3 cho tuyến Thuận Hóa / Phú Xuân, đơn vị giờ']
];

// Lịch chuyến CHÍNH THỨC: LỊCH CHUẨN PO chốt 05/11/2026 (KTT-LICH-2; thay lịch KTT-7a 26/10 và phần lịch của Quyết định #112): giờ xe RỜI KTT chở hàng cho BCVH.
// ngay_chay: CA_TUAN | NGHI_CN (nghỉ Chủ nhật), đặt ở MỨC DÒNG chuyến. Không đưa vào: tuyến Sân bay, Hương Thủy 10:00 / 16:00 (xe điểm nhỏ lẻ), Phú Vang, Bình Điền, chuyến BĐTP C2 16:00.
// [BCVH, giờ rời KTT 'HH:MM', ngày chạy, nhãn | null, ghi chú | null]
const LICH_CHUYEN_MAC_DINH = [
  ['533140', '07:00', 'CA_TUAN', null, null], ['533140', '12:45', 'CA_TUAN', null, null], ['533140', '12:55', 'CA_TUAN', null, 'sát 12:45, vẫn là hai mốc riêng'],
  ['533140', '19:45', 'CA_TUAN', null, null], ['533140', '22:00', 'CA_TUAN', 'C4', 'C4, hạn đến 21:00'],
  ['536250', '07:30', 'CA_TUAN', null, 'xe lồng lưới; Chủ nhật chỉ chuyến này'], ['536250', '12:45', 'NGHI_CN', null, 'xe lồng lưới; nghỉ Chủ nhật'],
  ['535470', '06:10', 'CA_TUAN', null, 'xe cấp 1'], ['535470', '12:00', 'CA_TUAN', null, 'xe cấp 1'],
  ['537015', '07:30', 'CA_TUAN', null, null], ['537015', '13:30', 'NGHI_CN', null, null],
  ['537220', '07:30', 'CA_TUAN', null, null], ['537220', '13:00', 'NGHI_CN', null, null],
  ['535790', '08:00', 'CA_TUAN', null, 'một chuyến; chạy cả Chủ nhật']
];
// Phiên bản lịch (khóa `lich_phien_ban` trong ktt_lich_cau_hinh): khi nhỏ hơn số này, ensureKttSchema ĐỒNG BỘ ktt_lich_chuyen về LICH_CHUYEN_MAC_DINH MỘT LẦN (xóa dòng ngoài chuẩn, ghi đè dòng trùng, thêm dòng thiếu), trong một giao dịch.
// Sau đó giá trị PO sửa tay không bị ghi đè nữa. Muốn đổi lịch chuẩn lần sau: sửa mảng trên và tăng số này (YYYYMMDD).
const LICH_PHIEN_BAN = 20261105;
const KHOA_LICH_PHIEN_BAN = 'lich_phien_ban';
// Tham số của lịch chuyến (bảng ktt_lich_cau_hinh, TÁCH khỏi ktt_cau_hinh của KTT-2): hạn hàng đến để kịp chuyến = giờ rời KTT − chừng này phút.
const LICH_CAU_HINH_MAC_DINH = [
  ['han_den_truoc_chuyen_phut', 60, 'Hàng quét đến chậm nhất (giờ rời KTT trừ chừng này phút) thì kịp chuyến đó']
];

// Địa bàn phát (KTT-5): phường/xã -> BCVH Huế phát. Danh mục hành chính công khai. Chính tả giữ nguyên theo ticket KTT-5 (kể cả «Phong Dinh»); PO sẽ chỉnh sau nếu cần.
// [BCVH, tên BCVH, [[mã phường/xã, tên phường/xã], ...]]
const DIA_BAN_PHAT_MAC_DINH = [
  ['535790', 'A Lưới', [['49527', 'Xã A Lưới 1'], ['49528', 'Xã A Lưới 2'], ['49529', 'Xã A Lưới 3'], ['49530', 'Xã A Lưới 4'], ['49531', 'Xã A Lưới 5']]],
  ['536250', 'Hương Thủy', [['49620', 'Phường Hương Thủy'], ['49612', 'Phường Phú Bài'], ['49619', 'Phường Thanh Thủy'], ['49424', 'Xã Bình Điền'], ['49925', 'Xã Phú Hồ'], ['49929', 'Xã Phú Vang'], ['49928', 'Xã Phú Vinh'], ['49824', 'Xã Vinh Lộc']]],
  ['535470', 'Hương Trà', [['49134', 'Phường Hóa Châu'], ['49422', 'Phường Hương Trà'], ['49423', 'Phường Kim Trà'], ['49322', 'Phường Phong Điền'], ['49325', 'Phường Phong Dinh'], ['49309', 'Phường Phong Phú'], ['49324', 'Phường Phong Quảng'], ['49323', 'Phường Phong Thái'], ['49218', 'Xã Đan Điền'], ['49217', 'Xã Quảng Điền']]],
  ['537220', 'Phú Lộc', [['49825', 'Xã Chân Mây – Lăng Cô'], ['49828', 'Xã Hưng Lộc'], ['49706', 'Xã Khe Tre'], ['49814', 'Xã Lộc An'], ['49826', 'Xã Long Quảng'], ['49827', 'Xã Nam Đông'], ['49806', 'Xã Phú Lộc']]],
  ['537015', 'Thuận An', [['49142', 'Phường Dương Nỗ'], ['49927', 'Phường Mỹ Thượng'], ['49141', 'Phường Thuận An']]],
  ['533140', 'Thuận Hóa', [['49129', 'Phường An Cựu'], ['49136', 'Phường Hương An'], ['49122', 'Phường Kim Long'], ['49133', 'Phường Phú Xuân'], ['49135', 'Phường Thuận Hóa'], ['49131', 'Phường Thủy Xuân'], ['49107', 'Phường Vỹ Dạ']]]
];

function sqlCot(c) {
  return `${c.db} ${SQL_TYPE[c.kind]}${c.key ? ' NOT NULL' : ''}`;
}

function taoBangDuLieu(cfg) {
  const cols = cfg.cot.filter((c) => c.db !== 'nguon_xuat_luc').map(sqlCot);
  return `
    CREATE TABLE IF NOT EXISTS ${cfg.bang} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${cols.join(',\n      ')},
      nguon_xuat_luc TEXT NOT NULL,
      nap_lan_id INTEGER REFERENCES ktt_nap_lan(id),
      cap_nhat_luc TEXT NOT NULL,
      UNIQUE (${cfg.khoa.join(', ')})
    );`;
}

const KHOA_TUI_DB = KHOA_TUI.map((c) => c.db).join(', ');

/** Tạo (nếu chưa có) sáu bảng KTT + chỉ mục + dữ liệu cấu hình mặc định. Idempotent; không đụng bảng của module khác. */
function ensureKttSchema(db) {
  db.exec(`
    -- Một dòng mỗi file đã nạp. Chỉ file trang_thai = 'OK' mới chặn nạp lại (cùng loai + sha256); REJECTED ghi lại để tra cứu.
    CREATE TABLE IF NOT EXISTS ktt_nap_lan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loai TEXT NOT NULL CHECK (loai IN ('TUI', 'BUU_GUI')),
      ten_file TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      nap_luc TEXT NOT NULL,
      so_dong_doc INTEGER NOT NULL DEFAULT 0,
      so_dong_them INTEGER NOT NULL DEFAULT 0,
      so_dong_cap_nhat INTEGER NOT NULL DEFAULT 0,
      so_dong_bo_qua INTEGER NOT NULL DEFAULT 0,
      so_dong_loi INTEGER NOT NULL DEFAULT 0,
      trang_thai TEXT NOT NULL CHECK (trang_thai IN ('OK', 'REJECTED')),
      thong_bao TEXT,
      loi_mau TEXT,
      UNIQUE (loai, sha256)
    );
    ${taoBangDuLieu(LOAI_FILE.TUI)}
    -- Không FOREIGN KEY sang ktt_tui: hai file có thể đến lệch nhau (bưu gửi có túi chưa nạp, túi chưa có bưu gửi).
    ${taoBangDuLieu(LOAI_FILE.BUU_GUI)}
    CREATE INDEX IF NOT EXISTS ix_ktt_tui_gio_quet_den ON ktt_tui(gio_quet_tui_den);
    CREATE INDEX IF NOT EXISTS ix_ktt_tui_gio_di ON ktt_tui(bd10_di_gio_di);
    CREATE INDEX IF NOT EXISTS ix_ktt_tui_chieu_luong ON ktt_tui(chieu, luong);
    CREATE INDEX IF NOT EXISTS ix_ktt_tui_dich_nhom ON ktt_tui(dich_nhom);
    CREATE INDEX IF NOT EXISTS ix_ktt_buu_gui_shbg ON ktt_buu_gui(shbg);
    CREATE INDEX IF NOT EXISTS ix_ktt_buu_gui_tui ON ktt_buu_gui(${KHOA_TUI_DB});

    -- Lịch mốc chuyến xuất phát từ KTT theo BCVH. gio_moc 'HH:MM' giờ VN; gio_chot_truoc_phut: hàng quét đến trước mốc ít nhất ngần này phút thì đi chuyến đó.
    CREATE TABLE IF NOT EXISTS ktt_cau_hinh_chuyen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ma_bcvh TEXT NOT NULL,
      ten_chuyen TEXT NOT NULL CHECK (ten_chuyen IN ('SANG', 'TRUA', 'TOI')),
      gio_moc TEXT NOT NULL CHECK (gio_moc GLOB '[0-2][0-9]:[0-5][0-9]'),
      gio_chot_truoc_phut INTEGER NOT NULL DEFAULT 30 CHECK (gio_chot_truoc_phut >= 0),
      ghi_chu TEXT,
      cap_nhat_luc TEXT NOT NULL,
      UNIQUE (ma_bcvh, ten_chuyen)
    );

    -- Ngưỡng dạng khóa - giá trị (gia_tri NUMERIC: số nguyên giữ là số nguyên).
    CREATE TABLE IF NOT EXISTS ktt_cau_hinh (
      khoa TEXT PRIMARY KEY,
      gia_tri NUMERIC NOT NULL,
      mo_ta TEXT,
      cap_nhat_luc TEXT NOT NULL
    );

    -- Lịch chuyến chính thức (KTT-7a): giờ xe rời KTT. dang_dung = 0: tắt chuyến mà không xóa. Lịch V1 (ktt_cau_hinh_chuyen) vẫn do kttQuery dùng đến KTT-7b.
    CREATE TABLE IF NOT EXISTS ktt_lich_chuyen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ma_bcvh TEXT NOT NULL,
      gio_xuat_phat TEXT NOT NULL CHECK (gio_xuat_phat GLOB '[0-2][0-9]:[0-5][0-9]'),
      ngay_chay TEXT NOT NULL CHECK (ngay_chay IN ('CA_TUAN', 'NGHI_CN')),
      nhan TEXT,
      ghi_chu TEXT,
      dang_dung INTEGER NOT NULL DEFAULT 1 CHECK (dang_dung IN (0, 1)),
      cap_nhat_luc TEXT NOT NULL,
      ngay_chay_xac_nhan INTEGER NOT NULL DEFAULT 1 CHECK (ngay_chay_xac_nhan IN (0, 1)),
      UNIQUE (ma_bcvh, gio_xuat_phat)
    );
    CREATE TABLE IF NOT EXISTS ktt_lich_cau_hinh (
      khoa TEXT PRIMARY KEY,
      gia_tri NUMERIC NOT NULL,
      mo_ta TEXT,
      cap_nhat_luc TEXT NOT NULL
    );

    -- Địa bàn phát (KTT-5): phường/xã -> BCVH Huế phát. Dùng để tra đích của bưu gửi chưa vào BD10 đi.
    CREATE TABLE IF NOT EXISTS ktt_dia_ban_phat (
      ma_phuong_xa TEXT NOT NULL UNIQUE,
      ten_phuong_xa TEXT NOT NULL,
      ma_bcvh TEXT NOT NULL,
      ten_bcvh TEXT NOT NULL
    );

    -- KTT-6: một dòng mỗi CẶP file (cùng <yyyymmdd>_<hhmmss>) do đường nạp SFTP xử lý. ket_qua: OK | CHO_CAP (mới có một file) | TU_CHOI (cùng tên khác nội dung, hoặc file sai cấu trúc) | LOI (tải / ghi lỗi, thử lại được).
    -- Không chứa nội dung dòng dữ liệu; thong_bao chỉ có tên file / tên cột / mã. Giờ *_luc của dữ liệu là giờ VN (không đổi múi giờ); thay_dau_luc, nap_luc, cap_nhat_luc là UTC.
    CREATE TABLE IF NOT EXISTS ktt_nap_cap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      khoa_cap TEXT NOT NULL UNIQUE,
      ten_file_tui TEXT, ten_file_buu_gui TEXT, sha_tui TEXT, sha_buu_gui TEXT,
      size_tui INTEGER, mtime_tui INTEGER, size_buu_gui INTEGER, mtime_buu_gui INTEGER,
      nguon_xuat_luc TEXT, gio_min TEXT, gio_max TEXT,
      tui_doc INTEGER NOT NULL DEFAULT 0, tui_them INTEGER NOT NULL DEFAULT 0, tui_cap_nhat INTEGER NOT NULL DEFAULT 0, tui_bo_qua INTEGER NOT NULL DEFAULT 0,
      tui_loi INTEGER NOT NULL DEFAULT 0, tui_trung INTEGER NOT NULL DEFAULT 0, tui_khong_con INTEGER NOT NULL DEFAULT 0,
      bg_doc INTEGER NOT NULL DEFAULT 0, bg_them INTEGER NOT NULL DEFAULT 0, bg_cap_nhat INTEGER NOT NULL DEFAULT 0, bg_bo_qua INTEGER NOT NULL DEFAULT 0,
      bg_loi INTEGER NOT NULL DEFAULT 0, bg_trung INTEGER NOT NULL DEFAULT 0, bg_khong_con INTEGER NOT NULL DEFAULT 0,
      ket_qua TEXT NOT NULL CHECK (ket_qua IN ('OK', 'CHO_CAP', 'TU_CHOI', 'LOI')),
      ma_loi TEXT, thong_bao TEXT, so_lan_thu INTEGER NOT NULL DEFAULT 0,
      thay_dau_luc TEXT NOT NULL, nap_luc TEXT, cap_nhat_luc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_ktt_nap_cap_ket_qua ON ktt_nap_cap(ket_qua, nguon_xuat_luc);
    -- KTT-6: file đã thấy trên thư mục SFTP KTT, để xét «file ổn định» qua nhiều lượt quét (bảng RIÊNG, không dùng sftp_source_files của «Hàng đến»).
    CREATE TABLE IF NOT EXISTS ktt_nguon_file (
      ten_file TEXT PRIMARY KEY,
      kich_thuoc INTEGER NOT NULL, mtime INTEGER NOT NULL,
      lan_dau_thay TEXT NOT NULL, lan_cuoi_thay TEXT NOT NULL, giu_nguyen_tu TEXT NOT NULL,
      so_lan_giu_nguyen INTEGER NOT NULL DEFAULT 0, con_tren_nguon INTEGER NOT NULL DEFAULT 1
    );

    -- KTT-17-1: nhật ký nạp danh sách hàng hoàn (RIÊNG: ktt_nap_lan.loai có CHECK chỉ TUI / BUU_GUI nên không dùng được). Không ghi giá trị SHBG; loi_mau chỉ có số dòng + tên cột + mã lỗi.
    CREATE TABLE IF NOT EXISTS ktt_hang_hoan_nap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ten_file TEXT NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      nap_luc TEXT NOT NULL,
      nguon_xuat_luc TEXT,
      so_dong_doc INTEGER NOT NULL DEFAULT 0,
      so_dong_them INTEGER NOT NULL DEFAULT 0,
      so_dong_cap_nhat INTEGER NOT NULL DEFAULT 0,
      so_dong_bo_qua INTEGER NOT NULL DEFAULT 0,
      so_dong_loi INTEGER NOT NULL DEFAULT 0,
      so_dong_trung INTEGER NOT NULL DEFAULT 0,
      trang_thai TEXT NOT NULL CHECK (trang_thai IN ('OK', 'REJECTED')),
      thong_bao TEXT,
      loi_mau TEXT,
      size_file INTEGER,
      mtime_file INTEGER
    );
    -- KTT-17-1: SHBG hàng hoàn, CỘNG DỒN (đã vào là hàng hoàn; file mới không chứa thì KHÔNG xóa). shbg UNIQUE = chỉ mục tra theo SHBG.
    CREATE TABLE IF NOT EXISTS ktt_hang_hoan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shbg TEXT NOT NULL UNIQUE,
      nguon_xuat_luc TEXT NOT NULL,
      nap_lan_id INTEGER REFERENCES ktt_hang_hoan_nap(id),
      cap_nhat_luc TEXT NOT NULL
    );
  `);

  // KTT-LICH-2: DB tạo trước khi có cột ngay_chay_xac_nhan (1 = lịch ngày chạy đã xác nhận; 0 = chưa xác nhận, bật cờ luu_y_lich ở ô Chủ nhật).
  if (!db.prepare("SELECT 1 FROM pragma_table_info('ktt_lich_chuyen') WHERE name = 'ngay_chay_xac_nhan'").get()) {
    db.exec('ALTER TABLE ktt_lich_chuyen ADD COLUMN ngay_chay_xac_nhan INTEGER NOT NULL DEFAULT 1 CHECK (ngay_chay_xac_nhan IN (0, 1))');
  }

  // Dữ liệu mặc định: INSERT OR IGNORE nên chạy lại không nhân dòng và không ghi đè giá trị PO đã sửa (riêng lịch chuyến: đồng bộ MỘT lần theo lich_phien_ban, xem apDungLichChuan).
  const bayGio = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const themNguong = db.prepare('INSERT OR IGNORE INTO ktt_cau_hinh (khoa, gia_tri, mo_ta, cap_nhat_luc) VALUES (?, ?, ?, ?)');
  const themLichCh = db.prepare('INSERT OR IGNORE INTO ktt_lich_cau_hinh (khoa, gia_tri, mo_ta, cap_nhat_luc) VALUES (?, ?, ?, ?)');
  const themDiaBan = db.prepare('INSERT OR IGNORE INTO ktt_dia_ban_phat (ma_phuong_xa, ten_phuong_xa, ma_bcvh, ten_bcvh) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const [khoa, giaTri, moTa] of LICH_CAU_HINH_MAC_DINH) themLichCh.run(khoa, giaTri, moTa, bayGio);
    for (const [maBcvh, tenBcvh, phuongXa] of DIA_BAN_PHAT_MAC_DINH) for (const [maPx, tenPx] of phuongXa) themDiaBan.run(maPx, tenPx, maBcvh, tenBcvh);
    for (const [khoa, giaTri, moTa] of NGUONG_MAC_DINH) themNguong.run(khoa, giaTri, moTa, bayGio);
    apDungLichChuan(db, bayGio);
  })();
}

/**
 * Đồng bộ ktt_lich_chuyen về lịch chuẩn MỘT lần (khóa lich_phien_ban < LICH_PHIEN_BAN). Gọi TRONG giao dịch của ensureKttSchema. Trả true nếu đã đồng bộ.
 * Dòng trùng (BCVH, giờ): ghi đè ngày chạy / nhãn / ghi chú, bật lại, đặt xác nhận = 1. Dòng ngoài chuẩn: xóa. Dòng thiếu: thêm. DB «lai» (cũ + mới) về đúng 14 dòng.
 */
function apDungLichChuan(db, bayGio) {
  const r = db.prepare('SELECT gia_tri FROM ktt_lich_cau_hinh WHERE khoa = ?').get(KHOA_LICH_PHIEN_BAN);
  if (r && Number(r.gia_tri) >= LICH_PHIEN_BAN) return false;
  const chuan = new Set(LICH_CHUYEN_MAC_DINH.map(([ma, gio]) => `${ma}|${gio}`));
  const xoa = db.prepare('DELETE FROM ktt_lich_chuyen WHERE id = ?');
  for (const d of db.prepare('SELECT id, ma_bcvh, gio_xuat_phat FROM ktt_lich_chuyen').all()) {
    if (!chuan.has(`${d.ma_bcvh}|${d.gio_xuat_phat}`)) xoa.run(d.id);
  }
  const capNhat = db.prepare('UPDATE ktt_lich_chuyen SET ngay_chay = ?, nhan = ?, ghi_chu = ?, dang_dung = 1, ngay_chay_xac_nhan = 1, cap_nhat_luc = ? WHERE ma_bcvh = ? AND gio_xuat_phat = ?');
  const them = db.prepare('INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, nhan, ghi_chu, cap_nhat_luc) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [ma, gio, ngay, nhan, ghiChu] of LICH_CHUYEN_MAC_DINH) {
    if (capNhat.run(ngay, nhan, ghiChu, bayGio, ma, gio).changes === 0) them.run(ma, gio, ngay, nhan, ghiChu, bayGio);
  }
  db.prepare('INSERT INTO ktt_lich_cau_hinh (khoa, gia_tri, mo_ta, cap_nhat_luc) VALUES (?, ?, ?, ?) ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, cap_nhat_luc = excluded.cap_nhat_luc')
    .run(KHOA_LICH_PHIEN_BAN, LICH_PHIEN_BAN, 'Phiên bản lịch chuẩn đã áp dụng cho ktt_lich_chuyen (YYYYMMDD); lịch chuẩn 05/11/2026', bayGio);
  return true;
}

module.exports = { ensureKttSchema, COT_TUI, COT_BUU_GUI, LOAI_FILE, FILE_HANG_HOAN, CHUYEN_MAC_DINH, NGUONG_MAC_DINH, GHI_CHU_CHUYEN_V1, DIA_BAN_PHAT_MAC_DINH, LICH_CHUYEN_MAC_DINH, LICH_CAU_HINH_MAC_DINH, LICH_PHIEN_BAN, KHOA_LICH_PHIEN_BAN };
