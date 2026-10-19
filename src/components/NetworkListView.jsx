import React, { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import {
  Network,
  Search,
  Plus,
  Upload,
  Download,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Building2,
  Phone,
  Compass,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  Save,
  Eye
} from 'lucide-react';
import { apiFetch, apiFetchJson } from '../utils/api';

// ==========================================
// "Danh Sách" — màn hình duy nhất của "Quản Lý Mạng Lưới" (kế thừa từ it-assets v1.0.0).
// Đổi tên từ UnitTreeView.jsx (đã bị ghi đè thành bảng CRUD ở feat/network-management-frontend)
// sang NetworkListView.jsx — GIỮ NGUYÊN toàn bộ logic CRUD/Export/Import, chỉ thiết kế lại
// phần hiển thị bảng "Danh Sách" (layout PO duyệt: 5 cột gộp cell + 4 dropdown lọc động +
// autocomplete "Người Phụ Trách") theo hạng mục riêng bên dưới.
// Backend: GET/POST(import)/PUT/DELETE /api/network* (feat/network-management-backend,
// feat/network-responsible-person-backend, đã merge main).
// ==========================================

// 20 cột theo ĐÚNG file Excel mạng lưới PO cung cấp — key khớp tuyệt đối với
// GET /api/network/export-data / POST /api/network/import (xem
// docs/ai/03_ARCHITECTURE_MAP.md mục "Quản Lý Mạng Lưới — bảng 21 field JSON").
// `required: true` = Mã MBC, bắt buộc mọi dòng khi import.
const NETWORK_FIELDS = [
  { key: 'maBdtTp', label: 'Mã BĐT/TP', required: false, note: 'Mã Bưu Điện Tỉnh/Thành Phố. Dùng để tự tạo mới chuỗi tổ chức nếu Mã MBC chưa có.', example: '53' },
  { key: 'tenBdtTp', label: 'Tên BĐT/TP', required: false, note: 'Tên đầy đủ Bưu Điện Tỉnh/Thành Phố.', example: 'Bưu Điện Tỉnh TT-Huế' },
  { key: 'maBdx', label: 'Mã BĐX', required: false, note: 'Mã bưu điện xã. Bắt buộc nếu Mã MBC chưa có trong hệ thống (để tạo mới bưu cục).', example: 'BDX01' },
  { key: 'tenBuuDienXa', label: 'Tên Bưu Điện Xã', required: false, note: 'Dùng khi tạo mới BĐX.', example: 'BĐX Phú Vang' },
  { key: 'buuDienXaTrungTam', label: 'Bưu Điện Xã Trung Tâm', required: false, note: 'Dùng khi tạo mới BĐX.', example: 'BDX01-TT' },
  { key: 'maMbc', label: 'Mã MBC', required: true, note: 'Mã bưu cục. BẮT BUỘC ở MỌI dòng — đây là khoá để tạo mới hoặc cập nhật.', example: 'MBC001' },
  { key: 'tenBuuCuc', label: 'Tên Bưu Cục', required: false, note: 'Dùng khi tạo mới bưu cục (nếu Mã MBC chưa có).', example: 'Bưu cục Trung tâm' },
  { key: 'loai', label: 'Loại', required: false, note: 'Loại bưu cục (GD1/GD2/GD3/VHX/PH1/PH2/VP/TD...). Bỏ trống -> mặc định GD3 lúc tạo mới.', example: 'GD3' },
  { key: 'diaChiChiTiet', label: 'Địa Chỉ Chi Tiết', required: false, note: '', example: '123 Đường Lê Lợi' },
  { key: 'maBdkv', label: 'Mã BĐKV', required: false, note: '', example: 'KV1' },
  { key: 'tenBdkv', label: 'Tên BĐKV', required: false, note: '', example: 'Khu vực 1' },
  { key: 'maPhuongXaCu', label: 'Mã Phường/Xã Cũ', required: false, note: 'Mã Phường/Xã trước sáp nhập.', example: 'PXC01' },
  { key: 'tenPhuongXaCu', label: 'Tên Phường/Xã Cũ', required: false, note: '', example: 'Phường An Cựu' },
  { key: 'tenQuanHuyen', label: 'Tên Quận/Huyện', required: false, note: '', example: 'Quận Thuận Hoá' },
  { key: 'maPhuongXaMoi', label: 'Mã Phường/Xã Mới', required: false, note: 'Mã Phường/Xã sau sáp nhập.', example: 'PXM01' },
  { key: 'tenPhuongXaMoi', label: 'Tên Phường/Xã Mới', required: false, note: '', example: 'Phường Thuận Hoá' },
  { key: 'soDienThoai', label: 'Số Điện Thoại', required: false, note: '', example: '0234123456' },
  { key: 'tinhTrangHoatDong', label: 'Tình Trạng Hoạt Động', required: false, note: 'Chỉ nhận ACTIVE hoặc INACTIVE. Bỏ trống -> mặc định ACTIVE khi tạo mới, giữ nguyên khi cập nhật.', example: 'ACTIVE' },
  { key: 'viDo', label: 'Vĩ Độ', required: false, note: 'Số thực (vd 16.4637).', example: '16.4637' },
  { key: 'kinhDo', label: 'Kinh Độ', required: false, note: 'Số thực (vd 107.5909).', example: '107.5909' }
];

// ==========================================
// Helper Excel
// ==========================================
function cellToString(cell) {
  const v = cell ? cell.value : null;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((rt) => rt.text).join('');
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(v).trim();
}

function buildHeaderKeyMap(headerRow) {
  const map = {};
  headerRow.eachCell((cell, colNumber) => {
    const label = cellToString(cell).trim().toLowerCase();
    const field = NETWORK_FIELDS.find((f) => f.label.trim().toLowerCase() === label);
    if (field) map[colNumber] = field.key;
  });
  return map;
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function generateNetworkTemplate() {
  const workbook = new ExcelJS.Workbook();

  const dataSheet = workbook.addWorksheet('Dữ Liệu');
  dataSheet.addRow(NETWORK_FIELDS.map((f) => f.label));
  dataSheet.getRow(1).font = { bold: true };
  const exampleCreate = {
    maBdtTp: '53', tenBdtTp: 'Bưu Điện Tỉnh TT-Huế', maBdx: 'BDX01', tenBuuDienXa: 'BĐX Phú Vang',
    buuDienXaTrungTam: '', maMbc: 'MBC001', tenBuuCuc: 'Bưu cục Trung tâm', loai: 'GD3',
    diaChiChiTiet: '123 Đường Lê Lợi', maBdkv: 'KV1', tenBdkv: 'Khu vực 1',
    maPhuongXaCu: 'PXC01', tenPhuongXaCu: 'Phường An Cựu', tenQuanHuyen: 'Quận Thuận Hoá',
    maPhuongXaMoi: 'PXM01', tenPhuongXaMoi: 'Phường Thuận Hoá', soDienThoai: '0234123456',
    tinhTrangHoatDong: 'ACTIVE', viDo: '16.4637', kinhDo: '107.5909'
  };
  const exampleUpdate = {
    maBdtTp: '', tenBdtTp: '', maBdx: '', tenBuuDienXa: '', buuDienXaTrungTam: '',
    maMbc: 'MBC001', tenBuuCuc: '', loai: '', diaChiChiTiet: '', maBdkv: '', tenBdkv: '',
    maPhuongXaCu: '', tenPhuongXaCu: '', tenQuanHuyen: '', maPhuongXaMoi: '', tenPhuongXaMoi: '',
    soDienThoai: '0234999888', tinhTrangHoatDong: 'INACTIVE', viDo: '', kinhDo: ''
  };
  dataSheet.addRow(NETWORK_FIELDS.map((f) => exampleCreate[f.key] ?? ''));
  dataSheet.addRow(NETWORK_FIELDS.map((f) => exampleUpdate[f.key] ?? ''));
  dataSheet.columns.forEach((col) => { col.width = 20; });

  const guideSheet = workbook.addWorksheet('Hướng Dẫn');
  guideSheet.addRow(['Tên Cột', 'Bắt Buộc?', 'Ý Nghĩa', 'Ví Dụ / Giá Trị Hợp Lệ']);
  guideSheet.getRow(1).font = { bold: true };
  NETWORK_FIELDS.forEach((f) => {
    guideSheet.addRow([f.label, f.required ? 'Bắt buộc (mọi dòng)' : 'Không bắt buộc', f.note, f.example]);
  });
  guideSheet.addRow([]);
  guideSheet.addRow(['Lưu ý chung', '', 'Mỗi dòng phải có Mã MBC. Nếu Mã MBC CHƯA có trong hệ thống -> tạo mới (cần Mã BĐX/Mã BĐT-TP để dựng chuỗi tổ chức). Nếu Mã MBC ĐÃ có -> chỉ CẬP NHẬT các cột có giá trị trong dòng, cột để trống giữ nguyên dữ liệu cũ.', '']);
  guideSheet.columns = [{ width: 24 }, { width: 20 }, { width: 60 }, { width: 30 }];
  guideSheet.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

  await downloadWorkbook(workbook, 'template-import-mang-luoi.xlsx');
}

// ==========================================
// Modal: Export Mạng Lưới
// ==========================================
function ExportNetworkModal({ onClose, search, communeId }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setError('');

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (communeId) params.append('communeId', communeId);
    const query = params.toString();

    const result = await apiFetchJson(`/api/network/export-data${query ? `?${query}` : ''}`);
    if (!result.ok) {
      setExporting(false);
      setError(result.error);
      return;
    }

    try {
      const items = result.data.items || [];
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Dữ Liệu');
      sheet.addRow(NETWORK_FIELDS.map((f) => f.label));
      items.forEach((item) => {
        sheet.addRow(NETWORK_FIELDS.map((f) => (item[f.key] === undefined || item[f.key] === null ? '' : item[f.key])));
      });
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((col) => { col.width = 18; });

      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      await downloadWorkbook(workbook, `mang-luoi-export-${stamp}.xlsx`);
      setExporting(false);
      onClose();
    } catch (err) {
      console.error(err);
      setExporting(false);
      setError('Không tạo được file Excel: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 -md flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-lg rounded-2xl border border-[var(--color-border)]/60 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-white">
          <h3 className="font-bold text-base text-[var(--color-title)] flex items-center gap-2">
            <Download className="w-5 h-5 text-[var(--color-primary)]" />
            <span>Export Mạng Lưới Ra Excel</span>
          </h3>
          <button onClick={onClose} className="text-[var(--color-body)] hover:text-[var(--color-title)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-[var(--color-body)]">
            Xuất toàn bộ 20 cột theo đúng thứ tự chuẩn, dùng đúng bộ lọc đang áp dụng trên danh sách
            {search || communeId ? ' (đang lọc)' : ' (không lọc — toàn bộ bưu cục)'}.
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-3 rounded-xl btn btn-dark flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{exporting ? 'Đang xuất file...' : 'Xuất File Excel'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Modal: Import Mạng Lưới
// ==========================================
function ImportNetworkModal({ onClose, onSuccess }) {
  const [fileName, setFileName] = useState('');
  const [headerFields, setHeaderFields] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importErrorRows, setImportErrorRows] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);

  const handleDownloadTemplate = async () => {
    setGeneratingTemplate(true);
    try {
      await generateNetworkTemplate();
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setImportResult(null);
    setImportError('');
    setImportErrorRows(null);
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Dữ Liệu') || workbook.worksheets[0];
      if (!worksheet) {
        setParseError('File Excel không có sheet nào');
        setParsing(false);
        return;
      }

      const keyMap = buildHeaderKeyMap(worksheet.getRow(1));
      const matchedFields = Object.values(keyMap);
      if (matchedFields.length === 0) {
        setParseError('Không nhận diện được cột nào ở dòng tiêu đề (dòng 1) — vui lòng dùng đúng file mẫu từ nút "Tải Template Mẫu"');
        setParsing(false);
        return;
      }
      if (!matchedFields.includes('maMbc')) {
        setParseError('File thiếu cột "Mã MBC" (bắt buộc để import)');
        setParsing(false);
        return;
      }

      const orderedFields = NETWORK_FIELDS.filter((f) => matchedFields.includes(f.key));
      setHeaderFields(orderedFields);

      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj = {};
        let hasAnyValue = false;
        Object.entries(keyMap).forEach(([colNumber, key]) => {
          const val = cellToString(row.getCell(Number(colNumber)));
          if (val) hasAnyValue = true;
          obj[key] = val;
        });
        if (!hasAnyValue) return;
        rows.push(obj);
      });

      if (rows.length === 0) {
        setParseError('Không đọc được dòng dữ liệu nào (kiểm tra file có dữ liệu từ dòng 2 trở đi)');
      }
      setParsedRows(rows);
    } catch (err) {
      console.error(err);
      setParseError('Không đọc được file Excel: ' + err.message);
      setParsedRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportError('');
    setImportErrorRows(null);

    const result = await apiFetchJson('/api/network/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: parsedRows })
    });

    setImporting(false);
    if (!result.ok) {
      setImportError(result.error);
      if (Array.isArray(result.data && result.data.errors) && result.data.errors.length > 0) {
        setImportErrorRows(result.data.errors);
      }
      return;
    }
    setImportResult(result.data);
    onSuccess();
  };

  const invalidRowCount = parsedRows.filter((r) => !r.maMbc).length;
  const previewRows = parsedRows.slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 -md flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-5xl rounded-2xl border border-[var(--color-border)]/60 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
          <h3 className="font-bold text-base text-[var(--color-title)] flex items-center gap-2">
            <Upload className="w-5 h-5 text-[var(--color-primary)]" />
            <span>Import Mạng Lưới Từ Excel</span>
          </h3>
          <button onClick={onClose} className="text-[var(--color-body)] hover:text-[var(--color-title)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs overflow-y-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-[var(--color-body)]">
              File <code className="text-[var(--color-primary)]">.xlsx</code> sheet "Dữ Liệu", dòng 1 là tiêu đề cột.
              Mỗi dòng phải có <b>Mã MBC</b>. Mã đã có → cập nhật; mã chưa có → tạo mới (kèm Tỉnh/BĐX nếu cần).
            </p>
            <button
              onClick={handleDownloadTemplate}
              disabled={generatingTemplate}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--color-primary)] input-soft hover:border-orange-300 transition-all disabled:opacity-50"
            >
              {generatingTemplate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              <span>Tải Template Mẫu</span>
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">
              Chọn File Excel (.xlsx)
            </label>
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="w-full input-soft p-3 rounded-xl text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-orange-50 file:text-[var(--color-primary)] file:text-xs file:font-semibold"
            />
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-[var(--color-body)]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Đang đọc file Excel...</span>
            </div>
          )}

          {parseError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {parsedRows.length > 0 && !importResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-[var(--color-title)] flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>
                    Xem Trước ({parsedRows.length} dòng từ "{fileName}"
                    {parsedRows.length > 20 ? ` — hiện 20 dòng đầu` : ''})
                  </span>
                </h4>
                {invalidRowCount > 0 && (
                  <span className="text-red-600 text-[11px] font-semibold">
                    {invalidRowCount} dòng thiếu Mã MBC — sẽ bị chặn khi Import
                  </span>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl overflow-auto max-h-[320px]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-cream-head text-gray-600 font-bold border-b border-cream-line sticky top-0">
                    <tr>
                      {headerFields.map((f) => (
                        <th key={f.key} className="py-2 px-3 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-line tabular-nums">
                    {previewRows.map((r, idx) => {
                      const invalid = !r.maMbc;
                      return (
                        <tr key={idx} className={invalid ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          {headerFields.map((f) => (
                            <td key={f.key} className="py-1.5 px-3 text-[var(--color-body)] whitespace-nowrap">
                              {r[f.key] || <span className="text-gray-500">—</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {importError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{importError}</span>
                  </div>
                  {importErrorRows && (
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      {importErrorRows.map((e, idx) => (
                        <li key={idx}>Dòng {e.row}: {e.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={importing || invalidRowCount > 0}
                className="w-full py-3 rounded-xl btn btn-dark flex items-center justify-center gap-2 disabled:opacity-50"
                title={invalidRowCount > 0 ? 'Sửa các dòng thiếu Mã MBC trong file rồi tải lại' : ''}
              >
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{importing ? 'Đang Import...' : `Import ${parsedRows.length} Bưu Cục`}</span>
              </button>
            </div>
          )}

          {importResult && (
            <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Import thành công!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Bưu Điện Tỉnh Mới', importResult.provincesCreated],
                  ['BĐX Mới', importResult.communesCreated],
                  ['Bưu Cục Mới', importResult.postOfficesCreated],
                  ['Bưu Cục Cập Nhật', importResult.postOfficesUpdated]
                ].map(([label, value]) => (
                  <div key={label} className="p-2.5 rounded-lg bg-white text-center">
                    <div className="text-[10px] text-[var(--color-body)]">{label}</div>
                    <div className="text-lg font-bold text-green-600">{value ?? 0}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={onClose}
                className="w-full mt-2 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-[var(--color-title)] font-semibold text-xs transition-all"
              >
                Đóng
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Autocomplete dùng chung: "Người Phụ Trách" — COPY đúng pattern autocomplete
// gọi GET /api/users/search, gợi ý "Mã HRM-Họ Tên-Mã BC-Mã BĐX".
// ==========================================
function ResponsiblePersonField({ displayValue, onChangeDisplay, onSelectPerson }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = React.useRef(null);

  const handleChange = (val) => {
    onChangeDisplay(val);
    setShowSuggestions(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val || !val.trim()) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const result = await apiFetchJson(`/api/users/search?q=${encodeURIComponent(val.trim())}`);
      if (result.ok) {
        setSuggestions(Array.isArray(result.data) ? result.data : []);
      }
    }, 300);
  };

  const handleSelect = (p) => {
    onSelectPerson(p);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="relative col-span-2">
      <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Người Phụ Trách</label>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder="Gõ Mã HRM hoặc Họ Tên để tìm..."
        autoComplete="off"
        className="w-full input-soft p-2.5 rounded-xl text-xs"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white shadow-xl divide-y divide-gray-200">
          {suggestions.map((p) => (
            <li
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(p)}
              className="px-3 py-2 text-[11px] text-[var(--color-title)] hover:bg-sky-50 hover:text-sky-600 cursor-pointer"
            >
              {p.hrm_code || '—'}-{p.full_name}-{p.post_office_code || '—'}-{p.commune_code || '—'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ==========================================
// Modal: Thêm / Sửa Bưu Cục
// ------------------------------------------------------------------
// THÊM MỚI: không có route POST /api/network/post-offices riêng — dùng lại
// POST /api/network/import với rows: [1 dòng] (đúng 20 key Excel + maHrmNguoiPhuTrach
// nếu có gán người phụ trách), route này tự resolve/tạo Tỉnh->BĐX->Bưu cục qua
// resolveOrCreateOrgChain().
// SỬA: PUT /api/network/post-offices/:id dùng bộ key KHÁC (tên cột DB thật:
// name/type/address/communeId/bdkv_code/bdkv_name/old_ward_code/.../latitude/
// longitude/responsible_user_id) — KHÔNG đổi được code (Mã MBC), KHÔNG tự tạo/đổi tên
// Tỉnh/BĐX, chỉ gán lại BĐX đã có sẵn qua dropdown communeId.
// ==========================================
function PostOfficeFormModal({ editing, communes, onClose, onSuccess }) {
  const isEdit = !!editing;
  const [form, setForm] = useState({
    maBdtTp: '', tenBdtTp: '',
    maBdx: '', tenBuuDienXa: '', buuDienXaTrungTam: '',
    communeId: editing ? editing.commune_id : '',
    maMbc: editing ? editing.code : '',
    tenBuuCuc: editing ? editing.name : '',
    loai: editing ? (editing.type || '') : '',
    diaChiChiTiet: editing ? (editing.address || '') : '',
    maBdkv: editing ? (editing.bdkv_code || '') : '',
    tenBdkv: editing ? (editing.bdkv_name || '') : '',
    maPhuongXaCu: editing ? (editing.old_ward_code || '') : '',
    tenPhuongXaCu: editing ? (editing.old_ward_name || '') : '',
    tenQuanHuyen: editing ? (editing.district_name || '') : '',
    maPhuongXaMoi: editing ? (editing.new_ward_code || '') : '',
    tenPhuongXaMoi: editing ? (editing.new_ward_name || '') : '',
    soDienThoai: editing ? (editing.phone || '') : '',
    tinhTrangHoatDong: editing ? (editing.operational_status || 'ACTIVE') : 'ACTIVE',
    viDo: editing && editing.latitude !== null && editing.latitude !== undefined ? String(editing.latitude) : '',
    kinhDo: editing && editing.longitude !== null && editing.longitude !== undefined ? String(editing.longitude) : ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Người Phụ Trách (autocomplete). responsibleUserId dùng cho PUT (Sửa); responsibleUserHrm
  // (mã HRM) dùng cho POST /api/network/import (Thêm mới) — route đó chỉ nhận
  // maHrmNguoiPhuTrach chứ không nhận id thẳng. Gõ tự do (không chọn gợi ý) sẽ tự gỡ
  // cả 2 về null/rỗng.
  const [responsibleDisplay, setResponsibleDisplay] = useState(editing ? (editing.responsible_user_name || '') : '');
  const [responsibleUserId, setResponsibleUserId] = useState(editing ? (editing.responsible_user_id || null) : null);
  const [responsibleUserHrm, setResponsibleUserHrm] = useState(editing ? (editing.responsible_user_hrm || '') : '');

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleResponsibleChangeDisplay = (val) => {
    setResponsibleDisplay(val);
    setResponsibleUserId(null);
    setResponsibleUserHrm('');
  };

  const handleResponsibleSelect = (p) => {
    setResponsibleUserId(p.id);
    setResponsibleUserHrm(p.hrm_code || '');
    setResponsibleDisplay(p.full_name);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdit && !form.maMbc.trim()) {
      setError('Vui lòng nhập Mã MBC (mã bưu cục)');
      return;
    }
    if (!form.tenBuuCuc.trim()) {
      setError('Vui lòng nhập Tên Bưu Cục');
      return;
    }

    setLoading(true);
    setError('');

    let result;
    if (isEdit) {
      // responsible_user_id: chọn đúng 1 gợi ý -> gửi id đó. Ô để trống (không gõ gì,
      // hoặc xoá hết) -> nếu bưu cục đang có người phụ trách thì gửi null để gỡ gán,
      // chưa từng có thì giữ nguyên (undefined, không gửi field). Gõ tự do không chọn
      // gợi ý (không rỗng) -> coi như chưa xác định được liên kết -> gỡ gán (null).
      const hadResponsibleInitially = !!(editing && editing.responsible_user_id);
      let responsiblePayload;
      if (responsibleUserId) {
        responsiblePayload = responsibleUserId;
      } else if (responsibleDisplay.trim() === '') {
        responsiblePayload = hadResponsibleInitially ? null : undefined;
      } else {
        responsiblePayload = null;
      }

      result = await apiFetchJson(`/api/network/post-offices/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.tenBuuCuc.trim(),
          type: form.loai.trim() || null,
          address: form.diaChiChiTiet.trim() || null,
          communeId: form.communeId || undefined,
          bdkv_code: form.maBdkv.trim() || null,
          bdkv_name: form.tenBdkv.trim() || null,
          old_ward_code: form.maPhuongXaCu.trim() || null,
          old_ward_name: form.tenPhuongXaCu.trim() || null,
          district_name: form.tenQuanHuyen.trim() || null,
          new_ward_code: form.maPhuongXaMoi.trim() || null,
          new_ward_name: form.tenPhuongXaMoi.trim() || null,
          phone: form.soDienThoai.trim() || null,
          operational_status: form.tinhTrangHoatDong.trim() || null,
          latitude: form.viDo.trim() || null,
          longitude: form.kinhDo.trim() || null,
          responsible_user_id: responsiblePayload
        })
      });
    } else {
      result = await apiFetchJson('/api/network/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{
            maBdtTp: form.maBdtTp.trim(),
            tenBdtTp: form.tenBdtTp.trim(),
            maBdx: form.maBdx.trim(),
            tenBuuDienXa: form.tenBuuDienXa.trim(),
            buuDienXaTrungTam: form.buuDienXaTrungTam.trim(),
            maMbc: form.maMbc.trim(),
            tenBuuCuc: form.tenBuuCuc.trim(),
            loai: form.loai.trim(),
            diaChiChiTiet: form.diaChiChiTiet.trim(),
            maBdkv: form.maBdkv.trim(),
            tenBdkv: form.tenBdkv.trim(),
            maPhuongXaCu: form.maPhuongXaCu.trim(),
            tenPhuongXaCu: form.tenPhuongXaCu.trim(),
            tenQuanHuyen: form.tenQuanHuyen.trim(),
            maPhuongXaMoi: form.maPhuongXaMoi.trim(),
            tenPhuongXaMoi: form.tenPhuongXaMoi.trim(),
            soDienThoai: form.soDienThoai.trim(),
            tinhTrangHoatDong: form.tinhTrangHoatDong.trim(),
            viDo: form.viDo.trim(),
            kinhDo: form.kinhDo.trim(),
            maHrmNguoiPhuTrach: responsibleUserHrm.trim()
          }]
        })
      });
    }

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // POST /api/network/import trả report { postOfficesCreated, errors... } chứ
    // không phải { message } — nếu có errors bên trong report (theo dòng), báo rõ.
    if (!isEdit && Array.isArray(result.data.errors) && result.data.errors.length > 0) {
      setError(result.data.errors.map((er) => `Dòng ${er.row}: ${er.message}`).join('; '));
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 -md flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-2xl rounded-2xl border border-[var(--color-border)]/60 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
          <h3 className="font-bold text-base text-[var(--color-title)] flex items-center gap-2">
            {isEdit ? <Edit className="w-5 h-5 text-[var(--color-primary)]" /> : <Plus className="w-5 h-5 text-[var(--color-primary)]" />}
            <span>{isEdit ? `Sửa Bưu Cục — ${editing.code}` : 'Thêm Bưu Cục Mới'}</span>
          </h3>
          <button onClick={onClose} className="text-[var(--color-body)] hover:text-[var(--color-title)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!isEdit && (
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-3">
              <div className="text-[11px] font-semibold text-sky-600 uppercase">Tổ chức (chỉ cần nếu Mã BĐX/Tỉnh chưa có sẵn)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã BĐT/TP</label>
                  <input type="text" value={form.maBdtTp} onChange={setField('maBdtTp')} placeholder="53" className="w-full input-soft p-2.5 rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên BĐT/TP</label>
                  <input type="text" value={form.tenBdtTp} onChange={setField('tenBdtTp')} placeholder="Bưu Điện Tỉnh TT-Huế" className="w-full input-soft p-2.5 rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã BĐX</label>
                  <input type="text" value={form.maBdx} onChange={setField('maBdx')} placeholder="BDX01" className="w-full input-soft p-2.5 rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên BĐX</label>
                  <input type="text" value={form.tenBuuDienXa} onChange={setField('tenBuuDienXa')} placeholder="BĐX Phú Vang" className="w-full input-soft p-2.5 rounded-xl text-xs" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Bưu Điện Xã Trung Tâm</label>
                  <input type="text" value={form.buuDienXaTrungTam} onChange={setField('buuDienXaTrungTam')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
                </div>
              </div>
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">BĐX gán cho bưu cục</label>
              <select value={form.communeId} onChange={setField('communeId')} className="w-full input-soft p-2.5 rounded-xl text-xs">
                {communes.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã MBC {!isEdit && <span className="text-red-600">*</span>}</label>
              <input
                type="text"
                value={form.maMbc}
                onChange={setField('maMbc')}
                disabled={isEdit}
                placeholder="MBC001"
                className="w-full input-soft p-2.5 rounded-xl text-xs disabled:opacity-60"
                required={!isEdit}
              />
              {isEdit && <p className="text-[10px] text-[var(--color-body)] mt-1">Mã bưu cục không thể đổi sau khi tạo.</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên Bưu Cục <span className="text-red-600">*</span></label>
              <input type="text" value={form.tenBuuCuc} onChange={setField('tenBuuCuc')} placeholder="Bưu cục Trung tâm" className="w-full input-soft p-2.5 rounded-xl text-xs" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Loại</label>
              <input type="text" value={form.loai} onChange={setField('loai')} placeholder="GD3" className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tình Trạng Hoạt Động</label>
              <select value={form.tinhTrangHoatDong} onChange={setField('tinhTrangHoatDong')} className="w-full input-soft p-2.5 rounded-xl text-xs">
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Địa Chỉ Chi Tiết</label>
              <input type="text" value={form.diaChiChiTiet} onChange={setField('diaChiChiTiet')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã BĐKV</label>
              <input type="text" value={form.maBdkv} onChange={setField('maBdkv')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên BĐKV</label>
              <input type="text" value={form.tenBdkv} onChange={setField('tenBdkv')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Số Điện Thoại</label>
              <input type="text" value={form.soDienThoai} onChange={setField('soDienThoai')} placeholder="0234123456" className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã Phường/Xã Cũ</label>
              <input type="text" value={form.maPhuongXaCu} onChange={setField('maPhuongXaCu')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên Phường/Xã Cũ</label>
              <input type="text" value={form.tenPhuongXaCu} onChange={setField('tenPhuongXaCu')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên Quận/Huyện</label>
              <input type="text" value={form.tenQuanHuyen} onChange={setField('tenQuanHuyen')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã Phường/Xã Mới</label>
              <input type="text" value={form.maPhuongXaMoi} onChange={setField('maPhuongXaMoi')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Tên Phường/Xã Mới</label>
              <input type="text" value={form.tenPhuongXaMoi} onChange={setField('tenPhuongXaMoi')} className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Vĩ Độ</label>
              <input type="text" value={form.viDo} onChange={setField('viDo')} placeholder="16.4637" className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Kinh Độ</label>
              <input type="text" value={form.kinhDo} onChange={setField('kinhDo')} placeholder="107.5909" className="w-full input-soft p-2.5 rounded-xl text-xs" />
            </div>

            <ResponsiblePersonField
              displayValue={responsibleDisplay}
              onChangeDisplay={handleResponsibleChangeDisplay}
              onSelectPerson={handleResponsibleSelect}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl btn btn-dark flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{loading ? 'Đang Xử Lý...' : (isEdit ? 'LƯU THAY ĐỔI' : 'THÊM BƯU CỤC')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// Modal: Xem Chi Tiết Bưu Cục (chỉ đọc)
// ==========================================
function PostOfficeDetailModal({ po, onClose }) {
  const hasCoords = po.latitude !== null && po.latitude !== undefined && po.longitude !== null && po.longitude !== undefined;
  const isActive = po.operational_status === 'ACTIVE' || !po.operational_status;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 -md flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-lg rounded-2xl border border-[var(--color-border)]/60 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
          <h3 className="font-bold text-base text-[var(--color-title)] flex items-center gap-2">
            <Eye className="w-5 h-5 text-[var(--color-primary)]" />
            <span>Chi Tiết Bưu Cục — {po.code}</span>
          </h3>
          <button onClick={onClose} className="text-[var(--color-body)] hover:text-[var(--color-title)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs overflow-y-auto">
          <div>
            <div className="text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Mã & Tên Bưu Cục</div>
            <div className="text-sm font-bold text-[var(--color-title)]">{po.code} — {po.name}</div>
            <div className="text-[var(--color-body)] mt-0.5">
              {po.type && <span className="px-1.5 py-0.5 rounded bg-white text-[var(--color-body)] text-[10px] tabular-nums border border-[var(--color-border)] mr-1.5">{po.type}</span>}
              {po.commune_name}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Địa Chỉ & Liên Hệ</div>
            <div className="text-[var(--color-title)]">{po.address || <span className="text-gray-500">Chưa có địa chỉ</span>}{po.new_ward_name ? `, ${po.new_ward_name}` : ''}</div>
            {po.phone && (
              <div className="flex items-center gap-1.5 text-[var(--color-body)] mt-1">
                <Phone className="w-3.5 h-3.5 text-[var(--color-body)]" />
                <span className="tabular-nums">{po.phone}</span>
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Toạ Độ & Bản Đồ</div>
            {hasCoords ? (
              <div>
                <div className="tabular-nums text-[var(--color-title)]">{po.latitude}, {po.longitude}</div>
                <a
                  href={`https://www.google.com/maps?q=${po.latitude},${po.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[var(--color-primary)] hover:text-sky-600 mt-1"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Mở Google Maps</span>
                </a>
              </div>
            ) : (
              <span className="text-gray-500">Chưa có toạ độ</span>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Trạng Thái</div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className={isActive ? 'text-green-600' : 'text-[var(--color-body)]'}>{isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[var(--color-body)] uppercase mb-1">Người Phụ Trách</div>
            <div className="text-[var(--color-title)]">
              {po.responsible_user_name ? `${po.responsible_user_name} (${po.responsible_user_hrm || '—'})` : <span className="text-gray-500">Chưa gán</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Main View — "Danh Sách"
// ------------------------------------------------------------------
// Thiết kế lại theo layout PO duyệt (feat/network-submenu-restructure): bảng CHỈ còn
// đúng 5 cột gộp cell (không liệt kê phẳng field riêng lẻ) + 4 dropdown lọc động (suy
// ra distinct trực tiếp từ dữ liệu đã load, không hardcode). Nạp TOÀN BỘ danh sách 1
// lần (không phân trang phía server — dữ liệu mạng lưới chỉ ~200 bưu cục) rồi search/lọc/phân trang phía client để có thể
// kết hợp cả 5 điều kiện lọc cùng lúc mà không cần thêm route/param backend mới.
// ==========================================
export default function NetworkListView() {
  const [allItems, setAllItems] = useState([]);
  const [communes, setCommunes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCommuneId, setSelectedCommuneId] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingPostOffice, setEditingPostOffice] = useState(null);
  const [viewingPostOffice, setViewingPostOffice] = useState(null);

  useEffect(() => {
    apiFetch('/api/organization/communes')
      .then((res) => res.json())
      .then((data) => setCommunes(data || []))
      .catch((err) => console.error(err));
  }, []);

  const fetchNetwork = () => {
    setLoading(true);
    setError('');
    // limit lớn để nạp toàn bộ (không phân trang server) — phục vụ lọc/tìm kiếm kết hợp
    // phía client (xem giải thích ở đầu component).
    apiFetchJson('/api/network?limit=2000').then((result) => {
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAllItems(result.data.items || []);
    });
  };

  useEffect(() => {
    fetchNetwork();
  }, []);

  // Sau Sửa/Xoá/Import thành công: refresh danh sách + refetch communes (Import
  // có thể tạo mới BĐX cần cập nhật dropdown lọc).
  const handleMutationSuccess = () => {
    fetchNetwork();
    apiFetch('/api/organization/communes')
      .then((res) => res.json())
      .then((data) => setCommunes(data || []))
      .catch((err) => console.error(err));
  };

  const handleEdit = (po) => {
    setEditingPostOffice(po);
    setIsFormOpen(true);
  };

  const handleDelete = async (po) => {
    if (!window.confirm(`Bạn có chắc muốn xoá bưu cục "${po.name}" (${po.code}) không?`)) return;

    const result = await apiFetchJson(`/api/network/post-offices/${po.id}`, { method: 'DELETE' });
    if (!result.ok) {
      // 400 khi còn người dùng liên kết -> hiện đúng message backend trả,
      // không phải lỗi JSON thô.
      alert(`Không thể xoá: ${result.error}`);
      return;
    }
    handleMutationSuccess();
  };

  // Danh sách giá trị lọc ĐỘNG — distinct trực tiếp từ dữ liệu thật đã nạp, không
  // hardcode. Sắp xếp cho dễ tìm trong dropdown.
  const wardOptions = useMemo(() => {
    const set = new Set(allItems.map((po) => po.new_ward_name).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allItems]);

  const typeOptions = useMemo(() => {
    const set = new Set(allItems.map((po) => po.type).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allItems]);

  const statusOptions = useMemo(() => {
    const set = new Set(allItems.map((po) => po.operational_status).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allItems]);

  // Lọc kết hợp: search (mã/tên/loại/tình trạng — mở rộng theo hạng mục riêng) + 4
  // dropdown. Tất cả tính trên toàn bộ dữ liệu đã nạp.
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems.filter((po) => {
      if (term) {
        const haystack = [po.code, po.name, po.type, po.operational_status].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (selectedCommuneId && po.commune_id !== selectedCommuneId) return false;
      if (selectedWard && po.new_ward_name !== selectedWard) return false;
      if (selectedType && po.type !== selectedType) return false;
      if (selectedStatus && po.operational_status !== selectedStatus) return false;
      return true;
    });
  }, [allItems, search, selectedCommuneId, selectedWard, selectedType, selectedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((currentPage - 1) * limit, currentPage * limit);

  const resetToFirstPage = () => setPage(1);

  return (
    <div className="p-6 space-y-6">
      {/* Header & Filter Bar */}
      <div className="card-soft p-5 rounded-[14px] space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="hue-h1 text-2xl flex items-center gap-2">
              <Network className="w-5 h-5 text-[var(--color-primary)]" />
              <span>Quản Lý Mạng Lưới — Danh Sách</span>
            </h1>
            <p className="text-xs text-[var(--color-body)] mt-1">
              Danh mục chuẩn Tỉnh/BĐX/Bưu cục — nguồn tổ chức duy nhất cho toàn hệ thống (BĐT/TP ➔ BĐX ➔ Bưu Cục)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsExportOpen(true)}
              className="px-3 py-1.5 rounded-[8px] bg-white border border-[#D9CBA8] text-[#4A1D6E] font-semibold text-xs hover:bg-[#F6F1E7] transition-all flex items-center gap-2 cursor-pointer shadow-none"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel</span>
            </button>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-3 py-1.5 rounded-[8px] bg-white border border-[#D9CBA8] text-[#4A1D6E] font-semibold text-xs hover:bg-[#F6F1E7] transition-all flex items-center gap-2 cursor-pointer shadow-none"
            >
              <Upload className="w-4 h-4" />
              <span>Import Excel</span>
            </button>
            <button
              onClick={() => {
                setEditingPostOffice(null);
                setIsFormOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#4A1D6E] text-white font-bold border-b-[3px] border-[#E0A82E] text-xs shadow-none cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Bưu Cục</span>
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--color-body)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetToFirstPage();
              }}
              placeholder="Tìm theo Mã MBC, Tên Bưu Cục, Loại hình hoặc Tình trạng..."
              className="w-full input-soft pl-9 pr-3 py-2 rounded-xl text-xs"
            />
          </div>

          {/* 4 dropdown lọc */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] mb-1 uppercase tracking-wider">Phường/Xã Mới</label>
              <select
                value={selectedWard}
                onChange={(e) => { setSelectedWard(e.target.value); resetToFirstPage(); }}
                className="w-full input-soft px-3 py-2 rounded-xl text-xs"
              >
                <option value="">-- Tất cả phường/xã ({wardOptions.length}) --</option>
                {wardOptions.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] mb-1 uppercase tracking-wider">Bưu Điện Xã (BĐX)</label>
              <select
                value={selectedCommuneId}
                onChange={(e) => { setSelectedCommuneId(e.target.value); resetToFirstPage(); }}
                className="w-full input-soft px-3 py-2 rounded-xl text-xs"
              >
                <option value="">-- Tất cả BĐX ({communes.length}) --</option>
                {communes.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] mb-1 uppercase tracking-wider">Loại Hình</label>
              <select
                value={selectedType}
                onChange={(e) => { setSelectedType(e.target.value); resetToFirstPage(); }}
                className="w-full input-soft px-3 py-2 rounded-xl text-xs"
              >
                <option value="">-- Tất cả loại hình --</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-body)] mb-1 uppercase tracking-wider">Tình Trạng</label>
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); resetToFirstPage(); }}
                className="w-full input-soft px-3 py-2 rounded-xl text-xs"
              >
                <option value="">-- Tất cả tình trạng --</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s === 'ACTIVE' ? 'ACTIVE — Đang hoạt động' : s === 'INACTIVE' ? 'INACTIVE — Ngừng hoạt động' : s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
          {error}
        </div>
      )}

      {/* Table — ĐÚNG 5 cột gộp cell theo layout PO duyệt */}
      <div className="card-soft rounded-[14px] overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
            <p className="text-xs text-[var(--color-body)]">Đang nạp danh sách mạng lưới...</p>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="p-12 text-center text-[var(--color-body)]">
            <Network className="w-12 h-12 mx-auto text-gray-500 mb-3" />
            <p className="font-semibold text-sm text-[var(--color-body)]">Không tìm thấy bưu cục phù hợp</p>
            <p className="text-xs text-[var(--color-body)] mt-1">Thử thay đổi bộ lọc, hoặc thêm mới / import Excel</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-cream-head text-gray-600 font-bold border-b border-cream-line uppercase tracking-wider text-[12px]">
                  <th className="py-3.5 px-4">Mã & Tên Bưu Cục</th>
                  <th className="py-3.5 px-4">Địa Chỉ & Liên Hệ</th>
                  <th className="py-3.5 px-4">Toạ Độ & Bản Đồ</th>
                  <th className="py-3.5 px-4">Trạng Thái</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-line">
                {pageItems.map((po) => {
                  const hasCoords = po.latitude !== null && po.latitude !== undefined && po.longitude !== null && po.longitude !== undefined;
                  const isActive = po.operational_status === 'ACTIVE' || !po.operational_status;
                  return (
                    <tr key={po.id} className="hover:bg-cream-light/50 transition-colors align-top">
                      {/* Cột 1: Mã & Tên Bưu Cục */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[var(--color-title)]">{po.code} — {po.name}</div>
                        <div className="text-[10px] text-[var(--color-body)] mt-0.5 flex items-center gap-1">
                          {po.type && <span className="px-1.5 py-0.5 rounded bg-white text-[var(--color-body)] tabular-nums border border-[var(--color-border)]">{po.type}</span>}
                          <span>• {po.commune_name}</span>
                        </div>
                      </td>

                      {/* Cột 2: Địa Chỉ & Liên Hệ */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-1.5 text-[var(--color-body)]">
                          <MapPin className="w-3.5 h-3.5 text-[var(--color-body)] shrink-0 mt-0.5" />
                          <span className="max-w-[220px] whitespace-nowrap">
                            {po.address || <span className="text-gray-500">Chưa có địa chỉ</span>}
                            {po.new_ward_name ? `, ${po.new_ward_name}` : ''}
                          </span>
                        </div>
                        {po.phone && (
                          <div className="flex items-center gap-1.5 text-[var(--color-body)] text-[10px] mt-1">
                            <Phone className="w-3 h-3 shrink-0" />
                            <span className="tabular-nums">{po.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Cột 3: Toạ Độ & Bản Đồ */}
                      <td className="py-3.5 px-4">
                        {hasCoords ? (
                          <>
                            <div className="text-[var(--color-body)] tabular-nums text-[10px]">{po.latitude}, {po.longitude}</div>
                            <a
                              href={`https://www.google.com/maps?q=${po.latitude},${po.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:text-sky-600 text-[10px] mt-1"
                            >
                              <Compass className="w-3 h-3" />
                              <span>🔵 Mở Google Maps</span>
                            </a>
                          </>
                        ) : <span className="text-gray-500">Chưa có toạ độ</span>}
                      </td>

                      {/* Cột 4: Trạng Thái */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          <span className={isActive ? "text-green-600 text-[11px] font-semibold whitespace-nowrap" : "text-[var(--color-body)] text-[11px] font-semibold whitespace-nowrap"}>
                            {isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                          </span>
                        </div>
                      </td>

                      {/* Cột 5: Thao Tác */}
                      <td className="py-3.5 px-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setViewingPostOffice(po)}
                            title="Xem chi tiết"
                            className="p-1.5 rounded-lg text-[var(--color-body)] hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(po)}
                            title="Sửa"
                            className="p-1.5 rounded-lg text-[var(--color-body)] hover:text-[var(--color-primary)] hover:bg-sky-50 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(po)}
                            title="Xoá"
                            className="p-1.5 rounded-lg text-[var(--color-body)] hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-[var(--color-body)]">
            Hiển thị <span className="font-bold text-[var(--color-title)]">{pageItems.length}</span> / <span className="font-bold text-[var(--color-title)]">{filteredItems.length}</span> bưu cục
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((prev) => prev - 1)}
              className="px-3 py-1.5 rounded-lg input-soft text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-orange-300 transition-all flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Trang trước</span>
            </button>
            <span className="text-xs text-[var(--color-body)] px-2 font-medium">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="px-3 py-1.5 rounded-lg input-soft text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-orange-300 transition-all flex items-center gap-1"
            >
              <span>Trang sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {isFormOpen && (
        <PostOfficeFormModal
          editing={editingPostOffice}
          communes={communes}
          onClose={() => {
            setIsFormOpen(false);
            setEditingPostOffice(null);
          }}
          onSuccess={handleMutationSuccess}
        />
      )}

      {isExportOpen && (
        <ExportNetworkModal
          onClose={() => setIsExportOpen(false)}
          search={search}
          communeId={selectedCommuneId}
        />
      )}

      {isImportOpen && (
        <ImportNetworkModal
          onClose={() => setIsImportOpen(false)}
          onSuccess={handleMutationSuccess}
        />
      )}

      {viewingPostOffice && (
        <PostOfficeDetailModal
          po={viewingPostOffice}
          onClose={() => setViewingPostOffice(null)}
        />
      )}
    </div>
  );
}
