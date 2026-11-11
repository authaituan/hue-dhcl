// ==========================================
// KTT-8: API «Hàng tại KTT» — /api/ktt/*, CHỈ ĐỌC, CHỈ ADMIN, TTVH và TTKT (GDVH 403, TIVI 403 ở authRequired / allowlist, không token 401; TTKT chỉ GET, allowlist server/lib/allowlistVaiTro.js, #123). Mount riêng ở server/index.js
// (KHÔNG dưới /api/arrivals: đường đó mở cả GDVH). Mọi route đi qua `requireRoles(ADMIN, TTVH, TTKT)` ngay đầu router. ADMIN, TTVH và TTKT thấy CÙNG số liệu (không lọc theo BCVH được giao).
//   GET /api/ktt/meta                    độ mới dữ liệu, lịch chuyến (14 dòng), hạn đến trước chuyến, giờ chốt ngày, ngưỡng
//   GET /api/ktt/luu-thoat?tu=&den=[&moc_chi_tieu=xnd|quet_tui_den]   lưu thoát 5 trạng thái, đạt / không đạt, chỉ tiêu 14 giờ hai mốc, hàng hoàn (kttLuuThoatQuery.luuThoatTheoNgay), cache theo (mốc, ngày)
//   GET /api/ktt/luu-thoat/buc-tranh-duong-thu[/chuyen-xe|/danh-gia]?tu=&den=[&moc=A|B&loai_ngay=&bcvh=]   KTT-KD-1 pha 2: «Bức tranh đường thư đến» (lib/kttBucTranh.js, doc 42 mục 20)
//   GET /api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den[/theo-ngay]?tu=&den=[&moc=&loai_ngay=&bcvh=&duong_thu=] và /con-lai-theo-gio[?loai_ngay=&bcvh=]   KTT-KD-3b: màn «Giờ đến trong ngày» (lib/kttGioDen.js, doc 42 mục 22)
//   GET /api/ktt/tong-hop?tu=&den=       kttQuery.tongHopKtt + khối «Đánh giá» (danh_gia)
//   GET /api/ktt/chi-tiet?tu=&den=&loai=[&ma_bcvh=&page=&page_size=]   danh sách SHBG chi tiết (phân trang như /api/arrivals/items)
//   GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=&ma_bcvh=&nguon=]   KTT-8b/8c: file .xlsx (sheet «Thông tin» + «7 Hàng rớt lại»), lib/kttXuat.js
//   GET /api/ktt/xuat/hom-sau-chua-di?tu=&den=&loai=[&duong_thu=&noi_gui=&huong=&hang_hoan=&ma_bcvh=]   KTT-8d: file .xlsx («Thông tin» + «8 Hôm sau-chưa đi»), cùng tham số /danh-sach
//   GET /api/ktt/doi-chieu/do-phu?tu=&den=   KTT-16-1: độ phủ «Hàng đến BCVH» theo (BCVH, ngày), cửa sổ đối chiếu được, cờ «có thể dương tính giả» (lib/kttDoPhuBcvh.js, doc 44)
//   GET /api/ktt/doi-chieu/tong-hop?tu=&den=[&ma_bcvh=]   KTT-16-2: ghép SHBG KTT với «Hàng đến BCVH» (lib/kttDoiChieu.js, doc 44 mục 8)
//   GET /api/ktt/doi-chieu/thoi-gian-nhan | chua-thay ?tu=&den=[&ma_bcvh=]   KTT-16-3: độ trễ BCVH nhận (p50/p90), chuyến mất dấu, nguồn «chưa thấy» (doc 44 mục 9)
//   GET /api/ktt/doi-chieu/danh-gia?tu=&den=[&ma_bcvh=]   KTT-16-4: khối «Đánh giá» sinh từ số thật + số dòng sheet 1–6 (lib/kttDanhGiaDoiChieu.js, doc 44 mục 10)
//   GET /api/ktt/doi-chieu/xuat/{chua-thay,chuyen-mat-dau,chuyen-tiep-chua-quet-di,thay-o-bcvh-khac,chuyen-cham,da-co-tai-dich}?tu=&den=[&ma_bcvh=]   KTT-16-4: file .xlsx sheet 1–6 («Thông tin» + sheet dữ liệu), lib/kttDoiChieuXuat.js
//   KTT-12 (cần tu, den): GET /api/ktt/dicungngay/{tong-hop,theo-ngay,theo-gio}, /rotlai/theo-duong-thu, /lich-xe/{gio-lap-bd10,theo-duong-thu,theo-bcvh}, /danh-sach, /hang-den/{tong-hop,theo-gio,theo-duong-thu,xe}, /tong-quan — docs/ai/43_KTT_DI_CUNG_NGAY_API.md
// Lỗi tham số -> 400 { error (tiếng Việt, nêu tham số sai), ma }; lỗi khác -> 500 thông báo chung (không lộ nội bộ), log chỉ có mã lỗi (không số hiệu bưu gửi).
// Lõi: server/lib/kttApi.js. Tài liệu: docs/ai/42_KTT_API.md.
// ==========================================
const express = require('express');
const db = require('../db');
const { requireRoles } = require('../auth');
const { ROLES } = require('../roles');
const Q = require('../lib/kttQuery');
const Api = require('../lib/kttApi');
const Xuat = require('../lib/kttXuat');

