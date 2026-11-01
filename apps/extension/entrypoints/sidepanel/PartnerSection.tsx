import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DiscoverGuideDto } from '@dalili/shared'
import { guidesCountAr } from '@/lib/discover'
import { t } from '@/lib/i18n'
import { ChevronIcon } from './icons'
import { GuideRow } from './GuideRow'

/**
 * قرار المالك 2026-10-31: أدلة الشريك مجموعة مستقلة أسفل أدلة الشركة. شريطها زر وعنوان معاً:
 * يلتصق بأسفل اللوحة ما دامت المجموعة تحته، ويقف في مكانه حين يصل إليها الموظف بالتمرير.
 * الضغطة الأولى ترفع المجموعة إلى أعلى اللوحة فتغطي أدلة الشركة، والثانية تعيده إلى حيث كان.
 * الشريط والقائمة ابنان مباشران لجسم اللوحة، فالالتصاق يعمل على طولها كلها.
 */

/** مدة الانزلاق التقريبية — بعدها تُزال مسافة الصعود فلا تقفز الصفحة أثناء العودة */
const SETTLE_MS = 600

const motion = (): ScrollBehavior => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

export function PartnerSection({ guides, onOpenHere }: { guides: DiscoverGuideDto[]; onOpenHere?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  // مسافة تحت القائمة تسمح للشريط بالصعود إلى الأعلى ولو قصرت القائمة — تبقى حتى تنتهي العودة
  const [reach, setReach] = useState(false)
  const back = useRef(0)
  const bar = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !list.current) return
    const top = list.current.getBoundingClientRect().top + window.scrollY - (bar.current?.offsetHeight ?? 0)
    window.scrollTo({ top: Math.max(0, top), behavior: motion() })
  }, [open])

  useEffect(() => {
    if (open || !reach) return
    const id = setTimeout(() => setReach(false), SETTLE_MS)
    return () => clearTimeout(id)
  }, [open, reach])

  const partner = guides[0]?.partner
  if (!guides.length) return null

  function toggle() {
    if (open) {
      setOpen(false)
      window.scrollTo({ top: back.current, behavior: motion() })
    } else {
      back.current = window.scrollY
      setReach(true)
      setOpen(true)
    }
  }

  return (
    <>
      <button
        ref={bar}
        type="button"
        className={open ? 'partner-bar open' : 'partner-bar'}
        aria-expanded={open}
        aria-controls="partner-guides"
        title={open ? t('ext.partnerBack') : t('ext.partnerShow')}
        onClick={toggle}
      >
        {partner?.logoUrl ? (
          <img className="partner-bar-logo" src={partner.logoUrl} alt="" />
        ) : (
          <span className="partner-bar-logo" aria-hidden="true">{partner?.name.slice(0, 1)}</span>
        )}
        <span className="partner-bar-tx">
          <small>{t('ext.partnerGuides')}</small>
          <bdi>{partner?.name}</bdi>
        </span>
        <span className="discover-badge">{guidesCountAr(guides.length)}</span>
        <span className="partner-bar-chev" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      <div id="partner-guides" ref={list} className={reach ? 'discover partner-list reach' : 'discover partner-list'}>
        {guides.map((g) => (
          <GuideRow key={g.id} g={g} onOpenHere={onOpenHere} />
        ))}
      </div>
    </>
  )
}
