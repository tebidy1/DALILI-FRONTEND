import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { GuideVersionDetailsDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { IconArrowRight } from '../ui/icons'
import { fmtDateTime, relativeTimeAr } from '../lib/format'
import { ReadOnlyGuide } from './ReadOnlyGuide'

/**
 * VER-01: عرض نسخة قديمة من الدليل — قراءة فقط، بشريط علوي بديل يعلن
 * الوضع بوضوح («تعرض نسخة من … — عرض فقط») وزر رجوع للنسخة الحالية.
 * لا أدوات تحرير، لا مشاركة، لا أزرار «تعديل»/«أضف خطوات»/«المزيد» —
 * غياب هذه الأزرار هو نصف صدق الوضع (النصف الآخر هو أن حفظًا مؤجّلًا
 * لا يعمل أصلًا لأن الحالة `guide` غير قابلة للتعديل عبر أي مسار هنا).
 */

type Load =
  | { kind: 'loading' }
  | { kind: 'ok'; details: GuideVersionDetailsDto }
  | { kind: 'not-found' }

export function VersionView() {
  const { id, vid } = useParams<{ id: string; vid: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<Load>({ kind: 'loading' })

  useEffect(() => {
    if (!id || !vid) return
    let cancelled = false
    client.getVersion(id, vid).then(
      (details) => {
        if (!cancelled) setState({ kind: 'ok', details })
      },
      () => {
        if (!cancelled) setState({ kind: 'not-found' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, vid])

  const backBtn = (
    <button type="button" className="btn ghost" onClick={() => navigate(`/g/${id}`)}>
      <IconArrowRight size={16} /> {t('editor.versionView.back')}
    </button>
  )

  if (state.kind === 'loading') {
    return (
      <div className="editor-page-wrapper version-view">
        <div className="editor-bar no-print">
          <div className="editor-bar-start">{backBtn}</div>
        </div>
        <div className="page editor-page">…</div>
      </div>
    )
  }

  if (state.kind === 'not-found') {
    return (
      <div className="editor-page-wrapper version-view">
        <div className="editor-bar no-print">
          <div className="editor-bar-start">{backBtn}</div>
        </div>
        <div className="page editor-page">
          <p role="alert">{t('editor.versionView.notFound')}</p>
        </div>
      </div>
    )
  }

  const { details } = state
  const guide = details.guide
  const rel = relativeTimeAr(details.createdAt)
  const abs = fmtDateTime(details.createdAt)

  return (
    <div className="editor-page-wrapper version-view">
      <div className="editor-bar no-print">
        <div className="editor-bar-start">{backBtn}</div>
        <div className="editor-bar-center version-banner">
          {t('editor.versionView.banner', { rel, abs })}
        </div>
        <div className="editor-bar-end" />
      </div>
      <div className="page editor-page">
        <ReadOnlyGuide guide={guide} />
      </div>
    </div>
  )
}
