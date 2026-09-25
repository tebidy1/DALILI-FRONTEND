import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PublicGuideDto } from '@dalili/shared'
import { setLocale } from '../lib/locale'
import { ViewerPage } from './ViewerPage'

/**
 * TRNS-01: تراكب العارض — قارئ التطبيق الإنجليزي يرى الترجمة تلقائيًا بحاوية LTR
 * وشارة «مترجم آليًا»، وقارئ العربية يرى الأصل بلا شارة، والسقوط لكل حقل نحو العربية.
 */

vi.mock('../api', () => ({
  client: { publicGuide: vi.fn(), trackShareView: vi.fn().mockResolvedValue(undefined), shareComments: vi.fn().mockResolvedValue({ comments: [] }) },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(): PublicGuideDto {
  return {
    guide: {
      id: 'g1',
      title: 'إصدار فاتورة',
      updatedAt: '2026-01-05T00:00:00Z',
      steps: [
        { id: 's1', title: 'افتح قسم الفواتير', note: 'من القائمة الرئيسية', screenshot: { fileId: 'f1', blurRects: [] } },
        { id: 's2', title: 'خطوة بلا ترجمة', screenshot: { fileId: 'f2', blurRects: [] } },
      ],
      translations: {
        en: {
          title: 'Invoice Issuance',
          items: { title: 'Invoice Issuance', 'steps/s1/title': 'Open the invoices section', 'steps/s1/note': 'From the main menu' },
          meta: { provider: 'groq:test', createdAt: '2026-01-04T00:00:00Z', sourceUpdatedAt: '2026-01-01T00:00:00Z' },
        },
      },
    },
    sharedAt: new Date().toISOString(),
  } as unknown as PublicGuideDto
}

function renderViewer() {
  render(
    <MemoryRouter initialEntries={['/s/tok-1']}>
      <Routes>
        <Route path="/s/:token" element={<ViewerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  setLocale('ar')
  cleanup()
})

describe('تراكب العارض TRNS-01', () => {
  it('قارئ EN يرى التراكب والشارة والحاوية LTR، والخطوة غير المترجمة تسقط لعربتها', async () => {
    setLocale('en')
    vi.mocked((await import('../api')).client.publicGuide).mockResolvedValue(fixture())
    renderViewer()
    expect(await screen.findByText('Invoice Issuance')).toBeTruthy()
    expect(screen.getByText('Open the invoices section')).toBeTruthy()
    expect(screen.getByText('From the main menu')).toBeTruthy()
    // شارة الترجمة الآلية ظاهرة بجوار العنوان
    const badge = await screen.findByText('Auto-translated')
    expect(badge.classList.contains('viewer-auto-badge')).toBe(true)
    // السقوط لكل حقل: الخطوة الثانية بلا ترجمة تبقى بعنوانها العربي
    expect(screen.getByText('خطوة بلا ترجمة')).toBeTruthy()
    // حاوية المحتوى LTR
    expect(document.querySelector('.viewer-page')!.getAttribute('dir')).toBe('ltr')
    // الأصل العربي للعنوان غائب
    expect(screen.queryByText('إصدار فاتورة')).toBeNull()
  })

  it('قارئ AR يرى الأصل كاملًا بلا شارة', async () => {
    vi.mocked((await import('../api')).client.publicGuide).mockResolvedValue(fixture())
    renderViewer()
    expect(await screen.findByText('إصدار فاتورة')).toBeTruthy()
    expect(screen.getByText('افتح قسم الفواتير')).toBeTruthy()
    expect(document.querySelector('.viewer-auto-badge')).toBeNull()
  })
})
