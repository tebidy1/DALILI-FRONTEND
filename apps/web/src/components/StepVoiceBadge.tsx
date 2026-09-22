import { useRef, useState } from 'react'
import type { StepVoiceDto } from '@dalili/shared'
import { t } from '../i18n'
import { fmtDigits } from '../lib/format'
import { client } from '../api'
import { IconPause, IconPlay } from '../ui/icons'

/**
 * VOX-09 «ميك الخطوة»: شارة 🎙 على بطاقة الخطوة في المحرر والعارض.
 * ▶ يعزف ملف الخطوة نفسه (أولوية على مسار الدليل الصوتي إن وجدا معًا)،
 * والنص المفرَّغ يظهر تلقائيًا لأنه صار ملاحظة الخطوة — لا واجهة إضافية للنص.
 * التعليق المعلق (فشل رفعه أو تفريغه) يعرض زر إعادة صادقًا ولا يفقد الصوت أبدًا.
 */
export function StepVoiceBadge({
  voice,
  guideId,
  canRetry = false,
  onTranscribed,
}: {
  voice: StepVoiceDto
  guideId: string
  /** المالك وحده يعيد التفريغ — الزائر في العارض العام يرى لافتة صادقة بلا زر */
  canRetry?: boolean
  onTranscribed?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [failed, setFailed] = useState(false)
  /** خطأ الخادم لكل خطوة (كالملف المفقود) — لا زر صامت أبدًا (بلاغ المالك 2026-09-04) */
  const [serverError, setServerError] = useState('')
  const secs = Math.round(voice.durationMs / 1000)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false))
    }
  }

  async function retry() {
    setRetrying(true)
    setFailed(false)
    setServerError('')
    try {
      const res = await client.transcribeSteps(guideId)
      const bad = res.results.find((r) => !r.ok)
      if (bad) {
        setServerError(bad.errorAr ?? t('voice.retryFailed'))
        return
      }
      onTranscribed?.()
    } catch {
      setFailed(true)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <span className="step-voice no-print">
      {voice.fileId && (
        <>
          <audio
            ref={audioRef}
            preload="none"
            src={voice.fileUrl ?? `/files/${voice.fileId}`}
            onEnded={() => setPlaying(false)}
          />
          <button
            className="step-voice-play"
            type="button"
            onClick={toggle}
            aria-label={playing ? t('voice.pauseA11y') : t('voice.playA11y')}
            title={playing ? t('voice.pauseA11y') : t('voice.playA11y')}
          >
            {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
          </button>
        </>
      )}
      <span className="step-voice-dur">{t('fmt.secondsShort', { count: fmtDigits(secs) })}</span>
      {voice.pending && (
        <span className="step-voice-pending">
          <span>{t('voice.pending')}</span>
          {canRetry && (
            <button className="icon-btn" type="button" onClick={() => void retry()} disabled={retrying}>
              {retrying ? t('voice.retrying') : t('voice.retry')}
            </button>
          )}
          {canRetry && failed && <span className="step-voice-err">{t('voice.retryFailed')}</span>}
          {canRetry && serverError && <span className="step-voice-err">{serverError}</span>}
        </span>
      )}
    </span>
  )
}
