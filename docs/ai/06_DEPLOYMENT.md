# 🚀 Hướng dẫn triển khai (deploy)

> Các bước thao tác tay khi đưa hệ thống lên máy chủ — PO tự làm (cần quyền truy cập NAS).
> Không dán giá trị bí mật (`JWT_SECRET`, mật khẩu) vào chat/báo cáo.

## 1. `JWT_SECRET` (bắt buộc — thiếu thì server KHÔNG khởi động)
Biết secret là tự ký được token giả quyền bất kỳ (kể cả ADMIN). Mỗi project dùng **secret riêng, tạo mới** —
không dùng lại secret của hệ thống khác. Chỉ máy dev mới được đặt `ALLOW_INSECURE_DEV=1`.

Tạo chuỗi bí mật (chạy 1 lần, lưu an toàn, không commit):
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Đặt vào file `.env` (copy từ `.env.example`, đã nằm trong `.gitignore`). `server/index.js` tự nạp `.env`
(`process.loadEnvFile()`); biến môi trường hệ thống luôn thắng giá trị trong `.env`.

⚠️ Đổi `JWT_SECRET` khi đang có người đăng nhập → mọi người bị đăng xuất. Nên đổi giờ ít người dùng.

## 2. Cài dependencies trên Windows (máy phát triển)
```
npm ci --ignore-scripts
```
`better-sqlite3` có bản prebuilt; không có `--ignore-scripts` thì `node-gyp` lỗi trên máy không có Visual Studio.

## 3. Lọc IP truy cập
| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `CMS_ALLOWED_IPS` | IP đơn / dải CIDR IPv4, cách nhau dấu phẩy. Trống = chỉ chính máy chủ. `*` = mọi IP (chỉ để thử). | `127.0.0.1,10.47.0.0/16` |
| `TRUSTED_PROXIES` | IP proxy đứng trước backend; chỉ khi có biến này mới đọc `X-Forwarded-For`. | `127.0.0.1,::1` |
| `LOGIN_IP_MAX_FAILS` | Số lần đăng nhập sai tối đa / 15 phút từ 1 IP. Mặc định 20. | `20` |
| `SECURITY_LOG` | File nhật ký bảo mật. Mặc định `data/security.log`. | |

Sai cú pháp danh sách IP → server không khởi động (cố ý). Máy ngoài danh sách thấy trang 404.

## 4. Checklist trước khi triển khai
- [ ] Đã đặt `JWT_SECRET` mới và `CMS_ALLOWED_IPS` (có `127.0.0.1`) trong `.env` trên NAS.
- [ ] `npm test` pass, `npm run build` OK trên bản sẽ triển khai.
- [ ] Đã có DB ban đầu (tài khoản + mạng lưới) theo mục 5 — DB trống thì không ai đăng nhập được.
- [ ] Đã sao lưu thư mục `data/` (nếu là lần cập nhật, không phải lần đầu).

## 5. Tạo DB ban đầu (tài khoản + mạng lưới từ hệ thống cũ)
Làm trên máy phát triển, thư mục `D:\Dev\hue-dhcl`. Script dùng lại **đúng** các tài khoản đăng nhập cũ (giữ nguyên mật khẩu
đã băm) và danh mục tỉnh/BĐX/bưu cục. Nguồn = file DB của hệ thống cũ (it-assets v1.0.0); nên dùng **bản sao** lấy lúc hệ thống
cũ đã dừng hoặc không ai thao tác. Script không ghi gì vào nguồn (chỉ đọc để chép sang thư mục tạm).

1. Chạy app một lần để tạo `data/hue-dhcl.db` đúng schema mới (`npm run dev:server`, cần `.env` có `JWT_SECRET`), rồi tắt app.
   Cách khác không cần `.env`: `node -e "require('./server/db').close()"`.
2. Nạp dữ liệu (app đang tắt):
   ```
   node scripts/import-seed.js <đường-dẫn-DB-hệ-thống-cũ>
   ```
   Script in số dòng từng bảng, danh sách tài khoản `mã HRM | họ tên | quyền | trạng thái` (không in mật khẩu/hash).
   Đích đã có dữ liệu thì script từ chối; muốn nạp lại từ đầu thêm `--force` (xoá 4 bảng tài khoản/mạng lưới rồi nạp lại,
   không đụng cấu hình Dashboard). Lỗi toàn vẹn → huỷ toàn bộ, đích giữ nguyên.
