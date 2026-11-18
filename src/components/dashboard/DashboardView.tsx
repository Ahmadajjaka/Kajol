import {
  Activity,
  Award,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Coins,
  Flame,
  Play,
  Shuffle,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { SIMULATION_MODES, SPECIALTIES } from '../../data/specialtiesAndLabTemplates';
import { getText } from '../../i18n/translations';
import {
  getSpecialtyRule,
  getTodayUsageCount,
  hasUserProOrFeature,
  isPlatformFeatureEnabled,
} from '../../lib/platformPolicy';
import {
  AppView,
  ClinicalCase,
  Language,
  PlatformSettings,
  SimulationMode,
  SimulationSession,
  SpecialtyId,
  UserProfile,
} from '../../types/clinical';

interface DashboardViewProps {
  language: Language;
  profile: UserProfile;
  activeSession: SimulationSession | null;
  dailyCase: ClinicalCase;
  platformSettings: PlatformSettings;
  isAdmin: boolean;
  onNavigate: (view: AppView) => void;
  onSelectSpecialty: (specialty: SpecialtyId) => void;
  onLaunchMode: (mode: SimulationMode, customCase?: ClinicalCase) => void;
}

export function DashboardView({
  language,
  profile,
  activeSession,
  dailyCase,
  platformSettings,
  isAdmin,
  onNavigate,
  onSelectSpecialty,
  onLaunchMode,
}: DashboardViewProps) {
  const t = getText(language);
  const ArrowIcon = language === 'ar' ? ChevronLeft : ChevronRight;
  const levelFloorXp = (profile.level - 1) * 250;
  const levelProgressPct = Math.min(100, Math.round(((profile.xp - levelFloorXp) / 250) * 100));

  const userCredits = Number.isFinite(profile.credits) ? Number(profile.credits) : 0;
  const usedToday = getTodayUsageCount(profile);
  const dailyLimit =
    profile.subscriptionTier === 'pro'
      ? Math.max(1, platformSettings.proDailyLimit ?? 50)
      : Math.max(1, platformSettings.freeDailyLimit ?? 5);
  const osceFlagEnabled = isPlatformFeatureEnabled('osceAndEmergency', platformSettings, profile, isAdmin);

  return (
    <div className="space-y-8">
      {/* Hero Banner Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0B162C] text-white p-6 sm:p-8 flex flex-col justify-between min-h-[260px]">
          <img
            src="/src/assets/images/medical_hero_clinic_1794950526629.jpg"
            alt="Clinical Simulation Lab"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071021] via-[#0B162C]/80 to-[#0B162C]/65" />
          <div className="relative z-10 space-y-3 max-w-2xl">
            <p className="text-xs font-medium text-teal-300">
              {profile.displayName} · {t.tracks[profile.clinicalTrack]} ·{' '}
              {profile.subscriptionTier === 'pro' ? 'Pro' : 'Free'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-snug">
              {t.dashboard.welcome}
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              {language === 'ar'
                ? 'ابدأ محاكاة مريض افتراضي جديد عبر 22 تخصصاً طبياً، أو اختبر جاهزيتك في نمط الطوارئ ABCDE والتحدي السريري اليومي.'
                : 'Launch a progressive hospital patient simulation across 22 medical specialties, sharpen ABCDE emergency stabilization, or complete today’s clinical challenge.'}
            </p>
          </div>

          <div className="relative z-10 pt-6 flex flex-wrap items-center gap-3">
            {activeSession ? (
              <button
                type="button"
                onClick={() => onNavigate('patient_room')}
                className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>{t.dashboard.resumeSession}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('library')}
                className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Stethoscope className="w-4 h-4" />
                <span>{t.dashboard.startQuick}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onLaunchMode('random')}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Shuffle className="w-4 h-4 text-sky-300" />
              <span>{language === 'ar' ? 'حالة عشوائية عمياء' : 'Random Blind Case'}</span>
            </button>
          </div>
        </div>

        {/* Daily Clinical Challenge Card */}
        <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-teal-600 dark:text-teal-400">
                <CalendarCheck className="w-4 h-4" />
                <span>{t.dashboard.dailyChallenge}</span>
              </span>
              <span className="font-mono-tabular">+75 XP</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">
              {language === 'ar' ? dailyCase.titleAr : dailyCase.titleEn}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {dailyCase.specialty.replace('_', ' ')} · {dailyCase.patientSummary.age}{' '}
              {language === 'ar' ? 'سنة' : 'yrs'} ·{' '}
              {language === 'ar' ? dailyCase.patientSummary.settingAr : dailyCase.patientSummary.settingEn}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onLaunchMode('daily', dailyCase)}
            className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[#0B162C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t.dashboard.launchDaily}</span>
          </button>
        </div>
      </section>

      {/* 4-Column Real User Telemetry Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.dashboard.xpProgress}
            </span>
            <Award className="w-4 h-4 text-sky-500" />
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-bold font-mono-tabular">
              {language === 'ar' ? `المستوى ${profile.level}` : `Level ${profile.level}`}
            </span>
            <span className="text-xs font-mono-tabular text-teal-600 dark:text-teal-400">
              {profile.xp} XP
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-teal-500"
              style={{ width: `${levelProgressPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {language === 'ar' ? 'رصيد النقاط والاستخدام' : 'Points & Daily Quota'}
            </span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular">
            {userCredits} <span className="text-xs font-medium text-slate-400">{language === 'ar' ? 'نقطة' : 'pts'}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-tabular">
            {isAdmin
              ? language === 'ar'
                ? 'صلاحية أدمن غير محدودة'
                : 'Unlimited Admin access'
              : language === 'ar'
                ? `استخدام اليوم: ${usedToday}/${dailyLimit} حالات`
                : `Today: ${usedToday}/${dailyLimit} cases`}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.dashboard.casesCompleted}
            </span>
            <Activity className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular">{profile.completedCasesCount}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'ar'
              ? `${profile.badges.length} شارات إنجاز مكتسبة`
              : `${profile.badges.length} clinical badges unlocked`}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.dashboard.streak}
            </span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular">
            {profile.dailyStreak} {language === 'ar' ? 'أيام' : 'days'}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'ar'
              ? 'أتمم التحدي اليومي للحفاظ على السلسلة'
              : 'Complete daily challenge to extend streak'}
          </p>
        </div>
      </section>

      {/* 7 Simulation Modes */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t.dashboard.modesHeading}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SIMULATION_MODES.map((mode) => {
            const adminDisabled = (mode.id === 'osce' || mode.id === 'emergency') && !osceFlagEnabled;
            const featureId = mode.id === 'osce' ? 'osce_mode' : 'pro_specialties';
            const tierLocked = mode.tier === 'pro' && !hasUserProOrFeature(profile, featureId, isAdmin);
            return (
              <button
                key={mode.id}
                type="button"
                disabled={adminDisabled}
                onClick={() => (tierLocked ? onNavigate('subscriptions') : onLaunchMode(mode.id))}
                className={`text-start rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between transition-colors ${
                  adminDisabled
                    ? 'opacity-55 cursor-not-allowed'
                    : 'hover:border-sky-500/50 cursor-pointer'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{mode.tier === 'pro' ? 'Pro' : 'Free'}</span>
                    {mode.timedSeconds && (
                      <span className="font-mono-tabular">
                        {Math.round(mode.timedSeconds / 60)} min
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {language === 'ar' ? mode.nameAr : mode.nameEn}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {language === 'ar' ? mode.descAr : mode.descEn}
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
                  <span>
                    {adminDisabled
                      ? language === 'ar'
                        ? 'موقوف من الإدارة'
                        : 'Disabled by Admin'
                      : tierLocked
                        ? language === 'ar'
                          ? 'يتطلب Pro'
                          : 'Requires Pro'
                        : language === 'ar'
                          ? 'تشغيل النمط'
                          : 'Launch Mode'}
                  </span>
                  {!adminDisabled && <ArrowIcon className="w-3.5 h-3.5" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Specialties Strip */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t.dashboard.topSpecialties}</h2>
          <button
            type="button"
            onClick={() => onNavigate('specialties')}
            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            <span>{t.dashboard.viewAllSpecialties}</span>
            <ArrowIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {SPECIALTIES.slice(0, 6).map((sp) => {
            const rule = getSpecialtyRule(sp.id, platformSettings);
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => {
                  onSelectSpecialty(sp.id);
                  onNavigate('library');
                }}
                className="text-start rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 p-4 transition-colors cursor-pointer"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular mb-1 truncate">
                  {!rule.enabled
                    ? language === 'ar'
                      ? 'موقوف'
                      : 'Paused'
                    : rule.costCredits > 0
                      ? `${rule.costCredits} ${language === 'ar' ? 'نقطة' : 'pts'}`
                      : `${sp.totalBankCases} ${language === 'ar' ? 'حالة' : 'cases'}`}
                </p>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {language === 'ar' ? sp.nameAr : sp.nameEn}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {sp.nameEn}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
