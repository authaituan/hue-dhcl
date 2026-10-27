# TICKET KTT-10b — Đo song song hai mốc «giờ đi» cho chỉ tiêu «đạt 14 giờ»

Ngày: 27/10/2026 · Người giao: CTO AI · Người duyệt/nghiệm thu: PO Tân
Executor: Claude Code (Sonnet) · Validation: LEVEL 2 (đổi đầu ra của module KTT; test module KTT phải chạy hết) · PO UI Check: Không.
Đọc trước (trong repo): chuỗi onboarding của `README_AI.md`, rồi `docs/ai/37_KTT_QUY_TAC_TINH.md`, `docs/ai/41_KTT_LUU_THOAT.md`, `docs/ai/42_KTT_API.md`.
Các số đo thật của KTT-10 do PO giữ ngoài repo (repo công khai); Dev AI làm trên dữ liệu giả, không cần số thật.

## 1. Vai trò
Bạn là Claude Code (backend, test, docs). Không làm giao diện. Phần hiển thị trên trang cần canvas được PO duyệt trước, sẽ có ticket riêng cho Antigravity.

## 2. Bối cảnh (đã chốt, không bàn lại)
- KTT-10 (đối chiếu độc lập) cho thấy chỉ tiêu «đạt 14 giờ» chỉ đo được trên một phần mẫu số. Phần không đo được gồm ba nhóm: SHBG có XNĐ sau giờ lập BD10 đi; SHBG thiếu XNĐ; SHBG chưa đi. Tỷ lệ tính trên phần đo được KHÔNG phải tỷ lệ chung.
- Quyết định PO (Q2): đo SONG SONG hai mốc, chưa chọn một mốc để công bố tỷ lệ đạt.
  - Mốc A (hiện tại): giờ XNĐ so với giờ lập BD10 đi.
  - Mốc B (mới): giờ quét túi đến.
- PO có thể đổi mốc đo mặc định sang mốc B ở ticket sau → mốc đo phải là THAM SỐ, không viết cứng.
- Chất lượng dữ liệu cần lưu ý khi dùng mốc B (từ KTT-10): có SHBG không có túi đi; có SHBG có từ 2 túi đến trở lên; có SHBG có túi đến ghép khác túi đến gốc; có SHBG «đi trước khi đến». Số lượng cụ thể do PO giữ.

## 3. Phạm vi
Mục tiêu duy nhất: tính và trả ra kết quả «đạt 14 giờ» theo cả hai mốc, kèm số «đo được x/y» cho từng mốc.

Việc phụ (chỉ đọc, báo cáo, KHÔNG sửa): mục 5.4 kiểm đợt thiếu giờ quét đến ở hai ngày 18/10 và 20/10.

## 4. Điều cấm
- Không commit, không push, không `git add`, không `git reset --hard`. PO làm git.
- Không đụng DB thật, mật khẩu, `.env`; không in nội dung biến môi trường.
- Không đưa `data/`, `*.db*`, CSV thật, SHBG thật, số đo vận hành thật vào repo, tests, docs hay báo cáo. Test dùng dữ liệu giả.
- Không đổi định nghĩa hàng hoàn (Q1 đã chốt: chỉ đích Thuận Hóa; hàng gốc từ Tổ KHHH đi các BCVH khác để ticket sau).
- Không đổi giao diện, không đổi cấu trúc sheet xlsx (KTT-8d làm riêng).
- Không công bố/ghi cứng tỷ lệ «đạt» là một con số duy nhất.
- Nếu thấy cần sửa ngoài phạm vi: dừng, báo, chờ CTO.

## 5. Các việc
5.1 **Khảo sát (chưa sửa).** Tìm nơi tính «đạt 14 giờ» trong mã; báo lại tên file/hàm và kế hoạch sửa ngắn gọn TRƯỚC khi sửa. Nếu không tìm thấy hoặc chỗ tính khác với mô tả ở mục 2, dừng và báo.

5.2 **Mốc là tham số.** Thêm tham số chọn mốc (`xnd` | `quet_tui_den`), mặc định giữ hành vi hiện tại (`xnd`) để KHÔNG đổi số đang hiển thị nếu không ai yêu cầu.

5.3 **Trả ra song song.** Với cùng khoảng ngày, trả kết quả cho cả hai mốc, mỗi mốc gồm: số đo được, tổng mẫu số, số đạt, số không đạt, số không đo được (tách lý do: thiếu mốc, mốc sau giờ lập BD10 đi, chưa đi). Có thêm số SHBG đo được ở mốc này nhưng không đo được ở mốc kia. Quy tắc chọn túi đến khi có từ 2 túi đến trở lên hoặc túi đến ghép khác túi đến gốc: ghi rõ cách đã chọn trong `docs/ai/37_KTT_QUY_TAC_TINH.md`, và nêu số bị ảnh hưởng (trên dữ liệu giả; số thật PO đo).

