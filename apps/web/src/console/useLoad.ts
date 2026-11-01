import { useCallback, useEffect, useState } from 'react'

/**
 * م٢: تحميل واحد بحالاته الثلاث (يحمّل، وخطأ مع إعادة المحاولة، ونتيجة) — كل شاشات اللوحة
 * تمر من هنا فلا تُكتب الحالات في كل صفحة (القانون ٤).
 */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [seq, setSeq] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setFailed(false)
    load(ac.signal)
      .then((d) => setData(d))
      .catch((err: { name?: string }) => {
        if (err?.name !== 'AbortError') setFailed(true)
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, seq])

  const reload = useCallback(() => setSeq((s) => s + 1), [])
  return { data, setData, failed, reload }
}
