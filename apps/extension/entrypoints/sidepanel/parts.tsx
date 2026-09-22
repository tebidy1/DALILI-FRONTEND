import { useEffect, useState } from 'react'
import { toArabicDigits } from '@/lib/ar-digits'
import { i18nLocale, t } from '@/lib/i18n'
import { ItqanMark } from '@/lib/itqan-mark'
import type { SessionMeta, StepSummary } from '@/lib/protocol'
import { TrashIcon, MicIcon, PauseIcon, PlayIcon, BlurIcon, CheckIcon, GearIcon, BellIcon } from './icons'

/** أجزاء اللوحة الجانبية المشتركة — اقتطاع من App.tsx لقانون الحجم */

type SendMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

/** الترويسة: الشعار، رمز الحالة، ثم زرّا الجرس والترس (2026-09-10) — هادئان بلا إطار */
export function HeadBar({ meta, unread, onBell, onSettings }: { meta: SessionMeta; unread: number; onBell: () => void; onSettings: () => void }) {
  const { state } = meta
  const capturing = state === 'capturing' || state === 'paused'
  return (
    <div className="head">
      {/* الشعار مصغّر ٢٥٪ بطلب المالك (٦٥px، كان ٨٦px) والعبارة سطر صغير تحته —
          نمط الترويسة الاحترافي المضغوط. الخطّان الجانبيان للقفل يستحيلان هنا:
          عرض ٦٥px يبتلعهما فيصيران عرقًا، فالعبارة وحدها هي البديل المضغوط.
          القفل الرسمي كاملًا يبقى مكانه الصحيح: شاشة الدخول وشاشة الإقلاع. */}
      <div className="brand">
        <ItqanMark width={65} stroke={13} />
        <span className="brand-latin" aria-label="ACTIVE SOP">
          <b aria-hidden>ACTIVE.</b> <i aria-hidden>SOP</i>
        </span>
      </div>
      <div className="head-side">
        <span className={`chip ${capturing ? 'rec' : ''}`}>
          {state === 'idle' && t('ext.stateReady')}
          {state === 'capturing' && (<><span className="dot" /> {meta.autoMemo ? t('ext.stateCapturingAuto') : t('ext.stateCapturing')}</>)}
          {state === 'paused' && (<><span className="dot paused" /> {t('ext.statePaused')}</>)}
          {state === 'saving' && t('ext.stateSaving')}
          {state === 'draft' && t('ext.stateDraft')}
        </span>
        <button className="head-ic" aria-label={t('ext.bell')} title={t('ext.bell')} onClick={onBell}>
          <BellIcon />
          {unread > 0 && <span className="head-dot" role="img" aria-label={t('ext.bellNew')} />}
        </button>
        <button className="head-ic" aria-label={t('ext.settings')} title={t('ext.settings')} onClick={onSettings}>
          <GearIcon />
        </button>
      </div>
    </div>
  )
}

/** VOX-09/AUTO: نصّا زر الميك حسب الوضع — التلميح يشرح والإعلان يختصر، فدالة واحدة بدل سلكي ثلاثية متوازية في JSX */
function micCopy(autoMemo: boolean, memoLive: SessionMeta['memoLive'], stepCount: number): { title: string; label: string } {
  if (autoMemo) {
    return memoLive
      ? { title: t('ext.autoMemoOnTitle'), label: t('ext.autoMemoOnLabel') }
      : { title: t('ext.autoMemoOffTitle'), label: t('ext.autoMemoOffLabel') }
  }
  if (memoLive) return { title: t('ext.memoStopTitle'), label: t('ext.memoStopLabel') }
  if (stepCount === 0) return { title: t('ext.memoNoStep'), label: t('ext.memoNoStep') }
  return { title: t('ext.memoRecordTitle'), label: t('ext.memoRecordLabel') }
}

