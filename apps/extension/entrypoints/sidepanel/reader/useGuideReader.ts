import { useCallback, useEffect, useState } from 'react'
import type { GuideDetailsDto, ShareInfoDto } from '@dalili/shared'
import { readerLoadErrorAr } from '@/lib/reader'

/** PNL-01: جلب الدليل للقارئ — كاش ذاكرة يعرض فورًا ويحدّث خلفيًا، وفشل التحديث يُعلَن لا يُخفى */

export type ReaderLoad = (id: string, signal: AbortSignal) => Promise<GuideDetailsDto>

export type ReaderState =
  | { status: 'loading'; details?: GuideDetailsDto }
  | { status: 'ready'; details: GuideDetailsDto; stale: boolean }
  | { status: 'error'; errorAr: string; details?: undefined }

const cache = new Map<string, GuideDetailsDto>()

export function clearReaderCache(): void {
  cache.clear()
}

const initial = (id: string): ReaderState => {
  const c = cache.get(id)
  return c ? { status: 'loading', details: c } : { status: 'loading' }
}

export function useGuideReader(guideId: string, load: ReaderLoad) {
  const [state, setState] = useState<ReaderState>(() => initial(guideId))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    const cached = cache.get(guideId)
    setState(initial(guideId))
    load(guideId, ac.signal)
      .then((d) => {
        cache.set(guideId, d)
        if (!ac.signal.aborted) setState({ status: 'ready', details: d, stale: false })
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setState(cached ? { status: 'ready', details: cached, stale: true } : { status: 'error', errorAr: readerLoadErrorAr(e) })
      })
    return () => ac.abort()
  }, [guideId, load, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  const setShare = useCallback(
    (share: ShareInfoDto) => {
      setState((s) => {
        if (s.status !== 'ready') return s
        const details = { ...s.details, share }
        cache.set(guideId, details)
        return { ...s, details }
      })
    },
    [guideId],
  )

  return { state, retry, setShare }
}
