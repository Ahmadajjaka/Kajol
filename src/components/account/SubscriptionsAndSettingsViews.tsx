import { useEffect, useState } from 'react';
import { Check, Coins, Crown, Save, Smartphone } from 'lucide-react';
import { getText } from '../../i18n/translations';
import { getTodayUsageCount } from '../../lib/platformPolicy';
import { getPrivateInfo, requestProUpgrade } from '../../services/firestoreService';
import { ClinicalTrack, Language, PlatformSettings, ThemeMode, UserProfile } from '../../types/clinical';
import { AndroidInstallButton } from '../common/AndroidInstallButton';

interface SubscriptionsViewProps {
  language: Language;
  profile: UserProfile;
  platformSettings: PlatformSettings;
}

export function SubscriptionsView({ language, profile, platformSettings }: SubscriptionsViewProps) {
  const [proRequestStatus, setProRequestStatus] = useState<'none' | 'requested' | 'approved'>('none');
  const [busy, setBusy] = useState(false);

  const userCredits = Number.isFinite(profile.credits) ? Number(profile.credits) : 0;
  const usedToday = getTodayUsageCount(profile);
  const dailyLimit =
    profile.subscriptionTier === 'pro'
      ? Math.max(1, platformSettings.proDailyLimit ?? 50)
      : Math.max(1, platformSettings.freeDailyLimit ?? 5);

  useEffect(() => {
    getPrivateInfo(profile.uid)
      .then((info) => {
        if (info?.proRequestStatus) setProRequestStatus(info.proRequestStatus);
      })
      .catch(() => {});
  }, [profile.uid]);

  const handleRequestPro = async () => {
    setBusy(true);
    try {
      await requestProUpgrade(profile.uid);
      setProRequestStatus('requested');
    } finally {
      setBusy(false);
    }
  };

  const freeFeatures =
    language === 'ar'
      ? [
          `حد استخدام يومي: ${platformSettings.freeDailyLimit ?? 5} حالات/يوم`,
          'التخصصات الطبية الأساسية (10 تخصصات)',
          'أنماط المبتدئين والممارسة والطوارئ والتحدي اليومي',
          'تقارير تقييم أساسية من 100 نقطة',
        ]
      : [
          `Daily quota: ${platformSettings.freeDailyLimit ?? 5} cases/day`,
          '10 core medical & surgical specialties',
          'Beginner, Clinical Practice, Emergency & Daily modes',
          'Standard 100-point rubric evaluation reports',
        ];

  const proFeatures =
    language === 'ar'
      ? [
          `حد استخدام يومي مرتفع: ${platformSettings.proDailyLimit ?? 50} حالة/يوم`,
          'جميع التخصصات الطبية الـ 22 كاملة',
          'الحالات النادرة والمعقدة ومتعددة الأمراض',
          'نمط امتحان OSCE الموقوت والمستوى المتقدم',
          'تحليل أداء معمّق وسجل سريري متكامل',
          'مساعد تعليمي متقدم وتوليد حالات بالذكاء الاصطناعي',
        ]
      : [
          `Expanded daily quota: ${platformSettings.proDailyLimit ?? 50} cases/day`,
          'Full access to all 22 medical & surgical specialties',
          'Complex, rare, multi-morbid & misleading diagnostic cases',
          'Timed OSCE Exam & Advanced Specialist simulation modes',
          'Deep performance analytics & complete clinical logbook',
          'Advanced AI clinical mentor & case synthesis',
        ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {language === 'ar' ? 'خطط الاشتراك والرصيد' : 'Subscription Plans & Wallet'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {language === 'ar'
              ? `خطتك الحالية: ${profile.subscriptionTier === 'pro' ? 'Pro' : 'Free'} · استخدام اليوم: ${usedToday}/${dailyLimit}`
              : `Current active plan: ${profile.subscriptionTier === 'pro' ? 'Pro' : 'Free'} · Today: ${usedToday}/${dailyLimit}`}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3 shrink-0">
          <Coins className="w-5 h-5 text-amber-500" />
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'ar' ? 'رصيد النقاط المشحون' : 'Credits Wallet'}
            </div>
            <div className="text-lg font-bold font-mono-tabular">
              {userCredits} {language === 'ar' ? 'نقطة' : 'pts'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Free Tier */}
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {language === 'ar' ? 'لطلاب الطب في البداية' : 'For foundational clinical practice'}
              </p>
              <h2 className="text-2xl font-bold mt-1">Free Plan</h2>
              <p className="text-3xl font-bold font-mono-tabular mt-2">$0</p>
            </div>
            <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 pt-2">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-6">
            <div className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-xs font-semibold">
              {profile.subscriptionTier === 'free'
                ? language === 'ar'
                  ? 'الخطة الحالية'
                  : 'Current Plan'
                : language === 'ar'
                  ? 'مشمول في Pro'
                  : 'Included in Pro'}
            </div>
          </div>
        </div>

        {/* Pro Tier */}
        <div className="rounded-2xl bg-[#0B162C] text-white border border-teal-400/40 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-teal-300 flex items-center gap-1.5">
                <Crown className="w-4 h-4" />
                <span>{language === 'ar' ? 'للأطباء وطلاب الامتياز واختبارات OSCE' : 'For residents, OSCE prep & specialists'}</span>
              </p>
              <h2 className="text-2xl font-bold mt-1">MAMO Pro</h2>
              <p className="text-3xl font-bold font-mono-tabular mt-2">
                $19 <span className="text-sm font-normal text-slate-300">/ month</span>
              </p>
            </div>
            <ul className="space-y-2.5 text-sm text-slate-200 pt-2">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-6">
            {profile.subscriptionTier === 'pro' ? (
              <div className="w-full py-2.5 px-4 rounded-xl bg-teal-500/20 border border-teal-400/40 text-center text-xs font-semibold text-teal-300">
                {language === 'ar' ? 'اشتراك Pro مفعّل' : 'Pro Subscription Active'}
              </div>
            ) : !platformSettings.proEnabled ? (
              <div className="w-full py-2.5 px-4 rounded-xl bg-slate-800 border border-slate-700 text-center text-xs font-semibold text-slate-300">
                {language === 'ar'
                  ? 'طلبات الترقية إلى Pro متوقفة مؤقتاً من الإدارة'
                  : 'Pro upgrade requests paused by Admin'}
              </div>
            ) : proRequestStatus === 'requested' ? (
              <div className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 border border-amber-400/40 text-center text-xs font-semibold text-amber-200">
                {language === 'ar'
                  ? 'تم إرسال طلب تفعيل Pro — بانتظار اعتماد الإدارة'
                  : 'Pro activation requested — awaiting Admin approval'}
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleRequestPro}
                className="w-full py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm cursor-pointer transition-colors"
              >
                {language === 'ar' ? 'طلب تفعيل عضوية Pro' : 'Request Pro Activation'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SettingsViewProps {
  language: Language;
  theme: ThemeMode;
  profile: UserProfile;
  onSavePreferences: (patch: {
    displayName: string;
    clinicalTrack: ClinicalTrack;
    language: Language;
    theme: ThemeMode;
  }) => Promise<void>;
}

export function SettingsView({
  language,
  theme,
  profile,
  onSavePreferences,
}: SettingsViewProps) {
  const t = getText(language);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [track, setTrack] = useState<ClinicalTrack>(profile.clinicalTrack);
  const [langChoice, setLangChoice] = useState<Language>(language);
  const [themeChoice, setThemeChoice] = useState<ThemeMode>(theme);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSavePreferences({
      displayName: displayName.trim() || profile.displayName,
      clinicalTrack: track,
      language: langChoice,
      theme: themeChoice,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.nav.settings}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {language === 'ar'
            ? 'خصّص لغة الواجهة، المظهر الليلي/النهاري، والمسار الطبي.'
            : 'Customize interface language, theme polarity, and clinical training track.'}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-5"
      >
        <div>
          <label className="block text-xs font-semibold mb-1.5">{t.auth.nameLabel}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">{t.auth.trackLabel}</label>
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as ClinicalTrack)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm"
          >
            <option value="student">{t.tracks.student}</option>
            <option value="doctor">{t.tracks.doctor}</option>
            <option value="specialist">{t.tracks.specialist}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              {language === 'ar' ? 'اللغة' : 'Language'}
            </label>
            <select
              value={langChoice}
              onChange={(e) => setLangChoice(e.target.value as Language)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm"
            >
              <option value="ar">العربية (RTL) + مصطلحات EN</option>
              <option value="en">English (LTR)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">
              {language === 'ar' ? 'المظهر' : 'Appearance'}
            </label>
            <select
              value={themeChoice}
              onChange={(e) => setThemeChoice(e.target.value as ThemeMode)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm"
            >
              <option value="dark">{t.common.dark}</option>
              <option value="light">{t.common.light}</option>
            </select>
          </div>
        </div>

        {saved && (
          <p className="text-xs text-teal-600 dark:text-teal-400 font-medium">
            {language === 'ar' ? 'تم حفظ الإعدادات بنجاح.' : 'Preferences saved successfully.'}
          </p>
        )}

        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{t.common.save}</span>
        </button>
      </form>

      <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-5 h-5 text-teal-500" />
          <h2 className="text-base font-bold">
            {language === 'ar' ? 'تثبيت تطبيق أندرويد والهاتف' : 'Android & Mobile App Installation'}
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {language === 'ar'
            ? 'ثبّت منصة MAMO CLINICAL SIMULATOR AI كتطبيق مستقل على شاشة هاتف أندرويد (WebAPK) للوصول الفوري بملء الشاشة دون شريط المتصفح.'
            : 'Install MAMO CLINICAL SIMULATOR AI directly onto your Android launcher (WebAPK) for full-screen mobile clinical simulation.'}
        </p>
        <AndroidInstallButton language={language} variant="full" />
      </div>
    </div>
  );
}
