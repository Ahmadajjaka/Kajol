import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Coins,
  Crown,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import { CURATED_SEED_CASES } from './data/seedCases';
import { getText } from './i18n/translations';
import { auth } from './lib/firebase';
import {
  getTodayUsageCount,
  getUsageBudgetForUser,
  hasUserProOrFeature,
  isPlatformFeatureEnabled,
} from './lib/platformPolicy';
import { evaluateSimulationSession } from './services/aiService';
import {
  checkIsAdmin,
  completeSimulationSession,
  consumeCreditsAndUsage,
  createSimulationSession,
  ensureCaseExistsInFirestore,
  ensureUserProfile,
  fetchPublishedCases,
  fetchUserSessions,
  getDefaultPlatformSettings,
  getPlatformSettings,
  isUserAdminEmail,
  recordUserProgression,
  subscribeActiveAnnouncements,
  subscribePlatformSettings,
  subscribeUserProfile,
  updateActiveSession,
  updateUserPreferences,
} from './services/firestoreService';
import {
  Announcement,
  AppView,
  ClinicalCase,
  ClinicalTrack,
  Language,
  PlatformSettings,
  SimulationMode,
  SimulationSession,
  SpecialtyId,
  ThemeMode,
  UserProfile,
} from './types/clinical';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AndroidInstallButton, OfflineIndicator } from './components/common/AndroidInstallButton';
import { AnnouncementBanner, AnnouncementsDrawer } from './components/common/AnnouncementsCenter';
import { Splash3DLogo } from './components/three/Splash3DLogo';
import { AuthView } from './components/auth/AuthView';
import { ApprovalGateView } from './components/auth/ApprovalGateView';
import { DashboardView } from './components/dashboard/DashboardView';
import { CaseLibraryView, SpecialtiesView } from './components/library/SpecialtiesAndLibraryViews';
import { SimulationWorkbench } from './components/clinical/SimulationWorkbench';
import { FinalReportView } from './components/clinical/FinalReportView';
import { AnalyticsView, HistoryLogbookView } from './components/analytics/HistoryAndAnalyticsViews';
import { SubscriptionsView, SettingsView } from './components/account/SubscriptionsAndSettingsViews';
import { AdminDashboardView } from './components/admin/AdminDashboardView';

