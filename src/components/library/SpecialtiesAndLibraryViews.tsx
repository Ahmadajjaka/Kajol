import { useMemo, useState } from 'react';
import { Coins, Heart, Lock, Play, Search, Sparkles, Stethoscope } from 'lucide-react';
import { SIMULATION_MODES, SPECIALTIES } from '../../data/specialtiesAndLabTemplates';
import { getText } from '../../i18n/translations';
import {
  getSpecialtyRule,
  getTodaySpecialtyUsageCount,
  getUsageBudgetForUser,
  hasUserProOrFeature,
  isPlatformFeatureEnabled,
} from '../../lib/platformPolicy';
import {
  AiProvider,
  AppView,
  CaseArchetype,
  CaseDifficulty,
  ClinicalCase,
  Language,
  PlatformSettings,
  SimulationMode,
  SpecialtyId,
  UserProfile,
} from '../../types/clinical';
import { generateAiClinicalCase } from '../../services/aiService';

interface SpecialtiesViewProps {
  language: Language;
  profile: UserProfile;
  cases: ClinicalCase[];
  platformSettings: PlatformSettings;
  isAdmin: boolean;
  onSelectSpecialty: (sp: SpecialtyId) => void;
  onNavigate: (view: AppView) => void;
}

export function SpecialtiesView({
  language,
  profile,
  cases,
  platformSettings,
  isAdmin,
  onSelectSpecialty,
  onNavigate,
}: SpecialtiesViewProps) {
  const [filterCat, setFilterCat] = useState<'all' | 'medical' | 'surgical' | 'acute' | 'specialty'>('all');

  const filtered = SPECIALTIES.filter((sp) => (filterCat === 'all' ? true : sp.category === filterCat));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {language === 'ar' ? 'التخصصات الطبية (22 تخصصاً)' : 'Medical Specialties (22 Disciplines)'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {language === 'ar'
              ? 'تدرّب عبر حالات سريرية متدرجة من السهل إلى الصعب في جميع التخصصات السريرية والجراحية.'
              : 'Train across graduated clinical and surgical cases from foundational to specialist complexity.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800">
          {(['all', 'medical', 'surgical', 'acute', 'specialty'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                filterCat === cat
                  ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat === 'all'
                ? language === 'ar'
                  ? 'الكل'
                  : 'All'
                : cat === 'medical'
                  ? language === 'ar'
                    ? 'باطنية'
                    : 'Medical'
                  : cat === 'surgical'
                    ? language === 'ar'
                      ? 'جراحية'
                      : 'Surgical'
                    : cat === 'acute'
                      ? language === 'ar'
                        ? 'طوارئ'
                        : 'Acute'
                      : language === 'ar'
                        ? 'تخصصية'
                        : 'Specialty'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((sp) => {
          const activeCasesCount = cases.filter((c) => c.specialty === sp.id).length;
          const locked = sp.tier === 'pro' && !hasUserProOrFeature(profile, 'pro_specialties', isAdmin);
          const rule = getSpecialtyRule(sp.id, platformSettings);
          const usedSpecToday = getTodaySpecialtyUsageCount(profile, sp.id);
          return (
            <button
              key={sp.id}
              type="button"
              onClick={() => {
                onSelectSpecialty(sp.id);
                onNavigate('library');
              }}
              className={`text-start rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 p-5 flex flex-col justify-between transition-colors cursor-pointer ${
                !rule.enabled && !isAdmin ? 'opacity-65' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 gap-2">
                  <span className="truncate">
                    {sp.tier === 'pro' ? 'Pro Specialty' : 'Core Access'} ·{' '}
                    {!rule.enabled
                      ? language === 'ar'
                        ? 'موقوف'
                        : 'Paused'
                      : rule.costCredits > 0
                        ? `${rule.costCredits} ${language === 'ar' ? 'نقطة' : 'pts'}`
                        : language === 'ar'
                          ? 'مجاني'
                          : 'Free'}
                  </span>
                  {locked && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {language === 'ar' ? sp.nameAr : sp.nameEn}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sp.nameEn}</p>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
                <span className="font-mono-tabular text-slate-600 dark:text-slate-300 truncate">
                  {activeCasesCount} {language === 'ar' ? 'حالة' : 'ready'}
                  {rule.dailyLimit > 0
                    ? ` · ${usedSpecToday}/${rule.dailyLimit} ${language === 'ar' ? 'اليوم' : 'today'}`
                    : ` · ${sp.totalBankCases} ${language === 'ar' ? 'في المنهج' : 'curriculum'}`}
                </span>
                <span className="font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                  {language === 'ar' ? 'استعراض' : 'Explore'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CaseLibraryViewProps {
  language: Language;
  profile: UserProfile;
  cases: ClinicalCase[];
  selectedSpecialty: SpecialtyId | 'all';
  activeProvider: AiProvider;
  platformSettings: PlatformSettings;
  isAdmin: boolean;
  onChangeSpecialty: (sp: SpecialtyId | 'all') => void;
  onToggleFavorite: (caseId: string) => void;
  onStartCase: (clinicalCase: ClinicalCase, mode: SimulationMode) => void;
  onCaseGenerated: (newCase: ClinicalCase) => Promise<void>;
  onNavigate: (view: AppView) => void;
}

export function CaseLibraryView({
  language,
  profile,
  cases,
  selectedSpecialty,
  activeProvider,
  platformSettings,
  isAdmin,
  onChangeSpecialty,
  onToggleFavorite,
  onStartCase,
  onCaseGenerated,
  onNavigate,
}: CaseLibraryViewProps) {
  const t = getText(language);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<CaseDifficulty | 'all'>('all');
  const [archetype, setArchetype] = useState<CaseArchetype | 'all'>('all');
  const [selectedMode, setSelectedMode] = useState<SimulationMode>('practice');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [genSpecialty, setGenSpecialty] = useState<SpecialtyId>(
    selectedSpecialty === 'all' ? 'cardiology' : selectedSpecialty
  );
  const [genDifficulty, setGenDifficulty] = useState<CaseDifficulty>('medium');
  const [genArchetype, setGenArchetype] = useState<CaseArchetype>('common');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const aiGeneratorEnabled = isPlatformFeatureEnabled('aiCaseGenerator', platformSettings, profile, isAdmin);
  const osceEnabled = isPlatformFeatureEnabled('osceAndEmergency', platformSettings, profile, isAdmin);
  const aiGenCost = isAdmin ? 0 : Math.max(0, platformSettings.aiGenerationCost ?? 0);
  const userCredits = Number.isFinite(profile.credits) ? Number(profile.credits) : 0;

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (selectedSpecialty !== 'all' && c.specialty !== selectedSpecialty) return false;
      if (difficulty !== 'all' && c.difficulty !== difficulty) return false;
      if (archetype !== 'all' && c.archetype !== archetype) return false;
      if (favoritesOnly && !profile.favoriteCaseIds.includes(c.id)) return false;
      if (!q) return true;
      return (
        c.titleEn.toLowerCase().includes(q) ||
        c.titleAr.toLowerCase().includes(q) ||
        c.specialty.toLowerCase().includes(q) ||
        c.patientSummary.chiefComplaintEn.toLowerCase().includes(q) ||
        c.patientSummary.chiefComplaintAr.toLowerCase().includes(q)
      );
    });
  }, [cases, selectedSpecialty, difficulty, archetype, favoritesOnly, profile.favoriteCaseIds, search]);

  const handleGenerateAiCase = async () => {
    if (!aiGeneratorEnabled) {
      setGenError(
        language === 'ar'
          ? 'ميزة توليد الحالات بالذكاء الاصطناعي معطلة حالياً من قِبل الإدارة.'
          : 'AI Case Generator is currently disabled by Admin.'
      );
      return;
    }

    const genBudget = getUsageBudgetForUser(profile, genSpecialty, platformSettings, isAdmin);
    if (!genBudget.allowed) {
      setGenError(language === 'ar' ? genBudget.blockedReasonAr : genBudget.blockedReasonEn);
      return;
    }

    const totalCostNeeded = aiGenCost + (isAdmin ? 0 : genBudget.costCredits);
    if (!isAdmin && totalCostNeeded > userCredits) {
      setGenError(
        language === 'ar'
          ? `رصيدك (${userCredits} نقطة) لا يكفي لتوليد وبدء هذه الحالة (${totalCostNeeded} نقطة). اطلب شحن نقاط من الأدمن.`
          : `Your balance (${userCredits} pts) is insufficient to generate and launch this case (${totalCostNeeded} pts).`
      );
      return;
    }

    setGenerating(true);
    setGenError(null);
    try {
      const newCase = await generateAiClinicalCase({
        userId: profile.uid,
        specialty: genSpecialty,
        difficulty: genDifficulty,
        archetype: genArchetype,
        language,
        provider: activeProvider,
      });
      await onCaseGenerated(newCase);
      onStartCase(newCase, selectedMode);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate AI case.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + AI Dynamic Case Synthesizer */}
      <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.library.title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t.library.subtitle} ·{' '}
              <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-300">
                {language === 'ar' ? `رصيدك: ${userCredits} نقطة` : `Balance: ${userCredits} pts`}
              </span>
              {aiGenCost > 0 && (
                <span className="font-mono-tabular text-xs text-slate-500">
                  {' '}
                  · {language === 'ar' ? `تكلفة التوليد AI: ${aiGenCost} نقطة` : `AI Gen: ${aiGenCost} pts`}
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <select
              value={genSpecialty}
              onChange={(e) => setGenSpecialty(e.target.value as SpecialtyId)}
              disabled={!aiGeneratorEnabled}
              className="col-span-2 sm:col-span-1 px-3 py-2.5 sm:py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-medium min-h-[42px] disabled:opacity-50"
            >
              {SPECIALTIES.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {language === 'ar' ? sp.nameAr : sp.nameEn}
                </option>
              ))}
            </select>
            <select
              value={genDifficulty}
              onChange={(e) => setGenDifficulty(e.target.value as CaseDifficulty)}
              disabled={!aiGeneratorEnabled}
              className="px-3 py-2.5 sm:py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-medium min-h-[42px] disabled:opacity-50"
            >
              <option value="easy">{t.common.easy}</option>
              <option value="medium">{t.common.medium}</option>
              <option value="hard">{t.common.hard}</option>
            </select>
            <select
              value={genArchetype}
              onChange={(e) => setGenArchetype(e.target.value as CaseArchetype)}
              disabled={!aiGeneratorEnabled}
              className="px-3 py-2.5 sm:py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-medium min-h-[42px] disabled:opacity-50"
            >
              <option value="common">{language === 'ar' ? 'شائع' : 'Common'}</option>
              <option value="emergency">{language === 'ar' ? 'إسعافي' : 'Emergency'}</option>
              <option value="rare">{language === 'ar' ? 'نادر' : 'Rare'}</option>
              <option value="multimorbid">{language === 'ar' ? 'متعدد الأمراض' : 'Multi-morbid'}</option>
              <option value="misleading">{language === 'ar' ? 'معلومات مضللة' : 'Misleading'}</option>
              <option value="urgent">{language === 'ar' ? 'تدخل عاجل' : 'Urgent'}</option>
            </select>
            <button
              type="button"
              disabled={generating || !aiGeneratorEnabled}
              onClick={handleGenerateAiCase}
              className="col-span-2 sm:col-span-1 px-4 py-2.5 sm:py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 whitespace-nowrap min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {!aiGeneratorEnabled
                  ? language === 'ar'
                    ? 'معطل من الإدارة'
                    : 'Admin Disabled'
                  : generating
                    ? t.library.generating
                    : aiGenCost > 0
                      ? `${t.library.generateAiCase} (${aiGenCost} pts)`
                      : t.library.generateAiCase}
              </span>
            </button>
          </div>
        </div>

        {genError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200">
            {genError}
          </div>
        )}

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.library.searchPlaceholder}
              className="w-full ps-9 pe-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={selectedSpecialty}
            onChange={(e) => onChangeSpecialty(e.target.value as SpecialtyId | 'all')}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">{t.library.allSpecialties}</option>
            {SPECIALTIES.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {language === 'ar' ? sp.nameAr : sp.nameEn}
              </option>
            ))}
          </select>

          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as CaseDifficulty | 'all')}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">{t.library.allDifficulties}</option>
            <option value="easy">{t.common.easy}</option>
            <option value="medium">{t.common.medium}</option>
            <option value="hard">{t.common.hard}</option>
          </select>

          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as SimulationMode)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
          >
            {SIMULATION_MODES.map((m) => {
              const modeDisabledByFlag = (m.id === 'osce' || m.id === 'emergency') && !osceEnabled;
              const modeProLocked =
                m.tier === 'pro' && !hasUserProOrFeature(profile, m.id === 'osce' ? 'osce_mode' : 'pro_specialties', isAdmin);
              return (
                <option key={m.id} value={m.id} disabled={modeProLocked || modeDisabledByFlag}>
                  {language === 'ar' ? m.nameAr : m.nameEn}
                  {modeDisabledByFlag ? ' (Off)' : modeProLocked ? ' (Pro)' : ''}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              favoritesOnly
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                : 'bg-slate-50 dark:bg-[#081327] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'المفضلة' : 'Favorites'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{language === 'ar' ? 'النمط المرضي:' : 'Archetype:'}</span>
          {(['all', 'common', 'emergency', 'urgent', 'rare', 'multimorbid', 'misleading'] as const).map((arch) => (
            <button
              key={arch}
              type="button"
              onClick={() => setArchetype(arch)}
              className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                archetype === arch
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 dark:bg-[#081327] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {arch}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Grid */}
      {filteredCases.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {language === 'ar'
              ? 'لا توجد حالات مطابقة لمعايير البحث الحالية. جرّب تغيير الفلتر أو توليد حالة جديدة بالذكاء الاصطناعي.'
              : 'No matching cases found. Adjust filters or synthesize a fresh AI patient case above.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCases.map((c) => {
            const spMeta = SPECIALTIES.find((s) => s.id === c.specialty);
            const isLocked = c.tier === 'pro' && !hasUserProOrFeature(profile, 'pro_specialties', isAdmin);
            const isFav = profile.favoriteCaseIds.includes(c.id);
            const budget = getUsageBudgetForUser(profile, c.specialty, platformSettings, isAdmin);

            return (
              <article
                key={c.id}
                className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      {language === 'ar' ? spMeta?.nameAr : spMeta?.nameEn} · {t.common[c.difficulty]} ·{' '}
                      {c.archetype}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(c.id)}
                      aria-label="Toggle favorite"
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFav ? 'fill-rose-500 text-rose-500' : 'text-slate-400'
                        }`}
                      />
                    </button>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {language === 'ar' ? c.titleAr : c.titleEn}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {language === 'ar'
                      ? c.patientSummary.chiefComplaintAr
                      : c.patientSummary.chiefComplaintEn}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 truncate">
                    {budget.costCredits > 0 && <Coins className="w-3 h-3 text-amber-500 shrink-0" />}
                    <span className="truncate">
                      {c.sourceType === 'ai_generated' ? t.library.aiBadge : t.library.curatedBadge} ·{' '}
                      {!budget.enabled && !isAdmin
                        ? language === 'ar'
                          ? 'موقوف'
                          : 'Paused'
                        : budget.costCredits > 0
                          ? `${budget.costCredits} ${language === 'ar' ? 'نقطة' : 'pts'}`
                          : c.tier === 'pro'
                            ? 'Pro'
                            : language === 'ar'
                              ? 'مجاني'
                              : 'Free'}
                    </span>
                  </span>
                  {isLocked ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('subscriptions')}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{t.library.proLocked}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!budget.enabled && !isAdmin}
                      onClick={() => onStartCase(c, selectedMode)}
                      className="px-4 py-2 rounded-xl bg-[#0B162C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{t.library.startCase}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
