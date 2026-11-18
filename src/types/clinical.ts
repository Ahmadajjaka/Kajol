export type Language = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';
export type ClinicalTrack = 'student' | 'doctor' | 'specialist';
export type SubscriptionTier = 'free' | 'pro';
export type CaseDifficulty = 'easy' | 'medium' | 'hard';
export type CaseArchetype = 'common' | 'rare' | 'emergency' | 'multimorbid' | 'misleading' | 'urgent';
export type SimulationMode = 'beginner' | 'practice' | 'emergency' | 'specialist' | 'osce' | 'random' | 'daily';
export type AiProvider = 'gemini' | 'groq';

export type AppView =
  | 'dashboard'
  | 'specialties'
  | 'library'
  | 'patient_room'
  | 'history_taking'
  | 'physical_exam'
  | 'lab_imaging'
  | 'differential'
  | 'treatment'
  | 'final_report'
  | 'past_cases'
  | 'analytics'
  | 'subscriptions'
  | 'settings'
  | 'admin';

export type SpecialtyId =
  | 'internal_medicine'
  | 'cardiology'
  | 'pulmonology'
  | 'gastroenterology'
  | 'nephrology'
  | 'neurology'
  | 'endocrinology'
  | 'hematology'
  | 'infectious_diseases'
  | 'rheumatology'
  | 'emergency_medicine'
  | 'general_surgery'
  | 'orthopedics'
  | 'pediatrics'
  | 'ob_gyn'
  | 'dermatology'
  | 'psychiatry'
  | 'urology'
  | 'ent'
  | 'ophthalmology'
  | 'oncology'
  | 'family_medicine';

export interface SpecialtyMeta {
  id: SpecialtyId;
  nameEn: string;
  nameAr: string;
  tier: SubscriptionTier;
  category: 'medical' | 'surgical' | 'acute' | 'specialty';
  totalBankCases: number;
}

export type LabPanelId =
  | 'cbc'
  | 'crp_esr'
  | 'renal'
  | 'liver'
  | 'electrolytes'
  | 'glucose'
  | 'thyroid'
  | 'coagulation'
  | 'urinalysis'
  | 'abg'
  | 'cardiac_markers'
  | 'microbiology'
  | 'hormonal';

export type ExamSystemId =
  | 'general'
  | 'cardiovascular'
  | 'respiratory'
  | 'abdominal'
  | 'neurological'
  | 'heent'
  | 'musculoskeletal'
  | 'skin';

export type ImagingModalityId = 'ecg' | 'xray' | 'ct' | 'mri' | 'echo' | 'specialized';

export interface LabTestResultItem {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: 'normal' | 'high' | 'low' | 'critical';
}

export interface VitalSigns {
  hr: number; // bpm
  bp: string; // mmHg e.g. "110/72"
  rr: number; // /min
  spo2: number; // %
  temp: number; // °C
  gcs: number; // /15
  painScore?: number; // /10
}

export interface PatientSummary {
  nameEn: string;
  nameAr: string;
  age: number;
  gender: 'male' | 'female';
  chiefComplaintEn: string;
  chiefComplaintAr: string;
  settingEn: string;
  settingAr: string;
  isUrgent: boolean;
  vitals: VitalSigns;
}

export interface ClinicalTruth {
  hpiEn: string;
  hpiAr: string;
  pmhEn: string;
  pmhAr: string;
  pshEn: string;
  pshAr: string;
  medicationsEn: string;
  medicationsAr: string;
  allergiesEn: string;
  allergiesAr: string;
  familyHistoryEn: string;
  familyHistoryAr: string;
  socialHistoryEn: string;
  socialHistoryAr: string;
  physicalExam: Record<ExamSystemId, { en: string; ar: string; abnormal: boolean }>;
  labs: Record<LabPanelId, LabTestResultItem[]>;
  imaging: Record<ImagingModalityId, {
    available: boolean;
    titleEn: string;
    titleAr: string;
    findingsEn: string;
    findingsAr: string;
    abnormal: boolean;
    ecgPattern?: 'normal' | 'stemi' | 'afib' | 'vtach' | 'pe_s1q3t3';
    imageAsset?: 'chest_xray' | 'brain_ct';
  }>;
  correctDiagnosisEn: string;
  correctDiagnosisAr: string;
  acceptableDiagnoses: string[];
  essentialDifferentials: string[];
  necessaryTests: string[];
  unnecessaryTests: string[];
  keyCluesEn: string[];
  keyCluesAr: string[];
  correctTreatmentEn: string;
  correctTreatmentAr: string;
  beginnerHintEn: string;
  beginnerHintAr: string;
}

