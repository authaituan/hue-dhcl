import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SlidersHorizontal,
  History,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  Save,
  Trash2,
  Eye
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import ThamSoList from './ThamSoList';
import ThamSoDrawer from './ThamSoDrawer';
import ThamSoReviewModal from './ThamSoReviewModal';
import ThamSoNhatKy from './ThamSoNhatKy';

export default function ThamSoView({ authUser }) {
  const isAdmin = authUser?.role === 'ADMIN';

  // Tab chính: 'tham_so' (Tham số) hoặc 'nhat_ky' (Nhật ký thay đổi)
  const [activeMainTab, setActiveMainTab] = useState('tham_so');

  // Dữ liệu từ API GET /api/tham-so
  const [nhomList, setNhomList] = useState([]);
  const [thamSoList, setThamSoList] = useState([]);
  const [phienBan, setPhienBan] = useState(0);

  // Tab nhóm đang chọn trong tab Tham số (mặc định 'ket_qua_phat')
  const [activeGroup, setActiveGroup] = useState('ket_qua_phat');

  // Trạng thái tải dữ liệu
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Tham số đang mở trong Drawer để chỉnh sửa
  const [selectedParam, setSelectedParam] = useState(null);

  // Danh sách các thay đổi đang soạn thảo: { [khoa]: { gia_tri, ly_do, param } }
  const [draftChanges, setDraftChanges] = useState({});

  // Modal xem lại và lưu nhiều thay đổi (Màn 3)
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Trạng thái đang lưu (PUT /api/tham-so)
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Trạng thái đang hoàn về mặc định (POST /api/tham-so/ve-mac-dinh)
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState(null);

  // Lỗi ràng buộc từ server nếu trả về mã RANG_BUOC
  const [serverConstraintError, setServerConstraintError] = useState(null);

  // Thông báo thành công ngắn hạn
  const [successToast, setSuccessToast] = useState(null);

  const showToast = (message) => {
    setSuccessToast(message);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  // Nạp danh sách tham số từ API
  const fetchThamSo = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetchJson('/api/tham-so');
      if (res.ok && res.data) {
        setNhomList(res.data.nhom || []);
        setThamSoList(res.data.tham_so || []);
        setPhienBan(res.data.phien_ban || 0);

        // Đảm bảo activeGroup hợp lệ
        if (res.data.nhom && res.data.nhom.length > 0) {
          setActiveGroup((prev) => {
            if (res.data.nhom.some((n) => n.ma === prev)) return prev;
            return res.data.nhom[0].ma;
          });
        }
      } else {
        setLoadError(res.error || 'Không thể tải danh sách tham số hệ thống');
      }
    } catch (e) {
      setLoadError('Lỗi kết nối khi tải tham số hệ thống');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchThamSo();
    }
  }, [isAdmin, fetchThamSo]);

  // Kiểm tra vi phạm ràng buộc chéo cục bộ giữa 2 cặp Màn 4
  const localConstraintViolation = useMemo(() => {
    const getValue = (khoa) => {
      if (draftChanges[khoa] !== undefined) return draftChanges[khoa].gia_tri;
      const p = thamSoList.find((item) => item.khoa === khoa);
      return p ? p.gia_tri : null;
    };

    // Cặp 1: lech_san_luong_trong_ngay_pct < lech_san_luong_xu_ly_ngay_pct
    const slTrong = getValue('lech_san_luong_trong_ngay_pct');
    const slXuly = getValue('lech_san_luong_xu_ly_ngay_pct');
    if (slTrong !== null && slXuly !== null && Number(slTrong) >= Number(slXuly)) {
      return 'Mức lệch sản lượng «Trong ngày» phải nhỏ hơn mức lệch «Xử lý ngay»';
    }

    // Cặp 2: bd10_chua_xnd_trong_ngay_pct < bd10_chua_xnd_xu_ly_ngay_pct
    const bd10Trong = getValue('bd10_chua_xnd_trong_ngay_pct');
    const bd10Xuly = getValue('bd10_chua_xnd_xu_ly_ngay_pct');
    if (bd10Trong !== null && bd10Xuly !== null && Number(bd10Trong) >= Number(bd10Xuly)) {
      return 'Mức «Trong ngày» của BD10 chưa XNĐ phải nhỏ hơn mức «Xử lý ngay»';
    }

    return null;
  }, [draftChanges, thamSoList]);

  // Xử lý khi người dùng áp dụng thay đổi từ Drawer (không lưu ly_do ở bước này)
  const handleApplyDraft = (khoa, giaTriMoi) => {
    const param = thamSoList.find((p) => p.khoa === khoa);
    if (!param) return;

    // Nếu giá trị mới giống hệt giá trị đang dùng trên hệ thống, bỏ khỏi draft
    if (JSON.stringify(giaTriMoi) === JSON.stringify(param.gia_tri)) {
      setDraftChanges((prev) => {
        const next = { ...prev };
        delete next[khoa];
        return next;
      });
    } else {
      setDraftChanges((prev) => ({
        ...prev,
        [khoa]: {
          gia_tri: giaTriMoi,
          param
        }
      }));
    }

    // Xóa lỗi server nếu có
    setServerConstraintError(null);
    setSaveError(null);
  };

  // Xử lý hoàn về mặc định của 1 khóa (Màn 2)
  const handleResetDefaultSingle = async (khoa, lyDo) => {
    setIsResetting(true);
    setResetError(null);
    try {
      const res = await apiFetchJson('/api/tham-so/ve-mac-dinh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ly_do: lyDo,
          khoa: [khoa]
        })
      });

      if (res.ok && res.data) {
        // Cập nhật lại danh sách từ phản hồi
        setThamSoList(res.data.tham_so || []);
        setPhienBan(res.data.phien_ban || 0);

        // Bỏ khỏi draft nếu đang soạn
        setDraftChanges((prev) => {
          const next = { ...prev };
          delete next[khoa];
          return next;
        });

        // Đóng drawer
        setSelectedParam(null);
        showToast(`Đã hoàn tham số "${khoa}" về giá trị mặc định thành công!`);
      } else {
        setResetError(res.error || 'Không thể hoàn về mặc định');
      }
    } catch (e) {
      setResetError('Lỗi kết nối khi gửi yêu cầu hoàn về mặc định');
    } finally {
      setIsResetting(false);
    }
  };

  // Xử lý lưu nhiều thay đổi (Màn 3) qua PUT /api/tham-so
  const handleSaveBatch = async (commonReason) => {
    const draftKeys = Object.keys(draftChanges);
    if (draftKeys.length === 0) return;

    if (draftKeys.length > 30) {
      alert('Số lượng thay đổi vượt quá giới hạn 30 tham số cho một lần lưu. Vui lòng chia thành nhiều đợt lưu.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setServerConstraintError(null);

    const payload = {
      ly_do: commonReason,
      thay_doi: draftKeys.map((k) => ({
        khoa: k,
        gia_tri: draftChanges[k].gia_tri
      }))
    };

    try {
      const res = await apiFetchJson('/api/tham-so', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok && res.data) {
        // Lưu thành công: cập nhật danh sách mới, xóa bản nháp, đóng modal
        setThamSoList(res.data.tham_so || []);
        setPhienBan(res.data.phien_ban || 0);
        setDraftChanges({});
        setShowReviewModal(false);
        showToast(`Đã lưu thành công ${draftKeys.length} thay đổi tham số vào hệ thống!`);
      } else {
        // Lỗi từ server: KHÔNG xóa các thay đổi đang soạn
        const errMsg = res.error || 'Có lỗi xảy ra khi lưu thay đổi';
        setSaveError(errMsg);

        // Nếu là lỗi ràng buộc chéo, ghi nhận để bôi đỏ thẻ liên quan
        if (res.data?.ma === 'RANG_BUOC' || (res.status === 400 && errMsg.includes('phải nhỏ hơn'))) {
          setServerConstraintError(errMsg);
        }
      }
    } catch (e) {
      setSaveError('Lỗi kết nối khi lưu tham số');
    } finally {
      setIsSaving(false);
    }
  };

  // Hủy toàn bộ thay đổi đang soạn
  const handleDiscardAllDrafts = () => {
    if (window.confirm('Bạn có chắc chắn muốn bỏ toàn bộ các thay đổi chưa lưu?')) {
      setDraftChanges({});
      setSaveError(null);
      setServerConstraintError(null);
    }
  };

  // Kiểm tra quyền ADMIN
  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card-soft p-8 rounded-2xl border border-red-200 bg-red-50 text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-red-900">Không có quyền truy cập</h2>
          <p className="text-xs text-red-700 max-w-md mx-auto">
            Màn hình «Tham số hệ thống» chỉ dành riêng cho tài khoản quản trị (ADMIN).
            Vui lòng liên hệ ban quản trị để được cấp quyền.
          </p>
        </div>
      </div>
    );
  }

  const draftCount = Object.keys(draftChanges).length;
  const hasConstraintError = Boolean(localConstraintViolation || serverConstraintError);

  return (
    <div className={`p-4 sm:p-6 space-y-6 ${draftCount > 0 ? 'pb-24' : 'pb-6'}`}>
      {/* ── THÔNG BÁO TOAST THÀNH CÔNG ──────────────────────────────────────── */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-4 py-3 rounded-xl bg-emerald-600 text-white shadow-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successToast}</span>
          </div>
        </div>
      )}

      {/* ── THANH CHUYỂN TAB TRANG CHÍNH ───────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveMainTab('tham_so')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer inline-flex items-center gap-2 ${
            activeMainTab === 'tham_so'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40 rounded-t-xl'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Tham số</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('nhat_ky')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer inline-flex items-center gap-2 ${
            activeMainTab === 'nhat_ky'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40 rounded-t-xl'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Nhật ký thay đổi</span>
        </button>
      </div>

      {/* ── CARD TIÊU ĐỀ & MÔ TẢ (ADMIN ONLY) ──────────────────────────────── */}
      <div className="card-soft p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-gray-200 bg-white shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 uppercase tracking-wide">
              ADMIN ONLY
            </span>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-orange-500" />
              <span>Tham Số Hệ Thống</span>
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed max-w-3xl">
            Cấu hình các ngưỡng cảnh báo, chỉ tiêu vận hành và công thức tính toán. Mọi thay đổi được áp dụng ngay lập tức trên toàn hệ thống và ghi nhận vào nhật ký.
          </p>
        </div>

        {phienBan > 0 && (
          <div className="shrink-0 text-right">
            <span className="text-[11px] font-medium text-gray-400 block">Phiên bản tham số:</span>
            <span className="font-mono font-bold text-xs text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 inline-block">
              v{phienBan}
            </span>
          </div>
        )}
      </div>

      {/* ── NỘI DUNG TAB 1: THAM SỐ ─────────────────────────────────────────── */}
      {activeMainTab === 'tham_so' && (
        <div className="space-y-6">
          {/* Trạng thái Đang tải */}
          {loading && (
            <div className="card-soft p-12 rounded-2xl border border-gray-200 bg-white text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-gray-600">Đang tải danh sách tham số hệ thống...</p>
            </div>
          )}

          {/* Trạng thái Lỗi tải */}
          {!loading && loadError && (
            <div className="card-soft p-8 rounded-2xl border border-red-200 bg-red-50 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-red-900">Không thể tải dữ liệu</h3>
                <p className="text-xs text-red-700">{loadError}</p>
              </div>
              <button
                type="button"
                onClick={fetchThamSo}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử lại</span>
              </button>
            </div>
          )}

          {/* Danh sách tham số (Màn 1, Màn 4, Màn 6) */}
          {!loading && !loadError && (
            <ThamSoList
              nhomList={nhomList}
              thamSoList={thamSoList}
              activeGroup={activeGroup}
              onSelectGroup={setActiveGroup}
              draftChanges={draftChanges}
              onEditParam={(param) => setSelectedParam(param)}
              serverConstraintError={serverConstraintError}
            />
          )}
        </div>
      )}

      {/* ── NỘI DUNG TAB 2: NHẬT KÝ THAY ĐỔI (MÀN 5) ────────────────────────── */}
      {activeMainTab === 'nhat_ky' && (
        <div className="space-y-6">
          <ThamSoNhatKy allParams={thamSoList} />
        </div>
      )}

      {/* ── MÀN 3: THANH CỐ ĐỊNH CHÂN TRANG KHI CÓ THAY ĐỔI CHƯA LƯU ──────── */}
      {draftCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-orange-200 shadow-2xl px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
              <div className="text-xs font-bold text-gray-900">
                <span className="text-orange-600 font-extrabold text-sm mr-1">{draftCount}</span>
                <span>thay đổi chưa lưu vào hệ thống</span>
              </div>
              {hasConstraintError && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span>Cần sửa vi phạm ràng buộc</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleDiscardAllDrafts}
                className="px-3.5 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bỏ thay đổi</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSaveError(null);
                  setShowReviewModal(true);
                }}
                disabled={Boolean(localConstraintViolation)}
                title={
                  localConstraintViolation
                    ? `Khóa nút: ${localConstraintViolation}`
                    : 'Xem lại và xác nhận lưu'
                }
                className="px-5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm cursor-pointer inline-flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>Xem lại và lưu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MÀN 2: NGĂN KÉO CHỈNH THAM SỐ (640PX) ─────────────────────────── */}
      {selectedParam && (
        <ThamSoDrawer
          param={selectedParam}
          draftValue={draftChanges[selectedParam.khoa]?.gia_tri}
          nhomList={nhomList}
          onClose={() => setSelectedParam(null)}
          onApplyDraft={handleApplyDraft}
          onResetDefault={handleResetDefaultSingle}
          isResetting={isResetting}
          apiError={resetError}
        />
      )}

      {/* ── MÀN 3: HỘP XÁC NHẬN XEM LẠI VÀ LƯU NHIỀU THAY ĐỔI ─────────────── */}
      {showReviewModal && (
        <ThamSoReviewModal
          isOpen={showReviewModal}
          draftChanges={draftChanges}
          allParams={thamSoList}
          onClose={() => {
            setSaveError(null);
            setShowReviewModal(false);
          }}
          onSave={handleSaveBatch}
          onDiscard={() => {
            setDraftChanges({});
            setSaveError(null);
            setShowReviewModal(false);
            setServerConstraintError(null);
          }}
          saving={isSaving}
          apiError={saveError}
        />
      )}
    </div>
  );
}
