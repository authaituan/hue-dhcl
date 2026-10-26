// ==========================================
// THAMSO-1 (docs/ai/34_THAMSO1_BACKEND_BANG_THAM_SO.md, 04_DECISIONS.md #94): DANH BẠ tham số điều hành — nguồn DUY NHẤT cho tên, kiểu, min/max,
// chú giải, ví dụ và «nhìn thấy ở đâu». Giao diện (THAMSO-3) hiển thị đúng nội dung này, KHÔNG tự viết lại.
// `mac_dinh` đọc từ server/config/tham-so-mac-dinh.js (không chép số thứ hai); khóa `chi_doc` (nhóm 2: quy tắc định nghĩa) không sửa được qua API.
// Nội dung tiếng Việt cho nhân viên bưu điện: không thuật ngữ lập trình.
// ==========================================
'use strict';
const MD = require('./tham-so-mac-dinh');
const PHAT = require('./phat');
const IMP = require('../lib/arrivalsImport');

const NHOM = Object.freeze([
  Object.freeze({ ma: 'ket_qua_phat', nhan: 'Kết quả phát' }),
  Object.freeze({ ma: 'dieu_hanh_den', nhan: 'Điều hành hàng đến' }),
  Object.freeze({ ma: 'nap_nguon', nhan: 'Nạp dữ liệu nguồn' }),
  Object.freeze({ ma: 'thay_the_ngay', nhan: 'Thay thế ngày' }),
  Object.freeze({ ma: 'nap_ktt', nhan: 'Nạp dữ liệu Hàng tại KTT' }),
  Object.freeze({ ma: 'quy_tac', nhan: 'Quy tắc định nghĩa (chỉ đọc)' })
]);

const NHIN_DH = ['Điều hành hôm nay (web)', 'Tivi'];
const KHONG_LUU = 'Không lưu số nào theo ngưỡng: đổi là có hiệu lực ngay, kể cả khi xem lại các ngày đã qua.';
const AH_NAP_NGUON = 'Đổi giá trị này có thể làm một ô / ngày không còn (hoặc bắt đầu) thuộc diện «cần xử lý». Mục đã đánh dấu «Đã xem xét» mà không còn cần xử lý sẽ biến khỏi cả hai danh sách; bản ghi vẫn được giữ, đặt lại giá trị cũ thì dấu «Đã xem xét» cũ còn hiệu lực.';

const m = (o) => Object.freeze({ chi_doc: false, min: null, max: null, don_vi: '', rang_buoc: Object.freeze([]), ...o, nhin_thay_o: Object.freeze([...o.nhin_thay_o]) });
const sua = (khoa, o) => m({ khoa, mac_dinh: MD[khoa], ...o });

const RANG_BUOC = Object.freeze([
  { khoa: ['lech_san_luong_trong_ngay_pct', 'lech_san_luong_xu_ly_ngay_pct'], thong_bao: 'Mức lệch «Trong ngày» phải nhỏ hơn mức lệch «Xử lý ngay»', ok: (g) => g('lech_san_luong_trong_ngay_pct') < g('lech_san_luong_xu_ly_ngay_pct') },
  { khoa: ['bd10_chua_xnd_trong_ngay_pct', 'bd10_chua_xnd_xu_ly_ngay_pct'], thong_bao: 'Mức «Trong ngày» của BD10 chưa XNĐ phải nhỏ hơn mức «Xử lý ngay»', ok: (g) => g('bd10_chua_xnd_trong_ngay_pct') < g('bd10_chua_xnd_xu_ly_ngay_pct') },
  { khoa: ['nguong_it', 'nguong_nhieu'], thong_bao: 'Phải có 0 < ngưỡng ít < 1 < ngưỡng nhiều ≤ 10', ok: (g) => g('nguong_it') > 0 && g('nguong_it') < 1 && g('nguong_nhieu') > 1 && g('nguong_nhieu') <= 10 },
  { khoa: ['gio_mong_doi_sang', 'gio_mong_doi_chieu', 'ranh_gioi_dot'], thong_bao: 'Phải có giờ mong đợi đợt sáng < ranh giới đợt (12:00) ≤ giờ mong đợi đợt chiều', ok: (g) => g('gio_mong_doi_sang') < g('ranh_gioi_dot') && g('ranh_gioi_dot') <= g('gio_mong_doi_chieu') },
  { khoa: ['ktt_khung_gio_tu', 'ktt_khung_gio_den'], thong_bao: 'Giờ bắt đầu khung theo dõi dữ liệu KTT phải nhỏ hơn giờ kết thúc', ok: (g) => g('ktt_khung_gio_tu') < g('ktt_khung_gio_den') },
  { khoa: ['so_tuan_mau', 'toi_thieu_ngay_mau'], thong_bao: 'Số ngày mẫu tối thiểu không được lớn hơn số tuần mẫu', ok: (g) => g('toi_thieu_ngay_mau') <= g('so_tuan_mau') }
].map(Object.freeze));
const rbCua = (khoa) => RANG_BUOC.filter((r) => r.khoa.includes(khoa)).map((r) => r.thong_bao);

