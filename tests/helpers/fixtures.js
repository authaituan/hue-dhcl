// ==========================================
// Seed dữ liệu tối thiểu cần thiết cho test (org tree tối giản + user).
// Dùng chính schema thật (đi qua db handle được trả về từ serverHarness,
// tức là CÙNG connection mà server/index.js đang dùng).
// ==========================================
'use strict';
const path = require('path');
const crypto = require('crypto');
const { SERVER_DIR } = require('./serverHarness');
const { hashPassword } = require(path.join(SERVER_DIR, 'auth.js'));
// Vai trò hợp lệ lấy từ server/roles.js (một nơi định nghĩa) — test không viết lại chuỗi vai trò rải rác.
const { ROLES } = require(path.join(SERVER_DIR, 'roles.js'));

function uid() {
  return crypto.randomUUID();
}

// Seed 1 nhánh tổ chức tối thiểu: 1 tỉnh -> 1 BĐX -> 1 bưu cục.
function seedMinimalOrg(db) {
  const provinceId = uid();
  const communeId = uid();
  const postOfficeId = uid();
  const provinceCode = 'TESTP';
  const communeCode = 'TESTC';
  const postOfficeCode = 'TESTPO';

  db.prepare(`INSERT INTO province_post_offices (id, code, name) VALUES (?, ?, ?)`)
    .run(provinceId, provinceCode, 'Tỉnh Test');
  db.prepare(`INSERT INTO commune_post_offices (id, code, name, province_id) VALUES (?, ?, ?, ?)`)
    .run(communeId, communeCode, 'BĐX Test', provinceId);
  db.prepare(`INSERT INTO post_offices (id, code, name, commune_id) VALUES (?, ?, ?, ?)`)
    .run(postOfficeId, postOfficeCode, 'Bưu cục Test', communeId);

  return { provinceId, communeId, postOfficeId, provinceCode, communeCode, postOfficeCode };
}

// Seed 1 user với password_hash thật (role: một trong ROLES — ADMIN, TTVH, GDVH, TIVI; test vai trò cũ/lạ truyền chuỗi thẳng) (dùng hashPassword thật từ server/auth.js)
// để login qua route /api/auth/login thật lấy JWT thật.
function seedUser(db, { hrmCode, fullName, role, password }) {
  const id = uid();
  db.prepare(`INSERT INTO users (id, hrm_code, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(id, hrmCode, fullName, role, hashPassword(password));
  return id;
}

// Đăng nhập qua /api/auth/login thật, trả { status, body }.
async function loginAs(baseUrl, hrmCode, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hrm_code: hrmCode, password })
  });
  return { status: res.status, body: await res.json() };
}

module.exports = { seedMinimalOrg, seedUser, loginAs, uid, ROLES };
