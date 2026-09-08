import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { FolderDto, GuideSummaryDto, LibraryOverviewDto, ListGuidesDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { OverviewProvider } from '../shell/OverviewContext'
import { HomePage } from './HomePage'

/**
 * شاشات القوائم بنمط المرجع: شريط أعلى (عنوان + «فلاتر ▾» بعدّاد + شبكة/قائمة + جديد)،
 * الفلاتر تعيش في اللوحة المنسدلة لا على الشاشة، عرض «قائمة» جدول بأعمدة المرجع،
 * البطاقة برأس موقع وسطر «الزمن · الكاتب»، وحالات الفراغ لكل شاشة.
 */

vi.mock('../api', () => ({
  client: {
    listGuides: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    libraryOverview: vi.fn(),
    myReport: vi.fn().mockResolvedValue({ total: 0, published: 0, views: 0, openComments: 0, openIssues: 0 }),
    toggleBookmark: vi.fn().mockResolvedValue({ bookmarked: true }),
    createGuide: vi.fn().mockResolvedValue({ id: 'g-new' }),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
  },
  webShareUrl: (u: string) => u,
}))

const NOW = Date.now()
const RECENT = new Date(NOW - 2 * 60 * 60 * 1000).toISOString()

const MINE: GuideSummaryDto = {
  id: 'g1',
  title: 'دليلي الخاص',
  stepCount: 3,
  kind: 'guide' as const,
  starred: false,
  folderId: null,
  tags: [],
  shared: false,
  createdAt: RECENT,
  updatedAt: RECENT,
  commentCount: 0,
  openCommentCount: 0,
  openIssueCount: 0,
  visibility: 'private',
  site: 'sap.example',
  bookmarked: false,
  mine: true,
  views: 0,
  ownerEmail: 'mohamed@dalili.sa',
}

const OTHERS: GuideSummaryDto = {
  id: 'g2',
  title: 'دليل زميلي المنشور',
  stepCount: 5,
  kind: 'guide' as const,
  starred: false,
  folderId: null,
  tags: [],
  shared: false,
  createdAt: RECENT,
  updatedAt: RECENT,
  commentCount: 2,
  openCommentCount: 0,
  openIssueCount: 0,
  visibility: 'workspace',
  site: 'crm.example',
  bookmarked: false,
  mine: false,
  views: 7,
  ownerEmail: 'sara@dalili.sa',
}

const ADMIN_VIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  myTheme: 'brand',
  counts: { all: 12, mine: 7, published: 3, saved: 2 },
  sites: [
    { site: 'sap.example', count: 6 },
    { site: 'crm.example', count: 3 },
  ],
}

function list(items: GuideSummaryDto[]): ListGuidesDto {
  return { items, total: items.length, page: 1, limit: 24 }
}

/** مجسّر الموقع للتحقق من تنقل البحث إلى /search */
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{location.pathname + location.search}</div>
}

function renderHome(at = '/', overview: LibraryOverviewDto = ADMIN_VIEW, items: GuideSummaryDto[] = [MINE, OTHERS]) {
  vi.mocked(client.libraryOverview).mockResolvedValue(overview)
  vi.mocked(client.listGuides).mockResolvedValue(list(items))
  render(
    <MemoryRouter initialEntries={[at]}>
      <OverviewProvider>
        {/* مجسّر الموقع دائم الظهور — يقرأ من سياق الراوتر لا من تطابق مسار */}
        <LocationProbe />
        <Routes>
          <Route path="/" element={<HomePage screen="home" />} />
          <Route path="/mine" element={<HomePage screen="mine" />} />
          <Route path="/saved" element={<HomePage screen="saved" />} />
          <Route path="/trash" element={<HomePage screen="trash" />} />
        </Routes>
      </OverviewProvider>
    </MemoryRouter>,
  )
  return client
}

