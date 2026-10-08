const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { parseFloatOrNull } = require('./helpers');

// ==========================================
// HELPER TỔ CHỨC DÙNG CHUNG (province -> commune -> post_office)
// ------------------------------------------------------------------
// "Quản Lý Mạng Lưới" là danh mục chuẩn BẮT BUỘC (kế thừa từ it-assets v1.0.0).
// CHỈ route Quản Lý Mạng Lưới (POST /api/network/import, PUT
// /api/network/post-offices/:id) mới được tạo mới Tỉnh/BĐX/Bưu cục.
// ==========================================

// resolveOrCreateOrgChain: logic tự tạo Tỉnh->BĐX->Bưu cục, lưu đủ các cột của
// post_offices (old_ward_*, district_name, new_ward_*, phone,
// operational_status, latitude, longitude). CHỈ dùng cho "Quản Lý Mạng Lưới".
// Mutate `report` (tăng provincesCreated/communesCreated/postOfficesCreated/
// postOfficesUpdated nếu report có các field đó). Trả về { province, commune, postOffice }.
// PHẢI gọi bên trong 1 db.transaction() để rollback nếu 1 dòng lỗi.
function resolveOrCreateOrgChain(row, report, rowNum) {
  // --- Tỉnh/Thành phố ---
  const maBdtTp = (row.maBdtTp || '').trim();
  const tenBdtTp = (row.tenBdtTp || '').trim();
  let province = null;
  if (maBdtTp) {
    province = db.prepare("SELECT * FROM province_post_offices WHERE code = ?").get(maBdtTp);
    if (!province) {
      const pid = uuidv4();
      db.prepare("INSERT INTO province_post_offices (id, code, name) VALUES (?, ?, ?)")
        .run(pid, maBdtTp, tenBdtTp || maBdtTp);
      province = { id: pid, code: maBdtTp, name: tenBdtTp || maBdtTp };
      if (typeof report.provincesCreated === 'number') report.provincesCreated++;
    } else if (tenBdtTp && province.name !== tenBdtTp) {
      db.prepare("UPDATE province_post_offices SET name = ? WHERE id = ?").run(tenBdtTp, province.id);
      province.name = tenBdtTp;
    }
  }

  // --- Bưu điện Xã (BĐX / commune) ---
  const maBdx = (row.maBdx || '').trim();
  const tenBuuDienXa = (row.tenBuuDienXa || '').trim();
  const buuDienXaTrungTam = (row.buuDienXaTrungTam || '').trim() || null;
  let commune = null;
  if (maBdx) {
    commune = db.prepare("SELECT * FROM commune_post_offices WHERE code = ?").get(maBdx);
    if (!commune) {
      if (!province) {
        throw new Error(`Dòng ${rowNum}: BĐX "${maBdx}" chưa tồn tại và thiếu maBdtTp để tạo mới`);
      }
      const cid = uuidv4();
      db.prepare("INSERT INTO commune_post_offices (id, code, name, central_commune_code, province_id) VALUES (?, ?, ?, ?, ?)")
        .run(cid, maBdx, tenBuuDienXa || maBdx, buuDienXaTrungTam, province.id);
      commune = { id: cid, code: maBdx, name: tenBuuDienXa || maBdx };
      if (typeof report.communesCreated === 'number') report.communesCreated++;
    } else if (tenBuuDienXa && commune.name !== tenBuuDienXa) {
      db.prepare("UPDATE commune_post_offices SET name = ? WHERE id = ?").run(tenBuuDienXa, commune.id);
      commune.name = tenBuuDienXa;
    }
  }

  // --- Bưu cục (MBC / post_office) + 9 cột mới ---
  const maMbc = (row.maMbc || '').trim();
  const tenBuuCuc = (row.tenBuuCuc || '').trim();
  // Giá trị các field (rỗng -> null), dùng chung cho INSERT (create) và UPDATE.
  const nf = {
    type: (row.loai || '').trim() || null,
    address: (row.diaChiChiTiet || '').trim() || null,
    bdkv_code: (row.maBdkv || '').trim() || null,
    bdkv_name: (row.tenBdkv || '').trim() || null,
    old_ward_code: (row.maPhuongXaCu || '').trim() || null,
    old_ward_name: (row.tenPhuongXaCu || '').trim() || null,
    district_name: (row.tenQuanHuyen || '').trim() || null,
    new_ward_code: (row.maPhuongXaMoi || '').trim() || null,
    new_ward_name: (row.tenPhuongXaMoi || '').trim() || null,
    phone: (row.soDienThoai || '').trim() || null,
    operational_status: (row.tinhTrangHoatDong || '').trim() || null,
    latitude: parseFloatOrNull(row.viDo),
    longitude: parseFloatOrNull(row.kinhDo)
  };
  // Người Phụ Trách bưu cục (resolve theo mã HRM -> users.id). undefined = không
  // đụng tới field này (giữ nguyên khi UPDATE, null khi CREATE).
  const maHrmPhuTrach = (row.maHrmNguoiPhuTrach || '').trim();
  let resolvedResponsibleUserId; // undefined = không có trong dòng import
  if (maHrmPhuTrach) {
    const ru = db.prepare("SELECT id FROM users WHERE hrm_code = ?").get(maHrmPhuTrach);
    if (!ru) throw new Error(`Dòng ${rowNum}: maHrmNguoiPhuTrach "${maHrmPhuTrach}" không tồn tại trong hệ thống`);
    resolvedResponsibleUserId = ru.id;
  }

  let postOffice = db.prepare("SELECT * FROM post_offices WHERE code = ?").get(maMbc);
  if (!postOffice) {
    if (!commune) {
      throw new Error(`Dòng ${rowNum}: bưu cục "${maMbc}" chưa tồn tại và thiếu maBdx để tạo mới`);
    }
    const poid = uuidv4();
    db.prepare(`
      INSERT INTO post_offices
        (id, code, name, type, address, commune_id, bdkv_code, bdkv_name,
         old_ward_code, old_ward_name, district_name, new_ward_code, new_ward_name,
         phone, operational_status, latitude, longitude, responsible_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      poid, maMbc, tenBuuCuc || maMbc, nf.type || 'GD3', nf.address, commune.id,
      nf.bdkv_code, nf.bdkv_name, nf.old_ward_code, nf.old_ward_name, nf.district_name,
      nf.new_ward_code, nf.new_ward_name, nf.phone, nf.operational_status || 'ACTIVE',
      nf.latitude, nf.longitude, resolvedResponsibleUserId || null
    );
    postOffice = db.prepare("SELECT * FROM post_offices WHERE id = ?").get(poid);
    if (typeof report.postOfficesCreated === 'number') report.postOfficesCreated++;
  } else {
    // CẬP NHẬT: chỉ ghi đè field có giá trị KHÔNG RỖNG trong dòng import (giữ
    // nguyên field vắng mặt) — nguyên tắc "import theo trường cần thiết".
    db.prepare(`
      UPDATE post_offices SET
        name = ?, type = ?, address = ?, bdkv_code = ?, bdkv_name = ?,
        old_ward_code = ?, old_ward_name = ?, district_name = ?, new_ward_code = ?,
        new_ward_name = ?, phone = ?, operational_status = ?, latitude = ?, longitude = ?,
        responsible_user_id = ?
      WHERE id = ?
    `).run(
      tenBuuCuc || postOffice.name,
      nf.type || postOffice.type,
      nf.address || postOffice.address,
      nf.bdkv_code || postOffice.bdkv_code,
      nf.bdkv_name || postOffice.bdkv_name,
      nf.old_ward_code || postOffice.old_ward_code,
      nf.old_ward_name || postOffice.old_ward_name,
      nf.district_name || postOffice.district_name,
      nf.new_ward_code || postOffice.new_ward_code,
      nf.new_ward_name || postOffice.new_ward_name,
      nf.phone || postOffice.phone,
      nf.operational_status || postOffice.operational_status,
      nf.latitude !== null ? nf.latitude : postOffice.latitude,
      nf.longitude !== null ? nf.longitude : postOffice.longitude,
      resolvedResponsibleUserId !== undefined ? resolvedResponsibleUserId : postOffice.responsible_user_id,
      postOffice.id
    );
    postOffice = db.prepare("SELECT * FROM post_offices WHERE id = ?").get(postOffice.id);
    if (typeof report.postOfficesUpdated === 'number') report.postOfficesUpdated++;
  }

  return { province, commune, postOffice };
}

module.exports = { resolveOrCreateOrgChain };
