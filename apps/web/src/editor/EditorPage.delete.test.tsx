import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto } from '@dalili/shared'
import { EditorPage } from './EditorPage'
import { client } from '../api'

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
    createVersion: vi.fn().mockResolvedValue({ id: 'v1', createdAt: 'x', authorId: 'u1', stepCount: 0, title: 't' }),
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
      title: 'دليلي',
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

function mountAt(url = '/g/g1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('VER-02: حذف الدليل من قائمة «المزيد»', () => {
  beforeEach(() => {
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    vi.mocked(client.deleteGuide).mockResolvedValue(undefined)
  })

  it('«حذف» يفتح حوارًا باسم الدليل داخل النص', async () => {
    mountAt()
    await screen.findByText('دليلي')
    fireEvent.click(screen.getByLabelText('المزيد من الخيارات'))
    fireEvent.click(screen.getByText('حذف'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('نقل الدليل إلى السلة؟')
    // اسم الدليل داخل نص الحوار تحديدًا (ليس رأس الصفحة)
    expect(dialog.textContent).toContain('دليلي')
    expect(screen.getByText('نقل إلى السلة')).toBeTruthy()
  })

  it('«إلغاء» يُغلق بلا نداء deleteGuide', async () => {
    mountAt()
    await screen.findByText('دليلي')
    fireEvent.click(screen.getByLabelText('المزيد من الخيارات'))
    fireEvent.click(screen.getByText('حذف'))
    fireEvent.click(screen.getByText('إلغاء'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(client.deleteGuide).not.toHaveBeenCalled()
  })

  it('«نقل إلى السلة» ينادي deleteGuide، يضع اللافتة، ويرجع للهوم', async () => {
    mountAt()
    await screen.findByText('دليلي')
    fireEvent.click(screen.getByLabelText('المزيد من الخيارات'))
    fireEvent.click(screen.getByText('حذف'))
    fireEvent.click(screen.getByText('نقل إلى السلة'))
    await waitFor(() => expect(client.deleteGuide).toHaveBeenCalledWith('g1', {}))
    await screen.findByText('HOME')
    expect(sessionStorage.getItem('dalili:pendingNotice')).toBe('نُقل إلى السلة')
  })

  it('فشل deleteGuide يُبقي الحوار مفتوحًا ويعرض رسالة الخطأ داخله', async () => {
    vi.mocked(client.deleteGuide).mockRejectedValueOnce(new Error('boom'))
    mountAt()
    await screen.findByText('دليلي')
    fireEvent.click(screen.getByLabelText('المزيد من الخيارات'))
    fireEvent.click(screen.getByText('حذف'))
    fireEvent.click(screen.getByText('نقل إلى السلة'))
    await waitFor(() => expect(client.deleteGuide).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeNull()
    expect(screen.getByText('تعذّر نقل الدليل — أعد المحاولة')).toBeTruthy()
  })

  it('العناصر الأربعة (كرّاسة/تكرار/ترجمة/نقل) معطّلة بـaria-disabled', async () => {
    mountAt()
    await screen.findByText('دليلي')
    fireEvent.click(screen.getByLabelText('المزيد من الخيارات'))
    for (const label of ['إرسال لكرّاسة', 'تكرار', 'ترجمة', 'نقل إلى…']) {
      const el = screen.getByText(label).closest('button')!
      expect(el.getAttribute('aria-disabled')).toBe('true')
    }
    // «الإصدارات» و«حذف» ليستا معطّلتين
    expect(screen.getByText('الإصدارات').closest('button')!.getAttribute('aria-disabled')).toBeNull()
    expect(screen.getByText('حذف').closest('button')!.getAttribute('aria-disabled')).toBeNull()
  })
})
