'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEMO_LOGIN_HINTS } from '@/lib/auth/service';
import { isDemoMode } from '@/lib/supabase';
import { PLATFORM_NAME, PLATFORM_SHORT_NAME } from '@/lib/constants/branding';

type Mode = 'email' | 'phone';

export default function LoginPage() {
  const router = useRouter();
  const { loginWithEmail, sendPhoneCode, loginWithPhone, session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('admin@tawaqqa.sa');
  const [password, setPassword] = useState('Admin@123');
  const [phone, setPhone] = useState('0599776676');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace('/me');
  }, [loading, session, router]);

  const onEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const err = await loginWithEmail(email, password);
    setBusy(false);
    if (err) setError(err);
    else router.replace('/me');
  };

  const onSendOtp = async () => {
    setBusy(true);
    setError(null);
    const result = await sendPhoneCode(phone);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOtpSent(true);
    setDemoOtp(result.demoOtp ?? null);
  };

  const onPhoneSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!otpSent) {
      await onSendOtp();
      return;
    }
    setBusy(true);
    setError(null);
    const err = await loginWithPhone(phone, otp);
    setBusy(false);
    if (err) setError(err);
    else router.replace('/me');
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <section className="relative hidden lg:flex flex-col justify-between p-10 text-white overflow-hidden bg-[#1f4d3a]">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #b8e986 0%, transparent 40%), radial-gradient(circle at 80% 80%, #4caf50 0%, transparent 45%)',
          }}
        />
        <div className="relative z-10">
          <p className="text-sm text-white/70">منصة استشارات السلامة</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight">{PLATFORM_SHORT_NAME}</h1>
          <p className="mt-4 max-w-md text-white/85 leading-relaxed">{PLATFORM_NAME}</p>
        </div>
        <p className="relative z-10 text-sm text-white/70">
          الدخول للموظفين فقط — كل مستخدم بصلاحياته وصفحته الخاصة
        </p>
      </section>

      <section className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-sm text-[#1f4d3a] font-semibold">{PLATFORM_SHORT_NAME}</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">تسجيل الدخول</h1>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">دخول الموظفين</h2>
            <p className="text-sm text-gray-500 mb-5">بريد وكلمة مرور، أو جوال مع كود تحقق</p>

            <div className="grid grid-cols-2 gap-2 mb-5 bg-gray-50 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('email')}
                className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                  mode === 'email' ? 'bg-white shadow text-[#1f4d3a]' : 'text-gray-500'
                }`}
              >
                إيميل وكلمة سر
              </button>
              <button
                type="button"
                onClick={() => setMode('phone')}
                className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                  mode === 'phone' ? 'bg-white shadow text-[#1f4d3a]' : 'text-gray-500'
                }`}
              >
                جوال وكود تحقق
              </button>
            </div>

            {mode === 'email' ? (
              <form onSubmit={onEmailSubmit} className="space-y-4">
                <label className="block text-sm">
                  <span className="text-gray-600 mb-1.5 block">البريد الإلكتروني</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#1f4d3a]"
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600 mb-1.5 block">كلمة المرور</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#1f4d3a]"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#1f4d3a] text-white rounded-xl py-3 font-semibold hover:bg-[#163828] disabled:opacity-60"
                >
                  {busy ? 'جاري الدخول...' : 'دخول'}
                </button>
              </form>
            ) : (
              <form onSubmit={onPhoneSubmit} className="space-y-4">
                <label className="block text-sm">
                  <span className="text-gray-600 mb-1.5 block">رقم الجوال</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#1f4d3a]"
                    placeholder="05xxxxxxxx"
                    required
                  />
                </label>
                {otpSent && (
                  <label className="block text-sm">
                    <span className="text-gray-600 mb-1.5 block">كود التحقق</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#1f4d3a] tracking-widest"
                      placeholder="------"
                      required
                    />
                  </label>
                )}
                {demoOtp && (
                  <p className="text-xs bg-amber-50 text-amber-800 border border-amber-100 rounded-lg px-3 py-2">
                    كود التحقق التجريبي: <strong className="tracking-widest">{demoOtp}</strong>
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#1f4d3a] text-white rounded-xl py-3 font-semibold hover:bg-[#163828] disabled:opacity-60"
                >
                  {busy ? 'جاري المعالجة...' : otpSent ? 'تأكيد الدخول' : 'إرسال كود التحقق'}
                </button>
              </form>
            )}

            {error && (
              <p className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {isDemoMode && (
            <div className="mt-5 bg-white/80 border border-dashed border-gray-300 rounded-2xl p-4 text-sm">
              <p className="font-semibold text-gray-800 mb-2">حسابات تجريبية</p>
              <ul className="space-y-2 text-gray-600">
                {DEMO_LOGIN_HINTS.map((hint) => (
                  <li
                    key={hint.email}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                  >
                    <span>{hint.label}</span>
                    <span className="font-mono text-xs text-gray-500">
                      {hint.email} / {hint.password} · {hint.phone}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