const SUA_DUOC = [
  // ---------------- Kết quả phát ----------------
  sua('ptc_dat', {
    nhom: 'ket_qua_phat', nhan: 'Mục tiêu tỷ lệ phát thành công (PTC)', kieu: 'phan_so', min: 0.5, max: 0.99, don_vi: 'tỷ lệ (0,82 = 82%)',
    mo_ta: 'Mức tỷ lệ phát thành công (PTC) được coi là đạt mục tiêu. Từ mức này trở lên thẻ tô xanh, dưới mức này tô vàng; cũng là vạch mục tiêu trên đường diễn biến.',
    anh_huong: 'Chỉ đổi màu và chữ «đạt / chưa đạt», không đổi con số PTC. Có hiệu lực ngay ở mọi màn nêu dưới đây.',
    vi_du: 'Đặt 82%: BCVH có PTC 81% bị tô vàng «chưa đạt». Đặt 80%: cùng BCVH đó tô xanh «đạt».',
    nhin_thay_o: [...NHIN_DH.map((s) => `${s}: thẻ PTC, xếp hạng BCVH`), 'Xử lý và tỷ lệ phát (màn 13): màu thẻ PTC']
  }),
  sua('chua_co_tt_canh_bao', {
    nhom: 'ket_qua_phat', nhan: 'Mức cảnh báo «Chưa có thông tin phát»', kieu: 'phan_so', min: 0.01, max: 0.5, don_vi: 'tỷ lệ (0,10 = 10%)',
    mo_ta: 'Khi tỷ lệ «Chưa có thông tin phát» từ mức này trở lên thì thẻ tô đỏ để nhắc đơn vị nhập kết quả phát. Mức này CHỈ ảnh hưởng màu cảnh báo; việc ngày nào được tính vào lũy kế do quy tắc «ngưỡng đủ số liệu» (chỉ đọc) quyết định.',
    anh_huong: 'Chỉ đổi màu cảnh báo, không đổi con số nào. Có hiệu lực ngay ở mọi màn nêu dưới đây.',
    vi_du: 'Đặt 10%: BCVH còn 12% chưa có thông tin phát → thẻ đỏ. Đặt 15%: cùng BCVH đó không bị tô đỏ.',
    nhin_thay_o: [...NHIN_DH.map((s) => `${s}: thẻ «Chưa có TT»`), 'Xử lý và tỷ lệ phát (màn 13): màu thẻ «Chưa có TT»']
  }),
  sua('san_xep_hang_bcvh', {
    nhom: 'ket_qua_phat', nhan: 'Số bưu gửi tối thiểu để được xếp hạng BCVH', kieu: 'so_nguyen', min: 1, max: 1000, don_vi: 'bưu gửi',
    mo_ta: 'BCVH phải có ít nhất chừng này bưu gửi đến trong ngày mới được xếp hạng theo PTC. Ít hơn thì hiện «Chưa đủ dữ liệu», không bị xếp cuối bảng.',
    anh_huong: `Đổi danh sách BCVH có hạng; không đổi tỷ lệ PTC của BCVH nào. ${KHONG_LUU}`,
    vi_du: 'Đặt 50: BCVH có 40 bưu gửi đến không có hạng. Đặt 30: BCVH đó được xếp hạng.',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: bảng xếp hạng BCVH, dòng «Dưới … bưu gửi»`)
  }),
  sua('nguong_ngang_diem', {
    nhom: 'ket_qua_phat', nhan: 'Chênh lệch nhỏ coi là «ngang»', kieu: 'thap_phan', min: 0.1, max: 5, don_vi: 'điểm phần trăm',
    mo_ta: 'So tỷ lệ hôm nay với lũy kế từ đầu tháng: chênh nhỏ hơn mức này thì gọi là «ngang», không gọi là tăng hay giảm.',
    anh_huong: 'Chỉ đổi cách gọi tên (ngang / tăng / giảm), không đổi con số.',
    vi_du: 'Đặt 0,5 điểm: hôm nay hơn lũy kế 0,4 điểm → «ngang»; hơn 0,6 điểm → «tăng». Đặt 1 điểm: cả 0,6 điểm cũng chỉ là «ngang».',
    nhin_thay_o: NHIN_DH.slice(0, 1).map((s) => `${s}: chip chênh «so với tháng» ở các thẻ kết quả phát`)
  }),
  sua('so_ngay_toi_thieu_so_sanh', {
    nhom: 'ket_qua_phat', nhan: 'Số ngày tối thiểu để so với lũy kế tháng', kieu: 'so_nguyen', min: 1, max: 31, don_vi: 'ngày',
    mo_ta: 'Lũy kế từ đầu tháng phải có ít nhất chừng này ngày đủ số liệu thì mới hiện chênh «so với tháng». Ít hơn thì không so (tránh so với chính một ngày).',
    anh_huong: 'Chỉ quyết định có hiện chênh hay không, không đổi con số.',
    vi_du: 'Đặt 2: đầu tháng mới có 1 ngày đủ số liệu → chưa hiện chênh; có 2 ngày → hiện. Đặt 3: phải đủ 3 ngày mới hiện.',
    nhin_thay_o: [`${NHIN_DH[0]}: chip chênh «so với tháng»`]
  }),
  sua('san_mau_so_so_sanh', {
    nhom: 'ket_qua_phat', nhan: 'Số bưu gửi hôm nay tối thiểu để so với tháng', kieu: 'so_nguyen', min: 1, max: 1000, don_vi: 'bưu gửi',
    mo_ta: 'Hôm nay phải có ít nhất chừng này bưu gửi đến thì mới hiện chênh «so với tháng»; số nhỏ thì tỷ lệ dao động mạnh, so sánh không có nghĩa.',
    anh_huong: 'Chỉ quyết định có hiện chênh hay không, không đổi con số.',
    vi_du: 'Đặt 50: hôm nay chỉ có 49 bưu gửi đến → không hiện chênh; đủ 50 → hiện. Đặt 30: 49 bưu gửi vẫn hiện.',
    nhin_thay_o: [`${NHIN_DH[0]}: chip chênh «so với tháng»`]
  }),

  // ---------------- Điều hành hàng đến ----------------
  sua('lech_san_luong_trong_ngay_pct', {
    nhom: 'dieu_hanh_den', nhan: 'Sản lượng lệch → mức «Trong ngày»', kieu: 'phan_tram_nguyen', min: 1, max: 100, don_vi: '%',
    mo_ta: 'Sản lượng đến hôm nay (tính đến cùng giờ) lệch so với cùng thứ tuần trước từ mức % này trở lên (tăng hay giảm đều tính) thì được xếp mức «Trong ngày».',
    anh_huong: KHONG_LUU, rang_buoc: rbCua('lech_san_luong_trong_ngay_pct'),
    vi_du: 'Đặt 15%: tuần trước cùng giờ 200 bưu gửi, hôm nay 165 (lệch 17,5%) → «Trong ngày». Đặt 20%: cùng trường hợp → «Bình thường».',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: đánh giá sản lượng đến, việc cần làm`)
  }),
  sua('lech_san_luong_xu_ly_ngay_pct', {
    nhom: 'dieu_hanh_den', nhan: 'Sản lượng lệch → mức «Xử lý ngay»', kieu: 'phan_tram_nguyen', min: 1, max: 100, don_vi: '%',
    mo_ta: 'Sản lượng đến hôm nay (tính đến cùng giờ) lệch so với cùng thứ tuần trước từ mức % này trở lên thì được xếp mức «Xử lý ngay».',
    anh_huong: KHONG_LUU, rang_buoc: rbCua('lech_san_luong_xu_ly_ngay_pct'),
    vi_du: 'Đặt 25%: tuần trước cùng giờ 200 bưu gửi, hôm nay 140 (lệch 30%) → «Xử lý ngay». Đặt 35%: cùng trường hợp → «Trong ngày».',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: đánh giá sản lượng đến, việc cần làm`)
  }),
  sua('san_so_sanh_toi_thieu', {
    nhom: 'dieu_hanh_den', nhan: 'Mốc so sánh tối thiểu để đánh giá sản lượng', kieu: 'so_nguyen', min: 1, max: 1000, don_vi: 'bưu gửi',
    mo_ta: 'Mốc so sánh (cùng thứ tuần trước, cùng giờ) phải có ít nhất chừng này bưu gửi mới đánh giá được sản lượng lệch. Ít hơn thì ghi «chưa đủ dữ liệu» để khỏi báo nhầm vì số nhỏ.',
    anh_huong: `${KHONG_LUU} Chữ «dưới N BG» trong giao diện (N là số đã đặt, mặc định 50) hiện đúng số này.`,
    vi_du: 'Đặt 50: tuần trước cùng giờ chỉ có 40 bưu gửi → không đánh giá. Đặt 30: vẫn đánh giá bình thường.',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: thẻ sản lượng đến, hàng đi ngoài (chênh so tuần trước)`)
  }),
  sua('san_so_sanh_phuong_xa', {
    nhom: 'dieu_hanh_den', nhan: 'Mốc so sánh tối thiểu của phường/xã', kieu: 'so_nguyen', min: 1, max: 1000, don_vi: 'bưu gửi',
    mo_ta: 'Với từng phường/xã, chỉ tính % tăng / giảm khi mốc so sánh (hôm qua, tuần trước) có ít nhất chừng này bưu gửi. Ít hơn thì chỉ hiện số bưu gửi chênh.',
    anh_huong: KHONG_LUU,
    vi_du: 'Đặt 10: hôm qua phường có 8 bưu gửi, hôm nay 12 → chỉ hiện «+4 BG», không hiện %. Đặt 5: hiện «+4 BG (+50%)».',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: bảng phường/xã tăng`)
  }),
  sua('gio_bat_dau_danh_gia', {
    nhom: 'dieu_hanh_den', nhan: 'Giờ dữ liệu bắt đầu đánh giá sản lượng', kieu: 'gio_nguyen', min: 0, max: 23, don_vi: 'giờ',
    mo_ta: 'Chỉ đánh giá mức sản lượng khi giờ của dữ liệu (không phải đồng hồ máy) đã tới giờ này. Sớm hơn thì ghi «chưa tới giờ đánh giá» vì buổi sáng số liệu còn ít.',
    anh_huong: `${KHONG_LUU} Chữ «chưa tới HH:00» trong giao diện (HH là giờ đã đặt, mặc định 12) hiện đúng giờ này.`,
    vi_du: 'Đặt 12: dữ liệu mới tới 11:00 → chưa đánh giá; tới 12:00 → bắt đầu đánh giá. Đặt 10: tới 10:00 đã đánh giá.',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: đánh giá sản lượng đến`)
  }),
  sua('gio_muon', {
    nhom: 'dieu_hanh_den', nhan: 'Giờ bắt đầu tính «hàng đến muộn»', kieu: 'gio_nguyen', min: 0, max: 23, don_vi: 'giờ',
    mo_ta: 'Bưu gửi có giờ đến từ giờ này trở đi trong ngày được tính là hàng đến muộn. Tên khóa trong API vẫn là «sau_15h» (tên lịch sử) dù đổi giờ.',
    anh_huong: KHONG_LUU,
    vi_du: 'Đặt 15: bưu gửi đến lúc 15:20 là hàng muộn, 14:50 thì không. Đặt 16: cả hai đều không phải hàng muộn.',
    nhin_thay_o: ['API tổng quan hàng đến (khóa «sau_15h»); giao diện hiện chưa hiển thị số này']
  }),
  sua('gio_chuyen_chieu', {
    nhom: 'dieu_hanh_den', nhan: 'Giờ bắt đầu «chuyến chiều»', kieu: 'gio_nguyen', min: 0, max: 23, don_vi: 'giờ',
    mo_ta: 'Bưu gửi có giờ đến từ giờ này trở đi được tính vào hàng đến chuyến chiều (lượt thứ hai trong ngày).',
    anh_huong: KHONG_LUU,
    vi_du: 'Đặt 10: bưu gửi đến lúc 10:30 tính vào chuyến chiều. Đặt 11: bưu gửi đó chưa tính.',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: thẻ «Hàng đến chuyến chiều»`)
  }),
  sua('bd10_chua_xnd_trong_ngay_pct', {
    nhom: 'dieu_hanh_den', nhan: 'BD10 đến chưa XNĐ → mức «Trong ngày»', kieu: 'phan_tram_nguyen', min: 1, max: 100, don_vi: '%',
    mo_ta: 'Khi tỷ lệ BD10 đến mà chưa xác nhận đến (XNĐ) từ mức % này trở lên thì việc «BD10 đến chưa XNĐ» được xếp mức «Trong ngày».',
    anh_huong: KHONG_LUU, rang_buoc: rbCua('bd10_chua_xnd_trong_ngay_pct'),
    vi_du: 'Đặt 5%: BCVH có 6/100 BD10 chưa XNĐ → «Trong ngày». Đặt 8%: cùng trường hợp → «Bình thường».',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: việc cần làm «BD10 đến chưa XNĐ»`)
  }),
  sua('bd10_chua_xnd_xu_ly_ngay_pct', {
    nhom: 'dieu_hanh_den', nhan: 'BD10 đến chưa XNĐ → mức «Xử lý ngay»', kieu: 'phan_tram_nguyen', min: 1, max: 100, don_vi: '%',
    mo_ta: 'Khi tỷ lệ BD10 đến chưa XNĐ từ mức % này trở lên thì việc được xếp mức «Xử lý ngay».',
    anh_huong: `${KHONG_LUU} Chữ «vượt …%» ở tiêu đề việc cần làm hiện đúng mức đã đặt.`, rang_buoc: rbCua('bd10_chua_xnd_xu_ly_ngay_pct'),
    vi_du: 'Đặt 10%: 12/100 BD10 chưa XNĐ → «Xử lý ngay». Đặt 15%: cùng trường hợp → «Trong ngày».',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: việc cần làm «BD10 đến chưa XNĐ»`)
  }),
  sua('chua_nhan_xu_ly_ngay_tu_ngay', {
    nhom: 'dieu_hanh_den', nhan: 'Số ngày chờ để «Xử lý ngay» (chưa nhận tại BCVH)', kieu: 'so_nguyen', min: 1, max: 30, don_vi: 'ngày',
    mo_ta: 'Bưu gửi đã lập BD10 về BCVH nhưng chưa có xác nhận nhận, đã chờ từ chừng này ngày trở lên thì việc được xếp «Xử lý ngay»; chờ ít hơn chỉ là «Trong ngày». Tên khóa «cho_tu_1_ngay» trong API là tên lịch sử, giữ nguyên dù đổi số ngày.',
    anh_huong: `${KHONG_LUU} Nhãn «từ … ngày» trong giao diện hiện đúng số ngày đã đặt.`,
    vi_du: 'Đặt 1: bưu gửi chờ 1 ngày → «Xử lý ngay». Đặt 2: phải chờ 2 ngày mới «Xử lý ngay», chờ 1 ngày chỉ «Trong ngày».',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: việc cần làm «Chưa có XN nhận tại BCVH»`)
  }),
  sua('phuong_xa_tang_cao_pct', {
    nhom: 'dieu_hanh_den', nhan: 'Phường/xã «tăng cao» (chip đỏ)', kieu: 'phan_tram_nguyen', min: 1, max: 1000, don_vi: '%',
    mo_ta: 'Phường/xã có số bưu gửi tăng so với hôm qua từ mức % này trở lên thì chip hiện màu đỏ («tăng cao»); tăng ít hơn thì chip màu vàng.',
    anh_huong: `Chỉ đổi màu chip (đỏ / vàng), không đổi số bưu gửi hay % tăng. ${KHONG_LUU}`,
    vi_du: 'Đặt 20%: phường tăng 25% → chip đỏ, tăng 15% → chip vàng. Đặt 30%: cả hai đều vàng.',
    nhin_thay_o: NHIN_DH.map((s) => `${s}: chip phường/xã`)
  }),

  // ---------------- Nạp dữ liệu nguồn ----------------
  sua('gio_mong_doi_sang', {
    nhom: 'nap_nguon', nhan: 'Giờ mong đợi file đợt SÁNG', kieu: 'gio_hhmm', min: '00:00', max: '23:59', don_vi: 'HH:MM',
    mo_ta: 'Giờ mong đợi file hàng đến của đợt sáng mỗi ngày. Quá giờ này cộng thêm thời gian ân hạn mà chưa thấy file thì ô của hôm nay chuyển sang «Chờ file».',
    anh_huong: AH_NAP_NGUON, rang_buoc: rbCua('gio_mong_doi_sang'),
    vi_du: 'Đặt 09:30 (ân hạn 60 phút): lúc 10:35 chưa có file → «Chờ file». Đặt 10:30: lúc 10:35 vẫn «Chưa đến giờ».',
    nhin_thay_o: ['Nạp dữ liệu nguồn: lưới ô BCVH × ngày × đợt, danh sách cần xử lý, dòng «Giờ mong đợi»']
  }),
  sua('gio_mong_doi_chieu', {
    nhom: 'nap_nguon', nhan: 'Giờ mong đợi file đợt CHIỀU', kieu: 'gio_hhmm', min: '00:00', max: '23:59', don_vi: 'HH:MM',
    mo_ta: 'Giờ mong đợi file hàng đến của đợt chiều mỗi ngày. Quá giờ này cộng thêm thời gian ân hạn mà chưa thấy file thì ô của hôm nay chuyển sang «Chờ file».',
    anh_huong: AH_NAP_NGUON, rang_buoc: rbCua('gio_mong_doi_chieu'),
    vi_du: 'Đặt 16:30 (ân hạn 60 phút): lúc 17:35 chưa có file → «Chờ file». Đặt 17:30: lúc 17:35 vẫn «Chưa đến giờ».',
    nhin_thay_o: ['Nạp dữ liệu nguồn: lưới ô BCVH × ngày × đợt, danh sách cần xử lý, dòng «Giờ mong đợi»']
  }),
  sua('an_han_phut', {
    nhom: 'nap_nguon', nhan: 'Ân hạn sau giờ mong đợi', kieu: 'so_nguyen', min: 0, max: 240, don_vi: 'phút',
    mo_ta: 'Số phút chờ thêm sau giờ mong đợi trước khi coi ô của hôm nay là «Chờ file».',
    anh_huong: AH_NAP_NGUON,
    vi_du: 'Đặt 60 phút với giờ mong đợi 09:30: đến 10:30 chưa có file mới báo «Chờ file». Đặt 30 phút: báo từ 10:00.',
    nhin_thay_o: ['Nạp dữ liệu nguồn: trạng thái ô hôm nay, dòng «Giờ mong đợi»']
  }),
  sua('nguong_it', {
    nhom: 'nap_nguon', nhan: 'Nghi ngờ file thiếu dòng (ít)', kieu: 'thap_phan', min: 0.05, max: 0.95, don_vi: 'lần trung vị',
    mo_ta: 'Số dòng của một ngày nhỏ hơn mức này nhân với số dòng thường lệ (trung vị các ngày cùng thứ trong tuần của cùng BCVH) thì bị gắn «nghi ngờ ít» — file có thể bị thiếu dữ liệu.',
    anh_huong: AH_NAP_NGUON, rang_buoc: rbCua('nguong_it'),
    vi_du: 'Đặt 0,5: thường lệ 10.000 dòng, ngày đó chỉ có 4.000 → «nghi ngờ ít». Đặt 0,3: 4.000 dòng vẫn bình thường.',
    nhin_thay_o: ['Nạp dữ liệu nguồn: nhãn «Nghi ngờ: ít», danh sách cần xử lý, nút «Thay thế ngày»']
  }),
  sua('nguong_nhieu', {
    nhom: 'nap_nguon', nhan: 'Nghi ngờ file thừa dòng (nhiều)', kieu: 'thap_phan', min: 1.1, max: 10, don_vi: 'lần trung vị',
    mo_ta: 'Số dòng của một ngày lớn hơn mức này nhân với số dòng thường lệ (trung vị các ngày cùng thứ trong tuần của cùng BCVH) thì bị gắn «nghi ngờ nhiều» — file có thể bị lặp hoặc lẫn ngày khác.',
    anh_huong: AH_NAP_NGUON, rang_buoc: rbCua('nguong_nhieu'),
    vi_du: 'Đặt 2,5: thường lệ 10.000 dòng, ngày đó có 26.000 → «nghi ngờ nhiều». Đặt 3: 26.000 dòng vẫn bình thường.',
    nhin_thay_o: ['Nạp dữ liệu nguồn: nhãn «Nghi ngờ: nhiều», danh sách cần xử lý, nút «Thay thế ngày»']
  }),
  sua('so_tuan_mau', {
    nhom: 'nap_nguon', nhan: 'Số tuần lấy làm mẫu', kieu: 'so_nguyen', min: 1, max: 12, don_vi: 'tuần',
    mo_ta: 'Số tuần gần nhất (lấy cùng thứ trong tuần) dùng làm mẫu để tính số dòng thường lệ của BCVH.',
    anh_huong: AH_NAP_NGUON, rang_buoc: rbCua('so_tuan_mau'),
    vi_du: 'Đặt 4: lấy 4 ngày cùng thứ của 4 tuần trước. Đặt 8: lấy 8 tuần — mức thường lệ ổn định hơn nhưng chậm theo thay đổi mới.',
    nhin_thay_o: ['Nạp dữ liệu nguồn: nhãn «Nghi ngờ ít / nhiều»']
  }),
  sua('toi_thieu_ngay_mau', {
    nhom: 'nap_nguon', nhan: 'Số ngày mẫu tối thiểu', kieu: 'so_nguyen', min: 1, max: 12, don_vi: 'ngày',
    mo_ta: 'Phải có ít nhất chừng này ngày mẫu thì mới kết luận «nghi ngờ ít / nhiều»; ít hơn thì ghi «chưa đủ mẫu».',
    anh_huong: AH_NAP_NGUON, rang_buoc: rbCua('toi_thieu_ngay_mau'),
    vi_du: 'Đặt 3: BCVH mới chỉ có 2 ngày mẫu → chưa đánh giá. Đặt 2: bắt đầu đánh giá.',
    nhin_thay_o: ['Nạp dữ liệu nguồn: nhãn «Nghi ngờ ít / nhiều»']
  }),

  // ---------------- Thay thế ngày ----------------
  sua('nguong_mat_shbg_do', {
    nhom: 'thay_the_ngay', nhan: 'Ngưỡng mất bưu gửi báo ĐỎ khi «Thay thế ngày»', kieu: 'phan_so', min: 0.01, max: 0.2, don_vi: 'tỷ lệ (0,05 = 5%)',
    mo_ta: 'Khi thay dữ liệu một ngày, nếu tỷ lệ bưu gửi có ở dữ liệu cũ mà không có ở file mới (mất thật) vượt mức này thì cảnh báo ĐỎ và phải xác nhận thêm. Đây là chốt an toàn của thao tác xóa dữ liệu nên không cho đặt quá 20%.',
    anh_huong: 'Chỉ đổi mức cảnh báo của các lần xem trước / thực hiện sau này. Mức cảnh báo của lần đã thực hiện được lưu trong nhật ký lúc thực hiện.',
    vi_du: 'Đặt 5%: mất 6% bưu gửi → cảnh báo đỏ. Đặt 10%: mất 6% chỉ ở mức «cần xác nhận».',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Thay thế ngày: màn xem trước (vạch ngưỡng đỏ) và hộp xác nhận']
  }),
  // ---------------- Nạp dữ liệu Hàng tại KTT (KTT-6) ----------------
  sua('ktt_chu_ky_quet_phut', {
    nhom: 'nap_ktt', nhan: 'Chu kỳ quét thư mục SFTP của KTT', kieu: 'so_nguyen', min: 2, max: 1440, don_vi: 'phút',
    mo_ta: 'Cứ chừng này phút hệ thống xem thư mục SFTP của KTT một lần, thấy đủ cặp file mới (túi + bưu gửi) thì nạp. Giờ xuất file (09:00, 15:00) lấy từ chính file, không đặt ở đây.',
    anh_huong: 'Có hiệu lực từ lần hẹn giờ kế tiếp. Chu kỳ ngắn hơn thì dữ liệu về sớm hơn nhưng NAS bị gọi nhiều hơn.',
    vi_du: 'Đặt 10 phút: file thả lúc 09:03 được nạp trước 09:15. Đặt 30 phút: có thể đến 09:35.',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Hàng tại KTT (API trạng thái nạp, chỉ ADMIN)']
  }),
  sua('ktt_cho_cap_phut', {
    nhom: 'nap_ktt', nhan: 'Chờ đủ cặp file trước khi cảnh báo', kieu: 'so_nguyen', min: 5, max: 1440, don_vi: 'phút',
    mo_ta: 'Mỗi lần xuất có 2 file. Nếu mới có một file và file kia chưa đến sau chừng này phút thì cảnh báo «thiếu file».',
    anh_huong: 'Chỉ đổi lúc cảnh báo / quét tiếp theo; không đổi dữ liệu đã nạp.',
    vi_du: 'Đặt 60: file túi có từ 09:00 mà file bưu gửi chưa có đến 10:00 → cảnh báo. Đặt 120: đến 11:00 mới cảnh báo.',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Hàng tại KTT (API trạng thái nạp, chỉ ADMIN)']
  }),
  sua('ktt_cu_gio', {
    nhom: 'nap_ktt', nhan: 'Dữ liệu KTT coi là cũ sau', kieu: 'so_nguyen', min: 1, max: 48, don_vi: 'giờ',
    mo_ta: 'Chỉ tính giờ nằm trong khung theo dõi (ban đêm không tính). Cặp nạp thành công gần nhất cách quá chừng này giờ thì cảnh báo «dữ liệu cũ».',
    anh_huong: 'Lịch xuất 09:00 và 15:00 làm dữ liệu cách tối đa khoảng 9 giờ trong khung 07:00–22:00 (tính qua đêm); đặt thấp hơn 10 giờ sẽ có cảnh báo buổi sáng trước khi cặp 09:00 về.',
    vi_du: 'Đặt 10: cặp 15:00 hôm qua, đến 08:30 sáng nay (đã tính 7 giờ trước 22:00 + 1,5 giờ) chưa cảnh báo. Đặt 8: cùng lúc đó đã cảnh báo.',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Hàng tại KTT (API trạng thái nạp, chỉ ADMIN)']
  }),
  sua('ktt_khung_gio_tu', {
    nhom: 'nap_ktt', nhan: 'Khung theo dõi dữ liệu KTT: từ giờ', kieu: 'gio_nguyen', min: 0, max: 23, don_vi: 'giờ',
    mo_ta: 'Cảnh báo «dữ liệu cũ» chỉ tính các giờ từ mốc này đến mốc kết thúc mỗi ngày.',
    anh_huong: 'Chỉ đổi lúc cảnh báo / quét tiếp theo; không đổi dữ liệu đã nạp.', rang_buoc: rbCua('ktt_khung_gio_tu'),
    vi_du: 'Đặt 7 giờ: lúc 06:00 sáng chưa tính. Đặt 5 giờ: tính từ 05:00.',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Hàng tại KTT (API trạng thái nạp, chỉ ADMIN)']
  }),
  sua('ktt_khung_gio_den', {
    nhom: 'nap_ktt', nhan: 'Khung theo dõi dữ liệu KTT: đến giờ', kieu: 'gio_nguyen', min: 1, max: 23, don_vi: 'giờ',
    mo_ta: 'Giờ kết thúc của khung theo dõi mỗi ngày (xem «từ giờ»).',
    anh_huong: 'Chỉ đổi lúc cảnh báo / quét tiếp theo; không đổi dữ liệu đã nạp.', rang_buoc: rbCua('ktt_khung_gio_den'),
    vi_du: 'Đặt 22: sau 22:00 thời gian không còn được tính. Đặt 23: tính đến 23:00.',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Hàng tại KTT (API trạng thái nạp, chỉ ADMIN)']
  }),
  sua('ktt_so_cap_toi_thieu_ngay', {
    nhom: 'nap_ktt', nhan: 'Số cặp file tối thiểu mỗi ngày', kieu: 'so_nguyen', min: 1, max: 10, don_vi: 'cặp',
    mo_ta: 'Một ngày đã qua có ít cặp (túi + bưu gửi) nạp thành công hơn mức này thì cảnh báo. Lịch hiện hành là 2 lần xuất mỗi ngày (09:00, 15:00).',
    anh_huong: 'Chỉ đổi lúc cảnh báo / quét tiếp theo; không đổi dữ liệu đã nạp.',
    vi_du: 'Đặt 2: hôm qua chỉ có cặp 09:00 → cảnh báo «thiếu cặp». Đặt 1: không cảnh báo.',
    nhin_thay_o: ['Nạp dữ liệu nguồn → Hàng tại KTT (API trạng thái nạp, chỉ ADMIN)']
  })
];

