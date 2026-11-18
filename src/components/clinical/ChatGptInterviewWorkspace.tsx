import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  FileText,
  FlaskConical,
  Menu,
  Sparkles,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import { getText } from '../../i18n/translations';
import { streamMedicalAssistant, streamPatientChat } from '../../services/aiService';
import {
  AiProvider,
  AppView,
  ChatMessage,
  ClinicalCase,
  Language,
  SimulationSession,
} from '../../types/clinical';

interface ChatGptInterviewWorkspaceProps {
  language: Language;
  userId: string;
  clinicalCase: ClinicalCase;
  session: SimulationSession;
  activeProvider: AiProvider;
  aiMedicalAssistantEnabled?: boolean;
  initialTarget?: 'patient' | 'assistant';
  timerDisplay: string;
  isUrgentTimer?: boolean;
  historySections: readonly { id: string; en: string; ar: string }[];
  getHistorySectionContent: (id: string) => string;
  onUnlockHistorySection: (id: string) => void;
  onChangeTab: (tab: AppView) => void;
  onUpdateSession: (patch: Partial<SimulationSession>) => void;
  onSubmitEvaluation: (overrides?: {
    finalDiagnosis?: string;
    treatmentPlan?: string;
  }) => Promise<void>;
  evaluating: boolean;
}

/** Lightweight, XSS-safe inline markdown renderer for ChatGPT-style clinical responses. */
function FormattedClinicalText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-[15px] leading-7 break-words">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }
        const isBullet = /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line);
        const cleanLine = isBullet ? line.replace(/^([-*•]|\d+\.)\s+/, '') : line;
        const segments = cleanLine.split(/(\*\*[^*]+\*\*)/g);
        const rendered = segments.map((seg, sIdx) => {
          if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
            return (
              <strong key={sIdx} className="font-semibold text-slate-950 dark:text-white">
                {seg.slice(2, -2)}
              </strong>
            );
          }
          return <span key={sIdx}>{seg}</span>;
        });

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start gap-2 ps-1">
              <span className="text-sky-500 mt-1.5 text-xs select-none" aria-hidden="true">
                •
              </span>
              <span className="flex-1">{rendered}</span>
            </div>
          );
        }
        return <p key={idx}>{rendered}</p>;
      })}
    </div>
  );
}

