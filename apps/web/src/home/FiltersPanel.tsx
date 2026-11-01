import { useState } from 'react'
import { siteLabel } from '@dalili/core'
import { IconFilter } from '../ui/icons'
import { Button } from '../ui/Button'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import type { LibraryTeamCountDto } from '@dalili/shared'
import type { HomeScreen } from './screen'

/** مفاتيح الفلاتر في الرابط — مصدر واحد لـ«امسح الفلاتر» هنا وفي الرئيسية */
export const FILTER_PARAMS = ['visibility', 'creator', 'when', 'site', 'team', 'folder', 'source'] as const
export const CLEARED_FILTERS: Record<string, null> = Object.fromEntries(FILTER_PARAMS.map((k) => [k, null]))

/**
 * زر «فلاتر ▾» بلوحة منسدلة — الفلاتر لا تزاحم الشاشة (طلب المالك 2026-09-03):
 * الحالة والمنشئ والنافذة الزمنية والموقع والقسم والترتيب، مع عدّاد الفلاتر النشطة
 * على الزر ورقاقات الفلاتر المطبَّقة فوق القائمة.
 */

interface FilterOption {
  key: string | null
  label: string
  count?: number
}

interface FiltersPanelProps {
  screen: HomeScreen
  visibility: string | null
  creator: string | null
  when: string | null
  site: string | null
  /** ORG-04: القسم المالك */
  team: string | null
  /** ش٢: مصدر الدليل — يظهر فلتره حين توجد أدلة رسمية */
  source: string | null
  hasOfficial: boolean
  sort: string
  isViewer: boolean
  sites: Array<{ site: string; count: number }>
  teams: LibraryTeamCountDto[]
  advancedCount: number
  setParams: (patch: Record<string, string | null>) => void
}

