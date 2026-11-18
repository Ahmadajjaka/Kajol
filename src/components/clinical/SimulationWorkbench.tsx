import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FlaskConical,
  HelpCircle,
  MessageSquare,
  Plus,
  Sparkles,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { EXAM_SYSTEMS, LAB_PANELS } from '../../data/specialtiesAndLabTemplates';
import { getText } from '../../i18n/translations';
import { requestTestInterpretation } from '../../services/aiService';
import {
  AiProvider,
  AppView,
  ClinicalCase,
  ExamSystemId,
  ImagingModalityId,
  LabPanelId,
  Language,
  SimulationSession,
} from '../../types/clinical';
import { Anatomy3DViewer } from '../three/Anatomy3DViewer';
import { ChatGptInterviewWorkspace } from './ChatGptInterviewWorkspace';
import { EcgMonitorStrip } from './EcgMonitorStrip';

interface SimulationWorkbenchProps {
  language: Language;
  userId: string;
  clinicalCase: ClinicalCase;
  session: SimulationSession;
  activeTab: 'patient_room' | 'history_taking' | 'physical_exam' | 'lab_imaging' | 'differential' | 'treatment';
  activeProvider: AiProvider;
  aiMedicalAssistantEnabled?: boolean;
  anatomy3dEnabled?: boolean;
  onChangeTab: (tab: AppView) => void;
  onUpdateSession: (patch: Partial<SimulationSession>) => void;
  onSubmitEvaluation: (overrides?: {
    finalDiagnosis?: string;
    treatmentPlan?: string;
  }) => Promise<void>;
  evaluating: boolean;
}

const HISTORY_SECTIONS = [
  { id: 'hpi', en: 'History of Present Illness (HPI)', ar: 'القصة المرضية الحالية (HPI)' },
  { id: 'pmh', en: 'Past Medical History (PMH)', ar: 'السوابق المرضية (PMH)' },
  { id: 'psh', en: 'Past Surgical History (PSH)', ar: 'السوابق الجراحية (PSH)' },
  { id: 'meds_allergies', en: 'Medications & Allergies', ar: 'الأدوية والحساسيات' },
  { id: 'fh_sh', en: 'Family & Social History', ar: 'التاريخ العائلي والاجتماعي' },
] as const;

const IMAGING_MODALITIES: { id: ImagingModalityId; en: string; ar: string }[] = [
  { id: 'ecg', en: '12-Lead ECG', ar: 'تخطيط القلب الكهربائي (ECG)' },
  { id: 'xray', en: 'X-Ray Radiograph', ar: 'صورة الأشعة (X-Ray)' },
  { id: 'ct', en: 'CT Scan', ar: 'التصوير المقطعي (CT)' },
  { id: 'mri', en: 'MRI Scan', ar: 'الرنين المغناطيسي (MRI)' },
  { id: 'echo', en: 'Echocardiogram (Echo)', ar: 'إيكو القلب (Echo)' },
  { id: 'specialized', en: 'Specialized Diagnostic Study', ar: 'فحص تخصصي متقدم' },
];

