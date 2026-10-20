import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Upload, FileSpreadsheet, AlertCircle, RefreshCw, Trash2, CheckCircle2, 
  ArrowLeft, Download, ExternalLink, ChevronLeft, ChevronRight, X, Clock
} from 'lucide-react';
import { apiFetch, apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt } from './ProcessingDeliveryView';

const TEN_LOAI_LOI = {
  KHONG_DOI: 'Không đổi so với lần nhập trước',
  TT_NGOAI_DS: 'Trạng thái không có trong danh sách',
  KHONG_CO_TRONG_DEN: 'Không có trong dữ liệu đến của BCVH',
  TRUNG_SHBG: 'Trùng SHBG trong file',
  SAI_DINH_DANG: 'SHBG sai định dạng'
};

const TRANG_THAI_SELECT = [
  { ma: 'PTC', nhan: 'Phát thành công' },
  { ma: 'PKTC', nhan: 'Phát không thành công' },
  { ma: 'DA_VU_HOI', nhan: 'Đã vu hồi' },
  { ma: 'CHUYEN_HOAN', nhan: 'Chuyển hoàn' },
  { ma: 'LAC_HUONG', nhan: 'Lạc hướng' },
  { ma: 'CHUA_CO_TT', nhan: 'Chưa có thông tin phát' },
];

