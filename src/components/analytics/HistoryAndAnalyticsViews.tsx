import { Award, CheckCircle2, Clock, FileText } from 'lucide-react';
import { BADGES } from '../../data/specialtiesAndLabTemplates';
import { Language, SimulationSession, UserProfile } from '../../types/clinical';

interface HistoryLogbookViewProps {
  language: Language;
  sessions: SimulationSession[];
  onOpenSessionReport: (session: SimulationSession) => void;
}

export function HistoryLogbookView({
  language,
  sessions,
  onOpenSessionReport,
}: HistoryLogbookViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {language === 'ar' ? 'سجل الحالات السريرية السابقة' : 'Clinical Simulation Logbook'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {language === 'ar'
            ? 'استعرض جلسات المحاكاة السابقة وتقارير التقييم السريري الخاصة بك.'
            : 'Review your completed hospital encounters, scores, and detailed rubric debriefings.'}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-500">
            {language === 'ar'
              ? 'لا توجد جلسات سريرية مسجلة حتى الآن. ابدأ أول حالة من مكتبة الحالات!'
              : 'No simulation sessions recorded yet. Start your first case from the Case Library.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-[#081327] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-start px-5 py-3">{language === 'ar' ? 'التخصص' : 'Specialty'}</th>
                  <th className="text-start px-5 py-3">{language === 'ar' ? 'النمط' : 'Mode'}</th>
                  <th className="text-start px-5 py-3">{language === 'ar' ? 'تشخيصك' : 'Your Diagnosis'}</th>
                  <th className="text-end px-5 py-3">{language === 'ar' ? 'المدة' : 'Duration'}</th>
                  <th className="text-end px-5 py-3">{language === 'ar' ? 'الدرجة' : 'Score'}</th>
                  <th className="text-end px-5 py-3">{language === 'ar' ? 'التقرير' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-medium capitalize">
                      {s.specialty.replace('_', ' ')}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{s.mode}</td>
                    <td className="px-5 py-3.5 max-w-[240px] truncate">
                      {s.finalDiagnosis || (language === 'ar' ? 'قيد المحاكاة' : 'In Progress')}
                    </td>
                    <td className="px-5 py-3.5 text-end font-mono-tabular text-slate-500">
                      {Math.floor(s.elapsedSeconds / 60)}m {s.elapsedSeconds % 60}s
                    </td>
                    <td className="px-5 py-3.5 text-end font-mono-tabular font-bold">
                      {s.status === 'completed' ? `${s.totalScore}/100` : 'Active'}
                    </td>
                    <td className="px-5 py-3.5 text-end">
                      {s.status === 'completed' ? (
                        <button
                          type="button"
                          onClick={() => onOpenSessionReport(s)}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          {language === 'ar' ? 'عرض التقرير' : 'View Report'}
                        </button>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'نشطة' : 'Active'}</span>
                        </span>
                      )}
                    </td>
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

interface AnalyticsViewProps {
  language: Language;
  profile: UserProfile;
  sessions: SimulationSession[];
}

export function AnalyticsView({ language, profile, sessions }: AnalyticsViewProps) {
  const completed = sessions.filter((s) => s.status === 'completed' && s.scoreBreakdown);
  const avg = (key: keyof NonNullable<SimulationSession['scoreBreakdown']>, max: number) => {
    if (completed.length === 0) return 0;
    const sum = completed.reduce((acc, s) => acc + (s.scoreBreakdown?.[key] ?? 0), 0);
    return Math.round((sum / completed.length / max) * 100);
  };

  const overallAvg =
    completed.length === 0
      ? 0
      : Math.round(completed.reduce((acc, s) => acc + s.totalScore, 0) / completed.length);

  const domains = [
    { label: language === 'ar' ? 'أخذ القصة المرضية (15)' : 'History Taking (15)', pct: avg('history', 15) },
    { label: language === 'ar' ? 'الفحص السريري (15)' : 'Physical Exam (15)', pct: avg('exam', 15) },
    { label: language === 'ar' ? 'اختيار الفحوصات (15)' : 'Investigations (15)', pct: avg('tests', 15) },
    { label: language === 'ar' ? 'التشخيص التفريقي (20)' : 'Differential Dx (20)', pct: avg('ddx', 20) },
    { label: language === 'ar' ? 'التشخيص النهائي (15)' : 'Final Diagnosis (15)', pct: avg('diagnosis', 15) },
    { label: language === 'ar' ? 'الخطة العلاجية (20)' : 'Treatment Plan (20)', pct: avg('treatment', 20) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {language === 'ar' ? 'الإحصائيات وتقدم الأداء السريري' : 'Clinical Analytics & Progression'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {language === 'ar'
            ? 'تحليل موضوعي لأدائك عبر المحاور الستة للتفكير السريري وشارات الإنجاز.'
            : 'Objective performance telemetry across the 6 OSCE reasoning domains and earned badges.'}
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500">{language === 'ar' ? 'المستوى الحالي' : 'Level'}</div>
          <div className="text-2xl font-bold font-mono-tabular mt-1">{profile.level}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500">{language === 'ar' ? 'إجمالي XP' : 'Total XP'}</div>
          <div className="text-2xl font-bold font-mono-tabular mt-1 text-sky-500">{profile.xp}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500">{language === 'ar' ? 'متوسط التقييم' : 'Mean Score'}</div>
          <div className="text-2xl font-bold font-mono-tabular mt-1 text-teal-500">{overallAvg}%</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500">{language === 'ar' ? 'الحالات المكتملة' : 'Completed'}</div>
          <div className="text-2xl font-bold font-mono-tabular mt-1">{completed.length}</div>
        </div>
      </div>

      {/* 6-Domain Mastery Bars */}
      <section className="rounded-2xl bg-white dark:bg-[#0F1D36] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h2 className="text-base font-bold">
          {language === 'ar' ? 'الأداء حسب المحور السريري' : 'Competency Breakdown'}
        </h2>
        <div className="space-y-3">
          {domains.map((d) => (
            <div key={d.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{d.label}</span>
                <span className="font-mono-tabular font-bold">{d.pct}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-teal-500"
                  style={{ width: `${d.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Achievement Badges */}
      <section className="space-y-4">
        <h2 className="text-base font-bold">
          {language === 'ar' ? 'شارات الإنجاز السريري' : 'Clinical Achievement Badges'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BADGES.map((b) => {
            const unlocked = profile.badges.includes(b.id);
            return (
              <div
                key={b.id}
                className={`rounded-2xl border p-4 flex items-start gap-3 ${
                  unlocked
                    ? 'bg-white dark:bg-[#0F1D36] border-teal-500/50'
                    : 'bg-slate-50/70 dark:bg-[#081327] border-slate-200 dark:border-slate-800 opacity-65'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    unlocked ? 'bg-teal-500/15 text-teal-500' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {unlocked ? <CheckCircle2 className="w-5 h-5" /> : <Award className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold">{language === 'ar' ? b.titleAr : b.titleEn}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'ar' ? b.descAr : b.descEn}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
