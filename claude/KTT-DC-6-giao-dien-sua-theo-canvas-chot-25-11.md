# TICKET KTT-DC-6 — Sửa giao diện tab «Hướng đóng chuyến nội tỉnh» theo canvas chốt 25/11/2026

Ngày: 25/11/2026. PO: Tân (đã chốt canvas 25/11). Người giao: CTO AI. Người làm: Antigravity (giao diện). Canvas chốt: https://claude.ai/artifact/BK1cFW8Qk2fPjXAXLTyVq1 (hai artboard 03/11/2026 và 08/11/2026). Canvas là bản vẽ bố cục và chữ, KHÔNG sao chép CSS/JS; số trong canvas để hiểu bố cục (số theo BCVH trong bảng hướng đi là số minh hoạ), không đưa vào mã, test, docs.

**Điều kiện bắt đầu (PO làm trước, CTO hướng dẫn từng bước):** KTT-DC-5 đã xong, đã vào `main`; nhánh giao diện `feat/ktt-dc-4-giao-dien` đã được cập nhật từ `main` có DC-5. Chưa đủ điều kiện thì DỪNG và báo. Làm TRÊN nhánh này, không tạo nhánh mới; ghi tên nhánh và commit đầu ở đầu báo cáo.

**Quan hệ với DC-4:** DC-6 SỬA phần đã làm theo DC-4 (đã có `KttHuongDong.jsx`, `kttApi.js`, đăng ký tab). Mọi điều cấm và tiêu chí chất lượng của DC-4 (mục 2, mục 5, mẫu báo cáo mục 7) vẫn hiệu lực, trừ chỗ DC-6 nói khác. Hợp đồng API: `docs/ai/42_KTT_API.md` (đã gồm trường mới của DC-5); thiếu hoặc mâu thuẫn thì DỪNG phần đó và báo, KHÔNG đoán tên trường.

## 1. Mục tiêu duy nhất
Đưa tab về đúng canvas chốt: bỏ dải 29 ngày và biểu đồ chấm, thêm bảng «hướng đi» (nơi đóng × 6 BCVH, mỗi ô số BG và số túi), đổi tiêu đề và rút gọn chú thích, và dùng chuẩn giao diện của tab «Đối chiếu BCVH».

## 2. Điều cấm (thêm vào DC-4 mục 2)
- Chỉ sửa trong `src/components/ktt/`. Không sửa `server/`, `tests/`, `docs/`, `package.json`. Không git add/commit/push/stash/reset. Không đọc DB, `data/`, `.env`.
- KHÔNG tự tính ở giao diện: số BG hay số túi theo BCVH, bất biến, quy tắc túi lớn. Lấy từ `huong_bcvh` của API. Chỉ được phép hiển thị: cộng các dòng đang hiện, chia %, tính độ đậm của ô (mục 4.3), thứ hạng ngày (mục 4.2). Liệt kê MỌI chỗ làm các phép này trong báo cáo.
- KHÔNG hard-code tên BCVH, mã BCVH, thứ tự cột: lấy từ `meta.huong_bcvh` (`ma_bcvh`, `ten_bcvh`).
- KHÔNG in cột nào ngoài những cột liệt kê ở mục 3; KHÔNG thêm chú thích, khung cảnh báo hay dòng giải thích mà canvas không có (PO đã chủ động bỏ).
- Chuỗi hiển thị KHÔNG chứa các từ cấm ở DC-4 mục 2 (có «bản đồ nhiệt», «heatmap»; gọi khối này là «bảng hướng đi» trong báo cáo, không in lên màn). KHÔNG có chữ «minh hoạ» hay «số dựng» trên màn.

