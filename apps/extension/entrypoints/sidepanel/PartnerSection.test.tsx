// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoverGuideDto } from '@dalili/shared'
import { DiscoverArea } from './ListStates'

// قرار المالك 2026-10-31: أدلة الشريك مجموعة مستقلة أسفل أدلة الشركة، وشريطها زر وعنوان معاً:
// الضغطة الأولى ترفعها إلى أعلى اللوحة، والثانية تعيد الموظف إلى حيث كان

const partner = { id: 'p1', name: 'نُظم للحلول' }
const own = (id: string, title: string): DiscoverGuideDto => ({ id, title, updatedAt: '', views: 0, source: 'company' })
const official = (id: string, title: string): DiscoverGuideDto => ({ id, title, updatedAt: '', views: 0, source: 'official', partner, creatorName: partner.name })
const ready = (company: DiscoverGuideDto[], partnerGuides: DiscoverGuideDto[]) => ({ status: 'ready' as const, data: { count: company.length, onScreen: [], onSite: company, official: partnerGuides } })
const area = (state: ReturnType<typeof ready>) => render(<DiscoverArea state={state} canCreate onRetry={vi.fn()} onStart={vi.fn()} />)
const bar = () => screen.getByRole('button', { name: /أدلة الشريك/ })

let scrollTo: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollTo = vi.fn()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})
afterEach(cleanup)

describe('أدلة الشريك في قائمة الإضافة', () => {
  it('مجموعة مستقلة بعد أدلة الشركة، وشريطها يحمل اسم الشريك وعدد أدلته', () => {
    area(ready([own('a', 'اعتماد فاتورة')], [official('o1', 'فاتورة مبدئية'), official('o2', 'دفعة عميل')]))
    const companyRow = screen.getByRole('link', { name: /^اعتماد فاتورة/ })
    expect(bar().textContent).toContain('نُظم للحلول')
    expect(bar().textContent).toContain('دليلان')
    expect(companyRow.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar().compareDocumentPosition(screen.getByRole('link', { name: /^فاتورة مبدئية/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar().getAttribute('aria-expanded')).toBe('false')
  })

  it('الضغطة الأولى ترفع القائمة، والثانية تعيده إلى موضعه', () => {
    area(ready([own('a', 'اعتماد فاتورة')], [official('o1', 'فاتورة مبدئية')]))
    Object.defineProperty(window, 'scrollY', { value: 140, configurable: true })
    fireEvent.click(bar())
    expect(bar().getAttribute('aria-expanded')).toBe('true')
    expect(scrollTo).toHaveBeenCalledTimes(1)
    fireEvent.click(bar())
    expect(bar().getAttribute('aria-expanded')).toBe('false')
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 140 }))
  })

  it('الشركة بلا أدلة: جملة «لا دليل» ثم شريط الشريك تحتها', () => {
    area(ready([], [official('o1', 'فاتورة مبدئية')]))
    const empty = screen.getByText('لا دليل لهذه الشاشة بعد')
    expect(empty.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: /^فاتورة مبدئية/ })).toBeTruthy()
  })

  it('لا أدلة شريك: لا شريط', () => {
    area(ready([own('a', 'اعتماد فاتورة')], []))
    expect(screen.queryByRole('button', { name: /أدلة الشريك/ })).toBeNull()
  })
})
