#!/usr/bin/env node
// ==========================================
// Khảo sát CHỈ ĐỌC (SANLUONG-4a5): "BD10 đến không XNĐ" theo định nghĩa mới của PO (10/10/2026).
//
//   node scripts/survey-bd10-den.js [--db <đường-dẫn-DB>] [--unit 533140] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//
// Mở DB `readonly`; từ chối mọi cờ ghi. Chỉ in số đếm / tỉ lệ / bảng; số hiệu chỉ lộ MÃ BƯU CỤC 6 số (6 ký tự đầu = bưu cục lập,
// 6 ký tự kế = bưu cục nhận của BD10) — KHÔNG in SHBG / BD8 / BD10 đầy đủ. Không đổi chỉ số nào của app.
//
// Định nghĩa (PO):
//   Mã BD10 = [6 ký tự bưu cục lập][6 ký tự bưu cục nhận][phần còn lại].
//   BD10 ĐẾN (BCVH --unit) = ký tự 7–12 bằng mã BCVH, và 6 ký tự đầu KHÁC mã BCVH (BD10 do chính BCVH lập đi không thuộc "đến").
//   XN = XN túi (bag_confirmed_at) / XN BG (item_confirmed_at); XNĐ = bd10_confirmed_at. Mốc xét trên MỌI dòng của BD10.
//   S1 có XNĐ | S2 không XNĐ, ≥1 dòng đủ cả XN túi lẫn XN BG | S3 không XNĐ, có XN túi hoặc XN BG nhưng không dòng nào đủ cả hai |
//   S4 không XNĐ, không có XN nào. N = S2 + S3 (BD10 đến không XNĐ), D = S1 + S2 + S3 + S4, tỉ lệ = N / D; tử số hẹp = chỉ S2.
//   Ngày của BD10: quy tắc X = MIN(XNĐ) nếu có, nếu không MIN(XN túi, XN BG); quy tắc Y = MIN(XN túi, XN BG) nếu có, nếu không MIN(XNĐ).
//   BD10 không có mốc nào (chính là S4) không gán được ngày.
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TTKT = '530100';
const USAGE = 'Cách dùng: node scripts/survey-bd10-den.js [--db <DB>] [--unit <mã BCVH>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]';
const WRITE_FLAGS = ['--apply', '--write', '--vacuum', '--fix', '--delete', '--reset'];

