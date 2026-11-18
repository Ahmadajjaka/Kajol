import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  Check,
  Coins,
  Database,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  buildBaselineExam,
  buildBaselineImaging,
  buildBaselineLabs,
  CURATED_SEED_CASES,
} from '../../data/seedCases';
import { SPECIALTIES } from '../../data/specialtiesAndLabTemplates';
import {
  DEFAULT_FEATURE_FLAGS,
  USER_UNLOCKABLE_FEATURES,
} from '../../lib/platformPolicy';
import {
  adminChargeUserCredits,
  adminDeleteAnnouncement,
  adminDeleteCase,
  adminFetchAiLogs,
  adminFetchAllAnnouncements,
  adminFetchAllUsersWithPrivate,
  adminFetchErrorReports,
  adminPublishAnnouncement,
  adminSavePlatformSettings,
  adminToggleAnnouncement,
  adminUpdateErrorReportStatus,
  adminUpdateUserApproval,
  adminUpdateUserFeatures,
  adminUpdateUserTierAndTrack,
  adminUpsertClinicalCase,
} from '../../services/firestoreService';
import {
  AdminUserRecord,
  AiProvider,
  AiUsageLog,
  Announcement,
  AnnouncementSeverity,
  ApprovalStatus,
  CaseArchetype,
  CaseDifficulty,
  ClinicalCase,
  ClinicalTrack,
  ErrorReport,
  FeatureKey,
  Language,
  PlatformFeatureFlags,
  PlatformSettings,
  SpecialtyId,
  SpecialtyPricingRule,
  SubscriptionTier,
} from '../../types/clinical';

interface AdminDashboardViewProps {
  language: Language;
  isAdmin: boolean;
  adminUid: string;
  cases: ClinicalCase[];
  platformSettings: PlatformSettings;
  onRefreshCases: () => Promise<void>;
  onRefreshSettings: () => Promise<void>;
}

const FEATURE_META: {
  key: FeatureKey;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
}[] = [
  {
    key: 'requireLoginApproval',
    ar: 'طلب موافقة الأدمن عند تسجيل الدخول',
    en: 'Require Admin Approval for New Logins',
    descAr: 'يضع الحسابات الجديدة في قائمة الانتظار حتى يقبلها أو يرفضها الأدمن.',
    descEn: 'Routes new clinician sign-ins into the Admin approval queue before access.',
  },
  {
    key: 'aiCaseGenerator',
    ar: 'توليد الحالات السريرية بالذكاء الاصطناعي',
    en: 'AI Clinical Case Generator',
    descAr: 'يسمح للمستخدمين بتوليد مرضى افتراضيين جدد بالذكاء الاصطناعي.',
    descEn: 'Enables on-demand AI patient case synthesis in the library.',
  },
  {
    key: 'aiMedicalAssistant',
    ar: 'المساعد الطبي الذكي أثناء الاستجواب',
    en: 'Live AI Medical Assistant',
    descAr: 'يُظهر زر استشارة المساعد الطبي AI داخل شاشة استجواب المريض.',
    descEn: 'Enables the AI Clinical Mentor channel inside the patient interview chat.',
  },
  {
    key: 'anatomy3d',
    ar: 'المشاهد التشريحية ثلاثية الأبعاد (3D)',
    en: 'Interactive 3D Anatomy Viewer',
    descAr: 'يفعّل عارض الأعضاء ثلاثي الأبعاد داخل غرفة المريض والفحص السريري.',
    descEn: 'Displays the interactive Three.js organ viewer in patient room & exam.',
  },
  {
    key: 'osceAndEmergency',
    ar: 'أنماط امتحان OSCE والطوارئ الموقوتة',
    en: 'Timed OSCE & Emergency Modes',
    descAr: 'يتيح تشغيل محطات الامتحان الموقوتة ونمط الطوارئ ABCDE.',
    descEn: 'Allows launching timed OSCE stations and ABCDE emergency simulations.',
  },
  {
    key: 'examinerDebrief',
    ar: 'مناقشة الممتحن الذكي بعد التقييم',
    en: 'Post-Evaluation AI Examiner Debrief',
    descAr: 'يسمح للأطباء بمناقشة تقرير التقييم وطرح أسئلة المتابعة بعد انتهاء الحالة.',
    descEn: 'Allows post-report clinical Q&A with the AI Examiner.',
  },
];

