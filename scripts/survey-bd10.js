#!/usr/bin/env node
// ==========================================
// Khảo sát CHỈ ĐỌC dữ liệu "Hàng đến" ở mức BD10 (SANLUONG-4a4): "BD10 đến không XNĐ".
//
//   node scripts/survey-bd10.js [--db <đường-dẫn-DB>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//
// Mở DB ở chế độ `readonly` (không ghi được); từ chối mọi cờ có ý ghi (--apply, --write, --vacuum…). Nên chạy trên BẢN CHÉP DB.
// Chỉ in số đếm / tỉ lệ / bảng tổng hợp; số hiệu chỉ lộ tiền tố BD10 6 chữ số — KHÔNG in SHBG, BD8, BD10 đầy đủ.
// Không đổi bất kỳ chỉ số nào của app (đây là công cụ khảo sát để PO chốt định nghĩa).
//
// Quy ước:
//   BD10 = các dòng cùng So_hieu_BD10 (khác rỗng). Ngày đến của BD10 = ngày của MIN(arrival_at) trên các dòng của nó; BD10 mà mọi dòng đều
//   không có arrival_at → "không có ngày đến" (đếm riêng, không nằm trong khung ngày).
//   Dòng "đủ" = có cả XN túi (bag_confirmed_at) và XN BG (item_confirmed_at). XNĐ = bd10_confirmed_at.
//   Hàng đi ngoài = dòng có So_hieu_BD8 trùng SHBG (BD8 chính là SHBG).
//   Nhóm: 530100 (chuyến thư từ TTKT) / khác 530100 (tiền tố 6 số đầu của BD10).
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TTKT = '530100';
const USAGE = 'Cách dùng: node scripts/survey-bd10.js [--db <DB>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]';
const WRITE_FLAGS = ['--apply', '--write', '--vacuum', '--fix', '--delete', '--reset'];

function parseArgs(argv) {
  const out = { db: null, from: '2026-10-01', to: '2026-10-09' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.includes(a)) throw new Error(`Script khảo sát chỉ đọc, không nhận cờ ghi: ${a}`);
    if (a === '--db' || a === '--from' || a === '--to') out[a.slice(2)] = argv[++i];
    else throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
  }
  for (const k of ['from', 'to']) if (!/^\d{4}-\d{2}-\d{2}$/.test(out[k])) throw new Error(`--${k} phải dạng YYYY-MM-DD`);
  return out;
}