const CHI_DOC = [
  m({
    khoa: 'nguong_du_so_lieu', mac_dinh: MD.nguong_du_so_lieu, chi_doc: true, nhom: 'quy_tac', nhan: 'Ngưỡng «đủ số liệu» của một ngày', kieu: 'phan_so', min: 0.01, max: 0.5, don_vi: 'tỷ lệ (0,10 = 10%)',
    mo_ta: 'Một ngày chỉ được tính vào lũy kế tháng khi tỷ lệ «Chưa có thông tin phát» của ngày đó NHỎ HƠN mức này (đúng bằng mức là chưa đủ). Là quy tắc định nghĩa (PO chốt 17/10/2026), không phải ngưỡng màu.',
    anh_huong: 'Đổi sẽ đổi nghĩa MỌI con số lũy kế, chênh và đường diễn biến của quá khứ, nên đợt này không cho sửa.',
    vi_du: 'Quy tắc hiện hành (không sửa được): ngày còn 9,9% chưa có thông tin phát được tính vào lũy kế; ngày còn 10,0% thì không.',
    nhin_thay_o: ['Điều hành hôm nay: lũy kế «từ đầu tháng», chênh «so với tháng», đường diễn biến', 'Tivi: thẻ PTC (ngày đủ / chưa đủ số liệu)']
  }),
  m({
    khoa: 'ranh_gioi_dot', mac_dinh: MD.ranh_gioi_dot, chi_doc: true, nhom: 'quy_tac', nhan: 'Ranh giới đợt SÁNG / CHIỀU', kieu: 'gio_hhmm', min: '00:00', max: '23:59', don_vi: 'HH:MM',
    mo_ta: 'File có giờ trong tên trước mốc này thuộc đợt sáng, từ mốc này trở đi thuộc đợt chiều. Là quy tắc định nghĩa của lưới «Nạp dữ liệu nguồn».',
    anh_huong: 'Đổi sẽ chuyển file giữa hai đợt ở mọi ngày đã qua và làm lệch các dấu «Đã xem xét» khóa theo đợt, nên không cho sửa.',
    vi_du: 'Quy tắc hiện hành (không sửa được): file lúc 11:59:59 thuộc đợt sáng, file lúc 12:00:00 thuộc đợt chiều.',
    nhin_thay_o: ['Nạp dữ liệu nguồn: cách chia ô theo đợt']
  }),
  m({
    khoa: 'khung_gio_den', mac_dinh: PHAT.KHUNG_GIO_DEN, chi_doc: true, nhom: 'quy_tac', nhan: 'Các khung giờ đến BCVH', kieu: 'danh_sach',
    mo_ta: 'Sáu khung giờ dùng để chia bưu gửi đến theo giờ: trước 10h, 10–12h, 12–14h, 14–16h, 16–18h, sau 18h.',
    anh_huong: 'Đổi cách chia khung giờ ở các bảng theo khung giờ; không cho sửa ở đợt này.',
    vi_du: 'Quy tắc hiện hành (không sửa được): bưu gửi đến lúc 11:59 thuộc khung 10–12h, lúc 12:00 thuộc khung 12–14h.',
    nhin_thay_o: ['Xử lý và tỷ lệ phát (màn 13): bảng theo khung giờ đến', 'Tivi: các thẻ chuyển khung giờ']
  }),
  m({
    khoa: 'nhom_cho', mac_dinh: PHAT.NHOM_CHO, chi_doc: true, nhom: 'quy_tac', nhan: 'Các nhóm «chưa có thông tin phát, đã chờ bao lâu»', kieu: 'danh_sach',
    mo_ta: 'Bốn nhóm chờ: dưới 2 giờ, 2–4 giờ, trên 4 giờ và qua ngày, tính từ giờ bưu gửi đến BCVH.',
    anh_huong: 'Đổi cách chia nhóm của số «tồn chờ»; không cho sửa ở đợt này.',
    vi_du: 'Quy tắc hiện hành (không sửa được): bưu gửi đến 8:00, lúc 11:00 vẫn chưa có thông tin phát → nhóm «2–4 giờ»; lúc 13:00 → «Trên 4 giờ».',
    nhin_thay_o: ['Xử lý và tỷ lệ phát (màn 13): bảng tồn chờ']
  }),
  m({
    khoa: 'rang_ngay_nap_truoc', mac_dinh: IMP.RANGE_DAYS_BEFORE, chi_doc: true, nhom: 'quy_tac', nhan: 'Ngày đến cũ nhất được phép so với ngày trong tên file', kieu: 'so_nguyen', don_vi: 'ngày',
    mo_ta: 'Khi nạp file hàng đến, ngày đến của bưu gửi được phép sớm hơn ngày trong tên file tối đa chừng này ngày.',
    anh_huong: 'Quyết định file nào bị TỪ CHỐI khi nạp (chỉ áp cho file nạp sau); không cho sửa ở đợt này.',
    vi_du: 'Quy tắc hiện hành (không sửa được): file ngày 10/10 có bưu gửi đến 07/10 vẫn hợp lệ; đến 06/10 thì tính là ngoài khoảng.',
    nhin_thay_o: ['Nạp file hàng đến (SFTP, dòng lệnh): kiểm tra file trước khi nạp']
  }),
  m({
    khoa: 'rang_ngay_nap_sau', mac_dinh: IMP.RANGE_DAYS_AFTER, chi_doc: true, nhom: 'quy_tac', nhan: 'Ngày đến muộn nhất được phép so với ngày trong tên file', kieu: 'so_nguyen', don_vi: 'ngày',
    mo_ta: 'Khi nạp file hàng đến, ngày đến của bưu gửi được phép muộn hơn ngày trong tên file tối đa chừng này ngày.',
    anh_huong: 'Quyết định file nào bị TỪ CHỐI khi nạp (chỉ áp cho file nạp sau); không cho sửa ở đợt này.',
    vi_du: 'Quy tắc hiện hành (không sửa được): file ngày 10/10 có bưu gửi đến 11/10 vẫn hợp lệ; đến 12/10 thì tính là ngoài khoảng.',
    nhin_thay_o: ['Nạp file hàng đến (SFTP, dòng lệnh): kiểm tra file trước khi nạp']
  }),
  m({
    khoa: 'ty_le_ngoai_khoang_toi_da', mac_dinh: IMP.MAX_OUT_OF_RANGE_RATIO, chi_doc: true, nhom: 'quy_tac', nhan: 'Tỷ lệ dòng ngoài khoảng ngày tối đa của một file', kieu: 'phan_so', min: 0, max: 1, don_vi: 'tỷ lệ (0,01 = 1%)',
    mo_ta: 'Một file hàng đến bị từ chối nếu quá tỷ lệ này số dòng nằm ngoài khoảng ngày cho phép.',
    anh_huong: 'Quyết định file nào bị TỪ CHỐI khi nạp (chỉ áp cho file nạp sau); không cho sửa ở đợt này.',
    vi_du: 'Quy tắc hiện hành (không sửa được): file 1.000 dòng có 10 dòng ngoài khoảng (1%) vẫn nạp được; 11 dòng thì bị từ chối.',
    nhin_thay_o: ['Nạp file hàng đến (SFTP, dòng lệnh): kiểm tra file trước khi nạp']
  })
];

// Gắn rang_buoc (mô tả) cho các khóa chỉ-đọc dính ràng buộc chéo
const DANH_BA = Object.freeze([...SUA_DUOC, ...CHI_DOC].map((x) => (x.rang_buoc.length ? x : Object.freeze({ ...x, rang_buoc: Object.freeze(rbCua(x.khoa)) }))));
const THEO_KHOA = new Map(DANH_BA.map((x) => [x.khoa, x]));

module.exports = Object.freeze({ NHOM, DANH_BA, THEO_KHOA, RANG_BUOC });