export function CaptureBar({
  paused,
  blurOn,
  toggleBlur,
  cancelArmed,
  cancelLeft,
  onCancelPress,
  memoLive,
  autoMemo,
  stepCount,
  memoDenied,
  onMemoPress,
  onFinishPress,
  send,
}: {
  paused: boolean
  blurOn: boolean
  toggleBlur: () => void
  cancelArmed: boolean
  /** المرحلة ٤: ثوانٍ التسليح المتبقية — تُرى على الزر */
  cancelLeft: number
  onCancelPress: () => void
  memoLive: SessionMeta['memoLive']
  autoMemo: boolean
  stepCount: number
  memoDenied: boolean
  onMemoPress: () => void
  /** المرحلة ٣: الإنهاء يمر باللوحة أولًا — سطر الاسم الاختياري قبل النشر */
  onFinishPress: () => void
  send: (t: SendMsg) => void
}) {
  const mic = micCopy(autoMemo, memoLive, stepCount)
  return (
    <div className="capbar">
      <div className="capbar-tools">
        {paused ? (
          <button className="tool" title={t('ext.resumeTitle')} aria-label={t('ext.resumeTitle')} onClick={() => send('resume')}>
            <PlayIcon /> {t('ext.resume')}
          </button>
        ) : (
          <button className="tool" title={t('ext.pauseTitle')} aria-label={t('ext.pauseTitle')} onClick={() => send('pause')}>
            <PauseIcon /> {t('ext.pause')}
          </button>
        )}
        <button
          className={`tool ${blurOn ? 'on' : ''}`}
          title={t('ext.blurTitle')}
          aria-label={t('ext.blurAria')}
          aria-pressed={blurOn}
          disabled={paused}
          onClick={toggleBlur}
        >
          <BlurIcon /> {t('ext.blur')}
        </button>
        {/* VOX-09/AUTO: الميك يدوي في الوضع العادي (يتوقف ذاتًا عند بطاقة جديدة)،
            وفي الوضع التلقائي مفتاح إيقاف/تشغيل التعليق التلقائي كله */}
        <button
          className={`tool mic-tool${memoLive ? ' live' : ''}`}
          title={mic.title}
          aria-label={mic.label}
          disabled={paused || memoDenied || (!autoMemo && stepCount === 0)}
          onClick={onMemoPress}
        >
          <MicIcon /> {memoLive ? t('ext.micLive') : autoMemo ? t('ext.micAuto') : t('ext.mic')} {memoLive && <MemoTimer startedAt={memoLive.startedAt} />}
        </button>
        <button
          className={`tool danger${cancelArmed ? ' armed' : ''}`}
          title={cancelArmed ? `${t('ext.cancelArmed')} (${toArabicDigits(cancelLeft)})` : t('ext.cancelTitle')}
          aria-label={cancelArmed ? t('ext.cancelArmed') : t('ext.cancelTitle')}
          onClick={onCancelPress}
        >
          <TrashIcon /> {cancelArmed ? `${t('ext.confirmCancel')} (${toArabicDigits(cancelLeft)})` : t('ext.cancel')}
        </button>
      </div>
      <button className="cap-finish" aria-label={t('ext.finishAria')} onClick={onFinishPress}>
        <CheckIcon /> {t('ext.finish')}
      </button>
    </div>
  )
}

/** VOX-09: مؤقت التعليق الجاري — عرض فقط (setInterval مسموح لعرض الزمن الجاري) */
export function MemoTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <span className="memo-timer">
      {toArabicDigits(Math.floor(s / 60))}:{toArabicDigits(s % 60).padStart(2, i18nLocale() === 'en' ? '0' : '٠')}
    </span>
  )
}

/** VOX-09: نص شارة التعليق — «١٢ ث» */
export function voiceBadgeAr(durationMs: number): string {
  return t('ext.secShort', { count: toArabicDigits(Math.round(durationMs / 1000)) })
}

export function kindLabel(kind: StepSummary['kind']): string {
  switch (kind) {
    case 'click': return t('ext.kindClick')
    case 'input': return t('ext.kindInput')
    case 'select': return t('ext.kindSelect')
    case 'toggle': return t('ext.kindToggle')
    case 'navigate': return t('ext.kindNavigate')
    case 'keypress': return t('ext.kindKeypress')
  }
}
