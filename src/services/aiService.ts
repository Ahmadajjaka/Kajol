import { buildBaselineExam, buildBaselineImaging, buildBaselineLabs } from '../data/seedCases';
import {
  AiProvider,
  CaseArchetype,
  CaseDifficulty,
  ChatMessage,
  ClinicalCase,
  EvaluationReport,
  LabPanelId,
  LabTestResultItem,
  Language,
  ScoreBreakdown,
  SimulationMode,
  SimulationSession,
  SpecialtyId,
} from '../types/clinical';
import { logAiUsage } from './firestoreService';

export async function streamPatientChat(params: {
  userId: string;
  question: string;
  history: ChatMessage[];
  clinicalCase: ClinicalCase;
  language: Language;
  mode: SimulationMode;
  provider: AiProvider;
  onChunk: (partial: string) => void;
}): Promise<string> {
  const started = Date.now();
  const response = await fetch('/api/ai/patient-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      history: params.history,
      patientSummary: params.clinicalCase.patientSummary,
      clinicalTruth: params.clinicalCase.clinicalTruth,
      language: params.language,
      mode: params.mode,
      provider: params.provider,
    }),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text();
    throw new Error(errBody || 'Patient interview stream failed.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.chunk) {
          accumulated += parsed.chunk;
          params.onChunk(accumulated);
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes('Unexpected')) {
          throw e;
        }
      }
    }
  }

  logAiUsage({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    endpoint: 'patient-chat',
    provider: params.provider,
    latencyMs: Date.now() - started,
  });

  return accumulated.trim();
}

async function consumeSseStream(
  response: Response,
  onChunk: (partial: string) => void,
  fallbackError: string
): Promise<string> {
  if (!response.ok || !response.body) {
    const errBody = await response.text();
    throw new Error(errBody || fallbackError);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.chunk) {
          accumulated += parsed.chunk;
          onChunk(accumulated);
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes('Unexpected')) {
          throw e;
        }
      }
    }
  }
  return accumulated.trim();
}

export async function streamMedicalAssistant(params: {
  userId: string;
  question: string;
  history: ChatMessage[];
  clinicalCase: ClinicalCase;
  session: SimulationSession;
  language: Language;
  provider: AiProvider;
  onChunk: (partial: string) => void;
}): Promise<string> {
  const started = Date.now();
  const response = await fetch('/api/ai/medical-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      history: params.history,
      patientSummary: params.clinicalCase.patientSummary,
      clinicalTruth: params.clinicalCase.clinicalTruth,
      sessionProgress: {
        unlockedHistorySections: params.session.unlockedHistorySections,
        unlockedExamSystems: params.session.unlockedExamSystems,
        orderedLabs: params.session.orderedLabs,
        orderedImaging: params.session.orderedImaging,
        differentialList: params.session.differentialList,
        elapsedSeconds: params.session.elapsedSeconds,
      },
      language: params.language,
      mode: params.session.mode,
      provider: params.provider,
    }),
  });

  const text = await consumeSseStream(
    response,
    params.onChunk,
    'AI Medical Assistant stream failed.'
  );

  logAiUsage({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    endpoint: 'medical-assistant',
    provider: params.provider,
    latencyMs: Date.now() - started,
  });

  return text;
}

export async function streamExaminerDebrief(params: {
  userId: string;
  question: string;
  debriefHistory: { role: 'doctor' | 'examiner'; text: string }[];
  session: SimulationSession;
  language: Language;
  provider: AiProvider;
  onChunk: (partial: string) => void;
}): Promise<string> {
  const started = Date.now();
  const response = await fetch('/api/ai/examiner-debrief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      debriefHistory: params.debriefHistory,
      sessionSummary: {
        specialty: params.session.specialty,
        mode: params.session.mode,
        elapsedSeconds: params.session.elapsedSeconds,
        unlockedHistorySections: params.session.unlockedHistorySections,
        unlockedExamSystems: params.session.unlockedExamSystems,
        orderedLabs: params.session.orderedLabs,
        orderedImaging: params.session.orderedImaging,
        differentialList: params.session.differentialList,
        finalDiagnosis: params.session.finalDiagnosis,
        treatmentPlan: params.session.treatmentPlan,
        totalScore: params.session.totalScore,
        scoreBreakdown: params.session.scoreBreakdown,
      },
      evaluationReport: params.session.evaluationReport,
      language: params.language,
      provider: params.provider,
    }),
  });

  const text = await consumeSseStream(
    response,
    params.onChunk,
    'Examiner debrief stream failed.'
  );

  logAiUsage({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    endpoint: 'examiner-debrief',
    provider: params.provider,
    latencyMs: Date.now() - started,
  });

  return text;
}

