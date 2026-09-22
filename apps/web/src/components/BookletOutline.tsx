import { useEffect, useState } from 'react'
import { bookletOutline } from '@dalili/core'
import type { StepDto } from '@dalili/shared'
import { t } from '../i18n'

/**
 * BKL-08: فهرس الكرّاسة — يتتبّع موضع القارئ فيضيء القسم الحالي (طلب المالك 2026-09-07:
 * «تبدو ككيان يسهل تصفحه»). مصدر واحد للعارض والمحرر.
 * غياب `IntersectionObserver` (بيئة اختبار قديمة) لا يكسر شيئًا — يبقى الفهرس روابط عاملة.
 */
export function BookletOutline({ steps, prefix = '' }: { steps: StepDto[]; prefix?: string }) {
  const items = bookletOutline(steps)
  const [active, setActive] = useState('')

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function' || items.length === 0) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        const first = items.find((o) => seen.get(prefix + o.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '-10% 0px -70% 0px' },
    )
    for (const o of items) {
      const el = document.getElementById(prefix + o.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
    // العناوين نفسها هي ما يُراقَب — تتغيّر بتغيّر الكتل لا بكل ضغطة مفتاح
  }, [items.map((o) => o.id).join(','), prefix])

  if (items.length === 0) return null

  return (
    <nav className="booklet-outline no-print" aria-label={t('booklet.outline')}>
      <p className="booklet-outline-title">{t('booklet.outline')}</p>
      <ul>
        {items.map((o) => (
          <li key={o.id}>
            <a className={active === o.id ? 'is-active' : ''} href={`#${prefix}${o.id}`}>
              {o.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
