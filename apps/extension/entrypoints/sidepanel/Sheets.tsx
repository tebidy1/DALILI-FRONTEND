import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MeDto } from '@dalili/shared'
import type { ActivityEvent, ActivityKind } from '@/lib/activity'
import type { AppSettings, PreferredStart } from '@/lib/settings-store'
import type { ThemeTokensChoice } from '@/lib/theme-choice'
import { t, type Locale } from '@/lib/i18n'
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
  { name: 'toggle-capture', label: 'ext.scToggleCapture', shortcut: 'Ctrl+Shift+U' },
  { name: 'toggle-bar', label: 'ext.scToggleBar', shortcut: 'Ctrl+Shift+H' },
]

const arDigitsIn = (s: string) => s.replace(/\d/g, (d) => toArabicDigits(Number(d)))

/** حجم التخزين بوحدة مقروءة وأرقام بوعي اللغة */
export function formatBytesAr(n: number): string {
  if (n < 1024) return t('ext.bytes', { count: toArabicDigits(n) })
  if (n < 1024 * 1024) return t('ext.kb', { count: arDigitsIn((n / 1024).toFixed(1)) })
  return t('ext.mb', { count: arDigitsIn((n / (1024 * 1024)).toFixed(1)) })
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet-head">
        <h2 id="sheet-title" className="sheet-title">{title}</h2>
        <button className="head-ic" aria-label={t('ext.close')} title={t('ext.close')} onClick={onClose}>
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
  locale,
  onLocale,
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
  /** I18N-01: اللغة الحالية ومُبدّلها — مرآة بطاقة الثيم */
  locale: Locale
  onLocale: (v: Locale) => void
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
            return c ? { ...d, shortcut: c.shortcut || t('ext.shortcutUnset') } : d
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
    <Sheet title={t('ext.settings')} onClose={onClose}>
      <section className="set-sec" aria-label={t('ext.account')}>
        <div className="set-label">{t('ext.account')}</div>
        {me ? (
          <>
            <div className="set-line"><bdi dir="ltr">{me.email}</bdi></div>
            <div className="row">
              <button className="ghost" onClick={() => window.open(`${WEB_BASE}/settings`, '_blank')}>{t('ext.webAccountSettings')}</button>
              <button className="ghost" onClick={onLogout}>{t('ext.logout')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="muted small">{t('ext.notSignedInShort')}</div>
            <button className="ghost" onClick={() => window.open(`${WEB_BASE}/login?return=extension`, '_blank')}>{t('ext.signIn')}</button>
          </>
        )}
      </section>

      <section className="set-sec" aria-label={t('ext.startPreference')}>
        <div className="set-label">{t('ext.startPreference')}</div>
        <div className="seg" role="group" aria-label={t('ext.startPreference')}>
          <button className={settings.preferredStart === 'plain' ? 'on' : ''} aria-pressed={settings.preferredStart === 'plain'} onClick={() => onPreferredStart('plain')}>
            {t('ext.startPlain')}
          </button>
          <button className={settings.preferredStart === 'audio' ? 'on' : ''} aria-pressed={settings.preferredStart === 'audio'} onClick={() => onPreferredStart('audio')}>
            {t('ext.startAudio')}
          </button>
        </div>
        <div className="muted small">{t('ext.startPreferenceHint')}</div>
      </section>

      <section className="set-sec" aria-label={t('ext.appearance')}>
        <div className="set-label">{t('ext.appearance')}</div>
        <div className="seg" role="group" aria-label={t('ext.appearance')}>
          <button className={theme === 'brand' ? 'on' : ''} aria-pressed={theme === 'brand'} onClick={() => onTheme('brand')}>
            {t('ext.themeBrand')}
          </button>
          <button className={theme === 'classic' ? 'on' : ''} aria-pressed={theme === 'classic'} onClick={() => onTheme('classic')}>
            {t('ext.themeClassic')}
          </button>
        </div>
        <div className="muted small">{me ? t('ext.appearanceSynced') : t('ext.appearanceLocal')}</div>
      </section>

      {/* I18N-01: اللغة — أسماء الخيارين بلغتيهما دائمًا (معيار عالمي) */}
      <section className="set-sec" aria-label={t('ext.language')}>
        <div className="set-label">{t('ext.language')}</div>
        <div className="seg" role="group" aria-label={t('ext.language')}>
          <button className={locale === 'ar' ? 'on' : ''} aria-pressed={locale === 'ar'} onClick={() => onLocale('ar')}>
            العربية
          </button>
          <button className={locale === 'en' ? 'on' : ''} aria-pressed={locale === 'en'} onClick={() => onLocale('en')}>
            English
          </button>
        </div>
        <div className="muted small">{me ? t('ext.languageHintSynced') : t('ext.languageHintLocal')}</div>
      </section>

      <section className="set-sec" aria-label={t('ext.localData')}>
        <div className="set-label">{t('ext.localData')}</div>
        <div className="set-line">
          <span>{t('ext.localDataDesc')}</span>
          <span className="muted">{bytes === null ? '—' : formatBytesAr(bytes)}</span>
        </div>
        {hasDraft ? (
          <button className={`ghost danger-text${armed ? ' armed' : ''}`} onClick={onDiscardPress}>
            {armed ? `${t('ext.draftDeleteConfirm')} (${toArabicDigits(armLeft)})` : t('ext.deleteLocalDraft')}
          </button>
        ) : (
          <div className="muted small">{t('ext.noPendingDraft')}</div>
        )}
      </section>

      <section className="set-sec" aria-label={t('ext.shortcuts')}>
        <div className="set-label">{t('ext.shortcuts')}</div>
        {shortcuts.map((s) => (
          <div key={s.name} className="set-line">
            <span>{t(s.label as Parameters<typeof t>[0])}</span>
            <kbd className="kbd">{s.shortcut}</kbd>
          </div>
        ))}
        <div className="muted small">{t('ext.shortcutsHint')}</div>
      </section>

      <div className="muted small center">{t('ext.version', { version: arDigitsIn(version) })}</div>
    </Sheet>
  )
}

function kindLabelOf(kind: ActivityKind): string {
  switch (kind) {
    case 'draft': return t('ext.notiDraft')
    case 'stt': return t('ext.notiStt')
    case 'limit': return t('ext.notiLimit')
    case 'tab': return t('ext.notiTab')
    case 'publish': return t('ext.notiPublish')
  }
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
    <Sheet title={t('ext.notifications')} onClose={onClose}>
      {events.length === 0 ? (
        <div className="muted center small bell-empty">
          {t('ext.bellEmpty')}
        </div>
      ) : (
        <div className="bell-list">
          {events.map((e) => (
            <div key={e.id} className={`bell-item${freshIds.has(e.id) ? ' fresh' : ''}`}>
              <div className="bell-meta">
                <span className="bell-kind">{kindLabelOf(e.kind)}</span>
                <span className="bell-time">{relativeTimeAr(new Date(e.ts).toISOString())}</span>
              </div>
              <div className="bell-tx">{e.textAr}</div>
              {/* لا تنبيه ميت: كل حدث له حلّ يقود إليه بنقرة — والبقية معلومات صادقة */}
              {(e.href || e.kind === 'draft') && (
                <div className="bell-act">
                  {e.href ? (
                    <a href={e.href} target="_blank" rel="noreferrer">
                      {t('ext.openGuide')}
                    </a>
                  ) : (
                    <button onClick={onDraftClick}>{t('ext.viewDraft')}</button>
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
