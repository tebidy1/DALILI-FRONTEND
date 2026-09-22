import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { SearchResponseDto } from '@dalili/shared'
import { SearchPage } from './SearchPage'

vi.mock('../api', () => ({
  client: {
    search: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
  },
}))

import { client } from '../api'

/** SRCH-01: نتيجة البحث تعرض مصغّرة الدليل لا اللقطة الأصلية */
function response(thumbUrl?: string): SearchResponseDto {
  return {
    hits: [
      {
        guideId: 'g1',
        guideTitle: 'دليل فحص المصغّرات',
        stepId: 's1',
        stepNo: 2,
        field: 'step_title',
        snippet: 'افتح <mark>الفحص</mark>',
        updatedAt: new Date('2026-08-01').toISOString(),
        score: 1.5,
        ...(thumbUrl ? { thumbFileId: 'th-1', thumbUrl } : {}),
      },
    ],
    total: 1,
    tookMs: 4,
    query: { raw: 'الفحص', normalized: 'الفحص' },
  }
}

function renderPage(q: string) {
  return render(
    <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(q)}`]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SRCH-01: مصغّرة نتائج البحث', () => {
  it('النتيجة ذات thumbUrl تعرض المصغّرة برابطها الموقَّع كما هو (خصوصيّة ٢ب)', async () => {
    vi.mocked(client.search).mockResolvedValue(response('/files/th-1?e=1&c=sig'))
    const { container } = renderPage('الفحص')
    const img = await waitFor(() => {
      const el = container.querySelector<HTMLImageElement>('img.hit-thumb')
      expect(el).toBeTruthy()
      return el!
    })
    expect(img.getAttribute('src')).toBe('/files/th-1?e=1&c=sig')
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('نتيجة بلا مصغّرة لا تعرض صورة إطلاقًا', async () => {
    vi.mocked(client.search).mockResolvedValue(response())
    const { container } = renderPage('الفحص')
    await waitFor(() => expect(screen.getByText(/دليل فحص المصغّرات/)).toBeTruthy())
    expect(container.querySelector('img')).toBeNull()
  })
})

/** SRCH-06: نتيجة دلالية — دليل كامل لا خطوة، مرتبًا من الأقرب معنىً */
function responseWithSemantic(partial: Partial<SearchResponseDto>): SearchResponseDto {
  return {
    ...response(),
    semantic: [
      { guideId: 'g-inv', guideTitle: 'إخراج الفاتورة النهائية', score: 0.88, updatedAt: new Date('2026-07-15').toISOString() },
      { guideId: 'g-req', guideTitle: 'اعتماد أمر الشراء', score: 0.81, updatedAt: new Date('2026-06-02').toISOString() },
    ],
    ...partial,
  }
}

describe('SRCH-06: قسم «أقرب الأدلة معنًى»', () => {
  it('يعرض قائمة عناوين مرتبة يختار منها — كل عنوان رابط لدليله', async () => {
    vi.mocked(client.search).mockResolvedValue(responseWithSemantic({}))
    const { container } = renderPage('كيف أعتمد فاتورة')
    const section = await waitFor(() => {
      const el = container.querySelector('.semantic-section')
      expect(el).toBeTruthy()
      return el!
    })
    const links = Array.from(section.querySelectorAll('a.semantic-hit'))
    expect(links.length).toBe(2)
    expect(links[0]!.getAttribute('href')).toBe('/g/g-inv')
    expect(links[1]!.getAttribute('href')).toBe('/g/g-req')
    expect(screen.getByText('إخراج الفاتورة النهائية')).toBeTruthy()
  })

  it('الحرفي خالٍ والدلالي حاضر: تظهر لافتة الصدق أن الحرفي لم يجد شيئًا', async () => {
    vi.mocked(client.search).mockResolvedValue(
      responseWithSemantic({ hits: [], total: 0 }),
    )
    renderPage('كيف أعتمد فاتورة')
    await waitFor(() => expect(screen.getByText('إخراج الفاتورة النهائية')).toBeTruthy())
    // الحرفي بلا نتائج لا يعطي «لا نتائج» الصاعقة — القائمة الدلالية هي الجواب
    expect(screen.queryByText(/لا نتائج لهذا البحث/)).toBeNull()
    expect(screen.getByText(/لم يجد البحث الحرفي تطابقًا/)).toBeTruthy()
  })

  it('تعذّر الدلالي = سبب عربي صادق يُعرض ولا يُخفى', async () => {
    vi.mocked(client.search).mockResolvedValue(
      responseWithSemantic({ semantic: undefined, semanticReason: 'البحث بالمعنى يجهّز نفسه الآن — أعد المحاولة بعد لحظات' }),
    )
    renderPage('فاتورة')
    await waitFor(() => expect(screen.getByText(/دليل فحص المصغّرات/)).toBeTruthy())
    expect(screen.getByText(/يجهّز نفسه الآن/)).toBeTruthy()
  })

  it('بلا دلالي ولا سبب: لا قسم ولا لافتة — الحرفي كما هو', async () => {
    vi.mocked(client.search).mockResolvedValue(response())
    const { container } = renderPage('الفحص')
    await waitFor(() => expect(screen.getByText(/دليل فحص المصغّرات/)).toBeTruthy())
    expect(container.querySelector('.semantic-section')).toBeNull()
  })
})
