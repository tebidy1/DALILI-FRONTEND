import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideSummaryDto, LibraryOverviewDto, ListGuidesDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { HomePage } from './HomePage'

vi.mock('../api', () => ({
  client: {
    listGuides: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    libraryOverview: vi.fn(),
    toggleBookmark: vi.fn().mockResolvedValue({ bookmarked: false }),
  },
  webShareUrl: (u: string) => u,
}))

const OVERVIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  counts: { all: 1, mine: 1, published: 0, saved: 0 },
  sites: [],
}

function guide(partial: Partial<GuideSummaryDto>): GuideSummaryDto {
  return {
    id: 'g1',
    title: 'دليل',
    stepCount: 3,
    starred: false,
    folderId: null,
    tags: [],
    shared: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    commentCount: 0,
    openCommentCount: 0,
    visibility: 'private',
    site: '',
    bookmarked: false,
    mine: true,
    views: 0,
    ownerEmail: 'owner@dalili.sa',
    ...partial,
  }
}

async function loadWith(items: GuideSummaryDto[]) {
  const list: ListGuidesDto = { items, total: items.length, page: 1, limit: 24 }
  vi.mocked(client.listGuides).mockResolvedValue(list)
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
}

beforeEach(() => {
  vi.clearAllMocks()
})

/** GM-05: شارة التعليقات داخل قائمة «⋯» على بطاقة الهوم — البطاقة المدمجة (طلب المالك 2026-09-03) */
describe('شارة التعليقات على بطاقة الهوم', () => {
  it('دليل بتعليقات يظهر 💬 بعددها؛ وبلا نقاط مفتوحة الشارة هادئة', async () => {
    await loadWith([guide({ id: 'g1', title: 'دليل نقاش مغلق', commentCount: 4, openCommentCount: 0 })])
    await screen.findByText('دليل نقاش مغلق')
    fireEvent.click(screen.getByLabelText(t('library.moreActions')))
    const badge = screen.getByText(t('library.commentCount', { count: 4 }))
    expect(badge).toBeTruthy()
    expect(badge.closest('.comment-chip')?.classList.contains('has-open')).toBe(false)
  })

  it('نقاشات مفتوحة: الشارة تُبرَز وتحمل تلميح الرد', async () => {
    await loadWith([guide({ id: 'g2', title: 'دليل بانتظار ردك', commentCount: 2, openCommentCount: 1 })])
    await screen.findByText('دليل بانتظار ردك')
    fireEvent.click(screen.getByLabelText(t('library.moreActions')))
    const chip = screen.getByText(t('library.commentCount', { count: 2 })).closest('.comment-chip')
    expect(chip?.classList.contains('has-open')).toBe(true)
    expect(chip?.getAttribute('title')).toBe(t('library.commentOpenHint', { count: 1 }))
  })

  it('دليل بلا تعليقات: لا شارة أصلًا — لا ضجيج أصفار', async () => {
    await loadWith([guide({ id: 'g3', title: 'دليل صامت', commentCount: 0, openCommentCount: 0 })])
    await screen.findByText('دليل صامت')
    expect(screen.queryByText(t('library.commentCount', { count: 0 }))).toBeNull()
  })
})
