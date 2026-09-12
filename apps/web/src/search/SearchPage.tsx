import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { FolderDto, SearchResponseDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { StateView } from '../ui/StateView'
import { SkeletonStep } from '../ui/Skeleton'
import { IconCloudOff, IconSearchX } from '../ui/icons'
import { t } from '../i18n'
import { hijriDateAr } from '../lib/format'
import { patchParams } from '../lib/params'
import { SemanticSection } from './SemanticSection'

/**
 * صفحة البحث (SRCH-01) — النتيجة خطوة لا دليلًا: نقرة تفتح الدليل عند تلك الخطوة.
 * الحالات الأربع كاملة (UX-02) وكل نص عبر t() (UX-06).
 * SRCH-02: مرشحات المجلد والنطاق (site:) والمشتركة فقط في شريط المرشحات.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sharedOnly = params.get('shared') === '1'
  const folder = params.get('folder') ?? ''
  const site = params.get('site') ?? ''
  const [input, setInput] = useState(q)
  const [siteInput, setSiteInput] = useState(site)
  const [folders, setFolders] = useState<FolderDto[]>([])
  const [result, setResult] = useState<SearchResponseDto | null>(null)
  const [error, setError] = useState('')
  const [reloadSeq, setReloadSeq] = useState(0)

  useEffect(() => setInput(q), [q])
  useEffect(() => setSiteInput(site), [site])

  useEffect(() => {
    const ac = new AbortController()
    client
      .listFolders(ac.signal)
      .then((f) => setFolders(f))
      .catch(() => {})
    return () => ac.abort()
  }, [])

  const retry = useCallback(() => {
    setError('')
    setResult(null)
    setReloadSeq((s) => s + 1)
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setResult(null)
      setError('')
      return
    }
    const ac = new AbortController()
    client
      .search(
        {
          q,
          shared: sharedOnly || undefined,
          folder: folder || undefined,
          site: site.trim() || undefined,
        },
        ac.signal,
      )
      .then((r) => setResult(r))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(t('search.error'))
      })
    return () => ac.abort()
  }, [q, sharedOnly, folder, site, reloadSeq])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setParams(patchParams(params, { q: input.trim() || null }))
  }

  function toggleShared() {
    setParams(patchParams(params, { shared: sharedOnly ? null : '1' }))
  }

  function setFilter(key: 'folder' | 'site', value: string) {
    setParams(patchParams(params, { [key]: value.trim() || null }))
  }

  return (
    <div className="page">
      <div className="header-bar">
        <h1>{t('search.title')}</h1>
        <Link className="btn ghost" to="/">
          {t('app.name')}
        </Link>
      </div>

      <form className="search-bar" onSubmit={submit} role="search">
        <input
          type="search"
          dir="auto"
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit">{t('search.submit')}</Button>
      </form>

      <div className="row search-toolbar">
        <button type="button" className={`chip ${sharedOnly ? 'shared' : ''}`} onClick={toggleShared} aria-pressed={sharedOnly}>
          {t('search.filterShared')}
        </button>
        {/* SRCH-02: مرشح المجلد — قائمة فورية، ومرشح النطاق بإدخال + تطبيق */}
        <label className="filter-folder">
          <span className="sr-only">{t('search.filterFolder')}</span>
          <select value={folder} onChange={(e) => setFilter('folder', e.target.value)} aria-label={t('search.filterFolder')}>
            <option value="">{t('search.filterFolderAll')}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <form
          className="filter-site"
          onSubmit={(e) => {
            e.preventDefault()
            setFilter('site', siteInput)
          }}
        >
          <input
            type="text"
            dir="ltr"
            aria-label={t('search.filterSite')}
            placeholder={t('search.filterSite')}
            value={siteInput}
            onChange={(e) => setSiteInput(e.target.value)}
          />
          <Button type="submit" size="sm" variant="ghost">
            {t('search.filterSiteApply')}
          </Button>
        </form>
        {result && (
          <span className="muted">
            {t('search.resultsCount', { count: result.total })} · {t('search.tookMs', { ms: result.tookMs })}
          </span>
        )}
      </div>

      {!q.trim() ? (
        <StateView kind="empty" icon={<IconSearchX size={30} />} title={t('search.idleTitle')} desc={t('search.hintIdle')} />
      ) : error ? (
        <StateView
          kind="error"
          icon={<IconCloudOff size={30} />}
          title={t('search.error')}
          desc={t('search.errorDesc')}
          action={{ label: t('search.retry'), onAction: retry }}
        />
      ) : result === null ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">{t('palette.searching')}</span>
          <div aria-hidden="true">
            <SkeletonStep />
            <SkeletonStep />
            <SkeletonStep />
          </div>
        </div>
      ) : result.hits.length === 0 && (result.semantic?.length ?? 0) === 0 ? (
        // لا حرفي ولا دلالي — هنا وحدها يظهر «لا نتائج» الصاعقة (SRCH-06)
        <StateView kind="empty" icon={<IconSearchX size={30} />} title={t('search.noResults')} desc={t('search.noResultsDesc')} />
      ) : (
        <div>
          {/* SRCH-06: الحرفي خالٍ والدلالي حاضر — لافتة الصدق مكان «لا نتائج» */}
          {result.hits.length === 0 && <p className="semantic-fallback">{t('search.semanticFallback')}</p>}
          {result.hits.length > 0 && (
            <div className="search-results">
              {result.hits.map((h) => (
                <Link
                  className="card search-hit"
                  key={`${h.guideId}:${h.stepId ?? 'g'}:${h.field}`}
                  to={h.stepId ? `/g/${h.guideId}#step-${h.stepId}` : `/g/${h.guideId}`}
                >
                  <div className="hit-body">
                    <div className="row row-between">
                      <b>
                        <bdi>{h.guideTitle}</bdi>
                      </b>
                      <span className="muted">
                        {h.stepNo ? t('search.stepOf', { no: h.stepNo }) : t('search.guideTitleMatch')} ·{' '}
                        {hijriDateAr(h.updatedAt)}
                      </span>
                    </div>
                    {/* المقتطف من الخادم: مهروب بالكامل إلا <mark> (highlightSnippet في core) */}
                    <p className="snippet" dangerouslySetInnerHTML={{ __html: h.snippet }} />
                  </div>
                  {/* SRCH-01: مصغّرة الدليل (PERF-02) — لا اللقطة الأصلية */}
                  {h.thumbFileId && (
                    <img
                      className="hit-thumb"
                      src={`/files/${h.thumbFileId}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={64}
                      height={40}
                    />
                  )}
                </Link>
              ))}
            </div>
          )}
          <SemanticSection hits={result.semantic ?? []} reason={result.semanticReason} />
        </div>
      )}
    </div>
  )
}
