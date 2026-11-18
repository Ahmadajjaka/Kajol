import { ArrowRightLeft, Clock, LogOut, RefreshCw, ShieldAlert, ShieldX, Stethoscope } from 'lucide-react';
import { getText } from '../../i18n/translations';
import { Announcement, Language, ThemeMode, UserProfile } from '../../types/clinical';

interface ApprovalGateViewProps {
  language: Language;
  theme: ThemeMode;
  profile: UserProfile;
  email: string;
  announcements: Announcement[];
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
}

export function ApprovalGateView({
  language,
  theme,
  profile,
  email,
  announcements,
  onToggleLanguage,
  onToggleTheme,
  onRefresh,
  onSignOut,
}: ApprovalGateViewProps) {
  const t = getText(language);
  const isRejected = profile.approvalStatus === 'rejected';

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#071021] text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0B162C] dark:bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight whitespace-nowrap truncate">
            MAMO CLINICAL SIMULATOR AI
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 cursor-pointer flex items-center gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-sky-500" />
            <span>{language === 'ar' ? 'EN' : 'AR'}</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 cursor-pointer"
          >
            {theme === 'dark' ? t.common.light : t.common.dark}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col justify-center gap-5">
        {announcements.length > 0 && (
          <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-4 space-y-1">
            <div className="text-xs font-bold text-sky-700 dark:text-sky-300">
              {language === 'ar' ? announcements[0].titleAr : announcements[0].titleEn}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {language === 'ar' ? announcements[0].messageAr : announcements[0].messageEn}
            </p>
          </div>
        )}

        <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5 text-center">
          <div
            className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center border ${
              isRejected
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-500'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-500'
            }`}
          >
            {isRejected ? <ShieldX className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {isRejected
                ? language === 'ar'
                  ? 'تم رفض طلب تسجيل الدخول'
                  : 'Access Request Declined'
                : language === 'ar'
                  ? 'طلب الدخول بانتظار موافقة الإدارة'
                  : 'Login Request Pending Admin Approval'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg mx-auto">
              {isRejected
                ? language === 'ar'
                  ? 'تم رفض طلب تفعيل حسابك من قِبل مدير المنصة. تواصل مع الإدارة لإعادة المراجعة أو التفعيل.'
                  : 'Your account access request was declined by the platform administrator. Contact administration for review.'
                : language === 'ar'
                  ? 'تم إرسال طلب تسجيل دخولك إلى لوحة تحكم الأدمن بنجاح. بمجرد القبول سيُفتح لك الوصول تلقائياً دون الحاجة لإعادة التسجيل.'
                  : 'Your access request has been routed to the Admin Control Center. As soon as an Admin approves it, access unlocks automatically.'}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-4 text-start space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{language === 'ar' ? 'الاسم:' : 'Name:'}</span>
              <span className="font-semibold">{profile.displayName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{language === 'ar' ? 'البريد:' : 'Email:'}</span>
              <span className="font-mono-tabular truncate">{email}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{language === 'ar' ? 'المسار:' : 'Track:'}</span>
              <span className="font-semibold">{t.tracks[profile.clinicalTrack]}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{language === 'ar' ? 'حالة الطلب:' : 'Status:'}</span>
              <span
                className={`font-bold ${
                  isRejected ? 'text-rose-500' : 'text-amber-500'
                }`}
              >
                {isRejected
                  ? language === 'ar'
                    ? 'مرفوض (Rejected)'
                    : 'Rejected'
                  : language === 'ar'
                    ? 'قيد المراجعة (Pending)'
                    : 'Pending Review'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onRefresh}
              className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer min-h-[42px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{language === 'ar' ? 'تحديث حالة الطلب' : 'Check Approval Status'}</span>
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer min-h-[42px]"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.auth.logout}</span>
            </button>
          </div>

          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{t.disclaimerShort}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