5.4 **Kiểm chỉ đọc 18/10 và 20/10.** Hai ngày này có nhiều SHBG thiếu giờ quét đến (và 20/10 còn có SHBG không rõ đích). Việc cần làm: viết script CHỈ ĐỌC (đặt trong `scripts/`, không ghi DB) để PO chạy trên BẢN SAO DB ở máy PO, cho biết hai ngày đó có đợt nạp lỗi/thiếu/CSV bị cắt không (dựa vào nhật ký nạp, số dòng theo ngày, giờ nguồn xuất). Dev AI không chạm DB thật và không tự chạy trên dữ liệu thật. Chỉ nêu bằng chứng; KHÔNG kết luận nguyên nhân khi chưa có. Câu hỏi nghiệp vụ (18/10 là Chủ nhật, có bất thường ở KTT không) do PO trả lời, Dev AI không đoán.

5.5 **Đối chiếu.** Dev AI chạy lại với dữ liệu giả. Phần đối chiếu số thật do PO chạy trên máy PO bằng script `doi-chieu-doc-lap.js` (chỉ có ở `D:\Dev\ktt-thu-tools`, không đưa vào repo); Dev AI không chạy trên dữ liệu thật. Mốc A phải tái hiện đúng số tham chiếu của KTT-10 (PO giữ) ở khoảng 7 ngày đã dùng trong KTT-10.

5.6 **Test.** Thêm test bằng dữ liệu giả cho: mốc A đúng như cũ; mốc B; SHBG đo được ở một mốc, không ở mốc kia; túi đến trùng/ghép sai; SHBG chưa đi; đổi tham số không làm đổi mốc kia.

5.7 **Docs.** Cập nhật `docs/ai/37_KTT_QUY_TAC_TINH.md` (định nghĩa hai mốc, quy tắc chọn túi đến) và `docs/ai/42_KTT_API.md` nếu đầu ra API đổi. Không viết số liệu thật vào docs.

5.8 **Bàn giao (theo DEVELOPER_PROMPT_STANDARD mục 5).** Thêm một mục ở đầu `docs/ai/CHANGELOG_AI.md`; cập nhật `docs/ai/00_SNAPSHOT.md` chỗ trạng thái đổi; cập nhật `docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md` (ticket kế tiếp = chưa có, PO chọn). Liệt kê file để PO `git add` từng file và đề xuất một commit message. Dừng ở trạng thái `IMPLEMENTED` (không có giao diện nên không cần `READY FOR PO CHECK`).

## 6. Tiêu chí kiểm tra (PASS khi đủ tất cả)
1. Mốc A tái hiện đúng số tham chiếu của KTT-10 trên bộ đối chiếu của PO; các số đang hiển thị khác (đến, đi trong ngày, rớt lại, trượt chuyến, đạt/không đạt, hàng hoàn) không đổi.
2. Mốc B có «đo được x/y» và phân tách lý do không đo được.
3. Đổi tham số mốc không cần sửa mã; mặc định không đổi số hiển thị hiện tại.
4. Test mới chạy xanh, không dùng dữ liệu thật; test cũ không hỏng.
5. `git status` chỉ có các file thuộc phạm vi; không có `data/`, `.env`, `*.db*`, CSV thật.
6. Mục 5.4 có bằng chứng (hoặc ghi rõ «không tìm thấy gì»), không suy đoán.

## 7. Mẫu báo cáo (Dev AI điền, ngắn gọn)
```
KTT-10b — BÁO CÁO
1. Khảo sát: file/hàm tính «đạt 14 giờ»: ...; khác mô tả không: ...
2. Đã làm: (liệt kê file đã sửa/thêm)
3. Kết quả đối chiếu (dữ liệu giả): mốc A: .../...; mốc B: .../...; đo được ở A không ở B: ...; ở B không ở A: ...
4. Quy tắc chọn túi đến đã dùng: ...
5. Kiểm 18/10 và 20/10: script đã viết; bằng chứng: ...; chưa biết: ...
6. Test: chạy lệnh nào, kết quả
7. `git status` (dán nguyên văn)
8. Chưa chắc / cần PO quyết: ...
```
Số đo thật không ghi trong báo cáo nộp vào repo; PO điền ở bản riêng.

## 8. Ngoài phạm vi (ticket sau, ghi để khỏi sót)
- Dòng chú thích trên trang về hàng gốc từ Tổ KHHH đi các BCVH khác, tính như hàng thường (Q1) — cần canvas PO duyệt, giao Antigravity.
- Tìm nguồn/định nghĩa của con số «hàng hoàn» cũ không tái hiện được (chưa ai biết nó đo gì).
- Đưa hàng hoàn gốc Tổ KHHH → các BCVH khác vào định nghĩa (PO để ticket sau).
- Đổi mốc đo mặc định sang giờ quét túi đến (PO quyết sau khi có số đo song song).
- Giữ script `doi-chieu-doc-lap.js` ở `D:\Dev\ktt-thu-tools`; ghi vào ticket tiếp theo.
