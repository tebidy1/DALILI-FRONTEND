import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MeDto } from '@dalili/shared'
import type { ActivityEvent, ActivityKind } from '@/lib/activity'
import type { AppSettings, PreferredStart } from '@/lib/settings-store'
import type { ThemeTokensChoice } from '@/lib/theme-choice'
import { CANCEL_ARM_WINDOW_MS, CancelArm } from '@/lib/cancel-arm'
import { useArmCountdown } from './useArmCountdown'
import { relativeTimeAr } from '@/lib/recent'
import { toArabicDigits } from '@/lib/ar-digits'
import { WEB_BASE } from '@/lib/config'
import { CloseIcon } from './icons'

/**
 * لوحتا الترويسة (2026-09-10): «الإعدادات» و«التنبيهات» — تغطيان اللوحة كاملة
 * برأس وزر إغلاق، لا تلمسان حالة الجلسة، ومقتطعتان من App.tsx لقانون الحجم.
 */

/** الاختصاران المعلنان في المانيفست — الافتراضي إن تعذّر قراءة تخصيص المستخدم */
const SHORTCUT_DEFAULTS: { name: string; label: string; shortcut: string }[] = [
  { name: 'toggle-capture', label: 'بدء أو إيقاف الالتقاط', shortcut: 'Ctrl+Shift+U' },
  { name: 'toggle-bar', label: 'إظهار أو إخفاء شريط التسجيل', shortcut: 'Ctrl+Shift+H' },
]

const arDigitsIn = (s: string) => s.replace(/\d/g, (d) => toArabicDigits(Number(d)))

/** حجم التخزين بوحدة مقروءة وأرقام عربية */
export function formatBytesAr(n: number): string {
  if (n < 1024) return `${toArabicDigits(n)} بايت`
  if (n < 1024 * 1024) return `${arDigitsIn((n / 1024).toFixed(1))} ك.ب`
  return `${arDigitsIn((n / (1024 * 1024)).toFixed(1))} م.ب`
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet-head">
        <h2 id="sheet-title" className="sheet-title">{title}</h2>
        <button className="head-ic" aria-label="إغلاق" title="إغلاق" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  )
}