function MainApp() {
  const [showSplash, setShowSplash] = useState(true);
  const [language, setLanguage] = useState<Language>('ar');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [selectedTrackOnAuth, setSelectedTrackOnAuth] = useState<ClinicalTrack>('student');

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [view, setView] = useState<AppView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [cases, setCases] = useState<ClinicalCase[]>(CURATED_SEED_CASES);
  const [selectedSpecialty, setSelectedSpecialty] = useState<SpecialtyId | 'all'>('all');
  const [sessions, setSessions] = useState<SimulationSession[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(getDefaultPlatformSettings);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsDrawerOpen, setAnnouncementsDrawerOpen] = useState(false);
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<string[]>([]);

  const [activeCase, setActiveCase] = useState<ClinicalCase | null>(null);
  const [activeSession, setActiveSession] = useState<SimulationSession | null>(null);
  const [reportSession, setReportSession] = useState<SimulationSession | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const syncTimeoutRef = useRef<number | null>(null);
  const latestSessionRef = useRef<SimulationSession | null>(null);
  const completedSessionIdsRef = useRef<Set<string>>(new Set());
  const profileRef = useRef<UserProfile | null>(null);
  latestSessionRef.current = activeSession;
  profileRef.current = profile;

  // Sync HTML dir/lang/dark class
  useEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dir = language === 'ar' ? 'rtl' : 'ltr';
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [language, theme]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const refreshCasesAndSettings = useCallback(async (adminFlag: boolean) => {
    try {
      const [remoteCases, settings] = await Promise.all([
        fetchPublishedCases(adminFlag),
        getPlatformSettings(),
      ]);
      const mergedMap = new Map<string, ClinicalCase>();
      for (const c of CURATED_SEED_CASES) mergedMap.set(c.id, c);
      for (const rc of remoteCases) mergedMap.set(rc.id, rc);
      setCases(Array.from(mergedMap.values()));
      setPlatformSettings(settings);
    } catch {
      setCases(CURATED_SEED_CASES);
    }
  }, []);

  // Load user profile, real-time platform settings, announcements & workspace data after authentication
  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      setIsAdmin(false);
      setSessions([]);
      setAnnouncements([]);
      return;
    }

    let cancelled = false;
    let unsubProfile: (() => void) | undefined;
    const unsubSettings = subscribePlatformSettings((nextSettings) => {
      if (!cancelled) setPlatformSettings(nextSettings);
    });
    const unsubAnnouncements = subscribeActiveAnnouncements((nextAnnouncements) => {
      if (!cancelled) setAnnouncements(nextAnnouncements);
    });

    (async () => {
      try {
        const prof = await ensureUserProfile({
          uid: authUser.uid,
          email: authUser.email || 'clinician@mamo.ai',
          displayName: authUser.displayName || authUser.email?.split('@')[0] || 'Clinician',
          emailVerified: authUser.emailVerified,
          clinicalTrack: selectedTrackOnAuth,
          language,
          theme,
        });
        if (cancelled) return;
        setProfile(prof);
        if (prof.language) setLanguage(prof.language);
        if (prof.theme) setTheme(prof.theme);

        const adminFlag = await checkIsAdmin(authUser.uid);
        if (cancelled) return;
        setIsAdmin(adminFlag);

        unsubProfile = subscribeUserProfile(authUser.uid, (nextProf) => {
          if (nextProf) {
            setProfile(nextProf);
            setLanguage(nextProf.language);
            setTheme(nextProf.theme);
          }
        });

        const [userSessions] = await Promise.all([
          fetchUserSessions(authUser.uid),
          refreshCasesAndSettings(adminFlag),
        ]);
        if (cancelled) return;
        setSessions(userSessions);
      } catch (err) {
        if (!cancelled) {
          setActionError(err instanceof Error ? err.message : 'Failed to load clinician profile.');
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubSettings();
      unsubAnnouncements();
      if (unsubProfile) unsubProfile();
    };
  }, [authUser, refreshCasesAndSettings]);

  const dailyCase = useMemo(() => {
    const dayIdx = new Date().getDate() % cases.length;
    return cases[dayIdx] || CURATED_SEED_CASES[0];
  }, [cases]);

  const effectiveIsAdmin =
    isAdmin || isUserAdminEmail(authUser?.email, authUser?.emailVerified);

  const startSimulationCase = async (targetCase: ClinicalCase, mode: SimulationMode) => {
    const currentProfile = profileRef.current;
    if (!authUser || !currentProfile) return;
    if (!authUser.emailVerified) {
      setActionError(getText(language).auth.verifyBanner);
      return;
    }

    if (!effectiveIsAdmin) {
      if (
        (mode === 'osce' || mode === 'emergency') &&
        !isPlatformFeatureEnabled('osceAndEmergency', platformSettings, currentProfile, false)
      ) {
        setActionError(
          language === 'ar'
            ? 'نمط امتحان OSCE والطوارئ موقوف حالياً من قِبل الإدارة.'
            : 'OSCE & Emergency simulation modes are currently paused by Admin.'
        );
        return;
      }
      if (mode === 'osce' && !hasUserProOrFeature(currentProfile, 'osce_mode', false)) {
        setActionError(
          language === 'ar'
            ? 'نمط امتحان OSCE يتطلب اشتراك Pro أو تفعيله من الأدمن.'
            : 'OSCE Exam mode requires Pro or Admin unlock.'
        );
        return;
      }
    }

    const budget = getUsageBudgetForUser(
      currentProfile,
      targetCase.specialty,
      platformSettings,
      effectiveIsAdmin
    );
    if (!budget.allowed) {
      setActionError(
        language === 'ar'
          ? budget.blockedReasonAr || 'غير مسموح ببدء هذه الحالة.'
          : budget.blockedReasonEn || 'Cannot launch this specialty.'
      );
      return;
    }

    setActionError(null);

    try {
      await ensureCaseExistsInFirestore(targetCase, authUser.uid);
      if (!effectiveIsAdmin) {
        await consumeCreditsAndUsage(
          authUser.uid,
          currentProfile,
          targetCase.specialty,
          budget.costCredits,
          true
        );
      }

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newSession: SimulationSession = {
        id: sessionId,
        userId: authUser.uid,
        caseId: targetCase.id,
        specialty: targetCase.specialty,
        mode,
        status: 'active',
        elapsedSeconds: 0,
        unlockedHistorySections: [],
        unlockedExamSystems: [],
        orderedLabs: [],
        orderedImaging: [],
        chatMessages: [],
        differentialList: [],
        finalDiagnosis: '',
        treatmentPlan: '',
        totalScore: 0,
      };
      await createSimulationSession(newSession);
      setActiveCase(targetCase);
      setActiveSession(newSession);
      setSessions((prev) => [newSession, ...prev]);
      setView('patient_room');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start simulation session.');
    }
  };

  const launchSimulationMode = (mode: SimulationMode, customCase?: ClinicalCase) => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;
    if (
      !effectiveIsAdmin &&
      (mode === 'osce' || mode === 'emergency') &&
      !isPlatformFeatureEnabled('osceAndEmergency', platformSettings, currentProfile, false)
    ) {
      setActionError(
        language === 'ar'
          ? 'نمط امتحان OSCE والطوارئ موقوف حالياً من قِبل الإدارة.'
          : 'OSCE & Emergency simulation modes are currently paused by Admin.'
      );
      return;
    }
    if (customCase) {
      startSimulationCase(customCase, mode);
      return;
    }
    const eligible = cases.filter((c) => {
      if (c.tier === 'pro' && !hasUserProOrFeature(currentProfile, 'pro_specialties', effectiveIsAdmin)) {
        return false;
      }
      if (!getUsageBudgetForUser(currentProfile, c.specialty, platformSettings, effectiveIsAdmin).allowed) {
        return false;
      }
      if (mode === 'beginner') return c.difficulty === 'easy';
      if (mode === 'emergency') return c.archetype === 'emergency' || c.archetype === 'urgent';
      if (mode === 'specialist') return c.difficulty === 'hard';
      return true;
    });
    const pool = eligible.length > 0 ? eligible : cases.filter((c) => c.tier === 'free');
    const picked =
      mode === 'daily'
        ? dailyCase
        : pool[Math.floor(Math.random() * pool.length)] || CURATED_SEED_CASES[0];
    startSimulationCase(picked, mode);
  };

  const clearPendingSync = useCallback(() => {
    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, []);

  // Debounced persistence of clinical progress (ignores 1s timer ticks so actions actually sync,
  // and automatically cancels whenever evaluation starts or the session closes).
  useEffect(() => {
    if (
      !activeSession ||
      activeSession.status !== 'active' ||
      evaluating ||
      completedSessionIdsRef.current.has(activeSession.id)
    ) {
      clearPendingSync();
      return;
    }

    clearPendingSync();
    const targetId = activeSession.id;
    syncTimeoutRef.current = window.setTimeout(() => {
      syncTimeoutRef.current = null;
      const latest = latestSessionRef.current;
      if (
        !latest ||
        latest.id !== targetId ||
        latest.status !== 'active' ||
        completedSessionIdsRef.current.has(targetId)
      ) {
        return;
      }
      updateActiveSession(targetId, {
        elapsedSeconds: latest.elapsedSeconds,
        unlockedHistorySections: latest.unlockedHistorySections,
        unlockedExamSystems: latest.unlockedExamSystems,
        orderedLabs: latest.orderedLabs,
        orderedImaging: latest.orderedImaging,
        chatMessages: latest.chatMessages,
        differentialList: latest.differentialList,
        finalDiagnosis: latest.finalDiagnosis,
        treatmentPlan: latest.treatmentPlan,
      }).catch(() => {});
    }, 1200);

    return clearPendingSync;
  }, [
    activeSession?.id,
    activeSession?.status,
    activeSession?.unlockedHistorySections,
    activeSession?.unlockedExamSystems,
    activeSession?.orderedLabs,
    activeSession?.orderedImaging,
    activeSession?.chatMessages,
    activeSession?.differentialList,
    activeSession?.finalDiagnosis,
    activeSession?.treatmentPlan,
    evaluating,
    clearPendingSync,
  ]);

  const handleUpdateActiveSession = useCallback(
    (patch: Partial<SimulationSession>) => {
      setActiveSession((prev) => {
        if (!prev || prev.status !== 'active') return prev;
        return { ...prev, ...patch };
      });
    },
    []
  );

  const handleSubmitForEvaluation = async (overrides?: {
    finalDiagnosis?: string;
    treatmentPlan?: string;
  }) => {
    if (!authUser || !profile || !activeCase || !activeSession) return;
    if (evaluating || completedSessionIdsRef.current.has(activeSession.id)) return;

    clearPendingSync();
    setEvaluating(true);
    setActionError(null);

    const sessionSnapshot: SimulationSession = {
      ...activeSession,
      finalDiagnosis:
        overrides?.finalDiagnosis !== undefined
          ? overrides.finalDiagnosis
          : activeSession.finalDiagnosis,
      treatmentPlan:
        overrides?.treatmentPlan !== undefined
          ? overrides.treatmentPlan
          : activeSession.treatmentPlan,
    };

    try {
      // Flush latest chatMessages (patient + AI medical assistant) & discoveries before locking session
      await updateActiveSession(sessionSnapshot.id, {
        elapsedSeconds: sessionSnapshot.elapsedSeconds,
        unlockedHistorySections: sessionSnapshot.unlockedHistorySections,
        unlockedExamSystems: sessionSnapshot.unlockedExamSystems,
        orderedLabs: sessionSnapshot.orderedLabs,
        orderedImaging: sessionSnapshot.orderedImaging,
        chatMessages: sessionSnapshot.chatMessages,
        differentialList: sessionSnapshot.differentialList,
        finalDiagnosis: sessionSnapshot.finalDiagnosis,
        treatmentPlan: sessionSnapshot.treatmentPlan,
      }).catch(() => {});

      const { scoreBreakdown, totalScore, evaluationReport } = await evaluateSimulationSession({
        userId: authUser.uid,
        clinicalCase: activeCase,
        session: sessionSnapshot,
        language,
        provider: platformSettings.activeProvider,
      });

      const completed: SimulationSession = {
        ...sessionSnapshot,
        status: 'completed',
        scoreBreakdown,
        totalScore,
        evaluationReport,
      };

      clearPendingSync();
      completedSessionIdsRef.current.add(sessionSnapshot.id);

      await completeSimulationSession(sessionSnapshot.id, {
        elapsedSeconds: completed.elapsedSeconds,
        differentialList: completed.differentialList,
        finalDiagnosis: completed.finalDiagnosis,
        treatmentPlan: completed.treatmentPlan,
        scoreBreakdown,
        totalScore,
        evaluationReport,
      });

      await recordUserProgression(
        authUser.uid,
        profile,
        evaluationReport.xpEarned,
        evaluationReport.unlockedBadges,
        sessionSnapshot.mode === 'daily'
      );

      setSessions((prev) => prev.map((s) => (s.id === completed.id ? completed : s)));
      setReportSession(completed);
      setActiveSession(null);
      setActiveCase(null);
      setView('final_report');
    } catch (err) {
      completedSessionIdsRef.current.delete(sessionSnapshot.id);
      setActionError(err instanceof Error ? err.message : 'Clinical evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleToggleFavorite = async (caseId: string) => {
    if (!profile) return;
    const exists = profile.favoriteCaseIds.includes(caseId);
    const nextFavs = exists
      ? profile.favoriteCaseIds.filter((id) => id !== caseId)
      : [...profile.favoriteCaseIds, caseId];
    await updateUserPreferences(profile.uid, { favoriteCaseIds: nextFavs });
  };

  const handleToggleLanguage = async () => {
    const next: Language = language === 'ar' ? 'en' : 'ar';
    setLanguage(next);
    if (profile) {
      await updateUserPreferences(profile.uid, { language: next }).catch(() => {});
    }
  };

  const handleToggleTheme = async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (profile) {
      await updateUserPreferences(profile.uid, { theme: next }).catch(() => {});
    }
  };

  const t = getText(language);

  if (showSplash) {
    return <Splash3DLogo language={language} onComplete={() => setShowSplash(false)} />;
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#071021] text-slate-500">
        {t.common.loading}
      </div>
    );
  }

  if (!authUser || !profile) {
    return (
      <AuthView
        language={language}
        theme={theme}
        onToggleLanguage={handleToggleLanguage}
        onToggleTheme={handleToggleTheme}
        onSelectedTrack={setSelectedTrackOnAuth}
      />
    );
  }

  if (
    !effectiveIsAdmin &&
    (profile.approvalStatus === 'pending' || profile.approvalStatus === 'rejected')
  ) {
    return (
      <ApprovalGateView
        language={language}
        theme={theme}
        profile={profile}
        email={authUser.email || ''}
        announcements={announcements}
        onToggleLanguage={handleToggleLanguage}
        onToggleTheme={handleToggleTheme}
        onRefresh={async () => {
          const updated = await ensureUserProfile({
            uid: authUser.uid,
            email: authUser.email || 'clinician@mamo.ai',
            displayName: authUser.displayName || authUser.email?.split('@')[0] || 'Clinician',
            emailVerified: authUser.emailVerified,
          });
          setProfile(updated);
        }}
        onSignOut={() => signOut(auth)}
      />
    );
  }

  const isSimulationTab =
    view === 'patient_room' ||
    view === 'history_taking' ||
    view === 'physical_exam' ||
    view === 'lab_imaging' ||
    view === 'differential' ||
    view === 'treatment';

  const isFullScreenChat =
    view === 'history_taking' && Boolean(activeCase && activeSession);

  const userCredits = Number.isFinite(profile.credits) ? Number(profile.credits) : 0;
  const usedToday = getTodayUsageCount(profile);
  const dailyLimit =
    profile.subscriptionTier === 'pro'
      ? Math.max(1, platformSettings.proDailyLimit ?? 50)
      : Math.max(1, platformSettings.freeDailyLimit ?? 5);
  const aiMedicalAssistantEnabled = isPlatformFeatureEnabled(
    'aiMedicalAssistant',
    platformSettings,
    profile,
    effectiveIsAdmin
  );
  const anatomy3dEnabled = isPlatformFeatureEnabled(
    'anatomy3d',
    platformSettings,
    profile,
    effectiveIsAdmin
  );
  const examinerDebriefEnabled = isPlatformFeatureEnabled(
    'examinerDebrief',
    platformSettings,
    profile,
    effectiveIsAdmin
  );

  const navItems: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'specialties', label: t.nav.specialties, icon: Stethoscope },
    { id: 'library', label: t.nav.library, icon: BookOpen },
    ...(activeSession ? [{ id: 'patient_room' as AppView, label: t.nav.patient_room, icon: Activity }] : []),
    { id: 'past_cases', label: t.nav.past_cases, icon: History },
    { id: 'analytics', label: t.nav.analytics, icon: BarChart3 },
    { id: 'subscriptions', label: t.nav.subscriptions, icon: Crown },
    { id: 'settings', label: t.nav.settings, icon: Settings },
    ...(effectiveIsAdmin ? [{ id: 'admin' as AppView, label: t.nav.admin, icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#071021] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between bg-white dark:bg-[#0B162C] border-e border-slate-200 dark:border-slate-800 p-5">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-lg bg-[#0B162C] dark:bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-teal-400 shrink-0">
              <Stethoscope className="w-4 h-4" />
            </div>
            <span className="font-bold tracking-tight text-sm whitespace-nowrap">MAMO SIMULATOR</span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                view === item.id || (item.id === 'patient_room' && isSimulationTab);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#0B162C] dark:bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 px-2">
            <img
              src="/src/assets/images/avatar_clinician_badge_1794950526875.jpg"
              alt={profile.displayName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-sky-500/30 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{profile.displayName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                Lv.{profile.level} · {profile.subscriptionTier.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-amber-600 dark:text-amber-300">
              <Coins className="w-3.5 h-3.5" />
              <span>
                {userCredits} {language === 'ar' ? 'نقطة' : 'pts'}
              </span>
            </span>
            <span className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
              {effectiveIsAdmin ? '∞' : `${usedToday}/${dailyLimit}`}
            </span>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setAnnouncementsDrawerOpen(true)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 text-xs font-medium hover:border-sky-500 cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Bell className="w-4 h-4 text-sky-500" />
                <span>{language === 'ar' ? 'إشعارات الإدارة' : 'Notifications'}</span>
              </span>
              {announcements.length > 0 && (
                <span className="font-mono-tabular text-[11px] font-bold text-sky-500">
                  {announcements.length}
                </span>
              )}
            </button>
            <AndroidInstallButton language={language} variant="full" />
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.auth.logout}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-72 max-w-[85vw] bg-white dark:bg-[#0B162C] h-full p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">MAMO SIMULATOR</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-amber-600 dark:text-amber-300">
                  <Coins className="w-3.5 h-3.5" />
                  <span>
                    {userCredits} {language === 'ar' ? 'نقطة' : 'pts'}
                  </span>
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-500">
                  {effectiveIsAdmin ? 'Admin ∞' : `${usedToday}/${dailyLimit}`}
                </span>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setView(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                        view === item.id
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAnnouncementsDrawerOpen(true);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-500" />
                  <span>{language === 'ar' ? 'إشعارات الإدارة' : 'Notifications'}</span>
                </span>
                {announcements.length > 0 && (
                  <span className="font-mono-tabular text-[11px] font-bold text-sky-500">
                    {announcements.length}
                  </span>
                )}
              </button>
              <AndroidInstallButton language={language} variant="full" />
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-500 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.auth.logout}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          isFullScreenChat ? 'h-[100dvh] overflow-hidden' : ''
        }`}
      >
        {/* Clean 3-Zone Top Bar (Hidden in Full-Screen ChatGPT Interview Mode) */}
        {!isFullScreenChat && (
          <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#071021]/95 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-8 py-3 flex items-center justify-between gap-2 sm:gap-6">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold tracking-tight whitespace-nowrap truncate">
                <span className="sm:hidden">MAMO AI</span>
                <span className="hidden sm:inline">{t.appName}</span>
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => setView('dashboard')}
                className="hover:text-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.nav.dashboard}
              </button>
              <button
                type="button"
                onClick={() => setView('specialties')}
                className="hover:text-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.nav.specialties}
              </button>
              <button
                type="button"
                onClick={() => setView('library')}
                className="hover:text-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.nav.library}
              </button>
              <button
                type="button"
                onClick={() => setView('analytics')}
                className="hover:text-sky-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.nav.analytics}
              </button>
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAnnouncementsDrawerOpen(true)}
                aria-label={language === 'ar' ? 'الإشعارات' : 'Notifications'}
                className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 cursor-pointer shrink-0 min-h-[38px] flex items-center justify-center"
              >
                <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                {announcements.length > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold font-mono-tabular flex items-center justify-center">
                    {announcements.length}
                  </span>
                )}
              </button>
              <AndroidInstallButton language={language} variant="header" />
              <button
                type="button"
                onClick={() => setView(activeSession ? 'patient_room' : 'library')}
                className="px-3 sm:px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer min-h-[38px]"
              >
                {activeSession ? t.dashboard.resumeSession : t.dashboard.startQuick}
              </button>
            </div>
          </header>
        )}

        {/* Admin Broadcast Banner (inline, dismissible, hidden in Full-Screen ChatGPT mode) */}
        {!isFullScreenChat && (
          <AnnouncementBanner
            language={language}
            announcements={announcements}
            dismissedIds={dismissedAnnouncementIds}
            onDismiss={(id) =>
              setDismissedAnnouncementIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
            }
            onOpenDrawer={() => setAnnouncementsDrawerOpen(true)}
          />
        )}

        {/* Email Verification Notice if Signed up via Email/Password */}
        {!authUser.emailVerified && (
          <div className="mx-4 sm:mx-8 mt-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
            <span>{t.auth.verifyBanner}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => sendEmailVerification(authUser)}
                className="px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer"
              >
                {t.auth.resendVerify}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await authUser.reload();
                  setAuthUser(auth.currentUser);
                }}
                className="px-3 py-1 rounded-lg bg-white dark:bg-[#0F1D36] border border-amber-400 font-semibold cursor-pointer"
              >
                {t.auth.refreshVerify}
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mx-4 sm:mx-8 mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between gap-3">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="font-bold cursor-pointer">
              ×
            </button>
          </div>
        )}

        {/* Active View Viewport */}
        <main
          className={
            isFullScreenChat
              ? 'flex-1 min-h-0 w-full overflow-hidden p-0'
              : 'flex-1 w-full max-w-[1320px] mx-auto px-3 sm:px-8 py-4 sm:py-8 pb-24 lg:pb-8'
          }
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className={isFullScreenChat ? 'h-full' : undefined}
            >
              {view === 'dashboard' && (
                <DashboardView
                  language={language}
                  profile={profile}
                  activeSession={activeSession}
                  dailyCase={dailyCase}
                  platformSettings={platformSettings}
                  isAdmin={effectiveIsAdmin}
                  onNavigate={setView}
                  onSelectSpecialty={setSelectedSpecialty}
                  onLaunchMode={launchSimulationMode}
                />
              )}

              {view === 'specialties' && (
                <SpecialtiesView
                  language={language}
                  profile={profile}
                  cases={cases}
                  platformSettings={platformSettings}
                  isAdmin={effectiveIsAdmin}
                  onSelectSpecialty={setSelectedSpecialty}
                  onNavigate={setView}
                />
              )}

              {view === 'library' && (
                <CaseLibraryView
                  language={language}
                  profile={profile}
                  cases={cases}
                  selectedSpecialty={selectedSpecialty}
                  activeProvider={platformSettings.activeProvider}
                  platformSettings={platformSettings}
                  isAdmin={effectiveIsAdmin}
                  onChangeSpecialty={setSelectedSpecialty}
                  onToggleFavorite={handleToggleFavorite}
                  onStartCase={startSimulationCase}
                  onCaseGenerated={async (newCase) => {
                    await ensureCaseExistsInFirestore(newCase, authUser.uid);
                    const aiGenCost = effectiveIsAdmin
                      ? 0
                      : Math.max(0, platformSettings.aiGenerationCost ?? 0);
                    const latestProf = profileRef.current;
                    if (!effectiveIsAdmin && aiGenCost > 0 && latestProf) {
                      await consumeCreditsAndUsage(
                        authUser.uid,
                        latestProf,
                        null,
                        aiGenCost,
                        false
                      );
                      const updatedProf: UserProfile = {
                        ...latestProf,
                        credits: Math.max(0, (latestProf.credits ?? 0) - aiGenCost),
                      };
                      profileRef.current = updatedProf;
                      setProfile(updatedProf);
                    }
                    setCases((prev) => [newCase, ...prev]);
                  }}
                  onNavigate={setView}
                />
              )}

              {isSimulationTab && activeCase && activeSession && (
                <SimulationWorkbench
                  language={language}
                  userId={authUser.uid}
                  clinicalCase={activeCase}
                  session={activeSession}
                  activeTab={view}
                  activeProvider={platformSettings.activeProvider}
                  aiMedicalAssistantEnabled={aiMedicalAssistantEnabled}
                  anatomy3dEnabled={anatomy3dEnabled}
                  onChangeTab={setView}
                  onUpdateSession={handleUpdateActiveSession}
                  onSubmitEvaluation={handleSubmitForEvaluation}
                  evaluating={evaluating}
                />
              )}

              {isSimulationTab && (!activeCase || !activeSession) && (
                <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {language === 'ar'
                      ? 'لا توجد جلسة محاكاة نشطة حالياً. اختر حالة سريرية للبدء.'
                      : 'No active patient simulation selected. Choose a case from the library to begin.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setView('library')}
                    className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    {t.nav.library}
                  </button>
                </div>
              )}

              {view === 'final_report' && reportSession && (
                <FinalReportView
                  language={language}
                  userId={authUser.uid}
                  session={reportSession}
                  activeProvider={platformSettings.activeProvider}
                  examinerDebriefEnabled={examinerDebriefEnabled}
                  onReturnDashboard={() => setView('dashboard')}
                />
              )}

              {view === 'past_cases' && (
                <HistoryLogbookView
                  language={language}
                  sessions={sessions}
                  onOpenSessionReport={(s) => {
                    setReportSession(s);
                    setView('final_report');
                  }}
                />
              )}

              {view === 'analytics' && (
                <AnalyticsView language={language} profile={profile} sessions={sessions} />
              )}

              {view === 'subscriptions' && (
                <SubscriptionsView
                  language={language}
                  profile={profile}
                  platformSettings={platformSettings}
                />
              )}

              {view === 'settings' && (
                <SettingsView
                  language={language}
                  theme={theme}
                  profile={profile}
                  onSavePreferences={async (patch) => {
                    setLanguage(patch.language);
                    setTheme(patch.theme);
                    await updateUserPreferences(profile.uid, patch);
                  }}
                />
              )}

              {view === 'admin' && (
                <AdminDashboardView
                  language={language}
                  isAdmin={effectiveIsAdmin}
                  adminUid={authUser.uid}
                  cases={cases}
                  platformSettings={platformSettings}
                  onRefreshCases={() => refreshCasesAndSettings(effectiveIsAdmin)}
                  onRefreshSettings={() => refreshCasesAndSettings(effectiveIsAdmin)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Quiet Educational Medical Disclaimer Footer */}
        {!isFullScreenChat && (
          <footer className="border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4 pb-24 lg:pb-4 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{t.disclaimerShort}</span>
            </div>
            <span>MAMO CLINICAL SIMULATOR AI · © 2026</span>
          </footer>
        )}
      </div>

      {/* Mobile Android-style Bottom Navigation Bar (Hidden in Full-Screen Chat Mode) */}
      {!isFullScreenChat && (
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0B162C]/95 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5 h-16">
            {(
              [
                { id: 'dashboard' as AppView, label: language === 'ar' ? 'الرئيسية' : 'Home', icon: LayoutDashboard },
                { id: 'specialties' as AppView, label: language === 'ar' ? 'التخصصات' : 'Specialties', icon: Stethoscope },
                { id: 'library' as AppView, label: language === 'ar' ? 'الحالات AI' : 'AI Cases', icon: BookOpen },
                activeSession
                  ? { id: 'patient_room' as AppView, label: language === 'ar' ? 'المريض' : 'Room', icon: Activity }
                  : { id: 'past_cases' as AppView, label: language === 'ar' ? 'السجل' : 'Logbook', icon: History },
                { id: 'settings' as AppView, label: language === 'ar' ? 'الإعدادات' : 'Settings', icon: Settings },
              ]
            ).map((item) => {
              const Icon = item.icon;
              const active =
                view === item.id || (item.id === 'patient_room' && isSimulationTab);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors ${
                    active
                      ? 'text-sky-600 dark:text-sky-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate max-w-[68px]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <AnnouncementsDrawer
        open={announcementsDrawerOpen}
        language={language}
        announcements={announcements}
        onClose={() => setAnnouncementsDrawerOpen(false)}
      />

      <OfflineIndicator language={language} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