export function FiltersPanel(p: FiltersPanelProps) {
  const [open, setOpen] = useState(false)
  const clearFilters = () => p.setParams(CLEARED_FILTERS)

  return (
    <div className="filters-wrap">
      <button
        className={`btn ghost filters-btn${open ? ' sel' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconFilter size={15} />
        {t('home.filters')}
        {p.advancedCount > 0 && <span className="filter-badge">{arDigits(p.advancedCount)}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="filters-backdrop" onClick={() => setOpen(false)} />
          <div className="filters-pop" role="group" aria-label={t('home.filters')}>
            {(p.screen === 'home' || p.screen === 'mine') && (
              <FilterRow
                label={t('home.filterStatus')}
                value={p.visibility}
                options={[
                  { key: null, label: t('home.filterAllLabel') },
                  { key: 'private', label: t('home.statusPrivate') },
                  { key: 'workspace', label: t('home.statusPublished') },
                ]}
                onChange={(k) => p.setParams({ visibility: k })}
              />
            )}
            {p.screen === 'home' && !p.isViewer && (
              <FilterRow
                label={t('home.filterCreator')}
                value={p.creator}
                options={[
                  { key: null, label: t('home.filterAllLabel') },
                  { key: 'me', label: t('home.creatorMe') },
                  { key: 'others', label: t('home.creatorOthers') },
                ]}
                onChange={(k) => p.setParams({ creator: k })}
              />
            )}
            {p.hasOfficial && (
              <FilterRow
                label={t('home.filterSource')}
                value={p.source}
                options={[
                  { key: null, label: t('home.filterAllLabel') },
                  { key: 'company', label: t('home.sourceCompany') },
                  { key: 'official', label: t('home.sourceOfficial') },
                ]}
                onChange={(k) => p.setParams({ source: k })}
              />
            )}
            <FilterRow
              label={t('home.filterWhen')}
              value={p.when}
              options={[
                { key: null, label: t('home.filterAllLabel') },
                { key: 'today', label: t('home.whenToday') },
                { key: 'week', label: t('home.whenWeek') },
                { key: 'month', label: t('home.whenMonth') },
              ]}
              onChange={(k) => p.setParams({ when: k })}
            />
            {p.sites.length > 0 && (
              <FilterRow
                label={t('home.filterSite')}
                value={p.site}
                options={[
                  { key: null, label: t('home.filterAllLabel') },
                  ...p.sites.map((s) => ({ key: s.site, label: siteLabel(s.site), count: s.count })),
                ]}
                onChange={(k) => p.setParams({ site: k })}
              />
            )}
            {p.teams.length > 0 && (
              <FilterRow
                label={t('home.filterTeam')}
                value={p.team}
                options={[
                  { key: null, label: t('home.filterAllLabel') },
                  ...p.teams.map((d) => ({ key: d.id, label: d.name, count: d.count })),
                ]}
                onChange={(k) => p.setParams({ team: k })}
              />
            )}
            <FilterRow
              label={t('home.sortLabel')}
              value={p.sort}
              options={[
                { key: 'updated-desc', label: t('library.sortUpdated') },
                { key: 'created-desc', label: t('library.sortCreated') },
                { key: 'title-asc', label: t('library.sortTitleAsc') },
              ]}
              onChange={(k) => k && p.setParams({ sort: k })}
            />
            {p.advancedCount > 0 && (
              <div className="filters-pop-foot">
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  {t('home.clearFilters')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** رقاقات الفلاتر المطبَّقة فوق القائمة — ✕ على كل رقاقة يرفع فلترها وحده */
export function ActiveFilters(a: {
  screen: HomeScreen
  visibility: string | null
  creator: string | null
  when: string | null
  site: string | null
  team: string | null
  teamName: string
  source: string | null
  folder: string | null
  folderName: string
  setParams: (patch: Record<string, string | null>) => void
}) {
  return (
    <div className="active-filters" role="group" aria-label={t('home.activeFilters')}>
      {a.visibility && (
        <ActiveChip
          label={`${t('home.filterStatus')}: ${a.visibility === 'private' ? t('home.statusPrivate') : t('home.statusPublished')}`}
          onClear={() => a.setParams({ visibility: null })}
        />
      )}
      {a.creator && a.screen === 'home' && (
        <ActiveChip
          label={`${t('home.filterCreator')}: ${a.creator === 'me' ? t('home.creatorMe') : t('home.creatorOthers')}`}
          onClear={() => a.setParams({ creator: null })}
        />
      )}
      {a.when && (
        <ActiveChip label={`${t('home.filterWhen')}: ${whenLabel(a.when)}`} onClear={() => a.setParams({ when: null })} />
      )}
      {a.site && <ActiveChip label={`${t('home.filterSite')}: ${siteLabel(a.site)}`} onClear={() => a.setParams({ site: null })} />}
      {a.source && (
        <ActiveChip
          label={`${t('home.filterSource')}: ${a.source === 'official' ? t('home.sourceOfficial') : t('home.sourceCompany')}`}
          onClear={() => a.setParams({ source: null })}
        />
      )}
      {a.team && <ActiveChip label={`${t('home.filterTeam')}: ${a.teamName}`} onClear={() => a.setParams({ team: null })} />}
      {a.folder && a.screen === 'home' && (
        <ActiveChip
          label={`${t('home.navFolders')}: ${a.folderName}`}
          onClear={() => a.setParams({ folder: null })}
        />
      )}
    </div>
  )
}

function whenLabel(when: string): string {
  return when === 'today' ? t('home.whenToday') : when === 'week' ? t('home.whenWeek') : t('home.whenMonth')
}

/** صف فلتر داخل اللوحة — أزرار حقيقية بـ aria-pressed لا روقاقات بلا دلالة */
function FilterRow({ label, value, options, onChange }: { label: string; value: string | null; options: FilterOption[]; onChange: (key: string | null) => void }) {
  return (
    <div className="filter-row" role="group" aria-label={label}>
      <span className="muted filter-label">{label}</span>
      {options.map((o) => {
        const selected = (value ?? null) === o.key
        return (
          <button key={o.key ?? '__all'} className={`chip f-chip${selected ? ' sel' : ''}`} aria-pressed={selected} onClick={() => onChange(o.key)}>
            {o.label}
            {o.count !== undefined && <span className="count"> {arDigits(o.count)}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="af-chip">
      {label}
      <button className="af-x" aria-label={`${label} — ${t('common.delete')}`} onClick={onClear}>
        ✕
      </button>
    </span>
  )
}
