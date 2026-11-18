import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Award,
  BookOpen,
  Bot,
  CheckCircle2,
  Flag,
  Home,
  XCircle,
} from 'lucide-react';
import { BADGES } from '../../data/specialtiesAndLabTemplates';
import { getText } from '../../i18n/translations';
import { streamExaminerDebrief } from '../../services/aiService';
import { submitErrorReport } from '../../services/firestoreService';
import { AiProvider, ErrorReport, Language, SimulationSession } from '../../types/clinical';

interface FinalReportViewProps {
  language: Language;
  userId: string;
  session: SimulationSession;
  activeProvider?: AiProvider;
  examinerDebriefEnabled?: boolean;
  onReturnDashboard: () => void;
}

export function FinalReportView({
  language,
  userId,
  session,
  activeProvider = 'groq',
  examinerDebriefEnabled = true,
  onReturnDashboard,
}: FinalReportViewProps) {
  const t = getText(language);
  const report = session.evaluationReport;
  const scores = session.scoreBreakdown;

  const [reportOpen, setReportOpen] = useState(false);
  const [reportCat, setReportCat] = useState<ErrorReport['category']>('medical_accuracy');
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const [debriefMessages, setDebriefMessages] = useState<
    { id: string; role: 'doctor' | 'examiner'; text: string }[]
  >([]);
  const [debriefInput, setDebriefInput] = useState('');
  const [debriefBusy, setDebriefBusy] = useState(false);
  const [debriefStreaming, setDebriefStreaming] = useState('');
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const debriefEndRef = useRef<HTMLDivElement>(null);

  const askExaminer = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || debriefBusy) return;

    const next = [
      ...debriefMessages,
      { id: `deb_${Date.now()}_u`, role: 'doctor' as const, text: trimmed },
    ];
    setDebriefMessages(next);
    setDebriefInput('');
    setDebriefBusy(true);
    setDebriefError(null);
    setDebriefStreaming('');

    try {
      const reply = await streamExaminerDebrief({
        userId,
        question: trimmed,
        debriefHistory: next.map((m) => ({ role: m.role, text: m.text })),
        session,
        language,
        provider: activeProvider,
        onChunk: (partial) => {
          setDebriefStreaming(partial);
          debriefEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        },
      });
      setDebriefMessages((prev) => [
        ...prev,
        { id: `deb_${Date.now()}_ai`, role: 'examiner', text: reply || '...' },
      ]);
      setDebriefStreaming('');
    } catch (err) {
      setDebriefError(
        err instanceof Error
          ? err.message
          : language === 'ar'
            ? 'تعذر الاتصال بالممتحِن الطبي الذكي.'
            : 'Failed to reach AI Examiner.'
      );
    } finally {
      setDebriefBusy(false);
    }
  };

  if (!report || !scores) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-8 text-center">
        <p className="text-sm text-slate-500">{t.common.loading}</p>
      </div>
    );
  }

  const rubricDomains = [
    { key: 'history', label: language === 'ar' ? 'أخذ القصة المرضية' : 'History Taking', score: scores.history, max: 15 },
    { key: 'exam', label: language === 'ar' ? 'الفحص السريري' : 'Physical Exam', score: scores.exam, max: 15 },
    { key: 'tests', label: language === 'ar' ? 'اختيار الفحوصات' : 'Investigations', score: scores.tests, max: 15 },
    { key: 'ddx', label: language === 'ar' ? 'التشخيص التفريقي' : 'Differential Dx', score: scores.ddx, max: 20 },
    { key: 'diagnosis', label: language === 'ar' ? 'التشخيص النهائي' : 'Final Diagnosis', score: scores.diagnosis, max: 15 },
    { key: 'treatment', label: language === 'ar' ? 'الخطة العلاجية' : 'Treatment Plan', score: scores.treatment, max: 20 },
  ];

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reportText.trim().length < 5) return;
    await submitErrorReport({
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      caseId: session.caseId,
      category: reportCat,
      description: reportText.trim(),
    });
    setReportSent(true);
    setReportText('');
    setTimeout(() => setReportOpen(false), 1200);
  };

  return (
    <div className="space-y-6">
      {/* Score Summary Header */}
      <section className="rounded-2xl bg-[#0B162C] text-white border border-sky-500/25 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium text-teal-300">{report.aiGeneratedNotice}</p>
          <h1 className="text-2xl sm:text-3xl font-bold">{t.report.title}</h1>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-sm">
            <span>
              <strong className="text-sky-300">{t.report.correctDx}: </strong>
              {report.correctDiagnosis}
            </span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>
              <strong className="text-slate-300">{t.report.yourDx}: </strong>
              {session.finalDiagnosis || '-'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center px-6 py-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-xs text-slate-300 mb-1">{t.report.scoreOutOf100}</div>
            <div className="text-4xl font-bold font-mono-tabular text-teal-300">
              {session.totalScore}
              <span className="text-lg text-slate-400">/100</span>
            </div>
          </div>
          <div className="text-center px-5 py-4 rounded-2xl bg-sky-500/15 border border-sky-400/30">
            <div className="text-xs text-sky-200 mb-1">XP</div>
            <div className="text-2xl font-bold font-mono-tabular text-sky-300">+{report.xpEarned}</div>
          </div>
        </div>
      </section>

      {/* 6 Rubric Domains Breakdown */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {rubricDomains.map((d) => (
          <div
            key={d.key}
            className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-4"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 truncate">{d.label}</div>
            <div className="text-xl font-bold font-mono-tabular">
              {d.score}
              <span className="text-xs text-slate-400">/{d.max}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${Math.round((d.score / d.max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </section>

      {/* Detailed Clinical Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
            <span>{t.report.keyClues}</span>
          </h2>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc ps-5">
            {report.keyClues.map((clue, i) => (
              <li key={i}>{clue}</li>
            ))}
          </ul>

          <h3 className="text-sm font-bold pt-3 border-t border-slate-100 dark:border-slate-800">
            {t.report.missedDiscovery}
          </h3>
          <ul className="space-y-1.5 text-xs text-amber-700 dark:text-amber-300 list-disc ps-5">
            {report.whatShouldHaveBeenDiscovered.length === 0 ? (
              <li>{language === 'ar' ? 'لا توجد نقاط رئيسية فائتة.' : 'All key clinical findings discovered.'}</li>
            ) : (
              report.whatShouldHaveBeenDiscovered.map((m, i) => <li key={i}>{m}</li>)
            )}
          </ul>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span>{t.report.potentialErrors}</span>
          </h2>
          {report.potentialErrors.length === 0 ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {language === 'ar' ? 'لم تُرصد أخطاء سريرية حرجة في تدبير الحالة.' : 'No critical clinical safety errors detected.'}
            </p>
          ) : (
            <ul className="space-y-2 text-xs text-rose-700 dark:text-rose-300 list-disc ps-5">
              {report.potentialErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <h3 className="font-bold text-teal-600 dark:text-teal-400 mb-1.5">
                {t.report.necessaryOrdered}
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                {report.necessaryTestsOrdered.join(', ') || '-'}
              </p>
            </div>
            <div>
              <h3 className="font-bold text-rose-600 dark:text-rose-400 mb-1.5 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                <span>{t.report.unnecessaryOrdered}</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                {report.unnecessaryTestsOrdered.join(', ') || (language === 'ar' ? 'لا يوجد' : 'None')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Treatment & Step-by-Step Rationale + Guidelines */}
      <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold mb-1.5">{t.report.correctTx}</h2>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{report.correctTreatment}</p>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-bold mb-1.5">{t.report.rationale}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {report.stepByStepRationale}
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t.report.guidelines}</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {report.guidelineReferences.join(' · ')}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Award className="w-4 h-4 text-amber-500" />
            <span>
              {report.unlockedBadges
                .map((id) => {
                  const b = BADGES.find((x) => x.id === id);
                  return b ? (language === 'ar' ? b.titleAr : b.titleEn) : id;
                })
                .join(' · ')}
            </span>
          </div>
        </div>
      </section>

      {/* Post-Evaluation AI Examiner Debrief Chat */}
      <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-teal-300 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold">
                {language === 'ar'
                  ? 'ناقش تقييم الفحص مع الممتحِن الطبي AI'
                  : 'Discuss Your Exam Evaluation with AI Examiner'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {language === 'ar'
                  ? 'اسأل عن سبب خصم الدرجات أو كيفية تحسين استجواب المريض والخطة العلاجية.'
                  : 'Ask follow-up questions about rubric scoring, interview technique, or management.'}
              </p>
            </div>
          </div>
        </div>

        {!examinerDebriefEnabled ? (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {language === 'ar'
              ? 'ميزة مناقشة الممتحِن الطبي الذكي موقوفة حالياً من قِبل الإدارة.'
              : 'AI Examiner Debrief is currently disabled by the platform administrator.'}
          </div>
        ) : (
          <>
            {(debriefMessages.length > 0 || debriefStreaming) && (
              <div className="space-y-3 max-h-80 overflow-y-auto p-3 rounded-2xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-800">
                {debriefMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'doctor' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'doctor'
                          ? 'bg-sky-600 text-white'
                          : 'bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {debriefStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-white dark:bg-[#0F1D36] border border-teal-500/40 text-slate-800 dark:text-slate-100">
                      {debriefStreaming}
                    </div>
                  </div>
                )}
                <div ref={debriefEndRef} />
              </div>
            )}

            {debriefError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200">
                {debriefError}
              </div>
            )}

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(language === 'ar'
                ? [
                    'لماذا حصلت على هذه الدرجة في الاستجواب؟',
                    'ما أهم سؤال فاتني طرحه على المريض؟',
                    'لخّص لي خطة العلاج المثالية باختصار',
                  ]
                : [
                    'Why did I get this interview score?',
                    'What key question did I miss?',
                    'Summarize the ideal treatment plan',
                  ]
              ).map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={debriefBusy}
                  onClick={() => askExaminer(q)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:border-sky-500 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                askExaminer(debriefInput);
              }}
              className="flex items-center gap-2 rounded-2xl bg-slate-100 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 px-3 py-2"
            >
              <input
                type="text"
                value={debriefInput}
                onChange={(e) => setDebriefInput(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'اسأل الممتحِن الطبي عن نتيجة تقييمك...'
                    : 'Ask the AI Examiner about your evaluation...'
                }
                className="flex-1 min-w-0 bg-transparent text-base sm:text-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={debriefBusy || !debriefInput.trim()}
                className="w-9 h-9 rounded-full bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40"
                aria-label={t.room.sendQuestion}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setReportOpen((v) => !v)}
          className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
        >
          <Flag className="w-3.5 h-3.5 text-amber-500" />
          <span>{t.report.reportIssue}</span>
        </button>

        <button
          type="button"
          onClick={onReturnDashboard}
          className="px-5 py-2.5 rounded-xl bg-[#0B162C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span>{t.report.backDashboard}</span>
        </button>
      </div>

      {reportOpen && (
        <form
          onSubmit={handleSendReport}
          className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5 space-y-3 max-w-xl"
        >
          <h3 className="text-sm font-bold">{t.report.reportIssue}</h3>
          <select
            value={reportCat}
            onChange={(e) => setReportCat(e.target.value as ErrorReport['category'])}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="medical_accuracy">Medical Accuracy</option>
            <option value="lab_reference">Lab Reference Range</option>
            <option value="translation">Arabic/English Translation</option>
            <option value="technical">Technical Issue</option>
          </select>
          <textarea
            rows={3}
            required
            minLength={5}
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder={language === 'ar' ? 'اكتب تفاصيل الملاحظة الطبية أو التقنية...' : 'Describe the medical or technical issue...'}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#081327] border border-slate-200 dark:border-slate-700 text-xs"
          />
          {reportSent && (
            <p className="text-xs text-emerald-500">
              {language === 'ar' ? 'تم إرسال البلاغ لفريق الإدارة.' : 'Report submitted for admin review.'}
            </p>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer"
          >
            {language === 'ar' ? 'إرسال البلاغ' : 'Submit Report'}
          </button>
        </form>
      )}
    </div>
  );
}