export function SettingsSheet({
  me,
  settings,
  onPreferredStart,
  theme,
  onTheme,
  hasDraft,
  onDiscardDraft,
  onLogout,
  onClose,
}: {
  me: MeDto | null
  settings: AppSettings
  onPreferredStart: (v: PreferredStart) => void
  theme: ThemeTokensChoice
  onTheme: (v: ThemeTokensChoice) => void
  hasDraft: boolean
  onDiscardDraft: () => void
  onLogout: () => void
  onClose: () => void
}) {
  const [shortcuts, setShortcuts] = useState(SHORTCUT_DEFAULTS)
  const [bytes, setBytes] = useState<number | null>(null)
  const version = chrome.runtime.getManifest?.().version ?? ''
  // حذف المسودة بتأكيد خطوتين كزر الإلغاء — ندمٌ محتمل على عمل لم يُنشر
  const arm = useRef(new CancelArm())
  const [armed, setArmed] = useState(false)
  const armTimer = useRef<number | undefined>(undefined)
  // المرحلة ٤: ثوانٍ التسليح المتبقية تُرى على الزر
  const armLeft = useArmCountdown(armed)

  useEffect(() => {
    let live = true
    // تخصيص المستخدم للاختصار (chrome://extensions/shortcuts) يغلب الافتراضي؛ فارغ = أُزيل
    chrome.commands?.getAll?.()
      .then((cmds) => {
        if (!live) return
        setShortcuts(
          SHORTCUT_DEFAULTS.map((d) => {
            const c = cmds.find((x) => x.name === d.name)
            return c ? { ...d, shortcut: c.shortcut || 'غير مخصّص' } : d
          }),
        )
      })
      .catch(() => {})
    chrome.storage.local.getBytesInUse?.(null)
      .then((b) => live && setBytes(b))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  function onDiscardPress() {
    const r = arm.current.press(Date.now())
    window.clearTimeout(armTimer.current)
    if (r === 'confirm') {
      setArmed(false)
      onDiscardDraft()
      return
    }
    setArmed(true)
    armTimer.current = window.setTimeout(() => {
      setArmed(false)
      arm.current.disarm()
    }, CANCEL_ARM_WINDOW_MS)
  }

  return (
    <Sheet title="الإعدادات" onClose={onClose}>
      <section className="set-sec" aria-label="الحساب">
        <div className="set-label">الحساب</div>
        {me ? (
          <>
            <div className="set-line"><bdi dir="ltr">{me.email}</bdi></div>
            <div className="row">
              <button className="ghost" onClick={() => window.open(`${WEB_BASE}/settings`, '_blank')}>إعدادات الحساب في الويب ↗</button>
              <button className="ghost" onClick={onLogout}>تسجيل الخروج</button>
            </div>
          </>
        ) : (
          <>
            <div className="muted small">غير مسجّل الدخول — الالتقاط يعمل، والنشر يحتاج دخولًا</div>
            <button className="ghost" onClick={() => window.open(`${WEB_BASE}/login?return=extension`, '_blank')}>تسجيل الدخول</button>
          </>
        )}
      </section>

      <section className="set-sec" aria-label="طريقة البدء المفضّلة">
        <div className="set-label">طريقة البدء المفضّلة</div>
        <div className="seg" role="group" aria-label="طريقة البدء المفضّلة">
          <button className={settings.preferredStart === 'plain' ? 'on' : ''} aria-pressed={settings.preferredStart === 'plain'} onClick={() => onPreferredStart('plain')}>
            التقاط عادي
          </button>
          <button className={settings.preferredStart === 'audio' ? 'on' : ''} aria-pressed={settings.preferredStart === 'audio'} onClick={() => onPreferredStart('audio')}>
            مع تعليق صوتي
          </button>
        </div>
        <div className="muted small">الزر المفضّل يصبح الأساسي على شاشة البدء — والزر الآخر يبقى متاحًا دائمًا</div>
      </section>

      <section className="set-sec" aria-label="المظهر">
        <div className="set-label">المظهر</div>
        <div className="seg" role="group" aria-label="المظهر">
          <button className={theme === 'brand' ? 'on' : ''} aria-pressed={theme === 'brand'} onClick={() => onTheme('brand')}>
            الهوية الجديدة
          </button>
          <button className={theme === 'classic' ? 'on' : ''} aria-pressed={theme === 'classic'} onClick={() => onTheme('classic')}>
            الجرافيت
          </button>
        </div>
        <div className="muted small">{me ? 'يُحفظ على حسابك — الموقع والامتداد يتبعان الاختيار نفسه' : 'يُحفظ على هذا الجهاز — سجّل الدخول لمزامنته مع الموقع'}</div>
      </section>

      <section className="set-sec" aria-label="البيانات المحلية">
        <div className="set-label">البيانات المحلية</div>
        <div className="set-line">
          <span>ما تشغله اللقطات والمسودات في المتصفح</span>
          <span className="muted">{bytes === null ? '—' : formatBytesAr(bytes)}</span>
        </div>
        {hasDraft ? (
          <button className={`ghost danger-text${armed ? ' armed' : ''}`} onClick={onDiscardPress}>
            {armed ? `اضغط مجددًا لتأكيد حذف المسودة (${armLeft.toLocaleString('ar-EG')})` : 'حذف المسودة المحفوظة'}
          </button>
        ) : (
          <div className="muted small">لا مسودة معلّقة — اللقطات تُمسح تلقائيًا بعد كل نشر ناجح</div>
        )}
      </section>

      <section className="set-sec" aria-label="اختصارات لوحة المفاتيح">
        <div className="set-label">اختصارات لوحة المفاتيح</div>
        {shortcuts.map((s) => (
          <div key={s.name} className="set-line">
            <span>{s.label}</span>
            <kbd className="kbd">{s.shortcut}</kbd>
          </div>
        ))}
        <div className="muted small">تُغيَّر من chrome://extensions/shortcuts</div>
      </section>

      <div className="muted small center">دليلي — الإصدار {arDigitsIn(version)}</div>
    </Sheet>
  )
}

const KIND_LABEL: Record<ActivityKind, string> = {
  draft: 'مسودة',
  stt: 'تفريغ صوتي',
  limit: 'حدّ الخطوات',
  tab: 'تبويب',
  publish: 'نشر',
}

export function BellSheet({
  events,
  freshIds,
  onDraftClick,
  onClose,
}: {
  events: ActivityEvent[]
  freshIds: ReadonlySet<string>
  /** المرحلة ٣: الجرس يوصلك للحل — حدث المسودة يفتح شاشة المسودة */
  onDraftClick: () => void
  onClose: () => void
}) {
  return (
    <Sheet title="التنبيهات" onClose={onClose}>
      {events.length === 0 ? (
        <div className="muted center small bell-empty">
          لا جديد — يظهر هنا ما يحتاج انتباهك (مسودة لم تُنشر، تفريغ صوتي فشل، حدّ خطوات) وآخر أدلتك المنشورة.
        </div>
      ) : (
        <div className="bell-list">
          {events.map((e) => (
            <div key={e.id} className={`bell-item${freshIds.has(e.id) ? ' fresh' : ''}`}>
              <div className="bell-meta">
                <span className="bell-kind">{KIND_LABEL[e.kind]}</span>
                <span className="bell-time">{relativeTimeAr(new Date(e.ts).toISOString())}</span>
              </div>
              <div className="bell-tx">{e.textAr}</div>
              {/* لا تنبيه ميت: كل حدث له حلّ يقود إليه بنقرة — والبقية معلومات صادقة */}
              {(e.href || e.kind === 'draft') && (
                <div className="bell-act">
                  {e.href ? (
                    <a href={e.href} target="_blank" rel="noreferrer">
                      افتح الدليل ↗
                    </a>
                  ) : (
                    <button onClick={onDraftClick}>عرض المسودة</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