// ---------- tiện ích in ----------
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
function table(title, head, rows) {
  console.log(`\n### ${title}`);
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${r.map((c) => (typeof c === 'number' ? fmt(c) : c)).join(' | ')} |`);
}
const quant = (arr) => {
  if (!arr.length) return ['–', '–', '–', '–'];
  const s = arr.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return [fmt(s[0]), fmt(q(0.5)), fmt(q(0.9)), fmt(s[s.length - 1])];
};
const minOf = (xs) => xs.reduce((m, x) => (x && (m === null || x < m) ? x : m), null);

// ---------- nạp dữ liệu ----------
function loadRows(db) {
  return db.prepare(`SELECT id, tracking_no AS trk, bd10_no AS b10, bd8_no AS b8, bag_confirmed_at AS bag, item_confirmed_at AS itm,
    bd10_confirmed_at AS xnd, arrival_at AS arr, arrival_date AS day, weight_g AS wg, ward_name AS ward, province_name AS prov, service_code AS svc, import_file_id AS fid, receiver_code AS rc
    FROM arrival_items`).all().map((r) => ({ ...r, full: !!(r.bag && r.itm), diNgoai: r.b8 !== '' && r.b8 === r.trk }));
}

function buildBd10(rows, { dropDiNgoai = false } = {}) {
  const map = new Map();
  for (const r of rows) {
    if (r.b10 === '' || (dropDiNgoai && r.diNgoai)) continue;
    if (!map.has(r.b10)) map.set(r.b10, []);
    map.get(r.b10).push(r);
  }
  return [...map.entries()].map(([b10, rs]) => {
    const arr = minOf(rs.map((r) => r.arr));
    const full = rs.filter((r) => r.full).length;
    const withXnd = rs.filter((r) => r.xnd).length;
    const vals = new Set(rs.filter((r) => r.xnd).map((r) => r.xnd));
    const prefix = b10.slice(0, 6);
    return {
      b10, prefix, grp: prefix === TTKT ? '530100' : 'khac', rs, n: rs.length, shbg: new Set(rs.map((r) => r.trk)).size,
      arr, day: arr ? arr.slice(0, 10) : null,
      full, allFull: full === rs.length, someFull: full > 0 && full < rs.length, noneFull: full === 0,
      withXnd, vals,
      xndClass: withXnd === 0 ? 'iv' : withXnd < rs.length ? 'iii' : vals.size === 1 ? 'i' : 'ii',
      firstBagItem: minOf(rs.flatMap((r) => [r.bag, r.itm])),
      own: prefix === rs[0].rc, // BD10 do CHÍNH BCVH nhận lập (tiền tố = mã BCVH nhận)
      daySpread: new Set(rs.map((r) => r.day).filter(Boolean)).size,
      diNgoaiRows: rs.filter((r) => r.diNgoai).length
    };
  });
}

function countAB(list) {
  const arrivedA = list.filter((b) => b.full > 0); // BD10 "đến" (cách A): ≥1 dòng đủ túi + BG
  const a = arrivedA.filter((b) => b.withXnd === 0);
  const arrivedB = list.filter((b) => b.allFull);
  const bb = arrivedB.filter((b) => b.withXnd === 0);
  return { total: list.length, arrivedA: arrivedA.length, a: a.length, arrivedB: arrivedB.length, b: bb.length, aList: a };
}

// ---------- chính ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(args.db || process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}`);
  const db = new Database(dbPath, { fileMustExist: true, readonly: true });
  if (!db.readonly) throw new Error('DB không ở chế độ chỉ đọc — dừng.');
  try {
    const rows = loadRows(db);
    const latestFile = db.prepare("SELECT MAX(file_date) AS d FROM arrival_import_files WHERE status = 'OK'").get().d;
    const { from, to } = args;
    const inFrame = (b) => b.day !== null && b.day >= from && b.day <= to;
    console.log(`# Khảo sát BD10 — DB: ${path.basename(dbPath)} (chỉ đọc)`);
    console.log(`Khung: BD10 có ngày đến (min arrival_at) từ ${from} đến ${to}; dữ liệu mới nhất (file OK): ${latestFile}. Tổng dòng: ${fmt(rows.length)}; SHBG khác nhau: ${fmt(new Set(rows.map((r) => r.trk)).size)}.`);

    const all = buildBd10(rows);
    const frame = all.filter(inFrame);
    const outside = all.filter((b) => !inFrame(b) && b.day !== null);
    const noDay = all.filter((b) => b.day === null);
    table('0. Khung ngày', ['Tập BD10', 'Số BD10', 'Số dòng', 'Số SHBG (cộng theo BD10)'], [
      ['Trong khung', frame.length, frame.reduce((a, b) => a + b.n, 0), frame.reduce((a, b) => a + b.shbg, 0)],
      ['Ngoài khung (có ngày đến)', outside.length, outside.reduce((a, b) => a + b.n, 0), outside.reduce((a, b) => a + b.shbg, 0)],
      ['Không có ngày đến (mọi dòng không có arrival_at)', noDay.length, noDay.reduce((a, b) => a + b.n, 0), noDay.reduce((a, b) => a + b.shbg, 0)]
    ]);
    if (outside.length) console.log(`Ngoài khung theo ngày: ${Object.entries(outside.reduce((m, b) => ((m[b.day] = (m[b.day] || 0) + 1), m), {})).sort().map(([d, n]) => `${d}: ${n} BD10`).join('; ')}`);

    // ---- 1. Quy mô ----
    const q1 = quant(frame.map((b) => b.n));
    const q1s = quant(frame.map((b) => b.shbg));
    table('1. Quy mô (trong khung)', ['Chỉ số', 'Giá trị'], [
      ['Số BD10 khác nhau', frame.length],
      ['Số dòng mỗi BD10: min / trung vị / p90 / max', q1.join(' / ')],
      ['Số SHBG khác nhau mỗi BD10: min / trung vị / p90 / max', q1s.join(' / ')],
      ['Số dòng trung bình mỗi BD10', (frame.reduce((a, b) => a + b.n, 0) / (frame.length || 1)).toFixed(1)],
      ['Số BD8 khác nhau (toàn DB, BD8 ≠ rỗng)', new Set(rows.filter((r) => r.b8).map((r) => r.b8)).size]
    ]);
    const byPrefix = new Map();
    for (const b of frame) {
      if (!byPrefix.has(b.prefix)) byPrefix.set(b.prefix, []);
      byPrefix.get(b.prefix).push(b);
    }
    const prefRows = [...byPrefix.entries()].sort((x, y) => y[1].length - x[1].length).map(([p, list]) => {
      const c = countAB(list);
      return [p === TTKT ? `${p} (TTKT)` : p, list.length, new Set(list.flatMap((b) => b.rs.map((r) => r.trk))).size, list.reduce((a, b) => a + b.n, 0), c.arrivedA, c.a, pct(c.a, c.arrivedA)];
    });
    table('1b. Theo tiền tố 6 số đầu của BD10 (trong khung)', ['Tiền tố', 'Số BD10', 'Số SHBG', 'Số dòng', 'BD10 đến (A)', 'BD10 đến không XNĐ (A)', 'Tỉ lệ A'], prefRows);
    const grpRows = ['530100', 'khac'].map((g) => {
      const list = frame.filter((b) => b.grp === g);
      return [g === 'khac' ? 'Khác 530100 (gộp)' : '530100', list.length, new Set(list.flatMap((b) => b.rs.map((r) => r.trk))).size, list.reduce((a, b) => a + b.n, 0)];
    });
    table('1c. Hai nhóm', ['Nhóm', 'Số BD10', 'Số SHBG', 'Số dòng'], grpRows);

    // ---- 2. Mốc trong từng BD10 ----
    const xnLabel = { all: '(a) mọi dòng đủ XN túi + XN BG', some: '(b) một phần dòng đủ', none: '(c) không dòng nào đủ' };
    const xndLabel = { i: '(i) mọi dòng có XNĐ, cùng một giá trị', ii: '(ii) mọi dòng có XNĐ, khác giá trị', iii: '(iii) một phần dòng có XNĐ', iv: '(iv) không dòng nào có XNĐ' };
    const cls = (b) => (b.allFull ? 'all' : b.someFull ? 'some' : 'none');
    const t2 = [];
    for (const g of ['tổng', '530100', 'khac']) {
      const list = g === 'tổng' ? frame : frame.filter((b) => b.grp === g);
      for (const k of ['all', 'some', 'none']) t2.push([g === 'khac' ? 'khác 530100' : g, xnLabel[k], list.filter((b) => cls(b) === k).length, pct(list.filter((b) => cls(b) === k).length, list.length)]);
    }
    table('2a. XN túi + XN BG trong từng BD10', ['Nhóm', 'Loại', 'Số BD10', 'Tỉ lệ'], t2);
    const t2b = [];
    for (const g of ['tổng', '530100', 'khac']) {
      const list = g === 'tổng' ? frame : frame.filter((b) => b.grp === g);
      for (const k of ['i', 'ii', 'iii', 'iv']) t2b.push([g === 'khac' ? 'khác 530100' : g, xndLabel[k], list.filter((b) => b.xndClass === k).length, pct(list.filter((b) => b.xndClass === k).length, list.length)]);
    }
    table('2b. XNĐ BD10 trong từng BD10', ['Nhóm', 'Loại', 'Số BD10', 'Tỉ lệ'], t2b);
    const mat = [];
    for (const k of ['all', 'some', 'none']) mat.push([xnLabel[k], ...['i', 'ii', 'iii', 'iv'].map((x) => frame.filter((b) => cls(b) === k && b.xndClass === x).length)]);
    table('2c. Bảng chéo (tổng): XN túi + BG × XNĐ', ['XN túi + BG \\ XNĐ', '(i) cùng giá trị', '(ii) khác giá trị', '(iii) một phần', '(iv) không có'], mat);
    const ii = frame.filter((b) => b.xndClass === 'ii');
    const spread = ii.map((b) => { const v = [...b.vals].sort(); return Math.round((Date.parse(v[v.length - 1].replace(' ', 'T') + 'Z') - Date.parse(v[0].replace(' ', 'T') + 'Z')) / 60000); });
    const multiVal = frame.filter((b) => b.vals.size > 1);
    table('2d. XNĐ có đồng nhất trong một BD10 không?', ['Chỉ số', 'Giá trị'], [
      ['BD10 có ≥ 2 giá trị XNĐ khác nhau (i/ii/iii)', multiVal.length],
      ['Số giá trị XNĐ khác nhau mỗi BD10 có XNĐ: min / trung vị / p90 / max', quant(frame.filter((b) => b.vals.size).map((b) => b.vals.size)).join(' / ')],
      ['Độ lệch (phút) giữa XNĐ sớm nhất và muộn nhất, BD10 loại (ii): min / trung vị / p90 / max', quant(spread).join(' / ')]
    ]);

    const spanRows = frame.filter((b) => b.daySpread > 1);
    table('2e. BD10 có dòng ở nhiều ngày đến khác nhau', ['Chỉ số', 'Giá trị'], [
      ['BD10 có dòng ở ≥ 2 ngày đến khác nhau', `${fmt(spanRows.length)} (${pct(spanRows.length, frame.length)})`],
      ['Số ngày đến khác nhau mỗi BD10: min / trung vị / p90 / max', quant(frame.map((b) => b.daySpread)).join(' / ')]
    ]);
    const dayCls = [];
    for (const d of [...new Set(frame.map((b) => b.day))].sort()) {
      const L = frame.filter((b) => b.day === d);
      const c = (f) => L.filter(f).length;
      dayCls.push([d, L.length, c((b) => b.grp === '530100'), c((b) => b.allFull), c((b) => b.someFull), c((b) => b.noneFull), c((b) => b.xndClass === 'i'), c((b) => b.xndClass === 'ii'), c((b) => b.xndClass === 'iii'), c((b) => b.xndClass === 'iv')]);
    }
    table('2f. Từng ngày: phân loại mốc của BD10', ['Ngày', 'Số BD10', 'trong đó 530100', 'XN: (a) mọi dòng đủ', '(b) một phần', '(c) không dòng nào', 'XNĐ: (i)', '(ii)', '(iii)', '(iv) không có'], dayCls);

    // ---- 3. BD10 đến không XNĐ: ba cách đếm ----
    const shbgMap = new Map();
    for (const r of rows) {
      if (!r.trk) continue;
      if (!shbgMap.has(r.trk)) shbgMap.set(r.trk, []);
      shbgMap.get(r.trk).push(r);
    }
    const shbgList = [...shbgMap.entries()].map(([trk, rs]) => {
      const arr = minOf(rs.map((r) => r.arr));
      const rep = rs.filter((r) => r.arr).sort((x, y) => (x.arr < y.arr ? -1 : x.arr > y.arr ? 1 : x.id - y.id))[0] || rs[0];
      return { trk, rs, day: arr ? arr.slice(0, 10) : null, full: rs.some((r) => r.full), xnd: rs.some((r) => r.xnd), grp: rep.b10 === '' ? 'khong_bd10' : rep.b10.slice(0, 6) === TTKT ? '530100' : 'khac', diNgoai: rep.diNgoai };
    });
    const shbgFrame = shbgList.filter((s) => s.day !== null && s.day >= from && s.day <= to);
    const cRow = (label, list) => {
      const arrived = list.filter((s) => s.full);
      const c = arrived.filter((s) => !s.xnd);
      return [label, list.length, arrived.length, c.length, pct(c.length, arrived.length), pct(c.length, list.length)];
    };
    const g3 = (label, list) => {
      const c = countAB(list);
      return [label, c.total, c.arrivedA, c.a, pct(c.a, c.arrivedA), pct(c.a, c.total), c.arrivedB, c.b, pct(c.b, c.arrivedB), pct(c.b, c.total)];
    };
    table('3. "BD10 đến không XNĐ" theo cách A và B (khung)',
      ['Nhóm', 'Tổng BD10', 'A: BD10 đến (≥1 dòng đủ)', 'A: không XNĐ', 'Tỉ lệ A / đến', 'Tỉ lệ A / tổng', 'B: BD10 đến (mọi dòng đủ)', 'B: không XNĐ', 'Tỉ lệ B / đến', 'Tỉ lệ B / tổng'],
      [g3('Tổng', frame), g3('530100', frame.filter((b) => b.grp === '530100')), g3('Khác 530100', frame.filter((b) => b.grp === 'khac'))]);
    table('3C. Cách C — mức SHBG (khung; nhóm theo BD10 của dòng đại diện; SHBG đến = có ≥1 dòng đủ túi + BG)',
      ['Nhóm', 'Tổng SHBG', 'SHBG đến (đủ)', 'C: không XNĐ', 'Tỉ lệ C / đến', 'Tỉ lệ C / tổng'],
      [cRow('Tổng', shbgFrame), cRow('530100', shbgFrame.filter((s) => s.grp === '530100')), cRow('Khác 530100', shbgFrame.filter((s) => s.grp === 'khac')), cRow('Không có BD10 (không tính vào nhóm)', shbgFrame.filter((s) => s.grp === 'khong_bd10'))]);
    // BD10 do chính BCVH nhận lập (tiền tố = mã BCVH nhận): tách riêng khỏi nhóm "khác"
    const ownList = frame.filter((b) => b.own);
    const khacOnly = frame.filter((b) => b.grp === 'khac' && !b.own);
    table('3e. Tách BD10 do chính BCVH nhận lập (tiền tố = mã BCVH nhận) khỏi nhóm "khác 530100" (khung)',
      ['Nhóm', 'Tổng BD10', 'A: BD10 đến (≥1 dòng đủ)', 'A: không XNĐ', 'Tỉ lệ A / đến', 'Tỉ lệ A / tổng', 'B: BD10 đến (mọi dòng đủ)', 'B: không XNĐ', 'Tỉ lệ B / đến', 'Tỉ lệ B / tổng'],
      [g3('530100', frame.filter((b) => b.grp === '530100')), g3('Khác 530100, TRỪ BD10 do chính BCVH lập', khacOnly), g3('BD10 do chính BCVH lập (tiền tố = mã BCVH)', ownList),
        g3('Tổng TRỪ BD10 do chính BCVH lập', frame.filter((b) => !b.own))]);
    // Theo từng ngày
    const days = [...new Set(frame.map((b) => b.day))].sort();
    const dayRows = [];
    for (const d of days) {
      const L = frame.filter((b) => b.day === d);
      const T = L.filter((b) => b.grp === '530100');
      const K = L.filter((b) => b.grp === 'khac');
      const cs = (list) => countAB(list);
      const a = cs(L); const at = cs(T); const ak = cs(K);
      const sd = shbgFrame.filter((s) => s.day === d && s.full);
      const sc = sd.filter((s) => !s.xnd);
      dayRows.push([d, L.length, `${a.a}/${a.arrivedA} (${pct(a.a, a.arrivedA)})`, `${at.a}/${at.arrivedA} (${pct(at.a, at.arrivedA)})`, `${ak.a}/${ak.arrivedA} (${pct(ak.a, ak.arrivedA)})`, `${a.b}/${a.arrivedB} (${pct(a.b, a.arrivedB)})`, `${sc.length}/${sd.length} (${pct(sc.length, sd.length)})`]);
    }
    table('3d. Từng ngày (ngày đến sớm nhất của BD10 / của SHBG): không XNĐ / đến (tỉ lệ)', ['Ngày', 'Số BD10', 'A tổng', 'A 530100', 'A khác', 'B tổng', 'C (SHBG) tổng'], dayRows);

    // ---- 4. Hàng đi ngoài ----
    const diNgoaiRows = rows.filter((r) => r.diNgoai);
    const w = (r) => (r.wg !== null ? r.wg : -1);
    const nonDiNgoaiBigWeight = rows.filter((r) => !r.diNgoai && w(r) > 2500).length;
    const diNgoaiBig = diNgoaiRows.filter((r) => w(r) > 2500).length;
    table('4a. Hàng đi ngoài (So_hieu_BD8 = SHBG)', ['Chỉ số', 'Giá trị'], [
      ['Dòng có BD8 trùng SHBG', diNgoaiRows.length],
      ['Tỉ lệ trên tổng dòng', pct(diNgoaiRows.length, rows.length)],
      ['Trong đó dòng có khối lượng > 2.500 g', `${fmt(diNgoaiBig)} (${pct(diNgoaiBig, diNgoaiRows.length)})`],
      ['Dòng khối lượng > 2.500 g nhưng BD8 khác SHBG', nonDiNgoaiBigWeight],
      ['Dòng không có BD8 (rỗng)', rows.filter((r) => r.b8 === '').length],
      ['Dòng BD8 trùng SHBG và có BD10', diNgoaiRows.filter((r) => r.b10 !== '').length]
    ]);
    const onlyDiNgoai = frame.filter((b) => b.diNgoaiRows === b.n);
    const mixed = frame.filter((b) => b.diNgoaiRows > 0 && b.diNgoaiRows < b.n);
    table('4b. BD10 theo thành phần hàng đi ngoài (khung)', ['Loại BD10', 'Số BD10', 'Số dòng'], [
      ['Chỉ chứa hàng đi ngoài', onlyDiNgoai.length, onlyDiNgoai.reduce((a, b) => a + b.n, 0)],
      ['Lẫn hàng đi ngoài và hàng thường', mixed.length, mixed.reduce((a, b) => a + b.n, 0)],
      ['Không có hàng đi ngoài', frame.length - onlyDiNgoai.length - mixed.length, frame.filter((b) => b.diNgoaiRows === 0).reduce((a, b) => a + b.n, 0)]
    ]);
    const noDiNgoai = buildBd10(rows, { dropDiNgoai: true }).filter(inFrame);
    table('4c. Cách A/B sau khi LOẠI các dòng hàng đi ngoài (khung)',
      ['Nhóm', 'Tổng BD10', 'A: BD10 đến', 'A: không XNĐ', 'Tỉ lệ A / đến', 'Tỉ lệ A / tổng', 'B: BD10 đến', 'B: không XNĐ', 'Tỉ lệ B / đến', 'Tỉ lệ B / tổng'],
      [g3('Tổng', noDiNgoai), g3('530100', noDiNgoai.filter((b) => b.grp === '530100')), g3('Khác 530100', noDiNgoai.filter((b) => b.grp === 'khac'))]);
    const shbgNoDiNgoai = shbgFrame.filter((s) => !s.diNgoai);
    table('4d. Cách C sau khi loại SHBG hàng đi ngoài (khung)', ['Nhóm', 'Tổng SHBG', 'SHBG đến (đủ)', 'C: không XNĐ', 'Tỉ lệ C / đến', 'Tỉ lệ C / tổng'],
      [cRow('Tổng', shbgNoDiNgoai), cRow('530100', shbgNoDiNgoai.filter((s) => s.grp === '530100')), cRow('Khác 530100', shbgNoDiNgoai.filter((s) => s.grp === 'khac'))]);

    // ---- 5. Bất thường theo tiền tố ----
    const prefA = [...byPrefix.entries()].map(([p, list]) => {
      const c = countAB(list);
      return { p, bd10: list.length, shbg: new Set(list.flatMap((b) => b.rs.map((r) => r.trk))).size, ...c };
    });
    const p5 = prefA.find((x) => x.p === '531120');
    table('5a. Tiền tố 531120', ['Số BD10', 'Số SHBG', 'BD10 đến (A)', 'Không XNĐ (A)', 'Tỉ lệ A / đến', 'BD10 mọi dòng thiếu XNĐ'],
      p5 ? [[p5.bd10, p5.shbg, p5.arrivedA, p5.a, pct(p5.a, p5.arrivedA), (byPrefix.get('531120') || []).filter((b) => b.xndClass === 'iv').length]] : [['không có', '', '', '', '', '']]);
    table('5b. Top 5 tiền tố theo số BD10 không XNĐ (A)', ['Tiền tố', 'Số BD10', 'Không XNĐ (A)', 'BD10 đến (A)', 'Tỉ lệ A / đến'],
      prefA.sort((x, y) => y.a - x.a).slice(0, 5).map((x) => [x.p === TTKT ? `${x.p} (TTKT)` : x.p, x.bd10, x.a, x.arrivedA, pct(x.a, x.arrivedA)]));

    // ---- 6. Tuổi của "BD10 đến không XNĐ" (cách A) ----
    const A = countAB(frame).aList;
    const ageOf = (b) => (b.firstBagItem ? Math.max(0, Math.round((Date.parse(`${latestFile}T00:00:00Z`) - Date.parse(`${b.firstBagItem.slice(0, 10)}T00:00:00Z`)) / 86400000)) : null);
    const bucket = (b) => { const a = ageOf(b); return a === null ? 'không rõ' : a <= 1 ? '0-1' : a === 2 ? '2' : '3+'; };
    const ageRows = [];
    for (const g of ['tổng', '530100', 'khac']) {
      const L = g === 'tổng' ? A : A.filter((b) => b.grp === g);
      ageRows.push([g === 'khac' ? 'khác 530100' : g, L.length, ...['0-1', '2', '3+', 'không rõ'].map((k) => L.filter((b) => bucket(b) === k).length)]);
    }
    table(`6a. Tuổi (ngày từ XN túi/BG sớm nhất đến ${latestFile}) của BD10 đến không XNĐ (A)`, ['Nhóm', 'Số BD10', '0-1', '2', '3+', 'không rõ'], ageRows);
    const byArrDay = A.reduce((m, b) => { (m[b.day] = m[b.day] || { t: 0, o: 0 })[b.grp === '530100' ? 't' : 'o']++; return m; }, {});
    table('6b. Theo ngày đến', ['Ngày đến', 'BD10 530100', 'BD10 khác', 'Tổng'], Object.entries(byArrDay).sort().map(([d, v]) => [d, v.t, v.o, v.t + v.o]));

    // ---- 7. Chất lượng dữ liệu liên quan ----
    const multi = [...shbgMap.values()].map((rs) => ({ bd10s: new Set(rs.filter((r) => r.b10).map((r) => r.b10)), rs })).filter((x) => x.bd10s.size > 1);
    const xndDiffer = multi.filter((x) => {
      const status = new Set([...x.bd10s].map((b) => (x.rs.filter((r) => r.b10 === b).some((r) => r.xnd) ? 1 : 0)));
      return status.size > 1;
    });
    const noBd10 = rows.filter((r) => r.b10 === '');
    table('7a. SHBG ở nhiều BD10 và BD10 rỗng', ['Chỉ số', 'Giá trị'], [
      ['SHBG xuất hiện ở ≥ 2 BD10 khác nhau (toàn DB)', multi.length],
      ['  trong đó các BD10 khác nhau về có/không XNĐ', xndDiffer.length],
      ['Dòng không có số hiệu BD10 (khong_bd10)', noBd10.length],
      ['SHBG khác nhau trong đó', new Set(noBd10.map((r) => r.trk)).size],
      ['  trong đó đủ XN túi + BG', noBd10.filter((r) => r.full).length],
      ['  chỉ có XN BG', noBd10.filter((r) => !r.bag && r.itm).length]
    ]);
    const wardByDay = new Map();
    for (const r of rows) {
      const d = r.day || '(không có ngày đến)';
      if (!wardByDay.has(d)) wardByDay.set(d, { n: 0, noWard: 0, noWardNoB10: 0, noB10: 0, noProv: 0 });
      const o = wardByDay.get(d);
      o.n++;
      if (!r.ward) { o.noWard++; if (r.b10 === '') o.noWardNoB10++; }
      if (r.b10 === '') o.noB10++;
      if (!r.prov) o.noProv++;
    }
    table('7b. Dòng thiếu phường/xã theo ngày đến (đối chiếu với BD10 rỗng, chỉ nêu số)',
      ['Ngày đến', 'Số dòng', 'Thiếu phường/xã', 'Tỉ lệ', 'Dòng BD10 rỗng', 'Thiếu phường & BD10 rỗng', 'Thiếu tỉnh'],
      [...wardByDay.entries()].sort().map(([d, o]) => [d, o.n, o.noWard, pct(o.noWard, o.n), o.noB10, o.noWardNoB10, o.noProv]));
    const byFile = db.prepare(`SELECT f.file_date AS d, f.file_time AS t, COUNT(*) AS n, SUM(a.ward_name = '') AS w FROM arrival_items a JOIN arrival_import_files f ON f.id = a.import_file_id GROUP BY f.id ORDER BY f.file_date, f.file_time`).all();
    table('7c. Theo file nạp (ngày file)', ['Ngày file', 'Giờ file', 'Số dòng', 'Thiếu phường/xã', 'Tỉ lệ'], byFile.map((f) => [f.d, f.t, f.n, f.w, pct(f.w, f.n)]));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[survey-bd10] ${err.message}\n${USAGE}`);
    process.exit(1);
  }
}

module.exports = { buildBd10, countAB };