function lastListQuery(): Record<string, unknown> {
  const calls = vi.mocked(client.listGuides).mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('شريط الأعلى بنمط المرجع', () => {
  it('العنوان يمينًا وزر «فلاتر» وتبديل الشبكة/القائمة و«دليل جديد» — بلا صفوف فلاتر ظاهرة', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    expect(screen.getByText(t('home.navHome'))).toBeTruthy()
    expect(screen.getByText(t('home.filters'))).toBeTruthy()
    expect(screen.getByLabelText(t('home.grid'))).toBeTruthy()
    expect(screen.getByLabelText(t('home.list'))).toBeTruthy()
    expect(screen.getAllByText(t('library.newGuide')).length).toBeGreaterThan(0)
    // الفلاتر لا تظهر مكشوفة — داخل اللوحة فقط
    expect(screen.queryByRole('group', { name: t('home.filterStatus') })).toBeNull()
  })

  it('زر «فلاتر» يفتح اللوحة بمجموعاتها وعدّاد الفلاتر النشطة يظهر على الزر', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByText(t('home.filters')))
    const pop = screen.getByRole('group', { name: t('home.filters') })
    expect(within(pop).getByRole('group', { name: t('home.filterStatus') })).toBeTruthy()
    expect(within(pop).getByRole('group', { name: t('home.filterCreator') })).toBeTruthy()
    expect(within(pop).getByRole('group', { name: t('home.filterWhen') })).toBeTruthy()
    expect(within(pop).getByRole('group', { name: t('home.filterSite') })).toBeTruthy()
    expect(within(pop).getByRole('group', { name: t('home.sortLabel') })).toBeTruthy()
  })

  it('فلتر من اللوحة يُرسل للخادم ويُظهر عدّادًا ورقاقة نشطة — ومسحها يفرغها', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByText(t('home.filters')))
    const pop = screen.getByRole('group', { name: t('home.filters') })
    fireEvent.click(within(pop).getByText(t('home.statusPrivate')))
    await waitFor(() => expect(lastListQuery()).toMatchObject({ visibility: 'private' }))
    // رقاقة الفلتر النشط ظهرت وعليها زر إزالة
    const activeRow = screen.getByRole('group', { name: t('home.activeFilters') })
    fireEvent.click(within(activeRow).getByRole('button'))
    await waitFor(() => expect('visibility' in lastListQuery()).toBe(false))
  })
})

