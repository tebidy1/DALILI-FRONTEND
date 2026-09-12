import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideSummaryDto, LibraryOverviewDto, ListGuidesDto, MineReportDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { HomePage } from './HomePage'

/**
 * المرحلة ج (أنشئ بواسطي + التقارير): شريط التقرير المجمّع أعلى «أنشئ بواسطي» فقط
 * (أدلتي · منشورة للمساحة · إجمالي المشاهدات · تنتظر ردًا) بأرقام عربية صادقة،
 * وإجراءات سريعة على بطاقات أدلتي: نشر للمساحة/إرجاع خاص + مشاركة تنسخ الرابط،
 * وعدّاد مشاهدات الدليل على البطاقة.
 */

vi.mock('../api', () => ({
  client: {
    listGuides: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    libraryOverview: vi.fn(),
    myReport: vi.fn(),
    toggleBookmark: vi.fn().mockResolvedValue({ bookmarked: true }),
    createGuide: vi.fn().mockResolvedValue({ id: 'g-new' }),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
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
  commentCount: 2,
  openCommentCount: 2,
  openIssueCount: 2,
  visibility: 'private',
  site: 'sap.example',
  bookmarked: false,
  mine: true,
  views: 0,
  ownerEmail: 'mohamed@dalili.sa',
}

const OVERVIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  myTheme: 'brand',
  counts: { all: 12, mine: 12, published: 3, saved: 2 },
  sites: [{ site: 'sap.example', count: 6 }],
}

const REPORT: MineReportDto = { total: 12, published: 3, views: 148, openComments: 2, openIssues: 2 }

function list(items: GuideSummaryDto[]): ListGuidesDto {
  return { items, total: items.length, page: 1, limit: 24 }
}

function renderHome(at: string, items: GuideSummaryDto[]) {
  vi.mocked(client.libraryOverview).mockResolvedValue(OVERVIEW)
  vi.mocked(client.listGuides).mockResolvedValue(list(items))
  vi.mocked(client.myReport).mockResolvedValue(REPORT)
  render(
    <MemoryRouter initialEntries={[at]}>
      <OverviewProvider>
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

function reportStrip() {
  return screen.getByRole('group', { name: t('home.reportA11y') })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('شريط التقرير المجمّع (المرحلة ج)', () => {
  it('على «أنشئ بواسطي» فقط: أربع بطاقات بأرقام عربية من نداء /api/reports/mine', async () => {
    renderHome('/mine', [MINE])
    await screen.findByText('دليلي الخاص')

    const strip = reportStrip()
    expect(vi.mocked(client.myReport)).toHaveBeenCalled()
    expect(within(strip).getByText(t('home.reportTotal'))).toBeTruthy()
    expect(within(strip).getByText(t('home.reportPublished'))).toBeTruthy()
    expect(within(strip).getByText(t('home.reportViews'))).toBeTruthy()
    expect(within(strip).getByText(t('home.reportWaiting'))).toBeTruthy()
    expect(within(strip).getByText('١٢')).toBeTruthy()
    expect(within(strip).getByText('٣')).toBeTruthy()
    expect(within(strip).getByText('١٤٨')).toBeTruthy()
    expect(within(strip).getByText('٢')).toBeTruthy()
  })

  it('لا شريط تقرير على الرئيسية — التقرير تابِع لأدلتي لا للمساحة', async () => {
    renderHome('/', [MINE])
    await screen.findByText('دليلي الخاص')
    expect(screen.queryByRole('group', { name: t('home.reportA11y') })).toBeNull()
  })
})

describe('الإجراءات السريعة على بطاقات أدلتي (المرحلة ج)', () => {
  it('«نشر للمساحة» على الخاص من قائمة «⋯»: PATCH meta بـ visibility=workspace والشارة تقلب إلى منشور — والتقرير يُعاد جلبه', async () => {
    vi.mocked(client.updateGuideMeta).mockResolvedValue({ ...MINE, visibility: 'workspace' })
    renderHome('/mine', [MINE])
    const card = await screen.findByText('دليلي الخاص').then((el) => el.closest('.guide-card') as HTMLElement)

    fireEvent.click(within(card).getByLabelText(t('library.moreActions')))
    fireEvent.click(within(card).getByText(t('home.publish')))
    await waitFor(() =>
      expect(vi.mocked(client.updateGuideMeta)).toHaveBeenCalledWith('g1', { visibility: 'workspace' }),
    )
    await waitFor(() => expect(within(card).getByText(t('home.badgePublished'))).toBeTruthy())
    // علة اللقطة الحية: نشر دون إعادة جلب التقرير يُبقي «منشورة للمساحة» قديمة
    await waitFor(() => expect(vi.mocked(client.myReport).mock.calls.length).toBeGreaterThan(1))
  })

  it('«إرجاع خاص» على المنشور يعكس الاتجاه — نفس الزر يقلب الحالتين', async () => {
    vi.mocked(client.updateGuideMeta).mockResolvedValue({ ...MINE, visibility: 'private' })
    renderHome('/mine', [{ ...MINE, visibility: 'workspace' }])
    const card = await screen.findByText('دليلي الخاص').then((el) => el.closest('.guide-card') as HTMLElement)

    fireEvent.click(within(card).getByLabelText(t('library.moreActions')))
    fireEvent.click(within(card).getByText(t('home.unpublish')))
    await waitFor(() =>
      expect(vi.mocked(client.updateGuideMeta)).toHaveBeenCalledWith('g1', { visibility: 'private' }),
    )
  })

  it('«مشاركة» على غير المشترك المنشور: تنشئ رابطًا ثم تنسخه — ولافتة النسخ تبقى بلا إعادة جلب تمحوها', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    vi.mocked(client.createShare).mockResolvedValue({ token: 'tok1', shareUrl: 'http://x/s/tok1', views: 0 })
    // بوابة النشر قبل الرابط (قرار المالك 2026-09-10): المشاركة على منشور
    renderHome('/mine', [{ ...MINE, visibility: 'workspace' }])
    const card = await screen.findByText('دليلي الخاص').then((el) => el.closest('.guide-card') as HTMLElement)

    fireEvent.click(within(card).getByLabelText(t('home.share')))
    await waitFor(() => expect(vi.mocked(client.createShare)).toHaveBeenCalledWith('g1'))
    await waitFor(() => expect(screen.getByText(t('home.shareCopied'))).toBeTruthy())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/s/tok1')
    // علة اللقطة الحية: إعادة جلب القائمة بعد المشاركة تمسح اللافتة لحظة ظهورها — الرقاقة تُحدَّث موضعيًا بدلًا منه
    expect(vi.mocked(client.listGuides).mock.calls.length).toBe(1)
    // رقاقة «فتح الرابط» من معلومات قائمة «⋯»
    fireEvent.click(within(card).getByLabelText(t('library.moreActions')))
    await waitFor(() => expect(within(card).getByText(t('common.sharedOpen'))).toBeTruthy())
  })

  it('«مشاركة» على المشترك: تنسخ الرابط القائم بلا إنشاء رابط جديد', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    renderHome('/mine', [{ ...MINE, visibility: 'workspace', shared: true, shareUrl: 'http://x/s/live' }])
    const card = await screen.findByText('دليلي الخاص').then((el) => el.closest('.guide-card') as HTMLElement)

    fireEvent.click(within(card).getByLabelText(t('home.share')))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/s/live'))
    expect(vi.mocked(client.createShare)).not.toHaveBeenCalled()
  })

  it('قرار المالك 2026-09-11: «مشاركة» على دليل خاص تنشئ رابطًا سريًا وتنسخه بلا نشر', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    vi.mocked(client.createShare).mockResolvedValue({ token: 'tok1', shareUrl: 'http://x/s/tok1', views: 0 })
    renderHome('/mine', [MINE]) // دليلي الخاص: private
    const card = await screen.findByText('دليلي الخاص').then((el) => el.closest('.guide-card') as HTMLElement)

    fireEvent.click(within(card).getByLabelText(t('home.share')))
    await waitFor(() => expect(vi.mocked(client.createShare)).toHaveBeenCalledWith('g1'))
    await waitFor(() => expect(screen.getByText(t('home.shareSecretCopied'))).toBeTruthy())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/s/tok1')
    // الرابط السري لا يغيّر رؤية الدليل — يبقى خاصًا خارج بحث المساحة
    expect(vi.mocked(client.updateGuideMeta)).not.toHaveBeenCalled()
  })

  it('أدلة الزملاء لا تحمل أزرار نشر ولا مشاركة — القراءة لا الكتابة', async () => {
    renderHome('/', [{ ...MINE, mine: false, ownerEmail: 'sara@dalili.sa', title: 'دليل سارة' }])
    const card = await screen.findByText('دليل سارة').then((el) => el.closest('.guide-card') as HTMLElement)
    expect(within(card).queryByText(t('home.publish'))).toBeNull()
    expect(within(card).queryByText(t('home.share'))).toBeNull()
  })

  it('عدّاد مشاهدات الدليل داخل قائمة «⋯» عند وجود مشاهدات (تقرير لكل دليل)', async () => {
    renderHome('/', [{ ...MINE, mine: false, views: 7, title: 'دليل مشاهد' }])
    const card = await screen.findByText('دليل مشاهد').then((el) => el.closest('.guide-card') as HTMLElement)
    fireEvent.click(within(card).getByLabelText(t('library.moreActions')))
    expect(within(card).getByText('👁 ٧')).toBeTruthy()
  })
})