export default function PhatDraftView({ 
  selectedBcvh, 
  draftId, 
  onSelectDraftId, 
  onCommitSuccess 
}) {
  const [bcvh, setBcvh] = useState(selectedBcvh && selectedBcvh !== 'all' ? selectedBcvh : '533140');
  
  // Danh sách các bản kiểm tra còn hạn của người dùng (khi chưa mở bản nào hoặc bấm Chọn file khác)
  const [draftList, setDraftList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState(null);

  // Chi tiết bản kiểm tra đang mở
  const [draftData, setDraftData] = useState(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftError, setDraftError] = useState(null);

  // Lưới dòng
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 50, total_pages: 1 });
  const [loadingRows, setLoadingRows] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());

  // Bộ lọc
  const [activeTab, setActiveTab] = useState('LOI'); // 'LOI' | 'HOP_LE' | 'BO_QUA_TRONG' | 'DA_NHAP' | 'ALL'
  const [selectedErrorType, setSelectedErrorType] = useState('ALL');

  // Tải file lên
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Gán nhanh SHBG
  const [assignText, setAssignText] = useState('');
  const [assignStatus, setAssignStatus] = useState('CHUYEN_HOAN');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignResult, setAssignResult] = useState(null);

  // Hộp thoại xác nhận xoá bản kiểm tra
  const [deleteModalDraft, setDeleteModalDraft] = useState(null); // draft object to delete
  const [deletingDraft, setDeletingDraft] = useState(false);

  // Hộp thoại xác nhận commit (Nhập)
  const [commitConfirmModal, setCommitConfirmModal] = useState(null); // { mode, ids, so_nhap }
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState(null);

  // 1. Tải danh sách các bản kiểm tra của người dùng (GET /api/phat/drafts?bcvh=<mã>)
  const loadDraftList = useCallback(async (unitCode) => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await apiFetchJson(`/api/phat/drafts?bcvh=${unitCode}`);
      if (res.ok) {
        setDraftList(res.data?.items || []);
      } else {
        setListError(res.error || 'Không tải được danh sách bản kiểm tra');
        setDraftList([]);
      }
    } catch (_) {
      setListError('Lỗi kết nối khi tải danh sách bản kiểm tra');
      setDraftList([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // 2. Tải chi tiết bản kiểm tra
  const loadDraftDetail = useCallback(async (id) => {
    if (!id) {
      setDraftData(null);
      return;
    }
    setLoadingDraft(true);
    setDraftError(null);
    try {
      const res = await apiFetchJson(`/api/phat/drafts/${id}`);
      if (res.ok) {
        setDraftData(res.data);
        if (res.data?.bcvh) setBcvh(res.data.bcvh);
      } else {
        if (res.status === 404) {
          setDraftError('Không tìm thấy bản kiểm tra (đã hết hạn sau 7 ngày hoặc không phải của bạn).');
          onSelectDraftId(null);
        } else {
          setDraftError(res.error || 'Không tải được bản kiểm tra');
        }
        setDraftData(null);
      }
    } catch (_) {
      setDraftError('Lỗi kết nối khi mở bản kiểm tra');
      setDraftData(null);
    } finally {
      setLoadingDraft(false);
    }
  }, [onSelectDraftId]);

  // 3. Tải danh sách dòng trong bản kiểm tra (GET /api/phat/drafts/:id/rows)
  const loadRows = useCallback(async (id, page = 1, tab = activeTab, errorType = selectedErrorType) => {
    if (!id) return;
    setLoadingRows(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: '50'
      });

      if (tab === 'LOI') params.set('ket_qua', 'LOI');
      else if (tab === 'HOP_LE') params.set('ket_qua', 'HOP_LE');
      else if (tab === 'BO_QUA_TRONG') params.set('ket_qua', 'BO_QUA_TRONG');
      else if (tab === 'DA_NHAP') params.set('ket_qua', 'DA_NHAP');

      if (tab === 'LOI' && errorType !== 'ALL') {
        params.set('ma_loi', errorType);
      }

      const res = await apiFetchJson(`/api/phat/drafts/${id}/rows?${params.toString()}`);
      if (res.ok) {
        setRows(res.data?.items || []);
        setPagination(res.data?.pagination || { total: 0, page: 1, page_size: 50, total_pages: 1 });
      } else {
        setRows([]);
      }
    } catch (_) {
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [activeTab, selectedErrorType]);

  // Đồng bộ khi bcvh hoặc draftId thay đổi
  useEffect(() => {
    if (draftId) {
      loadDraftDetail(draftId);
    } else {
      loadDraftList(bcvh);
    }
  }, [draftId, bcvh, loadDraftDetail, loadDraftList]);

  // Tải dòng khi draftData hoặc tab thay đổi
  useEffect(() => {
    if (draftData?.id) {
      loadRows(draftData.id, 1, activeTab, selectedErrorType);
      setSelectedRowIds(new Set());
    }
  }, [draftData?.id, activeTab, selectedErrorType, loadRows]);

  // 4. Tải file lên tạo bản kiểm tra mới
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const buf = await file.arrayBuffer();
      const qs = new URLSearchParams({
        bcvh,
        ten_file: file.name
      }).toString();

      const res = await apiFetch(`/api/phat/drafts?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf
      });

      let resData = {};
      try {
        resData = await res.json();
      } catch (_) {}

      if (res.ok && resData.id) {
        onSelectDraftId(resData.id);
      } else {
        setUploadError(resData.error || 'Không tạo được bản kiểm tra từ file');
      }
    } catch (_) {
      setUploadError('Lỗi kết nối khi gửi file lên máy chủ');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 5. Xoá bản kiểm tra (DELETE /api/phat/drafts/:id)
  const confirmDeleteDraft = async () => {
    if (!deleteModalDraft || deletingDraft) return;
    setDeletingDraft(true);
    try {
      const res = await apiFetchJson(`/api/phat/drafts/${deleteModalDraft.id}`, { method: 'DELETE' });
      if (res.ok) {
        // Nếu vừa xoá chính bản đang mở
        if (draftId === deleteModalDraft.id) {
          onSelectDraftId(null);
        }
        setDeleteModalDraft(null);
        loadDraftList(bcvh);
      } else {
        alert(res.error || 'Không xoá được bản kiểm tra');
      }
    } catch (_) {
      alert('Lỗi kết nối khi xoá bản kiểm tra');
    } finally {
      setDeletingDraft(false);
    }
  };

  // 6. Xoá các dòng đã chọn trong bản kiểm tra
  const handleDeleteSelectedRows = async () => {
    if (!selectedRowIds.size || !draftData?.id) return;
    try {
      const ids = Array.from(selectedRowIds);
      const res = await apiFetchJson(`/api/phat/drafts/${draftData.id}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        setSelectedRowIds(new Set());
        loadDraftDetail(draftData.id);
        loadRows(draftData.id, pagination.page);
      } else {
        alert(res.error || 'Không xoá được dòng đã chọn');
      }
    } catch (_) {
      alert('Lỗi kết nối khi xoá dòng');
    }
  };

  // 7. Sửa trạng thái trực tiếp từng dòng (inline)
  const handleInlineChangeStatus = async (rowId, newStatus) => {
    if (!draftData?.id) return;
    try {
      const res = await apiFetchJson(`/api/phat/drafts/${draftData.id}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [{ id: rowId, trang_thai: newStatus }] })
      });
      if (res.ok) {
        loadDraftDetail(draftData.id);
        loadRows(draftData.id, pagination.page);
      } else {
        alert(res.error || 'Không sửa được trạng thái dòng');
      }
    } catch (_) {
      alert('Lỗi kết nối khi sửa dòng');
    }
  };

  // 8. Điền trạng thái cho các dòng đã chọn
  const handleBulkFillStatus = async (status) => {
    if (!selectedRowIds.size || !draftData?.id) return;
    try {
      const ids = Array.from(selectedRowIds);
      const res = await apiFetchJson(`/api/phat/drafts/${draftData.id}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trang_thai: status, ids })
      });
      if (res.ok) {
        setSelectedRowIds(new Set());
        loadDraftDetail(draftData.id);
        loadRows(draftData.id, pagination.page);
      } else {
        alert(res.error || 'Không điền được trạng thái');
      }
    } catch (_) {
      alert('Lỗi kết nối khi điền trạng thái');
    }
  };

  // 9. Gán nhanh bằng danh sách SHBG
  const handleAssignList = async () => {
    if (!assignText.trim() || !draftData?.id || assignLoading) return;
    setAssignLoading(true);
    setAssignResult(null);
    try {
      // Tách theo dòng hoặc dấu phẩy
      const shbgs = assignText
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await apiFetchJson(`/api/phat/drafts/${draftData.id}/assign-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trang_thai: assignStatus,
          shbg: shbgs
        })
      });

      if (res.ok) {
        setAssignResult(res.data);
        loadDraftDetail(draftData.id);
        loadRows(draftData.id, pagination.page);
      } else {
        alert(res.error || 'Không gán được danh sách SHBG');
      }
    } catch (_) {
      alert('Lỗi kết nối khi gán danh sách SHBG');
    } finally {
      setAssignLoading(false);
    }
  };

  // 10. Tải file lỗi (Excel)
  const handleDownloadErrors = async () => {
    if (!draftData?.id) return;
    try {
      const res = await apiFetch(`/api/phat/drafts/${draftData.id}/errors.xlsx?loai_tru=KHONG_DOI`);
      if (!res.ok) {
        let err = 'Không tải được file lỗi';
        try { err = (await res.json()).error || err; } catch (_) {}
        alert(err);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PHAT_LOI_${draftData.bcvh}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (_) {
      alert('Lỗi kết nối khi tải file lỗi');
    }
  };

  // 11. Thực hiện Commit (Nhập)
  const handleCommit = async () => {
    if (!commitConfirmModal || !draftData?.id || committing) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const payload = commitConfirmModal.mode === 'hop-le'
        ? { mode: 'hop-le' }
        : { mode: 'da-chon', ids: commitConfirmModal.ids };

      const res = await apiFetchJson(`/api/phat/drafts/${draftData.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setCommitConfirmModal(null);
        onCommitSuccess(res.data);
      } else {
        setCommitError(res.error || 'Không thực hiện được đợt nhập');
      }
    } catch (_) {
      setCommitError('Lỗi kết nối khi thực hiện nhập kết quả phát');
    } finally {
      setCommitting(false);
    }
  };

  // Checkbox row toggling
  const handleToggleRow = (id) => {
    const next = new Set(selectedRowIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRowIds(next);
  };

  const handleSelectAllRows = () => {
    if (selectedRowIds.size === rows.length && rows.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(rows.map((r) => r.id)));
    }
  };

  const tongHop = draftData?.tong_hop || {
    hop_le: 0, bo_qua_trong: 0, loi: 0, tong_dong: 0, theo_loai: {}
  };

  // ── TRƯỜNG HỢP 1: CHƯA CHỌN BẢN KIỂM TRA NÀO (MÀN TẢI LÊN & DANH SÁCH BẢN KIỂM TRA) ──
  if (!draftId || !draftData) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            Bước 2. Kiểm tra dữ liệu trước khi nhập
          </h2>
        </div>

        {draftError && (
          <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{draftError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* CỘT TRÁI (6/12): TẢI FILE LÊN MỚI */}
          <div className="lg:col-span-6 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
            <h3 className="text-sm font-bold text-gray-900">
              Tải file dữ liệu để tạo bản kiểm tra mới
            </h3>

            {/* Chọn BCVH cho file mới */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 block">Đơn vị nhận (BCVH)</label>
              <select
                value={bcvh}
                onChange={(e) => setBcvh(e.target.value)}
                className="w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
              >
                {BCVH_LIST.map((b) => (
                  <option key={b.ma} value={b.ma}>
                    {b.ten} ({b.ma})
                  </option>
                ))}
              </select>
            </div>

            {/* Vùng thả file / upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-orange-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-gray-50/50 hover:bg-orange-50/20"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <div className="text-xs font-bold text-gray-800">
                {uploading ? 'Đang đọc và kiểm tra file...' : 'Bấm vào đây để chọn file (.xlsx, .csv)'}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                Kích thước tối đa 10 MB. Hệ thống sẽ tự động kiểm tra từng dòng.
              </div>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
                {uploadError}
              </div>
            )}
          </div>

          {/* CỘT PHẢI (6/12): DANH SÁCH BẢN KIỂM TRA CHƯA HẾT HẠN */}
          <div className="lg:col-span-6 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Các bản kiểm tra chưa hết hạn của bạn
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bản kiểm tra được lưu trong 7 ngày, bạn có thể mở lại để tiếp tục xử lý.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadDraftList(bcvh)}
                disabled={loadingList}
                className="p-1.5 text-gray-500 hover:text-orange-600 bg-gray-50 rounded-lg hover:bg-orange-50"
                title="Làm mới danh sách"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {listError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {listError}
              </div>
            )}

            {loadingList ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Đang tải danh sách bản kiểm tra...
              </div>
            ) : draftList.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400 bg-gray-50 rounded-xl">
                Bạn chưa có bản kiểm tra nào cho đơn vị này.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[380px] overflow-y-auto pr-1">
                {draftList.map((d) => (
                  <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-900 truncate">
                        {d.ten_file}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Tạo lúc: {d.tao_luc_bangkok}
                      </div>
                      <div className="text-[11px] text-gray-600 mt-1 flex items-center gap-2">
                        <span>Tổng: <strong className="text-gray-900">{formatInt(d.tong_dong)}</strong></span>
                        <span className="text-emerald-600">Hợp lệ: {formatInt(d.hop_le)}</span>
                        <span className="text-red-600">Lỗi: {formatInt(d.loi)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectDraftId(d.id)}
                        className="px-3 py-1.5 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Mở bản này
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalDraft(d)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Xoá bản kiểm tra"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal xác nhận xoá bản kiểm tra */}
        {deleteModalDraft && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-gray-900">
                Xác nhận xoá bản kiểm tra
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Xoá bản kiểm tra này? Dữ liệu đã nhập không bị ảnh hưởng.
              </p>
              <div className="p-3 bg-gray-50 rounded-[10px] text-xs text-gray-700 tabular-nums">
                {deleteModalDraft.ten_file} ({deleteModalDraft.tao_luc_bangkok})
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalDraft(null)}
                  disabled={deletingDraft}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteDraft}
                  disabled={deletingDraft}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm disabled:opacity-50"
                >
                  {deletingDraft ? 'Đang xoá...' : 'Xác nhận xoá'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TRƯỜNG HỢP 2: BẢN KIỂM TRA ĐANG ĐƯỢC MỞ (MÀN 15 CHÍNH) ──────────────────
  const bcvhItem = BCVH_LIST.find((b) => b.ma === draftData.bcvh);
  const bcvhTen = bcvhItem ? bcvhItem.ten : draftData.bcvh;

  return (
    <div className="space-y-5">
      {/* ── HEADER BẢN KIỂM TRA ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900">
              {draftData.ten_file}
            </h2>
            <button
              type="button"
              onClick={() => onSelectDraftId(null)}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 underline cursor-pointer ml-2"
            >
              Chọn file khác
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {formatInt(tongHop.tong_dong)} dòng · {bcvhTen} · bản kiểm tra được giữ 7 ngày, đóng trình duyệt vẫn quay lại được
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
            Số liệu tính đến lúc: <strong className="text-gray-900">tự ghi theo giờ bấm Nhập</strong> (không sửa được)
          </div>
          <button
            type="button"
            onClick={() => setDeleteModalDraft(draftData)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            title="Xoá bản kiểm tra này"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── 4 HỘP CHỈ SỐ TỔNG HỢP ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hợp lệ, sẽ nhập */}
        <div className="bg-white rounded-[14px] p-4 shadow-none border border-emerald-200 bg-emerald-50/20">
          <div className="hue-label text-emerald-800">
            HỢP LỆ, SẼ NHẬP
          </div>
          <div className="hue-num-md text-emerald-600 my-1">
            {formatInt(tongHop.hop_le)}
          </div>
        </div>

        {/* Bỏ qua (ô trống) */}
        <div className="bg-white rounded-[14px] p-4 shadow-none border border-gray-200 bg-gray-50/50">
          <div className="hue-label text-gray-600">
            BỎ QUA (Ô TRỐNG)
          </div>
          <div className="hue-num-md text-gray-600 my-1">
            {formatInt(tongHop.bo_qua_trong)}
          </div>
        </div>

        {/* Lỗi, chưa nhập */}
        <div className="bg-white rounded-[14px] p-4 shadow-none border border-red-200 bg-red-50/20">
          <div className="hue-label text-red-800">
            LỖI, CHƯA NHẬP
          </div>
          <div className="hue-num-md text-red-600 my-1">
            {formatInt(tongHop.loi)}
          </div>
        </div>

        {/* Lỗi theo loại */}
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex flex-col justify-center text-xs space-y-1">
          <div className="text-[11px] font-bold text-gray-700 uppercase mb-0.5">
            LỖI THEO LOẠI
          </div>
          <div className="text-gray-600 text-[11px] flex justify-between">
            <span>Không đổi so với lần nhập trước:</span>
            <strong className="text-gray-900">{formatInt(tongHop.theo_loai?.KHONG_DOI)}</strong>
          </div>
          <div className="text-gray-600 text-[11px] flex justify-between">
            <span>Trạng thái không có trong danh sách:</span>
            <strong className="text-gray-900">{formatInt(tongHop.theo_loai?.TT_NGOAI_DS)}</strong>
          </div>
          <div className="text-gray-600 text-[11px] flex justify-between">
            <span>Không có trong dữ liệu đến của BCVH:</span>
            <strong className="text-gray-900">{formatInt(tongHop.theo_loai?.KHONG_CO_TRONG_DEN)}</strong>
          </div>
          <div className="text-gray-600 text-[11px] flex justify-between">
            <span>Trùng SHBG trong file:</span>
            <strong className="text-gray-900">{formatInt(tongHop.theo_loai?.TRUNG_SHBG)}</strong>
          </div>
          <div className="text-gray-600 text-[11px] flex justify-between">
            <span>SHBG sai định dạng:</span>
            <strong className="text-gray-900">{formatInt(tongHop.theo_loai?.SAI_DINH_DANG)}</strong>
          </div>
        </div>
      </div>

      {/* ── BẢNG LƯỚI VÀ GÁN NHANH SHBG ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* CỘT TRÁI (8/12): LƯỚI DÒNG DỮ LIỆU */}
        <div className="lg:col-span-8 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
          {/* Tabs bộ lọc */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setActiveTab('LOI'); setSelectedErrorType('ALL'); }}
                className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'LOI'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Lỗi {formatInt(tongHop.loi)}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('HOP_LE'); setSelectedErrorType('ALL'); }}
                className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'HOP_LE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Hợp lệ {formatInt(tongHop.hop_le)}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('BO_QUA_TRONG'); setSelectedErrorType('ALL'); }}
                className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'BO_QUA_TRONG'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Bỏ qua {formatInt(tongHop.bo_qua_trong)}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('DA_NHAP'); setSelectedErrorType('ALL'); }}
                className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'DA_NHAP'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Đã nhập {formatInt(tongHop.da_nhap)}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('ALL'); setSelectedErrorType('ALL'); }}
                className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'ALL'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tất cả {formatInt(tongHop.tong_dong)}
              </button>
            </div>

            {/* Dropdown lọc theo loại lỗi khi ở tab Lỗi */}
            {activeTab === 'LOI' && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500 font-medium">Loại lỗi:</span>
                <select
                  value={selectedErrorType}
                  onChange={(e) => setSelectedErrorType(e.target.value)}
                  className="p-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white cursor-pointer focus:outline-none"
                >
                  <option value="ALL">Tất cả loại lỗi</option>
                  {Object.entries(TEN_LOAI_LOI).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label} ({tongHop.theo_loai?.[k] || 0})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Thanh công cụ thao tác hàng loạt */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-gray-700">
                Đã chọn {selectedRowIds.size} dòng
              </span>
              <button
                type="button"
                onClick={handleDeleteSelectedRows}
                disabled={!selectedRowIds.size}
                className="px-2.5 py-1 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg font-semibold disabled:opacity-40 cursor-pointer"
              >
                Xóa dòng đã chọn
              </button>

              {/* Điền trạng thái */}
              <select
                disabled={!selectedRowIds.size}
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkFillStatus(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="p-1 border border-gray-200 rounded-lg font-semibold text-gray-700 bg-white disabled:opacity-40 cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Điền trạng thái cho dòng đã chọn ▾</option>
                {TRANG_THAI_SELECT.map((t) => (
                  <option key={t.ma} value={t.ma}>{t.nhan}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSelectAllRows}
                className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg font-semibold cursor-pointer"
              >
                {selectedRowIds.size === rows.length && rows.length > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả dòng đang lọc'}
              </button>
            </div>

            {/* Nút tải file lỗi */}
            <button
              type="button"
              onClick={handleDownloadErrors}
              className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file lỗi (Excel)</span>
            </button>
          </div>

          {/* Lưới dòng */}
          <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50 text-gray-600 font-bold sticky top-0 border-b border-gray-200 z-10">
                <tr>
                  <th className="p-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === rows.length && rows.length > 0}
                      onChange={handleSelectAllRows}
                      className="cursor-pointer text-orange-600"
                    />
                  </th>
                  <th className="p-2.5 w-16">Dòng</th>
                  <th className="p-2.5">SHBG</th>
                  <th className="p-2.5">Trạng thái trong file</th>
                  <th className="p-2.5">Trạng thái hiện có</th>
                  <th className="p-2.5">Kết quả kiểm tra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loadingRows ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      Đang tải danh sách dòng...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      Không có dòng nào thuộc bộ lọc này.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const isSelected = selectedRowIds.has(r.id);
                    const isError = r.ket_qua === 'LOI';
                    const isHopLe = r.ket_qua === 'HOP_LE';
                    const isDaNhap = r.ket_qua === 'DA_NHAP';

                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-gray-50/70 transition-colors ${
                          isSelected ? 'bg-orange-50/30' : ''
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(r.id)}
                            className="cursor-pointer text-orange-600"
                          />
                        </td>
                        <td className="p-2.5 font-medium text-gray-500">
                          {r.so_dong_goc}
                        </td>
                        <td className="p-2.5 font-mono font-medium text-gray-900">
                          {r.shbg}
                        </td>
                        {/* Trạng thái trong file (sửa nhanh inline) */}
                        <td className="p-2.5">
                          {isDaNhap ? (
                            <span className="text-gray-500">{r.trang_thai_nhan || '—'}</span>
                          ) : (
                            <select
                              value={r.da_vu_hoi ? 'DA_VU_HOI' : (r.trang_thai || '')}
                              onChange={(e) => handleInlineChangeStatus(r.id, e.target.value)}
                              className="text-xs font-semibold p-1 bg-white border border-gray-200 rounded-lg cursor-pointer focus:outline-none"
                            >
                              <option value="">(Bỏ qua / để trống)</option>
                              {TRANG_THAI_SELECT.map((t) => (
                                <option key={t.ma} value={t.ma}>{t.nhan}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        {/* Trạng thái hiện có: Chốt 1 - Chỉ nhãn, không giờ */}
                        <td className="p-2.5 text-gray-600">
                          {r.trang_thai_hien_co_nhan ? (
                            <span className="font-medium text-gray-800">
                              {r.trang_thai_hien_co_nhan}
                            </span>
                          ) : (
                            <span className="text-gray-400">Chưa có</span>
                          )}
                        </td>
                        {/* Kết quả kiểm tra: Chốt 2 - Hiện nguyên văn chi_tiet_loi / ly_do */}
                        <td className="p-2.5">
                          {isError ? (
                            <span className="font-semibold text-red-600">
                              {r.ly_do || r.chi_tiet_loi || r.ma_loi}
                            </span>
                          ) : isHopLe ? (
                            <span className="font-medium text-emerald-600">
                              Hợp lệ, sẽ đổi trạng thái
                            </span>
                          ) : isDaNhap ? (
                            <span className="font-medium text-blue-600">
                              Đã nhập
                            </span>
                          ) : (
                            <span className="text-gray-400">Bỏ qua (ô trống)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Phân trang */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
            <div>
              Hiện {rows.length ? (pagination.page - 1) * pagination.page_size + 1 : 0}–
              {Math.min(pagination.page * pagination.page_size, pagination.total)} / {formatInt(pagination.total)} dòng
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => loadRows(draftData.id, pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1 border border-gray-200 rounded-lg disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold text-gray-700">{pagination.page} / {pagination.total_pages || 1}</span>
              <button
                type="button"
                onClick={() => loadRows(draftData.id, pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="p-1 border border-gray-200 rounded-lg disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI (4/12): GÁN NHANH BẰNG DANH SÁCH SHBG */}
        <div className="lg:col-span-4 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Gán nhanh bằng danh sách SHBG
            </h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Dán danh sách (mỗi dòng một SHBG, hoặc cách nhau bằng dấu phẩy), chọn một trạng thái. Hệ thống ghép vào các dòng của file đang kiểm tra.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 block">Danh sách SHBG</label>
            <textarea
              rows={6}
              value={assignText}
              onChange={(e) => setAssignText(e.target.value)}
              placeholder="XX000000301VN&#10;XX000000302VN..."
              className="w-full text-xs font-mono p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 block">Trạng thái gán</label>
            <select
              value={assignStatus}
              onChange={(e) => setAssignStatus(e.target.value)}
              className="w-full text-xs font-semibold text-gray-800 p-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              {TRANG_THAI_SELECT.map((t) => (
                <option key={t.ma} value={t.ma}>{t.nhan}</option>
              ))}
            </select>
          </div>

          {/* Phản hồi sau khi bấm gán */}
          {assignResult && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
              <div className="font-bold text-gray-800">
                Khớp {assignResult.so_dong_khop} / {(assignResult.so_shbg_khop ?? 0) + (assignResult.so_shbg_khong_co_trong_file ?? 0)} SHBG trong file.
              </div>
              {assignResult.shbg_khong_co_trong_file?.length > 0 && (
                <div className="text-red-600 text-[11px] leading-relaxed">
                  {assignResult.so_shbg_khong_co_trong_file} SHBG không có trong file:{' '}
                  <span className="font-mono">{assignResult.shbg_khong_co_trong_file.slice(0, 3).join(', ')}{assignResult.shbg_khong_co_trong_file.length > 3 ? '...' : ''}</span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleAssignList}
            disabled={assignLoading || !assignText.trim()}
            className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            {assignLoading ? 'Đang gán...' : 'Gán trạng thái cho danh sách này'}
          </button>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Dòng đã có trạng thái trong file sẽ bị ghi đè, và được kiểm tra lại ngay. SHBG chưa có trong file không được thêm.
          </p>
        </div>
      </div>

      {/* ── THANH ĐÁY (STICKY ACTION BAR TRƯỚC KHI NHẬP) ────────────────────── */}
      <div className="sticky bottom-4 z-20 bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-xs text-gray-300 leading-relaxed max-w-3xl">
          <span>Nhập trước </span>
          <strong className="text-white font-bold">{formatInt(tongHop.hop_le)}</strong>
          <span> dòng hợp lệ · </span>
          <strong className="text-red-400 font-bold">{formatInt(tongHop.loi)}</strong>
          <span> dòng lỗi và </span>
          <strong className="text-gray-400 font-bold">{formatInt(tongHop.bo_qua_trong)}</strong>
          <span> dòng trống được giữ lại trong bản kiểm tra này, xử lý và nhập đợt sau. Dòng đã nhập chuyển sang trạng thái «Đã nhập» (khóa, không bị báo «không đổi»).</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={!selectedRowIds.size}
            onClick={() => setCommitConfirmModal({
              mode: 'da-chon',
              ids: Array.from(selectedRowIds),
              so_nhap: selectedRowIds.size
            })}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-xl border border-gray-700 disabled:opacity-40 cursor-pointer"
          >
            Nhập các dòng đã chọn ({selectedRowIds.size})
          </button>

          <button
            type="button"
            disabled={!tongHop.hop_le}
            onClick={() => setCommitConfirmModal({
              mode: 'hop-le',
              ids: null,
              so_nhap: tongHop.hop_le
            })}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-40 cursor-pointer"
          >
            Nhập {formatInt(tongHop.hop_le)} dòng hợp lệ
          </button>
        </div>
      </div>

      {/* ── MODAL XÁC NHẬN NHẬP (COMMIT) ────────────────────────────────────── */}
      {commitConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-gray-900">
              Xác nhận nhập kết quả phát
            </h3>
            
            <p className="text-xs text-gray-600 leading-relaxed">
              Bạn có chắc chắn muốn nhập <strong className="text-emerald-700 font-bold">{formatInt(commitConfirmModal.so_nhap)}</strong> dòng hợp lệ vào hệ thống?
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
              Số dòng lỗi ({formatInt(tongHop.loi)}) và dòng để trống ({formatInt(tongHop.bo_qua_trong)}) sẽ được giữ lại trong bản kiểm tra này để tiếp tục xử lý hoặc sửa lại sau.
            </p>

            {commitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {commitError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setCommitConfirmModal(null); setCommitError(null); }}
                disabled={committing}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {committing ? 'Đang ghi nhận...' : 'Xác nhận nhập'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xoá bản kiểm tra */}
      {deleteModalDraft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-gray-900">
              Xác nhận xoá bản kiểm tra
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Xoá bản kiểm tra này? Dữ liệu đã nhập không bị ảnh hưởng.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalDraft(null)}
                disabled={deletingDraft}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={confirmDeleteDraft}
                disabled={deletingDraft}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm disabled:opacity-50"
              >
                {deletingDraft ? 'Đang xoá...' : 'Xác nhận xoá'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