export function ChatGptInterviewWorkspace({
  language,
  userId,
  clinicalCase,
  session,
  activeProvider,
  aiMedicalAssistantEnabled = true,
  initialTarget = 'patient',
  timerDisplay,
  isUrgentTimer = false,
  historySections,
  getHistorySectionContent,
  onUnlockHistorySection,
  onChangeTab,
  onUpdateSession,
  onSubmitEvaluation,
  evaluating,
}: ChatGptInterviewWorkspaceProps) {
  const t = getText(language);
  const { patientSummary: p } = clinicalCase;

  const [chatTarget, setChatTarget] = useState<'patient' | 'assistant'>(
    aiMedicalAssistantEnabled ? initialTarget : 'patient'
  );
  const [question, setQuestion] = useState('');
  const [streamingReply, setStreamingReply] = useState('');
  const [streamingRole, setStreamingRole] = useState<'patient' | 'coach' | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);

  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [modalDiagnosis, setModalDiagnosis] = useState(session.finalDiagnosis);
  const [modalTreatment, setModalTreatment] = useState(session.treatmentPlan);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setChatTarget(aiMedicalAssistantEnabled ? initialTarget : 'patient');
  }, [initialTarget, aiMedicalAssistantEnabled]);

  useEffect(() => {
    setModalDiagnosis(session.finalDiagnosis);
    setModalTreatment(session.treatmentPlan);
  }, [session.finalDiagnosis, session.treatmentPlan]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.chatMessages.length, streamingReply]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [question]);

  const doctorTurnsCount = session.chatMessages.filter((m) => m.role === 'doctor').length;

  const submitPrompt = async (
    rawText: string,
    overrideTarget?: 'patient' | 'assistant'
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed || chatBusy) return;

    const target = overrideTarget ?? chatTarget;
    const docMsg: ChatMessage = {
      id: `msg_${Date.now()}_doc`,
      role: 'doctor',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      target,
    };

    const nextHistory = [...session.chatMessages, docMsg];
    onUpdateSession({ chatMessages: nextHistory });
    setQuestion('');
    setChatBusy(true);
    setChatError(null);
    setStreamingReply('');
    setStreamingRole(target === 'assistant' ? 'coach' : 'patient');

    try {
      const reply =
        target === 'assistant'
          ? await streamMedicalAssistant({
              userId,
              question: trimmed,
              history: nextHistory,
              clinicalCase,
              session,
              language,
              provider: activeProvider,
              onChunk: (partial) => setStreamingReply(partial),
            })
          : await streamPatientChat({
              userId,
              question: trimmed,
              history: nextHistory,
              clinicalCase,
              language,
              mode: session.mode,
              provider: activeProvider,
              onChunk: (partial) => setStreamingReply(partial),
            });

      const replyMsg: ChatMessage = {
        id: `msg_${Date.now()}_${target === 'assistant' ? 'coach' : 'pat'}`,
        role: target === 'assistant' ? 'coach' : 'patient',
        text: reply || '...',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        target,
      };
      onUpdateSession({ chatMessages: [...nextHistory, replyMsg] });
      setStreamingReply('');
      setStreamingRole(null);
    } catch (err) {
      setChatError(
        err instanceof Error
          ? err.message
          : language === 'ar'
            ? 'تعذر الاتصال بمحرك المحادثة السريرية.'
            : 'Unable to reach clinical AI engine.'
      );
      setStreamingRole(null);
    } finally {
      setChatBusy(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard blocked in sandboxed iframe
    }
  };

  const handleAskAssistantAboutMessage = (patientText: string) => {
    setChatTarget('assistant');
    const prompt =
      language === 'ar'
        ? `بناءً على إجابة المريض: "${patientText.slice(0, 140)}" — ما أهم الأسئلة التالية أو الفحوصات الموجهة التي تنصحني بها؟`
        : `Based on the patient's reply: "${patientText.slice(0, 140)}" — what follow-up questions or focused workup do you recommend?`;
    submitPrompt(prompt, 'assistant');
  };

  const handleConfirmEndEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    const dx =
      modalDiagnosis.trim() ||
      session.differentialList[0] ||
      (language === 'ar' ? 'تقييم مرحلة الاستجواب والفحص' : 'Interview & Exam Assessment');
    const tx =
      modalTreatment.trim() ||
      (language === 'ar'
        ? 'طلب تقييم مرحلة الاستجواب والفحص السريري قبل الخطة النهائية.'
        : 'Initial interview and physical exam evaluation requested.');

    onUpdateSession({ finalDiagnosis: dx, treatmentPlan: tx });
    setEvalModalOpen(false);
    await onSubmitEvaluation({ finalDiagnosis: dx, treatmentPlan: tx });
  };

  const patientStarters =
    language === 'ar'
      ? [
          {
            title: 'بداية الأعراض وتطورها',
            prompt: 'مرحباً، متى بدأت الأعراض بالضبط وكيف تطورت مع الوقت وما شدتها من 10؟',
          },
          {
            title: 'الأعراض المرافقة وعلامات الخطر',
            prompt: 'هل تعاني من ضيق تنفس، ألم صدري، دوار، حرارة، أو أي أعراض مرافقة أخرى؟',
          },
          {
            title: 'السوابق المرضية والجراحية',
            prompt: 'هل لديك أي أمراض مزمنة مثل السكري أو الضغط، أو عمليات جراحية سابقة؟',
          },
          {
            title: 'الأدوية والحساسية والتاريخ العائلي',
            prompt: 'ما الأدوية التي تتناولها حالياً وهل لديك أي حساسية دوائية أو أمراض وراثية بالعائلة؟',
          },
        ]
      : [
          {
            title: 'Onset & OPQRST History',
            prompt: 'Hello, when exactly did your symptoms start, how have they progressed, and how severe are they?',
          },
          {
            title: 'Associated & Red-Flag Symptoms',
            prompt: 'Are you experiencing chest pain, shortness of breath, dizziness, fever, or any other symptoms?',
          },
          {
            title: 'Past Medical & Surgical History',
            prompt: 'Do you have any chronic medical conditions or prior surgeries?',
          },
          {
            title: 'Medications, Allergies & Family History',
            prompt: 'What medications do you take regularly, and do you have any allergies or family conditions?',
          },
        ];

  const assistantStarters =
    language === 'ar'
      ? [
          {
            title: 'تحليل القصة والعلامات الحيوية',
            prompt: 'بصفتك مساعدي الطبي الذكي، حلل الشكوى الرئيسية والعلامات الحيوية واقترح أولويات الاستجواب.',
          },
          {
            title: 'تقييم أسئلتي حتى الآن',
            prompt: 'قيّم جودة الأسئلة التي طرحتها على المريض حتى الآن وما النقاط الحرجة التي لم أسأل عنها بعد؟',
          },
          {
            title: 'أهم الفحص السريري والتحاليل',
            prompt: 'ما الأجهزة التي يجب فحصها سريرياً أولاً، وما التحاليل والصور الأساسية المناسبة للحالة؟',
          },
          {
            title: 'بناء التشخيص التفريقي',
            prompt: 'ساعدني في ترتيب التشخيصات التفريقية الأهم والأخطر بناءً على المعطيات الحالية دون كشف الحل مباشرة.',
          },
        ]
      : [
          {
            title: 'Analyze Presentation & Vitals',
            prompt: 'As my AI Medical Assistant, analyze the chief complaint and vitals and suggest interview priorities.',
          },
          {
            title: 'Critique My Interrogation',
            prompt: 'Evaluate the questions I have asked so far and tell me what critical history gaps remain.',
          },
          {
            title: 'Suggest Exam & Workup',
            prompt: 'Which physical exam systems and diagnostic labs or imaging are highest-yield right now?',
          },
          {
            title: 'Differential Reasoning',
            prompt: 'Help me prioritize life-threatening and probable differential diagnoses without spoiling the answer.',
          },
        ];

  const activeStarters = chatTarget === 'assistant' ? assistantStarters : patientStarters;

  const quickChips =
    chatTarget === 'assistant'
      ? language === 'ar'
        ? [
            'قيّم استجوابي للمريض حتى الآن',
            'ما علامات الخطر (Red Flags) هنا؟',
            'ما التحاليل المناسبة؟',
            'راجع تشخيصي التفريقي',
          ]
        : [
            'Critique my interview so far',
            'Key red flags to rule out?',
            'Recommended labs & imaging?',
            'Review differential diagnosis',
          ]
      : language === 'ar'
        ? [
            'أين تشعر بالألم وهل ينتشر؟',
            'ما الذي يزيد الأعراض أو يخففها؟',
            'هل لديك أمراض مزمنة أو أدوية؟',
            'هل تدخن أو يوجد تاريخ عائلي؟',
          ]
        : [
            'Where is the pain & does it radiate?',
            'What makes it better or worse?',
            'Chronic illnesses or medications?',
            'Smoking or family history?',
          ];

  return (
    <div className="relative flex flex-col h-full w-full bg-white dark:bg-[#071021] text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Row 1: Single-Line Compact ChatGPT Top Bar */}
      <header className="shrink-0 h-13 px-2.5 sm:px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white/95 dark:bg-[#0B162C]/95">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setDossierOpen(true)}
            aria-label={language === 'ar' ? 'فتح ملف المريض والأقسام' : 'Open Case Dossier'}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 cursor-pointer hover:border-sky-500"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Compact Persona Switcher */}
          <div
            role="tablist"
            aria-label={language === 'ar' ? 'اختيار المحاور الذكي' : 'Select AI Conversant'}
            className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chatTarget === 'patient'}
              onClick={() => setChatTarget('patient')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors min-h-[32px] ${
                chatTarget === 'patient'
                  ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'ar' ? 'المريض' : 'Patient'}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={chatTarget === 'assistant'}
              disabled={!aiMedicalAssistantEnabled}
              onClick={() => aiMedicalAssistantEnabled && setChatTarget('assistant')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors min-h-[32px] ${
                !aiMedicalAssistantEnabled
                  ? 'opacity-45 cursor-not-allowed text-slate-400'
                  : chatTarget === 'assistant'
                    ? 'bg-teal-600 text-white shadow-sm cursor-pointer'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer'
              }`}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'ar' ? 'المساعد AI' : 'AI Assistant'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 text-xs font-mono-tabular">
            <Clock className={`w-3.5 h-3.5 ${isUrgentTimer ? 'text-rose-500' : 'text-sky-500'}`} />
            <span>{timerDisplay}</span>
          </div>

          <button
            type="button"
            disabled={evaluating}
            onClick={() => setEvalModalOpen(true)}
            className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50 min-h-[36px]"
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">{language === 'ar' ? 'تقييم الفحص' : 'Evaluate'}</span>
            <span className="hidden sm:inline">
              {language === 'ar' ? 'إنهاء وتقييم الفحص' : 'Evaluate Exam'}
            </span>
          </button>
        </div>
      </header>

      {/* Row 2: Ultra-Slim Single-Line Patient & Vitals Strip (Tappable to open Full Dossier) */}
      <button
        type="button"
        onClick={() => setDossierOpen(true)}
        className="shrink-0 w-full px-3 sm:px-5 py-1.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-[#091529] hover:bg-slate-100 dark:hover:bg-[#0F1D36] flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {p.isUrgent && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
          <span className="font-semibold text-slate-900 dark:text-white shrink-0">
            {language === 'ar' ? p.nameAr : p.nameEn}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {language === 'ar' ? p.chiefComplaintAr : p.chiefComplaintEn}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono-tabular shrink-0 text-slate-500 dark:text-slate-400">
          <span>HR {p.vitals.hr}</span>
          <span className="hidden sm:inline">· BP {p.vitals.bp}</span>
          <span>· SpO2 {p.vitals.spo2}%</span>
          <span className="text-sky-600 dark:text-sky-400 font-sans font-semibold">
            {language === 'ar' ? 'الملف' : 'File'}
          </span>
        </div>
      </button>

      {/* Row 3: Full-Height Centered ChatGPT Conversation Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-6 py-4 sm:py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Welcome / Empty Screen */}
          {session.chatMessages.length === 0 && !streamingReply && (
            <div className="py-4 sm:py-10 space-y-6">
              <div className="text-center space-y-2.5 max-w-xl mx-auto">
                <div
                  className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center border ${
                    chatTarget === 'assistant'
                      ? 'bg-teal-500/10 border-teal-500/30 text-teal-500'
                      : 'bg-sky-500/10 border-sky-500/30 text-sky-500'
                  }`}
                >
                  {chatTarget === 'assistant' ? (
                    <Stethoscope className="w-6 h-6" />
                  ) : (
                    <User className="w-6 h-6" />
                  )}
                </div>

                <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {chatTarget === 'assistant'
                    ? language === 'ar'
                      ? 'المساعد الطبي الذكي جاهز لإرشادك'
                      : 'AI Medical Assistant Ready'
                    : language === 'ar'
                      ? `أهلاً دكتور — استجوب ${p.nameAr}`
                      : `Hello Doctor — Interview ${p.nameEn}`}
                </h1>

                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {language === 'ar' ? p.chiefComplaintAr : p.chiefComplaintEn}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {activeStarters.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    disabled={chatBusy}
                    onClick={() => submitPrompt(item.prompt)}
                    className="rounded-2xl bg-slate-50 dark:bg-[#0B162C] hover:bg-slate-100 dark:hover:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 text-start space-y-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {session.chatMessages.map((msg) => {
            if (msg.role === 'doctor') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[88%] sm:max-w-[78%] space-y-1">
                    {msg.target === 'assistant' && (
                      <div className="text-[11px] font-medium text-teal-600 dark:text-teal-400 text-end px-2">
                        {language === 'ar' ? 'إلى المساعد الطبي AI' : 'To AI Medical Assistant'}
                      </div>
                    )}
                    <div
                      className={`rounded-3xl px-4 sm:px-5 py-3 text-[15px] leading-relaxed ${
                        msg.target === 'assistant'
                          ? 'bg-teal-700 text-white'
                          : 'bg-[#0B162C] dark:bg-sky-600 text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                </div>
              );
            }

            const isAssistant = msg.role === 'coach';

            return (
              <div key={msg.id} className="flex items-start gap-3 sm:gap-4">
                <div
                  className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border mt-0.5 ${
                    isAssistant
                      ? 'bg-teal-500/15 border-teal-500/30 text-teal-600 dark:text-teal-300'
                      : 'bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-300'
                  }`}
                >
                  {isAssistant ? (
                    <Stethoscope className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {isAssistant
                        ? language === 'ar'
                          ? 'المساعد الطبي الذكي'
                          : 'AI Medical Assistant'
                        : language === 'ar'
                          ? p.nameAr
                          : p.nameEn}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{msg.timestamp}</span>
                  </div>

                  <div
                    className={
                      isAssistant
                        ? 'rounded-2xl bg-teal-50/70 dark:bg-teal-950/25 border border-teal-200/80 dark:border-teal-800/40 p-3.5 sm:p-4 text-slate-800 dark:text-slate-100'
                        : 'text-slate-800 dark:text-slate-100'
                    }
                  >
                    <FormattedClinicalText text={msg.text} />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3.5 h-3.5 text-teal-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedId === msg.id
                          ? language === 'ar'
                            ? 'تم النسخ'
                            : 'Copied'
                          : language === 'ar'
                            ? 'نسخ'
                            : 'Copy'}
                      </span>
                    </button>

                    {!isAssistant && aiMedicalAssistantEnabled && (
                      <button
                        type="button"
                        disabled={chatBusy}
                        onClick={() => handleAskAssistantAboutMessage(msg.text)}
                        className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {language === 'ar'
                            ? 'اسأل المساعد الطبي عن هذا الرد'
                            : 'Ask AI Assistant about this'}
                        </span>
                      </button>
                    )}

                    {isAssistant && (
                      <>
                        <button
                          type="button"
                          onClick={() => onChangeTab('physical_exam')}
                          className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>{t.room.tabs.physical_exam}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeTab('lab_imaging')}
                          className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                        >
                          <FlaskConical className="w-3.5 h-3.5" />
                          <span>{t.room.tabs.lab_imaging}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Streaming Live Token Row */}
          {chatBusy && (
            <div className="flex items-start gap-3 sm:gap-4">
              <div
                className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border mt-0.5 ${
                  streamingRole === 'coach'
                    ? 'bg-teal-500/15 border-teal-500/30 text-teal-600 dark:text-teal-300'
                    : 'bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-300'
                }`}
              >
                {streamingRole === 'coach' ? (
                  <Stethoscope className="w-4 h-4" />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {streamingRole === 'coach'
                    ? language === 'ar'
                      ? 'المساعد الطبي الذكي'
                      : 'AI Medical Assistant'
                    : language === 'ar'
                      ? p.nameAr
                      : p.nameEn}
                </div>
                {streamingReply ? (
                  <div
                    className={
                      streamingRole === 'coach'
                        ? 'rounded-2xl bg-teal-50/70 dark:bg-teal-950/25 border border-teal-200/80 dark:border-teal-800/40 p-3.5 sm:p-4'
                        : ''
                    }
                  >
                    <FormattedClinicalText text={streamingReply} />
                    <span className="inline-block w-2 h-4 bg-sky-500 animate-pulse mt-1" />
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-1">
                    {language === 'ar' ? 'جاري التحليل والرد...' : 'Thinking...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {chatError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200">
              {chatError}
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>
      </div>

      {/* Row 4: Docked Bottom ChatGPT Composer (Never covered by bottom nav!) */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B162C]/95 px-3 sm:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {quickChips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={chatBusy}
                onClick={() => submitPrompt(chip)}
                className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-[#081327] hover:bg-sky-500/15 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {chip}
              </button>
            ))}

            {doctorTurnsCount >= 2 && (
              <button
                type="button"
                disabled={evaluating}
                onClick={() => setEvalModalOpen(true)}
                className="px-2.5 py-1 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-[11px] font-bold text-teal-700 dark:text-teal-300 whitespace-nowrap shrink-0 inline-flex items-center gap-1 cursor-pointer"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تقييم الفحص الآن' : 'Grade Exam'}</span>
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitPrompt(question);
            }}
            className={`rounded-3xl bg-slate-100 dark:bg-[#081327] border transition-colors px-3.5 sm:px-4 py-2 ${
              chatTarget === 'assistant'
                ? 'border-teal-400/60 focus-within:border-teal-500'
                : 'border-slate-200 dark:border-slate-700/80 focus-within:border-sky-500'
            }`}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitPrompt(question);
                }
              }}
              placeholder={
                chatTarget === 'assistant'
                  ? t.room.askAssistantPlaceholder
                  : t.room.askPatientPlaceholder
              }
              className="w-full resize-none bg-transparent text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none max-h-28 leading-relaxed"
            />

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  disabled={!aiMedicalAssistantEnabled}
                  onClick={() =>
                    aiMedicalAssistantEnabled &&
                    setChatTarget((prev) => (prev === 'patient' ? 'assistant' : 'patient'))
                  }
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                    !aiMedicalAssistantEnabled
                      ? 'opacity-60 cursor-not-allowed bg-white dark:bg-[#0F1D36] border-slate-200 dark:border-slate-700 text-slate-500'
                      : chatTarget === 'assistant'
                        ? 'bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300 cursor-pointer'
                        : 'bg-white dark:bg-[#0F1D36] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer'
                  }`}
                >
                  {chatTarget === 'assistant' ? (
                    <>
                      <Bot className="w-3 h-3" />
                      <span>{language === 'ar' ? 'المساعد الطبي AI' : 'AI Assistant'}</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3" />
                      <span>{language === 'ar' ? 'المريض' : 'Patient'}</span>
                    </>
                  )}
                </button>
                <span className="hidden sm:inline">
                  · {activeProvider === 'groq' ? 'Groq AI' : 'Gemini AI'}
                </span>
              </div>

              <button
                type="submit"
                disabled={chatBusy || !question.trim()}
                aria-label={t.room.sendQuestion}
                className={`w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 transition-colors ${
                  chatTarget === 'assistant'
                    ? 'bg-teal-600 hover:bg-teal-500'
                    : 'bg-[#0B162C] dark:bg-sky-500 hover:bg-slate-800 dark:hover:bg-sky-400'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Full Clinical Dossier, Vitals & Navigation Slide-Over Drawer */}
      {dossierOpen && (
        <div className="fixed inset-0 z-50 flex justify-start">
          <aside className="relative z-10 w-full max-w-sm bg-white dark:bg-[#0F1D36] border-e border-slate-200 dark:border-slate-800 h-full overflow-y-auto p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-500" />
                <h2 className="text-sm font-bold">
                  {language === 'ar' ? 'ملف المريض والفحص' : 'Patient Dossier & Exam'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDossierOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Patient Vitals Inside Drawer */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {language === 'ar' ? p.nameAr : p.nameEn} — {p.age}{' '}
                {language === 'ar' ? 'سنة' : 'yrs'}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {language === 'ar' ? p.chiefComplaintAr : p.chiefComplaintEn}
              </p>
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                {[
                  { label: 'HR', val: `${p.vitals.hr} bpm` },
                  { label: 'BP', val: p.vitals.bp },
                  { label: 'RR', val: `${p.vitals.rr} /m` },
                  { label: 'SpO2', val: `${p.vitals.spo2}%` },
                  { label: 'Temp', val: `${p.vitals.temp}°C` },
                  { label: 'GCS', val: `${p.vitals.gcs}/15` },
                ].map((v) => (
                  <div
                    key={v.label}
                    className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 px-2.5 py-2"
                  >
                    <div className="text-[10px] text-slate-500">{v.label}</div>
                    <div className="font-mono-tabular font-bold">{v.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation to Clinical Stages */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {language === 'ar' ? 'أقسام المحاكاة' : 'Clinical Simulation Stages'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDossierOpen(false);
                    onChangeTab('patient_room');
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate">{t.room.tabs.patient_room}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDossierOpen(false);
                    onChangeTab('physical_exam');
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate">{t.room.tabs.physical_exam}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDossierOpen(false);
                    onChangeTab('lab_imaging');
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FlaskConical className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate">{t.room.tabs.lab_imaging}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDossierOpen(false);
                    onChangeTab('differential');
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate">{t.room.tabs.differential}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDossierOpen(false);
                    onChangeTab('treatment');
                  }}
                  className="col-span-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span>{t.room.tabs.treatment}</span>
                </button>
              </div>
            </div>

            {/* Progressive History Sections */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {language === 'ar' ? 'أقسام القصة المرضية' : 'History File'} (
                {session.unlockedHistorySections.length}/{historySections.length})
              </div>
              {historySections.map((sec) => {
                const unlocked = session.unlockedHistorySections.includes(sec.id);
                return (
                  <div
                    key={sec.id}
                    className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">
                        {language === 'ar' ? sec.ar : sec.en}
                      </span>
                      {unlocked ? (
                        <span className="text-[11px] font-medium text-teal-600 dark:text-teal-400">
                          {t.room.unlocked}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUnlockHistorySection(sec.id)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium cursor-pointer hover:border-sky-500"
                        >
                          {t.room.unlockSection}
                        </button>
                      )}
                    </div>
                    {unlocked && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-200/70 dark:border-slate-800">
                        {getHistorySectionContent(sec.id)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setDossierOpen(false);
                setEvalModalOpen(true);
              }}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer"
            >
              {t.room.submitEvaluation}
            </button>
          </aside>
          <div className="flex-1 bg-black/50" onClick={() => setDossierOpen(false)} />
        </div>
      )}

      {/* End-of-Exam Evaluation Modal */}
      {evalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {language === 'ar'
                    ? 'إنهاء الفحص وتقييم الأداء السريري'
                    : 'Conclude & Evaluate Clinical Exam'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'ar'
                    ? 'سيقوم الذكاء الاصطناعي بتقييم استجوابك للمريض والفحص والتشخيص من 100 نقطة.'
                    : 'AI Examiner will score your patient interview, exam, workup, and plan out of 100.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvalModalOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="text-slate-500 text-[11px]">
                  {language === 'ar' ? 'الأسئلة' : 'Questions'}
                </div>
                <div className="font-mono-tabular font-bold text-sm mt-0.5">{doctorTurnsCount}</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="text-slate-500 text-[11px]">
                  {language === 'ar' ? 'الفحص' : 'Systems'}
                </div>
                <div className="font-mono-tabular font-bold text-sm mt-0.5">
                  {session.unlockedExamSystems.length}/8
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="text-slate-500 text-[11px]">
                  {language === 'ar' ? 'الفحوصات' : 'Tests'}
                </div>
                <div className="font-mono-tabular font-bold text-sm mt-0.5">
                  {session.orderedLabs.length + session.orderedImaging.length}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 p-2.5">
                <div className="text-slate-500 text-[11px]">
                  {language === 'ar' ? 'التفريقي' : 'DDx'}
                </div>
                <div className="font-mono-tabular font-bold text-sm mt-0.5">
                  {session.differentialList.length}
                </div>
              </div>
            </div>

            <form onSubmit={handleConfirmEndEvaluation} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold">
                  {language === 'ar' ? 'التشخيص النهائي (Final Diagnosis)' : 'Final Diagnosis'}
                </label>
                {session.differentialList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {session.differentialList.map((dx) => (
                      <button
                        key={dx}
                        type="button"
                        onClick={() => setModalDiagnosis(dx)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-[11px] hover:border-sky-500 cursor-pointer"
                      >
                        {dx}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={modalDiagnosis}
                  onChange={(e) => setModalDiagnosis(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'اكتب التشخيص النهائي أو اتركه لتقييم مرحلة الاستجواب والفحص...'
                      : 'Enter final diagnosis (or leave blank to grade interview & exam)...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-base sm:text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold">
                  {language === 'ar'
                    ? 'الخطة العلاجية والتدبير السريري (اختياري عند التقييم السريع)'
                    : 'Clinical Management & Treatment Plan'}
                </label>
                <textarea
                  rows={3}
                  value={modalTreatment}
                  onChange={(e) => setModalTreatment(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'اكتب التدبير الإسعافي ABCDE والأدوية والمراقبة...'
                      : 'Outline stabilization, medications, and follow-up...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-base sm:text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEvalModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer min-h-[42px]"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={evaluating}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[42px]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{evaluating ? t.room.evaluating : t.room.submitEvaluation}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
