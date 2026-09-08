import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { VersionView } from './VersionView'
import { client } from '../api'

vi.mock('../api', () => ({
  client: {
    getVersion: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture() {
  return {
    id: 'v1',
    guideId: 'g1',
    createdAt: '2026-09-01T10:00:00Z',
    authorId: 'u1',
    guide: {
      id: 'g1',
      schemaVersion: 1 as const,
      title: 'قديم',
      locale: 'ar' as const,
      dir: 'rtl' as const,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
      steps: [],
    },
  }
}

function mount(url = '/g/g1/v/v1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/g/:id/v/:vid" element={<VersionView />} />
        <Route path="/g/:id" element={<div>EDITOR</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VER-01: VersionView', () => {
  beforeEach(() => {
    vi.mocked(client.getVersion).mockResolvedValue(fixture())
  })

  it('يعرض العنوان القديم داخل شريط «عرض فقط»', async () => {
    mount()
    expect(await screen.findByText(/عرض فقط/)).toBeTruthy()
    expect(await screen.findByText('قديم')).toBeTruthy()
  })

  it('يخلو من أزرار المحرر («تعديل»، «مشاركة»، «المزيد من الخيارات»)', async () => {
    mount()
    await screen.findByText('قديم')
    expect(screen.queryByText('تعديل')).toBeNull()
    expect(screen.queryByText('مشاركة')).toBeNull()
    expect(screen.queryByLabelText('المزيد من الخيارات')).toBeNull()
  })

  it('لا يستدعي updateGuide أبدًا', async () => {
    mount()
    await screen.findByText('قديم')
    // ننتظر أي useEffect ممكن أن يفعّل حفظًا مؤجّلًا
    await new Promise((r) => setTimeout(r, 50))
    expect(client.updateGuide).not.toHaveBeenCalled()
  })

  it('«العودة» ينقل إلى /g/:id', async () => {
    mount()
    fireEvent.click(await screen.findByText('العودة للنسخة الحالية'))
    expect(await screen.findByText('EDITOR')).toBeTruthy()
  })

  it('حالة 404 تعرض «الإصدار غير موجود»', async () => {
    vi.mocked(client.getVersion).mockRejectedValueOnce(new Error('getVersion 404'))
    mount()
    expect(await screen.findByText('الإصدار غير موجود')).toBeTruthy()
  })

  it('نسخة بخطوة واحدة تعرض بطاقة الخطوة', async () => {
    const f = fixture()
    ;(f.guide.steps as unknown[]).push({
      id: 's1',
      kind: 'click',
      title: 'اضغط',
      target: {},
      sensitive: false,
      url: 'https://x',
      pageTitle: 'ص',
      ts: 1,
      screenshot: { fileId: 'f1', blurRects: [] },
    })
    vi.mocked(client.getVersion).mockResolvedValueOnce(f)
    mount()
    // عنوان الخطوة يظهر داخل بطاقة الخطوة
    await waitFor(() => expect(screen.getByText('اضغط')).toBeTruthy())
  })
})
