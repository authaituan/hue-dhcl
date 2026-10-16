# TEST-1 — Test `security.log` đỏ ngẫu nhiên: khảo sát và sửa (chỉ test)

> Giả thuyết «các file test chạy song song dùng chung MỘT `security.log`» **bị mã bác bỏ**. Nguyên nhân thật: `security.log` ghi bằng `fs.appendFile` không chờ, nên dòng của ca trước có thể tới file muộn và lọt vào phép đếm của ca sau ngay trong CÙNG một file test. Theo ticket (Việc 0e) phiên đầu dừng để PO chọn phương án; PO chọn phương án 1 (chỉ sửa test) và đã áp dụng (mục «Cập nhật» ở cuối).

## Việc 0

**(a) Đường dẫn nhật ký — đã kiểm chứng bằng đọc mã.** `server/security.js:191`: `env.SECURITY_LOG || data/security.log`; ghi bằng `fs.appendFile` KHÔNG đồng bộ, không chờ (`server/security.js:97-102`). Test đổi đường dẫn được bằng biến môi trường `SECURITY_LOG`. `tests/helpers/serverHarness.js:31-35` đặt SẴN, cho mỗi TIẾN TRÌNH test, một file tạm riêng `dhcl-test-security-<pid>-<8 hex ngẫu nhiên>.log` (xóa khi thoát). `tests/security.test.js:22` tự đặt file riêng (pid + thời gian).

**(b) File test đọc/đếm `security.log` — đã kiểm chứng (grep).** `arrivals-export.test.js:417-418`, `arrivals-source.test.js:399`, `bd10-api.test.js:292`, `nap-nguon-lay.test.js:548`, `nap-nguon-xem-xet.test.js:264-269`, `phat.test.js:666,1020`, `security.test.js:22`, `thay-the-nhat-ky-khoi-phuc.test.js:137`, `thay-the-thuc-hien.test.js:636`, `thay-the-xem-truoc.test.js:512`. Tất cả đọc `process.env.SECURITY_LOG`, tức file riêng của tiến trình (harness) — không file nào dùng chung đường dẫn mặc định hay chung với file khác.

**(c) Kiểm chứng giả thuyết.** Bác bỏ **bằng mã (suy từ mã)**: mỗi file chạy trong một tiến trình `node --test` riêng, harness đặt đường dẫn có pid + số ngẫu nhiên nên hai file không ghi chung. **Tái hiện bằng thực nghiệm: lúc đầu KHÔNG được** (xem cập nhật cuối file: về sau ca (j) tái hiện được). Chạy cặp `arrivals-export` + `nap-nguon-xem-xet` song song 5 lần: 0 đỏ; thêm 12 tiến trình ngốn CPU nền, 5 lần nữa: 0 đỏ. (Một lần thử chạy 8 bản sao cùng file đồng thời đỏ hàng loạt nhưng vô giá trị: các bản sao dùng chung cổng cố định nên nhiễu lẫn nhau.) Lần đỏ quan sát trên máy ở thời điểm đó là `npm test` lần đầu (ca (j) `2 !== 1`); chạy lại đạt.

**(d) Nguyên nhân thật giải thích được hai ca — suy từ mã; ca (j) về sau đã tái hiện trên bản gốc, ca `arrivals-export` chưa tái hiện.** Cuộc đua NGAY TRONG MỘT file, do ghi nhật ký không đồng bộ:
- `arrivals-export.test.js:417-436`: nhật ký xuất được ghi SAU khi đã gửi xong file (`server/routes/arrivals.js:~159-165`: `audit()` sau `await write(...)`, `appendFile` không chờ). Dòng của ca xuất TRƯỚC (người dùng `EX_ADMIN`) có thể tới sau khi ca này lấy `sofar`; vòng chờ (:424) thấy số dòng tăng 1 nên thoát, rồi `entries().pop()` lấy đúng dòng muộn của `EX_ADMIN` thay vì dòng `EX_TTVH` ⇒ khớp lỗi quan sát `'EX_ADMIN' !== 'EX_TTVH'`.
- `nap-nguon-xem-xet.test.js:262-272`: lấy `truoc` = kích thước file rồi đếm dòng từ đó; dòng `da_xem_xet` của các ca (a)…(i) trước còn đang ghi dở có thể rơi sau mốc `truoc` ⇒ `dd.length` = 2 (khớp `2 !== 1`).
Tải CPU của CI (chạy song song nhiều file) mở rộng khoảng ghi dở. Các giải thích về giờ hệ thống, bộ lập lịch SFTP: chưa kiểm chứng, không có bằng chứng.