export interface ClinicalCase {
  id: string;
  specialty: SpecialtyId;
  difficulty: CaseDifficulty;
  archetype: CaseArchetype;
  tier: SubscriptionTier;
  isPublished: boolean;
  sourceType: 'curated' | 'ai_generated';
  titleAr: string;
  titleEn: string;
  patientSummary: PatientSummary;
  clinicalTruth: ClinicalTruth;
  guidelineRefs: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'doctor' | 'patient' | 'coach';
  text: string;
  timestamp: string;
  target?: 'patient' | 'assistant';
}

export interface ScoreBreakdown {
  history: number; // /15
  exam: number; // /15
  tests: number; // /15
  ddx: number; // /20
  diagnosis: number; // /15
  treatment: number; // /20
}

export interface EvaluationReport {
  correctDiagnosis: string;
  keyDifferentials: string[];
  keyClues: string[];
  necessaryTestsOrdered: string[];
  necessaryTestsMissed: string[];
  unnecessaryTestsOrdered: string[];
  potentialErrors: string[];
  correctTreatment: string;
  stepByStepRationale: string;
  whatShouldHaveBeenDiscovered: string[];
  guidelineReferences: string[];
  xpEarned: number;
  unlockedBadges: string[];
  aiGeneratedNotice: string;
}

export interface SimulationSession {
  id: string;
  userId: string;
  caseId: string;
  specialty: SpecialtyId;
  mode: SimulationMode;
  status: 'active' | 'completed';
  elapsedSeconds: number;
  unlockedHistorySections: string[];
  unlockedExamSystems: ExamSystemId[];
  orderedLabs: LabPanelId[];
  orderedImaging: ImagingModalityId[];
  chatMessages: ChatMessage[];
  differentialList: string[];
  finalDiagnosis: string;
  treatmentPlan: string;
  scoreBreakdown?: ScoreBreakdown;
  totalScore: number;
  evaluationReport?: EvaluationReport;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type FeatureKey =
  | 'requireLoginApproval'
  | 'aiCaseGenerator'
  | 'aiMedicalAssistant'
  | 'anatomy3d'
  | 'osceAndEmergency'
  | 'examinerDebrief';

export type PlatformFeatureFlags = Record<FeatureKey, boolean>;

export interface SpecialtyPricingRule {
  costCredits: number;
  dailyLimit: number; // 0 = follow global plan daily limit
  enabled: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  clinicalTrack: ClinicalTrack;
  subscriptionTier: SubscriptionTier;
  approvalStatus?: ApprovalStatus;
  credits?: number;
  dailyUsageCount?: number;
  lastUsageDate?: string;
  specialtyUsageToday?: Record<string, number>;
  unlockedFeatures?: string[];
  language: Language;
  theme: ThemeMode;
  xp: number;
  level: number;
  completedCasesCount: number;
  dailyStreak: number;
  lastChallengeDate?: string;
  badges: string[];
  favoriteCaseIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  proRequestStatus: 'none' | 'requested' | 'approved';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminUserRecord {
  profile: UserProfile;
  email?: string;
  proRequestStatus?: 'none' | 'requested' | 'approved';
}

export interface ErrorReport {
  id: string;
  userId: string;
  caseId: string;
  category: 'medical_accuracy' | 'lab_reference' | 'translation' | 'technical';
  description: string;
  status: 'open' | 'reviewed' | 'resolved';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiUsageLog {
  id: string;
  userId: string;
  endpoint: string;
  provider: AiProvider;
  latencyMs: number;
  createdAt?: unknown;
}

export interface PlatformSettings {
  activeProvider: AiProvider;
  freeDailyLimit: number;
  proDailyLimit?: number;
  aiGenerationCost?: number;
  proEnabled: boolean;
  featureFlags?: PlatformFeatureFlags;
  specialtyRules?: Partial<Record<SpecialtyId, SpecialtyPricingRule>>;
  updatedAt?: unknown;
}

export type AnnouncementSeverity = 'info' | 'success' | 'warning' | 'urgent';

export interface Announcement {
  id: string;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  severity: AnnouncementSeverity;
  isActive: boolean;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BadgeDefinition {
  id: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  xpThreshold?: number;
}