function parseArgs(argv) {
  const out = { db: null, unit: null, from: '2026-10-01', to: '2026-10-09' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.includes(a)) throw new Error(`Script khảo sát chỉ đọc, không nhận cờ ghi: ${a}`);
    if (['--db', '--unit', '--from', '--to'].includes(a)) out[a.slice(2)] = argv[++i];
    else throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
  }
  for (const k of ['from', 'to']) if (!/^\d{4}-\d{2}-\d{2}$/.test(out[k])) throw new Error(`--${k} phải dạng YYYY-MM-DD`);
  if (out.unit !== null && !/^\d{6}$/.test(out.unit)) throw new Error('--unit phải là mã bưu cục 6 chữ số');
  return out;
}

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
function table(title, head, rows) {
  console.log(`\n### ${title}`);
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${r.map((c) => (typeof c === 'number' ? fmt(c) : c)).join(' | ')} |`);
}
const minOf = (xs) => xs.reduce((m, x) => (x && (m === null || x < m) ? x : m), null);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function classify(code, unit) {
  if (code === '') return { kind: 'rong', lap: '', nhan: '' };
  if (code.length < 12) return { kind: 'ngan', lap: code.slice(0, 6), nhan: code.slice(6, 12) };
  const lap = code.slice(0, 6);
  const nhan = code.slice(6, 12);
  if (nhan === unit && lap === unit) return { kind: 'noi_bo', lap, nhan };
  if (nhan === unit) return { kind: 'den', lap, nhan };
  if (lap === unit) return { kind: 'lap_di', lap, nhan };
  return { kind: 'khac', lap, nhan };
}

function buildBd10(rows, unit) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.b10)) map.set(r.b10, []);
    map.get(r.b10).push(r);
  }
  return [...map.entries()].map(([b10, rs]) => {
    const c = classify(b10, unit);
    const xnds = rs.map((r) => r.xnd).filter(Boolean);
    const xnMin = minOf(rs.flatMap((r) => [r.bag, r.itm]));
    const xndMin = minOf(xnds);
    const anyFull = rs.some((r) => r.bag && r.itm);
    const anyBag = rs.some((r) => r.bag);
    const anyItm = rs.some((r) => r.itm);
    let status;
    if (xnds.length) status = 'S1';
    else if (anyFull) status = 'S2';
    else if (anyBag || anyItm) status = 'S3';
    else status = 'S4';
    const tsX = xndMin || xnMin;
    const tsY = xnMin || xndMin;
    return {
      b10, ...c, rs, n: rs.length, shbg: new Set(rs.map((r) => r.trk)),
      grp: c.lap === TTKT ? '530100' : 'khac',
      status, s3kind: status === 'S3' ? (anyBag && anyItm ? 'túi và BG ở các dòng khác nhau' : anyBag ? 'chỉ có XN túi' : 'chỉ có XN BG') : null,
      xndAll: xnds.length === rs.length, xndNone: xnds.length === 0, xndDistinct: new Set(xnds).size, xndMin,
      dayX: tsX ? tsX.slice(0, 10) : null, dayY: tsY ? tsY.slice(0, 10) : null
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(args.db || process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
  if (!fs.existsSync(dbPath)) throw new Error(`Không tìm thấy DB ${dbPath}`);
  const db = new Database(dbPath, { fileMustExist: true, readonly: true });
  if (!db.readonly) throw new Error('DB không ở chế độ chỉ đọc — dừng.');
  try {
    const rows = db.prepare(`SELECT tracking_no AS trk, bd10_no AS b10, bag_confirmed_at AS bag, item_confirmed_at AS itm, bd10_confirmed_at AS xnd,
      arrival_at AS arr, receiver_code AS rc FROM arrival_items`).all();
    const latest = db.prepare("SELECT MAX(file_date) AS d FROM arrival_import_files WHERE status = 'OK'").get().d;
    let unit = args.unit;
    if (!unit) {
      const cnt = new Map();
      for (const r of rows) cnt.set(r.rc, (cnt.get(r.rc) || 0) + 1);
      unit = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    const { from, to } = args;
    console.log(`# Khảo sát "BD10 đến không XNĐ" (định nghĩa mới) — BCVH ${unit}, DB ${path.basename(dbPath)} (chỉ đọc)`);
    console.log(`Khung ngày: ${from} → ${to}; ngày dữ liệu mới nhất (file OK): ${latest}. Dòng: ${fmt(rows.length)}.`);

    const all = buildBd10(rows, unit);
    const by = (k) => all.filter((b) => b.kind === k);
    const sumRows = (L) => L.reduce((a, b) => a + b.n, 0);
    const shbgOf = (L) => { const s = new Set(); for (const b of L) for (const t of b.shbg) s.add(t); return s.size; };

    // ---------- 1 ----------
    const pairs = new Map();
    for (const b of all) {
      if (b.kind === 'rong') continue;
      const k = `${b.lap}|${b.nhan}|${b.kind}`;
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(b);
    }
    const kindLabel = { den: 'ĐẾN (ký tự 7–12 = mã BCVH)', lap_di: 'LẬP ĐI (6 ký tự đầu = mã BCVH)', noi_bo: 'nội bộ (đầu và 7–12 đều = mã BCVH)', khac: 'khác (không liên quan BCVH)', ngan: 'độ dài < 12 ký tự' };
    table('1a. Phân bố cặp [bưu cục lập | bưu cục nhận] của BD10', ['Bưu cục lập (6 đầu)', 'Bưu cục nhận (ký tự 7–12)', 'Loại', 'Số BD10', 'Số SHBG', 'Số dòng'],
      [...pairs.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, L]) => {
        const [lap, nhan, kind] = k.split('|');
        return [lap + (lap === TTKT ? ' (TTKT)' : ''), kind === 'ngan' ? `${nhan || '(thiếu)'}` : nhan, kindLabel[kind], L.length, shbgOf(L), sumRows(L)];
      }));
    const lens = new Map();
    for (const b of all) lens.set(b.b10.length, (lens.get(b.b10.length) || 0) + 1);
    table('1b. Tổng hợp theo loại và độ dài mã', ['Loại', 'Số BD10', 'Số SHBG', 'Số dòng'], [
      ['BD10 ĐẾN (ký tự 7–12 = mã BCVH, 6 ký tự đầu ≠ mã BCVH)', by('den').length, shbgOf(by('den')), sumRows(by('den'))],
      ['BD10 LẬP ĐI (6 ký tự đầu = mã BCVH, ký tự 7–12 ≠ mã BCVH)', by('lap_di').length, shbgOf(by('lap_di')), sumRows(by('lap_di'))],
      ['BD10 nội bộ (cả hai đều = mã BCVH)', by('noi_bo').length, shbgOf(by('noi_bo')), sumRows(by('noi_bo'))],
      ['BD10 khác (không liên quan BCVH)', by('khac').length, shbgOf(by('khac')), sumRows(by('khac'))],
      ['Mã bất thường (< 12 ký tự)', by('ngan').length, shbgOf(by('ngan')), sumRows(by('ngan'))],
      ['Không có mã BD10 (rỗng)', by('rong').length, shbgOf(by('rong')), sumRows(by('rong'))]
    ]);
    console.log(`Độ dài mã BD10 (ký tự: số BD10): ${[...lens.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}: ${n}`).join('; ')}`);

    // ---------- 2 ----------
    const den = by('den');
    const GR = [['Tổng', den], ['Nhóm 530100', den.filter((b) => b.grp === '530100')], ['Nhóm khác 530100', den.filter((b) => b.grp === 'khac')]];
    const st = (L, s) => L.filter((b) => b.status === s).length;
    table('2a. Trạng thái BD10 đến (toàn dữ liệu, không phụ thuộc ngày)', ['Nhóm', 'Tổng D', 'S1 có XNĐ', 'S2 không XNĐ, ≥1 dòng đủ túi + BG', 'S3 không XNĐ, có túi hoặc BG (không dòng nào đủ cả hai)', 'S4 không XNĐ, không XN nào'],
      GR.map(([l, L]) => [l, L.length, st(L, 'S1'), st(L, 'S2'), st(L, 'S3'), st(L, 'S4')]));
    const s3 = den.filter((b) => b.status === 'S3');
    table('2b. Chi tiết S3', ['Loại S3', 'Số BD10'], ['chỉ có XN BG', 'chỉ có XN túi', 'túi và BG ở các dòng khác nhau'].map((k) => [k, s3.filter((b) => b.s3kind === k).length]));
    const withX = den.filter((b) => b.status === 'S1');
    table('2c. XNĐ có đồng nhất trong từng BD10 đến?', ['Chỉ số', 'Giá trị'], [
      ['BD10 đến có XNĐ ở MỌI dòng', den.filter((b) => b.xndAll).length],
      ['BD10 đến có XNĐ ở MỘT PHẦN dòng', den.filter((b) => !b.xndAll && !b.xndNone).length],
      ['BD10 đến không XNĐ ở dòng nào', den.filter((b) => b.xndNone).length],
      ['BD10 đến có XNĐ với ≥ 2 giá trị khác nhau', den.filter((b) => b.xndDistinct > 1).length],
      ['(đối chiếu) mọi BD10 có XNĐ một phần / ≥ 2 giá trị', `${all.filter((b) => b.b10 && !b.xndAll && !b.xndNone).length} / ${all.filter((b) => b.xndDistinct > 1).length}`],
      ['BD10 đến có XNĐ', withX.length]
    ]);

    // ---------- 3 ----------
    const ratioRow = (label, L) => {
      const n = L.filter((b) => b.status === 'S2' || b.status === 'S3').length;
      const s2 = st(L, 'S2');
      return [label, L.length, n, pct(n, L.length), s2, pct(s2, L.length)];
    };
    table('3a. Chỉ số trên TOÀN dữ liệu (mẫu số D = mọi BD10 đến, gồm cả S4)', ['Nhóm', 'D = S1+S2+S3+S4', 'N = S2+S3', 'N / D', 'Hẹp: chỉ S2', 'S2 / D'], GR.map(([l, L]) => ratioRow(l, L)));
    const dateRule = { X: 'dayX', Y: 'dayY' };
    for (const rule of ['X', 'Y']) {
      const key = dateRule[rule];
      const inFr = (b) => b[key] && b[key] >= from && b[key] <= to;
      const rowsFrame = GR.map(([l, L]) => ratioRow(l, L.filter(inFr)));
      const before = den.filter((b) => b[key] && b[key] < from).length;
      const after = den.filter((b) => b[key] && b[key] > to).length;
      const noDay = den.filter((b) => !b[key]).length;
      table(`3b. Quy tắc ${rule}: BD10 đến có ngày trong khung ${from} → ${to} (mẫu số = BD10 đến CÓ NGÀY trong khung, không gồm S4 vì S4 không có ngày)`,
        ['Nhóm', 'D (trong khung)', 'N', 'N / D', 'Hẹp: chỉ S2', 'S2 / D'], rowsFrame);
      console.log(`Quy tắc ${rule}: ngoài khung — trước ${from}: ${before} BD10; sau ${to}: ${after} BD10; không gán được ngày: ${noDay} BD10.`);
    }

    // ---------- 4 ----------
    const latestDay = latest;
    const days = [];
    for (let d = from; d <= latestDay; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) days.push(d);
    for (const rule of ['X', 'Y']) {
      const key = dateRule[rule];
      const rowsDay = days.map((d) => {
        const L = den.filter((b) => b[key] === d);
        const T = L.filter((b) => b.grp === '530100');
        const n = (l) => l.filter((b) => b.status === 'S2' || b.status === 'S3').length;
        return [d, L.length, n(L), pct(n(L), L.length), T.length, n(T), pct(n(T), T.length), L.length - T.length, n(L) - n(T), pct(n(L) - n(T), L.length - T.length)];
      });
      table(`4a. Quy tắc ${rule}: từng ngày (D, N, N/D)`, ['Ngày', 'D tổng', 'N tổng', 'N/D', 'D 530100', 'N 530100', 'N/D 530100', 'D khác', 'N khác', 'N/D khác'], rowsDay);
    }
    const dated = den.filter((b) => b.dayX && b.dayY);
    const diffs = dated.filter((b) => b.dayX !== b.dayY);
    const dist = new Map();
    for (const b of diffs) { const k = dayDiff(b.dayX, b.dayY); dist.set(k, (dist.get(k) || 0) + 1); }
    table('4b. Quy tắc X so với Y', ['Chỉ số', 'Giá trị'], [
      ['BD10 đến không gán được ngày (cả hai quy tắc)', den.filter((b) => !b.dayX).length],
      ['BD10 đến có ngày X ≠ ngày Y', diffs.length],
      ['Phân bố chênh (ngày Y − ngày X): ngày → số BD10', [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k > 0 ? '+' : ''}${k}: ${n}`).join('; ') || '–']
    ]);

    // ---------- 5 ----------
    const ageBucket = (age) => (age <= 1 ? '0-1' : age === 2 ? '2' : '3+');
    for (const rule of ['X', 'Y']) {
      const key = dateRule[rule];
      const rowsAge = GR.map(([l, L]) => {
        const N = L.filter((b) => (b.status === 'S2' || b.status === 'S3') && b[key]);
        const c = { '0-1': 0, 2: 0, '3+': 0 };
        for (const b of N) c[ageBucket(Math.max(0, dayDiff(b[key], latestDay)))]++;
        return [l, N.length, c['0-1'], c['2'], c['3+']];
      });
      table(`5. Quy tắc ${rule}: tuổi của N (ngày từ ngày gán đến ${latestDay})`, ['Nhóm', 'Số BD10 (N)', '0-1', '2', '3+'], rowsAge);
    }

    // ---------- 6 ----------
    const vals = new Map();
    const valsMin = new Map();
    for (const b of withX) {
      vals.set(b.xndMin, (vals.get(b.xndMin) || 0) + 1);
      valsMin.set(b.xndMin.slice(0, 16), (valsMin.get(b.xndMin.slice(0, 16)) || 0) + 1);
    }
    const allXnd = rows.map((r) => r.xnd).filter(Boolean).sort();
    const lastXnd = allXnd[allXnd.length - 1] || null;
    const lastAny = rows.flatMap((r) => [r.bag, r.itm, r.xnd]).filter(Boolean).sort().pop();
    table('6a. Phân bố XNĐ của BD10 đến có XNĐ (kiểm tra đóng dấu hàng loạt)', ['Chỉ số', 'Giá trị'], [
      ['BD10 đến có XNĐ', withX.length],
      ['Số giá trị XNĐ khác nhau (tới giây)', vals.size],
      ['Số giá trị XNĐ khác nhau (tới phút)', valsMin.size],
      ['Giá trị XNĐ nhiều BD10 nhất: số BD10', Math.max(0, ...vals.values())],
      ['Giờ lớn nhất của XNĐ trong cả dữ liệu', lastXnd || '–'],
      ['Giờ lớn nhất của mọi mốc (XN túi / BG / XNĐ) trong dữ liệu', lastAny || '–'],
      ['BD10 đến có XNĐ đúng bằng giờ XNĐ lớn nhất', withX.filter((b) => b.xndMin === lastXnd).length],
      ['BD10 đến có XNĐ trong ngày dữ liệu mới nhất (' + latestDay + ')', withX.filter((b) => b.xndMin.slice(0, 10) === latestDay).length]
    ]);
    table('6b. Top 5 giá trị XNĐ (tới giây) có nhiều BD10 đến nhất', ['Giá trị XNĐ', 'Số BD10'], [...vals.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([v, n]) => [v, n]));
    table('6c. Top 5 phút XNĐ có nhiều BD10 đến nhất', ['Phút XNĐ', 'Số BD10'], [...valsMin.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([v, n]) => [v, n]));

    // ---------- 7 ----------
    // Tập 4a4: BD10 khác rỗng, ngày = MIN(arrival_at) trong khung, loại tiền tố = mã BCVH (đúng cách 4a4).
    const arrDay = (b) => { const m = minOf(b.rs.map((r) => r.arr)); return m ? m.slice(0, 10) : null; };
    const set4a4 = all.filter((b) => b.b10 !== '' && (() => { const d = arrDay(b); return d && d >= from && d <= to; })());
    const set4a4Loai = set4a4.filter((b) => b.lap !== unit && !(b.b10.slice(0, 6) === unit));
    const denSet = new Set(den.map((b) => b.b10));
    const in4 = new Set(set4a4Loai.map((b) => b.b10));
    const both = set4a4Loai.filter((b) => denSet.has(b.b10));
    const only4 = set4a4Loai.filter((b) => !denSet.has(b.b10));
    const onlyNew = den.filter((b) => !in4.has(b.b10));
    const why = new Map();
    for (const b of only4) { const k = `${b.lap}|${b.nhan || '(thiếu)'}`; why.set(k, (why.get(k) || 0) + 1); }
    const whyNew = new Map();
    for (const b of onlyNew) {
      const d = arrDay(b);
      const k = d === null ? 'không có arrival_at (4a4 không gán ngày)' : d < from ? `ngày đến (arrival_at) trước ${from}` : d > to ? `ngày đến (arrival_at) sau ${to}` : 'khác';
      whyNew.set(k, (whyNew.get(k) || 0) + 1);
    }
    table('7. Đối chiếu với 4a4', ['Chỉ số', 'Số BD10'], [
      ['4a4: BD10 trong khung (ngày = MIN arrival_at), trừ tiền tố = mã BCVH', set4a4Loai.length],
      ['Định nghĩa mới: BD10 đến (mọi ngày)', den.length],
      ['  Giao nhau (cả hai)', both.length],
      ['  Chỉ có ở 4a4 (ký tự 7–12 ≠ mã BCVH)', only4.length],
      ['  Chỉ có ở định nghĩa mới', onlyNew.length]
    ]);
    if (only4.length) table('7b. BD10 chỉ có ở 4a4 — cặp [lập | nhận]', ['Bưu cục lập', 'Bưu cục nhận (ký tự 7–12)', 'Số BD10'], [...why.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [...k.split('|'), n]));
    if (onlyNew.length) table('7c. BD10 chỉ có ở định nghĩa mới — lý do (theo ngày arrival_at)', ['Lý do', 'Số BD10'], [...whyNew.entries()].map(([k, n]) => [k, n]));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[survey-bd10-den] ${err.message}\n${USAGE}`);
    process.exit(1);
  }
}

module.exports = { classify, buildBd10 };
