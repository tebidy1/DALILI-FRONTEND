import { Link } from 'react-router-dom'
import type { SemanticHitDto } from '@dalili/shared'
import { hijriDateAr } from '../lib/format'
import { t } from '../i18n'

/**
 * SRCH-06: قسم «أقرب الأدلة معنًى» — قائمة عناوين أدلة مرتبة من الأقرب معنىً
 * يختار منها المستخدم (قرار المالك 2026-09-01). سبب التعذّر يُعرض صادقًا ولا يُخفى.
 */
export function SemanticSection({ hits, reason }: { hits: SemanticHitDto[]; reason?: string }) {
  if (hits.length === 0 && !reason) return null
  return (
    <section className="semantic-section" aria-label={t('search.semanticTitle')}>
      <h2>{t('search.semanticTitle')}</h2>
      <p className="muted semantic-hint">{t('search.semanticHint')}</p>
      {hits.length > 0 ? (
        <ol className="semantic-list">
          {hits.map((h) => (
            <li key={h.guideId}>
              <Link className="semantic-hit" to={`/g/${h.guideId}`}>
                <bdi>{h.guideTitle}</bdi>
                <span className="muted">{hijriDateAr(h.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        reason && <p className="semantic-reason">{reason}</p>
      )}
    </section>
  )
}
