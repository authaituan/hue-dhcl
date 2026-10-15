import React from 'react';

/**
 * Khung chặn lỗi (React Error Boundary) cho các khối trong màn «Nạp dữ liệu nguồn».
 * Khi một khối con bị lỗi, chỉ khối đó hiển thị thông báo lỗi đơn giản,
 * không in thông báo kỹ thuật, các phần khác vẫn hoạt động bình thường.
 */
export default class SourceIngestErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Không hiển thị lỗi kỹ thuật ra giao diện người dùng
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 my-2 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-600 text-center shadow-2xs">
          <p className="font-medium">
            Không hiển thị được phần này. Tải lại trang hoặc báo quản trị.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
