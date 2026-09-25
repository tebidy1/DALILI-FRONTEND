import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { extractCapturedSites, nearestStepIndexAt, stepAudioMs, stepAudioRanges, stepNumbers } from '@dalili/core'
import type { PublicGuideDto, StepCommentDto, StepDto, TranslationOverlay } from '@dalili/shared'
import { translationOverlay } from '@dalili/shared'
import { client } from '../api'
import { getLocale } from '../lib/locale'
import { StepImage } from '../components/StepImage'
import { GuideComments } from '../components/GuideComments'
import { StepVoiceBadge } from '../components/StepVoiceBadge'
import { guideMarkColor } from '../components/EmbeddedSteps'
import { ViewerBooklet } from './ViewerBooklet'
import { SkeletonScreen } from '../ui/Skeleton'
import { StateView } from '../ui/StateView'
import { IconCloudOff, IconExternalLink, IconPause, IconPlay } from '../ui/icons'
import { t } from '../i18n'
import { needsVirtualScrolling } from '../lib/virtual-list'
import { shotOf } from '../lib/format'
import { useReloadSeq } from '../lib/reload-seq'
import { TrainButton } from './TrainButton'
import { ViewerShare } from './ViewerShare'

/** BLK-01: كتلة نداء/هيدر في العارض — نص فقط، سماوي/برتقالي، بلا رقم. مشترك بين نسختَي العرض والتضمين */
function ViewerBlock({ step, ov }: { step: StepDto; ov?: TranslationOverlay | null }) {
  const title = ov ? ov.stepText(step.id, 'title', step.title) : step.title
  const note = ov ? ov.stepText(step.id, 'note', step.note ?? '') : step.note
  if (step.block === 'header')
    return (
      <h2 className="viewer-section" dir="rtl">
        <bdi>{title}</bdi>
      </h2>
    )
  return (
    <aside className={`viewer-callout ${step.block}`}>
      <strong dir="rtl">
        <bdi>{title}</bdi>
      </strong>
      {note && (
        <p dir="auto">
          <bdi>{note}</bdi>
        </p>
      )}
    </aside>
  )
}

/**
 * لقطة الخطوة في العارض — النسختان الكاملة والتضمين تتشاركانها فلا تفرّق أنماطهما أبدًا.
 * طلب المالك 2026-09-11: الترقيم على اللقطة يظهر في العارض المُشارَك دائمًا (لا في
 * المحرر وحده) — `autoNumber` يمرّر رقم الخطوة الحقيقي فترسم `StepImage` السهم نحو
 * الهدف، أو رقمًا عاريًا في الركن للخطوة بلا هدف (كفتح الموقع).
 */
function StepShot({ s, autoNumber, color }: { s: StepDto; autoNumber?: number | null; color?: string }) {
  const shot = shotOf(s)
  return shot ? (
    <StepImage
      src={shot.fileUrl ?? `/files/${shot.fileId}`}
      blurRects={shot.blurRects}
      crop={shot.crop}
      annotations={shot.annotations}
      mark={shot.mark}
      autoNumber={autoNumber ?? undefined}
      color={color}
      mode="view"
      alt={s.alt ?? s.title}
      lazy
    />
  ) : (
    <div className="missing-shot">{t('viewer.missingShot')}</div>
  )
}

/** ٣و (قرار المالك 2026-09-17): خطوة الانتقال بين النوافذ شريط فاصل رفيع بين
 *  البطاقات — بلا مساحة صورة إطلاقًا (لا لقطة لها بحكم التصميم، فلا يظهر
 *  «لا توجد لقطة» وكأنه فشل التقاط)، ورقمها شارة مصغّرة تُحفظ بالتسلسل.
 *  `current`/`stepRef` للنسخة الكاملة كي يصلها تمييز الصوت والتمرير كالخطوات. */
function ViewerNavigate({
  step,
  n,
  current = false,
  stepRef,
  ov,
}: {
  step: StepDto
  n?: number | null
  current?: boolean
  stepRef?: (el: HTMLDivElement | null) => void
  ov?: TranslationOverlay | null
}) {
  const title = ov ? ov.stepText(step.id, 'title', step.title) : step.title
  return (
    <div
      className={`viewer-navigate${current ? ' current' : ''}`}
      ref={stepRef}
      data-current={current ? 'true' : undefined}
      dir="rtl"
    >
      <span className="viewer-navigate-num">{n ?? ''}</span>
      <span className="viewer-navigate-title">
        <bdi>{title}</bdi>
      </span>
    </div>
  )
}

