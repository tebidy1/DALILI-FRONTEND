import { useEffect, useMemo, useRef } from 'react'
import { translationOverlay, type GuideDto, type ShareInfoDto } from '@dalili/shared'
import { readerItems } from '@/lib/reader'
import { t, i18nLocale } from '@/lib/i18n'
import { useGuideReader, type ReaderLoad } from './useGuideReader'
import { ReaderBar } from './ReaderBar'
import { ReaderHead, ReaderItemView, ReaderSkeleton } from './ReaderItems'

/** PNL-01: تبعيات القارئ محقونة — الحقيقية في deps.ts، والاختبارات تمرّر بدائل */
export interface ReaderDeps {
  apiBase: string
  webBase: string
  load: ReaderLoad
  createShare: (id: string) => Promise<ShareInfoDto>
  startTrain: (guide: GuideDto) => Promise<{ ok: boolean; errorAr?: string }>
  copyText: (text: string) => Promise<void>
  openTab: (url: string) => void
}

/**
 * PNL-01: قارئ الدليل داخل اللوحة — يقرأ المستخدم الدليل بجوار الصفحة التي يعمل عليها.
 * الشريط ثابت، والتركيز على «رجوع» عند الفتح، وEsc يرجع.
 */
export function GuideReader({ guideId, deps, onBack }: { guideId: string; deps: ReaderDeps; onBack: () => void }) {
  const { state, retry, setShare } = useGuideReader(guideId, deps.load)
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    backRef.current?.focus()
  }, [guideId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const details = state.details
  // TRNS-01: تراكب الترجمة — قارئ اللوحة الإنجليزي يرى الإنجليزية إن وُجدت طبقتها
  const ov = useMemo(() => (details ? translationOverlay(details.guide, i18nLocale()) : null), [details])
  const items = useMemo(
    () => (details ? readerItems(details.guide, deps.apiBase, ov) : []),
    [details, deps.apiBase, ov],
  )
  const stepCount = items.filter((i) => i.type === 'step').length
  const openWeb = () => deps.openTab(`${deps.webBase}/g/${guideId}`)

  return (
    <section className="reader" aria-label={t('ext.readerAria')}>
      <ReaderBar details={details} deps={deps} backRef={backRef} onBack={onBack} onShareCreated={setShare} />

      {state.status === 'error' && (
        <div className="body">
          <div className="err" role="alert">{state.errorAr}</div>
          <div className="row">
            <button type="button" onClick={retry}>{t('ext.retry')}</button>
            <button type="button" className="ghost" onClick={openWeb}>{t('ext.openInBrowser')}</button>
          </div>
        </div>
      )}

      {!details && state.status === 'loading' && <ReaderSkeleton />}

      {details && (
        <div className="reader-body" dir={ov ? 'ltr' : undefined}>
          <ReaderHead guide={details.guide} ov={ov} stepCount={stepCount} stale={state.status === 'ready' && state.stale} onOpenWeb={openWeb} />
          <ol className="reader-list">
            {items.map((it) => (
              <li key={it.id}>
                <ReaderItemView item={it} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
