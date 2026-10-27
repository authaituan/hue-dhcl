// ==========================================
// «Hàng tại KTT» (KTT-8): TÁC VỤ NẶNG chạy NỀN trong một worker_thread riêng (kttApi.js) để máy chủ không bị đứng khi tính khoảng ngày lớn:
//   tongHop (kttQuery.tongHopKtt + kttDanhGia.taoDanhGia), chiTietCu (kttQuery.chiTiet), chiTietLuuThoat (kttLuuThoatQuery.danhSachLuuThoat).
// Worker mở kết nối CHỈ ĐỌC riêng tới cùng file DB (WAL: đọc không chặn ghi). File này vừa là module (xuất TAC_VU để chạy thẳng trong tiến trình chính khi không dùng worker,
// ví dụ DB trong bộ nhớ) vừa là điểm vào của worker. Không ghi DB, không in dữ liệu.
// ==========================================
'use strict';
const { isMainThread, parentPort } = require('worker_threads');
const Q = require('./kttQuery');
const QL = require('./kttLuuThoatQuery');
const { taoDanhGia } = require('./kttDanhGia');
const X = require('./kttXuat');

const TAC_VU = Object.freeze({
  tongHop: (db, a) => { const th = Q.tongHopKtt(db, a); return { ...th, danh_gia: taoDanhGia(th) }; },
  chiTietCu: (db, a) => Q.chiTiet(db, a),
  chiTietLuuThoat: (db, a) => QL.danhSachLuuThoat(db, a),
  xuatLuuThoat: (db, a) => X.xuatLuuThoat(db, a) // KTT-8b: toàn bộ SHBG (không phân trang) cho file xlsx
});

if (!isMainThread && parentPort) {
  const Database = require('better-sqlite3');
  const ketNoi = new Map();
  parentPort.on('message', (m) => {
    try {
      let db = ketNoi.get(m.duongDan);
      if (!db) { db = new Database(m.duongDan, { readonly: true, fileMustExist: true }); ketNoi.set(m.duongDan, db); }
      parentPort.postMessage({ id: m.id, ok: true, kq: TAC_VU[m.ten](db, m.args) });
    } catch (e) {
      parentPort.postMessage({ id: m.id, ok: false, loi: { code: e && e.code ? String(e.code) : null, message: e && e.message ? String(e.message) : 'Lỗi', ten: e && e.name ? String(e.name) : 'Error' } });
    }
  });
}

module.exports = { TAC_VU };
