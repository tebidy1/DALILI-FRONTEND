import { useEffect, useState, type RefObject } from 'react'

export type ObserveEnd = (el: Element, onSeen: () => void) => () => void

/** يراقب ظهور العنصر في الشاشة — الافتراضي IntersectionObserver، ومحقون في الاختبار */
const intersect: ObserveEnd = (el, onSeen) => {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) onSeen()
  })
  io.observe(el)
  return () => io.disconnect()
}

/**
 * د١: هل وصل القارئ إلى آخر الدليل؟ يعيد قيمة لا نداءً، فلا يضيع الوصول إن سبق وصول حالة
 * الدورة (دليل قصير كله ظاهر من أول لحظة). الوصول يخص دليلاً بعينه (`key`): الانتقال إلى
 * الدليل التالي في الشاشة نفسها يبدأ من جديد، فلا يُنهى دليل طويل قبل قراءته.
 */
export function useReachedEnd(ref: RefObject<Element | null>, key: string, observe: ObserveEnd = intersect): boolean {
  const [reachedKey, setReachedKey] = useState<string | null>(null)
  const reached = reachedKey === key
  useEffect(() => {
    const el = ref.current
    if (!el || reached) return
    return observe(el, () => setReachedKey(key))
  }, [ref, observe, reached, key])
  return reached
}
