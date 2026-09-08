import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEFAULT_MARK_COLOR, stepNumbers } from '@dalili/core'
import type { GuideVersionDetailsDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { IconArrowRight } from '../ui/icons'
import { relativeTimeAr } from '../lib/format'
import { StepCard } from '../components/StepCard'

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

const NOOP = () => {}

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
  const abs = new Date(details.createdAt).toLocaleString('ar-EG')
  const nums = stepNumbers(guide.steps)

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
        <header className="guide-head">
          <div className="guide-head-read">
            <h1 className="guide-title-read" dir="rtl">
              <bdi>{guide.title}</bdi>
            </h1>
            {guide.description && (
              <p className="guide-desc-read" dir="auto">
                <bdi>{guide.description}</bdi>
              </p>
            )}
          </div>
        </header>
        {guide.steps.map((s, i) => (
          <Fragment key={s.id}>
            <div id={`step-${s.id}`} className="step-block">
              <StepCard
                index={i}
                step={s}
                displayNo={nums[i] ?? null}
                canUp={false}
                canDown={false}
                editing={false}
                tool={'select'}
                markColor={DEFAULT_MARK_COLOR}
                onChange={NOOP}
                onMove={NOOP}
                onRemove={NOOP}
                onDuplicate={NOOP}
                onMoveMark={NOOP}
                onAttachShot={NOOP}
                picked={false}
                onPick={NOOP}
                dragging={false}
                onDragStart={NOOP}
                onDragOver={NOOP}
                onDrop={NOOP}
                onDragEnd={NOOP}
              />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
