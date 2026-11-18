import { BadgeDefinition, ExamSystemId, LabPanelId, SimulationMode, SpecialtyMeta } from '../types/clinical';

export const SPECIALTIES: SpecialtyMeta[] = [
  { id: 'internal_medicine', nameEn: 'Internal Medicine', nameAr: 'الطب الباطني', tier: 'free', category: 'medical', totalBankCases: 42 },
  { id: 'cardiology', nameEn: 'Cardiology', nameAr: 'طب القلب', tier: 'free', category: 'medical', totalBankCases: 38 },
  { id: 'pulmonology', nameEn: 'Pulmonology', nameAr: 'أمراض الصدرية والتنفس', tier: 'free', category: 'medical', totalBankCases: 30 },
  { id: 'gastroenterology', nameEn: 'Gastroenterology', nameAr: 'الجهاز الهضمي', tier: 'free', category: 'medical', totalBankCases: 28 },
  { id: 'nephrology', nameEn: 'Nephrology', nameAr: 'أمراض الكلى', tier: 'pro', category: 'medical', totalBankCases: 24 },
  { id: 'neurology', nameEn: 'Neurology', nameAr: 'طب الأعصاب', tier: 'free', category: 'medical', totalBankCases: 34 },
  { id: 'endocrinology', nameEn: 'Endocrinology', nameAr: 'الغدد الصماء والسكري', tier: 'free', category: 'medical', totalBankCases: 26 },
  { id: 'hematology', nameEn: 'Hematology', nameAr: 'أمراض الدم', tier: 'pro', category: 'medical', totalBankCases: 22 },
  { id: 'infectious_diseases', nameEn: 'Infectious Diseases', nameAr: 'الأمراض المعدية', tier: 'free', category: 'medical', totalBankCases: 31 },
  { id: 'rheumatology', nameEn: 'Rheumatology', nameAr: 'أمراض الروماتيزم والمفاصل', tier: 'pro', category: 'medical', totalBankCases: 20 },
  { id: 'emergency_medicine', nameEn: 'Emergency Medicine', nameAr: 'طب الطوارئ والإسعاف', tier: 'free', category: 'acute', totalBankCases: 45 },
  { id: 'general_surgery', nameEn: 'General Surgery', nameAr: 'الجراحة العامة', tier: 'free', category: 'surgical', totalBankCases: 29 },
  { id: 'orthopedics', nameEn: 'Orthopedics', nameAr: 'جراحة العظام', tier: 'pro', category: 'surgical', totalBankCases: 24 },
  { id: 'pediatrics', nameEn: 'Pediatrics', nameAr: 'طب الأطفال', tier: 'free', category: 'specialty', totalBankCases: 36 },
  { id: 'ob_gyn', nameEn: 'Obstetrics & Gynecology', nameAr: 'النسائية والتوليد', tier: 'pro', category: 'specialty', totalBankCases: 28 },
  { id: 'dermatology', nameEn: 'Dermatology', nameAr: 'الأمراض الجلدية', tier: 'pro', category: 'specialty', totalBankCases: 22 },
  { id: 'psychiatry', nameEn: 'Psychiatry', nameAr: 'الطب النفسي', tier: 'pro', category: 'specialty', totalBankCases: 25 },
  { id: 'urology', nameEn: 'Urology', nameAr: 'جراحة المسالك البولية', tier: 'pro', category: 'surgical', totalBankCases: 20 },
  { id: 'ent', nameEn: 'ENT (Otolaryngology)', nameAr: 'الأنف والأذن والحنجرة', tier: 'pro', category: 'specialty', totalBankCases: 21 },
  { id: 'ophthalmology', nameEn: 'Ophthalmology', nameAr: 'طب العيون', tier: 'pro', category: 'specialty', totalBankCases: 19 },
  { id: 'oncology', nameEn: 'Oncology', nameAr: 'طب الأورام', tier: 'pro', category: 'medical', totalBankCases: 23 },
  { id: 'family_medicine', nameEn: 'Family Medicine', nameAr: 'طب الأسرة', tier: 'free', category: 'medical', totalBankCases: 35 },
];

