import { useState } from 'react'
import type { DiscoverGuideDto } from '@dalili/shared'
import { WEB_BASE } from '@/lib/config'
import { toArabicDigits } from '@/lib/ar-digits'
import { readersTitle } from '@/lib/discover'
import { t } from '@/lib/i18n'
import { EnterIcon, EyeIcon } from './icons'

/** ما يكفي الصف من الدليل: العنوان إلزامي، وحقول ت (§٥) تظهر حين يرسلها الخادم */
export type RowGuide = Pick<DiscoverGuideDto, 'id' | 'title'> &
  Partial<Pick<DiscoverGuideDto, 'pinned' | 'verified' | 'ownerTeamName' | 'fresh' | 'creatorName' | 'readerCount' | 'source' | 'partner'>>

/** سطر المعلومات: المنشئ (وعلامة الشريك للرسمي) · 👁 · القسم */
function MetaLine({ g }: { g: RowGuide }) {
  const parts = [
    g.creatorName && (
      <span key="by" className="doc-by">
        {g.source === 'official' &&
          (g.partner?.logoUrl ? (
            <img className="doc-partner" src={g.partner.logoUrl} alt="" />
          ) : (
            <span className="doc-partner" aria-hidden="true">{g.partner?.name.slice(0, 1)}</span>
          ))}
        <bdi>{g.creatorName}</bdi>
      </span>
    ),
    g.readerCount !== undefined && (
      <span key="eye" className="doc-eye" title={readersTitle(g.readerCount)}>
        <EyeIcon />
        {toArabicDigits(g.readerCount)}
      </span>
    ),
    g.ownerTeamName && <span key="dept" className="doc-dept">{g.ownerTeamName}</span>,
  ].filter(Boolean)
  return (
    <small className="doc-m">
      {parts.flatMap((p, i) => (i ? [<i key={`s${i}`} className="doc-sep" aria-hidden="true">·</i>, p] : [p]))}
    </small>
  )
}

/**
 * PNL-01: صف دليل واحد في اللوحة — الصف رابط إلى الويب (تبويب جديد، كما كان)،
 * وزر ↵ شقيقه يفتح الدليل داخل اللوحة للمقارنة مع الصفحة. زر داخل رابط HTML غير صالح.
 * ت (§٥): الشارات بجانب العنوان (اختيار المالك)، و«جديد»/«تحديث» تختفي فور الفتح هنا.
 * sub يحلّ محل سطر المعلومات (الأدلة الأخيرة: الوقت وعدد الخطوات).
 */
export function GuideRow({ g, sub, onOpenHere }: { g: RowGuide; sub?: string; onOpenHere?: (id: string) => void }) {
  const [opened, setOpened] = useState(false)
  const fresh = opened ? null : g.fresh
  return (
    <div className="doc-row">
      <a className="doc" href={`${WEB_BASE}/g/${g.id}`} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>
        <span className="doc-tx">
          <span className="doc-t">
            {g.pinned && <span className="doc-pin" role="img" aria-label={t('ext.pinnedAria')}>★</span>}
            <bdi>{g.title}</bdi>
            {fresh && <span className={`doc-fresh ${fresh}`}>{t(fresh === 'new' ? 'ext.freshNew' : 'ext.freshUpdated')}</span>}
            {g.verified && <span className="doc-ver" title={t('ext.verifiedBy', { name: g.verified.byName })}>✓ {t('ext.verified')}</span>}
          </span>
          {sub ? <small>{sub}</small> : <MetaLine g={g} />}
        </span>
      </a>
      {onOpenHere && (
        <button
          type="button"
          className="doc-enter"
          data-guide={g.id}
          aria-label={t('ext.rowOpenAria', { title: g.title })}
          title={t('ext.rowOpenTitle')}
          onClick={() => {
            setOpened(true)
            onOpenHere(g.id)
          }}
        >
          <EnterIcon />
        </button>
      )}
    </div>
  )
}
