import { useEffect, type RefObject } from 'react'

/**
 * إغلاق المنبثقات المشترك: مفتاح Escape أو النقر (mousedown) خارج الجذر —
 * بلا إنصات إطلاقًا حين تكون مغلقة. هدف الإنصات (`window` أو `document`)
 * يبقى كما اختار كل مستخدم فلا يتغيّر سلوك الأحداث.
 */
export function useDismissOnOutside(
  open: boolean,
  ref: RefObject<Element | null>,
  close: () => void,
  on: Window | Document = window,
) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') close()
    }
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    on.addEventListener('keydown', onKey)
    on.addEventListener('mousedown', onDown)
    return () => {
      on.removeEventListener('keydown', onKey)
      on.removeEventListener('mousedown', onDown)
    }
  }, [open, on, close, ref])
}
