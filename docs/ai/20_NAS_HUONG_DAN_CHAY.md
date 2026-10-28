# Hướng dẫn chạy bản demo trên NAS Synology (NAS-2)

> **Đây là bản demo/thử kỹ thuật**: dữ liệu là dữ liệu thử, DB dựng sẵn từ máy dev. Chưa làm: tạo ADMIN trong container,
> sao lưu định kỳ, HTTPS (để NAS-3 / NAS-4). Căn cứ: `docs/ai/19_NAS_TRIEN_KHAI_AUDIT.md`.
> Không dán giá trị bí mật (`JWT_SECRET`, mật khẩu SFTP, vân tay) vào chat hay báo cáo.

## 1. Chuẩn bị thư mục trên volume
Trên NAS tạo thư mục **cục bộ của volume** (ví dụ `/volume1/docker/hue-dhcl/app/`), chép mã nguồn vào đó (`git archive` hoặc chép thư mục,
không chép `node_modules`, `dist`, `data`, `.env`). Tạo thư mục rỗng `data/` cạnh `docker-compose.yml`.
- **Không** đặt `data/` trên chia sẻ SMB/NFS hay thư mục mạng được mount: SQLite chế độ WAL cần bộ nhớ chia sẻ (`-shm`) và khoá file, dễ hỏng DB. *(Rủi ro đã biết, chưa kiểm chứng trên NAS này.)*
- `data/backups/` có thể phình: mỗi lần «Thay thế ngày» sao lưu CẢ DB (giữ 5 bản gần nhất, tức tối đa 5 bản DB đầy đủ) và cần ổ còn chỗ trống. Theo dõi dung lượng, dọn bản cũ khi cần.
- Mã chỉ ghi vào `/app/data` (DB, `-wal`, `-shm`, `security.log`, `backups/`) và `/tmp` (tạm). Mount `./data:/app/data` đã phủ hết, không có chỗ ghi nào khác.

## 2. Tạo file `.env`
Sao `.env.nas.example` thành `.env` **cạnh** `docker-compose.yml`, tự điền (soạn trên NAS, không qua chat). Tối thiểu:
`JWT_SECRET` (chuỗi ngẫu nhiên dài, tạo bằng `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` trên máy dev),
`CMS_ALLOWED_IPS` (có `127.0.0.1` và dải LAN dạng CIDR IPv4, thay hẳn giá trị mẫu; không dùng `*`), `HOST_PORT=18060`. Thiếu hai biến đầu (hoặc để trống) thì compose từ chối chạy;
`JWT_SECRET` trong tệp mẫu để trống, KHÔNG dùng chuỗi mẫu. Biến tùy chọn: `PHAT_WARM` (đặt `0` để tắt khởi động nóng cache «kết quả phát từ đầu tháng», trống = bật), `KTT_WARM` (đặt `0` để tắt làm nóng cache «Hàng tại KTT» nền sau mỗi lần nạp cặp và sau khởi động, trống = bật; `KTT_WARM_NGAY` 1..31 giới hạn số ngày, KTT-15) và
`TAIVE_MAX_DONG` (chỉ hạ giới hạn dòng mỗi tệp tải về, trống = mặc định); để trống tất cả cho lần thử đầu.

**SFTP:** `SFTP_PORT=5454` (mặc định của mã là 22). Compose đang dùng `network_mode: host` nên `SFTP_HOST` là `127.0.0.1` hoặc `10.47.31.8`;
nếu sau này đổi sang mạng cầu thì PHẢI là `10.47.31.8` (không `localhost`). `SFTP_HOSTKEY_SHA256`: `scripts/` KHÔNG nằm trong image nên không chạy được trong container. Lấy vân tay bằng `node scripts/sftp-probe.js --show-fingerprint` từ MÁY DEV
(nếu máy dev tới được NAS ở đúng địa chỉ/cổng sẽ cấu hình), hoặc làm lúc bật SFTP sau. **Lần thử đầu để trống toàn bộ `SFTP_*` và `SFTP_SYNC_ENABLED`**;
điền vào `.env`; vân tay không đổi giữa `127.0.0.1` và `10.47.31.8` vì là cùng dịch vụ SFTP *(chưa kiểm chứng)*.
Để `SFTP_SYNC_ENABLED` trống cho tới khi thử tay xong (mục 5.6).

## 3. Đưa DB dev lên NAS
Làm trên máy dev, **tắt server dev** trước. DB dev ở chế độ WAL nên dữ liệu có thể còn nằm trong `-wal`:
1. Cách an toàn nhất *(theo hiểu biết của tôi, chưa chạy trên NAS)*: gộp WAL vào file chính rồi chép **chỉ `hue-dhcl.db`**:
   `node -e "const D=require('better-sqlite3');const d=new D('data/hue-dhcl.db');d.pragma('wal_checkpoint(TRUNCATE)');d.close()"`
   (sau đó `hue-dhcl.db-wal` rỗng/biến mất; kiểm kích thước).