const router = express.Router();

// Mọi route của router này CHỈ cho ADMIN, TTVH, TTKT (route thêm sau này cũng bị chặn mặc định).
router.use(requireRoles(ROLES.ADMIN, ROLES.TTVH, ROLES.TTKT));

const xuLy = (ten, fn) => async (req, res) => {
  try {
    return res.json(await fn(req));
  } catch (err) {
    if (err instanceof Q.LoiKtt) return res.status(400).json({ error: err.message, ma: err.code });
    console.error(`Ktt ${ten} error:`, err && err.code ? err.code : (err && err.name));
    return res.status(500).json({ error: 'Lỗi hệ thống khi đọc dữ liệu Hàng tại KTT', ma: 'LOI_HE_THONG' });
  }
};

router.get('/meta', xuLy('meta', (req) => {
  const khoa = Object.keys(req.query);
  if (khoa.length) throw new Q.LoiKtt('KTT_THAM_SO_LA', `Tham số không hỗ trợ: "${String(khoa[0]).slice(0, 40)}"`);
  return Api.meta(db);
}));
router.get('/luu-thoat', xuLy('luu-thoat', (req) => Api.luuThoat(db, req.query)));
// KTT-KD-1: các bảng «Vì sao không đạt 14 giờ» (nặng hơn /luu-thoat nên tách route; dùng chung cache theo ngày).
router.get('/luu-thoat/khong-dat-14h', xuLy('luu-thoat/khong-dat-14h', (req) => Api.khongDat14h(db, req.query)));
// KTT-KD-1 pha 2 (bản sửa 2): «Bức tranh đường thư đến» — ba bảng, cả hai mốc ở mọi bảng (`moc` mặc định A), dùng chung cache theo ngày với /luu-thoat.
router.get('/luu-thoat/buc-tranh-duong-thu', xuLy('luu-thoat/buc-tranh-duong-thu', (req) => Api.bucTranhCum(db, req.query)));
router.get('/luu-thoat/buc-tranh-duong-thu/chuyen-xe', xuLy('luu-thoat/buc-tranh-duong-thu/chuyen-xe', (req) => Api.bucTranhChuyenXe(db, req.query)));
router.get('/luu-thoat/buc-tranh-duong-thu/danh-gia', xuLy('luu-thoat/buc-tranh-duong-thu/danh-gia', (req) => Api.bucTranhDanhGia(db, req.query)));
// KTT-KD-3b: màn «Giờ đến trong ngày» — chỉ thêm (lõi lib/kttGioDen.js, doc 42 mục 22).
router.get('/luu-thoat/buc-tranh-duong-thu/gio-den', xuLy('luu-thoat/buc-tranh-duong-thu/gio-den', (req) => Api.gioDen(db, req.query)));
router.get('/luu-thoat/buc-tranh-duong-thu/gio-den/theo-ngay', xuLy('luu-thoat/buc-tranh-duong-thu/gio-den/theo-ngay', (req) => Api.gioDenTheoNgay(db, req.query)));
router.get('/luu-thoat/buc-tranh-duong-thu/con-lai-theo-gio', xuLy('luu-thoat/buc-tranh-duong-thu/con-lai-theo-gio', (req) => Api.conLaiTheoGio(db, req.query)));
router.get('/tong-hop', xuLy('tong-hop', (req) => Api.tongHop(db, req.query)));
router.get('/chi-tiet', xuLy('chi-tiet', (req) => Api.chiTiet(db, req.query)));

