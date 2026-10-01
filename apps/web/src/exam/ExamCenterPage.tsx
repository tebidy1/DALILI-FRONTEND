import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ExamBlueprintDto, ExamHistoryDto, ExamStateDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, hijriDateAr } from '../lib/format'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { StateView } from '../ui/StateView'
import { IconClock, IconList, IconPlay, IconRetry, IconTarget } from '../ui/icons'
import { domainLabel } from './domainLabel'
import { useConfirm } from '../components/ConfirmProvider'
import './exam.css'

/**
 * EXAM: مركز الاختبار الشامل — الهوية (الاسم الرسمي وصيغة OMSB)، القواعد، خريطة
 * البنك مقابل blueprint الرسمي (شفافية تبني الثقة والاستعداد الذهني)، ورصيد
 * المحاولات وسجلّها. البدء بفعلين: ابدأ → تأكيد (احتكاك مناسب يمنع خطأً مكلفًا).
 */
export function ExamCenterPage() {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [state, setState] = useState<ExamStateDto | null>(null)
  const [blueprint, setBlueprint] = useState<ExamBlueprintDto | null>(null)
  const [history, setHistory] = useState<ExamHistoryDto | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const load = useCallback(() => {
    setLoadError(false)
    Promise.all([client.examState(), client.examBlueprint(), client.examHistory()])
      .then(([s, b, h]) => {
        setState(s)
        setBlueprint(b)
        setHistory(h)
      })
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function startExam() {
    if (!(await confirm({ title: t('exam.confirmStartTitle'), body: t('exam.confirmStart'), confirmLabel: t('exam.start') }))) return
    setStarting(true)
    setStartError('')
    try {
      const r = await client.startExam()
      navigate(`/exam/run/${r.view.attempt.id}`)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : t('exam.startError'))
      setStarting(false)
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <StateView
          kind="error"
          icon={<IconRetry size={28} />}
          title={t('exam.loadError')}
          action={{ label: t('common.retry'), onAction: load }}
        />
      </div>
    )
  }
  if (!state || !blueprint) {
    return (
      <div className="page">
        <div className="exam-card">
          <Skeleton />
        </div>
      </div>
    )
  }

  const canStart = state.creditsAvailable >= 1 && !state.activeAttemptId

  return (
    <div className="page">
      <div className="center-hero">
        <h1>{t('exam.name')}</h1>
        <p className="exam-muted">{t('exam.subtitle')}</p>
        <div className="ch-format">
          <span className="exam-chip">
            <IconList size={14} />
            {t('exam.chipQuestions')}
          </span>
          <span className="exam-chip">
            <IconClock size={14} />
            {t('exam.chipDuration')}
          </span>
          <span className="exam-chip">
            <IconTarget size={14} />
            {t('exam.chipPace')}
          </span>
        </div>

        {state.activeAttemptId ? (
          <Button size="md" icon={<IconPlay size={16} />} onClick={() => navigate(`/exam/run/${state.activeAttemptId}`)}>
            {t('exam.resume')}
          </Button>
        ) : canStart ? (
          <Button size="md" icon={<IconPlay size={16} />} busy={starting} onClick={startExam}>
            {t('exam.start')}
          </Button>
        ) : (
          <div>
            <p className="exam-muted">
              {t('exam.pointsHint', {
                points: arDigits(100 - state.pointsToNextCredit),
              })}
            </p>
            <Link to="/practice">
              <Button size="md" icon={<IconTarget size={16} />}>
                {t('exam.goPractice')}
              </Button>
            </Link>
          </div>
        )}
        {startError && (
          <p className="exam-muted" role="alert">
            {startError}
          </p>
        )}
      </div>

      <div className="center-columns" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="exam-card">
          <h2>{t('exam.rules')}</h2>
          <ul className="center-rules">
            <li>{t('exam.rule1')}</li>
            <li>{t('exam.rule2')}</li>
            <li>{t('exam.rule3')}</li>
            <li>{t('exam.rule4')}</li>
            <li>{t('exam.rule5')}</li>
          </ul>
        </div>

        <div className="exam-card">
          <h2>{t('exam.blueprint')}</h2>
          <table className="domain-table">
            <thead>
              <tr>
                <th>{t('exam.thDomain')}</th>
                <th>{t('exam.thWeight')}</th>
                <th>{t('exam.thBank')}</th>
              </tr>
            </thead>
            <tbody>
              {blueprint.rows.map((r) => (
                <tr key={r.domain}>
                  <td>{domainLabel(r.domain)}</td>
                  <td>{arDigits(r.weight)}</td>
                  <td>{arDigits(r.bankCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="exam-card">
        <h2>{t('exam.history')}</h2>
        {!history || history.items.length === 0 ? (
          <p className="exam-muted">{t('exam.historyEmpty')}</p>
        ) : (
          <div>
            {history.items.map((a) => (
              <div className="history-row" key={a.id}>
                <span>{hijriDateAr(a.startedAt)}</span>
                <span className="history-score">
                  {t('exam.scoreOf', { score: arDigits(a.score ?? 0), total: arDigits(a.total) })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/exam/run/${a.id}`)}>
                  {t('exam.viewResult')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
