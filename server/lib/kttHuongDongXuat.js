// ==========================================
// «Hàng tại KTT» — KTT-DC-1: xuất hai file Excel của tab «Hướng đóng chuyến nội tỉnh» (chỉ ĐỌC, không ghi DB):
//   nhac_viec — KHÔNG có số hiệu bưu gửi: sheet «Nhắc việc», «Theo ngày (20 nơi đầu)», «Giải thích» (như file 1 của KTT-DT-5).
//   chi_tiet  — CÓ số hiệu bưu gửi: sheet «Chi tiết» (hàng đóng vào 530100) và «Chưa chắc» (hàng chưa rõ cách đóng); dòng đầu cảnh báo (như file 2 của KTT-DT-5).
// Nhãn bằng tiếng Việt đời thường. Ghi bằng ExcelJS (workbook thường, ≤ vài chục nghìn dòng; có trần dòng của sheet 7). Không tên người, địa chỉ, số điện thoại.
// ==========================================
'use strict';
const ExcelJS = require('exceljs');
const HD = require('./kttHuongDong');
const X = require('./kttXuat');
const Q = require('./kttQuery');
const DQ = require('./kttDiNgayQuery');

const CANH_BAO_CHI_TIET = 'File chứa số hiệu bưu gửi thật. Không đưa lên GitHub, không dán vào chat.';
const TOP_MA_TRAN = 20;
const XANH = 'FF1F4E79';
const dd = (ngay) => `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}`;
const dmy = (ngay) => (ngay ? `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}/${ngay.slice(0, 4)}` : ngay);
const so = (x) => (typeof x === 'number' ? x.toLocaleString('vi-VN') : x);

function dongTieuDe(ws, cells, cao = 60) {
  const r = ws.addRow(cells);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XANH } };
  r.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  r.height = cao;
  return r;
}
const nhomChu = (ma, loai, nhom) => {
  if (ma === '531120') return '531120 Khách hàng lớn';
  if (nhom === 'GD1' || nhom === 'GD2_GD3' || nhom === 'VHX') return 'Bưu cục địa phương';
  if (loai === 'PH1' || loai === 'PH2') return 'BCVH (có thể gom từ nơi khác)';
  return loai ? `Loại hình khác: ${loai} (xem sheet Giải thích)` : 'Chưa có trong danh mục';
};