export const SIMULATION_MODES: {
  id: SimulationMode;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  tier: 'free' | 'pro';
  timedSeconds?: number;
}[] = [
  {
    id: 'beginner',
    nameEn: 'Beginner Mode',
    nameAr: 'نمط المبتدئين',
    descEn: 'Guided clinical cases with live diagnostic hints and structured cues.',
    descAr: 'حالات سهلة مع مساعدة وتوجيه سريري خطوة بخطوة.',
    tier: 'free',
  },
  {
    id: 'practice',
    nameEn: 'Clinical Practice Mode',
    nameAr: 'نمط الممارسة السريرية',
    descEn: 'Full realistic hospital encounter with progressive data reveal.',
    descAr: 'محاكاة كاملة واقعية دون كشف التشخيص.',
    tier: 'free',
  },
  {
    id: 'emergency',
    nameEn: 'Emergency Mode (ABCDE)',
    nameAr: 'نمط الطوارئ (ABCDE)',
    descEn: 'Time-critical acute resuscitation prioritizing ABCDE stabilization.',
    descAr: 'حالات إسعافية تحت ضغط الوقت مع أولوية التقييم ABCDE.',
    tier: 'free',
    timedSeconds: 600,
  },
  {
    id: 'specialist',
    nameEn: 'Advanced Specialist Mode',
    nameAr: 'نمط الاختصاصي المتقدم',
    descEn: 'Complex multi-morbid and misleading diagnostic challenges.',
    descAr: 'حالات معقدة ومتعددة الأمراض تتطلب تفكيراً سريرياً متقدماً.',
    tier: 'pro',
  },
  {
    id: 'osce',
    nameEn: 'OSCE Exam Mode',
    nameAr: 'نمط امتحان OSCE',
    descEn: 'Timed 10-minute clinical exam station with strict rubric scoring.',
    descAr: 'محطات امتحانية سريرية تفاعلية مع مؤقت وتقييم دقيق.',
    tier: 'pro',
    timedSeconds: 600,
  },
  {
    id: 'random',
    nameEn: 'Random Blind Case',
    nameAr: 'الحالة العشوائية العمياء',
    descEn: 'Unknown specialty and diagnosis until final debriefing.',
    descAr: 'حالة عشوائية دون معرفة التخصص أو التشخيص مسبقاً.',
    tier: 'free',
  },
  {
    id: 'daily',
    nameEn: 'Daily Clinical Challenge',
    nameAr: 'التحدي السريري اليومي',
    descEn: 'Fresh daily clinical case with bonus XP streak rewards.',
    descAr: 'تحدٍ سريري جديد كل يوم مع نقاط XP إضافية.',
    tier: 'free',
  },
];

export const LAB_PANELS: {
  id: LabPanelId;
  nameEn: string;
  nameAr: string;
  costLabel: string;
}[] = [
  { id: 'cbc', nameEn: 'Complete Blood Count (CBC)', nameAr: 'تعداد الدم الكامل (CBC)', costLabel: 'Tier 1' },
  { id: 'crp_esr', nameEn: 'CRP & ESR Inflammatory Markers', nameAr: 'مؤشرات الالتهاب (CRP & ESR)', costLabel: 'Tier 1' },
  { id: 'renal', nameEn: 'Renal Function (BUN / Cr / eGFR)', nameAr: 'وظائف الكلى (Renal Function)', costLabel: 'Tier 1' },
  { id: 'liver', nameEn: 'Liver Function Panel (LFTs)', nameAr: 'وظائف الكبد (Liver Function)', costLabel: 'Tier 1' },
  { id: 'electrolytes', nameEn: 'Serum Electrolytes (Na/K/Cl/Ca)', nameAr: 'الشوارد الدموية (Electrolytes)', costLabel: 'Tier 1' },
  { id: 'glucose', nameEn: 'Blood Glucose & HbA1c', nameAr: 'سكر الدم والهيموغلوبين السكري', costLabel: 'Tier 1' },
  { id: 'thyroid', nameEn: 'Thyroid Function (TSH / FT4)', nameAr: 'وظائف الدرق (Thyroid Function)', costLabel: 'Tier 2' },
  { id: 'coagulation', nameEn: 'Coagulation Profile (PT/INR/aPTT)', nameAr: 'ملف التخثر (Coagulation)', costLabel: 'Tier 2' },
  { id: 'urinalysis', nameEn: 'Urinalysis & Microscopy', nameAr: 'تحليل البول الكامل (Urinalysis)', costLabel: 'Tier 1' },
  { id: 'abg', nameEn: 'Arterial Blood Gas (ABG)', nameAr: 'غازات الدم الشرياني (ABG)', costLabel: 'STAT' },
  { id: 'cardiac_markers', nameEn: 'Cardiac Markers (Troponin I / BNP)', nameAr: 'الواسمات القلبية (Troponin / BNP)', costLabel: 'STAT' },
  { id: 'microbiology', nameEn: 'Microbiology & Cultures', nameAr: 'المزارع الجرثومية (Microbiology)', costLabel: 'Tier 2' },
  { id: 'hormonal', nameEn: 'Hormonal & Endocrine Assays', nameAr: 'الفحوصات الهرمونية (Hormonal)', costLabel: 'Tier 3' },
];

