import { useState } from 'react';
import { Download, Smartphone, WifiOff, X, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePWAInstall';
import { Language } from '../../types/clinical';

interface AndroidInstallButtonProps {
  language: Language;
  variant?: 'header' | 'full';
}

export function AndroidInstallButton({ language, variant = 'header' }: AndroidInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        const accepted = await install();
        if (!accepted) {
          setShowGuide(true);
        }
      } finally {
        setInstalling(false);
      }
      return;
    }
    setShowGuide(true);
  };

  const label =
    variant === 'full'
      ? language === 'ar'
        ? 'تثبيت تطبيق أندرويد (APK / WebAPK)'
        : 'Install Android App (WebAPK)'
      : language === 'ar'
        ? 'تثبيت أندرويد'
        : 'Install App';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className={
          variant === 'full'
            ? 'w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[42px]'
            : 'px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors min-h-[38px]'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3 sm:p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-500 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {language === 'ar'
                      ? 'تثبيت MAMO AI على أندرويد والهاتف'
                      : 'Install MAMO AI on Android & Mobile'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {language === 'ar'
                      ? 'يعمل كتطبيق مستقل بملء الشاشة (WebAPK)'
                      : 'Launches as a standalone full-screen mobile app'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs leading-relaxed">
                <p className="font-bold text-sky-600 dark:text-sky-400">
                  {language === 'ar' ? 'خطوات التثبيت على iPhone / iPad (Safari):' : 'iPhone / iPad (Safari):'}
                </p>
                <p>
                  {language === 'ar'
                    ? '1. اضغط على زر المشاركة (Share) في شريط Safari.'
                    : '1. Tap the Share button in Safari toolbar.'}
                </p>
                <p>
                  {language === 'ar'
                    ? '2. اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                    : '2. Scroll down and tap "Add to Home Screen".'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs leading-relaxed">
                <p className="font-bold text-teal-600 dark:text-teal-400">
                  {language === 'ar'
                    ? 'خطوات التثبيت المباشر على أندرويد (Chrome WebAPK):'
                    : 'Direct Android Installation (Chrome WebAPK):'}
                </p>
                <p>
                  {language === 'ar'
                    ? '1. افتح رابط التطبيق مباشرة في متصفح Google Chrome على هاتفك.'
                    : '1. Open the app URL directly in Google Chrome on Android.'}
                </p>
                <p>
                  {language === 'ar'
                    ? '2. اضغط على زر القائمة ⋮ أعلى المتصفح ثم اختر «تثبيت التطبيق» (Install App) أو «إضافة إلى الشاشة الرئيسية».'
                    : '2. Tap Chrome menu ⋮ -> "Install App" (or "Add to Home Screen").'}
                </p>
                <p className="text-slate-500 dark:text-slate-400 flex items-start gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0 mt-0.5" />
                  <span>
                    {language === 'ar'
                      ? 'يقوم نظام أندرويد بتوليد وتثبيت حزمة WebAPK أصلية بأيقونة التطبيق ودون شريط المتصفح.'
                      : 'Android generates and installs a native WebAPK package directly on your launcher without Play Store.'}
                  </span>
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              {isInstallable && (
                <button
                  type="button"
                  onClick={install}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
                >
                  {language === 'ar' ? 'تثبيت الآن' : 'Install Now'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator({ language }: { language: Language }) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 start-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {language === 'ar'
          ? 'وضع عدم الاتصال — يتم استخدام البيانات المخزنة مؤقتاً'
          : 'Offline Mode — Cached interface active'}
      </span>
    </div>
  );
}
