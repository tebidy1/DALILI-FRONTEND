import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { FolderDto, LibraryOverviewDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { SettingsPage } from './SettingsPage'

/**
 * المرحلة هـ (الإعداد — WS-09): شاشة الفهرس — بطاقة بيانات المساحة (اسم/دور/بريد)،
 * بطاقات مداخل بعداداتها (أدلتي/المنشورة/المحفوظات/الفريق/التقارير) تقود للشاشات،
 * ومدير مجلدات مدمج (مجلدات مساحية بعد الترقية). زر المحرر «المكتبة» صار «الإعداد».
 */

vi.mock('../api', () => ({
  client: {
    libraryOverview: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
  },
  webShareUrl: (u: string) => u,
}))

const OVERVIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  counts: { all: 12, mine: 12, published: 3, saved: 2 },
  sites: [],
}

const FOLDERS: FolderDto[] = [
  { id: 'f1', name: 'فواتير أكتوبر', count: 0, createdAt: '2026-09-01T00:00:00Z' },
]

const COUNTS: Record<string, string> = {}

function LocationProbe() {
  const loc = useLocation()
  COUNTS.path = loc.pathname
  return null
}

function renderSettings(overview: LibraryOverviewDto = OVERVIEW, folders: FolderDto[] = FOLDERS) {
  vi.mocked(client.libraryOverview).mockResolvedValue(overview)
  vi.mocked(client.listFolders).mockResolvedValue(folders)
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <OverviewProvider>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/mine" element={<LocationProbe />} />
          <Route path="/saved" element={<LocationProbe />} />
          <Route path="/team" element={<LocationProbe />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </OverviewProvider>
    </MemoryRouter>,
  )
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  delete COUNTS.path
})

describe('شاشة الإعداد — فهرس كل شيء (المرحلة هـ)', () => {
  it('بطاقة بيانات المساحة: الاسم والدور والبريد — وملاحظة صدق أن التعديل لاحقًا', async () => {
    renderSettings()
    await screen.findByText('مساحة الفواتير')
    expect(screen.getByText('owner@dalili.sa')).toBeTruthy()
    expect(screen.getByText(t('home.roleAdmin'))).toBeTruthy()
    expect(screen.getByText(t('settings.laterNote'))).toBeTruthy()
  })

  it('بطاقات المداخل بعداداتها من overview بأرقام عربية — والنقر يقود للشاشة', async () => {
    renderSettings()
    await screen.findByText('مساحة الفواتير')

    const guidesCard = screen.getByText(t('settings.myGuides')).closest('.settings-card') as HTMLElement
    expect(within(guidesCard).getByText('١٢')).toBeTruthy()
    const publishedCard = screen.getByText(t('settings.published')).closest('.settings-card') as HTMLElement
    expect(within(publishedCard).getByText('٣')).toBeTruthy()
    const savedCard = screen.getByText(t('settings.saved')).closest('.settings-card') as HTMLElement
    expect(within(savedCard).getByText('٢')).toBeTruthy()

    fireEvent.click(within(guidesCard).getByText(t('settings.open')))
    await waitFor(() => expect(COUNTS.path).toBe('/mine'))
  })

  it('مدير المجلدات المدمج: إنشاء بحقل وحذف بتأكيد — مجلدات المساحة بعداداتها', async () => {
    vi.mocked(client.createFolder).mockResolvedValue({ id: 'f2', name: 'عقود', count: 0, createdAt: '2026-09-03T00:00:00Z' })
    renderSettings()
    await screen.findByText('فواتير أكتوبر')

    fireEvent.change(screen.getByLabelText(t('settings.newFolder')), { target: { value: 'عقود' } })
    fireEvent.click(screen.getByText(t('settings.createFolder')))
    await waitFor(() => expect(vi.mocked(client.createFolder)).toHaveBeenCalledWith('عقود'))

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByLabelText(`${t('common.delete')} — فواتير أكتوبر`))
    await waitFor(() => expect(vi.mocked(client.deleteFolder)).toHaveBeenCalledWith('f1'))
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('فواتير أكتوبر')
  })

  it('المشاهد: بطاقات المداخل تقرأ، ومدير المجلدات بلا كتابة (لا إنشاء ولا حذف)', async () => {
    renderSettings({ ...OVERVIEW, myRole: 'viewer', counts: { all: 1, mine: 0, published: 1, saved: 0 } })
    await screen.findByText('مساحة الفواتير')
    expect(screen.queryByLabelText(t('settings.newFolder'))).toBeNull()
    expect(screen.queryByText(t('settings.createFolder'))).toBeNull()
    expect(screen.getByText(t('team.readonlyNote'))).toBeTruthy()
  })
})