describe('مربع البحث في متن الشاشات الأولى (طلب المالك 2026-09-03)', () => {
  it.each(['/', '/mine', '/saved'])('يظهر مربع البحث في الشاشة %s', async (at) => {
    renderHome(at)
    expect(await screen.findByPlaceholderText(t('library.searchHintShort'))).toBeTruthy()
  })

  it('السلة ليست من الشاشات الأولى — بلا مربع بحث', async () => {
    renderHome('/trash')
    await screen.findByText(t('home.viewTrash'))
    expect(screen.queryByPlaceholderText(t('library.searchHintShort'))).toBeNull()
  })

  it('إرسال البحث ينقل إلى /search?q=…', async () => {
    renderHome('/')
    const input = await screen.findByPlaceholderText(t('library.searchHintShort'))
    fireEvent.change(input, { target: { value: 'فواتير' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    const loc = await screen.findByTestId('loc')
    expect(loc.textContent).toBe(`/search?q=${encodeURIComponent('فواتير')}`)
  })

  it('البحث في سطر مستقل فاصل بين الشريط والبطاقات — لا داخل الشريط (طلب المالك)', async () => {
    renderHome('/')
    const input = await screen.findByPlaceholderText(t('library.searchHintShort'))
    const form = input.closest('form') as HTMLElement
    expect(form.classList.contains('home-search-row')).toBe(true)
    expect(form.closest('.toolbar')).toBeNull()
  })

  it('زر Enter داخل الحقل يبحث — لا اعتماد على الإرسال الضمني للنماذج', async () => {
    renderHome('/')
    const input = await screen.findByPlaceholderText(t('library.searchHintShort'))
    fireEvent.change(input, { target: { value: 'فواتير' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const loc = await screen.findByTestId('loc')
    expect(loc.textContent).toBe(`/search?q=${encodeURIComponent('فواتير')}`)
  })
})

describe('عرض «حسب المجلدات» في الرئيسية (طلب المالك 2026-09-03)', () => {
  const FOLDERS_LIST: FolderDto[] = [
    { id: 'f1', name: 'المبيعات', count: 3, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'f2', name: 'المخازن', count: 5, createdAt: '2026-01-02T00:00:00Z' },
  ]

  it('زر «مجلدات» ضمن مجموعة العرض في الرئيسية', async () => {
    renderHome('/')
    await screen.findByText('دليلي الخاص')
    expect(screen.getByRole('button', { name: t('home.viewFolders') })).toBeTruthy()
  })

  it('«أنشئ بواسطي» بلا زر مجلدات — عرض المجلدات للرئيسية وحدها', async () => {
    renderHome('/mine')
    await screen.findByText('دليلي الخاص')
    expect(screen.queryByRole('button', { name: t('home.viewFolders') })).toBeNull()
  })

  it('التبديل يعرض بطاقات المجلدات: الاسم وعدد الأدلة', async () => {
    vi.mocked(client.listFolders).mockResolvedValue(FOLDERS_LIST)
    renderHome('/')
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByRole('button', { name: t('home.viewFolders') }))
    expect(await screen.findByText('المبيعات')).toBeTruthy()
    const card = screen.getByText('المبيعات').closest('.folder-card') as HTMLElement
    expect(card.textContent).toContain(arDigits(3))
    expect(screen.getByText('المخازن')).toBeTruthy()
  })

  it('نقر بطاقة المجلد يفتح أدلته: مرشح folder في الرابط والاستعلام', async () => {
    vi.mocked(client.listFolders).mockResolvedValue(FOLDERS_LIST)
    renderHome('/')
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByRole('button', { name: t('home.viewFolders') }))
    fireEvent.click(await screen.findByText('المبيعات'))
    const loc = await screen.findByTestId('loc')
    expect(loc.textContent).toBe('/?folder=f1')
    await waitFor(() => expect(lastListQuery()).toMatchObject({ folder: 'f1' }))
  })

  it('بلا مجلدات: حالة فراغ صادقة تقود للقائمة الجانبية', async () => {
    vi.mocked(client.listFolders).mockResolvedValue([])
    renderHome('/')
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByRole('button', { name: t('home.viewFolders') }))
    expect(await screen.findByText(t('home.foldersEmpty'))).toBeTruthy()
  })

  it('دخول عرض المجلدات يحدث القائمة — مجلد أُنشئ بعد التحميل لا يختفي (بلاغ حي 2026-09-03)', async () => {
    vi.mocked(client.listFolders)
      .mockResolvedValueOnce([]) // الجلب الأول عند التحميل — قبل إنشاء المجلد
      .mockResolvedValueOnce(FOLDERS_LIST) // عند دخول عرض المجلدات
    renderHome('/')
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByRole('button', { name: t('home.viewFolders') }))
    expect(await screen.findByText('المبيعات')).toBeTruthy()
  })
})

describe('البطاقة المدمجة (طلب المالك 2026-09-03)', () => {
  it('بلا صورة — والعنوان سطر بخصيصة التلميح يُكمل النص كاملًا', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    const mineCard = screen.getByText('دليلي الخاص').closest('.guide-card') as HTMLElement
    expect(mineCard.querySelector('img')).toBeNull()
    expect(mineCard.querySelector('.title')?.getAttribute('title')).toBe('دليلي الخاص')
  })

  it('الظاهر على البطاقة: المشاركة والبوكمارك و«⋯» في الركن وعدد الخطوات — والنجمة محذوفة', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    const mineCard = screen.getByText('دليلي الخاص').closest('.guide-card') as HTMLElement
    expect(within(mineCard).getByLabelText(t('home.share'))).toBeTruthy()
    expect(within(mineCard).getByLabelText(t('home.bookmark'))).toBeTruthy()
    expect(within(mineCard).getByLabelText(t('library.moreActions'))).toBeTruthy()
    expect(within(mineCard).getByText(t('common.steps', { count: '٣' }))).toBeTruthy()
    expect(within(mineCard).queryByLabelText(t('library.star'))).toBeNull()
    expect(within(mineCard).queryByLabelText(t('library.unstar'))).toBeNull()
  })

  it('«⋯» يفتح المعلومات مرتّبة (الموقع والحالة) — ونقر الموقع يرشّح', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    const mineCard = screen.getByText('دليلي الخاص').closest('.guide-card') as HTMLElement
    // المعلومات لا تظهر مكشوفة على البطاقة
    expect(within(mineCard).queryByText('sap.example')).toBeNull()
    fireEvent.click(within(mineCard).getByLabelText(t('library.moreActions')))
    expect(within(mineCard).getByText('sap.example')).toBeTruthy()
    expect(within(mineCard).getByText(t('home.badgePrivate'))).toBeTruthy()
    fireEvent.click(within(mineCard).getByText('sap.example'))
    await waitFor(() => expect(lastListQuery()).toMatchObject({ site: 'sap.example' }))
  })

  it('أدلة الزملاء: بلا حذف ولا مشاركة في القائمة — و🔖 يعمل والكاتب داخلها', async () => {
    renderHome()
    await screen.findByText('دليل زميلي المنشور')
    const card = screen.getByText('دليل زميلي المنشور').closest('.guide-card') as HTMLElement
    fireEvent.click(within(card).getByLabelText(t('library.moreActions')))
    expect(within(card).queryByText(t('common.delete'))).toBeNull()
    expect(within(card).queryByLabelText(t('home.share'))).toBeNull()
    expect(within(card).getByText('Sara')).toBeTruthy()
    const bm = within(card).getByLabelText(t('home.bookmark'))
    fireEvent.click(bm)
    await waitFor(() => expect(client.toggleBookmark).toHaveBeenCalledWith('g2'))
  })
})

