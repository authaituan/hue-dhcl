# NAS-1 — Khảo sát triển khai Docker lên NAS Synology DS920+ (CHỈ ĐỌC)

> Nền: `main` = `1e33327`. Khảo sát chỉ đọc mã: không chạy Docker, không đọc `.env`, không kết nối NAS/SFTP, không in bí mật.
> Chỗ nào không kiểm chứng được bằng đọc mã → ghi «chưa kiểm chứng». Ký hiệu «không tìm thấy» = đã `grep` không có.

## Tóm tắt nhanh
Đóng gói **đã có** (Dockerfile + compose + healthcheck + TZ). Thiếu/sai chính nằm ở: (1) **compose không truyền `SFTP_*`** và các biến
tùy chọn khác vào container, mà `.env` không nằm trong image → Nạp nguồn/hẹn giờ SFTP không chạy được trên NAS; (2) **DB trống thì không ai
đăng nhập được** và không có cách tạo ADMIN đầu tiên trong container (script không nằm trong image); (3) đường dẫn DB cố định, không đổi bằng biến;
(4) sau reverse proxy HTTPS (cần cho Wake Lock tivi) cần `TRUSTED_PROXIES` mà compose không truyền.

---
## Việc 1 — Hiện trạng đóng gói
| Hạng mục | Hiện trạng | Bằng chứng |
|---|---|---|
| Dockerfile | Có, 2 tầng | `Dockerfile:7` (build), `:23` (chạy) |
| Ảnh nền | `node:22-bookworm-slim` cả hai tầng | `Dockerfile:7,23` |
| Build client | Trong tầng build: `npm ci --ignore-scripts` → `npm run build` (Vite → `dist/`) → `npm prune --omit=dev` | `Dockerfile:14,19-20` |
| Phục vụ file tĩnh | Chính backend Express phục vụ `dist/`; không có reverse proxy trong image | `server/index.js:59-73`, `Dockerfile:33` |
| Cổng | `PORT` (Dockerfile mặc định 5000; compose đặt `${HOST_PORT:-18060}`) | `Dockerfile:27`, `docker-compose.yml:21`, `server/index.js:21` |
| Mạng | `network_mode: host`, không có `ports` | `docker-compose.yml:13` |
| Người dùng chạy | root (cố ý, ghi chú trong Dockerfile) | `Dockerfile:39-41` (không có `USER`) |
| Lệnh khởi động | `node server/index.js` | `Dockerfile:41` |
| HEALTHCHECK | Có trong compose (node `http.get` 127.0.0.1, 30s/5s/3 lần, start 20s); **không** có trong Dockerfile | `docker-compose.yml:22-28` |
| `.dockerignore` | Có; loại `data`, `.env*` (giữ `.env.example`), `tests`, `docs`, `scripts`, `*.md`… | `.dockerignore:1-21` |
| Script khởi động riêng | Không tìm thấy (`entrypoint`/`*.sh`) | — |
| Giới hạn log | json-file 10m × 3 | `docker-compose.yml:29-33` |

Ghi nhận: `COPY server ./server` (gồm `server/pages/404.html` được `fs.readFileSync` ở `server/security.js:150`) — đủ. Không có file runtime nào
đọc `docs/` hay `scripts/` (đã `grep` `readFileSync`/`__dirname` ở `server/`).
Tương thích: `better-sqlite3@13.0.3` có `prebuilds/linux-x64.node` trong `node_modules` (kiểm ở worktree); việc `--ignore-scripts` đủ để chạy trên
bookworm-slim x86_64 là **chưa kiểm chứng** (cần build thật). `ssh2` có phụ thuộc tùy chọn `cpu-features` cần biên dịch (`package-lock.json:1439-1445`,
`"optional": true`) — bị bỏ qua khi `--ignore-scripts`, ssh2 tự rơi về JS (chưa kiểm chứng).

---
## Việc 2 — Biến môi trường (chỉ TÊN)
Server nạp `.env` bằng `process.loadEnvFile()` (`server/index.js:3`) nhưng `.env` bị `.dockerignore` loại (`.dockerignore:8-9`) và compose **không** có `env_file`
hay mount `.env` → trong container chỉ có biến do compose liệt kê ở `docker-compose.yml:16-21` + `NODE_ENV/PORT/TZ` của Dockerfile (`:26-28`).