export async function requestTestInterpretation(params: {
  userId: string;
  modality: string;
  findings: unknown;
  clinicalCase: ClinicalCase;
  language: Language;
  provider: AiProvider;
}): Promise<string> {
  const started = Date.now();
  const res = await fetch('/api/ai/interpret-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modality: params.modality,
      findings: params.findings,
      patientSummary: params.clinicalCase.patientSummary,
      language: params.language,
      provider: params.provider,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to interpret diagnostic test.');
  }

  logAiUsage({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    endpoint: 'interpret-test',
    provider: (data.provider as AiProvider) || params.provider,
    latencyMs: Date.now() - started,
  });

  return data.interpretation || '';
}

export async function generateAiClinicalCase(params: {
  userId: string;
  specialty: SpecialtyId;
  difficulty: CaseDifficulty;
  archetype: CaseArchetype;
  language: Language;
  provider: AiProvider;
}): Promise<ClinicalCase> {
  const started = Date.now();
  const res = await fetch('/api/ai/generate-case', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      specialty: params.specialty,
      difficulty: params.difficulty,
      archetype: params.archetype,
      language: params.language,
      provider: params.provider,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.generatedCase) {
    throw new Error(data.error || 'Failed to synthesize clinical case.');
  }

  const g = data.generatedCase;
  const panelKey = (['cbc', 'crp_esr', 'renal', 'liver', 'electrolytes', 'glucose', 'thyroid', 'coagulation', 'urinalysis', 'abg', 'cardiac_markers', 'microbiology', 'hormonal'].includes(
    g.keyLabPanel
  )
    ? g.keyLabPanel
    : 'cbc') as LabPanelId;

  const labItems: LabTestResultItem[] = Array.isArray(g.keyLabItems)
    ? g.keyLabItems.map((item: Partial<LabTestResultItem>) => ({
        name: String(item.name || 'Marker'),
        value: String(item.value || '-'),
        unit: String(item.unit || ''),
        referenceRange: String(item.referenceRange || ''),
        flag: (['normal', 'high', 'low', 'critical'].includes(String(item.flag))
          ? item.flag
          : 'high') as LabTestResultItem['flag'],
      }))
    : [];

  const ecgPat = ['normal', 'stemi', 'afib', 'vtach', 'pe_s1q3t3'].includes(g.ecgPattern)
    ? g.ecgPattern
    : 'normal';

  const newCase: ClinicalCase = {
    id: `ai-case-${params.specialty}-${Date.now()}`,
    specialty: params.specialty,
    difficulty: params.difficulty,
    archetype: params.archetype,
    tier: 'free',
    isPublished: true,
    sourceType: 'ai_generated',
    titleEn: String(g.titleEn || `${params.specialty} Clinical Case`).slice(0, 200),
    titleAr: String(g.titleAr || 'حالة سريرية مولدة بالذكاء الاصطناعي').slice(0, 200),
    patientSummary: {
      nameEn: String(g.patientNameEn || 'Virtual Patient'),
      nameAr: String(g.patientNameAr || 'مريض افتراضي'),
      age: Number(g.age) || 45,
      gender: g.gender === 'female' ? 'female' : 'male',
      chiefComplaintEn: String(g.chiefComplaintEn || 'Acute symptoms'),
      chiefComplaintAr: String(g.chiefComplaintAr || 'أعراض سريرية حادة'),
      settingEn: String(g.settingEn || 'Hospital Clinic / Emergency'),
      settingAr: String(g.settingAr || 'عيادة المستشفى / الطوارئ'),
      isUrgent: Boolean(g.isUrgent),
      vitals: {
        hr: Number(g.vitals?.hr) || 90,
        bp: String(g.vitals?.bp || '120/78'),
        rr: Number(g.vitals?.rr) || 18,
        spo2: Number(g.vitals?.spo2) || 97,
        temp: Number(g.vitals?.temp) || 37.0,
        gcs: Number(g.vitals?.gcs) || 15,
      },
    },
    clinicalTruth: {
      hpiEn: String(g.hpiEn || ''),
      hpiAr: String(g.hpiAr || ''),
      pmhEn: String(g.pmhEn || 'None'),
      pmhAr: String(g.pmhAr || 'لا يوجد'),
      pshEn: 'None significant.',
      pshAr: 'لا سوابق جراحية مهمة.',
      medicationsEn: String(g.medicationsEn || 'None'),
      medicationsAr: String(g.medicationsAr || 'لا يوجد'),
      allergiesEn: String(g.allergiesEn || 'NKDA'),
      allergiesAr: String(g.allergiesAr || 'لا حساسية معروفة'),
      familyHistoryEn: 'Non-contributory.',
      familyHistoryAr: 'لا سوابق عائلية مؤثرة.',
      socialHistoryEn: 'Standard adult history.',
      socialHistoryAr: 'تاريخ اجتماعي اعتيادي.',
      physicalExam: buildBaselineExam({
        cardiovascular: {
          en: String(g.cardiovascularExamEn || 'Normal S1/S2.'),
          ar: String(g.cardiovascularExamAr || 'أصوات القلب طبيعية.'),
          abnormal: Boolean(g.cardiovascularExamEn && !/normal/i.test(g.cardiovascularExamEn)),
        },
        respiratory: {
          en: String(g.respiratoryExamEn || 'Clear bilaterally.'),
          ar: String(g.respiratoryExamAr || 'ساحتان رئويتان صافيتان.'),
          abnormal: Boolean(g.respiratoryExamEn && !/clear|normal/i.test(g.respiratoryExamEn)),
        },
        abdominal: {
          en: String(g.abdominalExamEn || 'Soft, non-tender.'),
          ar: String(g.abdominalExamAr || 'بطن لين غير مؤلم.'),
          abnormal: Boolean(g.abdominalExamEn && !/soft.*non-tender|normal/i.test(g.abdominalExamEn)),
        },
        neurological: {
          en: String(g.neurologicalExamEn || 'Intact cranial nerves and motor.'),
          ar: String(g.neurologicalExamAr || 'الفحص العصبي سليم.'),
          abnormal: Boolean(g.neurologicalExamEn && !/intact|normal/i.test(g.neurologicalExamEn)),
        },
      }),
      labs: buildBaselineLabs(labItems.length > 0 ? { [panelKey]: labItems } : {}),
      imaging: buildBaselineImaging({
        ecg: {
          available: true,
          titleEn: '12-Lead ECG',
          titleAr: 'تخطيط القلب الكهربائي',
          findingsEn: String(g.ecgFindingsEn || 'Normal sinus rhythm.'),
          findingsAr: String(g.ecgFindingsAr || 'نظم جيبي طبيعي.'),
          abnormal: ecgPat !== 'normal',
          ecgPattern: ecgPat,
        },
      }),
      correctDiagnosisEn: String(g.correctDiagnosisEn || 'Clinical Diagnosis'),
      correctDiagnosisAr: String(g.correctDiagnosisAr || 'التشخيص السريري'),
      acceptableDiagnoses: [String(g.correctDiagnosisEn || ''), String(g.correctDiagnosisAr || '')].filter(Boolean),
      essentialDifferentials: Array.isArray(g.essentialDifferentials) ? g.essentialDifferentials : [],
      necessaryTests: Array.isArray(g.necessaryTests) ? g.necessaryTests : [panelKey],
      unnecessaryTests: ['hormonal'],
      keyCluesEn: Array.isArray(g.keyCluesEn) ? g.keyCluesEn : [],
      keyCluesAr: Array.isArray(g.keyCluesAr) ? g.keyCluesAr : [],
      correctTreatmentEn: String(g.correctTreatmentEn || ''),
      correctTreatmentAr: String(g.correctTreatmentAr || ''),
      beginnerHintEn: String(g.beginnerHintEn || 'Correlate vitals with targeted history and labs.'),
      beginnerHintAr: String(g.beginnerHintAr || 'اربط العلامات الحيوية مع القصة السريرية والتحاليل الموجهة.'),
    },
    guidelineRefs: Array.isArray(g.guidelineRefs) && g.guidelineRefs.length > 0 ? g.guidelineRefs : ['International Clinical Practice Guidelines'],
    createdBy: params.userId,
  };

  logAiUsage({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    endpoint: 'generate-case',
    provider: (data.provider as AiProvider) || params.provider,
    latencyMs: Date.now() - started,
  });

  return newCase;
}

