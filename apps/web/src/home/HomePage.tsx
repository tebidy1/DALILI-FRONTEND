import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { FolderDto, ListGuidesDto, MineReportDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { StateView } from '../ui/StateView'
import { SkeletonGuideCard } from '../ui/Skeleton'
import { IconCloudOff, IconFolder, IconGrid, IconList, IconPlus } from '../ui/icons'
import { t } from '../i18n'
import { patchParams } from '../lib/params'
import { BulkBar } from '../components/BulkBar'
import { emptySelection, toggleSelect, rangeSelect, selectAll, isPicked, type Selection } from '../lib/selection'
import { useOverview } from '../shell/OverviewContext'
import { GuideCard } from './GuideCard'
import { GuideTable } from './GuideTable'
import { HomeSearch } from './HomeSearch'
import { FiltersPanel, ActiveFilters } from './FiltersPanel'
import { FoldersView } from './FoldersView'
import { ReportStrip } from './ReportStrip'
import { LibraryEmpty } from './LibraryEmpty'
import { useGuideActions } from './useGuideActions'
import { SCREEN_META, readLayout, type HomeScreen, type Layout } from './screen'

/**
 * شاشات القوائم على نمط المرجع (سكرايب معكوسًا RTL): شريط أعلى فيه العنوان يمينًا
 * وزر «فلاتر ▾» بعدّاد الفلاتر النشطة + شبكة/قائمة + «دليل جديد» يسارًا. الفلاتر
 * لا تزاحم الشاشة — تعيش في اللوحة المنسدلة. «قائمة» = جدول حقيقي بأعمدة المرجع.
 * حالة العرض في searchParams فالرجوع والمشاركة يعملان.
 */

const PAGE_SIZE = 24

export function HomePage({ screen }: { screen: HomeScreen }) {
  const { overview, reload: reloadOverview } = useOverview()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()

  const visibility = sp.get('visibility')
  const creator = sp.get('creator')
  const when = sp.get('when')
  const site = sp.get('site')
  const folder = sp.get('folder')
  const page = Number(sp.get('page') ?? '1') || 1
  const sort = sp.get('sort') ?? 'updated-desc'
  const inTrash = screen === 'trash'

  const [data, setData] = useState<ListGuidesDto | null>(null)
  const [folders, setFolders] = useState<FolderDto[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadSeq, setReloadSeq] = useState(0)
  const [layout, setLayout] = useState<Layout>(readLayout)
  // «مجلدات» وضع خاص بالرئيسية — خارجها يعامل شبكةً كي لا يعلق زر بلا اختيار
  const view: Layout = screen === 'home' || layout !== 'folders' ? layout : 'grid'
  const showFoldersView = screen === 'home' && view === 'folders'
  const [sel, setSel] = useState<Selection>(emptySelection())
  // المرحلة ج: التقرير المجمّع لأدلتي — يتبع إعادة التحميل كي تتنفس الأرقام مع الإنشاء/الحذف
  const [report, setReport] = useState<MineReportDto | null>(null)

  const qs = sp.toString()
  const retry = useCallback(() => {
    setError('')
    setData(null)
    setReloadSeq((s) => s + 1)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const [sField, sOrder] = sort.split('-')
    // الاستعلام من الشاشة + المرشحات — الشاشة تحدد النطاق الأساسي
    const q: Record<string, unknown> = { page, limit: PAGE_SIZE, sort: sField ?? 'updated', order: sOrder ?? 'desc' }
    if (screen === 'mine') q.creator = 'me'
    else if (screen === 'saved') q.saved = true
    else if (screen === 'trash') q.trash = true
    if (screen !== 'trash') {
      if (visibility && (screen === 'home' || screen === 'mine')) q.visibility = visibility
      if (creator && screen === 'home') q.creator = creator
      if (when) q.when = when
      if (site) q.site = site
      if (folder && screen === 'home') q.folder = folder
    }
    client
      .listGuides(q, ac.signal)
      .then((list) => {
        setData(list)
        setNotice('')
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(t('library.loadError'))
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, reloadSeq, screen])

  useEffect(() => {
    const ac = new AbortController()
    client
      .listFolders(ac.signal)
      .then(setFolders)
      .catch(() => setFolders([]))
    return () => ac.abort()
    // إعادة الجلب عند دخول عرض «مجلدات» — مجلد أُنشئ بعد التحميل يجب أن يظهر (بلاغ حي 2026-09-03)
  }, [reloadSeq, showFoldersView])

  useEffect(() => {
    if (screen !== 'mine') return
    const ac = new AbortController()
    client
      .myReport(ac.signal)
      .then(setReport)
      .catch(() => setReport(null))
    return () => ac.abort()
  }, [screen, reloadSeq])

  async function refreshFolders() {
    setFolders(await client.listFolders().catch(() => []))
  }

  function setParams(patch: Record<string, string | null>) {
    setSp(patchParams(sp, patch))
  }

  function clearFilters() {
    setParams({ visibility: null, creator: null, when: null, site: null, folder: null })
  }

  function switchLayout(next: Layout) {
    setLayout(next)
    try {
      localStorage.setItem('home.layout', next)
    } catch {
      /* الوضع الخاص يمنع التخزين — الاختيار يبقى للجلسة */
    }
  }

  // تبديل السياق (أي مرشّح/صفحة) يُخلي التحديد — لا تنفيذ جماعي عبر سياقين
  useEffect(() => {
    setSel(emptySelection())
  }, [qs])

  // LIB-05: Ctrl+A يحدد أدلتي المعروضة فقط، وEsc يُخلي
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSel(emptySelection())
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      if (!data) return
      e.preventDefault()
      const mineIds = data.items.filter((g) => g.mine).map((g) => g.id)
      setSel((s) => selectAll(s, mineIds))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [data])

  const actions = useGuideActions({
    screen,
    inTrash,
    data,
    sel,
    navigate,
    setData,
    setNotice,
    setError,
    setSel,
    bumpReload: () => setReloadSeq((s) => s + 1),
    reloadOverview,
    refreshFolders,
  })

  const list = data?.items ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const isViewer = overview?.myRole === 'viewer'
  const advancedCount = [visibility, creator, when, site, folder && screen === 'home' ? folder : null].filter(Boolean).length
  const anyFilter = advancedCount > 0
  const meta = SCREEN_META[screen]

  return (
    <div className="page home">
      {/* — شريط الأعلى: العنوان يمينًا، وأدوات العرض يسارًا (نمط المرجع) — */}
      <div className="toolbar">
        <h1 className="row screen-title">
          {meta.icon}
          {meta.title}
        </h1>
        <div className="row toolbar-actions">
          {screen !== 'trash' && (
            <FiltersPanel
              screen={screen}
              visibility={visibility}
              creator={creator}
              when={when}
              site={site}
              sort={sort}
              isViewer={isViewer}
              sites={overview?.sites ?? []}
              advancedCount={advancedCount}
              setParams={setParams}
            />
          )}
          <div className="row view-toggle" role="group" aria-label={t('home.viewToggle')}>
            <button
              className={`btn ghost icon-btn${view === 'grid' ? ' sel' : ''}`}
              aria-pressed={view === 'grid'}
              aria-label={t('home.grid')}
              title={t('home.grid')}
              onClick={() => switchLayout('grid')}
            >
              <IconGrid size={16} />
            </button>
            <button
              className={`btn ghost icon-btn${view === 'list' ? ' sel' : ''}`}
              aria-pressed={view === 'list'}
              aria-label={t('home.list')}
              title={t('home.list')}
              onClick={() => switchLayout('list')}
            >
              <IconList size={16} />
            </button>
            {/* طلب المالك 2026-09-03: عرض المحتوى حسب المجلدات — الاسم وعدد الأدلة */}
            {screen === 'home' && (
              <button
                className={`btn ghost icon-btn${view === 'folders' ? ' sel' : ''}`}
                aria-pressed={view === 'folders'}
                aria-label={t('home.viewFolders')}
                title={t('home.viewFolders')}
                onClick={() => switchLayout('folders')}
              >
                <IconFolder size={16} />
              </button>
            )}
          </div>
          {!isViewer && (
            <Button icon={<IconPlus size={16} />} onClick={actions.newGuide} busy={actions.creating}>
              {t('library.newGuide')}
            </Button>
          )}
        </div>
      </div>

      {/* البحث في سطر مستقل فاصلًا بين الشريط والبطاقات (طلب المالك 2026-09-03) */}
      {(screen === 'home' || screen === 'mine' || screen === 'saved') && <HomeSearch />}

      {/* — المرحلة ج: التقرير المجمّع أعلى «أنشئ بواسطي» فقط — */}
      {screen === 'mine' && report && <ReportStrip report={report} />}

      {error && data === null ? (
        <StateView
          kind="error"
          icon={<IconCloudOff size={30} />}
          title={t('library.loadError')}
          desc={t('library.loadErrorDesc')}
          action={{ label: t('common.retry'), onAction: retry }}
        />
      ) : (
        <>
          {error && <div className="err" role="alert">{error}</div>}
          {notice && <div className="ok-note" role="status">{notice}</div>}

          {advancedCount > 0 && (
            <ActiveFilters
              screen={screen}
              visibility={visibility}
              creator={creator}
              when={when}
              site={site}
              folder={folder}
              folderName={folders.find((f) => f.id === folder)?.name ?? ''}
              setParams={setParams}
            />
          )}

          {showFoldersView ? (
            <FoldersView
              folders={folders}
              onOpen={(fid) => {
                switchLayout('grid')
                setParams({ folder: fid })
              }}
            />
          ) : data === null ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">{t('library.loadingA11y')}</span>
              <div className="grid-cards" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <SkeletonGuideCard key={i} />
                ))}
              </div>
            </div>
          ) : list.length === 0 ? (
            <LibraryEmpty
              screen={screen}
              inTrash={inTrash}
              isViewer={isViewer}
              anyFilter={anyFilter}
              folder={folder}
              hasOverview={!!overview}
              allCount={overview?.counts.all ?? 0}
              creating={actions.creating}
              onNewGuide={actions.newGuide}
              onClearFilters={clearFilters}
            />
          ) : (
            <>
              {sel.ids.length > 0 && (
                <BulkBar
                  count={sel.ids.length}
                  folders={folders}
                  trash={inTrash}
                  busy={actions.bulkBusy}
                  onMove={(fid) => void actions.bulkMove(fid)}
                  onDelete={() => void actions.bulkDelete()}
                  onShare={() => void actions.bulkShare()}
                  onClear={() => setSel(emptySelection())}
                />
              )}
              {view === 'list' ? (
                <GuideTable
                  list={list}
                  folders={folders}
                  trash={inTrash}
                  sort={sort}
                  sel={sel}
                  confirming={actions.confirming}
                  onSort={(col, dir) => setParams({ sort: `${col}-${dir}` })}
                  onPick={(id, shift) =>
                    setSel((s) =>
                      shift ? rangeSelect(s, id, list.filter((x) => x.mine).map((x) => x.id)) : toggleSelect(s, id),
                    )
                  }
                  onOpen={(g) => navigate(`/g/${g.id}`)}
                  onRestore={(g) => void actions.restore(g)}
                  onRemove={(g) => void actions.remove(g)}
                />
              ) : (
                <div className={`grid-cards${screen === 'saved' ? ' saved-grid' : ''}`}>
                  {list.map((g) => (
                    <GuideCard
                      key={g.id}
                      g={g}
                      folders={folders}
                      inTrash={inTrash}
                      picked={isPicked(sel, g.id)}
                      showPick={g.mine}
                      confirming={actions.confirming === g.id}
                      onPick={(shift) =>
                        setSel((s) =>
                          shift ? rangeSelect(s, g.id, list.filter((x) => x.mine).map((x) => x.id)) : toggleSelect(s, g.id),
                        )
                      }
                      onOpen={() => navigate(`/g/${g.id}`)}
                      onBookmark={() => void actions.toggleBookmark(g)}
                      onDuplicate={() => void actions.duplicate(g)}
                      onPublish={() => void actions.toggleVisibility(g)}
                      onShare={() => void actions.shareCopy(g)}
                      onMove={(fid) => void actions.moveTo(g, fid)}
                      onRemove={() => void actions.remove(g)}
                      onRestore={() => void actions.restore(g)}
                      onSite={(s) => setParams({ site: s })}
                    />
                  ))}
                </div>
              )}
              {totalPages > 1 && (
                <nav className="row center lib-pager" aria-label={t('library.pageInfo', { page: data?.page ?? 1, pages: totalPages, total: data?.total ?? 0 })}>
                  <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
                    {t('library.prevPage')}
                  </Button>
                  <span className="muted">
                    {t('library.pageInfo', { page: page, pages: totalPages, total: data?.total ?? 0 })}
                  </span>
                  <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setParams({ page: String(page + 1) })}>
                    {t('library.nextPage')}
                  </Button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