| Biến | Đọc ở | Bắt buộc? | Mặc định | Compose truyền? |
|---|---|---|---|---|
| `JWT_SECRET` | `server/auth.js:14` | **Bắt buộc**; thiếu → ném lỗi, không khởi động (`:15-21`) | không (trừ `ALLOW_INSECURE_DEV=1`) | Có (`compose:17`, `:?` bắt buộc) |
| `ALLOW_INSECURE_DEV` | `server/auth.js:16` | Tùy chọn (chỉ dev) | rỗng. Bật → secret mặc định công khai: **mặc định nguy hiểm** nếu lỡ bật | Không (đúng) |
| `JWT_EXPIRY` | `server/auth.js:23` | Tùy chọn | `8h` | **Không** |
| `JWT_EXPIRY_TIVI` | `server/auth.js:25` | Tùy chọn | `90d` | **Không** (docs 06 nói có thể đặt qua `.env` nhưng compose không chuyển) |
| `CMS_ALLOWED_IPS` | `server/security.js:183` | Compose bắt buộc; mã: trống → chỉ `127.0.0.1,::1` (`:185,:27-28`); `*` = mọi IP | `127.0.0.1,::1` | Có (`compose:19`) |
| `TRUSTED_PROXIES` | `server/security.js:188` | Tùy chọn; chỉ khi có mới đọc `X-Forwarded-For` | rỗng (không tin proxy) | **Không** |
| `SECURITY_LOG` | `server/security.js:191` | Tùy chọn | `<app>/data/security.log` | Không (mặc định nằm trong volume — ổn) |
| `PORT` | `server/index.js:21` | Tùy chọn | 5000 (Dockerfile) | Có (`compose:21` từ `HOST_PORT`) |
| `TZ` | hệ điều hành/Node | Nên đặt | UTC nếu thiếu | Có (`Dockerfile:28`, `compose:20`) |
| `NODE_ENV` | `server/lib/sftpScheduler.js:25` (so `'test'`) | Tùy chọn | `production` (Dockerfile) | — |
| `LOGIN_IP_MAX_FAILS` | `server/routes/auth.js:24` | Tùy chọn | 20 | **Không** |
| `PHAT_MAX_DONG` | `server/config/phat.js:53` | Tùy chọn (chỉ hạ) | 20.000 | **Không** |
| `ARRIVALS_EXPORT_MAX_ROWS` | `server/lib/arrivalsExport.js:43` | Tùy chọn (test) | 1.000.000 (chặn bởi giới hạn Excel) | Không |
| `SFTP_HOST` | `server/lib/sftpFiles.js:183-184` (qua `docCauHinh`) | Bắt buộc cho SFTP | không | **Không** |
| `SFTP_PORT` | `server/lib/sftpFiles.js:186-188` | Tùy chọn | **22** (không phải 5454) | **Không** |
| `SFTP_USER` | `server/lib/sftpFiles.js:192` | Bắt buộc cho SFTP | không | **Không** |
| `SFTP_PASSWORD` | `server/lib/sftpFiles.js:194` | Bắt buộc cho SFTP | không | **Không** |
| `SFTP_DIRS` | `server/lib/sftpFiles.js:196-199` | Bắt buộc cho SFTP (tối đa 20 thư mục) | không | **Không** |
| `SFTP_HOSTKEY_SHA256` | `server/lib/sftpFiles.js:199-201` | Bắt buộc cho SFTP (chưa ghim → không chạy) | không | **Không** |
| `SFTP_SYNC_DAYS` | `server/lib/sftpSync.js:90` | Tùy chọn | 3 | **Không** |
| `SFTP_STABLE_SECONDS` | `server/lib/sftpSync.js:91` | Tùy chọn | 60 | **Không** |
| `SFTP_SYNC_ENABLED` | `server/lib/sftpScheduler.js:35` | Tùy chọn; chỉ `1` mới bật hẹn giờ | tắt | **Không** |
| `SFTP_SYNC_INTERVAL_MINUTES` | `server/lib/sftpScheduler.js:42` | Tùy chọn | 10 (2–1440) | **Không** |
| `SFTP_SYNC_MAX_FILES` | `server/lib/sftpScheduler.js:47` | Tùy chọn | 5 (1–1000) | **Không** |
| `ARRIVALS_DB` | **chỉ `scripts/*`** (vd `scripts/sftp-sync.js:45`); **server KHÔNG đọc** | — | `data/hue-dhcl.db` | Không |
| `HOST_PORT` | chỉ là biến thay thế của compose, app không đọc | — | 18060 | (dùng trong `compose:21`) |