## 3. Nhãn hiển thị BẮT BUỘC (đúng từng chữ; `{N}` = `meta.nguong_bg_trong_tui`) — THAY mục 3 của DC-4
| Vị trí | Chữ |
|---|---|
| Tiêu đề trang (h1) | «Hướng đóng chuyến nội tỉnh»; dòng nhỏ phía trên: «Trung tâm Khai thác · 530100 · Hàng tại KTT» |
| Ô phạm vi (bên phải tiêu đề) | «Phạm vi số liệu» + ô «{từ dd/mm/yyyy} đến {đến dd/mm/yyyy}, {n} ngày» + ô «Ngưỡng: từ {N} BG trong túi» |
| Bộ lọc | «Khoảng ngày» với «Từ ngày», «Đến ngày»; «30 ngày», «7 ngày»; «Loại hình nơi đóng»: «Tất cả», «GD1», «GD2/GD3», «VHX», «531120»; «Tải xuống»: «Tải Excel» |
| Tiêu đề khối | «Hàng nội tỉnh (túi) đóng đến 530100 không đóng thẳng BCVH» |
| Dòng dưới tiêu đề | «Dữ liệu đang tính đối với túi >={N} BG» |
| Hai ô số | «Sản lượng» (số = `meta.bg_trong_tui_lon`), phụ đề «bưu gửi trong {so_tui_lon} túi» và, khi khoảng chọn đúng một ngày và tính được (mục 4.2), thêm « · cao thứ {k} trong {n} ngày ({từ dd/mm} đến {đến dd/mm})»; «Số BC/VHX đóng» (số = nơi có `bg_trong_tui_lon` > 0), phụ đề «nơi có túi từ {N} BG trở lên» |
| Bảng hướng đi | KHÔNG có tiêu đề riêng. Cột: «Nơi đóng chuyến thư»; sáu cột BCVH: dòng trên `ten_bcvh`, dòng dưới `ma_bcvh`; «Cộng» với dòng nhỏ «bưu gửi»; «Số túi» với dòng nhỏ «túi». Mỗi ô: dòng trên «{bg} BG», dòng dưới «{so_tui} túi»; ô bg = 0 chỉ hiện «·». Dòng cuối: «Cộng {x} nơi», mỗi cột «{bg} BG» và «{so_tui} túi» lấy từ `meta.huong_bcvh`, cột «Cộng» là tổng BG, cột «Số túi» là `meta.so_tui_lon` |
| Bảng chi tiết | Tiêu đề «Chi tiết từng nơi đóng». Cột: «Nơi đóng chuyến thư», «Hàng trong túi từ {N} BG trở lên», «Hàng trong túi dưới {N} BG», «Số túi từ {N} BG trở lên», «Túi nhiều nhất (bưu gửi)». Dòng 531120: số kèm «({p}% sản lượng)». Dòng cuối: «Cộng {x} nơi có túi từ {N} BG trở lên»; «{y} nơi chỉ có túi dưới {N} BG (bấm để mở)»; «Cộng {z} nơi có hàng vào 530100». KHÔNG có chú thích dưới bảng |
| Khối thu gọn 1 | «Danh sách bưu gửi của nơi đóng» · «bấm một dòng ở bảng trên để mở: số hiệu, ngày hàng đến, ngày đóng chuyến thư, số bưu gửi trong túi, mã túi, BCVH đích, dịch vụ, khối lượng; hộp chọn «Chỉ túi từ {N} BG trở lên» bật sẵn» và nút «Tải Excel» |
| Khối thu gọn 2 | «Cách tính và giới hạn» · «mở ra để đọc»; nội dung ở mục 4.6 |
| Trạng thái | như DC-4 mục 3 |

**Đã BỎ khỏi DC-4:** dải «Sản lượng theo ngày» (DC-4 4.3, trừ thứ hạng ngày ở 4.2 dưới đây); biểu đồ «Từng túi lớn vượt ngưỡng bao nhiêu» (DC-4 4.4); khối «Những gì khối này không nói được»; chú thích dưới bảng chi tiết và phần «theo loại hình» trong chú thích đó; thẻ giải thích dưới bảng hướng đi.

