import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideSummaryDto, LibraryOverviewDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { GuideMenuActions } from './GuideMenuActions'
import { GuideCard } from './GuideCard'
import { HomePage } from './HomePage'

vi.mock('../api', () => ({
  client: {
    listGuides: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    libraryOverview: vi.fn(),
  },
  webShareUrl: (u: string) => u,
}))

/** ش٢ (§٢٧، المهمة ٦٤): الدليل الرسمي في مكتبة الويب — البطاقة نفسها، منشئها الشريك، وقراءة فقط */

const OFFICIAL: GuideSummaryDto = {
  id: 'og1', title: 'إنشاء فاتورة مبدئية', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', stepCount: 3, kind: 'guide',
  shared: false, starred: false, folderId: null, tags: [], commentCount: 0, openCommentCount: 0, openIssueCount: 0,
  visibility: 'workspace', site: 'demo.odoo.com', bookmarked: false, mine: false, views: 0, ownerEmail: '', ownerName: null,
  access: { owner: false, edit: false, publish: false, moderate: false }, pinned: false, verified: null, suspended: false,
  creatorName: 'نُظم للحلول', source: 'official', partner: { id: 'p1', name: 'نُظم للحلول' }, readerCount: 0, fresh: null,
}

const noop = () => {}

describe('الدليل الرسمي في المكتبة (ش٢)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('البطاقة: منشئها اسم الشريك', () => {
    render(
      <GuideCard g={OFFICIAL} folders={[]} inTrash={false} picked={false} showPick={false} onPick={noop} onOpen={noop} onBookmark={noop} onDuplicate={noop}
        onPublish={noop} onShare={noop} onMove={noop} onRemove={noop} onRestore={noop} onSite={noop} onModerate={vi.fn()} teams={null} />,
    )
    expect(screen.getByText('نُظم للحلول')).toBeTruthy()
  })

  it('القائمة: «افتح» وحده، ولا تغيير قسم ولو كان المدير', () => {
    render(
      <GuideMenuActions g={OFFICIAL} folders={[]} inTrash={false} onOpen={noop} onBookmark={noop} onDuplicate={noop} onPublish={noop}
        onShare={noop} onMove={noop} onRemove={noop} onRestore={noop} onModerate={vi.fn()} teams={[{ id: 'buy', name: 'المشتريات' }]} />,
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([t('common.openEditor')])
    expect(screen.queryByLabelText(t('home.moveTeam'))).toBeNull()
  })

  it('فلتر «المصدر» يظهر حين توجد أدلة رسمية، ويطلبها من الخادم', async () => {
    const overview: LibraryOverviewDto = {
      workspaceName: 'شركة الأفق', myRole: 'viewer', myEmail: 'emp@alofuq.sa', myTheme: 'brand', myLocale: 'ar',
      counts: { all: 3, mine: 0, published: 2, saved: 0, official: 1 }, sites: [],
    }
    vi.mocked(client.libraryOverview).mockResolvedValue(overview)
    vi.mocked(client.listGuides).mockResolvedValue({ items: [OFFICIAL], total: 1, page: 1, limit: 24 })
    render(
      <MemoryRouter initialEntries={['/']}>
        <OverviewProvider>
          <Routes>
            <Route path="/" element={<HomePage screen="home" />} />
          </Routes>
        </OverviewProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t('home.filters')) }, { timeout: 4000 }))
    fireEvent.click(await screen.findByRole('button', { name: t('home.sourceOfficial') }))
    await waitFor(() => expect(client.listGuides).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'official' }), expect.anything()))
  })
})