**(e) Rủi ro cùng loại — suy từ mã.** Ca nào lấy mốc đầu/đếm dòng tuyệt đối rồi chờ cố định: `arrivals-export` (:417), `nap-nguon-xem-xet` (:262); các file đọc cả file rồi lọc theo `event` (`phat.test.js`, `thay-the-*`, `bd10-api`, `arrivals-source`) ít nhạy hơn nhưng chung nguyên lý nếu có khẳng định số lượng.

## Phương án (PO chọn phương án 1, đã áp dụng; phương án 2 chưa dùng)

1. **Chỉ test:** đếm/lấy dòng theo khóa riêng của chính ca (ví dụ lọc `hrm_code`/`role` = `EX_TTVH` trong `arrivals-export`; lọc `bcvh`+`ngay`+`loai` duy nhất của ca (j) hoặc lấy mốc sau khi chờ ổn định). Giữ `strictEqual`, không nới phép kiểm. (Bản áp dụng dùng mốc `ts > t0` thay cho khóa nội dung, xem cuối file.)
2. **Server nhỏ:** để `security.log(...)` trả Promise (hoặc có `flush()`), test chờ trước khi lấy mốc — mặc định hành vi/nội dung dòng không đổi, nhưng đụng `server/`.
3. **Phương án 1 trước; nếu CI còn đỏ mới làm 2.** Khuyến nghị: 1.

## Xác nhận

Không sửa `src/` và `server/`; chỉ sửa `tests/arrivals-export.test.js`, `tests/nap-nguon-xem-xet.test.js`, thêm file báo cáo này và mục TEST-1 trong `CHANGELOG_AI.md`. Không nới phép kiểm, không `git add`/commit/push, không đọc DB/`.env`/`data/`. `npm test` đã chạy 3 lần liên tiếp, cả 3 lần đều `tests 599 · pass 598 · fail 0 · skipped 1`. `00_SNAPSHOT.md` không đổi vì trạng thái kỹ thuật không đổi.

## Cập nhật: đã áp dụng phương án 1 (chỉ test)

- **Sửa**: `tests/arrivals-export.test.js:419-422` và `tests/nap-nguon-xem-xet.test.js:264,270` — mốc theo thời điểm `ts` (do máy chủ đặt lúc gọi `log`) thay vì số dòng / kích thước file: chỉ xét dòng có `ts > t0` (t0 lấy ngay trước ca). Dòng của ca trước tới muộn có `ts` nhỏ hơn t0 nên bị loại; mọi `strictEqual` giữ nguyên, không bỏ/skip ca nào. Không sửa `server/`, `src/`.
- **Trước khi sửa** (cùng cơ chế, chạy lại trên bản gốc): `npm test` 3 lần có 2 lần đỏ ở ca (j) `nap-nguon-xem-xet`, và 1/5 lần đỏ khi chạy cặp hai file ⇒ đã **tái hiện** lỗi ca (j) (trước đó 0/10), phù hợp cuộc đua ghi bất đồng bộ trong một file; ca `arrivals-export` chưa tái hiện được.
- **Sau khi sửa**: cặp hai file chạy 5 lần: 27 đạt, 0 đỏ cả 5. `npm test` 3 lần liên tiếp, mỗi lần `ℹ tests 599 · ℹ pass 598 · ℹ fail 0 · ℹ skipped 1`.
- **Chưa kiểm chứng / rủi ro còn lại**: ca `arrivals-export` chưa từng tái hiện nên chưa chứng minh được là đã hết; các lần chạy sạch (5 lần cặp file, 3 lần `npm test`) không đủ để loại hoàn toàn lỗi ngẫu nhiên trên CI; ts cùng mili-giây với t0 chỉ có thể bỏ sót chứ không làm đếm thừa (xác suất rất nhỏ vì có độ trễ HTTP); `JSON.parse` một dòng ghi dở là rủi ro lý thuyết.
