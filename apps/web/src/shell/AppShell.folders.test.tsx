import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FolderDto, LibraryOverviewDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { AppShell } from './AppShell'

/**
 * LIB-02 في موضعه الجديد: إدارة المجلدات انتقلت من صف الرقاقات في المكتبة
 * إلى قسم «المجلدات» في الشريط الجانبي — بنفس التدفقات الخمسة المقيَّسة سابقًا.
 */

vi.mock('../api', () => ({
  client: {
    libraryOverview: vi.fn(),
    listFolders: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
    createGuide: vi.fn().mockResolvedValue({ id: 'g-new' }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
  webShareUrl: (u: string) => u,
}))

const OVERVIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  myTheme: 'brand',
  counts: { all: 1, mine: 1, published: 0, saved: 0 },
  sites: [],
}

const F1: FolderDto = { id: 'f1', name: 'الفواتير', count: 2, createdAt: '2026-01-01T00:00:00Z' }

async function load() {
  vi.mocked(client.libraryOverview).mockResolvedValue(OVERVIEW)
  vi.mocked(client.listFolders).mockResolvedValue([F1])
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText(F1.name)
  return client
}

const renameBtn = () => screen.getByRole('button', { name: `${t('library.folderRename')}: ${F1.name}` })
const renameInput = () => screen.getByLabelText(t('library.folderRenamePrompt'))

describe('LIB-02 إعادة تسمية المجلد — من الشريط الجانبي', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('زر إعادة التسمية يفتح حقلًا معبأً بالاسم الحالي', async () => {
    await load()
    fireEvent.click(renameBtn())
    expect((renameInput() as HTMLInputElement).value).toBe('الفواتير')
  })

  it('الحفظ يستدعي renameFolder بالاسم الجديد ثم يُحدّث القائمة ويُعلن النجاح ويغلق الحقل', async () => {
    const client = await load()
    vi.mocked(client.renameFolder).mockResolvedValue(F1)
    fireEvent.click(renameBtn())
    fireEvent.change(renameInput(), { target: { value: 'المدفوعات' } })
    fireEvent.click(screen.getByRole('button', { name: t('library.folderRenameSave') }))
    await waitFor(() => expect(client.renameFolder).toHaveBeenCalledWith('f1', 'المدفوعات'))
    await screen.findByText(t('library.folderRenamed'))
    await waitFor(() => expect(client.listFolders).toHaveBeenCalledTimes(2))
    expect(screen.queryByLabelText(t('library.folderRenamePrompt'))).toBeNull()
  })

  it('التراجع يغلق الحقل بلا أي نداء', async () => {
    const client = await load()
    fireEvent.click(renameBtn())
    fireEvent.click(screen.getByRole('button', { name: t('library.folderRenameCancel') }))
    expect(client.renameFolder).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(t('library.folderRenamePrompt'))).toBeNull()
  })

  it('اسم فارغ أو فراغات لا يُرسَل إطلاقًا', async () => {
    const client = await load()
    vi.mocked(client.renameFolder).mockResolvedValue(F1)
    fireEvent.click(renameBtn())
    fireEvent.change(renameInput(), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: t('library.folderRenameSave') }))
    expect(client.renameFolder).not.toHaveBeenCalled()
  })

  it('Enter في الحقل يحفظ وEsc يتراجع', async () => {
    const client = await load()
    vi.mocked(client.renameFolder).mockResolvedValue(F1)
    fireEvent.click(renameBtn())
    fireEvent.change(renameInput(), { target: { value: 'المدفوعات' } })
    fireEvent.keyDown(renameInput(), { key: 'Enter' })
    await waitFor(() => expect(client.renameFolder).toHaveBeenCalledWith('f1', 'المدفوعات'))
    fireEvent.click(renameBtn())
    fireEvent.keyDown(renameInput(), { key: 'Escape' })
    expect(screen.queryByLabelText(t('library.folderRenamePrompt'))).toBeNull()
    expect(client.renameFolder).toHaveBeenCalledTimes(1)
  })

  it('إنشاء مجلد: زر «+» يكشف الحقل، الاسم يُرسل والقائمة تُحدّث والحقل يُغلق (نمط المرجع)', async () => {
    const client = await load()
    vi.mocked(client.createFolder).mockResolvedValue({ id: 'f2', name: 'الموردين', count: 0, createdAt: '2026-01-01T00:00:00Z' })
    fireEvent.click(screen.getByRole('button', { name: t('library.addFolder') }))
    const input = screen.getByPlaceholderText(t('library.newFolder')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'الموردين' } })
    fireEvent.click(screen.getByRole('button', { name: t('library.folderCreate') }))
    await waitFor(() => expect(client.createFolder).toHaveBeenCalledWith('الموردين'))
    await screen.findByText(t('library.folderCreated'))
    await waitFor(() => expect(client.listFolders).toHaveBeenCalledTimes(2))
    expect(screen.queryByPlaceholderText(t('library.newFolder'))).toBeNull()
  })

  it('حذف المجلد بتأكيد — ورسالته تطمئن أن الأدلة تعود ل«كل الأدلة»', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const client = await load()
    fireEvent.click(screen.getByRole('button', { name: `${t('library.folderDelete')}: ${F1.name}` }))
    await waitFor(() => expect(client.deleteFolder).toHaveBeenCalledWith('f1'))
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('كل الأدلة')
    await waitFor(() => expect(client.listFolders).toHaveBeenCalledTimes(2))
  })
})
