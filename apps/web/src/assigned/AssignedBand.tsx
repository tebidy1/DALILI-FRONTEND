import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AssignedItemDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { AssignedList } from './AssignedList'
import { useAssignmentActions } from './useAssignmentActions'

/**
 * ASG: قسم «أُسند إليّ» أعلى الرئيسية — يظهر فقط إن وُجد عنصر مُسنَد. عرض مضغوط،
 * وشريط إعلان بعدد غير المفتوح يختفي بعد الفتح (لا بعد وقت). الفتح يسجّل «فُتح»
 * وينتقل للدورة؛ د١: الإكمال يحسبه الخادم من العناصر المنتهية، فلا «تمّ» يدوي.
 */
export function AssignedBand() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AssignedItemDto[] | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    // حارس دفاعي: بعض شاشات الاختبار تحاكي client جزئيًا بلا listAssigned
    const fn = client.listAssigned?.bind(client)
    if (!fn) {
      setItems([])
      return
    }
    fn(signal)
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load])

  const { onOpen, onContinue } = useAssignmentActions({ navigate })

  if (!items || items.length === 0) return null
  const newCount = items.filter((it) => it.openedAt === null).length

  return (
    <section className="assigned-band" aria-label={t('assigned.title')}>
      {newCount > 0 && (
        <div className="assigned-banner" role="status">
          {t('assigned.newBanner', { count: newCount })}
        </div>
      )}
      <h2 className="assigned-band-title">{t('assigned.title')}</h2>
      <AssignedList items={items} onOpen={onOpen} onContinue={onContinue} compact />
    </section>
  )
}
