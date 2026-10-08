import React, { useState } from 'react';
import { LogIn, Lock, User as UserIcon, AlertCircle } from 'lucide-react';

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
    <div className="flex-1 w-full min-h-screen login-bg relative overflow-hidden flex items-center justify-center p-[16px] min-[860px]:p-0">
      {/* Background SVGs */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="0,0 40,0 0,60" fill="#FB923C" opacity="0.55" />
        <polygon points="100,100 60,100 100,40" fill="#EA580C" opacity="0.45" />
        <polygon points="100,0 100,50 60,0" fill="#FDBA74" opacity="0.35" />
      </svg>

      {/* Main container */}
      <div className="relative w-full max-w-[940px] min-[860px]:h-[600px] flex flex-col min-[860px]:block">
        
        {/* Image Card */}
        <div className="login-card-img bg-[#1C0F08] rounded-[8px] overflow-hidden relative
          h-[335px] min-[860px]:absolute min-[860px]:left-0 min-[860px]:top-[10px] min-[860px]:w-[480px] min-[860px]:h-[580px] z-10">
          
          <img 
            src="/login-hero.jpg" 
            alt="Ly cà phê espresso trên bàn đá" 
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div 
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(28,15,8,.94) 0%, rgba(28,15,8,.78) 24%, rgba(28,15,8,0) 52%)' }}
          ></div>

          <div className="absolute top-[20px] left-[20px] right-[20px] min-[860px]:top-[36px] min-[860px]:left-[32px] min-[860px]:right-[150px] z-20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-[56px] h-[42px] bg-[#27272A] rounded-[9px] flex items-center justify-center shrink-0">
                <img src="/logo-vnpost.png" alt="Vietnam Post" className="w-[36px]" />
              </div>
              <div className="text-[#FDBA74] login-montserrat font-[700] text-[11px] tracking-[0.16em] uppercase leading-tight">
                BƯU ĐIỆN<br />THÀNH PHỐ HUẾ
              </div>
            </div>
            <h1 className="login-montserrat font-[800] text-[17px] min-[860px]:text-[22px] leading-[1.3] text-white uppercase mb-2">
              Hệ thống điều hành chất lượng - khâu&nbsp;Phát
            </h1>
            <p className="text-[#F3E6DA] text-[13px]">
              Trung tâm Vận hành · Bưu điện Thành phố Huế
            </p>
          </div>
        </div>

        {/* Form Card */}
        <div className="login-card-form bg-white rounded-[8px] relative z-20
          -mt-[18px] mx-auto w-[calc(100%-32px)] max-w-[580px] p-[28px_24px_32px] 
          min-[860px]:absolute min-[860px]:m-0 min-[860px]:left-[360px] min-[860px]:top-[75px] min-[860px]:w-[580px] min-[860px]:min-h-[430px] min-[860px]:p-[40px_56px]
          flex flex-col gap-[22px]">
          
          <div>
            <h2 className="login-montserrat font-[800] text-[26px] text-[#1D1D22]">
              Đăng nhập
            </h2>
            <p className="text-[14px] text-[#5F656B] mt-1">
              Dùng Mã HRM và mật khẩu được cấp.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[22px]">
            <div>
              <label htmlFor="hrmCode" className="block text-[11px] font-[700] tracking-[0.1em] text-[#5F656B] uppercase mb-1">
                Mã HRM
              </label>
              <div className={`login-input-wrap relative h-[42px] flex items-center ${error ? 'login-error' : ''}`}>
                <UserIcon className="w-[18px] h-[18px] text-[#5F656B] ml-1 mr-2" />
                <input
                  id="hrmCode"
                  type="text"
                  value={hrmCode}
                  onChange={(e) => setHrmCode(e.target.value)}
                  placeholder="Nhập Mã HRM"
                  className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#1D1D22] placeholder:text-[#7A8086] h-full"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-[700] tracking-[0.1em] text-[#5F656B] uppercase mb-1">
                Mật khẩu
              </label>
              <div className={`login-input-wrap relative h-[42px] flex items-center ${error ? 'login-error' : ''}`}>
                <Lock className="w-[18px] h-[18px] text-[#5F656B] ml-1 mr-2" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="flex-1 bg-transparent border-none outline-none text-[15px] text-[#1D1D22] placeholder:text-[#7A8086] h-full"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="p-[12px] bg-[#FFECEC] border border-[#FFC4C6] rounded-[6px] text-[#8C1D21] text-[13px] font-[600] flex items-center gap-2">
                <AlertCircle className="w-[16px] h-[16px] text-[#B3262B] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-btn w-full h-[48px] rounded-[6px] text-white text-[13px] font-[700] tracking-[0.14em] uppercase flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <LogIn className="w-[18px] h-[18px]" />
              <span>{loading ? 'Đang đăng nhập…' : 'ĐĂNG NHẬP'}</span>
            </button>
          </form>

          <div className="mt-auto pt-2">
            <p className="text-[12.5px] text-[#5F656B]">
              Chưa có tài khoản hoặc quên mật khẩu? <b className="text-[#CC4A0A]">Liên hệ quản trị viên hệ thống.</b>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
