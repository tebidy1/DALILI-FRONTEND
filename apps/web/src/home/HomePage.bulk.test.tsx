import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FolderDto, GuideSummaryDto, LibraryOverviewDto, ListGuidesDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { HomePage } from './HomePage'

vi.mock('../api', () => ({
  client: {
    listGuides: vi.fn(),
    listFolders: vi.fn(),
    libraryOverview: vi.fn(),
    deleteGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    logout: vi.fn(),
    toggleBookmark: vi.fn().mockResolvedValue({ bookmarked: false }),
  },
  webShareUrl: (u: string) => u,
}))

const OVERVIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  counts: { all: 3, mine: 3, published: 0, saved: 0 },
  sites: [],
}

/** كل أدلة هذا الملف أدلتي — التحديد الجماعي مقيَّد بأدلتي فحسب (المرحلة ب) */
function guides(n: number): ListGuidesDto {
  const items: GuideSummaryDto[] = Array.from({ length: n }, (_, i) => ({
    id: `g${i + 1}`,
    title: `دليل ${i + 1}`,
    stepCount: 3,
    starred: false,
    folderId: null,
    tags: [] as string[],
    shared: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    commentCount: 0,
    openCommentCount: 0,
    visibility: 'private' as const,
    site: '',
    bookmarked: false,
    mine: true,
    views: 0,
    ownerEmail: 'owner@dalili.sa',
  }))
  return { items, total: n, page: 1, limit: 24 }
}

const FOLDERS: FolderDto[] = [{ id: 'f1', name: 'الفواتير', count: 0, createdAt: '2026-01-01T00:00:00Z' }]

async function load(n = 3) {
  vi.mocked(client.listGuides).mockResolvedValue(guides(n))
  vi.mocked(client.listFolders).mockResolvedValue(FOLDERS)
  vi.mocked(client.libraryOverview).mockResolvedValue(OVERVIEW)
  render(
    <MemoryRouter initialEntries={['/']}>
      <OverviewProvider>
        <Routes>
          <Route path="/" element={<HomePage screen="home" />} />
        </Routes>
      </OverviewProvider>
    </MemoryRouter>,
  )
  await screen.findByText('دليل 1')
  return client
}

const pick = (title: string) => screen.getByRole('button', { name: t('library.selectGuide', { title }) })

/** LIB-05: العمليات الجماعية — تحديد متعدد → نقل/حذف/مشاركة، Shift+Click، Ctrl+A، Esc */
describe('LIB-05 العمليات الجماعية في الهوم', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('لا شريط عمليات قبل التحديد؛ وتحديد بطاقتين يُظهر العدد وزرَّي الحذف والمشاركة', async () => {
    await load()
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(pick('دليل 1'))
    fireEvent.click(pick('دليل 2'))
    expect(screen.getByRole('toolbar')).toBeTruthy()
    expect(screen.getByText(t('library.selectedCount', { count: 2 }))).toBeTruthy()
  })

  it('حذف محددَين يسأل تأكيدًا بالعدد ثم يستدعي الحذف الناعم مرتين ويُخلي التحديد', async () => {
    const client = await load()
    fireEvent.click(pick('دليل 1'))
    fireEvent.click(pick('دليل 3'))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: t('library.bulkDelete') }))
    await waitFor(() => expect(client.deleteGuide).toHaveBeenCalledTimes(2))
    expect(confirmSpy).toHaveBeenCalledWith(t('library.bulkDeleteConfirm', { count: 2 }))
    expect(client.deleteGuide).toHaveBeenCalledWith('g1', { permanent: false })
    expect(client.deleteGuide).toHaveBeenCalledWith('g3', { permanent: false })
    await screen.findByText(t('library.bulkDeleted', { count: 2 }))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('رفض التأكيد يلغي الحذف الجماعي', async () => {
    const client = await load()
    vi.mocked(client.deleteGuide).mockClear()
    fireEvent.click(pick('دليل 2'))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: t('library.bulkDelete') }))
    expect(client.deleteGuide).not.toHaveBeenCalled()
  })

  it('نقل المحددات إلى مجلد يستدعي updateGuideMeta لكل دليل', async () => {
    const client = await load()
    fireEvent.click(pick('دليل 1'))
    fireEvent.click(pick('دليل 2'))
    const select = screen.getByLabelText(t('library.bulkMove'))
    fireEvent.change(select, { target: { value: 'f1' } })
    await waitFor(() => expect(client.updateGuideMeta).toHaveBeenCalledTimes(2))
    expect(client.updateGuideMeta).toHaveBeenCalledWith('g1', { folderId: 'f1' })
    expect(client.updateGuideMeta).toHaveBeenCalledWith('g2', { folderId: 'f1' })
  })

  it('مشاركة المحددات تنشئ روابط لكلٍّ منها', async () => {
    const client = await load(2)
    vi.mocked(client.createShare).mockResolvedValue({ shareUrl: 's-x', views: 0 } as never)
    fireEvent.click(pick('دليل 1'))
    fireEvent.click(pick('دليل 2'))
    fireEvent.click(screen.getByRole('button', { name: t('library.bulkShare') }))
    await waitFor(() => expect(client.createShare).toHaveBeenCalledTimes(2))
    expect(client.createShare).toHaveBeenCalledWith('g1')
    expect(client.createShare).toHaveBeenCalledWith('g2')
  })

  it('Ctrl+A يحدد كل الصفحة وEsc يُخلي التحديد', async () => {
    await load(3)
    fireEvent.keyDown(document, { key: 'a', ctrlKey: true })
    await waitFor(() => expect(screen.getByText(t('library.selectedCount', { count: 3 }))).toBeTruthy())
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull())
  })

  it('Shift+Click يمدد التحديد من البطاقة الأولى إلى الثالثة', async () => {
    await load(3)
    fireEvent.click(pick('دليل 1'))
    fireEvent.click(pick('دليل 3'), { shiftKey: true })
    await waitFor(() => expect(screen.getByText(t('library.selectedCount', { count: 3 }))).toBeTruthy())
  })

  it('أدلة الزملاء لا تدخل التحديد الجماعي — لا زر تحديد عليها', async () => {
    const other: GuideSummaryDto = { ...guides(1).items[0]!, id: 'g9', title: 'دليل زميل', mine: false, visibility: 'workspace' }
    vi.mocked(client.listGuides).mockResolvedValue({ items: [guides(1).items[0]!, other], total: 2, page: 1, limit: 24 })
    vi.mocked(client.listFolders).mockResolvedValue(FOLDERS)
    vi.mocked(client.libraryOverview).mockResolvedValue(OVERVIEW)
    render(
      <MemoryRouter initialEntries={['/']}>
        <OverviewProvider>
          <Routes>
            <Route path="/" element={<HomePage screen="home" />} />
          </Routes>
        </OverviewProvider>
      </MemoryRouter>,
    )
    await screen.findByText('دليل 1')
    expect(screen.queryByRole('button', { name: t('library.selectGuide', { title: 'دليل زميل' }) })).toBeNull()
    // Ctrl+A يحدد أدلتي فقط
    fireEvent.keyDown(document, { key: 'a', ctrlKey: true })
    await waitFor(() => expect(screen.getByText(t('library.selectedCount', { count: 1 }))).toBeTruthy())
  })})
