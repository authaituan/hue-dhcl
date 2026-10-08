import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        // Gửi kèm IP thật của máy khách (X-Forwarded-For) để backend lọc IP
        // đúng khi truy cập qua Vite (dev :3000 / preview). Backend chỉ tin
        // header này khi TRUSTED_PROXIES có 127.0.0.1 — xem server/security.js.
        xfwd: true
      }
    }
  }
});
