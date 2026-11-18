import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AdminUserRecord,
  AiProvider,
  AiUsageLog,
  Announcement,
  ApprovalStatus,
  ClinicalCase,
  ClinicalTrack,
  ErrorReport,
  Language,
  PlatformFeatureFlags,
  PlatformSettings,
  SimulationSession,
  SpecialtyId,
  SubscriptionTier,
  ThemeMode,
  UserPrivateInfo,
  UserProfile,
} from '../types/clinical';

export const DEFAULT_FEATURE_FLAGS: PlatformFeatureFlags = {
  requireLoginApproval: true,
  aiCaseGenerator: true,
  aiMedicalAssistant: true,
  anatomy3d: true,
  osceAndEmergency: true,
  examinerDebrief: true,
};

export function getDefaultPlatformSettings(): PlatformSettings {
  return {
    activeProvider: 'groq',
    freeDailyLimit: 5,
    proDailyLimit: 50,
    aiGenerationCost: 0,
    proEnabled: true,
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    specialtyRules: {},
  };
}

export function mergePlatformSettings(raw?: Partial<PlatformSettings> | null): PlatformSettings {
  const defaults = getDefaultPlatformSettings();
  if (!raw) return defaults;
  return {
    activeProvider: raw.activeProvider === 'gemini' ? 'gemini' : 'groq',
    freeDailyLimit: Number.isFinite(raw.freeDailyLimit) ? Math.max(1, Math.min(500, Number(raw.freeDailyLimit))) : defaults.freeDailyLimit,
    proDailyLimit: Number.isFinite(raw.proDailyLimit) ? Math.max(1, Math.min(5000, Number(raw.proDailyLimit))) : defaults.proDailyLimit,
    aiGenerationCost: Number.isFinite(raw.aiGenerationCost) ? Math.max(0, Math.min(1000, Number(raw.aiGenerationCost))) : 0,
    proEnabled: typeof raw.proEnabled === 'boolean' ? raw.proEnabled : true,
    featureFlags: {
      ...DEFAULT_FEATURE_FLAGS,
      ...(raw.featureFlags || {}),
    },
    specialtyRules: raw.specialtyRules || {},
    updatedAt: raw.updatedAt,
  };
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function isUserAdminEmail(email?: string | null, verified?: boolean): boolean {
  return Boolean(verified && email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL);
}

export async function ensureUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  emailVerified?: boolean;
  clinicalTrack?: ClinicalTrack;
  language?: Language;
  theme?: ThemeMode;
}): Promise<UserProfile> {
  const userRef = doc(db, 'users', params.uid);
  const privateRef = doc(db, 'users', params.uid, 'private', 'info');

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existing = snap.data() as UserProfile;
      // Ensure private info exists
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists()) {
        const privPayload: UserPrivateInfo = {
          uid: params.uid,
          email: params.email.slice(0, 200),
          proRequestStatus: 'none',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(privateRef, privPayload);
      }
      return existing;
    }

    let requireApproval = true;
    try {
      const settingsSnap = await getDoc(doc(db, 'platform_settings', 'global'));
      if (settingsSnap.exists()) {
        const merged = mergePlatformSettings(settingsSnap.data() as PlatformSettings);
        requireApproval = merged.featureFlags?.requireLoginApproval ?? true;
      }
    } catch {
      // Fallback to requiring admin approval
    }

    const isBootAdmin = isUserAdminEmail(params.email, Boolean(params.emailVerified));

    const initialProfile: UserProfile = {
      uid: params.uid,
      displayName: (params.displayName || 'Clinician').slice(0, 100),
      clinicalTrack: params.clinicalTrack || 'student',
      subscriptionTier: 'free',
      approvalStatus: isBootAdmin || !requireApproval ? 'approved' : 'pending',
      credits: 0,
      dailyUsageCount: 0,
      lastUsageDate: '',
      specialtyUsageToday: {},
      unlockedFeatures: [],
      language: params.language || 'ar',
      theme: params.theme || 'dark',
      xp: 0,
      level: 1,
      completedCasesCount: 0,
      dailyStreak: 0,
      badges: [],
      favoriteCaseIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, initialProfile);

    const privPayload: UserPrivateInfo = {
      uid: params.uid,
      email: (params.email || 'user@example.com').slice(0, 200),
      proRequestStatus: 'none',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(privateRef, privPayload);

    return initialProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${params.uid}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onErr?: (err: unknown) => void
) {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => {
      if (onErr) onErr(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function checkIsAdmin(uid: string): Promise<boolean> {
  if (isUserAdminEmail(auth.currentUser?.email, auth.currentUser?.emailVerified)) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function updateUserPreferences(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'clinicalTrack' | 'language' | 'theme' | 'favoriteCaseIds'>>
) {
  const path = `users/${uid}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.displayName !== undefined) clean.displayName = updates.displayName.slice(0, 100);
    if (updates.clinicalTrack !== undefined) clean.clinicalTrack = updates.clinicalTrack;
    if (updates.language !== undefined) clean.language = updates.language;
    if (updates.theme !== undefined) clean.theme = updates.theme;
    if (updates.favoriteCaseIds !== undefined) clean.favoriteCaseIds = updates.favoriteCaseIds.slice(0, 100);
    await updateDoc(doc(db, 'users', uid), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function recordUserProgression(
  uid: string,
  currentProfile: UserProfile,
  xpGained: number,
  newBadges: string[],
  isDailyChallenge: boolean
) {
  const path = `users/${uid}`;
  const boundedXpGain = Math.max(0, Math.min(500, Math.round(xpGained)));
  const nextXp = currentProfile.xp + boundedXpGain;
  const nextLevel = Math.min(200, Math.floor(nextXp / 250) + 1);
  const mergedBadges = Array.from(new Set([...currentProfile.badges, ...newBadges])).slice(0, 50);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nextStreak =
    isDailyChallenge && currentProfile.lastChallengeDate !== todayStr
      ? currentProfile.dailyStreak + 1
      : currentProfile.dailyStreak;

  try {
    await updateDoc(doc(db, 'users', uid), {
      xp: nextXp,
      level: nextLevel,
      completedCasesCount: currentProfile.completedCasesCount + 1,
      dailyStreak: nextStreak,
      lastChallengeDate: isDailyChallenge ? todayStr : currentProfile.lastChallengeDate || '',
      badges: mergedBadges,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function consumeCreditsAndUsage(
  uid: string,
  currentProfile: UserProfile,
  specialtyId: SpecialtyId | null,
  creditCost: number,
  countUsage = true
) {
  const path = `users/${uid}`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const isNewDay = currentProfile.lastUsageDate !== todayStr;
  const currentCredits = Number.isFinite(currentProfile.credits) ? Number(currentProfile.credits) : 0;
  const safeCost = Math.max(0, Math.round(creditCost));
  const nextCredits = Math.max(0, currentCredits - safeCost);

  const payload: Record<string, unknown> = {
    credits: nextCredits,
    updatedAt: serverTimestamp(),
  };

  if (countUsage) {
    const prevDailyCount = isNewDay ? 0 : (currentProfile.dailyUsageCount || 0);
    const nextDailyCount = prevDailyCount + 1;
    const prevSpecMap = isNewDay ? {} : { ...(currentProfile.specialtyUsageToday || {}) };
    if (specialtyId) {
      prevSpecMap[specialtyId] = (prevSpecMap[specialtyId] || 0) + 1;
    }
    payload.dailyUsageCount = nextDailyCount;
    payload.lastUsageDate = todayStr;
    payload.specialtyUsageToday = prevSpecMap;
  }

  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function requestProUpgrade(uid: string) {
  const path = `users/${uid}/private/info`;
  try {
    await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
      proRequestStatus: 'requested',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function getPrivateInfo(uid: string): Promise<UserPrivateInfo | null> {
  const path = `users/${uid}/private/info`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    return snap.exists() ? (snap.data() as UserPrivateInfo) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

// --- Clinical Cases ---

export async function fetchPublishedCases(isAdminUser = false): Promise<ClinicalCase[]> {
  const path = 'clinical_cases';
  try {
    const q = isAdminUser
      ? query(collection(db, path), limit(120))
      : query(collection(db, path), where('isPublished', '==', true), limit(120));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ClinicalCase);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function ensureCaseExistsInFirestore(clinicalCase: ClinicalCase, creatorUid: string): Promise<void> {
  const safeId = sanitizeId(clinicalCase.id);
  const path = `clinical_cases/${safeId}`;
  try {
    const ref = doc(db, 'clinical_cases', safeId);
    const snap = await getDoc(ref);
    if (snap.exists()) return;

    const titleAr = (clinicalCase.titleAr || clinicalCase.titleEn || 'حالة سريرية').trim().slice(0, 200);
    const titleEn = (clinicalCase.titleEn || clinicalCase.titleAr || 'Clinical Case').trim().slice(0, 200);

    await setDoc(ref, {
      id: safeId,
      specialty: clinicalCase.specialty.slice(0, 80),
      difficulty: clinicalCase.difficulty,
      archetype: clinicalCase.archetype,
      tier: clinicalCase.tier,
      isPublished: true,
      sourceType: clinicalCase.sourceType,
      titleAr: titleAr.length >= 2 ? titleAr : 'حالة سريرية',
      titleEn: titleEn.length >= 2 ? titleEn : 'Clinical Case',
      patientSummary: clinicalCase.patientSummary,
      clinicalTruth: clinicalCase.clinicalTruth,
      guidelineRefs: (clinicalCase.guidelineRefs || ['Clinical Guidelines']).slice(0, 20),
      createdBy: creatorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function adminUpsertClinicalCase(clinicalCase: ClinicalCase, isNew: boolean) {
  const safeId = sanitizeId(clinicalCase.id);
  const path = `clinical_cases/${safeId}`;
  try {
    const ref = doc(db, 'clinical_cases', safeId);
    const existingSnap = isNew ? await getDoc(ref) : null;
    if (isNew && !existingSnap?.exists()) {
      await setDoc(ref, {
        id: safeId,
        specialty: clinicalCase.specialty.slice(0, 80),
        difficulty: clinicalCase.difficulty,
        archetype: clinicalCase.archetype,
        tier: clinicalCase.tier,
        isPublished: clinicalCase.isPublished,
        sourceType: clinicalCase.sourceType,
        titleAr: clinicalCase.titleAr.slice(0, 200),
        titleEn: clinicalCase.titleEn.slice(0, 200),
        patientSummary: clinicalCase.patientSummary,
        clinicalTruth: clinicalCase.clinicalTruth,
        guidelineRefs: clinicalCase.guidelineRefs.slice(0, 20),
        createdBy: clinicalCase.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        specialty: clinicalCase.specialty.slice(0, 80),
        difficulty: clinicalCase.difficulty,
        archetype: clinicalCase.archetype,
        tier: clinicalCase.tier,
        isPublished: clinicalCase.isPublished,
        titleAr: clinicalCase.titleAr.slice(0, 200),
        titleEn: clinicalCase.titleEn.slice(0, 200),
        patientSummary: clinicalCase.patientSummary,
        clinicalTruth: clinicalCase.clinicalTruth,
        guidelineRefs: clinicalCase.guidelineRefs.slice(0, 20),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function adminDeleteCase(caseId: string) {
  const path = `clinical_cases/${caseId}`;
  try {
    await deleteDoc(doc(db, 'clinical_cases', caseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Simulation Sessions ---

export async function createSimulationSession(session: Omit<SimulationSession, 'createdAt' | 'updatedAt'>) {
  const safeId = sanitizeId(session.id);
  const path = `sessions/${safeId}`;
  try {
    await setDoc(doc(db, 'sessions', safeId), {
      ...session,
      id: safeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateActiveSession(
  sessionId: string,
  patch: Partial<
    Pick<
      SimulationSession,
      | 'elapsedSeconds'
      | 'unlockedHistorySections'
      | 'unlockedExamSystems'
      | 'orderedLabs'
      | 'orderedImaging'
      | 'chatMessages'
      | 'differentialList'
      | 'finalDiagnosis'
      | 'treatmentPlan'
    >
  >
) {
  const safeId = sanitizeId(sessionId);
  const path = `sessions/${safeId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.elapsedSeconds !== undefined) {
      const sec = Number.isFinite(patch.elapsedSeconds) ? Math.round(patch.elapsedSeconds) : 0;
      clean.elapsedSeconds = Math.max(0, Math.min(86400, sec));
    }
    if (patch.unlockedHistorySections !== undefined) {
      clean.unlockedHistorySections = patch.unlockedHistorySections.map(String).slice(0, 20);
    }
    if (patch.unlockedExamSystems !== undefined) {
      clean.unlockedExamSystems = patch.unlockedExamSystems.map(String).slice(0, 20);
    }
    if (patch.orderedLabs !== undefined) {
      clean.orderedLabs = patch.orderedLabs.map(String).slice(0, 30);
    }
    if (patch.orderedImaging !== undefined) {
      clean.orderedImaging = patch.orderedImaging.map(String).slice(0, 20);
    }
    if (patch.chatMessages !== undefined) {
      clean.chatMessages = patch.chatMessages.slice(-150).map((m) => ({
        id: String(m.id || ''),
        role: m.role,
        text: String(m.text || ''),
        timestamp: String(m.timestamp || ''),
        ...(m.target ? { target: m.target } : {}),
      }));
    }
    if (patch.differentialList !== undefined) {
      clean.differentialList = patch.differentialList.map(String).slice(0, 15);
    }
    if (patch.finalDiagnosis !== undefined) {
      clean.finalDiagnosis = String(patch.finalDiagnosis).slice(0, 300);
    }
    if (patch.treatmentPlan !== undefined) {
      clean.treatmentPlan = String(patch.treatmentPlan).slice(0, 4000);
    }

    await updateDoc(doc(db, 'sessions', safeId), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function completeSimulationSession(
  sessionId: string,
  payload: Pick<
    SimulationSession,
    | 'elapsedSeconds'
    | 'differentialList'
    | 'finalDiagnosis'
    | 'treatmentPlan'
    | 'scoreBreakdown'
    | 'totalScore'
    | 'evaluationReport'
  >
) {
  const safeId = sanitizeId(sessionId);
  const path = `sessions/${safeId}`;
  try {
    const safeElapsed = Number.isFinite(payload.elapsedSeconds) ? Math.round(payload.elapsedSeconds) : 0;
    const safeScore = Number.isFinite(payload.totalScore) ? Math.round(payload.totalScore) : 0;
    await updateDoc(doc(db, 'sessions', safeId), {
      elapsedSeconds: Math.max(0, Math.min(86400, safeElapsed)),
      differentialList: payload.differentialList.map(String).slice(0, 15),
      finalDiagnosis: String(payload.finalDiagnosis || '').slice(0, 300),
      treatmentPlan: String(payload.treatmentPlan || '').slice(0, 4000),
      scoreBreakdown: payload.scoreBreakdown,
      totalScore: Math.max(0, Math.min(100, safeScore)),
      evaluationReport: payload.evaluationReport,
      status: 'completed',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchUserSessions(userId: string): Promise<SimulationSession[]> {
  const path = 'sessions';
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SimulationSession);
  } catch (err) {
    // Fallback if composite index hasn't built yet
    try {
      const qFallback = query(collection(db, path), where('userId', '==', userId), limit(50));
      const snap = await getDocs(qFallback);
      return snap.docs.map((d) => d.data() as SimulationSession);
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.LIST, path);
    }
  }
}

// --- Error Reports & AI Telemetry ---

export async function submitErrorReport(report: Omit<ErrorReport, 'status' | 'createdAt' | 'updatedAt'>) {
  const safeId = sanitizeId(report.id);
  const path = `error_reports/${safeId}`;
  try {
    await setDoc(doc(db, 'error_reports', safeId), {
      ...report,
      id: safeId,
      description: report.description.slice(0, 2000),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function logAiUsage(entry: Omit<AiUsageLog, 'createdAt'>) {
  const safeId = sanitizeId(entry.id);
  const path = `ai_usage_logs/${safeId}`;
  try {
    await setDoc(doc(db, 'ai_usage_logs', safeId), {
      ...entry,
      id: safeId,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking telemetry failure should not interrupt clinical simulation
  }
}

// --- Platform Settings & Admin Portal Queries ---

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const snap = await getDoc(doc(db, 'platform_settings', 'global'));
    if (snap.exists()) {
      return mergePlatformSettings(snap.data() as PlatformSettings);
    }
  } catch {
    // Return defaults if uninitialized
  }
  return getDefaultPlatformSettings();
}

export function subscribePlatformSettings(
  onData: (settings: PlatformSettings) => void
) {
  return onSnapshot(
    doc(db, 'platform_settings', 'global'),
    (snap) => {
      if (snap.exists()) {
        onData(mergePlatformSettings(snap.data() as PlatformSettings));
      } else {
        onData(getDefaultPlatformSettings());
      }
    },
    () => {
      onData(getDefaultPlatformSettings());
    }
  );
}

export async function adminFetchAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, path), limit(100)));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function adminFetchAllUsersWithPrivate(): Promise<AdminUserRecord[]> {
  const users = await adminFetchAllUsers();
  const records = await Promise.all(
    users.map(async (profile) => {
      try {
        const privSnap = await getDoc(doc(db, 'users', profile.uid, 'private', 'info'));
        if (privSnap.exists()) {
          const priv = privSnap.data() as UserPrivateInfo;
          return {
            profile,
            email: priv.email,
            proRequestStatus: priv.proRequestStatus,
          } satisfies AdminUserRecord;
        }
      } catch {
        // Private doc may not exist for legacy/synthetic rows
      }
      return { profile } satisfies AdminUserRecord;
    })
  );
  return records;
}

export async function adminUpdateUserApproval(uid: string, approvalStatus: ApprovalStatus) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      approvalStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminChargeUserCredits(uid: string, nextCredits: number) {
  const path = `users/${uid}`;
  const clamped = Math.max(0, Math.min(1000000, Math.round(nextCredits)));
  try {
    await updateDoc(doc(db, 'users', uid), {
      credits: clamped,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminUpdateUserFeatures(uid: string, unlockedFeatures: string[]) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      unlockedFeatures: unlockedFeatures.map(String).slice(0, 30),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminUpdateUserTierAndTrack(
  uid: string,
  subscriptionTier: SubscriptionTier,
  clinicalTrack: ClinicalTrack
) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      subscriptionTier,
      clinicalTrack,
      updatedAt: serverTimestamp(),
    });
    if (subscriptionTier === 'pro') {
      await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
        proRequestStatus: 'approved',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminFetchErrorReports(): Promise<ErrorReport[]> {
  const path = 'error_reports';
  try {
    const snap = await getDocs(query(collection(db, path), limit(100)));
    return snap.docs.map((d) => d.data() as ErrorReport);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function adminUpdateErrorReportStatus(reportId: string, status: ErrorReport['status']) {
  const path = `error_reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'error_reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminFetchAiLogs(): Promise<AiUsageLog[]> {
  const path = 'ai_usage_logs';
  try {
    const snap = await getDocs(query(collection(db, path), limit(100)));
    return snap.docs.map((d) => d.data() as AiUsageLog);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function adminSavePlatformSettings(settings: PlatformSettings) {
  const path = 'platform_settings/global';
  const merged = mergePlatformSettings(settings);
  try {
    await setDoc(doc(db, 'platform_settings', 'global'), {
      activeProvider: merged.activeProvider,
      freeDailyLimit: merged.freeDailyLimit,
      proDailyLimit: merged.proDailyLimit ?? 50,
      aiGenerationCost: merged.aiGenerationCost ?? 0,
      proEnabled: merged.proEnabled,
      featureFlags: merged.featureFlags ?? DEFAULT_FEATURE_FLAGS,
      specialtyRules: merged.specialtyRules ?? {},
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- Global Admin Announcements ---

export function subscribeActiveAnnouncements(
  onData: (items: Announcement[]) => void
) {
  const q = query(
    collection(db, 'announcements'),
    where('isActive', '==', true),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Announcement);
      list.sort((a, b) => {
        const at = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const bt = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return bt - at;
      });
      onData(list);
    },
    () => {
      onData([]);
    }
  );
}

export async function adminFetchAllAnnouncements(): Promise<Announcement[]> {
  const path = 'announcements';
  try {
    const snap = await getDocs(query(collection(db, path), limit(50)));
    const list = snap.docs.map((d) => d.data() as Announcement);
    list.sort((a, b) => {
      const at = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      const bt = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      return bt - at;
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function adminPublishAnnouncement(
  announcement: Omit<Announcement, 'createdAt' | 'updatedAt'>
) {
  const safeId = sanitizeId(announcement.id);
  const path = `announcements/${safeId}`;
  try {
    await setDoc(doc(db, 'announcements', safeId), {
      id: safeId,
      titleAr: String(announcement.titleAr).trim().slice(0, 150),
      titleEn: String(announcement.titleEn).trim().slice(0, 150),
      messageAr: String(announcement.messageAr).trim().slice(0, 1500),
      messageEn: String(announcement.messageEn).trim().slice(0, 1500),
      severity: announcement.severity,
      isActive: announcement.isActive,
      createdBy: announcement.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function adminToggleAnnouncement(id: string, isActive: boolean) {
  const safeId = sanitizeId(id);
  const path = `announcements/${safeId}`;
  try {
    await updateDoc(doc(db, 'announcements', safeId), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminDeleteAnnouncement(id: string) {
  const safeId = sanitizeId(id);
  const path = `announcements/${safeId}`;
  try {
    await deleteDoc(doc(db, 'announcements', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
