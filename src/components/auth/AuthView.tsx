import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { ShieldAlert, Stethoscope, ArrowRightLeft } from 'lucide-react';
import { auth, googleProvider } from '../../lib/firebase';
import { getText } from '../../i18n/translations';
import { ClinicalTrack, Language, ThemeMode } from '../../types/clinical';
import { AndroidInstallButton } from '../common/AndroidInstallButton';

interface AuthViewProps {
  language: Language;
  theme: ThemeMode;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onSelectedTrack: (track: ClinicalTrack) => void;
}

export function AuthView({
  language,
  theme,
  onToggleLanguage,
  onToggleTheme,
  onSelectedTrack,
}: AuthViewProps) {
  const t = getText(language);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [track, setTrack] = useState<ClinicalTrack>('student');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleGoogle = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      onSelectedTrack(track);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      onSelectedTrack(track);
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        await sendEmailVerification(cred.user);
        setInfoMsg(
          language === 'ar'
            ? 'تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني.'
            : 'Account created. A verification link has been sent to your email.'
        );
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('operation-not-allowed')) {
        setErrorMsg(
          language === 'ar'
            ? 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل بعد في Firebase Console. يمكنك استخدام زر Google أعلاه فوراً أو تفعيل Email/Password من لوحة Firebase.'
            : 'Email/Password sign-in is not yet enabled in Firebase Console. Use Google Sign-In above immediately or enable Email/Password in Firebase Authentication settings.'
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#071021] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Minimal Header */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0B162C] dark:bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <span className="text-sm sm:text-lg font-bold tracking-tight whitespace-nowrap truncate">
            <span className="sm:hidden">MAMO AI</span>
            <span className="hidden sm:inline">MAMO CLINICAL SIMULATOR AI</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <AndroidInstallButton language={language} variant="header" />
          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 cursor-pointer flex items-center gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-sky-500" />
            <span>{language === 'ar' ? 'EN' : 'AR'}</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 cursor-pointer"
          >
            {theme === 'dark' ? t.common.light : t.common.dark}
          </button>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
        {/* Left Visual Clinical Showcase */}
        <div className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0B162C] min-h-[340px] flex flex-col justify-end">
          <img
            src="/src/assets/images/medical_hero_clinic_1794950526629.jpg"
            alt="MAMO Clinical Simulation Suite"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060E1F] via-[#060E1F]/55 to-transparent" />
          <div className="relative z-10 p-6 sm:p-8 space-y-3 text-white">
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-teal-300">
              22 Medical Specialties · 7 Simulation Modes · AI Patient Engine
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-snug">
              {t.tagline}
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed max-w-xl">
              {language === 'ar'
                ? 'تدرّب على استجواب المرضى الافتراضيين، طلب الفحوصات المخبرية وتخطيط القلب والأشعة، وبناء التشخيص التفريقي والخطة العلاجية مع تقييم سريري دقيق من 100 نقطة.'
                : 'Practice real-time virtual patient interviews, progressive physical exams, 13-panel lab ordering, ECG & radiology interpretation, and 100-point OSCE rubric scoring.'}
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs text-amber-200/90">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{t.disclaimerShort}</span>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col justify-center">
          <h2 className="text-2xl font-bold mb-1.5">{t.auth.title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{t.auth.subtitle}</p>

          {/* Clinical Track Selector */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              {t.auth.trackLabel}
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-[#081327]">
              {(['student', 'doctor', 'specialist'] as ClinicalTrack[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTrack(item)}
                  className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer truncate ${
                    track === item
                      ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item === 'student'
                    ? language === 'ar'
                      ? 'طالب طب'
                      : 'Student'
                    : item === 'doctor'
                      ? language === 'ar'
                        ? 'طبيب'
                        : 'Doctor'
                      : language === 'ar'
                        ? 'اختصاصي'
                        : 'Specialist'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogle}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0B162C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 mb-5"
          >
            {t.auth.googleBtn}
          </button>

          <div className="relative flex items-center justify-center mb-5">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            <span className="px-3 text-xs text-slate-400 bg-white dark:bg-[#0F1D36]">
              {language === 'ar' ? 'أو بالبريد الإلكتروني' : 'OR EMAIL'}
            </span>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-200">
              {infoMsg}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t.auth.nameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={language === 'ar' ? 'د. أحمد محمد' : 'Dr. Sarah Ahmed'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-sky-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.auth.emailLabel}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="clinician@hospital.org"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.auth.passwordLabel}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSignUp ? t.auth.signUpBtn : t.auth.signInBtn}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setIsSignUp((v) => !v);
              setErrorMsg(null);
            }}
            className="mt-4 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline self-center cursor-pointer"
          >
            {isSignUp ? t.auth.switchToSignIn : t.auth.switchToSignUp}
          </button>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <AndroidInstallButton language={language} variant="full" />
          </div>
        </div>
      </main>
    </div>
  );
}
