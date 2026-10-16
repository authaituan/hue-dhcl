# DASH-10b — Tivi (phạm vi toàn Trung tâm) đọc `ket-qua-phat` (backend)

> Nối tiếp khảo sát DASH-10a. PO chốt 16/10/2026 22:26: Tivi chỉ dùng cho TTVH (phạm vi `all`), không còn tài khoản Tivi gán một BCVH; nút khung giờ làm sau (DASH-10d). Giao diện Tivi làm ở ticket sau (DASH-10c).

## Quyết định (04_DECISIONS.md #90)

- `GET /api/arrivals/dashboard/ket-qua-phat` được thêm vào `TIVI_ALLOWED` (`server/lib/tivi.js`). Đây là endpoint duy nhất thêm; `/api/phat/*` (kể cả `/api/phat/ty-le`) vẫn 403 với Tivi.
- Route ép phạm vi bằng `tiviPhatGuard` (`server/routes/arrivals.js`, đặt trước `phatScope`): với tài khoản Tivi, chỉ cho qua khi phạm vi tài khoản là `all` VÀ `bcvh` vắng / rỗng / `all`. Còn lại 403: phạm vi một BCVH (dù `bcvh=all` hay mã của nó), chưa gán phạm vi (cùng thông báo như 3 endpoint «đến», nay dùng chung hằng `TIVI_CHUA_GAN_PHAM_VI`), `bcvh=<mã>` hoặc tham số `bcvh` lặp.
- Khác 3 endpoint «đến» (ép ngầm `bcvh` theo phạm vi): ở đây xin sai thì 403, không ép ngầm — vì phạm vi một BCVH không còn được hỗ trợ cho kết quả phát (xếp hạng cần so 6 BCVH).
- Vai trò khác không đổi: ADMIN/TTVH/GDVH 200, STAFF 403. Cấu trúc trả về và cách tính của `ket-qua-phat` không đổi.

## File đổi

| File | Nội dung |
|---|---|
| `server/lib/tivi.js` | +1 mục allowlist, cập nhật chú thích đầu file |
| `server/routes/arrivals.js` | `tiviPhatGuard`, hằng `TIVI_CHUA_GAN_PHAM_VI`, chú thích route |
| `tests/tivi.test.js` | +5 ca DASH-10b (đặt trước các ca «thu hồi» vì các ca đó đổi mật khẩu/vai trò của tài khoản mẫu) |

## Ca test (dữ liệu giả, DB tạm)

1. Tivi `all`, `bcvh` vắng / rỗng / `all` → 200, có `ptc`, `nguong`, `co_so_lieu_phat`, `xep_hang_bcvh`, `chua_du_du_lieu`.
2. Tivi `all`, `bcvh=<mã>` hoặc `bcvh` lặp → 403.
3. Tivi một BCVH: `bcvh` vắng / `all` / mã của nó / mã khác → 403; Tivi chưa gán phạm vi → 403 «chưa được gán phạm vi».
4. Tivi 403 ở `/api/phat/ty-le`, `batches`, `drafts`, `template`, `POST drafts`; `TIVI_ALLOWED` đúng 5 mục, không chứa `/api/phat`.
5. Không hồi quy: 3 endpoint «đến» vẫn 200; STAFF 403, ADMIN/TTVH/GDVH 200 ở `ket-qua-phat`.

## Chưa làm

- Giao diện Tivi dùng dữ liệu này (thẻ PTC hàng A, xếp hạng «Cả ngày») — DASH-10c. Lưu ý khi làm: lấy `ket-qua-phat` bằng lời gọi riêng (không đưa vào `Promise.all` chung) để lỗi/403 của module phát không làm hiện «mất kết nối» cho cả màn.
- Lọc khung giờ cho xếp hạng và `ColKhungGio` (cần backend mới: `ket-qua-phat` chưa có khung giờ) — DASH-10d.
- Tài khoản Tivi đã gán một BCVH (nếu còn) vẫn dùng được 3 endpoint «đến» như cũ nhưng không đọc được kết quả phát.
