# DASH-12b — `ket-qua-phat-thang`: kết quả phát từ đầu tháng (backend)

> Làm theo khảo sát DASH-12a và 4 quyết định PO (17/10/2026). Giao diện là DASH-12c. Phương án B: endpoint mới, không đổi `ket-qua-phat` / `tong-quan-den`.

## Quyết định (04_DECISIONS.md #91)

1. Số ngày cũ theo **trạng thái hiện tại** của SHBG (`phat_status_current`, khoá `(bcvh, shbg)`, không có ngày); không dựng lại từ lịch sử. Nhập muộn / hoàn tác đợt làm đổi số ngày cũ.
2. Số thử (#3, #5–#9) và khai thật 01–09/10 là việc của PO trên dữ liệu; không thêm cờ thử/thật.
3. `bcvh=all` lệch ngày dữ liệu: dùng ngày chung (`tapNgayChung`), khớp thẻ ngày; cùng tập BCVH cho mọi ngày của tháng.
4. Chênh lệch: «ngang» khi `|chênh| < 0,5` điểm; chỉ trả khi ≥ 2 ngày có số liệu và mẫu số hôm nay ≥ 50, ngược lại `null`.

## Route và trường (số giả)

`GET /api/arrivals/dashboard/ket-qua-phat-thang?bcvh=<mã|all>&ngay=YYYY-MM-DD` — cùng `parseParams`, `viewerGuard`, `tiviPhatGuard`, `phatScope` như `ket-qua-phat`. TIVI 403 (không có trong `TIVI_ALLOWED`).

```json
{
  "bcvh": "all", "pham_vi": ["…6 mã…"], "ngay": "2026-10-06", "thang": "2026-10",
  "so_bcvh_trong_tong": 2, "bcvh_ngoai_tong": [{ "ma": "…", "ngay": "2026-10-05" }],
  "luy_ke": {
    "thang": "2026-10", "tu_ngay": "2026-10-01", "den_ngay": "2026-10-06", "mau_so": 225,
    "theo_trang_thai": {
      "PTC": { "nhan": "Phát thành công", "so": 146, "ty_le": 0.6489 },
      "PKTC": { "nhan": "Phát không thành công", "so": 11, "ty_le": 0.0489 },
      "CHUYEN_HOAN": { "nhan": "Chuyển hoàn", "so": 3, "ty_le": 0.0133 },
      "LAC_HUONG": { "nhan": "Lạc hướng", "so": 3, "ty_le": 0.0133 },
      "CHUA_CO_TT": { "nhan": "Chưa có thông tin phát", "so": 62, "ty_le": 0.2756 }
    },
    "so_ngay_co_so_lieu": 4, "so_ngay_co_file": 5, "so_ngay_trong_khoang": 6
  },
  "theo_ngay": [
    { "ngay": "2026-10-01", "mau_so": 20, "ptc": 0.5, "ty_le_pktc": 0, "ty_le_chuyen_hoan": 0, "ty_le_lac_huong": 0, "ty_le_chua_co_tt": 0.5, "co_so_lieu_phat": true },
    { "ngay": "2026-10-03", "mau_so": 0, "ptc": null, "ty_le_pktc": null, "ty_le_chuyen_hoan": null, "ty_le_lac_huong": null, "ty_le_chua_co_tt": null, "co_so_lieu_phat": false }
  ],
  "chenh": {
    "PTC": { "chenh_diem": -4.4, "huong": "giam" }, "PKTC": { "chenh_diem": 1.8, "huong": "tang" },
    "CHUYEN_HOAN": { "chenh_diem": 0, "huong": "ngang" }, "LAC_HUONG": { "chenh_diem": 0.2, "huong": "ngang" },
    "CHUA_CO_TT": { "chenh_diem": 2.8, "huong": "tang" }
  },
  "nguong": { "ptc_dat": 0.82, "chua_co_tt_canh_bao": 0.1, "nguong_ngang_diem": 0.5, "so_ngay_toi_thieu_so_sanh": 2, "san_mau_so_so_sanh": 50 }
}
```

`so_bcvh_trong_tong` / `bcvh_ngoai_tong` chỉ có khi `bcvh=all` không chọn `ngay`. `chenh` là `null` khi chưa đủ điều kiện; BCVH chưa có file nào: `ngay` / `thang` / `luy_ke` là `null`, `theo_ngay` là `[]`. `chenh_diem` là điểm phần trăm (số hiển thị 56,8 − 61,2 = −4,4 dù gốc −4,31).

## File

| File | Nội dung |
|---|---|
| `server/lib/phatDashboard.js` | `ketQuaPhatThang`, `tinhThang`, `chenhHienThi`, `dec1`, cache + `chuKyDuLieu`, `xoaCachePhatThang` |
| `server/lib/phatConfig.js` | `NGUONG_NGANG_DIEM`, `SO_NGAY_TOI_THIEU_SO_SANH`, `SAN_MAU_SO_SO_SANH` |
| `server/routes/arrivals.js` | route mới (cùng guard với `ket-qua-phat`) |
| `tests/phat-thang.test.js` (mới, 16 ca; đã thêm vào `package.json`) | xem dưới |
| `tests/phat-dashboard.test.js` | sửa 1 ca cũ (số khoá của `phatConfig` 4 → 7) + dòng đo `ketQuaPhatThang` trong kịch bản `PHAT_PERF=1` |

## Cách gộp

- Tháng = tháng chứa ngày dữ liệu; mỗi ngày `[01..ngày]` gọi `P.demNgay` (đúng như thẻ ngày) cho từng BCVH trong tập; cộng `tong` theo mã trạng thái rồi `dungTyLe`. Không truy vấn một khoảng ngày (cạm bẫy `buildCountedCte` gom mỗi SHBG một dòng; SHBG đến hai ngày được đếm ở cả hai ngày — có test).
- BCVH chỉ đóng góp ngày D khi có file OK `file_date = D`. Ngày không file: mẫu số 0. Ngày có file nhưng `co_tt = 0` trên cả tập: loại cả tử lẫn mẫu khỏi lũy kế; tỷ lệ của ngày đó là `null` trong `theo_ngay` (mẫu số vẫn là số hàng đến).
- Chênh: `dec1(ty_le)` = làm tròn nửa lên về 0,1 điểm, số nguyên đơn vị 0,1 (từ `ty_le` 4 chữ số — đúng giá trị giao diện hiển thị); `chenh_diem = (dec1 hôm nay − dec1 lũy kế) / 10`.

## Cache (hai tầng)

Trong bộ nhớ tiến trình (`phatDashboard.js`).
- **Tầng 1 — toàn kết quả**: khoá `(bcvh, ngay)`; hạn 60 giây; chữ ký toàn cục `chuKyDuLieu` = `phat_batches` (COUNT, MAX(id), MAX(nhap_luc), MAX(hoan_tac_luc)) + `arrival_import_files` (COUNT, MAX(id), MAX(imported_at)) + `arrival_items` MAX(id). Chữ ký đổi → dựng lại ngay.
- **Tầng 2 — từng (BCVH, ngày)** (DASH-12b-2, PO chọn): lưu `tong` + `co_tt` của `demNgay`. Chữ ký riêng `chuKyTheoNgay`:
  1. dữ liệu đến: các file của **mọi** BCVH có `file_date ∈ [ngày − 1, ngày + 3]` (số file, id lớn nhất, `imported_at` lớn nhất) — vì quy tắc gán DASH-7f xét tranh chấp giữa các BCVH và kiểm tra hợp lý `arrival_date ∈ [file − 3, file + 1]`;
  2. trạng thái phát của **chính BCVH đó**: `phat_batches` của BCVH (COUNT, MAX(id), MAX(nhap_luc), MAX(hoan_tac_luc)) — `phat_status_current` chỉ đổi qua đợt nhập / hoàn tác (`phat.js`).
  Hệ quả: đợt nhập của một BCVH chỉ tính lại ngày của BCVH đó; đợt nhập BCVH ngoài tập không tính lại ngày nào; file mới chỉ tính lại các ngày trong cửa sổ của file.
- Chốt an toàn: mục tầng 2 quá 10 phút thì tính lại. Tối đa 64 khoá tầng 1, 4000 khoá tầng 2 (đầy thì xoá hết). `{ cache: false }` bỏ cả hai tầng. Test dùng `xoaCachePhatThang()`, `soLanDemNgay()`.

## Ca test (`tests/phat-thang.test.js`, dữ liệu giả, DB tạm, cổng 5941)

Hằng số + `nguong`; lũy kế = tổng tử ÷ tổng mẫu (khác trung bình ngày); ngày thiếu file / ngày chưa nhập → `null`; SHBG đến hai ngày; chênh theo giá trị hiển thị (56,8 − 61,2 = −4,4); ngưỡng «ngang» 0,4 / 0,5 / 0,6; mẫu số 49 / 50 và < 2 ngày → `null`; ngày 01 một ngày; ngày dữ liệu cuối tháng trước; mẫu số 0 (không NaN) và BCVH chưa có file; `all` dùng ngày chung (BCVH lệch ngày ngoài tập) và `all` có `ngay`; một BCVH; 400 / 401 / STAFF 403 / ADMIN-TTVH-GDVH 200 / TIVI 403; `ket-qua-phat` không đổi; nhập muộn đổi số ngày cũ + cache vô hiệu (đợt nhập, hoàn tác, hết 60 giây); cache theo (BCVH, ngày): đợt nhập BCVH ngoài tập → 0 ngày tính lại, đợt nhập của M2 → chỉ 2 ngày của M2, file mới → chỉ các ngày trong cửa sổ, kết quả luôn bằng bản không cache.

## Hiệu năng (`PHAT_PERF=1`, dữ liệu giả 6 BCVH × 31 ngày × 4.000 SHBG/ngày = 744.000 dòng)

Máy dev Windows hiện tại (chậm hơn số đo cũ trong `08_PHAT.md`: `ketQuaPhat` 6 BCVH đo ~370 ms so với ~75 ms ghi trước đó). Tháng 09/2026, ngày dữ liệu 30/09 (30 ngày × 6 BCVH):

| Tình huống | Số ngày-BCVH tính lại | Thời gian |
|---|---|---|
| `demNgay` 1 BCVH 1 ngày (mốc) | 1 | ~26 ms |
| Lần đầu (cache trống) / không cache (trung vị) | 180 | ~6.700 ms / ~7.000 ms |
| Trúng cache toàn kết quả (cùng khoá, dữ liệu không đổi) | 0 | 0 ms |
| **Sau 1 đợt nhập phát của 1 BCVH** (DASH-12b-2) | 30 | **~1.100 ms** (trước 12b-2: ~6.400 ms) |
| **Sau 1 file hàng đến mới ở ngày dữ liệu** (DASH-12b-2) | 24 (4 ngày × 6 BCVH) | **~900 ms** |
| Sau đợt nhập của BCVH ngoài tập | 0 | ~0 (chỉ ghép lại) |

Chỉ lần tính lần đầu sau khi khởi động máy chủ còn ~6,7 giây ở cỡ dữ liệu này (cache trong bộ nhớ, mất khi khởi động lại). Vẫn chặn tiến trình (`better-sqlite3` đồng bộ): ~1 giây mỗi lần có đợt nhập. Muốn xoá nốt lần đầu: khởi động nóng (gọi một lần sau khi máy chủ lên) hoặc tính nền — chưa làm.


## Chưa làm / còn lại

- Lần tính đầu sau khi khởi động (~6,7 giây ở cỡ giả): khởi động nóng hoặc tính nền (chưa làm); bảng chụp theo ngày đổi ngữ nghĩa «số hiện tại» — cần quyết định riêng.
- Giao diện (DASH-12c). Lọc khung giờ (DASH-10d).
- Khi thay thế ngày / khôi phục dữ liệu dùng lại `id` cũ, chữ ký có thể không đổi: số mới hiện sau tối đa 60 giây (chưa kiểm).