## 4. Các việc
4.1 **Chuẩn giao diện (bám tab «Đối chiếu BCVH», không bịa kiểu mới).** Đọc TRƯỚC `KttDoiChieu*.jsx`, `KttLuuThoat.jsx` (thẻ số chuẩn «Hàng đến tính chỉ tiêu», khoảng dòng 894–911), `kttFormatters.js`, `KttTooltip.jsx`, `KttErrorBoundary.jsx`. Dùng đúng lớp và component có sẵn: tiêu đề khối `hue-h2 text-[17px]`; thẻ số `hue-num-lg`, nhãn `text-[11px] font-bold text-gray-600 tracking-wide uppercase`, ghi chú `text-[11px]`, viền trên màu, thẻ trắng viền mảnh; đầu bảng nền kem `#FAF5E8`; bộ lọc ngày và nút «Tải Excel» theo các tab hiện có; màu trong JS dùng hex (quyết định #103), dãy chính tím đậm `#4A1D6E`. Khi canvas và bản chạy khác nhau (ví dụ cỡ chữ tiêu đề), THEO BẢN CHẠY và ghi chỗ khác vào báo cáo. Khung ngoài (menu tím, thanh trang con) đã có sẵn, không dựng lại.
4.2 **Hai ô số và thứ hạng ngày.** Thứ hạng chỉ tính khi khoảng chọn đúng một ngày: một lời gọi `tong-hop` cho 30 ngày kết thúc ở «Đến ngày» (đã có từ DC-4 4.3; khoảng chọn đã là 30–31 ngày thì dùng luôn), xếp giảm dần các ngày TRỌN theo `theo_ngay[].bg_trong_tui_lon`, k là hạng của ngày chọn. Ngày chưa trọn không tính. Cách biết ngày chưa trọn: như DC-4 4.3 (trường API `nguon_xuat_luc_moi_nhat` hoặc tương đương, đã xác nhận trong `42_KTT_API.md`); API không có hoặc không tính được thì KHÔNG hiện phần «cao thứ …», không đoán bằng giờ máy khách. Xóa mã vẽ dải cột và vạch trung bình.
4.3 **Bảng hướng đi.** Dữ liệu: mỗi nơi trong `tong-hop` có `huong_bcvh` (6 phần tử, thứ tự API); các nơi theo thứ tự như bảng chi tiết (531120 đầu, rồi lớn đến nhỏ). Ô có bg > 0 tô nền tím `rgba(74,29,110,a)` với a = 0,08 + 0,72 × (bg ÷ tổng BG của dòng); a > 0,5 thì chữ trắng, ngược lại chữ tối; tooltip «{bg} BG, {p}% của nơi này» (dùng `KttTooltip`). Ô cao tối thiểu 46 px, hai dòng căn giữa. Cuộn ngang trong khối, rộng tối thiểu khoảng 760 px. Không chỉ phân biệt bằng màu: số luôn hiện trong ô. Bấm một dòng nơi: mở dưới dòng đó danh sách túi (mục 4.4); bấm lại thì đóng; chỉ mở một dòng một lúc.
4.4 **Mở một nơi: từng túi.** Gọi `huong-dong-chuyen/tui` (`tu`, `den`, `ma_noi`, `chi_tui_lon=1`). Mỗi túi một dòng: ngày đóng chuyến thư, mã túi, «{so_bg_trong_tui} BG trong túi», rồi cùng sáu cột BCVH với «{bg} BG» (cùng cách tô nền theo dòng túi). Trạng thái tải, lỗi, rỗng theo DC-4 mục 3. Không hiện số hiệu bưu gửi ở đây.
4.5 **Bảng chi tiết và danh sách bưu gửi:** giữ như DC-4 4.2 và 4.5, trừ chú thích dưới bảng đã bỏ. Bảng chi tiết bấm dòng mở danh sách bưu gửi (khối thu gọn 1), bảng hướng đi bấm dòng mở từng túi (4.4); hai thao tác độc lập.
4.6 **Khối «Cách tính và giới hạn»** (thu gọn), đúng các ý, mỗi ý một dòng:
- «Túi từ {N} bưu gửi trở lên là dấu hiệu cần nhắc, chưa phải kết luận đóng sai. Cỡ túi chỉ đếm bưu gửi nội tỉnh; hàng đi tỉnh khác nằm cùng túi không tính.»
- «Ngưỡng {N} là mặc định, đặt ở tham số hệ thống; dấu «từ {N} trở lên» (≥) chưa được xác nhận lần cuối. Bảng không gồm 6 BCVH làm nơi đóng.»
- «Bảng hướng đi: mỗi dòng là một nơi đóng chuyến thư vào 530100, chỉ tính bưu gửi trong túi từ {N} BG trở lên; mỗi cột là BCVH mà 530100 đóng tiếp hàng đó đi. Dòng trên của ô là số bưu gửi, dòng dưới là số túi có ít nhất một bưu gửi đi BCVH đó. Một túi chứa hàng đi nhiều BCVH được tính ở mỗi BCVH, nên số túi trong một dòng không cộng lại thành số túi của nơi đóng. Ô đậm hơn là hướng chiếm phần lớn hơn của nơi đóng; dấu chấm là không có hàng đi hướng đó.»
- «Số túi ở dòng «Cộng» của mỗi cột là tổng số túi của các nơi có hàng đi BCVH đó.»
- «Bảng chi tiết: 531120 hiện số liệu riêng; thanh của các nơi còn lại chia theo mức lớn nhất của nhóm đó, không so với 531120. Hai dòng cuối nối số với tổng hàng vào 530100 trong khoảng ngày: {dong_vao_530100} = {lớn} + {nhỏ}.»
- «531120: chưa biết có thoả thuận đóng chuyến riêng hay không.»
- «Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc; hệ thống chưa có cột điểm chấp nhận. Chưa tính hàng hoàn.»
- «Ngày hàng đến được tính như màn «Hàng tại Khai thác tỉnh»; ngày chưa trọn không tính vào thứ hạng.»
4.7 **Dọn mã:** xóa hàm, state, kiểu và lời gọi API chỉ phục vụ dải 29 ngày (trừ lời gọi 30 ngày cho thứ hạng) và biểu đồ chấm; không để mã chết. Thêm vào `kttApi.js` hàm gọi `huong-dong-chuyen/tui` theo khuôn hàm hiện có.

## 5. Tiêu chí kiểm tra (thêm vào DC-4 mục 5)
- `npm run build` mã 0; quét biến chưa khai báo và import thiếu bằng AST; quét chuỗi hiển thị theo danh sách cấm (dán lệnh và kết quả); quét mã: không còn số 15 viết cứng, không còn tên/mã BCVH viết cứng, không còn mã dải 29 ngày hay biểu đồ chấm (dán lệnh và kết quả).
- Bất biến trên màn (kiểm bằng mắt và nêu trong báo cáo, KHÔNG chỉnh số cho khớp): tổng «{bg} BG» của dòng = số ở cột «Cộng» = «Hàng trong túi từ {N} BG trở lên» của cùng nơi ở bảng chi tiết; dòng «Cộng» cuối bảng hướng đi = `meta.bg_trong_tui_lon`.
- Ba tình huống (dữ liệu giả hoặc PO chạy): một ngày nhiều nơi; một ngày chỉ một nơi (bảng hướng đi một dòng); 30 ngày. Mỗi tình huống đối chiếu số trên màn với JSON API (bảng đối chiếu, bỏ giá trị định danh).
- Chọn loại hình thì bảng hướng đi và dòng «Cộng» đổi theo.
- Mở một nơi ra danh sách túi; mở bảng chi tiết ra danh sách bưu gửi; hai thao tác không dẫm lên nhau.
- Ảnh chụp ở 1280 px (che số hiệu bưu gửi, mã túi): (1) một ngày nhiều nơi; (2) một ngày một nơi; (3) 30 ngày; (4) mở một nơi ra từng túi; (5) trạng thái tải, lỗi, rỗng. Nếu không dựng được dữ liệu giả thì nói rõ để PO tự chụp.
- `git status --short` chỉ file trong `src/components/ktt/`; dán `git diff --stat`.

## 6. PO nghiệm thu (PO tự làm; số này KHÔNG đưa vào repo)
Số thật theo KTT-DT-6c (bản sao DB 12/11/2026 15:23; DB thật có thể đã khác):
- 03/11/2026: Sản lượng 502 trong 5 túi, cao thứ 2 trong 29 ngày; 5 nơi (531120 411, 531600 31, 535300 23, 536210 20, 531110 17); số túi mỗi nơi 1; dòng «Cộng» 502 BG và 5 túi; 28 nơi chỉ có túi dưới {N} BG với 151 BG; cộng 33 nơi, 502 + 172 = 674.
- 08/11/2026: 166 trong 1 túi, cao thứ 7; 1 nơi (531120).
- Số BG và số túi theo từng BCVH: so với bảng của Claude Code trong báo cáo KTT-DC-5 (không có số liệu thật nào trong ticket này).

## 7. Mẫu báo cáo
Ghi `Claude outputs/KTT-DC-6-bao-cao.md`: (1) nhánh và commit đầu; (2) file đổi (đường dẫn, số dòng); (3) tên trường API đã dùng cho từng khối (đối chiếu `42_KTT_API.md`); (4) kết quả build, quét AST, quét chuỗi cấm, quét số 15/tên BCVH/mã chết (dán lệnh và kết quả); (5) bảng đối chiếu ba tình huống; (6) danh sách phép tính hiển thị kèm đoạn mã; (7) ảnh chụp; (8) chỗ khác giữa canvas và bản chạy (theo bản chạy), việc chưa làm được; (9) `git status --short` đầu và cuối, `git diff --stat`. Sau báo cáo, CTO giao ticket kiểm độc lập (DC-6b) cho Claude Code phiên mới trước khi PO commit. **KTT-DC-4b chưa chạy; gộp vào DC-6b.**