/** Nội dung file nhắc việc. `tong`: kết quả HD.tongHop(ds, danhMuc, null); `tong7`: HD.tongHop(7 ngày cuối). */
function taoNhacViec({ ds, k, tong, tong7, danhMuc, doMoi }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Khai thác Huế';
  const ws = wb.addWorksheet('Nhắc việc', { views: [{ state: 'frozen', ySplit: 2, xSplit: 3 }] });
  const m = tong.meta;
  const soNgay = k.ngays.length;
  const cuoi7 = k.ngays.slice(-7);
  ws.addRow([`Hàng nội tỉnh đến 6 bưu cục văn hóa Huế bị đóng chuyến thư vào Khai thác (530100), theo nơi đóng chuyến thư. Số liệu ${soNgay} ngày từ ${dmy(k.tuNgay)} đến ${dmy(k.denNgay)}; 7 ngày gần nhất từ ${dmy(cuoi7[0])} đến ${dmy(cuoi7[cuoi7.length - 1])}. Dữ liệu Khai thác cập nhật đến ${doMoi || 'chưa có'}. Xem sheet «Giải thích» trước khi dùng.`]);
  ws.mergeCells(1, 1, 1, 14);
  ws.getRow(1).alignment = { wrapText: true, vertical: 'top' }; ws.getRow(1).height = 48; ws.getRow(1).font = { italic: true };
  const head = ['Thứ tự', 'Mã bưu cục', 'Tên bưu cục', 'Loại hình', 'BĐX', 'Nhóm',
    `Hàng nội tỉnh đóng vào 530100 (${soNgay} ngày)`, `Hàng nội tỉnh đóng thẳng BCVH (${soNgay} ngày)`, `Tỷ lệ đóng vào 530100 (${soNgay} ngày)`, 'Hàng chưa rõ cách đóng (xếp riêng)',
    'Số chuyến thư vào 530100', 'Trong đó số chuyến có lẫn hàng nội tỉnh', `Số ngày có đóng vào 530100 hàng nội tỉnh (trên ${soNgay} ngày)`, 'Số ngày vừa đóng thẳng BCVH vừa đóng vào 530100 hàng nội tỉnh',
    'Hàng nội tỉnh đóng vào 530100 (7 ngày)', 'Hàng nội tỉnh đóng thẳng BCVH (7 ngày)', 'Tỷ lệ đóng vào 530100 (7 ngày)',
    'Khối lượng hàng nội tỉnh đóng vào 530100 (kg)', 'Dịch vụ đóng sai nhiều nhất', 'Số bưu gửi của dịch vụ đó', 'BCVH nhận nhiều nhất', 'Số bưu gửi nhận tại BCVH đó', 'Hàng có chuyến thư ghi ngày cũ (xếp riêng, chưa rõ nguyên nhân)'];
  dongTieuDe(ws, head, 70);
  const bay = new Map(tong7.theo_noi_dong.map((r) => [r.ma, r]));
  const ty = (a, b) => (a + b < HD.NGUONG_IT_MAU ? 'Ít mẫu' : a / (a + b));
  let tt = 0;
  for (const r of tong.theo_noi_dong) {
    const s = bay.get(r.ma) || { dong_vao_530100: 0, dong_thang_bcvh: 0 };
    tt++;
    ws.addRow([tt, r.ma, r.ten || 'chưa có tên', r.loai_hinh || 'chưa có tên', r.bdx || 'chưa có tên', nhomChu(r.ma, r.loai_hinh, r.nhom_loai_hinh),
      r.dong_vao_530100, r.dong_thang_bcvh, r.it_mau ? 'Ít mẫu' : r.ty_le, r.chua_ro, r.chuyen_vao_530100, r.chuyen_co_lan, r.ngay_co_dong_vao_530100, r.ngay_dong_ca_hai_kieu,
      s.dong_vao_530100, s.dong_thang_bcvh, ty(s.dong_vao_530100, s.dong_thang_bcvh), r.kg,
      r.dich_vu_nhieu_nhat ? `${r.dich_vu_nhieu_nhat.ma || ''} – ${r.dich_vu_nhieu_nhat.ten || ''}` : '', r.dich_vu_nhieu_nhat ? r.dich_vu_nhieu_nhat.so : '',
      r.bcvh_dich_nhieu_nhat ? (r.bcvh_dich_nhieu_nhat.ten || r.bcvh_dich_nhieu_nhat.ma) : '', r.bcvh_dich_nhieu_nhat ? r.bcvh_dich_nhieu_nhat.so : '', r.dong_chuyen_ghi_ngay_cu]);
  }
  const tongN1 = tong.theo_noi_dong.reduce((s, r) => s + r.dong_thang_bcvh, 0);
  const rt = ws.addRow(['', '', `TỔNG ${tong.theo_noi_dong.length} nơi`, '', '', '', m.dong_vao_530100, tongN1, m.dong_vao_530100 / (m.dong_vao_530100 + tongN1 || 1), tong.theo_noi_dong.reduce((s, r) => s + r.chua_ro, 0),
    m.so_chuyen_vao_530100, m.so_chuyen_co_lan, '', '', tong7.meta.dong_vao_530100, tong7.theo_noi_dong.reduce((s, r) => s + r.dong_thang_bcvh, 0), '', tong.theo_noi_dong.reduce((s, r) => s + r.kg, 0), '', '', '', '', m.so_hang_ghi_ngay_cu]);
  rt.font = { bold: true }; rt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  ws.addRow([]);
  const gc = ws.addRow([`Ghi chú: toàn tập có ${so(m.tong_noi_tinh)} bưu gửi nội tỉnh đến 6 BCVH: đóng thẳng BCVH ${so(m.n1)}, đóng vào 530100 ${so(m.n2)}, chưa rõ cách đóng ${so(m.n3)}. Trong số đóng vào 530100, ${so(m.do_6_bcvh_dong)} bưu gửi do chính 6 BCVH đóng (không liệt kê ở bảng này) và ${so(m.dong_vao_530100_toan_tap)} do các nơi còn lại. Hàng chưa rõ cách đóng vừa có túi gửi vào 530100 vừa có túi chuyển tiếp nên KHÔNG cộng vào cột «đóng vào 530100». Cột «Số chuyến thư vào 530100» là mọi chuyến thư gửi vào 530100 của nơi đó (cả hàng đi tỉnh khác, không sai). Ô có tổng dưới ${HD.NGUONG_IT_MAU} bưu gửi ghi «Ít mẫu», không tính tỷ lệ.`]);
  ws.mergeCells(gc.number, 1, gc.number, 14); gc.alignment = { wrapText: true, vertical: 'top' }; gc.height = 78;
  [8, 11, 24, 10, 28, 30, 16, 16, 14, 16, 14, 16, 16, 18, 14, 14, 14, 16, 30, 12, 18, 14, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const ultimo = 2 + tong.theo_noi_dong.length;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: ultimo, column: head.length } };
  for (let r = 3; r <= ultimo + 1; r++) { for (const c of [9, 17]) { ws.getCell(r, c).numFmt = '0.0%'; ws.getCell(r, c).alignment = { horizontal: 'right' }; } ws.getCell(r, 18).numFmt = '#,##0.0'; }

  // ma trận
  const top = tong.theo_noi_dong.slice(0, TOP_MA_TRAN);
  const ws2 = wb.addWorksheet('Theo ngày (20 nơi đầu)', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
  ws2.addRow(['Số hàng nội tỉnh đóng vào 530100 theo ngày (ngày hàng đến Khai thác), 20 nơi có nhiều hàng nhất. Ô trống = không có.']); ws2.mergeCells(1, 1, 1, 12); ws2.getRow(1).font = { italic: true };
  dongTieuDe(ws2, ['Thứ tự', 'Mã bưu cục', 'Tên bưu cục', ...k.ngays.map(dd), `Cộng ${soNgay} ngày`], 30);
  top.forEach((r, i) => ws2.addRow([i + 1, r.ma, r.ten || 'chưa có tên', ...ds.map((d) => (d.noi[r.ma] && d.noi[r.ma].n2 > 0 ? d.noi[r.ma].n2 : null)), r.dong_vao_530100]));
  const tg = ws2.addRow(['', '', 'Tổng ngày (20 nơi)', ...ds.map((d) => top.reduce((s, r) => s + (d.noi[r.ma] ? d.noi[r.ma].n2 : 0), 0)), top.reduce((s, r) => s + r.dong_vao_530100, 0)]);
  tg.font = { bold: true }; tg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  ws2.getColumn(1).width = 8; ws2.getColumn(2).width = 11; ws2.getColumn(3).width = 26; for (let c = 4; c < 4 + ds.length; c++) ws2.getColumn(c).width = 6.5; ws2.getColumn(4 + ds.length).width = 14;

  // giải thích
  const ws3 = wb.addWorksheet('Giải thích'); ws3.getColumn(1).width = 150;
  const khac = tong.theo_noi_dong.filter((r) => nhomChu(r.ma, r.loai_hinh, r.nhom_loai_hinh).startsWith('Loại hình khác')).map((r) => `${r.ma} ${r.ten || 'chưa có tên'} (${r.loai_hinh})`);
  const g = [
    ['CÁCH TÍNH', true],
    ['• «Nơi đóng» là nơi đóng chuyến thư (mã bưu cục ghi trên chuyến thư gửi vào Khai thác 530100 hoặc đóng thẳng đến bưu cục văn hóa).'],
    ['• «Đóng vào 530100»: chuyến thư/túi có nơi nhận là Khai thác 530100, trong khi bưu gửi đi đến một trong 6 bưu cục văn hóa Huế (Thuận Hóa, Hương Trà, Hương Thủy, Phú Lộc, Thuận An, A Lưới). Khai thác phải mở túi, khai thác lại rồi mới đi tiếp.'],
    ['• «Đóng thẳng BCVH»: chuyến thư đã đóng đến thẳng bưu cục văn hóa; Khai thác chỉ chuyển tiếp, không mở túi.'],
    [`• Hàng nội tỉnh = bưu gửi có nơi gửi bắt đầu bằng 53 và đến 6 bưu cục văn hóa Huế, đúng tập số liệu mục 2 «Nội tỉnh đến → 6 BCVH Huế» trên màn «Lịch xe, đường thư»; hàng hoàn không tính. Tổng ${so(m.tong_noi_tinh)} bưu gửi (đóng vào 530100 ${so(m.n2)}, đóng thẳng BCVH ${so(m.n1)}, chưa rõ cách đóng ${so(m.n3)}).`],
    [`• Tỷ lệ đóng vào 530100 = hàng đóng vào 530100 ÷ (hàng đóng vào 530100 + hàng đóng thẳng BCVH). Không tính hàng chưa rõ cách đóng. Ô có tổng dưới ${HD.NGUONG_IT_MAU} bưu gửi ghi «Ít mẫu».`],
    [`• «Chuyến có lẫn hàng nội tỉnh»: chuyến thư vào 530100 có ít nhất một bưu gửi nội tỉnh đến 6 BCVH (kể cả hàng chưa rõ cách đóng). Trong khoảng này có ${so(m.so_chuyen_co_lan)} chuyến lẫn trên ${so(m.so_chuyen_vao_530100)} chuyến thư vào 530100 của các nơi trong bảng.`],
    ['• «Số ngày vừa đóng thẳng BCVH vừa đóng vào 530100»: trong cùng một ngày nơi đó vừa có hàng nội tỉnh đóng thẳng BCVH vừa có hàng nội tỉnh đóng vào 530100 (cho thấy nơi đó có biết cách đóng thẳng).'],
    [''],
    ['NGUYÊN TẮC', true],
    ['• Hàng đi các tỉnh khác vẫn phải đóng vào 530100 — đó là ĐÚNG và không nằm trong file này. Chỉ các cột về HÀNG NỘI TỈNH đến 6 BCVH mới nói đến việc đóng sai (hàng nội tỉnh phải đóng thẳng BCVH).'],
    [''],
    ['GIỚI HẠN — ĐỌC TRƯỚC KHI NHẮC VIỆC', true],
    ['• Nơi đóng chuyến thư CÓ THỂ KHÔNG PHẢI điểm chấp nhận gốc của bưu gửi: có thể là nơi gom hoặc lập chuyến cho chặng sau. Hiện chưa có dữ liệu bưu cục chấp nhận ban đầu.'],
    ['• Nhóm «BCVH (có thể gom từ nơi khác)»: bưu cục văn hóa có thể đang đóng chuyến thư cho hàng nhận từ nơi khác. Cần hỏi lại trước khi nhắc. Số hàng do chính 6 BCVH đóng không liệt kê ở bảng này.'],
    ['• 531120 Khách hàng lớn: chưa biết có thoả thuận đóng chuyến thư riêng hay không.'],
    ['• 530000 «Huế» là bưu cục loại GD1, xếp vào nhóm «Bưu cục địa phương».'],
    [`• Mã thuộc loại hình khác (không phải GD1, GD2, GD3, VHX, PH1, PH2) được ghi đúng loại hình trong danh mục, không tự xếp nhóm: ${khac.length ? khac.join('; ') : 'không có'}.`],
    [`• Hàng hoàn không tính. Ngày hàng đến là ngày giờ quét túi đến Khai thác, thiếu thì ngày xác nhận BD10 đến. Có ${so(m.so_hang_ghi_ngay_cu)} bưu gửi (thuộc ${so(m.so_chuyen_thu_ghi_ngay_cu)} chuyến thư) đóng vào 530100 có chuyến thư ghi ngày cũ (cách ngày hàng đến hơn ${HD.NGAY_LECH_CU} ngày): chưa rõ là ghi nhận chậm hay đóng sai nên không dùng nhóm này để nhắc đơn vị.`],
    [`• Khoảng thời gian: ${soNgay} ngày từ ${dmy(k.tuNgay)} đến ${dmy(k.denNgay)}; dữ liệu Khai thác cập nhật đến ${doMoi || 'chưa có'}. Ngày cuối của khoảng có thể chưa trọn nếu dữ liệu mới đến giữa ngày.`],
    ['• Tên bưu cục, loại hình, BĐX lấy từ danh mục bưu cục của hệ thống; mã không có trong danh mục ghi «chưa có tên».'],
    ['• Thời gian hàng bị mất thêm do khai thác lại: KHÔNG đưa vào file này vì chưa đo đủ chắc.'],
    ['• Cột dịch vụ và BCVH: chỉ nêu dịch vụ / bưu cục văn hóa có nhiều hàng đóng vào 530100 nhất của nơi đó.']
  ];
  g.forEach(([t, b]) => { const r = ws3.addRow([t]); r.alignment = { wrapText: true, vertical: 'top' }; if (b) r.font = { bold: true, size: 12 }; });
  return wb;
}

