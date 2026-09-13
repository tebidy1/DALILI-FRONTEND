import { useState } from 'react'
import type { GuideDto } from '@dalili/shared'
import { READER_ZOOM, STALE_AR, type ReaderItem } from '@/lib/reader'
import { relativeTimeAr } from '@/lib/recent'
import { toArabicDigits } from '@/lib/ar-digits'
import { PreviewShot } from '../Shot'

/** PNL-01: رأس الدليل — عنوان، وصف مطويّ بعد ٣ أسطر، سطر إحصاءات، ورابط الويب */
export function ReaderHead({
  guide,
  stepCount,
  stale,
  onOpenWeb,
}: {
  guide: GuideDto
  stepCount: number
  stale: boolean
  onOpenWeb: () => void
}) {
  const [more, setMore] = useState(false)
  const long = (guide.description?.length ?? 0) > 140
  return (
    <header className="reader-head">
      {stale && <div className="notice">{STALE_AR}</div>}
      <h1 className="reader-title"><bdi>{guide.title}</bdi></h1>
      {guide.description && (
        <>
          <p className={`reader-desc${long && !more ? ' clamped' : ''}`}>{guide.description}</p>
          {long && (
            <button type="button" className="reader-more" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              {more ? 'عرض أقل' : 'عرض المزيد'}
            </button>
          )}
        </>
      )}
      <div className="reader-meta">
        <span>{toArabicDigits(stepCount)} خطوة</span>
        <span>آخر تحديث {relativeTimeAr(guide.updatedAt)}</span>
        <button type="button" className="reader-web" onClick={onOpenWeb}>افتح في المتصفح ↗</button>
      </div>
    </header>
  )
}

/** PNL-01: عنصر واحد من الدليل — بطاقة خطوة، أو كتلة هادئة */
export function ReaderItemView({ item }: { item: ReaderItem }) {
  switch (item.type) {
    case 'header':
      return <h2 className="reader-section">{item.title}</h2>
    case 'callout':
      return <div className={`reader-callout ${item.tone}`}>{item.text}</div>
    case 'text':
      return <p className="reader-text">{item.text}</p>
    case 'divider':
      return <hr className="reader-divider" />
    case 'external':
      return <div className="reader-external muted small">{item.label}</div>
    case 'step':
      return (
        <article className="rcard">
          <div className="rcard-head">
            <span className="rcard-n">{toArabicDigits(item.n)}</span>
            <bdi className="rcard-title">{item.title}</bdi>
          </div>
          {item.shot && (
            <PreviewShot
              src={item.shot.src}
              mark={item.shot.mark}
              crop={item.shot.crop}
              blur={item.shot.blur}
              alt={`لقطة الخطوة ${toArabicDigits(item.n)}`}
              zoom={READER_ZOOM}
              canToggle
            />
          )}
          {item.missing && <div className="rcard-missing muted small">{item.missing}</div>}
          {item.note && <p className="rcard-note">{item.note}</p>}
        </article>
      )
  }
}

/** PNL-01: هيكل عظمي — ثلاث بطاقات بلا نص أثناء أول تحميل */
export function ReaderSkeleton() {
  return (
    <div className="reader-skeleton" aria-busy="true" aria-label="يجري تحميل الدليل">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rcard sk">
          <span className="sk-line" />
          <span className="sk-shot" />
        </div>
      ))}
    </div>
  )
}
