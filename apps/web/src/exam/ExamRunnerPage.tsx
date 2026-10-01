import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ExamResultViewDto, ExamRunViewDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, durationAr } from '../lib/format'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { StateView } from '../ui/StateView'
import { IconCheck, IconClock, IconList, IconRetry } from '../ui/icons'
import { domainLabel } from './domainLabel'
import { fmtClock, useExamCountdown } from './useExamCountdown'
import { useConfirm } from '../components/ConfirmProvider'
import './exam.css'

/**
 * EXAM: مشغّل الاختبار الشامل — محاكاة ظروف القاعة: خط زمني أعلى الشاشة (وقت
 * متبقٍّ + شريط مقسّم 100 جزء لحالة كل سؤال)، خريطة أسئلة للتنقل، تعليم للمراجعة،
 * حفظ تلقائي بعد كل إجابة، وتسليم آلي لحظة انقضاء الوقت. بعد التسليم الشاشة
 * نفسها تتحول للنتيجة والمراجعة (موقع القيمة التعليمية).
 */
export function ExamRunnerPage() {
  const { id = '' } = useParams()
  const [view, setView] = useState<ExamRunViewDto | ExamResultViewDto | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    setLoadError(false)
    setView(null)
    client
      .getExamAttempt(id)
      .then((r) => setView(r.view))
      .catch(() => setLoadError(true))
  }, [id])

  if (loadError) {
    return (
      <div className="exam-shell">
        <StateView kind="error" icon={<IconRetry size={28} />} title={t('exam.runner.notFound')} action={{ label: t('exam.result.backCenter'), onAction: () => history.back() }} />
      </div>
    )
  }
  if (!view) {
    return (
      <div className="exam-shell">
        <div className="exam-card">
          <Skeleton />
        </div>
      </div>
    )
  }
  return view.kind === 'run' ? <ExamRunner view={view} onView={setView} /> : <ExamResult result={view} />
}

