import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto } from '@dalili/shared'
import { EditorPage } from './EditorPage'
import { client } from '../api'
import { t } from '../i18n'

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    transcribeGuide: vi.fn(),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
    uploadBlob: vi.fn().mockResolvedValue({ fileId: 'up1', thumbFileId: undefined }),
    deleteGuide: vi.fn().mockResolvedValue(undefined),
    createVersion: vi.fn(),
    listVersions: vi.fn().mockResolvedValue({ items: [] }),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(): GuideDetailsDto {
  return {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps: [],
    },
    share: null,
    meta: { starred: false, folderId: null, tags: [] },
  }
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/g/g1']}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VER-01: التقاط لقطة عند «تم»', () => {
  beforeEach(() => {
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    vi.mocked(client.createVersion).mockResolvedValue({
      id: 'v1', createdAt: 'x', authorId: 'u1', stepCount: 0, title: 'دليل',
    })
  })

  it('«تعديل» ثم «تم» يستدعي createVersion', async () => {
    mount()
    await screen.findByText('دليل')
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    await waitFor(() => expect(client.createVersion).toHaveBeenCalledWith('g1'))
  })

  it('فشل createVersion يعرض لافتة editor.versionSaveError ولا يعيد وضع التحرير', async () => {
    vi.mocked(client.createVersion).mockRejectedValueOnce(new Error('x'))
    mount()
    await screen.findByText('دليل')
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    expect(await screen.findByText(/تعذّر حفظ نسخة/)).toBeTruthy()
    // زر «تم» غاب وعاد «تعديل» (الخروج من التحرير حصل)
    expect(screen.queryByRole('button', { name: t('editor.done') })).toBeNull()
    expect(screen.getByRole('button', { name: t('editor.edit') })).toBeTruthy()
  })

  it('عرض عدم النداء عند «تعديل» فقط (لا يُلتقط عند الدخول لوضع التحرير)', async () => {
    mount()
    await screen.findByText('دليل')
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    // لا نداء بعد
    await new Promise((r) => setTimeout(r, 30))
    expect(client.createVersion).not.toHaveBeenCalled()
  })
})