2. Chép `hue-dhcl.db` vào `data/` trên NAS khi container **đang dừng**. Trong `data/` trên NAS không được còn `hue-dhcl.db-wal`/`-shm` cũ.
3. Cách khác: chép đủ cả ba file (`.db`, `-wal`, `-shm`) cùng lúc, cùng thời điểm, server dev đã tắt.
4. **Tài khoản thử** (nếu có trong DB): `staff_test` mang vai trò STAFF đã gỡ nên tự bị từ chối đăng nhập (không cần xử lý); `tv`, `tv533140` là vai trò TIVI, dùng được (token 90 ngày) —
   PO quyết giữ hay khóa TRƯỚC khi cho người dùng thật vào. Nhớ đây chỉ là bản demo.
5. **Phiên bản DB:** máy chủ không có cơ chế kiểm phiên bản DB (chỉ thêm bảng/cột còn thiếu khi khởi động, không xóa). DB dev nên được tạo từ nhánh không mới hơn `main`; DB mới hơn mã có thể lỗi lúc chạy mà không báo lúc khởi động.

## 4. Build và chạy
Container Manager → Project (trỏ tới thư mục đã tạo) hoặc SSH. Kiểm cú pháp compose và biến `.env` trước (lỗi thì in ra tên biến thiếu):
```bash
docker compose config -q
```
```bash
docker compose up -d --build
```
Build có bước kiểm tự động nạp `better-sqlite3` và `ssh2-sftp-client` (in `native-ok`); hỏng thì build dừng ngay. Kiểm lại sau build:
```bash
docker compose run --rm hue-dhcl node -e "require('better-sqlite3'); console.log('ok')"
```
> Ghi chú: `better-sqlite3@13` nạp thẳng `prebuilds/linux-x64.node` (không cần node-gyp), nên giữ `npm ci --ignore-scripts`. Nạp được trên bookworm-slim x86_64 là **chưa kiểm chứng** cho tới lần build đầu trên NAS.

## 5. Chín bước kiểm (kèm kết quả đúng)
1. `docker compose ps` → `hue-dhcl` trạng thái **healthy** (healthcheck gọi `GET /`, trang giao diện tĩnh, không cần đăng nhập).
2. Mở `http://10.47.31.8:18060` từ máy trong `CMS_ALLOWED_IPS` → thấy trang đăng nhập; từ máy ngoài dải → trang 404.
3. Đăng nhập bằng một tài khoản ADMIN của DB dev → vào được; kiểm danh sách người dùng.
4. `docker exec hue-dhcl node -e "console.log(new Date().toString())"` → giờ Việt Nam (GMT+0700). Sai → báo, đừng chạy bộ tự động.
5. `docker exec hue-dhcl printenv SFTP_PORT` → `5454` (chỉ in cổng, không in mật khẩu). Màn *Nạp dữ liệu nguồn* mở không báo «chưa cấu hình SFTP».
6. Màn *Nạp dữ liệu nguồn* → «Lấy ngay» một ô: thành công. Thử với `SFTP_HOST=127.0.0.1` rồi `10.47.31.8` (sửa `.env`, `docker compose up -d --force-recreate`). Lỗi mạng → kiểm Tường lửa DSM (cổng 5454, 18060); lỗi vân tay → lấy lại vân tay.
7. Khi bước 6 ổn, đặt `SFTP_SYNC_ENABLED=1`, tạo lại container; log có dòng khởi động hẹn giờ, một lượt chạy sau ~30 giây.
8. Dừng/bật: `docker compose down` rồi `docker compose up -d` → dữ liệu vẫn nguyên (xem mục 7).
9. Kiểm `data/` trên NAS có `hue-dhcl.db`, `security.log` (và `-wal`/`-shm` khi đang chạy) — chứng tỏ dữ liệu nằm trên volume.

## 6. Xem log
```bash
docker compose logs --tail=100 hue-dhcl
```
Log Docker xoay vòng 10 MB × 3 file. Nhật ký bảo mật: `data/security.log`.

## 7. Dừng, bật, xác nhận dữ liệu
```bash
docker compose down
docker compose up -d
```
`down` có thể mất tới 10 giây; nhờ `init: true` trong compose, máy chủ nhận tín hiệu tắt và đóng gọn hơn. Chỉ chép DB SAU KHI `down` xong (chép đủ cả `.db`, `-wal`, `-shm`, hoặc cả thư mục `data/`).
Đăng nhập lại và kiểm số bưu cục/số liệu như trước `down`. Cập nhật mã: chép đè mã nguồn (giữ `.env`, `data/`) rồi `docker compose up -d --build`.
Trước khi cập nhật hoặc thay DB: dừng container và chép cả thư mục `data/` làm bản sao lưu (chưa có sao lưu định kỳ — NAS-3).

## Chưa kiểm chứng (cần thử trên NAS thật)
- Build `--ignore-scripts` + `better-sqlite3` prebuilt, `ssh2` (cpu-features tùy chọn) trên bookworm-slim x86_64.
- Vân tay SFTP giống nhau giữa `127.0.0.1` và `10.47.31.8`; tường lửa DSM với cổng 5454 từ network_mode: host.
- `tzdata`/TZ trong container (bước 5.4).
- SQLite WAL trên volume Synology (bind-mount cục bộ) — dự kiến ổn, chưa thử.