Ghi chú: đường dẫn DB của **server** cố định `server/db.js:5` (`<app>/data/hue-dhcl.db`), không có biến ghi đè. Thư mục sao lưu không có biến (xem Việc 4).
`.env.example` khai báo đủ nhóm `SFTP_*` (`.env.example:19-40`) nhưng compose không chuyển chúng — đây là khoảng trống chính (CHẶN #1).

---
## Việc 3 — Múi giờ
Chỗ dùng **giờ cục bộ của tiến trình** (phụ thuộc `TZ`):
- `server/lib/napNguonDoc.js:35-36` (`ngayCuc`, `phutCuc` dùng `getFullYear/getHours…`), áp ở `:182-191,226` → «hôm nay», đợt SÁNG/CHIỀU, trạng thái `CHUA_DEN_GIO`/`CHO_FILE`.
- `server/lib/napNguonLay.js:193,200` (`ngayCuc`, `hom`) → giới hạn ngày khi «Lấy ngay/Lấy lại».
- `server/lib/arrivalsImport.js:512-515` (`localToday`) → phát hiện «thiếu đợt».
- `server/config/nap-nguon.js:8-10`: giờ mong đợi `09:30`/`16:30`, ranh giới `12:00` — chú thích nêu rõ «TZ phải là Asia/Ho_Chi_Minh khi triển khai».
- Hẹn giờ SFTP dùng `new Date()` (`server/lib/sftpScheduler.js:20`) nhưng chỉ cộng mili-giây/ISO UTC → không phụ thuộc TZ. «Từ ngày» của đồng bộ (SFTP_SYNC_DAYS) tính theo Asia/Bangkok cố định (`server/lib/sftpSync.js:127-129`) → không phụ thuộc TZ.

Chỗ dùng múi **cố định Asia/Bangkok** (không phụ thuộc TZ): `server/config/phat.js:94`, `server/lib/phat.js:160-166,766-791` (+7h cố định), `server/lib/sftpFiles.js:269`.
SQLite `CURRENT_TIMESTAMP` luôn UTC và mã chuyển đổi bằng cách thêm `Z` (`server/lib/napNguonDoc.js:47`, `server/lib/dashboardDenQuery.js:176`); không tìm thấy `'localtime'` trong `server/`.

Nếu container mặc định UTC: «hôm nay» lệch từ 00:00–07:00 giờ VN (ngày đổi chậm 7 giờ), giờ mong đợi 09:30/16:30 và ranh giới 12:00 so với giờ UTC → trạng thái
đợt, «thiếu đợt», giới hạn ngày Lấy ngay bị sai.
Kết luận: `TZ=Asia/Ho_Chi_Minh` **đã đặt ở cả Dockerfile (`:28`) và compose (`:20`)**; đủ cho các chỗ trên, **không cần sửa mã**. Lưu ý (chưa kiểm chứng): bookworm-slim có thể không có `tzdata`
hệ thống; Node dùng ICU nội bộ nên thường vẫn đúng — PO kiểm bằng `docker exec hue-dhcl node -e "console.log(new Date().toString())"` (xem mục «PO tự thử»).

---
## Việc 4 — Dữ liệu bền
| Dữ liệu | Đường dẫn trong container | Nằm trên volume? | Bằng chứng |
|---|---|---|---|
| DB `hue-dhcl.db` (+ `-wal`, `-shm`) | `/app/data/hue-dhcl.db` | **Có** (`./data:/app/data`) | `server/db.js:5,13` (WAL), `docker-compose.yml:15`, `Dockerfile:37` |
| `security.log` | `/app/data/security.log` | Có | `server/security.js:191` |
| Bản sao lưu trước «Thay thế ngày»/«Khôi phục» | `/app/data/backups/` (= thư mục DB + `backups`) | **Có** (nằm trong `data/`) | `server/lib/thayTheThucHien.js:427`, `server/lib/thayTheKhoiPhuc.js:169` |
| File tạm tải SFTP | `os.tmpdir()` = `/tmp` | **Không** (tạm, tự xoá; ephemeral chấp nhận được) | `server/lib/sftpSync.js:336`, `napNguonLay.js:170`, `thayTheXemTruoc.js:265` |
| `scripts/` (import-seed, sftp-sync, thay-the-ngay…) | — | **Không nằm trong image**: `.dockerignore:14` loại, Dockerfile không `COPY` | `Dockerfile:30-33` |

- Không tìm thấy file nào ghi ra ngoài `/app/data` và `/tmp`.
- **Không có script/cơ chế sao lưu định kỳ** trong mã (chỉ sao lưu tự động *trước* thao tác Thay thế/Khôi phục, giữ N bản gần nhất `thayTheThucHien.js:238-262`). Sao lưu định kỳ phải do Synology (Hyper Backup/Snapshot) làm — chưa có hướng dẫn trong repo (docs 06 chỉ mô tả sao lưu tay khi cập nhật).
- Rủi ro đã biết (chưa kiểm chứng trên NAS): SQLite WAL cần chia sẻ bộ nhớ (`-shm`, mmap) → **không** an toàn trên SMB/NFS; với bind-mount cục bộ ext4/Btrfs của `/volume1` thì bình thường. Docs đã nêu `-wal/-shm` phải sao lưu cùng DB (`06_DEPLOYMENT.md` mục 6).
  Snapshot Btrfs/Hyper Backup khi container đang chạy có thể bắt DB không nhất quán nếu thiếu `-wal`: cần dừng container hoặc dùng backup API (chưa kiểm chứng).

---
## Việc 5 — SFTP từ container
Lõi: `server/lib/sftpConnect.js` (nơi duy nhất nạp `ssh2-sftp-client`, `:22`, nạp lười) — chỉ `connect/list/get/end`; ghim vân tay bằng `hostVerifier` kiểm **trước** khi gửi mật khẩu (`:25-30`, `server/lib/sftpFiles.js:161-171`), so khớp hex SHA-256 của khoá máy chủ (`taoKiemTraKhoa`).

**(a)** Host lấy từ biến `SFTP_HOST` (`server/lib/sftpFiles.js:183`), cổng `SFTP_PORT` (mặc định **22**, `:186`; NAS dùng 5454 nên phải đặt), user/mật khẩu từ `SFTP_USER`/`SFTP_PASSWORD`, thư mục `SFTP_DIRS`.
**(b)** Không phụ thuộc `localhost`/IP máy dev: không có địa chỉ cứng trong `server/lib/sftp*.js` (kiểm: chỉ đọc từ `cfg.host`, `sftpConnect.js:28`). Không tìm thấy `localhost`/IP cố định ở lõi.
**(c)** Với `network_mode: host` (`compose:13`) container dùng chung ngăn xếp mạng NAS: `SFTP_HOST` có thể là `127.0.0.1` hoặc `10.47.31.8`, cổng **5454** (cùng `sshd`/SFTP của DSM). Khoá máy chủ là của dịch vụ SFTP của chính NAS nên **vân tay không đổi** dù dùng `127.0.0.1` hay `10.47.31.8`
(cùng một dịch vụ) — chưa kiểm chứng; PO nên lấy vân tay bằng đúng địa chỉ sẽ cấu hình. Địa chỉ cầu Docker (172.x) **không** dùng ở chế độ host (đã có docs `15_SFTP_SCHEDULER.md:72`). Nếu sau này đổi sang mạng bridge, phải dùng IP LAN của NAS hoặc `host.docker.internal`/gateway cầu và mở tường lửa DSM cho dải 172.x → 5454 (vi phạm giả định `CMS_ALLOWED_IPS` xem Việc 6).
**(d)** `ssh2-sftp-client` có trong `dependencies` của `main`: `package.json:24` (`"12.1.1"`) và `package-lock.json:24` + `:3608`. `npm ci` cài `dependencies` vào image; tầng chạy sao `node_modules` đã `prune --omit=dev` (`Dockerfile:20,30`) nên **có** trong image. (Sai lầm cũ «chỉ có ở phat1» không còn.) `ssh2` 1.17.0 `package-lock.json:3591`.
**(e)** Chỉ kiểm được trên NAS thật: (1) tường lửa DSM cho phép tiến trình/host-network tới cổng 5454 trên `127.0.0.1`/`10.47.31.8`; (2) tài khoản SFTP của NAS được phép đọc thư mục nguồn và đúng cổng 5454; (3) vân tay `SFTP_HOSTKEY_SHA256` đúng (lấy bằng `scripts/sftp-probe.js --show-fingerprint`, **script này không có trong image**); (4) quyền thư mục `/volume1/…` cho user SFTP; (5) DNS/route nếu dùng tên; (6) đồng hồ NAS/container (TZ); (7) hẹn giờ không đụng 2 container song song; (8) giới hạn băng thông/IO khi nạp.

---
## Việc 6 — Khởi tạo lần đầu và tài khoản
- **Tạo ADMIN đầu tiên khi DB trống: không có cách trong runtime.** `server/db.js` chỉ seed ô Dashboard mặc định (`server/db.js:104`), không seed `users`. Chỉ có `POST /api/users` (`server/routes/users.js:89-125`) nhưng yêu cầu `authRequired` + `requireAdmin` (`:89`) → vòng luẩn quẩn. Cách duy nhất trong repo: `scripts/import-seed.js` chép `users` từ DB hệ thống cũ (`scripts/import-seed.js:23`, đích `data/hue-dhcl.db`), chạy ngoài container (script bị loại khỏi image, `.dockerignore:14`). `06_DEPLOYMENT.md` mục 5 là quy trình hiện tại: tạo DB trên máy dev rồi **đưa file `.db` lên NAS**.
- Mật khẩu mặc định trong mã: **không tìm thấy** (`password_hash` chỉ sinh từ mật khẩu đầu vào, `server/auth.js:30-34`; tối thiểu 6 ký tự `users.js:96`). Mật khẩu ADMIN lấy từ DB cũ (giữ hash).
- `JWT_SECRET` thiếu → **từ chối khởi động** (`server/auth.js:15-21`); chỉ khi `ALLOW_INSECURE_DEV=1` mới dùng chuỗi mặc định công khai (`:17`) — compose không truyền biến này nên an toàn.
- `CMS_ALLOWED_IPS` mặc định: mã → `127.0.0.1,::1` (`server/security.js:22,185`); compose bắt buộc đặt (`:?`); `.env.example` gợi ý `127.0.0.1,10.47.0.0/16` (`:10`). `*` cho mọi IP (`:25-26` cảnh báo).
- `/api/organization/*`: 2 GET chỉ đọc `communes`/`post-offices` (`server/routes/organization.js:10,25`), có token (qua middleware `/api` ở `server/index.js:41-44`) nhưng **không có `requireRoles`** → mọi vai trò (kể cả TIVI nếu allowlist `server/lib/tivi.js` cho phép — chưa kiểm) đọc được toàn bộ danh mục. Và `res.status(500).json({ error: error.message })` lộ thông điệp lỗi nội bộ (`:21,42`). Cần PO xem lại.
- Tài khoản thử `staff_test`, `tv`, `tv533140`: **không tìm thấy** trong `server/`, `scripts/`, `src/`, `tests/`, `docs/` ở `1e33327` (`grep`). Có thể tồn tại **trong DB** (không đọc DB theo điều cấm) → PO cần kiểm danh sách người dùng trước khi cho dùng thật.

---
## Việc 7 — Bảo mật và cổng (ghi quan sát)
- HTTPS: server chỉ nghe HTTP (`server/index.js:78`), không có TLS/HSTS trong mã. Wake Lock tivi cần ngữ cảnh an toàn: `src/components/TiviView.jsx:172` («không hỗ trợ hoặc không HTTPS»). Trên `http://10.47.31.8:18060` (IP LAN, không phải localhost) Wake Lock **không** hoạt động → cần reverse proxy HTTPS của DSM + chứng chỉ (nội bộ) tin cậy trên tivi (chưa kiểm chứng).
- Reverse proxy DSM (Login Portal → Reverse Proxy) đặt trước cổng 18060: khi đó `remoteAddress` của app là IP proxy; phải đặt `TRUSTED_PROXIES` (`server/security.js:188-189,73-90`) **và** compose phải truyền biến này (hiện KHÔNG) và `CMS_ALLOWED_IPS` phải gồm IP máy khách thật. Nếu không → hoặc mọi người bị chặn (404) hoặc `X-Forwarded-For` bị bỏ qua (lọc IP chỉ thấy IP proxy, nhật ký đăng nhập sai IP).
- CORS: không bật (`server/index.js:30-31`; `cors` có trong `package.json` nhưng không dùng — `grep` không thấy `require('cors')` ở `server/index.js`).
- Token: JWT lưu `localStorage` khóa `dhcl_auth_token` (`src/utils/api.js:14,26`), gửi qua header `Authorization: Bearer` (`server/auth.js:94`); không dùng cookie (không tìm thấy `Set-Cookie`). Hạn `JWT_EXPIRY` 8h, TIVI 90 ngày (`server/auth.js:23-25,67-69`).
- Header: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `COOP` (`server/security.js:51-58`); **chưa có CSP** cho app chính (`:48-50`).
- Giới hạn đăng nhập: 5 lần/15 phút/tài khoản-IP và `LOGIN_IP_MAX_FAILS` (20) (`server/routes/auth.js:21-24`).

---
## Việc 8 — Kết luận: bảng việc phải làm
| # | Mức | Việc | File liên quan | Cỡ |
|---|---|---|---|---|
| 1 | **CHẶN** (cho SFTP/Nạp nguồn) | Truyền `SFTP_*`, `SFTP_SYNC_*` vào container (`env_file: .env` hoặc liệt kê trong `environment`); hiện `.env` không vào container | `docker-compose.yml:16-21`, `.dockerignore:8-9`, `.env.example` | nhỏ |
| 2 | **CHẶN** | Cách tạo ADMIN/DB ban đầu trên NAS: runtime không có; cần quy trình chắc chắn (DB dựng sẵn từ dev, hoặc cơ chế bootstrap ADMIN một lần) — nếu không, đăng nhập được 0 người | `server/db.js:104`, `server/routes/users.js:89`, `scripts/import-seed.js:23`, `06_DEPLOYMENT.md` mục 5 | vừa |
| 3 | **CHẶN** | Xác nhận build thật: `better-sqlite3` prebuilt với `--ignore-scripts` và `ssh2` (`cpu-features` tùy chọn) chạy được trên bookworm-slim x86_64 | `Dockerfile:14` | nhỏ (chạy thử) |
| 4 | **CHẶN** (nếu dùng HTTPS/proxy) | Thêm `TRUSTED_PROXIES` vào compose + cấu hình `CMS_ALLOWED_IPS` đúng khi có reverse proxy | `docker-compose.yml:16-21`, `server/security.js:188` | nhỏ |
| 5 | **CHẶN** | Cấu hình `SFTP_PORT=5454` + `SFTP_HOST` + `SFTP_HOSTKEY_SHA256` thật; mặc định cổng là 22 | `server/lib/sftpFiles.js:186`, `.env.example:20` | nhỏ (PO) |
| 6 | NÊN | Sao lưu định kỳ DB + `-wal` (Hyper Backup/Snapshot) và hướng dẫn nhất quán khi đang chạy; chưa có trong mã | `docs/ai/06_DEPLOYMENT.md`, `server/lib/thayTheThucHien.js:238` | vừa |
| 7 | NÊN | Truyền thêm `JWT_EXPIRY`, `JWT_EXPIRY_TIVI`, `LOGIN_IP_MAX_FAILS` (docs nói có thể đặt qua `.env` nhưng compose không chuyển) | `docker-compose.yml`, `server/auth.js:23-25` | nhỏ |
| 8 | NÊN | HTTPS cho tivi (Wake Lock): reverse proxy DSM + chứng chỉ | `src/components/TiviView.jsx:172` | vừa (PO + DSM) |
| 9 | NÊN | Rà tài khoản thử `staff_test`/`tv`/`tv533140` trong DB trước khi đưa dữ liệu lên NAS | DB | nhỏ (PO) |
| 10 | NÊN | `/api/organization/*` thiếu `requireRoles` và lộ `error.message`; xem lại phạm vi vai trò | `server/routes/organization.js:10,25` | nhỏ |
| 11 | NÊN | Cho phép đặt đường dẫn DB bằng biến (hiện cố định `data/hue-dhcl.db`; `ARRIVALS_DB` chỉ cho script) — để gắn volume ở nơi khác / thống nhất script | `server/db.js:5` | nhỏ |
| 12 | NÊN | Đưa `scripts/` cần dùng vận hành (thay-the-ngay, sftp-probe, import-seed) vào image hoặc image công cụ; hiện không chạy được trong container | `.dockerignore:14`, `Dockerfile:30-33` | vừa |
| 13 | TÙY CHỌN | Thêm `HEALTHCHECK` vào Dockerfile (hiện chỉ ở compose); chạy user thường; CSP; gỡ phụ thuộc `cors` | `Dockerfile`, `server/security.js:48` | nhỏ |
| 14 | TÙY CHỌN | Kiểm `tzdata` hệ thống trong image (chỉ để `date` trong `docker exec` đúng giờ) | `Dockerfile:23-28` | nhỏ |

### Đề xuất chia ticket sửa (tối đa 3)
1. **NAS-2 — Cấu hình chạy được trên NAS**: compose truyền đủ biến (`env_file`/`environment`: `SFTP_*`, `SFTP_SYNC_*`, `TRUSTED_PROXIES`, `JWT_EXPIRY*`, `LOGIN_IP_MAX_FAILS`), cập nhật `.env.example` + `06_DEPLOYMENT.md`, thêm biến đường dẫn DB. (mục 1, 4, 5, 7, 11)
2. **NAS-3 — Khởi tạo & vận hành**: cách tạo ADMIN/DB ban đầu trong container (hoặc đưa script cần thiết vào image công cụ), quy trình sao lưu định kỳ có WAL, rà `/api/organization/*`. (mục 2, 6, 10, 12)
3. **NAS-4 — HTTPS & kiểm tra thật trên NAS**: proxy DSM + `TRUSTED_PROXIES` + Wake Lock, danh sách thử nghiệm dưới đây. (mục 3, 8, 13, 14)

---
## PO tự thử trên NAS thật
1. `docker compose build` (hoặc Container Manager → Build) thành công; container `healthy`.
2. Mở `http://10.47.31.8:18060` từ máy trong dải `CMS_ALLOWED_IPS`; từ máy ngoài dải phải thấy 404.
3. Đăng nhập bằng tài khoản ADMIN từ DB đã đưa lên; kiểm danh sách người dùng có `staff_test`/`tv`/`tv533140` không.
4. `docker exec hue-dhcl node -e "console.log(new Date().toString(), process.env.TZ)"` → giờ VN.
5. Container có thấy `SFTP_*` không (sau NAS-2); thử «Lấy ngay» ở màn Nạp dữ liệu nguồn với `SFTP_HOST=127.0.0.1` rồi `10.47.31.8`, cổng 5454: có tới được không, vân tay có khớp không.
6. Tường lửa DSM: rule cho cổng 18060 và (nếu dùng IP LAN) 5454.
7. Khởi động lại container rồi kiểm DB còn nguyên; kiểm `data/hue-dhcl.db-wal` nằm trên volume.
8. HTTPS qua reverse proxy DSM: tivi mở trang, Wake Lock hoạt động; `security.log` ghi IP máy khách thật (không phải IP proxy).
9. Dừng container → Hyper Backup/Snapshot `data/` → khôi phục thử ra thư mục khác và mở được DB.