3. Khởi động lại app, đăng nhập thử bằng một tài khoản ADMIN cũ; mở Quản lý mạng lưới kiểm tra số bưu cục.
4. Tắt app, đưa **riêng file** `data/hue-dhcl.db` lên NAS tại `/volume1/docker/hue-dhcl/app/data/` (container đang **dừng**;
   trong thư mục đó không được còn `hue-dhcl.db-wal`/`-shm` cũ). Script đã gộp WAL nên chỉ cần 1 file.
5. Chạy container, đăng nhập trên máy chủ và **đổi mật khẩu tài khoản admin** (mật khẩu đang giống hệ thống cũ).

## 6. Triển khai Synology (Docker)
**Kiến trúc**: 1 container `hue-dhcl` (Node 22, Express 5 + better-sqlite3) chạy `node server/index.js`, phục vụ cả API lẫn
giao diện (`dist/`). **`network_mode: host`**: app lắng nghe trực tiếp cổng **`HOST_PORT`** của NAS (**18060**, truyền vào app qua `PORT`),
không dùng 5000 (cổng DSM). Dữ liệu (`hue-dhcl.db`, `security.log`) ở `./data` trên NAS, gắn vào `/app/data` — **ngoài image**.
Truy cập: `http://<IP-NAS>:18060`. **Phải cho phép cổng 18060 trong Tường lửa DSM.**

Vì sao chế độ host (`04_DECISIONS.md` #9): ở mạng bridge, app thấy IP máy khách là `172.18.0.1` → allowlist chặn tất cả.
Hệ quả: không có mục `ports`; chỉ chạy trên Linux/NAS.

**Biến môi trường** (file `.env` cạnh `docker-compose.yml`; thiếu `JWT_SECRET`/`CMS_ALLOWED_IPS` thì compose báo lỗi):
- `JWT_SECRET` — bắt buộc (mục 1).
- `CMS_ALLOWED_IPS` — bắt buộc, **phải có `127.0.0.1`** (healthcheck gọi `http://127.0.0.1:<PORT>/`, thiếu thì "unhealthy").
- `HOST_PORT` — `18060`.

**Cài lần đầu**: chép mã nguồn vào `/volume1/docker/hue-dhcl/app/` trên NAS, tạo `.env`, rồi Container Manager → Project → Create
(trỏ tới thư mục đó) hoặc SSH `docker compose up -d --build`. Lần chạy đầu server tự tạo DB và 3 ô Dashboard mặc định.
Đưa DB ban đầu vào `app/data/` theo mục 5 (hoặc trước khi chạy lần đầu).

**Cập nhật phiên bản** (quy trình chuẩn):
1. **Sao lưu `data/`**: dừng container rồi copy cả `hue-dhcl.db`, `-wal`, `-shm`.
2. Trên máy phát triển: `git archive --format=zip -o hue-dhcl.zip HEAD`; upload lên NAS, giải nén **đè** lên mã nguồn trong
   `/volume1/docker/hue-dhcl/app/`, **GIỮ NGUYÊN `.env` và `data/`** (gói `git archive` không chứa chúng).
3. Container Manager → Project → **Stop** → **Build**.

**Rollback**: Stop, trả lại mã nguồn bản trước, khôi phục `data/` đã sao lưu, rồi Build.

**Quy tắc vận hành**: KHÔNG sửa code trên NAS; chỉ sửa `.env` và dữ liệu qua giao diện. Đổi `.env` xong phải **Stop + Build**
(Restart không nạp lại biến môi trường).

**Chạy root trong container** (cố ý, `04_DECISIONS.md` #9): tránh lỗi quyền ghi SQLite trên bind-mount Synology.

**Xử lý sự cố**: `security.log` ghi toàn IP `172.x` hoặc mọi người nhận 404 → kiểm tra compose còn `network_mode: host`, không có `ports`;
`docker compose build` lỗi DNS → kiểm tra `build.network: host`.
