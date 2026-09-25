// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto } from '@dalili/shared'
import { EditorPage } from './EditorPage'

/**
 * TRNS-01: زر «ترجمة» في ⋮ — البطاقة الصادقة، النجاح يخزّن الطبقة ويظهر شريحة
 * المعاينة، والمعاينة EN قراءة فقط بعودة سليمة. بلا ترجمة لا شريحة.
 */

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    transcribeGuide: vi.fn(),
    translateGuide: vi.fn(),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(withTx = false): GuideDetailsDto {
  const f: GuideDetailsDto = {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل الإرجاع',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-05T00:00:00Z',
      steps: [
        {
          id: 's1',
          kind: 'click',
          title: 'افتح شاشة الطلبات',
          target: {},
          sensitive: false,
          url: 'https://erp.example.com/orders',
          pageTitle: 'الطلبات',
          ts: 1000,
          note: 'هذه الخطوة مهمة',
          screenshot: { fileId: 'f1', blurRects: [] },
        },
      ],
    },
    share: null,
    meta: { starred: false, folderId: null, tags: [] },
  }
  if (withTx) {
    f.guide.translations = {
      en: {
        title: 'Returns Guide',
        items: { title: 'Returns Guide', 'steps/s1/title': 'Open the orders screen', 'steps/s1/note': 'This step matters' },
        meta: { provider: 'groq:test', createdAt: '2026-01-04T00:00:00Z', sourceUpdatedAt: '2026-01-01T00:00:00Z' },
      },
    }
  }
  return f
}

async function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'المزيد من الخيارات' }))
}

describe('ترجمة الدليل من المحرر TRNS-01', () => {
  beforeEach(async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
  })

  afterEach(cleanup)

  it('الزر المعطّل صار حيًّا: يفتح البطاقة الصادقة، والنجاح يخزّن ويظهر الشريحة والمعاينة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.translateGuide).mockResolvedValue({ guide: fixture(true).guide })

    render(
      <MemoryRouter initialEntries={['/g/g1']}>
        <Routes>
          <Route path="/g/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('دليل الإرجاع')

    await openMore()
    const item = await screen.findByRole('menuitem', { name: /ترجمة/ })
    expect((item as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(item)

    // البطاقة الصادقة
    expect(await screen.findByText(/يُترجَم: العنوان والوصف/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ترجم الآن' }))
    expect(await screen.findByText('جارٍ الترجمة...')).toBeTruthy()

    // النجاح: البطاقة تغلق وتظهر الشريحة
    await waitFor(() => expect(screen.queryByText(/يُترجَم: العنوان/)).toBeNull())
    const chip = await screen.findByRole('button', { name: 'معاينة English' })

    // المعاينة EN قراءة فقط باتجاه LTR
    fireEvent.click(chip)
    const preview = await screen.findByText('Returns Guide')
    expect(preview.closest('.translate-preview')!.getAttribute('dir')).toBe('ltr')
    expect(screen.getByText('Open the orders screen')).toBeTruthy()
    expect(screen.queryByText('افتح شاشة الطلبات')).toBeNull()

    // عودة سليمة للتحرير
    fireEvent.click(screen.getByRole('button', { name: 'عودة للتحرير' }))
    expect(await screen.findByText('افتح شاشة الطلبات')).toBeTruthy()
  })

  it('بلا ترجمة لا تظهر شريحة المعاينة', async () => {
    render(
      <MemoryRouter initialEntries={['/g/g1']}>
        <Routes>
          <Route path="/g/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('دليل الإرجاع')
    expect(screen.queryByRole('button', { name: 'معاينة English' })).toBeNull()
  })
})