describe('عرض القائمة = جدول بأعمدة المرجع', () => {
  it('التبديل للقائمة يبني جدولًا: العنوان/المجلد/الموقع/أُنشئ/عُدِّل/مشاهدات مع المشاهدات الظاهرة', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByLabelText(t('home.list')))
    const table = await screen.findByRole('table')
    for (const head of [t('home.colTitle'), t('home.colFolder'), t('home.colSite'), t('home.colCreated'), t('home.colEdited'), t('home.colViews')]) {
      expect(within(table).getByText(head)).toBeTruthy()
    }
    expect(within(table).getByText('دليل زميلي المنشور')).toBeTruthy()
    // عمود المشاهدات يعرض رقم المشاركة
    expect(table.textContent).toContain('7')
    expect(localStorage.getItem('home.layout')).toBe('list')
  })

  it('رأس «عُدِّل» يبدّل الترتيب ويُرسله للخادم', async () => {
    renderHome()
    await screen.findByText('دليلي الخاص')
    fireEvent.click(screen.getByLabelText(t('home.list')))
    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getByText(t('home.colEdited')))
    await waitFor(() => expect(lastListQuery()).toMatchObject({ sort: 'updated', order: 'asc' }))
  })
})

describe('حالات الفراغ لكل شاشة', () => {
  it('الرئيسية بمساحة فارغة → «ابدأ من هنا» وزر الإنشاء يعمل', async () => {
    renderHome('/', { ...ADMIN_VIEW, counts: { all: 0, mine: 0, published: 0, saved: 0 } }, [])
    await screen.findByText(t('home.startTitle'))
    fireEvent.click(screen.getAllByText(t('library.newGuide'))[0]!)
    await waitFor(() => expect(client.createGuide).toHaveBeenCalled())
  })

  it('أنشئ بواسطي فارغ → «لم تنشئ أدلة بعد» — والمحفوظات فارغة → «لا محفوظات بعد»', async () => {
    renderHome('/mine', ADMIN_VIEW, [])
    await screen.findByText(t('home.mineEmpty'))
    renderHome('/saved', ADMIN_VIEW, [])
    await screen.findByText(t('home.savedEmpty'))
  })

  it('فلاتر بلا نتائج → رسالة النتائج وزر المسح — والمشاهد يرى رسالته', async () => {
    renderHome('/?visibility=private&when=week', ADMIN_VIEW, [])
    await screen.findByText(t('home.noResults'))
    expect(screen.getAllByText(t('home.clearFilters')).length).toBeGreaterThan(0)
    renderHome('/', { ...ADMIN_VIEW, myRole: 'viewer', counts: { all: 0, mine: 0, published: 0, saved: 0 } }, [])
    await screen.findByText(t('home.viewerEmpty'))
  })
})