export const EXAM_SYSTEMS: {
  id: ExamSystemId;
  nameEn: string;
  nameAr: string;
  organFocus: 'heart' | 'lungs' | 'chest' | 'general';
}[] = [
  { id: 'general', nameEn: 'General Appearance & ABCDE', nameAr: 'المظهر العام وتقييم ABCDE', organFocus: 'general' },
  { id: 'cardiovascular', nameEn: 'Cardiovascular Exam', nameAr: 'فحص الجهاز القلبي الوعائي', organFocus: 'heart' },
  { id: 'respiratory', nameEn: 'Respiratory Exam', nameAr: 'فحص الجهاز التنفسي', organFocus: 'lungs' },
  { id: 'abdominal', nameEn: 'Abdominal Exam', nameAr: 'فحص البطن', organFocus: 'general' },
  { id: 'neurological', nameEn: 'Neurological Exam', nameAr: 'الفحص العصبي', organFocus: 'general' },
  { id: 'heent', nameEn: 'HEENT Exam', nameAr: 'فحص الرأس والعنق (HEENT)', organFocus: 'general' },
  { id: 'musculoskeletal', nameEn: 'Musculoskeletal Exam', nameAr: 'الفحص العضلي الهيكلي', organFocus: 'general' },
  { id: 'skin', nameEn: 'Skin & Extremities', nameAr: 'فحص الجلد والأطراف', organFocus: 'general' },
];

export const BADGES: BadgeDefinition[] = [
  {
    id: 'first_diagnosis',
    titleEn: 'First Clinical Case',
    titleAr: 'أول تشخيص سريري',
    descEn: 'Completed your first full patient simulation.',
    descAr: 'إتمام أول حالة محاكاة سريرية كاملة بنجاح.',
  },
  {
    id: 'sharp_diagnostician',
    titleEn: 'Sharp Diagnostician',
    titleAr: 'دقة تشخيصية عالية',
    descEn: 'Scored 85/100 or higher on a clinical encounter.',
    descAr: 'تحقيق 85/100 أو أعلى في التقييم النهائي.',
  },
  {
    id: 'abcde_responder',
    titleEn: 'ABCDE First Responder',
    titleAr: 'منقذ الطوارئ (ABCDE)',
    descEn: 'Completed an Emergency Mode stabilization case.',
    descAr: 'إتمام حالة إسعافية ضمن نمط الطوارئ.',
  },
  {
    id: 'steward_of_labs',
    titleEn: 'Diagnostic Steward',
    titleAr: 'الترشيد المخبري',
    descEn: 'Solved a case with zero unnecessary lab or imaging orders.',
    descAr: 'حل حالة دون طلب فحوصات غير ضرورية.',
  },
  {
    id: 'daily_scholar',
    titleEn: 'Daily Clinical Streak',
    titleAr: 'المثابرة السريرية',
    descEn: 'Completed a Daily Clinical Challenge.',
    descAr: 'إتمام التحدي السريري اليومي.',
  },
  {
    id: 'senior_resident',
    titleEn: 'Senior Clinical Mind',
    titleAr: 'العقل السريري المتقدم',
    descEn: 'Reached 1,000 total clinical XP.',
    descAr: 'الوصول إلى 1,000 نقطة خبرة XP.',
  },
];
