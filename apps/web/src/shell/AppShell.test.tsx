import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { FolderDto, LibraryOverviewDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { AppShell } from './AppShell'

/**
 * الشريط الجانبي على نمط المرجع (سكرايب معكوسًا RTL): البحث أعلاه، بنود التنقل
 * الخمسة (الرئيسية · أنشئ بواسطي · المحفوظات · الفريق · الإعداد)، قسم المساحة
 * (كل المستندات · السلة · المجلدات بCrud)، وأسفله «دعوة زميل» وبطاقة المستخدم.
 */

vi.mock('../api', () => ({
  client: {
    libraryOverview: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn().mockResolvedValue({ id: 'f9', name: 'x', count: 0, createdAt: '2026-01-01T00:00:00Z' }),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  },
  webShareUrl: (u: string) => u,
}))

const ADMIN: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  myTheme: 'brand',
  counts: { all: 12, mine: 7, published: 3, saved: 5 },
  sites: [{ site: 'sap.example', count: 3 }],
}

const FOLDERS: FolderDto[] = [{ id: 'f1', name: 'الفواتير', count: 2, createdAt: '2026-01-01T00:00:00Z' }]

/** مجسّ مسار — يعرض العنوان الحالي من الراوتر (MemoryRouter لا يمس window.location) */
function Probe() {
  const location = useLocation()
  return <div data-testid="probe">{location.pathname + location.search}</div>
}

