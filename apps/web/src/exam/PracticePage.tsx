import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { ExamQuestionPublicDto, ExamStateDto, PracticeFeedbackDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { StateView } from '../ui/StateView'
import { IconCheck, IconRetry, IconTarget } from '../ui/icons'
import { domainLabel } from './domainLabel'
import './exam.css'

/**
 * EXAM: التدريب اليومي — حلقة العادة (إشارة: حلقة النقاط، روتين: أجب فورًا بنقرة
 * واحدة، مكافأة: تغذية راجعة فورية + احتفال رصيد الاختبار كل 100 نقطة).
 * النقر على الخيار = إجابة فورية (التدريب بلا رهان؛ الخطأ هنا موقع التعلّم).
 */
export function PracticePage() {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const focus: 'weak' | 'random' = sp.get('focus') === 'weak' ? 'weak' : 'random'

  const [question, setQuestion] = useState<ExamQuestionPublicDto | null>(null)
  const [state, setState] = useState<ExamStateDto | null>(null)
  const [feedback, setFeedback] = useState<PracticeFeedbackDto | null>(null)
  const [choice, setChoice] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  const load = useCallback(
    (focusMode: 'weak' | 'random') => {
      setLoadError(false)
      setQuestion(null)
      setFeedback(null)
      setChoice(null)
      client
        .practiceQuestion(focusMode)
        .then((r) => {
          setQuestion(r.question)
          setState(r.state)
        })
        .catch(() => setLoadError(true))
    },
    [],
  )

  useEffect(() => {
    load(focus)
  }, [load, focus])

  async function answer(i: number) {
    if (!question || feedback || busy) return
    setBusy(true)
    setChoice(i)
    try {
      const fb = await client.practiceAnswer({ questionId: question.id, choice: i })
      setFeedback(fb)
      setState(fb.state)
      setCelebrate(fb.creditJustEarned)
    } catch {
      setChoice(null)
    } finally {
      setBusy(false)
    }
  }

  function next() {
    load(focus)
  }

  function toggleFocus() {
    // تبديل الوضع عبر معامل الرابط — useEffect على focus يعيد الجلب بنفسه
    setSp(focus === 'weak' ? {} : { focus: 'weak' })
  }

  // اختصارات: 1-4 للإجابة الفورية، Enter/مسافة للسؤال التالي — احتكاك أقل للسلوك المرغوب
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!feedback && question && e.key >= '1' && e.key <= String(question.options.length)) {
        void answer(Number(e.key) - 1)
      } else if (feedback && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        next()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, question, busy])

  const answered = state?.answeredTotal ?? 0
  const pointsInCycle = state ? 100 - state.pointsToNextCredit : 0
  const accuracy = answered > 0 && state ? Math.round((state.correctTotal / answered) * 100) : null

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('practice.title')}</h1>
        <p className="exam-muted">{t('practice.subtitle')}</p>
      </header>

      {celebrate && (
        <div className="practice-celebrate" role="status">
          <strong>{t('practice.creditJustEarned')}</strong>
          <Button size="sm" onClick={() => navigate('/exam')}>
            {t('practice.goExam')}
          </Button>
        </div>
      )}

      <div className="practice-stats">
        <div className="practice-stat">
          <div className="exam-muted">{t('practice.pointsToward')}</div>
          <div className="ps-value">
            {arDigits(pointsInCycle)} / {arDigits(100)}
          </div>
          <div className="points-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pointsInCycle}>
            <div style={{ width: `${pointsInCycle}%` }} />
          </div>
        </div>
        <div className="practice-stat">
          <div className="exam-muted">{t('practice.creditsReady')}</div>
          <div className="ps-value">{arDigits(state?.creditsAvailable ?? 0)}</div>
          <div className="ps-hint">
            <Link to="/exam">{t('practice.goExam')}</Link>
          </div>
        </div>
        <div className="practice-stat">
          <div className="exam-muted">{t('practice.streakLabel')}</div>
          <div className="ps-value">{arDigits(state?.streak ?? 0)}</div>
          <div className="ps-hint">
            {state ? t('practice.answered', { count: arDigits(answered) }) : ''}
            {accuracy !== null ? ` · ${t('practice.accuracy', { pct: arDigits(accuracy) })}` : ''}
          </div>
        </div>
      </div>

      <div className="exam-chip-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <button className={`exam-chip${focus === 'random' ? ' ok' : ''}`} onClick={toggleFocus} disabled={busy}>
          <IconTarget size={14} />
          {focus === 'weak' ? t('practice.focusRandom') : t('practice.focusWeak')}
        </button>
        <span className="exam-muted">{t('practice.keyboardHint')}</span>
      </div>

      {loadError ? (
        <StateView
          kind="error"
          icon={<IconRetry size={28} />}
          title={t('practice.loadError')}
          action={{ label: t('common.retry'), onAction: () => load(focus) }}
        />
      ) : !question ? (
        <div className="exam-card">
          <Skeleton />
          <br />
          <br />
          <Skeleton />
        </div>
      ) : (
        <div className="exam-card exam-question-card">
          <div className="exam-chip-row">
            <span className="exam-chip">{domainLabel(question.domain)}</span>
          </div>
          <p className="q-stem">{question.stem}</p>
          <div className="q-options">
            {question.options.map((opt, i) => {
              const cls = [
                'q-option',
                feedback ? (i === feedback.answerIndex ? ' correct' : i === choice ? ' wrong' : '') : '',
              ]
              return (
                <button
                  key={i}
                  className={cls.join(' ').trim()}
                  disabled={Boolean(feedback) || busy}
                  onClick={() => answer(i)}
                >
                  <span className="q-letter">{String.fromCharCode(65 + i)}.</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>

          {feedback && (
            <div className={`practice-feedback ${feedback.correct ? 'ok' : 'wrong'}`} role="status">
              <p className="pf-title">
                {feedback.correct ? <IconCheck size={16} /> : null}
                {feedback.correct ? t('practice.correct') : t('practice.wrong')}
              </p>
              <p className="pf-explanation">{feedback.explanationAr}</p>
            </div>
          )}

          <div className="exam-nav">
            <span className="exam-muted">{feedback ? t('practice.nextHint') : ''}</span>
            {feedback && (
              <Button onClick={next} icon={<IconCheck size={16} />}>
                {t('practice.next')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
