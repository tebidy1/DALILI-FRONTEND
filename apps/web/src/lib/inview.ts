import { useEffect, useRef, useState } from 'react'

/**
 * PERF-03: هل العنصر قرب الشاشة؟ — حدث IntersectionObserver لا حلقة استطلاع (ق3).
 * بلا مراقب في البيئة (اختبارات jsdom) يقفز للظهور فورًا — تدهور صادق لا تعليق.
 */
export function useInView<T extends Element>(
  enabled = true,
  rootMargin = '300px',
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(() => !enabled || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (inView) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [inView, rootMargin])

  return [ref, inView]
}