const COT_CHI_TIET = ['Số hiệu bưu gửi', 'Mã nơi đóng', 'Tên nơi đóng', 'Ngày hàng đến Khai thác', 'Ngày đóng chuyến thư', 'Chuyến thư ghi ngày cũ (hơn 7 ngày): có/không', 'Số chuyến thư', 'Loại chuyến thư', 'Ngày ghi trên chuyến thư', 'Mã dịch vụ của chuyến', 'BCVH đích', 'Dịch vụ', 'Khối lượng (kg)'];

/** Nội dung file chi tiết (có số hiệu bưu gửi). `dongN2`, `dongN3`: các dòng của bó (kttHuongDong.tinhNgay.rows) đã lọc, bỏ 6 BCVH. */
function taoChiTiet({ k, dongN2, dongN3, danhMuc }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Khai thác Huế';
  const mk = (ten, rs, ghiChu) => {
    const s = wb.addWorksheet(ten, { views: [{ state: 'frozen', ySplit: 3 }] });
    s.addRow([CANH_BAO_CHI_TIET]); s.getRow(1).font = { bold: true, color: { argb: 'FFC00000' } }; s.mergeCells(1, 1, 1, 13);
    s.addRow([ghiChu]); s.mergeCells(2, 1, 2, 13); s.getRow(2).font = { italic: true };
    dongTieuDe(s, COT_CHI_TIET, 45);
    for (const r of rs) {
      const p = danhMuc[r.noi];
      s.addRow([r.shbg, r.noi, p ? p.ten : 'chưa có tên', r.ngay_den, r.ngay_dong || '', r.ngay_dong ? (r.cu ? 'có' : 'không') : 'không rõ', r.so_chuyen, r.loai_chuyen, r.nam_chuyen, r.dv_chuyen,
        r.bcvh ? `${r.bcvh} ${DQ.TEN_BCVH[r.bcvh] || ''}`.trim() : '', `${r.dv} ${r.dv_ten}`.trim(), r.kg === null ? '' : r.kg]);
    }
    [18, 11, 26, 16, 16, 18, 12, 12, 14, 14, 20, 36, 14].forEach((w, i) => { s.getColumn(i + 1).width = w; });
    s.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rs.length, column: 13 } };
    s.getColumn(13).numFmt = '0.000';
  };
  mk('Chi tiết', dongN2, `Mỗi dòng một bưu gửi hàng nội tỉnh đóng vào 530100 (${k.ngays.length} ngày từ ${dmy(k.tuNgay)} đến ${dmy(k.denNgay)}), không kể 6 BCVH đóng. Không có tên, địa chỉ, số điện thoại người gửi hoặc người nhận.`);
  mk('Chưa chắc', dongN3, 'Bưu gửi vừa có túi gửi vào 530100 vừa có túi chuyển tiếp nên chưa rõ đi bằng túi nào (xếp riêng, KHÔNG tính vào sheet «Chi tiết»). Nơi đóng và chuyến thư ghi theo túi gửi vào 530100.');
  return wb;
}

/** Ghi workbook ra luồng HTTP. Trả { rows, aborted }. */
async function ghiWorkbook(out, wb, rows, dungChua = () => false) {
  if (dungChua()) return { rows: 0, aborted: true };
  await wb.xlsx.write(out);
  if (!out.writableEnded) out.end();
  return { rows, aborted: false };
}

module.exports = { taoNhacViec, taoChiTiet, ghiWorkbook, CANH_BAO_CHI_TIET, COT_CHI_TIET, TOP_MA_TRAN, tranDong: X.tranDong, LoiKtt: Q.LoiKtt };