/** العارض العام — يفتح بلا حساب من رابط المشاركة، نظيف وقابل للطباعة. embed=true نسخة التضمين بلا قشرة */
export function ViewerPage({ embed = false }: { embed?: boolean }) {  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PublicGuideDto | null>(null)
  const [error, setError] = useState('')
  const [reloadSeq, bumpReload] = useReloadSeq()
  // GM-05: تعليقات الضيف — تُجلب جنبًا إلى جنب، وفشلها لا يُسقط الدليل
  const [comments, setComments] = useState<StepCommentDto[]>([])
  const [commentsFailed, setCommentsFailed] = useState(false)
  // VOX-03 موزّعًا: مشغل لكل خطوة — عنصر صوت واحد مشترك بلا واجهة، والأزرار في الخطوات
  const audioRef = useRef<HTMLAudioElement>(null)
  const stepEls = useRef<Array<HTMLDivElement | null>>([])
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(-1)

  const retry = useCallback(() => {
    setError('')
    setData(null)
    bumpReload()
  }, [])

  useEffect(() => {
    if (!token) return
    const ac = new AbortController()
    client
      .publicGuide(token, ac.signal)
      .then((d) => {
        setData(d)
        // VIEW-06: عدّاد مجمّع مجهول — عدّاد واحد بعد تحميل ناجح، لا تعقّب أفراد
        void client.trackShareView(token).catch(() => {})
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(t('viewer.goneTitle'))
      })
    return () => ac.abort()
  }, [token, reloadSeq])

  /** GM-05: خيوط الخطوات من رابط المشاركة نفسه — قناة مستقلة كي لا تعطّل فتح الدليل */
  useEffect(() => {
    if (!token) return
    const ac = new AbortController()
    setCommentsFailed(false)
    client
      .shareComments(token, ac.signal)
      .then((d) => setComments(d.comments))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setCommentsFailed(true)
      })
    return () => ac.abort()
  }, [token, reloadSeq])

  async function addComment(body: string, opts: { kind: 'issue' | 'note'; parentId?: string; author?: string }) {
    if (!token) return
    const { comment } = await client.addShareComment(token, {
      kind: opts.kind,
      body,
      parentId: opts.parentId,
      author: opts.author,
    })
    setComments((cs) => [...cs, comment])
  }

  // VIEW-13: روابط المشاركة ليست عامة للعالم — لا فهرسة (تتكامل مع ترويسة SEC-02 الخادمية)
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const audio = data?.guide.audio

  /** دربني: الدليل قابل للتدريب إن حملت أي خطوة بطاقة تعريف (AUTO-01) — الأدلة الأقدم عرض فقط */
  const trainable = useMemo(
    () => !!data && data.guide.steps.some((s) => (s.target?.anchor?.length ?? 0) > 0),
    [data],
  )

  /** زمن كل خطوة داخل مسار الصوت — بعد خصم فترات الإيقاف المؤقت */
  const stepTimes = useMemo(() => {
    if (!audio || !data) return []
    return data.guide.steps.map((s) =>
      stepAudioMs(audio.startedAt, s.ts, audio.durationMs, audio.pauses ?? []),
    )
  }, [data, audio])

  /** نطاق كل خطوة — حدود المنتصفات نفسها التي يوزّع بها النص، فما تقرأه هو ما تسمعه */
  const ranges = useMemo(() => (audio ? stepAudioRanges(stepTimes, audio.durationMs) : []), [stepTimes, audio])

  /** timeupdate: إيقاف تلقائي عند نهاية نطاق الخطوة، وإلا تحديد الخطوة الحالية بأقرب فعل */
  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    const tMs = el.currentTime * 1000
    const playingRange = playing >= 0 ? ranges[playing] : undefined
    if (playingRange && tMs >= playingRange.endMs) {
      el.pause()
      setPlaying(-1)
      setCurrent((prev) => (prev === playing ? prev : playing))
      return
    }
    const idx = nearestStepIndexAt(stepTimes, tMs)
    setCurrent((prev) => (prev === idx ? prev : idx))
  }, [stepTimes, ranges, playing])

  /** التمرير التلقائي يحدث عند تغيّر الخطوة الحالية فقط — لا عند كل إطار صوتي */
  useEffect(() => {
    if (current >= 0) stepEls.current[current]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [current])

  /** زر خطوة: يشغّل كلام خطوتها من بداية نطاقها، وثانية يوقف */
  const toggleStepAudio = useCallback(
    (i: number) => {
      const el = audioRef.current
      const r = ranges[i]
      if (!el || !r || r.endMs <= r.startMs) return
      if (playing === i) {
        el.pause()
        setPlaying(-1)
        return
      }
      el.currentTime = r.startMs / 1000
      void el.play()?.catch(() => {})
      setPlaying(i)
      setCurrent(i)
    },
    [ranges, playing],
  )

  if (error) {
    return (
      <div className="page">
        <StateView
          kind="error"
          icon={<IconCloudOff size={30} />}
          title={t('viewer.goneTitle')}
          desc={t('viewer.goneDesc')}
          action={{ label: t('common.retry'), onAction: retry }}
        />
      </div>
    )
  }
  if (!data) return <SkeletonScreen steps={3} />

  const { guide } = data
  // PERF-03: كسل التمرير للأدلة الطويلة — قرار واحد للصفحة كلها
  const virtual = needsVirtualScrolling(guide.steps.length)
  // TRNS-01: تراكب الترجمة — قارئ التطبيق الإنجليزي يرى الإنجليزية إن وُجدت طبقتها
  const ov = translationOverlay(guide, getLocale())

  // VIEW-04: نسخة التضمين — عنوان نحيل بلا أزرار/طباعة/مشغل، جاهزة داخل iframe
  // مسيرا الخطوات (المضمّن والكامل) يشاركان البنية لا شكل البطاقة — شكل العارض قرار مالك،
  // والتوحيد الممكن هو المشي لا البطاقات (فحص 2026-09-21).
  if (embed) {
    const embedNums = stepNumbers(guide.steps)
    const embedMarkColor = guideMarkColor(guide.steps)
    return (
      <div className={`page embed-page${virtual ? ' cv-steps' : ''}`} dir={ov ? 'ltr' : undefined}>
        <h1 className="embed-title">
          <bdi>{ov ? ov.guideTitle : guide.title}</bdi>
        </h1>
        {/* BKL-01: توجيه الكرّاسة */}
        {guide.kind === 'booklet' && <ViewerBooklet guide={guide} embeds={data.embeds ?? {}} />}
        {guide.kind !== 'booklet' && guide.steps.map((s, i) => {
          if (s.block) return <ViewerBlock key={s.id} step={s} ov={ov} />
          if (s.kind === 'navigate') return <ViewerNavigate key={s.id} step={s} n={embedNums[i]} ov={ov} />
          return (
            <div className="viewer-step" key={s.id}>
              <h2>
                {embedNums[i]}. <bdi>{ov ? ov.stepText(s.id, 'title', s.title) : s.title}</bdi>
              </h2>
              {s.note && (
                <p className="muted viewer-note">
                  <bdi>{ov ? ov.stepText(s.id, 'note', s.note) : s.note}</bdi>
                </p>
              )}
              <StepShot s={s} autoNumber={embedNums[i]} color={embedMarkColor} />
            </div>
          )
        })}
      </div>
    )
  }

  const nums = stepNumbers(guide.steps)
  const markColor = guideMarkColor(guide.steps)
  const capturedSites = extractCapturedSites(guide.steps)

  return (
    <div className={`viewer-layout${virtual ? ' cv-steps' : ''}`}>
      {/* شريط ترويسة علوي ممتد بكامل العرض */}
      <div className="viewer-bar no-print">
        <div className="viewer-bar-start">
          <span className="viewer-brand-name" dir="rtl">
            {t('app.name')}
          </span>
        </div>
        <div className="viewer-bar-end">
          {trainable && <TrainButton token={token!} />}
          <ViewerShare title={guide.title} />
          <button className="btn ghost" onClick={() => window.print()}>
            {t('common.print')}
          </button>
        </div>
      </div>

      <div className={`page viewer-page${guide.kind === 'booklet' ? ' booklet-page' : ''}${virtual ? ' cv-steps' : ''}`} dir={ov ? 'ltr' : undefined}>
        {/* هوية الدليل: العنوان + الوصف + شارة الترجمة الآلية + شارات المواقع */}
        <header className="guide-head viewer-guide-head">
          <h1 className="guide-title-read" dir={ov ? 'ltr' : 'rtl'}>
            <bdi>{ov ? ov.guideTitle : guide.title}</bdi>
            {ov && <span className="viewer-auto-badge">{t('viewer.badge.auto')}</span>}
          </h1>
          {guide.description && (
            <p className="guide-desc-read" dir="auto">
              <bdi>{ov ? ov.description ?? guide.description : guide.description}</bdi>
            </p>
          )}
          {capturedSites.length > 0 && (
            <div className="site-badges-row" aria-label={t('editor.capturedSites')}>
              {capturedSites.map((site) => (
                <span key={site.host} className="site-badge" title={site.host}>
                  <span className="site-badge-icon" style={{ backgroundColor: site.color }}>
                    {site.initial}
                  </span>
                  <span className="site-badge-name" dir="ltr">{site.name}</span>
                </span>
              ))}
            </div>
          )}
          {/* GM-05 تطوّر: التعليقات والمشكلات على مستوى الدليل أعلى الشاشة مع المعلومات */}
          <GuideComments
            comments={comments}
            canModerate={false}
            failed={commentsFailed}
            onRetry={bumpReload}
            onAdd={addComment}
          />
        </header>

        {/* VOX-03 موزّعًا (قرار المالك): عنصر الصوت مشترك خفي — أزرار الاستماع داخل الخطوات */}
        {audio && (
          <audio
            ref={audioRef}
            preload="metadata"
            src={audio.fileUrl ?? `/files/${audio.fileId}`}
            onTimeUpdate={onTimeUpdate}
            onEnded={() => setPlaying(-1)}
          />
        )}

        {/* BKL-01: توجيه الكرّاسة */}
        {guide.kind === 'booklet' && <ViewerBooklet guide={guide} embeds={data.embeds ?? {}} />}
        {guide.kind !== 'booklet' && guide.steps.map((s, i) => {
          if (s.block) return <ViewerBlock key={s.id} step={s} ov={ov} />
          if (s.kind === 'navigate')
            return (
              <ViewerNavigate
                key={s.id}
                step={s}
                n={nums[i]}
                current={current === i}
                ov={ov}
                stepRef={(el) => {
                  stepEls.current[i] = el
                }}
              />
            )
          return (
            <div
              className={`viewer-step${current === i ? ' current' : ''}`}
              key={s.id}
              ref={(el) => {
                stepEls.current[i] = el
              }}
              data-current={current === i ? 'true' : undefined}
            >
              <div className="viewer-step-head">
                {/* نمط سكرايب (طلب المالك 2026-09-15): الرقم شارة دائرية مستقلة يجاورها العنوان —
                    لا «2.» نصية داخل العنوان */}
                <span className="viewer-step-num">{nums[i]}</span>
                <h2>
                  <bdi>{ov ? ov.stepText(s.id, 'title', s.title) : s.title}</bdi>
                </h2>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="step-url-pill no-print"
                    title={s.url}
                  >
                    <span className="step-url-text" dir="ltr">{s.url}</span>
                    <IconExternalLink size={13} className="step-url-icon" />
                  </a>
                )}
                {/* VOX-09: شارة 🎙 تعليق الخطوة — أولوية على نطاق الصوت المستمر */}
                {s.voice && <StepVoiceBadge voice={s.voice} guideId={guide.id} />}
              </div>
              {s.note && (
                <p className="muted viewer-note">
                  <bdi>{ov ? ov.stepText(s.id, 'note', s.note) : s.note}</bdi>
                </p>
              )}
              {audio && !s.voice && ranges[i] && ranges[i]!.endMs > ranges[i]!.startMs && (
                <button className="step-audio no-print" onClick={() => toggleStepAudio(i)} type="button">
                  {playing === i ? <IconPause size={15} /> : <IconPlay size={15} />}
                  <span>{playing === i ? t('viewer.pauseStep') : t('viewer.playStep')}</span>
                </button>
              )}
              <StepShot s={s} autoNumber={nums[i]} color={markColor} />
            </div>
          )
        })}

        <footer className="muted no-print viewer-footer">{t('viewer.footer')}</footer>
      </div>
    </div>
  )
}

