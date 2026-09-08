import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FolderDto, LibraryOverviewDto, ListGuidesDto } from '@dalili/shared'
import { client } from '../api'
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
  myTheme: 'brand',
  counts: { all: 0, mine: 0, published: 0, saved: 0 },
  sites: [],
}
const EMPTY: ListGuidesDto = { items: [], total: 0, page: 1, limit: 24 }
const FOLDERS: FolderDto[] = []

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('VER-02: HomePage تلتقط لافتة معلّقة من sessionStorage', () => {
  it('تعرض النص عند التركيب ثم تمسحه', async () => {
    sessionStorage.setItem('dalili:pendingNotice', 'نُقل إلى السلة')
    vi.mocked(client.listGuides).mockResolvedValue(EMPTY)
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
    expect(await screen.findByText('نُقل إلى السلة')).toBeTruthy()
    await waitFor(() => expect(sessionStorage.getItem('dalili:pendingNotice')).toBeNull())
  })

  it('لا تعرض شيئًا إن كان sessionStorage فارغًا', async () => {
    vi.mocked(client.listGuides).mockResolvedValue(EMPTY)
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
    // ننتظر تحميل البيانات ثم نتأكد لا لافتة
    await waitFor(() => expect(vi.mocked(client.listGuides)).toHaveBeenCalled())
    expect(screen.queryByText('نُقل إلى السلة')).toBeNull()
  })
})