function ExamRunner({ view, onView }: { view: ExamRunViewDto; onView: (v: ExamRunViewDto | ExamResultViewDto) => void }) {
  const confirm = useConfirm()
  const [index, setIndex] = useState(view.index)
  const [answers, setAnswers] = useState<Record<string, number>>(view.answers)
  const [flagged, setFlagged] = useState<Set<string>>(new Set(view.flagged))
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(false)

  const questions = view.questions
  const current = questions[index]
  const answeredCount = Object.keys(answers).length

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const r = await client.submitExam(view.attempt.id)
      onView(r.view)
    } catch {
      submittedRef.current = false
      setSubmitting(false)
    }
  }, [view.attempt.id, onView])

  // التسليم الآلي لحظة انقضاء الوقت — الخادم حاكم النهائي، هذا تحسين التجربة
  const secondsLeft = useExamCountdown(view.attempt.deadlineAt, () => void doSubmit())

  async function saveAnswer(questionId: string, choice: number | null) {
    setSaveError(false)
    setAnswers((prev) => {
      const next = { ...prev }
      if (choice === null) delete next[questionId]
      else next[questionId] = choice
      return next
    })
    try {
      await client.saveExamAnswer(view.attempt.id, { questionId, choice })
    } catch {
      setSaveError(true)
    }
  }

  async function toggleFlag(questionId: string) {
    const to = !flagged.has(questionId)
    setFlagged((prev) => {
      const next = new Set(prev)
      if (to) next.add(questionId)
      else next.delete(questionId)
      return next
    })
    try {
      await client.saveExamAnswer(view.attempt.id, { questionId, flagged: to })
    } catch {
      setSaveError(true)
    }
  }

  async function submit() {
    const unanswered = questions.length - answeredCount
    const body =
      unanswered > 0
        ? t('exam.runner.submitWarn', {
            unanswered: arDigits(unanswered),
            flagged: arDigits(flagged.size),
          })
        : t('exam.runner.submitClean')
    if (!(await confirm({ title: t('exam.runner.submitTitle'), body, confirmLabel: t('exam.runner.submitConfirm'), danger: true }))) return
    void doSubmit()
  }

  // اختصارات القاعة: أسهم التنقل وF للتعليم
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft' && index < questions.length - 1) setIndex((i) => i + 1)
      if (e.key === 'ArrowRight' && index > 0) setIndex((i) => i - 1)
      if (e.key.toLowerCase() === 'f' && current) void toggleFlag(current.id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, questions.length, current?.id])

  if (!current) {
    return (
      <div className="exam-shell">
        <StateView kind="error" icon={<IconList size={28} />} title={t('exam.runner.notFound')} />
      </div>
    )
  }

  const totalSec = 150 * 60
  const elapsedSec = totalSec - secondsLeft
  const expectedByNow = elapsedSec / 90 // الإيقاع المستهدف: 90 ثانية للسؤال
  const pace = answeredCount > expectedByNow + 2 ? 'ahead' : answeredCount < expectedByNow - 2 ? 'behind' : 'on'
  const timeTone = secondsLeft <= 300 ? 'critical' : secondsLeft <= 1800 ? 'warn' : ''

  return (
    <div className="exam-shell">
      <div className="exam-topbar">
        <div className="exam-topbar-row">
          <span className="exam-counter">
            {t('exam.runner.question', { n: arDigits(index + 1), total: arDigits(questions.length) })}
          </span>
          <div className="exam-progress" aria-hidden="true">
            {questions.map((q, i) => {
              const cls = [
                'seg',
                answers[q.id] !== undefined ? 'done' : flagged.has(q.id) ? 'flag' : '',
                i === index ? 'cur' : '',
              ]
              return <div key={q.id} className={cls.join(' ').trim()} />
            })}
          </div>
          <span className={`exam-time ${timeTone}`}>
            <IconClock size={16} />
            {fmtClock(secondsLeft)}
          </span>
          <Button size="sm" busy={submitting} onClick={submit}>
            {t('exam.runner.submit')}
          </Button>
        </div>
        <div className="exam-topbar-row" style={{ marginTop: 'var(--sp-1)' }}>
          <span className="exam-muted">
            {t('exam.runner.answered', { n: arDigits(answeredCount) })} · {t('exam.runner.flaggedCount', { n: arDigits(flagged.size) })}
          </span>
          <span className={`exam-pace ${pace}`} style={{ marginInlineStart: 'auto' }}>
            {t(`exam.runner.pace.${pace}` as const)}
          </span>
          <button className="exam-chip" onClick={() => setPaletteOpen((v) => !v)}>
            <IconList size={14} />
            {t('exam.runner.palette')}
          </button>
        </div>
        {saveError && (
          <p className="exam-pace behind" role="alert">
            {t('exam.runner.saveError')}
          </p>
        )}
      </div>

      {paletteOpen && (
        <div className="exam-palette">
          <div className="palette-grid">
            {questions.map((q, i) => {
              const cls = ['palette-cell', answers[q.id] !== undefined ? 'done' : '', flagged.has(q.id) ? 'flag' : '', i === index ? 'cur' : '']
              return (
                <button
                  key={q.id}
                  className={cls.join(' ').trim()}
                  aria-label={t('exam.runner.question', { n: arDigits(i + 1), total: arDigits(questions.length) })}
                  onClick={() => {
                    setIndex(i)
                    setPaletteOpen(false)
                  }}
                >
                  {arDigits(i + 1)}
                </button>
              )
            })}
          </div>
          <div className="palette-legend">
            <span>
              <i className="done" />
              {t('exam.legendAnswered')}
            </span>
            <span>
              <i className="flag" />
              {t('exam.legendFlagged')}
            </span>
            <span>
              <i />
              {t('exam.legendEmpty')}
            </span>
          </div>
        </div>
      )}

      <div className="exam-card exam-question-card">
        <div className="exam-chip-row">
          <button className={`exam-chip${flagged.has(current.id) ? ' amber' : ''}`} onClick={() => toggleFlag(current.id)}>
            {flagged.has(current.id) ? t('exam.runner.unflag') : t('exam.runner.flag')}
          </button>
        </div>
        <p className="q-stem">{current.stem}</p>
        <div className="q-options">
          {current.options.map((opt, i) => (
            <button
              key={i}
              className={`q-option${answers[current.id] === i ? ' sel' : ''}`}
              onClick={() => void saveAnswer(current.id, i)}
            >
              <span className="q-letter">{String.fromCharCode(65 + i)}.</span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
        <div className="exam-nav">
          <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            {t('exam.runner.prev')}
          </Button>
          <span className="exam-muted">
            {answers[current.id] !== undefined ? t('exam.legendAnswered') : t('exam.legendEmptyShort')}
          </span>
          {index < questions.length - 1 ? (
            <Button onClick={() => setIndex((i) => i + 1)}>{t('exam.runner.next')}</Button>
          ) : (
            <Button busy={submitting} onClick={submit}>
              {t('exam.runner.submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

type ResultFilter = 'all' | 'wrong' | 'flagged'

function ExamResult({ result }: { result: ExamResultViewDto }) {
  const [filter, setFilter] = useState<ResultFilter>('wrong')
  const pct = Math.round((result.score / result.total) * 100)
  const band = pct >= 70 ? 'great' : pct >= 50 ? 'good' : 'focus'
  const flagged = new Set(result.questions.filter((q) => q.correct === false && q.choice === null).map((q) => q.id))
  const weakDomains = [...result.perDomain].filter((d) => d.correct / d.total < 0.6).map((d) => d.domain)
  const sorted = [...result.perDomain].sort((a, b) => a.correct / a.total - b.correct / b.total)

  const filtered = result.questions.filter((q) => {
    if (filter === 'wrong') return !q.correct
    if (filter === 'flagged') return flagged.has(q.id)
    return true
  })

  return (
    <div className="exam-shell">
      <div className="exam-card result-hero">
        <h1>{t('exam.result.title')}</h1>
        <div className="result-score">
          {t('exam.result.pct', { pct: arDigits(pct) })}
        </div>
        <p className="result-band">
          {t('exam.result.score', { score: arDigits(result.score), total: arDigits(result.total) })} ·{' '}
          {t('exam.result.spent', { dur: durationAr(result.spentMs) })}
        </p>
        <p className="result-band">{t(`exam.result.band.${band}` as const)}</p>
        {weakDomains.length > 0 && (
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <Link to="/practice?focus=weak">
              <Button icon={<IconCheck size={16} />}>{t('exam.result.trainWeak')}</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="exam-card">
        <h2>{t('exam.result.domainBreakdown')}</h2>
        <table className="domain-table">
          <thead>
            <tr>
              <th>{t('exam.thDomain')}</th>
              <th>{t('exam.result.thScore')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const p = Math.round((d.correct / d.total) * 100)
              return (
                <tr key={d.domain}>
                  <td>{domainLabel(d.domain)}</td>
                  <td>
                    {arDigits(d.correct)}/{arDigits(d.total)}
                  </td>
                  <td style={{ width: '140px' }}>
                    <div className={`domain-bar${p < 60 ? ' weak' : ''}`}>
                      <div style={{ width: `${p}%` }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="exam-card">
        <h2>{t('exam.result.review')}</h2>
        <div className="result-filter">
          {(['wrong', 'flagged', 'all'] as const).map((f) => (
            <button key={f} className={`exam-chip${filter === f ? ' ok' : ''}`} onClick={() => setFilter(f)}>
              {t(`exam.filter.${f}` as const)}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="exam-muted">{t('exam.result.reviewEmpty')}</p>
        ) : (
          filtered.map((q, i) => (
            <div key={q.id} className={`review-item${q.correct ? '' : ' wrong-q'}`}>
              <div className="exam-chip-row" style={{ marginBottom: 'var(--sp-2)' }}>
                <span className="exam-chip">{domainLabel(q.domain)}</span>
                <span className="exam-chip">{t('exam.runner.questionShort', { n: arDigits(result.questions.indexOf(q) + 1) })}</span>
              </div>
              <p className="rv-stem">{q.stem}</p>
              <div className="review-options">
                {q.options.map((opt, oi) => {
                  const isCorrect = oi === q.answerIndex
                  const isChoice = oi === q.choice
                  const cls = ['review-option', isCorrect ? ' correct' : isChoice ? ' wrong' : '']
                  return (
                    <div key={oi} className={cls.join(' ').trim()}>
                      <span className="q-letter">{String.fromCharCode(65 + oi)}.</span> {opt}
                      {isCorrect ? ` — ${t('exam.result.correctAnswer')}` : isChoice ? ` — ${t('exam.result.yourAnswer')}` : ''}
                    </div>
                  )
                })}
                {q.choice === null && <span className="exam-muted">{t('exam.result.noAnswer')}</span>}
              </div>
              <div className="review-explanation">
                <p className="re-label">{t('exam.result.explanation')}</p>
                <p className="re-text">{q.explanationAr}</p>
              </div>
            </div>
          ))
        )}
        <div className="exam-nav">
          <Link to="/exam">
            <Button variant="ghost">{t('exam.result.backCenter')}</Button>
          </Link>
          <Link to="/practice?focus=weak">
            <Button icon={<IconCheck size={16} />}>{t('exam.result.trainWeak')}</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
