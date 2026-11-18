import { AlertTriangle, Bell, CheckCircle2, Info, Megaphone, X } from 'lucide-react';
import { Announcement, AnnouncementSeverity, Language } from '../../types/clinical';

function getSeverityStyles(severity: AnnouncementSeverity) {
  switch (severity) {
    case 'urgent':
      return {
        box: 'bg-rose-50 dark:bg-rose-950/45 border-rose-200 dark:border-rose-800/70 text-rose-900 dark:text-rose-100',
        icon: AlertTriangle,
        iconColor: 'text-rose-500',
        labelAr: 'عاجل',
        labelEn: 'Urgent',
      };
    case 'warning':
      return {
        box: 'bg-amber-50 dark:bg-amber-950/45 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-100',
        icon: AlertTriangle,
        iconColor: 'text-amber-500',
        labelAr: 'تنبيه',
        labelEn: 'Notice',
      };
    case 'success':
      return {
        box: 'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-100',
        icon: CheckCircle2,
        iconColor: 'text-emerald-500',
        labelAr: 'تحديث',
        labelEn: 'Update',
      };
    default:
      return {
        box: 'bg-sky-50 dark:bg-sky-950/45 border-sky-200 dark:border-sky-800/70 text-sky-900 dark:text-sky-100',
        icon: Info,
        iconColor: 'text-sky-500',
        labelAr: 'إشعار إداري',
        labelEn: 'Announcement',
      };
  }
}

interface AnnouncementBannerProps {
  language: Language;
  announcements: Announcement[];
  dismissedIds: string[];
  onDismiss: (id: string) => void;
  onOpenDrawer: () => void;
}

export function AnnouncementBanner({
  language,
  announcements,
  dismissedIds,
  onDismiss,
  onOpenDrawer,
}: AnnouncementBannerProps) {
  const visible = announcements.find((a) => !dismissedIds.includes(a.id));
  if (!visible) return null;

  const meta = getSeverityStyles(visible.severity);
  const Icon = meta.icon;

  return (
    <div
      role="region"
      aria-label="Platform announcement"
      className={`mx-3 sm:mx-8 mt-3 px-4 py-3 rounded-xl border flex items-start justify-between gap-3 ${meta.box}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.iconColor}`} />
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span>{language === 'ar' ? meta.labelAr : meta.labelEn}</span>
            <span aria-hidden="true">·</span>
            <span>{language === 'ar' ? visible.titleAr : visible.titleEn}</span>
          </div>
          <p className="text-xs opacity-90 leading-relaxed">
            {language === 'ar' ? visible.messageAr : visible.messageEn}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {announcements.length > 1 && (
          <button
            type="button"
            onClick={onOpenDrawer}
            className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
          >
            {language === 'ar' ? `الكل (${announcements.length})` : `All (${announcements.length})`}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss(visible.id)}
          aria-label="Dismiss announcement"
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface AnnouncementsDrawerProps {
  open: boolean;
  language: Language;
  announcements: Announcement[];
  onClose: () => void;
}

export function AnnouncementsDrawer({
  open,
  language,
  announcements,
  onClose,
}: AnnouncementsDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative z-10 w-full max-w-md bg-white dark:bg-[#0B162C] border-s border-slate-200 dark:border-slate-800 h-full p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-sky-500" />
            <h2 className="text-base font-bold">
              {language === 'ar' ? 'الإشعارات الإدارية العامة' : 'Platform Notifications'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {announcements.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-slate-500 dark:text-slate-400">
            <Bell className="w-7 h-7 mx-auto opacity-50" />
            <p className="text-xs">
              {language === 'ar'
                ? 'لا توجد إشعارات منشورة من الإدارة حالياً.'
                : 'No active admin announcements at this time.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => {
              const meta = getSeverityStyles(a.severity);
              const Icon = meta.icon;
              return (
                <article
                  key={a.id}
                  className={`rounded-xl border p-4 space-y-1.5 ${meta.box}`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Icon className={`w-4 h-4 shrink-0 ${meta.iconColor}`} />
                    <span>{language === 'ar' ? meta.labelAr : meta.labelEn}</span>
                    <span aria-hidden="true">·</span>
                    <span>{language === 'ar' ? a.titleAr : a.titleEn}</span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">
                    {language === 'ar' ? a.messageAr : a.messageEn}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
