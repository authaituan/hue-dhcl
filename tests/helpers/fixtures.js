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

// Seed 1 user với password_hash thật (dùng hashPassword thật từ server/auth.js)
// để login qua route /api/auth/login thật lấy JWT thật.
function seedUser(db, { hrmCode, fullName, role, password }) {
  const id = uid();
  db.prepare(`INSERT INTO users (id, hrm_code, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(id, hrmCode, fullName, role, hashPassword(password));
  return id;
}

module.exports = { seedMinimalOrg, seedUser, uid };