export async function evaluateSimulationSession(params: {
  userId: string;
  clinicalCase: ClinicalCase;
  session: SimulationSession;
  language: Language;
  provider: AiProvider;
}): Promise<{ scoreBreakdown: ScoreBreakdown; totalScore: number; evaluationReport: EvaluationReport }> {
  const started = Date.now();
  const res = await fetch('/api/ai/evaluate-case', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinicalCase: params.clinicalCase,
      sessionData: params.session,
      language: params.language,
      provider: params.provider,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.evaluation) {
    throw new Error(data.error || 'Failed to evaluate clinical session.');
  }

  const ev = data.evaluation;
  const clamp = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));

  const scoreBreakdown: ScoreBreakdown = {
    history: clamp(ev.scoreBreakdown?.history, 15),
    exam: clamp(ev.scoreBreakdown?.exam, 15),
    tests: clamp(ev.scoreBreakdown?.tests, 15),
    ddx: clamp(ev.scoreBreakdown?.ddx, 20),
    diagnosis: clamp(ev.scoreBreakdown?.diagnosis, 15),
    treatment: clamp(ev.scoreBreakdown?.treatment, 20),
  };

  const totalScore =
    scoreBreakdown.history +
    scoreBreakdown.exam +
    scoreBreakdown.tests +
    scoreBreakdown.ddx +
    scoreBreakdown.diagnosis +
    scoreBreakdown.treatment;

  const xpEarned = Math.max(50, totalScore * 2 + (params.session.mode === 'daily' ? 75 : 0));
  const unlockedBadges: string[] = ['first_diagnosis'];
  if (totalScore >= 85) unlockedBadges.push('sharp_diagnostician');
  if (params.session.mode === 'emergency') unlockedBadges.push('abcde_responder');
  if (params.session.mode === 'daily') unlockedBadges.push('daily_scholar');
  if (Array.isArray(ev.unnecessaryTestsOrdered) && ev.unnecessaryTestsOrdered.length === 0) {
    unlockedBadges.push('steward_of_labs');
  }

  const evaluationReport: EvaluationReport = {
    correctDiagnosis:
      ev.correctDiagnosis ||
      (params.language === 'ar'
        ? params.clinicalCase.clinicalTruth.correctDiagnosisAr
        : params.clinicalCase.clinicalTruth.correctDiagnosisEn),
    keyDifferentials: Array.isArray(ev.keyDifferentials) ? ev.keyDifferentials : [],
    keyClues: Array.isArray(ev.keyClues) ? ev.keyClues : [],
    necessaryTestsOrdered: Array.isArray(ev.necessaryTestsOrdered) ? ev.necessaryTestsOrdered : [],
    necessaryTestsMissed: Array.isArray(ev.necessaryTestsMissed) ? ev.necessaryTestsMissed : [],
    unnecessaryTestsOrdered: Array.isArray(ev.unnecessaryTestsOrdered) ? ev.unnecessaryTestsOrdered : [],
    potentialErrors: Array.isArray(ev.potentialErrors) ? ev.potentialErrors : [],
    correctTreatment:
      ev.correctTreatment ||
      (params.language === 'ar'
        ? params.clinicalCase.clinicalTruth.correctTreatmentAr
        : params.clinicalCase.clinicalTruth.correctTreatmentEn),
    stepByStepRationale: String(ev.stepByStepRationale || ''),
    whatShouldHaveBeenDiscovered: Array.isArray(ev.whatShouldHaveBeenDiscovered) ? ev.whatShouldHaveBeenDiscovered : [],
    guidelineReferences:
      Array.isArray(ev.guidelineReferences) && ev.guidelineReferences.length > 0
        ? ev.guidelineReferences
        : params.clinicalCase.guidelineRefs,
    xpEarned,
    unlockedBadges,
    aiGeneratedNotice:
      params.language === 'ar'
        ? 'تم إنشاء هذا التحليل التقييمي بواسطة محرك الذكاء الاصطناعي الطبي لأغراض التعليم والمحاكاة السريرية فقط.'
        : 'This rubric evaluation was generated by the clinical AI engine strictly for educational simulation purposes.',
  };

  logAiUsage({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    endpoint: 'evaluate-case',
    provider: (data.provider as AiProvider) || params.provider,
    latencyMs: Date.now() - started,
  });

  return { scoreBreakdown, totalScore, evaluationReport };
}
