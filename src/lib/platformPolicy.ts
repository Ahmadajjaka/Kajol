import {
  FeatureKey,
  PlatformSettings,
  SpecialtyId,
  UserProfile,
} from '../types/clinical';

export { DEFAULT_FEATURE_FLAGS } from '../services/firestoreService';

export const USER_UNLOCKABLE_FEATURES: {
  id: string;
  labelAr: string;
  labelEn: string;
}[] = [
  { id: 'pro_specialties', labelAr: 'تخصصات Pro', labelEn: 'Pro Specialties' },
  { id: 'osce_mode', labelAr: 'OSCE والطوارئ', labelEn: 'OSCE & Emergency' },
  { id: 'ai_generator', labelAr: 'توليد حالات AI', labelEn: 'AI Generator' },
  { id: 'ai_assistant', labelAr: 'المساعد الطبي AI', labelEn: 'AI Assistant' },
  { id: 'examiner_debrief', labelAr: 'مناقشة الممتحن', labelEn: 'Examiner Debrief' },
];

export function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodayUsageCount(profile: UserProfile): number {
  const today = getTodayDateStr();
  return profile.lastUsageDate === today ? (profile.dailyUsageCount || 0) : 0;
}

export function getTodaySpecialtyUsageCount(profile: UserProfile, specialtyId: SpecialtyId): number {
  const today = getTodayDateStr();
  if (profile.lastUsageDate !== today) return 0;
  return profile.specialtyUsageToday?.[specialtyId] || 0;
}

export function isPlatformFeatureEnabled(
  key: FeatureKey,
  settings: PlatformSettings,
  profile?: UserProfile | null,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  const globalVal = settings.featureFlags?.[key] ?? true;
  if (globalVal) return true;
  // Allow per-user admin override if granted explicitly
  const unlocked = profile?.unlockedFeatures || [];
  const mapKey: Partial<Record<FeatureKey, string>> = {
    aiCaseGenerator: 'ai_generator',
    aiMedicalAssistant: 'ai_assistant',
    osceAndEmergency: 'osce_mode',
    examinerDebrief: 'examiner_debrief',
  };
  const overrideId = mapKey[key];
  return Boolean(overrideId && unlocked.includes(overrideId));
}

export function hasUserProOrFeature(
  profile: UserProfile,
  featureId: string,
  isAdmin = false
): boolean {
  if (isAdmin || profile.subscriptionTier === 'pro') return true;
  return Boolean(profile.unlockedFeatures?.includes(featureId));
}

export function getSpecialtyRule(
  specialtyId: SpecialtyId,
  settings: PlatformSettings
): { enabled: boolean; costCredits: number; dailyLimit: number } {
  const raw = settings.specialtyRules?.[specialtyId];
  return {
    enabled: raw?.enabled ?? true,
    costCredits: Number.isFinite(raw?.costCredits) ? Math.max(0, Number(raw?.costCredits)) : 0,
    dailyLimit: Number.isFinite(raw?.dailyLimit) ? Math.max(0, Number(raw?.dailyLimit)) : 0,
  };
}

export function getUsageBudgetForUser(
  profile: UserProfile,
  specialtyId: SpecialtyId,
  settings: PlatformSettings,
  isAdmin = false
) {
  const rule = getSpecialtyRule(specialtyId, settings);
  const globalLimit =
    profile.subscriptionTier === 'pro'
      ? Math.max(1, settings.proDailyLimit ?? 50)
      : Math.max(1, settings.freeDailyLimit ?? 5);

  const globalUsedToday = getTodayUsageCount(profile);
  const globalRemainingToday = Math.max(0, globalLimit - globalUsedToday);

  const specialtyUsedToday = getTodaySpecialtyUsageCount(profile, specialtyId);
  const specialtyRemainingToday =
    rule.dailyLimit > 0 ? Math.max(0, rule.dailyLimit - specialtyUsedToday) : null;

  const userCredits = Number.isFinite(profile.credits) ? Number(profile.credits) : 0;

  const blockedReasonAr = !rule.enabled && !isAdmin
    ? 'هذا التخصص موقوف مؤقتاً من قِبل الإدارة.'
    : !isAdmin && globalUsedToday >= globalLimit
      ? `بلغت الحد اليومي المسموح (${globalLimit} حالات يومياً). يمكنك ترقية الحساب أو مراجعة الإدارة.`
      : !isAdmin && rule.dailyLimit > 0 && specialtyUsedToday >= rule.dailyLimit
        ? `بلغت الحد اليومي لهذا التخصص (${rule.dailyLimit} محاولات يومياً).`
        : !isAdmin && rule.costCredits > 0 && userCredits < rule.costCredits
          ? `رصيد النقاط غير كافٍ. تكلفة هذا التخصص ${rule.costCredits} نقطة ورصيدك الحالي ${userCredits} نقطة.`
          : null;

  const blockedReasonEn = !rule.enabled && !isAdmin
    ? 'This specialty is currently paused by the Admin.'
    : !isAdmin && globalUsedToday >= globalLimit
      ? `Daily platform limit reached (${globalLimit} cases/day). Upgrade plan or request higher quota from Admin.`
      : !isAdmin && rule.dailyLimit > 0 && specialtyUsedToday >= rule.dailyLimit
        ? `Daily specialty limit reached (${rule.dailyLimit} runs/day for this specialty).`
        : !isAdmin && rule.costCredits > 0 && userCredits < rule.costCredits
          ? `Insufficient points. This specialty costs ${rule.costCredits} pts and your balance is ${userCredits} pts.`
          : null;

  return {
    ...rule,
    globalLimit,
    globalUsedToday,
    globalRemainingToday,
    specialtyUsedToday,
    specialtyRemainingToday,
    userCredits,
    allowed: !blockedReasonAr,
    blockedReasonAr,
    blockedReasonEn,
  };
}