export function SimulationWorkbench({
  language,
  userId,
  clinicalCase,
  session,
  activeTab,
  activeProvider,
  aiMedicalAssistantEnabled = true,
  anatomy3dEnabled = true,
  onChangeTab,
  onUpdateSession,
  onSubmitEvaluation,
  evaluating,
}: SimulationWorkbenchProps) {
  const t = getText(language);
  const { patientSummary: p, clinicalTruth: truth } = clinicalCase;

  const [chatInitialTarget, setChatInitialTarget] = useState<'patient' | 'assistant'>('patient');
  const [focusedOrgan, setFocusedOrgan] = useState<ExamSystemId>('cardiovascular');
  const [aiInterpretations, setAiInterpretations] = useState<Record<string, string>>({});
  const [interpretingKey, setInterpretingKey] = useState<string | null>(null);
  const [diffInput, setDiffInput] = useState('');

  const isTimedMode = session.mode === 'osce' || session.mode === 'emergency';
  const remainingSec = Math.max(0, 600 - session.elapsedSeconds);

  const elapsedRef = useRef(session.elapsedSeconds);
  elapsedRef.current = session.elapsedSeconds;

  useEffect(() => {
    if (evaluating || session.status !== 'active') return;
    const interval = window.setInterval(() => {
      const nextElapsed = elapsedRef.current + 1;
      elapsedRef.current = nextElapsed;
      onUpdateSession({ elapsedSeconds: nextElapsed });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [evaluating, session.status, onUpdateSession]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const openChatWithTarget = (target: 'patient' | 'assistant') => {
    setChatInitialTarget(target === 'assistant' && !aiMedicalAssistantEnabled ? 'patient' : target);
    onChangeTab('history_taking');
  };

  const toggleHistorySection = (secId: string) => {
    if (session.unlockedHistorySections.includes(secId)) return;
    onUpdateSession({
      unlockedHistorySections: [...session.unlockedHistorySections, secId],
    });
  };

  const unlockExamSystem = (sysId: ExamSystemId) => {
    setFocusedOrgan(sysId);
    if (!session.unlockedExamSystems.includes(sysId)) {
      onUpdateSession({
        unlockedExamSystems: [...session.unlockedExamSystems, sysId],
      });
    }
  };

  const orderLabPanel = (panelId: LabPanelId) => {
    if (!session.orderedLabs.includes(panelId)) {
      onUpdateSession({ orderedLabs: [...session.orderedLabs, panelId] });
    }
  };

  const orderImagingModality = (modId: ImagingModalityId) => {
    if (!session.orderedImaging.includes(modId)) {
      onUpdateSession({ orderedImaging: [...session.orderedImaging, modId] });
    }
  };

  const handleInterpretTest = async (key: string, modalityLabel: string, findings: unknown) => {
    setInterpretingKey(key);
    try {
      const text = await requestTestInterpretation({
        userId,
        modality: modalityLabel,
        findings,
        clinicalCase,
        language,
        provider: activeProvider,
      });
      setAiInterpretations((prev) => ({ ...prev, [key]: text }));
    } catch (err) {
      setAiInterpretations((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Interpretation unavailable.',
      }));
    } finally {
      setInterpretingKey(null);
    }
  };

  const addDifferential = () => {
    const val = diffInput.trim();
    if (!val || session.differentialList.includes(val)) return;
    onUpdateSession({ differentialList: [...session.differentialList, val] });
    setDiffInput('');
  };

  const removeDifferential = (item: string) => {
    onUpdateSession({
      differentialList: session.differentialList.filter((d) => d !== item),
    });
  };

  const getHistorySectionContent = (id: string) => {
    switch (id) {
      case 'hpi':
        return language === 'ar' ? truth.hpiAr : truth.hpiEn;
      case 'pmh':
        return language === 'ar' ? truth.pmhAr : truth.pmhEn;
      case 'psh':
        return language === 'ar' ? truth.pshAr : truth.pshEn;
      case 'meds_allergies':
        return language === 'ar'
          ? `الأدوية: ${truth.medicationsAr} — الحساسيات: ${truth.allergiesAr}`
          : `Medications: ${truth.medicationsEn} · Allergies: ${truth.allergiesEn}`;
      case 'fh_sh':
        return language === 'ar'
          ? `العائلي: ${truth.familyHistoryAr} — الاجتماعي: ${truth.socialHistoryAr}`
          : `Family: ${truth.familyHistoryEn} · Social: ${truth.socialHistoryEn}`;
      default:
        return '';
    }
  };

  const timerDisplay = isTimedMode ? formatTimer(remainingSec) : formatTimer(session.elapsedSeconds);
  const isUrgentTimer = isTimedMode && remainingSec < 120;

  if (activeTab === 'history_taking') {
    return (
      <ChatGptInterviewWorkspace
        language={language}
        userId={userId}
        clinicalCase={clinicalCase}
        session={session}
        activeProvider={activeProvider}
        aiMedicalAssistantEnabled={aiMedicalAssistantEnabled}
        initialTarget={chatInitialTarget}
        timerDisplay={timerDisplay}
        isUrgentTimer={isUrgentTimer}
        historySections={HISTORY_SECTIONS}
        getHistorySectionContent={getHistorySectionContent}
        onUnlockHistorySection={toggleHistorySection}
        onChangeTab={onChangeTab}
        onUpdateSession={onUpdateSession}
        onSubmitEvaluation={onSubmitEvaluation}
        evaluating={evaluating}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Emergency Banner if Urgent or Emergency Mode */}
      {(p.isUrgent || session.mode === 'emergency') && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-200 text-xs sm:text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{t.room.emergencyAlert}</span>
          </div>
          <span className="text-xs font-mono-tabular text-rose-600 dark:text-rose-300">
            ABCDE Priority
          </span>
        </div>
      )}

      {/* Patient Intake & Live Vital Signs Bar */}
      <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 sm:space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-sky-600 dark:text-sky-400">
                {session.mode === 'random'
                  ? language === 'ar'
                    ? 'حالة عشوائية (التخصص مخفي)'
                    : 'Blind Random Case'
                  : clinicalCase.specialty.replace('_', ' ').toUpperCase()}
              </span>
              <span aria-hidden="true">·</span>
              <span>{language === 'ar' ? p.settingAr : p.settingEn}</span>
              <span aria-hidden="true">·</span>
              <span>{clinicalCase.sourceType === 'ai_generated' ? 'AI Case' : 'Reference Case'}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {language === 'ar' ? p.nameAr : p.nameEn} — {p.age} {language === 'ar' ? 'سنة' : 'yrs'} (
              {p.gender === 'male' ? (language === 'ar' ? 'ذكر' : 'Male') : language === 'ar' ? 'أنثى' : 'Female'})
            </h1>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <strong className="font-semibold">
                {language === 'ar' ? 'الشكوى الرئيسية (Chief Complaint): ' : 'Chief Complaint: '}
              </strong>
              {language === 'ar' ? p.chiefComplaintAr : p.chiefComplaintEn}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Clock className={`w-4 h-4 ${isUrgentTimer ? 'text-rose-500' : 'text-sky-500'}`} />
              <span className="text-sm font-mono-tabular font-semibold">{timerDisplay}</span>
            </div>
          </div>
        </div>

        {/* Tabular Vitals Strip */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          {[
            { label: 'HR', val: `${p.vitals.hr} bpm`, abnormal: p.vitals.hr > 100 || p.vitals.hr < 55 },
            { label: 'BP', val: `${p.vitals.bp}`, abnormal: Number(p.vitals.bp.split('/')[0]) < 95 },
            { label: 'RR', val: `${p.vitals.rr} /m`, abnormal: p.vitals.rr > 22 },
            { label: 'SpO2', val: `${p.vitals.spo2}%`, abnormal: p.vitals.spo2 < 92 },
            { label: 'Temp', val: `${p.vitals.temp}°C`, abnormal: p.vitals.temp >= 38.0 },
            { label: 'GCS', val: `${p.vitals.gcs}/15`, abnormal: p.vitals.gcs < 15 },
          ].map((v) => (
            <div
              key={v.label}
              className={`rounded-xl px-2.5 sm:px-3.5 py-2 sm:py-2.5 border ${
                v.abnormal
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                  : 'bg-slate-50 dark:bg-[#081327] border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{v.label}</div>
              <div
                className={`text-xs sm:text-sm font-bold font-mono-tabular mt-0.5 truncate ${
                  v.abnormal ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                }`}
              >
                {v.val}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Beginner Guidance Banner */}
      {session.mode === 'beginner' && (
        <div className="rounded-xl bg-teal-50 dark:bg-teal-950/35 border border-teal-200 dark:border-teal-800/50 px-4 py-3 flex items-start gap-2.5 text-xs text-teal-800 dark:text-teal-200">
          <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
          <div>
            <span className="font-semibold">{t.room.beginnerHint}: </span>
            <span>{language === 'ar' ? truth.beginnerHintAr : truth.beginnerHintEn}</span>
          </div>
        </div>
      )}

      {/* Clinical Workflow Sub-Tabs (Screens 6-11) + Quick AI Medical Assistant Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto p-1.5 rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800">
          {(
            [
              ['patient_room', t.room.tabs.patient_room, Activity],
              ['history_taking', t.room.tabs.history_taking, MessageSquare],
              ['physical_exam', t.room.tabs.physical_exam, Stethoscope],
              ['lab_imaging', t.room.tabs.lab_imaging, FlaskConical],
              ['differential', t.room.tabs.differential, ClipboardCheck],
              ['treatment', t.room.tabs.treatment, CheckCircle2],
            ] as const
          ).map(([tabId, label, Icon]) => (
            <button
              key={tabId}
              type="button"
              onClick={() => onChangeTab(tabId)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeTab === tabId
                  ? 'bg-[#0B162C] dark:bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {aiMedicalAssistantEnabled && (
          <button
            type="button"
            onClick={() => openChatWithTarget('assistant')}
            className="px-3.5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Bot className="w-4 h-4" />
            <span>{language === 'ar' ? 'المساعد الطبي AI' : 'AI Medical Assistant'}</span>
          </button>
        )}
      </div>

      {/* SCREEN 6: Virtual Patient Room & 3D Anatomy */}
      {activeTab === 'patient_room' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            {anatomy3dEnabled ? (
              <Anatomy3DViewer
                heartRate={p.vitals.hr}
                respiratoryRate={p.vitals.rr}
                language={language}
                focusedSystem={focusedOrgan}
                onSelectOrganSystem={(sys) => {
                  unlockExamSystem(sys);
                }}
              />
            ) : (
              <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-3">
                <h2 className="text-base font-bold">
                  {language === 'ar' ? 'مراقبة المريض السريرية' : 'Clinical Bedside Monitor'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {language === 'ar'
                    ? 'العرض التشريحي ثلاثي الأبعاد موقوف مؤقتاً من قِبل الإدارة. يمكنك إجراء الفحص السريري من تبويب الفحص أو النقر على الأجهزة أدناه.'
                    : '3D Anatomy Viewer is paused by Admin. Perform system examinations directly below or in the Physical Exam tab.'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {EXAM_SYSTEMS.map((sys) => (
                    <button
                      key={sys.id}
                      type="button"
                      onClick={() => {
                        unlockExamSystem(sys.id);
                        onChangeTab('physical_exam');
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-sky-500 cursor-pointer"
                    >
                      {language === 'ar' ? sys.nameAr : sys.nameEn}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-bold">
              {language === 'ar' ? 'بروتوكول التقييم السريري التدريجي' : 'Progressive Clinical Encounter'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t.room.progressiveNotice}
            </p>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800">
                <span>{language === 'ar' ? 'أسئلة المقابلة المطروحة' : 'Interview Questions Asked'}</span>
                <span className="font-mono-tabular font-bold">
                  {session.chatMessages.filter((m) => m.role === 'doctor').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800">
                <span>{language === 'ar' ? 'الأجهزة المفحوصة سريرياً' : 'Examined Body Systems'}</span>
                <span className="font-mono-tabular font-bold">{session.unlockedExamSystems.length} / 8</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800">
                <span>{language === 'ar' ? 'التحاليل والصور المطلوبة' : 'Labs & Imaging Ordered'}</span>
                <span className="font-mono-tabular font-bold">
                  {session.orderedLabs.length + session.orderedImaging.length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800">
                <span>{language === 'ar' ? 'قائمة التشخيص التفريقي' : 'Differential Diagnoses'}</span>
                <span className="font-mono-tabular font-bold">{session.differentialList.length}</span>
              </div>
            </div>
            <div className="pt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openChatWithTarget('patient')}
                className="flex-1 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
              >
                {language === 'ar' ? 'بدء استجواب المريض' : 'Start Patient Interview'}
              </button>
              {aiMedicalAssistantEnabled && (
                <button
                  type="button"
                  onClick={() => openChatWithTarget('assistant')}
                  className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'المساعد الطبي AI' : 'AI Assistant'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeTab('physical_exam')}
                className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                {language === 'ar' ? 'الفحص السريري' : 'Physical Exam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 8: Physical Examination */}
      {activeTab === 'physical_exam' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className={`${anatomy3dEnabled ? 'lg:col-span-7' : 'lg:col-span-12'} grid grid-cols-1 sm:grid-cols-2 gap-4`}>
            {EXAM_SYSTEMS.map((sys) => {
              const unlocked = session.unlockedExamSystems.includes(sys.id);
              const finding = truth.physicalExam[sys.id];
              return (
                <div
                  key={sys.id}
                  className={`rounded-2xl bg-white dark:bg-[#0F1D36] border p-4 space-y-2.5 ${
                    unlocked && finding.abnormal
                      ? 'border-amber-400/60'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">{language === 'ar' ? sys.nameAr : sys.nameEn}</h3>
                    <button
                      type="button"
                      onClick={() => unlockExamSystem(sys.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        unlocked
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300'
                          : 'bg-[#0B162C] dark:bg-sky-600 text-white'
                      }`}
                    >
                      {unlocked ? t.room.unlocked : language === 'ar' ? 'فحص الجهاز' : 'Examine'}
                    </button>
                  </div>
                  {unlocked ? (
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pt-2 border-t border-slate-100 dark:border-slate-800">
                      {language === 'ar' ? finding.ar : finding.en}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {language === 'ar' ? 'انقر لإجراء الفحص السريري.' : 'Click to perform bedside exam.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {anatomy3dEnabled && (
            <div className="lg:col-span-5">
              <Anatomy3DViewer
                heartRate={p.vitals.hr}
                respiratoryRate={p.vitals.rr}
                language={language}
                focusedSystem={focusedOrgan}
                onSelectOrganSystem={unlockExamSystem}
              />
            </div>
          )}
        </div>
      )}

      {/* SCREEN 9: Virtual Lab (13 Panels) & Imaging */}
      {activeTab === 'lab_imaging' && (
        <div className="space-y-6">
          {/* 13 Lab Panels */}
          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-lg font-bold">
              {language === 'ar' ? 'المختبر الافتراضي (13 لوحة مخبرية)' : 'Virtual Clinical Laboratory (13 Panels)'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {LAB_PANELS.map((panel) => {
                const ordered = session.orderedLabs.includes(panel.id);
                return (
                  <div
                    key={panel.id}
                    className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold truncate">
                        {language === 'ar' ? panel.nameAr : panel.nameEn}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono-tabular">{panel.costLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => orderLabPanel(panel.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                        ordered
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300'
                          : 'bg-sky-600 hover:bg-sky-500 text-white'
                      }`}
                    >
                      {ordered ? t.room.ordered : t.room.orderTest}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Ordered Lab Results Table */}
            {session.orderedLabs.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                {session.orderedLabs.map((panelId) => {
                  const meta = LAB_PANELS.find((l) => l.id === panelId);
                  const items = truth.labs[panelId] || [];
                  const interpKey = `lab_${panelId}`;
                  return (
                    <div
                      key={panelId}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                      <div className="px-3.5 sm:px-4 py-2.5 bg-slate-100 dark:bg-[#081327] flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold">
                          {language === 'ar' ? meta?.nameAr : meta?.nameEn}
                        </span>
                        <button
                          type="button"
                          disabled={interpretingKey === interpKey}
                          onClick={() =>
                            handleInterpretTest(interpKey, meta?.nameEn || panelId, items)
                          }
                          className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            {interpretingKey === interpKey ? t.common.loading : t.room.interpretAi}
                          </span>
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 dark:bg-[#0B162C] text-slate-500">
                            <tr>
                              <th className="text-start px-4 py-2">Analyte</th>
                              <th className="text-end px-4 py-2">Result</th>
                              <th className="text-start px-4 py-2">Unit</th>
                              <th className="text-start px-4 py-2">Reference Range</th>
                              <th className="text-start px-4 py-2">Flag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {items.map((row, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2 font-medium">{row.name}</td>
                                <td
                                  className={`px-4 py-2 text-end font-mono-tabular font-bold ${
                                    row.flag === 'critical'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : row.flag !== 'normal'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : ''
                                  }`}
                                >
                                  {row.value}
                                </td>
                                <td className="px-4 py-2 font-mono-tabular text-slate-500">{row.unit}</td>
                                <td className="px-4 py-2 font-mono-tabular text-slate-500">{row.referenceRange}</td>
                                <td className="px-4 py-2 font-semibold uppercase text-[11px]">
                                  {row.flag === 'normal'
                                    ? 'Normal'
                                    : row.flag === 'high'
                                      ? '▲ High'
                                      : row.flag === 'low'
                                        ? '▼ Low'
                                        : '⚠ Critical'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {aiInterpretations[interpKey] && (
                        <div className="px-4 py-3 bg-sky-50/70 dark:bg-sky-950/35 border-t border-sky-200 dark:border-sky-800/50 text-xs leading-relaxed">
                          {aiInterpretations[interpKey]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ECG, X-Ray, CT/MRI, Echo, Specialized */}
          <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-lg font-bold">
              {language === 'ar' ? 'الأشعة والتخطيط والفحوصات التخصصية' : 'ECG, Radiology, Echo & Specialized Studies'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {IMAGING_MODALITIES.map((mod) => {
                const ordered = session.orderedImaging.includes(mod.id);
                return (
                  <div
                    key={mod.id}
                    className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-bold">{language === 'ar' ? mod.ar : mod.en}</span>
                    <button
                      type="button"
                      onClick={() => orderImagingModality(mod.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        ordered
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300'
                          : 'bg-sky-600 hover:bg-sky-500 text-white'
                      }`}
                    >
                      {ordered ? t.room.ordered : t.room.orderTest}
                    </button>
                  </div>
                );
              })}
            </div>

            {session.orderedImaging.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3">
                {session.orderedImaging.map((modId) => {
                  const study = truth.imaging[modId];
                  const interpKey = `img_${modId}`;
                  return (
                    <div
                      key={modId}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50 dark:bg-[#081327]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold">
                          {language === 'ar' ? study.titleAr : study.titleEn}
                        </h3>
                        <button
                          type="button"
                          disabled={interpretingKey === interpKey}
                          onClick={() =>
                            handleInterpretTest(interpKey, study.titleEn, study.findingsEn)
                          }
                          className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{t.room.interpretAi}</span>
                        </button>
                      </div>

                      {modId === 'ecg' && (
                        <EcgMonitorStrip
                          pattern={study.ecgPattern || 'normal'}
                          heartRate={p.vitals.hr}
                        />
                      )}

                      {study.imageAsset && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900">
                          <img
                            src={
                              study.imageAsset === 'chest_xray'
                                ? '/src/assets/images/medical_chest_xray_sample_1794950525376.jpg'
                                : '/src/assets/images/medical_brain_ct_sample_1794950526102.jpg'
                            }
                            alt={study.titleEn}
                            referrerPolicy="no-referrer"
                            className="w-full h-48 object-cover"
                          />
                        </div>
                      )}

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {language === 'ar' ? study.findingsAr : study.findingsEn}
                      </p>

                      {aiInterpretations[interpKey] && (
                        <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 text-xs leading-relaxed">
                          {aiInterpretations[interpKey]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCREEN 10: Differential Diagnosis Builder */}
      {activeTab === 'differential' && (
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-5 max-w-3xl">
          <div>
            <h2 className="text-lg font-bold">
              {language === 'ar' ? 'بناء قائمة التشخيص التفريقي (20 نقطة)' : 'Differential Diagnosis Builder (20 Points)'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {language === 'ar'
                ? 'أضف الاحتمالات التشخيصية الأهم والأخطر بناءً على القصة والفحص والتحاليل.'
                : 'Add ranked probable and life-threatening differential diagnoses supported by your clinical findings.'}
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={diffInput}
              onChange={(e) => setDiffInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDifferential();
                }
              }}
              placeholder={
                language === 'ar'
                  ? 'مثال: Acute Coronary Syndrome / Pulmonary Embolism'
                  : 'e.g., Acute Coronary Syndrome / Pulmonary Embolism'
              }
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={addDifferential}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.room.addDifferential}</span>
            </button>
          </div>

          <div className="space-y-2">
            {session.differentialList.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                {language === 'ar' ? 'لم تُضف أي تشخيصات تفريقية بعد.' : 'No differential diagnoses added yet.'}
              </p>
            ) : (
              session.differentialList.map((dx, idx) => (
                <div
                  key={dx}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800"
                >
                  <span className="text-sm font-medium">
                    <span className="font-mono-tabular text-sky-500 me-2">0{idx + 1}.</span>
                    {dx}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDifferential(dx)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SCREEN 11: Final Diagnosis & Treatment Plan */}
      {activeTab === 'treatment' && (
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-5 max-w-3xl">
          <div>
            <h2 className="text-lg font-bold">
              {language === 'ar'
                ? 'التشخيص النهائي والخطة العلاجية (35 نقطة)'
                : 'Final Diagnosis & Treatment Plan (35 Points)'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {language === 'ar'
                ? 'حدد التشخيص النهائي الدقيق واكتب خطة العلاج والأولويات الدوائية والوقائية.'
                : 'Enter your final clinical diagnosis and outline acute stabilization, pharmacotherapy, and disposition.'}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold">
              {language === 'ar' ? 'التشخيص النهائي (Final Diagnosis)' : 'Final Diagnosis'}
            </label>
            <input
              type="text"
              value={session.finalDiagnosis}
              onChange={(e) => onUpdateSession({ finalDiagnosis: e.target.value })}
              placeholder={
                language === 'ar'
                  ? 'اكتب التشخيص النهائي الدقيق...'
                  : 'Enter your primary clinical diagnosis...'
              }
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-base sm:text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold">
              {language === 'ar'
                ? 'الخطة العلاجية والتدبير السريري (Treatment Plan)'
                : 'Clinical Management & Treatment Plan'}
            </label>
            <textarea
              rows={5}
              value={session.treatmentPlan}
              onChange={(e) => onUpdateSession({ treatmentPlan: e.target.value })}
              placeholder={
                language === 'ar'
                  ? 'اذكر التدبير الإسعافي ABCDE، الأدوية والجرعات، الاستشارات، والمراقبة...'
                  : 'Outline ABCDE stabilization, medications/doses, procedures, consultations, and monitoring...'
              }
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-base sm:text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {language === 'ar'
                ? 'سيقوم محرك الذكاء الاصطناعي الطبي بتقييم كامل جلستك من 100 نقطة.'
                : 'Your full clinical workflow will be graded on our 100-point OSCE rubric.'}
            </span>
            <button
              type="button"
              disabled={evaluating || !session.finalDiagnosis.trim() || !session.treatmentPlan.trim()}
              onClick={() => onSubmitEvaluation()}
              className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{evaluating ? t.room.evaluating : t.room.submitEvaluation}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
