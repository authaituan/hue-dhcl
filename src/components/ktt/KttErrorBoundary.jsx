import React from 'react';
import { AlertCircle } from 'lucide-react';

export default class KttErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('KTT Component Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 bg-amber-50 border border-amber-200 rounded-[12px] text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Có lỗi khi hiển thị giao diện KTT.</span>
          </div>
          {this.state.error?.message && (
            <p className="text-xs text-amber-800 font-mono">
              {this.state.error.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1 bg-white border border-amber-300 rounded-[6px] text-xs font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
          >
            Thử tải lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