export function AdminDashboardView({
  language,
  isAdmin,
  adminUid,
  cases,
  platformSettings,
  onRefreshCases,
  onRefreshSettings,
}: AdminDashboardViewProps) {
  const [userRecords, setUserRecords] = useState<AdminUserRecord[]>([]);
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [aiLogs, setAiLogs] = useState<AiUsageLog[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState<
    'users' | 'pricing' | 'announcements' | 'cases' | 'reports' | 'ai'
  >('users');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [serverProviders, setServerProviders] = useState<{ gemini: boolean; groq: boolean }>({
    gemini: false,
    groq: true,
  });

  // Users search & approval filter
  const [userSearch, setUserSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | ApprovalStatus>('all');
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});

  // Feature flags, limits & 22-specialty pricing draft
  const [providerDraft, setProviderDraft] = useState<AiProvider>(platformSettings.activeProvider);
  const [freeLimitDraft, setFreeLimitDraft] = useState<number>(platformSettings.freeDailyLimit);
  const [proLimitDraft, setProLimitDraft] = useState<number>(platformSettings.proDailyLimit ?? 50);
  const [aiGenCostDraft, setAiGenCostDraft] = useState<number>(platformSettings.aiGenerationCost ?? 0);
  const [proEnabledDraft, setProEnabledDraft] = useState<boolean>(platformSettings.proEnabled);
  const [featureFlagsDraft, setFeatureFlagsDraft] = useState<PlatformFeatureFlags>({
    ...DEFAULT_FEATURE_FLAGS,
    ...(platformSettings.featureFlags || {}),
  });
  const [specialtyRulesDraft, setSpecialtyRulesDraft] = useState<
    Partial<Record<SpecialtyId, SpecialtyPricingRule>>
  >(platformSettings.specialtyRules || {});
  const [specialtyFilter, setSpecialtyFilter] = useState('');

  // Announcements form
  const [annTitleAr, setAnnTitleAr] = useState('');
  const [annTitleEn, setAnnTitleEn] = useState('');
  const [annMsgAr, setAnnMsgAr] = useState('');
  const [annMsgEn, setAnnMsgEn] = useState('');
  const [annSeverity, setAnnSeverity] = useState<AnnouncementSeverity>('info');

  // Add Case Quick Form
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newTitleAr, setNewTitleAr] = useState('');
  const [newSpecialty, setNewSpecialty] = useState<SpecialtyId>('cardiology');
  const [newDifficulty, setNewDifficulty] = useState<CaseDifficulty>('medium');
  const [newArchetype, setNewArchetype] = useState<CaseArchetype>('common');
  const [newTier, setNewTier] = useState<SubscriptionTier>('free');
  const [newDxEn, setNewDxEn] = useState('');
  const [newTxEn, setNewTxEn] = useState('');

  useEffect(() => {
    setProviderDraft(platformSettings.activeProvider);
    setFreeLimitDraft(platformSettings.freeDailyLimit);
    setProLimitDraft(platformSettings.proDailyLimit ?? 50);
    setAiGenCostDraft(platformSettings.aiGenerationCost ?? 0);
    setProEnabledDraft(platformSettings.proEnabled);
    setFeatureFlagsDraft({
      ...DEFAULT_FEATURE_FLAGS,
      ...(platformSettings.featureFlags || {}),
    });
    setSpecialtyRulesDraft(platformSettings.specialtyRules || {});
  }, [platformSettings]);

  const loadAdminData = async () => {
    setBusy(true);
    try {
      const [u, r, l, anns, healthRes] = await Promise.all([
        adminFetchAllUsersWithPrivate(),
        adminFetchErrorReports(),
        adminFetchAiLogs(),
        adminFetchAllAnnouncements(),
        fetch('/api/health').then((res) => res.json()).catch(() => null),
      ]);
      setUserRecords(u);
      setReports(r);
      setAiLogs(l);
      setAnnouncements(anns);
      if (healthRes?.providers) {
        setServerProviders(healthRes.providers);
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Admin query failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin]);

  const pendingUsersCount = useMemo(
    () => userRecords.filter((r) => (r.profile.approvalStatus || 'approved') === 'pending').length,
    [userRecords]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return [...userRecords]
      .sort((a, b) => {
        const order = (st?: ApprovalStatus) => (st === 'pending' ? 0 : st === 'rejected' ? 2 : 1);
        return order(a.profile.approvalStatus || 'approved') - order(b.profile.approvalStatus || 'approved');
      })
      .filter((r) => {
        const st = r.profile.approvalStatus || 'approved';
        if (approvalFilter !== 'all' && st !== approvalFilter) return false;
        if (!q) return true;
        return (
          r.profile.displayName.toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          r.profile.uid.toLowerCase().includes(q)
        );
      });
  }, [userRecords, userSearch, approvalFilter]);

  const filteredSpecialties = useMemo(() => {
    const q = specialtyFilter.trim().toLowerCase();
    if (!q) return SPECIALTIES;
    return SPECIALTIES.filter(
      (sp) =>
        sp.nameEn.toLowerCase().includes(q) ||
        sp.nameAr.toLowerCase().includes(q) ||
        sp.id.toLowerCase().includes(q)
    );
  }, [specialtyFilter]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-rose-300 dark:border-rose-800 p-8 text-center space-y-2 max-w-lg mx-auto">
        <ShieldCheck className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold">
          {language === 'ar' ? 'وصول محصور بالإدارة' : 'Admin Authorization Required'}
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {language === 'ar'
            ? 'حسابك لا يمتلك صلاحيات الإدارة المحمية عبر قواعد Firestore.'
            : 'Your account does not hold verified Admin privileges in Firestore rules.'}
        </p>
      </div>
    );
  }

  const updateSpecialtyRuleDraft = (
    spId: SpecialtyId,
    patch: Partial<SpecialtyPricingRule>
  ) => {
    setSpecialtyRulesDraft((prev) => {
      const current = prev[spId] || { costCredits: 0, dailyLimit: 0, enabled: true };
      return {
        ...prev,
        [spId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const handleSaveSettingsAndPricing = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await adminSavePlatformSettings({
        activeProvider: providerDraft,
        freeDailyLimit: Math.max(1, Math.min(500, Math.round(freeLimitDraft || 5))),
        proDailyLimit: Math.max(1, Math.min(5000, Math.round(proLimitDraft || 50))),
        aiGenerationCost: Math.max(0, Math.min(1000, Math.round(aiGenCostDraft || 0))),
        proEnabled: proEnabledDraft,
        featureFlags: featureFlagsDraft,
        specialtyRules: specialtyRulesDraft,
      });
      await onRefreshSettings();
      setStatusMsg(
        language === 'ar'
          ? 'تم حفظ إعدادات الميزات والتسعير وحدود الاختصاصات لجميع المستخدمين.'
          : 'Platform features, point pricing, and specialty usage limits saved.'
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save platform settings');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitleAr.trim() && !annTitleEn.trim()) return;
    if (!annMsgAr.trim() && !annMsgEn.trim()) return;

    setBusy(true);
    setStatusMsg(null);
    try {
      const titleAr = (annTitleAr.trim() || annTitleEn.trim()).slice(0, 150);
      const titleEn = (annTitleEn.trim() || annTitleAr.trim()).slice(0, 150);
      const messageAr = (annMsgAr.trim() || annMsgEn.trim()).slice(0, 1500);
      const messageEn = (annMsgEn.trim() || annMsgAr.trim()).slice(0, 1500);

      await adminPublishAnnouncement({
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        titleAr,
        titleEn,
        messageAr,
        messageEn,
        severity: annSeverity,
        isActive: true,
        createdBy: adminUid,
      });

      setAnnTitleAr('');
      setAnnTitleEn('');
      setAnnMsgAr('');
      setAnnMsgEn('');
      await loadAdminData();
      setStatusMsg(
        language === 'ar'
          ? 'تم نشر الإشعار العام بنجاح وسيظهر فوراً لجميع المستخدمين.'
          : 'Global notification published to all active users.'
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to publish announcement');
    } finally {
      setBusy(false);
    }
  };

  const handleSeedCurated = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      for (const item of CURATED_SEED_CASES) {
        await adminUpsertClinicalCase({ ...item, createdBy: adminUid }, true);
      }
      await onRefreshCases();
      setStatusMsg(
        language === 'ar'
          ? `تم نشر ${CURATED_SEED_CASES.length} حالة مرجعية في قاعدة البيانات.`
          : `Synced ${CURATED_SEED_CASES.length} curated reference cases to Firestore.`
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitleEn.trim() || !newDxEn.trim()) return;
    setBusy(true);
    try {
      const created: ClinicalCase = {
        id: `case-admin-${Date.now()}`,
        specialty: newSpecialty,
        difficulty: newDifficulty,
        archetype: newArchetype,
        tier: newTier,
        isPublished: true,
        sourceType: 'curated',
        titleEn: newTitleEn.trim(),
        titleAr: newTitleAr.trim() || newTitleEn.trim(),
        patientSummary: {
          nameEn: 'Clinical Case Patient',
          nameAr: 'مريض الحالة السريرية',
          age: 45,
          gender: 'male',
          chiefComplaintEn: newTitleEn.trim(),
          chiefComplaintAr: newTitleAr.trim() || newTitleEn.trim(),
          settingEn: 'Hospital Department',
          settingAr: 'قسم المستشفى',
          isUrgent: newArchetype === 'emergency' || newArchetype === 'urgent',
          vitals: { hr: 92, bp: '118/74', rr: 18, spo2: 97, temp: 37.1, gcs: 15 },
        },
        clinicalTruth: {
          hpiEn: newTitleEn.trim(),
          hpiAr: newTitleAr.trim() || newTitleEn.trim(),
          pmhEn: 'Reviewed by medical editor.',
          pmhAr: 'مراجع سريرياً.',
          pshEn: 'None.',
          pshAr: 'لا يوجد.',
          medicationsEn: 'None.',
          medicationsAr: 'لا يوجد.',
          allergiesEn: 'NKDA.',
          allergiesAr: 'لا يوجد.',
          familyHistoryEn: 'Non-contributory.',
          familyHistoryAr: 'غير مهم.',
          socialHistoryEn: 'Non-smoker.',
          socialHistoryAr: 'غير مدخن.',
          physicalExam: buildBaselineExam(),
          labs: buildBaselineLabs(),
          imaging: buildBaselineImaging(),
          correctDiagnosisEn: newDxEn.trim(),
          correctDiagnosisAr: newDxEn.trim(),
          acceptableDiagnoses: [newDxEn.trim()],
          essentialDifferentials: [newDxEn.trim()],
          necessaryTests: ['cbc', 'renal'],
          unnecessaryTests: [],
          keyCluesEn: [newTitleEn.trim()],
          keyCluesAr: [newTitleAr.trim() || newTitleEn.trim()],
          correctTreatmentEn: newTxEn.trim() || 'Guideline-directed therapy.',
          correctTreatmentAr: newTxEn.trim() || 'العلاج وفق الإرشادات المعتمدة.',
          beginnerHintEn: 'Focus on systematic history and targeted workup.',
          beginnerHintAr: 'ركز على القصة السريرية والفحوصات الموجهة.',
        },
        guidelineRefs: ['Institutional Clinical Guidelines'],
        createdBy: adminUid,
      };
      await adminUpsertClinicalCase(created, true);
      await onRefreshCases();
      setNewTitleEn('');
      setNewTitleAr('');
      setNewDxEn('');
      setNewTxEn('');
      setStatusMsg(language === 'ar' ? 'تمت إضافة الحالة السريرية بنجاح.' : 'Clinical case created.');
    } finally {
      setBusy(false);
    }
  };

  const avgLatency =
    aiLogs.length === 0
      ? 0
      : Math.round(aiLogs.reduce((a, b) => a + b.latencyMs, 0) / aiLogs.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {language === 'ar' ? 'لوحة تحكم الإدارة المحمية' : 'Protected Admin Control Center'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'ar'
              ? 'إدارة طلبات تسجيل الدخول، شحن النقاط، تسعير الاختصاصات وحدود الاستخدام، تفعيل الميزات، ونشر الإشعارات.'
              : 'Manage login approvals, point wallets, specialty pricing & limits, feature flags, and global broadcasts.'}
          </p>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          <span>{language === 'ar' ? 'تحديث البيانات' : 'Refresh Data'}</span>
        </button>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-800 dark:text-teal-200 flex items-center justify-between gap-2">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Admin KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500">
            {language === 'ar' ? 'طلبات دخول بانتظار القبول' : 'Pending Login Requests'}
          </div>
          <div className="text-2xl font-bold font-mono-tabular mt-1 text-amber-500">
            {pendingUsersCount}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500">
            {language === 'ar' ? 'إجمالي الأطباء والطلاب' : 'Registered Clinicians'}
          </div>
          <div className="text-2xl font-bold font-mono-tabular mt-1">{userRecords.length}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500">
            {language === 'ar' ? 'الإشعارات النشطة للجميع' : 'Active Broadcasts'}
          </div>
          <div className="text-2xl font-bold font-mono-tabular mt-1 text-teal-500">
            {announcements.filter((a) => a.isActive).length}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500">
            {language === 'ar' ? 'طلبات AI / متوسط الاستجابة' : 'AI Calls / Avg Latency'}
          </div>
          <div className="text-2xl font-bold font-mono-tabular mt-1 text-sky-500">
            {aiLogs.length} · {avgLatency}ms
          </div>
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 w-full overflow-x-auto">
        {(
          [
            [
              'users',
              language === 'ar'
                ? `طلبات الدخول والنقاط (${pendingUsersCount})`
                : `Approvals & Credits (${pendingUsersCount})`,
              Users,
            ],
            [
              'pricing',
              language === 'ar' ? 'الميزات والتسعير والحدود' : 'Features & Pricing',
              Sliders,
            ],
            [
              'announcements',
              language === 'ar' ? 'نشر الإشعارات' : 'Broadcasts',
              Megaphone,
            ],
            ['cases', language === 'ar' ? 'إدارة الحالات' : 'Cases', Database],
            ['reports', language === 'ar' ? `البلاغات (${reports.filter((r) => r.status === 'open').length})` : 'Reports', ShieldCheck],
            ['ai', language === 'ar' ? 'استهلاك AI' : 'AI Engine', Activity],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              activeTab === id
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: Login Approval Queue, Credits Top-Up & Per-User Features */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={
                  language === 'ar' ? 'ابحث بالاسم أو البريد أو UID...' : 'Search by name, email, or UID...'
                }
                className="w-full ps-9 pe-3 py-2 rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800">
              {(
                [
                  ['all', language === 'ar' ? 'الكل' : 'All'],
                  ['pending', language === 'ar' ? 'بانتظار القبول' : 'Pending'],
                  ['approved', language === 'ar' ? 'مقبول' : 'Approved'],
                  ['rejected', language === 'ar' ? 'مرفوض' : 'Rejected'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setApprovalFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    approvalFilter === st
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
              {language === 'ar' ? 'لا يوجد مستخدمون مطابقون للتصفية الحالية.' : 'No users match this filter.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map(({ profile: u, email, proRequestStatus }) => {
                const approvalStatus: ApprovalStatus = u.approvalStatus || 'approved';
                const currentCredits = u.credits ?? 0;
                const draftCredit = creditInputs[u.uid] ?? '100';
                const unlocked = u.unlockedFeatures || [];

                return (
                  <div
                    key={u.uid}
                    className={`rounded-2xl bg-white dark:bg-[#0F1D36] border p-4 sm:p-5 space-y-4 ${
                      approvalStatus === 'pending'
                        ? 'border-amber-400/70 dark:border-amber-500/50'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Row 1: Identity + Approval Actions */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {u.displayName}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              approvalStatus === 'approved'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : approvalStatus === 'rejected'
                                  ? 'text-rose-500'
                                  : 'text-amber-500'
                            }`}
                          >
                            ·{' '}
                            {approvalStatus === 'approved'
                              ? language === 'ar'
                                ? 'مقبول'
                                : 'Approved'
                              : approvalStatus === 'rejected'
                                ? language === 'ar'
                                  ? 'مرفوض'
                                  : 'Rejected'
                                : language === 'ar'
                                  ? 'بانتظار موافقة الأدمن'
                                  : 'Pending Approval'}
                          </span>
                          {proRequestStatus === 'requested' && (
                            <span className="text-xs font-semibold text-sky-500">
                              · {language === 'ar' ? 'طلب ترقية Pro' : 'Requested Pro'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular truncate">
                          {email || u.uid} · {u.xp} XP · Lv.{u.level} ·{' '}
                          {language === 'ar'
                            ? `استخدام اليوم: ${u.dailyUsageCount || 0}`
                            : `Today: ${u.dailyUsageCount || 0}`}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await adminUpdateUserApproval(u.uid, 'approved');
                            setStatusMsg(
                              language === 'ar'
                                ? `تم قبول دخول ${u.displayName}`
                                : `Approved ${u.displayName}`
                            );
                            await loadAdminData();
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            approvalStatus === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'قبول الدخول' : 'Approve'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            await adminUpdateUserApproval(u.uid, 'rejected');
                            setStatusMsg(
                              language === 'ar'
                                ? `تم رفض دخول ${u.displayName}`
                                : `Declined ${u.displayName}`
                            );
                            await loadAdminData();
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            approvalStatus === 'rejected'
                              ? 'bg-rose-500/15 text-rose-500'
                              : 'bg-rose-600 hover:bg-rose-500 text-white'
                          }`}
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'رفض' : 'Reject'}</span>
                        </button>

                        <select
                          value={u.clinicalTrack}
                          onChange={async (e) => {
                            await adminUpdateUserTierAndTrack(
                              u.uid,
                              u.subscriptionTier,
                              e.target.value as ClinicalTrack
                            );
                            await loadAdminData();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <option value="student">Student</option>
                          <option value="doctor">Doctor</option>
                          <option value="specialist">Specialist</option>
                        </select>

                        <button
                          type="button"
                          onClick={async () => {
                            const nextTier: SubscriptionTier =
                              u.subscriptionTier === 'pro' ? 'free' : 'pro';
                            await adminUpdateUserTierAndTrack(u.uid, nextTier, u.clinicalTrack);
                            await loadAdminData();
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                            u.subscriptionTier === 'pro'
                              ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border border-teal-500/30'
                              : 'bg-[#0B162C] dark:bg-sky-600 text-white'
                          }`}
                        >
                          {u.subscriptionTier === 'pro'
                            ? 'Pro (Downgrade)'
                            : language === 'ar'
                              ? 'ترقية إلى Pro'
                              : 'Activate Pro'}
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Credits Wallet Top-Up + Per-User Feature Activation */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                      {/* Credits Recharge */}
                      <div className="lg:col-span-5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                          <Coins className="w-4 h-4" />
                          <span className="font-mono-tabular">
                            {currentCredits} {language === 'ar' ? 'نقطة' : 'pts'}
                          </span>
                        </span>

                        <button
                          type="button"
                          onClick={async () => {
                            await adminChargeUserCredits(u.uid, currentCredits + 50);
                            await loadAdminData();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular font-semibold cursor-pointer hover:border-sky-500"
                        >
                          +50
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminChargeUserCredits(u.uid, currentCredits + 200);
                            await loadAdminData();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular font-semibold cursor-pointer hover:border-sky-500"
                        >
                          +200
                        </button>

                        <input
                          type="number"
                          min={0}
                          max={1000000}
                          value={draftCredit}
                          onChange={(e) =>
                            setCreditInputs((prev) => ({ ...prev, [u.uid]: e.target.value }))
                          }
                          className="w-20 px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs"
                        />

                        <button
                          type="button"
                          onClick={async () => {
                            const delta = Number(draftCredit) || 0;
                            await adminChargeUserCredits(u.uid, currentCredits + delta);
                            setStatusMsg(
                              language === 'ar'
                                ? `تم شحن ${delta} نقطة لحساب ${u.displayName}`
                                : `Charged +${delta} pts to ${u.displayName}`
                            );
                            await loadAdminData();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer whitespace-nowrap"
                        >
                          {language === 'ar' ? 'شحن نقاط' : 'Add Pts'}
                        </button>
                      </div>

                      {/* Per-user Feature Unlocks */}
                      <div className="lg:col-span-7 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 me-1">
                          {language === 'ar' ? 'ميزات مفعّلة:' : 'Features:'}
                        </span>
                        {USER_UNLOCKABLE_FEATURES.map((feat) => {
                          const active = unlocked.includes(feat.id);
                          return (
                            <button
                              key={feat.id}
                              type="button"
                              onClick={async () => {
                                const next = active
                                  ? unlocked.filter((f) => f !== feat.id)
                                  : [...unlocked, feat.id];
                                await adminUpdateUserFeatures(u.uid, next);
                                await loadAdminData();
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-100 dark:bg-[#081327] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {language === 'ar' ? feat.labelAr : feat.labelEn}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Platform Features, Global Limits & 22-Specialty Pricing */}
      {activeTab === 'pricing' && (
        <div className="space-y-6">
          {/* Global Feature Toggles */}
          <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  {language === 'ar' ? 'تفعيل وتعطيل ميزات المنصة' : 'Platform Feature Controls'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'ar'
                    ? 'تحكم فوري بالميزات المتاحة لجميع المستخدمين عبر السحابة.'
                    : 'Real-time global switches controlling active clinical modules for all users.'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveSettingsAndPricing}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {language === 'ar' ? 'حفظ كافة التغييرات' : 'Save All Changes'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FEATURE_META.map((item) => {
                const enabled = featureFlagsDraft[item.key];
                return (
                  <div
                    key={item.key}
                    className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {language === 'ar' ? item.ar : item.en}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {language === 'ar' ? item.descAr : item.descEn}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFeatureFlagsDraft((prev) => ({ ...prev, [item.key]: !enabled }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                        enabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {enabled
                        ? language === 'ar'
                          ? 'مفعّل'
                          : 'Enabled'
                        : language === 'ar'
                          ? 'معطّل'
                          : 'Disabled'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Global Usage Limits & AI Generation Cost */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'حد الاستخدام اليومي (Free)' : 'Daily Usage Limit (Free)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={freeLimitDraft}
                  onChange={(e) => setFreeLimitDraft(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'حد الاستخدام اليومي (Pro)' : 'Daily Usage Limit (Pro)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={proLimitDraft}
                  onChange={(e) => setProLimitDraft(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar'
                    ? 'تكلفة توليد حالة AI جديدة (نقاط)'
                    : 'AI Case Synthesis Cost (Points)'}
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={aiGenCostDraft}
                  onChange={(e) => setAiGenCostDraft(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular"
                />
              </div>
            </div>
          </section>

          {/* Per-Specialty Pricing & Daily Usage Limits */}
          <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  {language === 'ar'
                    ? 'تكلفة كل اختصاص وعدد مرات الاستخدام اليومي (22 تخصصاً)'
                    : 'Per-Specialty Point Cost & Daily Usage Limits (22 Specialties)'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'ar'
                    ? 'عيّن تكلفة النقاط (0 = مجاني) والحد اليومي لعدد المرات لكل تخصص (0 = يتبع الحد العام).'
                    : 'Set points deducted per case (0 = free) and max daily runs per specialty (0 = global limit).'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={specialtyFilter}
                  onChange={(e) => setSpecialtyFilter(e.target.value)}
                  placeholder={language === 'ar' ? 'تصفية التخصص...' : 'Filter specialty...'}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveSettingsAndPricing}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {language === 'ar' ? 'حفظ الأسعار' : 'Save Pricing'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-[#081327] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="text-start px-4 py-3">
                      {language === 'ar' ? 'التخصص الطبي' : 'Specialty'}
                    </th>
                    <th className="text-start px-4 py-3">
                      {language === 'ar' ? 'الحالة' : 'Status'}
                    </th>
                    <th className="text-end px-4 py-3">
                      {language === 'ar' ? 'التكلفة (نقاط)' : 'Cost (Points)'}
                    </th>
                    <th className="text-end px-4 py-3">
                      {language === 'ar' ? 'حد الاستخدام اليومي' : 'Daily Limit'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSpecialties.map((sp) => {
                    const rule = specialtyRulesDraft[sp.id] || {
                      costCredits: 0,
                      dailyLimit: 0,
                      enabled: true,
                    };
                    return (
                      <tr key={sp.id}>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {language === 'ar' ? sp.nameAr : sp.nameEn}
                          </div>
                          <div className="text-[11px] text-slate-500">{sp.nameEn}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateSpecialtyRuleDraft(sp.id, { enabled: !rule.enabled })
                            }
                            className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                              rule.enabled
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/15 text-rose-500'
                            }`}
                          >
                            {rule.enabled
                              ? language === 'ar'
                                ? 'مفعّل'
                                : 'Active'
                              : language === 'ar'
                                ? 'موقوف'
                                : 'Paused'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={rule.costCredits}
                            onChange={(e) =>
                              updateSpecialtyRuleDraft(sp.id, {
                                costCredits: Math.max(0, Math.min(1000, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-24 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular text-end"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={rule.dailyLimit}
                            onChange={(e) =>
                              updateSpecialtyRuleDraft(sp.id, {
                                dailyLimit: Math.max(0, Math.min(500, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-24 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular text-end"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: Global Broadcast Announcements */}
      {activeTab === 'announcements' && (
        <div className="space-y-6">
          <form
            onSubmit={handlePublishAnnouncement}
            className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-sky-500" />
              <h2 className="text-base font-bold">
                {language === 'ar'
                  ? 'نشر إشعار عام يظهر لجميع المستخدمين'
                  : 'Publish Global Notification to All Users'}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'عنوان الإشعار (بالعربية)' : 'Title (Arabic)'}
                </label>
                <input
                  type="text"
                  required
                  value={annTitleAr}
                  onChange={(e) => setAnnTitleAr(e.target.value)}
                  placeholder="مثال: تحديث بنك حالات الطوارئ وشحن النقاط..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'عنوان الإشعار (بالإنجليزية - اختياري)' : 'Title (English)'}
                </label>
                <input
                  type="text"
                  value={annTitleEn}
                  onChange={(e) => setAnnTitleEn(e.target.value)}
                  placeholder="Optional English headline"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'نص الإشعار (بالعربية)' : 'Message (Arabic)'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={annMsgAr}
                  onChange={(e) => setAnnMsgAr(e.target.value)}
                  placeholder="اكتب الرسالة التي ستظهر في شريط التنبيهات ومركز الإشعارات لدى جميع المستخدمين..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'نص الإشعار (بالإنجليزية - اختياري)' : 'Message (English)'}
                </label>
                <textarea
                  rows={3}
                  value={annMsgEn}
                  onChange={(e) => setAnnMsgEn(e.target.value)}
                  placeholder="Optional English message body..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">
                  {language === 'ar' ? 'نوع التنبيه:' : 'Severity:'}
                </span>
                {(
                  [
                    ['info', language === 'ar' ? 'معلومة' : 'Info'],
                    ['success', language === 'ar' ? 'إيجابي / تحديث' : 'Update'],
                    ['warning', language === 'ar' ? 'تنبيه' : 'Warning'],
                    ['urgent', language === 'ar' ? 'عاجل' : 'Urgent'],
                  ] as const
                ).map(([sev, label]) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setAnnSeverity(sev)}
                    className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      annSeverity === sev
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 dark:bg-[#081327] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Megaphone className="w-4 h-4" />
                <span>
                  {language === 'ar' ? 'نشر الإشعار للجميع' : 'Broadcast Notification'}
                </span>
              </button>
            </div>
          </form>

          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="text-sm font-bold">
              {language === 'ar' ? 'الإشعارات المنشورة' : 'Published Announcements'}
            </h3>
            {announcements.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                {language === 'ar' ? 'لم يُنشر أي إشعار بعد.' : 'No announcements published yet.'}
              </p>
            ) : (
              <div className="space-y-2.5">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="uppercase text-sky-500 font-mono-tabular">{a.severity}</span>
                        <span>·</span>
                        <span>{language === 'ar' ? a.titleAr : a.titleEn}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {language === 'ar' ? a.messageAr : a.messageEn}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminToggleAnnouncement(a.id, !a.isActive);
                          await loadAdminData();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          a.isActive
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {a.isActive
                          ? language === 'ar'
                            ? 'ظاهر للجميع'
                            : 'Active'
                          : language === 'ar'
                            ? 'مخفي'
                            : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminDeleteAnnouncement(a.id);
                          await loadAdminData();
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                        aria-label="Delete announcement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Cases Management */}
      {activeTab === 'cases' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold">
                {language === 'ar' ? 'نشر بنك الحالات المرجعية الأساسي (22 تخصصاً)' : 'Seed Curated 22-Specialty Bank'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'ar'
                  ? 'يزامن جميع الحالات المرجعية الـ 22 مع Cloud Firestore لتصبح متاحة لكل الأطباء.'
                  : 'Publishes the built-in 22-specialty curated clinical case library directly into Cloud Firestore.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSeedCurated}
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
            >
              {language === 'ar' ? 'مزامنة الحالات إلى Firestore' : 'Sync Curated Bank'}
            </button>
          </div>

          <form
            onSubmit={handleCreateCase}
            className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-sky-500" />
              <span>{language === 'ar' ? 'إضافة حالة سريرية جديدة' : 'Add Published Clinical Case'}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                required
                value={newTitleEn}
                onChange={(e) => setNewTitleEn(e.target.value)}
                placeholder="Title (English)"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="text"
                value={newTitleAr}
                onChange={(e) => setNewTitleAr(e.target.value)}
                placeholder="العنوان بالعربية"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
              />
              <select
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value as SpecialtyId)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
              >
                {SPECIALTIES.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.nameEn}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <select
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value as CaseDifficulty)}
                  className="flex-1 px-2 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <select
                  value={newArchetype}
                  onChange={(e) => setNewArchetype(e.target.value as CaseArchetype)}
                  className="flex-1 px-2 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="common">Common</option>
                  <option value="emergency">Emergency</option>
                  <option value="rare">Rare</option>
                </select>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value as SubscriptionTier)}
                  className="flex-1 px-2 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={newDxEn}
                onChange={(e) => setNewDxEn(e.target.value)}
                placeholder="Correct Diagnosis"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="text"
                value={newTxEn}
                onChange={(e) => setNewTxEn(e.target.value)}
                placeholder="Guideline Treatment Summary"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer"
            >
              {language === 'ar' ? 'نشر الحالة السريرية' : 'Publish Clinical Case'}
            </button>
          </form>

          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-[#081327] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-start px-4 py-3">Title</th>
                  <th className="text-start px-4 py-3">Specialty</th>
                  <th className="text-start px-4 py-3">Difficulty</th>
                  <th className="text-start px-4 py-3">Tier</th>
                  <th className="text-start px-4 py-3">Published</th>
                  <th className="text-end px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium max-w-[260px] truncate">
                      {language === 'ar' ? c.titleAr : c.titleEn}
                    </td>
                    <td className="px-4 py-3 capitalize">{c.specialty.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <select
                        value={c.difficulty}
                        onChange={async (e) => {
                          await adminUpsertClinicalCase(
                            { ...c, difficulty: e.target.value as CaseDifficulty },
                            false
                          );
                          await onRefreshCases();
                        }}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700"
                      >
                        <option value="easy">easy</option>
                        <option value="medium">medium</option>
                        <option value="hard">hard</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminUpsertClinicalCase(
                            { ...c, tier: c.tier === 'pro' ? 'free' : 'pro' },
                            false
                          );
                          await onRefreshCases();
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 font-semibold cursor-pointer"
                      >
                        {c.tier}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminUpsertClinicalCase({ ...c, isPublished: !c.isPublished }, false);
                          await onRefreshCases();
                        }}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                          c.isPublished
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                        }`}
                      >
                        {c.isPublished ? 'Published' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminDeleteCase(c.id);
                          await onRefreshCases();
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: Error Reports */}
      {activeTab === 'reports' && (
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          {reports.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No error reports submitted yet.</p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-mono-tabular text-sky-500">
                    {r.category} · Case: {r.caseId}
                  </div>
                  <p className="text-sm">{r.description}</p>
                </div>
                <select
                  value={r.status}
                  onChange={async (e) => {
                    await adminUpdateErrorReportStatus(r.id, e.target.value as ErrorReport['status']);
                    loadAdminData();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <option value="open">Open</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 6: AI Usage & Server Provider Config */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-bold">
              {language === 'ar' ? 'إعداد محرك الذكاء الاصطناعي على الخادم' : 'Server AI Engine Configuration'}
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'تُدار مفاتيح API بأمان في متغيرات البيئة على الخادم فقط دون تعريضها للواجهة الأمامية.'
                : 'API credentials are secured strictly in server environment secrets (never exposed in client forms).'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Active LLM Provider</label>
                <select
                  value={providerDraft}
                  onChange={(e) => setProviderDraft(e.target.value as AiProvider)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700"
                >
                  <option value="groq">
                    Groq API — Primary ({serverProviders.groq ? 'Server Key Ready' : 'Set GROQ_API_KEY in Secrets'})
                  </option>
                  <option value="gemini">
                    Gemini AI — Secondary ({serverProviders.gemini ? 'Server Key Ready' : 'Not Set'})
                  </option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Free Daily Case Limit</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={freeLimitDraft}
                  onChange={(e) => setFreeLimitDraft(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 font-mono-tabular"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proEnabledDraft}
                    onChange={(e) => setProEnabledDraft(e.target.checked)}
                  />
                  <span className="font-semibold">Enable Pro Subscriptions</span>
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveSettingsAndPricing}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer"
            >
              {language === 'ar' ? 'حفظ إعدادات المنصة' : 'Save Platform Config'}
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-[#081327] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-start px-4 py-3">Endpoint</th>
                  <th className="text-start px-4 py-3">Provider</th>
                  <th className="text-end px-4 py-3">Latency</th>
                  <th className="text-start px-4 py-3">Clinician UID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {aiLogs.slice(0, 20).map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-mono-tabular">{log.endpoint}</td>
                    <td className="px-4 py-2.5 uppercase">{log.provider}</td>
                    <td className="px-4 py-2.5 text-end font-mono-tabular">{log.latencyMs} ms</td>
                    <td className="px-4 py-2.5 font-mono-tabular text-slate-500">{log.userId.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