function renderShell(at = '/', overview: LibraryOverviewDto = ADMIN, folders: FolderDto[] = FOLDERS) {
  vi.mocked(client.libraryOverview).mockResolvedValue(overview)
  vi.mocked(client.listFolders).mockResolvedValue(folders)
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Probe />} />
          <Route path="/mine" element={<Probe />} />
          <Route path="/saved" element={<Probe />} />
          <Route path="/trash" element={<Probe />} />
          <Route path="/settings" element={<Probe />} />
          <Route path="/team" element={<div>صفحة الفريق</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('الشريط الجانبي بنمط المرجع (WS-06)', () => {
  it('هوية البراند: رمز درج المسار svg يجاور اسم «دليلي» في رأس الشريط الجانبي', async () => {
    renderShell()
    await screen.findAllByText('مساحة الفواتير')
    const sideBrand = screen.getByText(t('app.name')).closest('.side-brand') as HTMLElement
    expect(sideBrand.querySelector('svg.brand-mark')).toBeTruthy()
  })

  it('يعرض اسم المساحة وبنود التنقل الخمسة وقسم المساحة و«دعوة زميل» وبريد المستخدم — والبحث انتقل لمتن الشاشات (طلب المالك)', async () => {
    renderShell()
    expect(await screen.findAllByText('مساحة الفواتير')).toBeTruthy()
    // البحث لم يعد في الشريط الجانبي — عنصر أساسي يعرض في متن الشاشات الأولى
    expect(screen.queryByPlaceholderText(t('library.searchHintShort'))).toBeNull()
    for (const label of [t('home.navHome'), t('home.navMine'), t('home.navSaved'), t('home.navTeam'), t('home.navSettings')]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(t('home.wsAllDocs'))).toBeTruthy()
    expect(screen.getByText(t('home.viewTrash'))).toBeTruthy()
    expect(screen.getByText(t('home.invite'))).toBeTruthy()
    expect(screen.getByText('owner@dalili.sa')).toBeTruthy()
    expect(screen.getByText(t('home.roleAdmin'))).toBeTruthy()
    // إنشاء المجلد بذر «+» في رأس القسم (نمط Team Directory المرفق) لا حقل دائم
    expect(screen.queryByPlaceholderText(t('library.newFolder'))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('library.addFolder') }))
    expect(screen.getByPlaceholderText(t('library.newFolder'))).toBeTruthy()
    // بند المجلد بشارة حرف وعدد الأدلة في الطرف المقابل (نمط المرجع)
    const folderRow = screen.getByText('الفواتير').closest('.side-item') as HTMLElement
    expect(folderRow.textContent).toContain(arDigits(2))
  })

  it('المشاهد: لا إنشاء مجلد ولا أزرار ✎/× على المجلدات — وشارة دوره «مشاهد»', async () => {
    renderShell('/', { ...ADMIN, myRole: 'viewer' })
    await screen.findAllByText('مساحة الفواتير')
    expect(screen.queryByPlaceholderText(t('library.newFolder'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('library.addFolder') })).toBeNull()
    expect(screen.queryByLabelText(`${t('library.folderRename')}: الفواتير`)).toBeNull()
    expect(screen.getByText(t('home.roleViewer'))).toBeTruthy()
    // بنود التنقل ظاهرة للمشاهد كي يتصفح ما ينشر
    expect(screen.getAllByText(t('home.navHome')).length).toBeGreaterThan(0)
  })

  it('زر «+» يكشف حقل الإنشاء — Enter ينشئ ويغلق الحقل (نمط المرجع)', async () => {
    renderShell()
    await screen.findAllByText('مساحة الفواتير')
    fireEvent.click(screen.getByRole('button', { name: t('library.addFolder') }))
    const input = screen.getByPlaceholderText(t('library.newFolder'))
    fireEvent.change(input, { target: { value: 'المخازن' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(vi.mocked(client.createFolder)).toHaveBeenCalledWith('المخازن'))
    expect(screen.queryByPlaceholderText(t('library.newFolder'))).toBeNull()
  })

  it('البحث في المجلدات يرشّح القائمة ويعرض «لا نتائج» عند الخواء', async () => {
    renderShell('/', ADMIN, [
      FOLDERS[0]!,
      { id: 'f2', name: 'المخازن', count: 5, createdAt: '2026-01-02T00:00:00Z' },
    ])
    await screen.findAllByText('مساحة الفواتير')
    const search = screen.getByPlaceholderText(t('library.searchFolders'))
    fireEvent.change(search, { target: { value: 'فوات' } })
    expect(screen.getByText('الفواتير')).toBeTruthy()
    expect(screen.queryByText('المخازن')).toBeNull()
    fireEvent.change(search, { target: { value: 'غير موجود' } })
    expect(screen.getByText(t('library.noFolderResults'))).toBeTruthy()
  })

  it('بنود التنقل روابط حقيقية: «أنشئ بواسطي» إلى /mine و«السلة» إلى /trash', async () => {
    renderShell()
    await screen.findAllByText('مساحة الفواتير')
    fireEvent.click(screen.getByText(t('home.navMine')))
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('/mine'))
    fireEvent.click(screen.getByText(t('home.viewTrash')))
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('/trash'))
  })

  it('البند النشط يتميّز: «أنشئ بواسطي» عند /mine', async () => {
    renderShell('/mine')
    await screen.findAllByText('مساحة الفواتير')
    const mine = screen.getByText(t('home.navMine')).closest('.side-item')
    expect(mine?.className).toContain('sel')
    expect(screen.getByText(t('home.navHome')).closest('.side-item')?.className).not.toContain('sel')
  })

  it('نقر مجلد يضبط مرشّح المجلد على الرئيسية ويُزال بنقرة ثانية', async () => {
    renderShell('/')
    await screen.findByText('الفواتير')
    fireEvent.click(screen.getByText('الفواتير'))
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('/?folder=f1'))
    fireEvent.click(screen.getByText('الفواتير'))
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('/'))
  })

  it('«دعوة زميل» ينقل لشاشة الفريق', async () => {
    renderShell()
    await screen.findAllByText('مساحة الفواتير')
    fireEvent.click(screen.getByText(t('home.invite')))
    expect(await screen.findByText('صفحة الفريق')).toBeTruthy()
  })

  it('بطاقة المستخدم: خروج يستدعي logout', async () => {
    const client = renderShell()
    await screen.findAllByText('مساحة الفواتير')
    fireEvent.click(screen.getByText(t('common.logout')))
    await waitFor(() => expect(client.logout).toHaveBeenCalled())
  })
})