// KTT-12: đi cùng ngày (B1–B3), hàng rớt lại, lịch xe (B4–B6), danh sách bấm ô, hàng đến (A), tổng quan. Mọi route cần `tu`, `den` (≤ 31 ngày).
router.get('/dicungngay/tong-hop', xuLy('dicungngay/tong-hop', (req) => Api.diCungNgayTongHop(db, req.query)));
router.get('/dicungngay/theo-ngay', xuLy('dicungngay/theo-ngay', (req) => Api.diCungNgayTheoNgay(db, req.query)));
router.get('/dicungngay/theo-gio', xuLy('dicungngay/theo-gio', (req) => Api.diCungNgayTheoGio(db, req.query)));
router.get('/rotlai/theo-duong-thu', xuLy('rotlai/theo-duong-thu', (req) => Api.rotLaiTheoDuongThu(db, req.query)));
router.get('/lich-xe/gio-lap-bd10', xuLy('lich-xe/gio-lap-bd10', (req) => Api.lichXeGioLapBd10(db, req.query)));
router.get('/lich-xe/theo-duong-thu', xuLy('lich-xe/theo-duong-thu', (req) => Api.lichXeTheoDuongThu(db, req.query)));
router.get('/lich-xe/theo-bcvh', xuLy('lich-xe/theo-bcvh', (req) => Api.lichXeTheoBcvh(db, req.query)));
router.get('/danh-sach', xuLy('danh-sach', (req) => Api.danhSachDiNgay(db, req.query)));
router.get('/hang-den/tong-hop', xuLy('hang-den/tong-hop', (req) => Api.hangDenTongHop(db, req.query)));
router.get('/hang-den/theo-gio', xuLy('hang-den/theo-gio', (req) => Api.hangDenTheoGio(db, req.query)));
router.get('/hang-den/theo-duong-thu', xuLy('hang-den/theo-duong-thu', (req) => Api.hangDenTheoDuongThu(db, req.query)));
router.get('/hang-den/xe', xuLy('hang-den/xe', (req) => Api.hangDenXe(db, req.query)));
router.get('/tong-quan', xuLy('tong-quan', (req) => Api.tongQuan(db, req.query)));

// KTT-16-1: độ phủ dữ liệu «Hàng đến BCVH» cho đối chiếu — chỉ đọc arrival_*, không chạm bảng ktt_* (docs/ai/44_KTT_DO_PHU_BCVH.md).
router.get('/doi-chieu/do-phu', xuLy('doi-chieu/do-phu', (req) => Api.doPhuBcvh(db, req.query)));
// KTT-16-2: ghép KTT ↔ BCVH, tổng hợp đối chiếu (hai thanh xếp chồng), cache theo ngày + làm nóng (docs/ai/44 mục 8).
router.get('/doi-chieu/tong-hop', xuLy('doi-chieu/tong-hop', (req) => Api.doiChieuTongHop(db, req.query)));
// KTT-16-3: thời gian BCVH nhận (a), chuyến mất dấu (b) + nguồn «chưa thấy» (c); dùng chung bó ngày với tong-hop (docs/ai/44 mục 9).
router.get('/doi-chieu/thoi-gian-nhan', xuLy('doi-chieu/thoi-gian-nhan', (req) => Api.doiChieuThoiGianNhan(db, req.query)));
router.get('/doi-chieu/chua-thay', xuLy('doi-chieu/chua-thay', (req) => Api.doiChieuChuaThay(db, req.query)));
// KTT-16-4: «Đánh giá» (xuất xlsx đăng ký ở cuối file, sau xuatFile).
router.get('/doi-chieu/danh-gia', xuLy('doi-chieu/danh-gia', (req) => Api.doiChieuDanhGia(db, req.query)));

