import React, { useState } from 'react';
import { LogIn, Lock, User as UserIcon, AlertCircle } from 'lucide-react';

const COLOR_BG_PAGE = '#4A1D6E';
const COLOR_POLYGON_TOP_LEFT = '#5A2582';
const COLOR_POLYGON_TOP_RIGHT = '#5A2582';
const COLOR_POLYGON_BOTTOM_RIGHT = '#3B1450';
const COLOR_CIRCLE_BG = '#FBE9B4';

export default function LoginView({ onLoginSuccess }) {
  const [hrmCode, setHrmCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hrmCode.trim() || !password) {
      setError('Vui lòng nhập đầy đủ Mã HRM và Mật khẩu');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrm_code: hrmCode.trim(), password })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Đăng nhập thất bại, vui lòng thử lại');
        setLoading(false);
        return;
      }

      onLoginSuccess(data.token);
    } catch (err) {
      setError('Không thể kết nối tới máy chủ, vui lòng thử lại');
      setLoading(false);
    }
  };

  return (
    <div 
      className="flex-1 w-full min-h-screen relative overflow-hidden flex items-center justify-center p-4 min-[1100px]:p-0"
      style={{ backgroundColor: COLOR_BG_PAGE }}
    >
      {/* Background SVGs */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none" 
        viewBox="0 0 1440 900" 
        preserveAspectRatio="xMidYMid slice" 
        aria-hidden="true"
      >
        <polygon points="0,0 760,0 0,640" fill={COLOR_POLYGON_TOP_LEFT} />
        <polygon points="1440,0 1440,520 960,0" fill={COLOR_POLYGON_TOP_RIGHT} />
        <polygon points="1440,900 1440,420 620,900" fill={COLOR_POLYGON_BOTTOM_RIGHT} />
      </svg>

      {/* Main container */}
      <div className="relative z-10 flex items-center justify-center w-full max-w-[1060px]">
        
        {/* Left Card */}
        <div className="hidden min-[1100px]:flex flex-col relative w-[520px] h-[660px] bg-[#F6F1E7] border border-[#E4D5AE] border-b-4 border-b-[#E0A82E] rounded-[14px] overflow-hidden shrink-0">
          <div className="p-[32px] pb-0 z-10">
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo-vnpost.png" alt="Vietnam Post" className="h-[28px] w-auto object-contain" />
              <div className="text-[#6B2F94] font-bold text-[11px] tracking-[0.14em] uppercase leading-tight">
                BƯU ĐIỆN<br />THÀNH PHỐ HUẾ
              </div>
            </div>
            <h1 className="font-serif font-bold text-[30px] leading-[1.2] text-[#4A1D6E] mb-2">
              HỆ THỐNG GIÁM SÁT<br />HÀNG ĐẾN VÀ<br />CHẤT LƯỢNG PHÁT
            </h1>
            <p className="text-[14px] text-[#5A4A62]">
              Trung tâm Vận hành · Bưu điện Thành phố Huế
            </p>
          </div>

          <div className="relative mt-auto w-full h-[420px] flex justify-center items-end">
            {/* Vòng tròn 360x360 */}
            <div 
              className="absolute bottom-[20px] w-[360px] h-[360px] rounded-full shrink-0"
              style={{ backgroundColor: COLOR_CIRCLE_BG }}
              aria-hidden="true"
            />
            {/* Linh vật cao khoảng 404px */}
            <img 
              src="/linh-vat.png" 
              alt="Linh vật Vietnam Post" 
              className="relative z-10 h-[404px] w-auto object-contain bottom-[10px]"
            />
          </div>
        </div>

        {/* Right Card */}
        <div className="w-full max-w-[480px] min-[1100px]:max-w-[580px] min-[1100px]:w-[580px] bg-white rounded-[14px] p-[36px_28px] min-[1100px]:p-[64px_56px] border-t-4 border-t-[#E0A82E] min-[1100px]:-ml-[40px] relative z-20 flex flex-col justify-between">
          
          {/* Logo & title on screens < 1100px */}
          <div className="min-[1100px]:hidden mb-6">
            <div className="flex items-center gap-3 mb-2">
              <img src="/logo-vnpost.png" alt="Vietnam Post" className="h-[26px] w-auto object-contain" />
              <div className="text-[#6B2F94] font-bold text-[10.5px] tracking-[0.14em] uppercase leading-tight">
                BƯU ĐIỆN<br />THÀNH PHỐ HUẾ
              </div>
            </div>
            <div className="font-serif font-bold text-[18px] text-[#4A1D6E] leading-snug">
              HỆ THỐNG GIÁM SÁT HÀNG ĐẾN VÀ CHẤT LƯỢNG PHÁT
            </div>
            <p className="text-[12px] text-[#5A4A62] mt-0.5">
              Trung tâm Vận hành · Bưu điện Thành phố Huế
            </p>
          </div>

          <div>
            <h2 className="font-serif font-bold text-[34px] text-[#4A1D6E] leading-tight">
              Đăng nhập
            </h2>
            <p className="text-[14px] text-[#5A4A62] mt-1">
              Dùng Mã HRM và mật khẩu được cấp.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
            <div>
              <label htmlFor="hrmCode" className="block text-[11px] font-bold tracking-[0.1em] text-[#6B2F94] uppercase mb-1">
                MÃ HRM
              </label>
              <div className={`relative h-[42px] flex items-center border-b-2 transition-colors ${
                error ? 'border-[#B3202A]' : 'border-[#D9CBA8] focus-within:border-[#4A1D6E]'
              }`}>
                <UserIcon className="w-[18px] h-[18px] text-[#6B2F94] ml-1 mr-2.5 shrink-0" />
                <input
                  id="hrmCode"
                  type="text"
                  value={hrmCode}
                  onChange={(e) => setHrmCode(e.target.value)}
                  placeholder="Nhập Mã HRM"
                  className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#2A1B33] placeholder:text-[#9A8AA0] h-full"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-bold tracking-[0.1em] text-[#6B2F94] uppercase mb-1">
                MẬT KHẨU
              </label>
              <div className={`relative h-[42px] flex items-center border-b-2 transition-colors ${
                error ? 'border-[#B3202A]' : 'border-[#D9CBA8] focus-within:border-[#4A1D6E]'
              }`}>
                <Lock className="w-[18px] h-[18px] text-[#6B2F94] ml-1 mr-2.5 shrink-0" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#2A1B33] placeholder:text-[#9A8AA0] h-full"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="p-[12px] bg-[#FDEEF0] border border-[#F2B8BE] rounded-[6px] text-[#B3202A] text-[13px] font-semibold flex items-center gap-2">
                <AlertCircle className="w-[16px] h-[16px] text-[#B3202A] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[48px] bg-[#4A1D6E] hover:bg-[#3B1450] text-white text-[13px] font-bold tracking-[0.12em] uppercase rounded-[10px] border-b-4 border-b-[#E0A82E] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <LogIn className="w-[18px] h-[18px]" />
              <span>{loading ? 'Đang đăng nhập…' : 'ĐĂNG NHẬP'}</span>
            </button>
          </form>

          <div className="mt-8 pt-1">
            <p className="text-[13px] text-[#5A4A62]">
              Chưa có tài khoản hoặc quên mật khẩu?{' '}
              <b className="text-[#B3202A] font-bold">Liên hệ quản trị viên hệ thống.</b>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
