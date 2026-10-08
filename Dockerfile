# ==========================================
# hue-dhcl — image cho Synology Container Manager (DS920+, x86_64).
# 2 tầng, cùng base để module native better-sqlite3 khớp libc khi sao chép node_modules.
# ==========================================

# ---------- Tầng build: cài phụ thuộc + build giao diện (dist/) ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 đã kèm sẵn file prebuilt (prebuilds/linux-x64.node) nên không cần node-gyp
# (cùng lý do với `npm ci --ignore-scripts` ở 06_DEPLOYMENT.md mục 2b).
# Nếu sau này prebuilt better-sqlite3 không khớp: thêm lại bước cài python3 make g++ và bỏ --ignore-scripts.
RUN npm ci --ignore-scripts

COPY index.html vite.config.mjs ./
COPY public ./public
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- Tầng chạy ----------
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    TZ=Asia/Ho_Chi_Minh

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 5000
# DB (hue-dhcl.db) và security.log nằm ở /app/data — gắn bind-mount từ máy chủ để không mất dữ liệu khi cập nhật image.
VOLUME ["/app/data"]

# Chạy bằng root (CỐ Ý): bind-mount thư mục data trên Synology thường thuộc user của NAS; chạy user thường
# trong container hay bị lỗi quyền ghi SQLite (-wal/-shm). Mạng nội bộ, không public, nên chấp nhận.
CMD ["node", "server/index.js"]