// KTT-8b / KTT-8d: xuất xlsx (sheet «Thông tin» + một sheet dữ liệu). Mọi kiểm tra và tính toán xong TRƯỚC khi gửi header (lỗi vẫn là JSON 400/500); sau đó ghi luồng.
// chuanBi(req) -> nội dung file (kttApi); boLoc(kq) -> các trường bộ lọc ghi nhật ký (không số hiệu bưu gửi).
const xuatFile = (kind, chuanBi, boLoc) => async (req, res) => {
  let kq;
  try {
    kq = await chuanBi(req);
  } catch (err) {
    if (err instanceof Q.LoiKtt) return res.status(err.code === 'KTT_XUAT_BAN' ? 429 : 400).json({ error: err.message, ma: err.code }); // KTT-16-4: đang có xuất sheet 1–4 khác
    console.error(`Ktt xuat ${kind} error:`, err && err.code ? err.code : (err && err.name));
    return res.status(500).json({ error: 'Lỗi hệ thống khi xuất dữ liệu Hàng tại KTT', ma: 'LOI_HE_THONG' });
  }
  // Nhật ký: ai, khoảng ngày, bộ lọc, số dòng. KHÔNG ghi số hiệu bưu gửi.
  const ghiNhatKy = (rows, status) => req.app.locals.security.log({
    event: 'ktt_export', kind, ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role,
    from: kq.khoang.tuNgay, to: kq.khoang.denNgay, ...boLoc(kq), rows, status
  });
  let khachDi = false;
  res.on('close', () => { if (!res.writableFinished) khachDi = true; });
  res.status(200);
  res.setHeader('Content-Type', Xuat.XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${kq.tenFile}"`);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await Xuat.ghiXlsx(res, kq, () => khachDi);
    ghiNhatKy(r.rows, r.aborted ? 'aborted' : 'ok');
  } catch (err) {
    console.error(`Ktt xuat ${kind} error:`, err && err.code ? err.code : (err && err.name));
    ghiNhatKy(null, 'error');
    res.destroy(); // đã gửi header: cắt kết nối để file dở không bị coi là hợp lệ
  }
};
const nguoiXuat = (req) => ({ nguoiXuat: req.user.hrm_code || null });
router.get('/xuat/luu-thoat', xuatFile('luu-thoat', (req) => Api.xuatLuuThoat(db, req.query, nguoiXuat(req)),
  (kq) => ({ trang_thai: kq.nhom, ma_bcvh: kq.maBcvh, nguon: kq.nguon })));
// KTT-KD-1: sheet 10 «Không đạt 14 giờ» — cùng bộ lọc với /chi-tiet?loai=khong_dat_14h.
router.get('/xuat/khong-dat-14h', xuatFile('khong-dat-14h', (req) => Api.xuatKhongDat14h(db, req.query, nguoiXuat(req)),
  (kq) => ({ moc_chi_tieu: kq.kd.moc, nhom_nguyen_nhan: kq.kd.nhom, ma_bcvh: kq.maBcvh, nguon: kq.nguon, gio_den: kq.kd.gio, chuyen: kq.kd.chuyen, thu: kq.kd.thu, nguon_hang: kq.kd.nguonHang })));
// KTT-8d: sheet 8 «Hôm sau / chưa đi trên 24 giờ» — cùng tham số với /danh-sach (trừ page, page_size).
router.get('/xuat/hom-sau-chua-di', xuatFile('hom-sau-chua-di', (req) => Api.xuatHomSauChuaDi(db, req.query, nguoiXuat(req)),
  (kq) => ({ loai: kq.loai, duong_thu: kq.loc.duongThu, noi_gui: kq.loc.noiGui, huong: kq.loc.huong, hang_hoan: kq.loc.hangHoan, ma_bcvh: kq.loc.maBcvh })));

// KTT-16-4: xuất xlsx sheet 1–6 của trang Đối chiếu — mỗi sheet một route, cùng tham số tu, den, ma_bcvh như tong-hop.
for (const [sheet, ten] of Object.entries(Api.TEN_SHEET_XUAT_DC)) {
  router.get(`/doi-chieu/xuat/${ten}`, xuatFile(`doi-chieu-${ten}`, (req) => Api.xuatDoiChieu(db, req.query, Number(sheet), nguoiXuat(req)),
    (kq) => ({ sheet: kq.sheet, ma_bcvh: kq.maBcvh })));
}

module.exports = router;
