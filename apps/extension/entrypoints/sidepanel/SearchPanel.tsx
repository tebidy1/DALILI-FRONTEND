import { useEffect, useState } from 'react'
import type { GuideSummaryDto } from '@dalili/shared'
import { WEB_BASE } from '@/lib/config'
import { guidesCountAr } from '@/lib/discover'
import { searchHref } from '@/lib/recent'
import { creatorsOf, EMPTY_FILTERS, hasActiveFilters, searchGuides, type SearchFilters, type SearchSort, type StatusFilter } from '@/lib/search'
import { t, type TKey } from '@/lib/i18n'
import { BackIcon, SearchIcon } from './icons'
import { GuideRow } from './GuideRow'
import { PanelState } from './ListStates'

/**
 * وضع البحث (طلب المالك 2026-10-30): الضغط على حقل البحث يُخفي الالتقاط ويرفع الحقل
 * إلى أعلى اللوحة، وتحته شارات الحالة (★ مهم، جديد، تحديث) وقائمتا الترتيب والمنشئ.
 * كل التصفية فورية ومحلية على مكتبة تُجلب مرة (lib/search). Esc يمسح الكلمة ثم يخرج.
 */

const STATUS: { id: StatusFilter; label: TKey; mark?: string }[] = [
  { id: 'pinned', label: 'ext.pinnedAria', mark: '★' },
  { id: 'new', label: 'ext.freshNew' },
  { id: 'updated', label: 'ext.freshUpdated' },
]
const SORTS: { id: SearchSort; label: TKey }[] = [
  { id: 'best', label: 'ext.sortBest' },
  { id: 'readers', label: 'ext.sortReaders' },
  { id: 'newest', label: 'ext.sortNewest' },
]

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: GuideSummaryDto[] }

/** filters من App: تبقى الكلمة والفلاتر حين يفتح المستخدم دليلًا بـ↵ ثم يرجع */
export function SearchPanel({ filters: f, onChange, load, onExit, onOpenHere }: {
  filters: SearchFilters
  onChange: (next: SearchFilters) => void
  load: (signal?: AbortSignal) => Promise<GuideSummaryDto[]>
  onExit: () => void
  onOpenHere?: (id: string) => void
}) {
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const set = (patch: Partial<SearchFilters>) => onChange({ ...f, ...patch })
  const toggle = (s: StatusFilter) => set({ status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s] })
  const clearFilters = () => onChange({ ...EMPTY_FILTERS, query: f.query })

  useEffect(() => {
    const ac = new AbortController()
    setState({ status: 'loading' })
    load(ac.signal)
      .then((rows) => !ac.signal.aborted && setState({ status: 'ready', rows }))
      .catch(() => !ac.signal.aborted && setState({ status: 'error' }))
    return () => ac.abort()
  }, [load, attempt])

  const rows = state.status === 'ready' ? state.rows : []
  const results = searchGuides(rows, f)
  const creators = creatorsOf(rows)
  const libraryHref = searchHref(WEB_BASE, f.query) ?? `${WEB_BASE}/`

  return (
    <div className="srch">
      <div className="srch-bar">
        <button type="button" className="srch-back" aria-label={t('ext.searchBack')} title={t('ext.searchBack')} onClick={onExit}>
          <BackIcon />
        </button>
        <div className="search">
          <SearchIcon />
          <input
            type="search"
            autoFocus
            placeholder={t('ext.searchGuides')}
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              if (f.query) set({ query: '' })
              else onExit()
            }}
          />
        </div>
      </div>

      <div className="srch-chips" role="group" aria-label={t('ext.filterStatus')}>
        {STATUS.map((s) => (
          <button key={s.id} type="button" className={`srch-chip ${s.id}`} aria-pressed={f.status.includes(s.id)} onClick={() => toggle(s.id)}>
            {s.mark && <span aria-hidden="true">{s.mark}</span>}
            {t(s.label)}
          </button>
        ))}
      </div>

      <div className="srch-selects">
        <label>
          <span>{t('ext.sortLabel')}</span>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as SearchSort })}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{t(s.label)}</option>)}
          </select>
        </label>
        <label>
          <span>{t('ext.creatorLabel')}</span>
          <select value={f.creator ?? ''} onChange={(e) => set({ creator: e.target.value || null })}>
            <option value="">{t('ext.creatorAll')}</option>
            {creators.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="sk-row" />)}
        </div>
      )}
      {state.status === 'error' && (
        <PanelState title={t('ext.loadFail')} hint={t('ext.loadFailHint')} action={{ label: t('ext.retry'), onClick: () => setAttempt((n) => n + 1) }} />
      )}
      {state.status === 'ready' && (
        <>
          <div className="srch-count">
            <span>{guidesCountAr(results.length)}</span>
            {hasActiveFilters(f) && results.length > 0 && (
              <button type="button" className="link-btn" onClick={clearFilters}>{t('ext.clearFilters')}</button>
            )}
          </div>
          {results.length === 0 ? (
            <PanelState
              title={t('ext.searchNone')}
              hint={t('ext.searchNoneHint')}
              action={hasActiveFilters(f) ? { label: t('ext.clearFilters'), onClick: clearFilters } : undefined}
            />
          ) : (
            <ul className="srch-list">
              {results.map((g) => (
                <li key={g.id}>
                  <GuideRow g={g} onOpenHere={onOpenHere} />
                </li>
              ))}
            </ul>
          )}
          <a className="srch-more" href={libraryHref} target="_blank" rel="noreferrer">{t('ext.searchInLibrary')}</a>
        </>
      )}
    </div>
  )
}
