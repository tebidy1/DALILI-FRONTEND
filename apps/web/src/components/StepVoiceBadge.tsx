import { useRef, useState } from 'react'
import type { StepVoiceDto } from '@dalili/shared'
import { t } from '../i18n'
import { fmtDigits } from '../lib/format'
import { client } from '../api'
import { IconPause, IconPlay } from '../ui/icons'

/** مشغّل واحد يعزف في الصفحة — تشغيل شرح خطوة يوقف شرح غيرها (لا صوتان معًا) */
let activeAudio: HTMLAudioElement | null = null

const WAVE_BARS = [0, 1, 2, 3, 4]

/**
 * VOX-09/VOX-10 «ميك الخطوة»: مشغّل الشرح الصوتي المسجَّل على اللقطة — في المحرر والعارض.
 *
 * طلب المالك 2026-10-02: كان مثلثًا صغيرًا داخل رأس البطاقة لا يُلاحَظ. صار زرًّا ظاهرًا
 * بنصّه («استمع للشرح») في صفٍّ فوق اللقطة، وبحركة أثناء التشغيل: قرص ينبض، موجة
 * تتراقص، والزر يمتلئ بمقدار ما عُزف (`--p` من ٠ إلى ١).
 *
 * ▶ يعزف ملف الخطوة نفسه (أولوية على مسار الدليل الصوتي إن وجدا معًا)، والنص المفرَّغ
 * يظهر تلقائيًا لأنه صار ملاحظة الخطوة. التعليق المعلق (فشل رفعه أو تفريغه) يعرض زر
 * إعادة صادقًا ولا يفقد الصوت أبدًا.
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
  const [progress, setProgress] = useState(0)
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
      return
    }
    if (activeAudio && activeAudio !== el) activeAudio.pause()
    activeAudio = el
    el.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }

  /** تسجيلات webm قد لا تعلن مدتها (Infinity/NaN) — مدة الخطوة المخزَّنة هي المرجع حينها */
  function onTimeUpdate() {
    const el = audioRef.current
    if (!el) return
    const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : voice.durationMs / 1000
    setProgress(total > 0 ? Math.min(1, el.currentTime / total) : 0)
  }

  function onEnded() {
    setPlaying(false)
    setProgress(0)
    if (activeAudio === audioRef.current) activeAudio = null
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

  const dur = <span className="step-voice-dur">{t('fmt.secondsShort', { count: fmtDigits(secs) })}</span>

  return (
    <div
      className={`step-voice no-print${playing ? ' is-playing' : ''}`}
      style={{ '--p': String(progress) } as React.CSSProperties}
    >
      {voice.fileId ? (
        <>
          <audio
            ref={audioRef}
            preload="none"
            src={voice.fileUrl ?? `/files/${voice.fileId}`}
            onTimeUpdate={onTimeUpdate}
            onPause={() => setPlaying(false)}
            onEnded={onEnded}
          />
          <button
            className="step-voice-play"
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            aria-label={playing ? t('voice.pauseA11y') : t('voice.playA11y')}
            title={playing ? t('voice.pauseA11y') : t('voice.playA11y')}
          >
            <span className="step-voice-disc">{playing ? <IconPause size={15} /> : <IconPlay size={15} />}</span>
            <span className="step-voice-label">{playing ? t('voice.stop') : t('voice.listen')}</span>
            <span className="step-voice-wave" aria-hidden="true">
              {WAVE_BARS.map((i) => (
                <i key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </span>
            {dur}
          </button>
        </>
      ) : (
        dur
      )}
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
    </div>
  )
}
