import React, { useState } from 'react';
import { ShieldIcon, Loader2Icon, ArrowRightIcon, LockIcon, MusicIcon, CalculatorIcon } from 'lucide-react';
import vcpmcLogo from '../assets/vcpmc-logo-animated.webp';
import { useAuth } from '../lib/auth';
import { Modal } from '../components/app-ui/Modal';
import { Button } from '../components/app-ui/Button';
import { Input } from '../components/app-ui/Input';
import { Checkbox } from '../components/app-ui/Checkbox';
export function LoginPage() {
  const { devLogin, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const showDevLogin = import.meta.env.VITE_DEV_AUTH_ENABLED === 'true';
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };
  const handleDevLogin = async () => {
    setError('');
    setDevLoading(true);
    try {
      await devLogin();
    } catch (err: any) {
      setError(err.message);
      setDevLoading(false);
    }
  };
  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#F4F9EE] lg:grid lg:grid-cols-[1.15fr_minmax(460px,0.85fr)]">
      {/* ── Hero panel: official VCPMC banner ───────────────────────────── */}
      <div
        className="relative hidden lg:block overflow-hidden"
        style={{ background: 'linear-gradient(165deg, #2F5A0B 0%, #4A7202 55%, #63960A 100%)' }}
      >
        <img
          src="/brand/vcpmc-hero.jpg"
          alt=""
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[74%] w-full object-cover object-right-bottom"
          style={{
            opacity: 1,
            maskImage: 'linear-gradient(to top, black 62%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to top, black 62%, transparent 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(150deg, rgba(28,58,6,0.55) 0%, rgba(30,62,8,0.18) 45%, rgba(30,62,8,0.02) 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[62%]"
          style={{ background: 'linear-gradient(to right, rgba(16,34,3,0.62), rgba(16,34,3,0.24) 60%, transparent)' }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white ring-1 ring-white/70 shadow-lg overflow-hidden flex items-center justify-center">
              <img src={vcpmcLogo} alt="VCPMC" className="h-full w-full object-cover" />
            </div>
            <div className="leading-tight">
              <p className="text-white text-[13px] font-bold tracking-[0.18em] uppercase">VCPMC</p>
              <p className="text-white/75 text-[11px]">Trung tâm Bảo vệ quyền tác giả âm nhạc Việt Nam</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="h-px w-16 bg-white/50 mb-6" />
            <h1
              style={{ color: '#FFFFFF', fontSize: 'clamp(34px, 3vw, 44px)' }}
              className="font-semibold leading-[1.15] tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            >
              Sáng tạo dồi dào,<br />lợi ích đảm bảo
            </h1>
            <p className="mt-4 text-white/80 text-[15px] leading-relaxed max-w-md">
              Hệ thống quản lý hợp đồng, cấp phép và giấy chứng nhận quyền tác giả âm nhạc.
            </p>
          </div>

          <p className="text-white/60 text-[11.5px] tracking-wide">
            © {new Date().getFullYear()} VCPMC · vcpmc.org
          </p>
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center px-6 py-14 bg-white">
        {/* Mobile: banner strip on top */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-40 lg:hidden overflow-hidden">
          <img src="/brand/vcpmc-hero.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1B3A05]/35 via-white/40 to-white" />
        </div>

        <div className="relative z-10 w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-white flex items-center justify-center shadow-[0_10px_30px_-12px_rgba(74,114,2,0.45)] ring-1 ring-[#DCE8CC] overflow-hidden lg:hidden">
            <img src={vcpmcLogo} alt="VCPMC" className="h-full w-full object-cover" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#76B400]/10 border border-[#76B400]/25">
            <MusicIcon className="h-3 w-3 text-[#4A7202]" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#4A7202] uppercase">
              Quyền tác giả Âm nhạc Việt Nam
            </span>
          </div>
          <h2 className="mt-4 text-[24px] font-semibold tracking-tight text-[#22301A]">Đăng nhập hệ thống</h2>
          <p className="mt-1.5 text-[#6b6661] text-[13.5px]">
            Quản lý hợp đồng và giấy chứng nhận
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#76B400]/60 to-transparent" />
          <form onSubmit={handleSubmit} className="space-y-5">
            {error &&
            <div className="p-3 rounded-lg bg-rose-50 ring-1 ring-rose-200/70 text-rose-700 text-sm flex items-start gap-2">
                <ShieldIcon className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            }

            <div>
              <label className="block text-[12px] font-semibold text-[#5a5450] mb-1.5 tracking-wide">
                Tài khoản
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white text-[#2d2926] ring-1 ring-[#DCE8CC] hover:ring-[#76B400]/60 focus:outline-none focus:ring-2 focus:ring-[#76B400]/50 transition-shadow placeholder:text-[#9AA88F] text-sm"
                placeholder="admin@vcpmc.org" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[12px] font-semibold text-[#5a5450] tracking-wide">
                  Mật khẩu
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-[#4A7202] hover:text-[#37560A] hover:underline transition-colors font-medium">
                  Quên mật khẩu?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white text-[#2d2926] ring-1 ring-[#DCE8CC] hover:ring-[#76B400]/60 focus:outline-none focus:ring-2 focus:ring-[#76B400]/50 transition-shadow placeholder:text-[#9AA88F] text-sm"
                placeholder="••••••••" />
            </div>

            <div className="flex items-center">
              <Checkbox
                checked={remember}
                onChange={setRemember}
                label={
                <span className="text-[#5a5450] text-sm">
                    Ghi nhớ đăng nhập
                  </span>
                } />
            </div>

            <button
              type="submit"
              disabled={loading || devLoading}
              className="group w-full h-11 rounded-xl bg-gradient-to-r from-[#76B400] to-[#4A7202] hover:from-[#8CCB1A] hover:to-[#5C8A0C] active:from-[#69A200] active:to-[#3F6303] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_25px_-5px_rgba(118,180,0,0.5)] ring-1 ring-inset ring-[#DDEEC0]/50">
              {loading ?
              <Loader2Icon className="h-4 w-4 animate-spin" /> :
              <>
                  Đăng nhập <ArrowRightIcon className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              }
            </button>

            <div className="flex items-center gap-3 pt-1" aria-hidden>
              <span className="flex-1 h-px bg-[#E7EDE1]" />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#6E7A5E]">
                Công cụ dùng chung
              </span>
              <span className="flex-1 h-px bg-[#E7EDE1]" />
            </div>

            <a
              href="/bang-tinh"
              data-testid="public-calculator-link"
              className="group w-full h-11 rounded-xl bg-white hover:bg-[#FBFDF8] text-[#2d2926] font-semibold text-sm transition-all flex items-center justify-center gap-2 ring-1 ring-[#DCE8CC] hover:ring-[#76B400]/60 shadow-[0_2px_10px_-4px_rgba(28,58,6,0.18)]"
            >
              <CalculatorIcon className="h-4 w-4 text-[#4A7202]" />
              <span>Bảng tính tiền bản quyền</span>
              <ArrowRightIcon className="h-4 w-4 text-[#8A9483] group-hover:translate-x-0.5 transition-transform" />
            </a>
            <p className="-mt-2 text-center text-[11.5px] text-[#6E7A5E]">
              Sử dụng công cụ tính chung, không cần đăng nhập.
            </p>

            {showDevLogin &&
            <button
              type="button"
              disabled={loading || devLoading}
              onClick={handleDevLogin}
              className="w-full h-10 rounded-lg bg-white hover:bg-[#FBFDF8] text-[#4A7202] font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ring-1 ring-[#DCE8CC] hover:ring-[#76B400]/60">
              {devLoading ?
              <Loader2Icon className="h-4 w-4 animate-spin" /> :
              <>
                  Dev UI validation login <ShieldIcon className="h-4 w-4" />
                </>
              }
            </button>
            }
          </form>
        </div>

        <div className="mt-8 text-center text-xs text-[#6E7A5E]">
          <p>Đăng nhập bằng tài khoản hiện có trong hệ thống.</p>
        </div>
        </div>
      </div>

      <ForgotPasswordModal
        open={showForgot}
        onClose={() => setShowForgot(false)} />
    </div>);

}
function ForgotPasswordModal({
  open,
  onClose



}: {open: boolean;onClose: () => void;}) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };
  return (
    <Modal open={open} onClose={onClose} title="Quên mật khẩu" maxWidth="sm">
      <div className="p-6">
        {submitted ?
        <div className="text-center py-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-lime-100 flex items-center justify-center mb-4">
              <LockIcon className="h-6 w-6 text-lime-600" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 mb-2">
              Kiểm tra email
            </h3>
            <p className="text-sm text-zinc-500 mb-6">
              Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã
              được gửi.
            </p>
            <Button variant="primary" className="w-full" onClick={onClose}>
              Đóng
            </Button>
          </div> :

        <form onSubmit={handleSubmit}>
            <p className="text-sm text-zinc-500 mb-4">
              Nhập email liên kết với tài khoản của bạn để nhận hướng dẫn đặt
              lại mật khẩu.
            </p>
            <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@vcpmc.org"
            className="mb-6" />
          
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>
                Hủy
              </Button>
              <Button variant="primary" type="submit">
                Gửi hướng dẫn
              </Button>
            </div>
          </form>
        }
      </div>
    </Modal>);

}
