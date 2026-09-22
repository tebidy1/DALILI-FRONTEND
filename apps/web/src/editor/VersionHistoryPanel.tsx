import { useEffect, useState } from 'react'
import type { VersionSummaryDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { fmtDateTime, fmtDigits, relativeTimeAr } from '../lib/format'

interface Props {
  guideId: string
  onPick: (versionId: string) => void
  onClose: () => void
}

type Load = { kind: 'loading' } | { kind: 'ok'; items: VersionSummaryDto[] } | { kind: 'err' }

/**
 * VER-01: قائمة السجل الزمنية — من الأحدث للأقدم. الصفّ الأعلى يحمل شارة «الحالي»
 * ويكون معطّل النقر (لا شيء يفتح، أنت تراه بالفعل).
 */
export function VersionHistoryPanel({ guideId, onPick }: Props) {
  const [state, setState] = useState<Load>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    client.listVersions(guideId).then(
      (r) => { if (!cancelled) setState({ kind: 'ok', items: r.items }) },
      () => { if (!cancelled) setState({ kind: 'err' }) },
    )
    return () => { cancelled = true }
  }, [guideId])

  if (state.kind === 'loading') {
    return (
      <div className="version-panel">
        <div className="version-skel" />
      </div>
    )
  }
  if (state.kind === 'err') {
    return <div className="version-panel">{t('editor.versions.loadError')}</div>
  }
  if (state.items.length === 0) {
    return <div className="version-panel">{t('editor.versions.empty')}</div>
  }

  return (
    <div className="version-panel">
      <h3 className="version-panel-title">{t('editor.versions.title')}</h3>
      <ul className="version-list">
        {state.items.map((v, i) => {
          const isCurrent = i === 0
          const abs = fmtDateTime(v.createdAt)
          return (
            <li key={v.id}>
              <button
                type="button"
                className={`version-row${isCurrent ? ' is-current' : ''}`}
                disabled={isCurrent}
                onClick={() => onPick(v.id)}
              >
                <div className="version-row-main">
                  <span className="version-row-rel">{relativeTimeAr(v.createdAt)}</span>
                  {isCurrent && (
                    <span className="version-row-badge">{t('editor.versions.current')}</span>
                  )}
                </div>
                <div className="version-row-sub">
                  <span>{abs}</span>
                  <span>·</span>
                  <span>{t('editor.versions.stepsCount', { count: fmtDigits(v.stepCount) })}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
