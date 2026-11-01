// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuideRow, type RowGuide } from './GuideRow'
import { readersTitle } from '@/lib/discover'

afterEach(cleanup)

const g = (over: Partial<RowGuide> = {}): RowGuide => ({ id: 'g1', title: 'إصدار فاتورة', ...over })

describe('GuideRow — PNL-01', () => {
  it('الصف نفسه يبقى رابطًا إلى الدليل في تبويب جديد', () => {
    render(<GuideRow g={g()} sub="منذ ٣ دقيقة" onOpenHere={() => {}} />)
    const link = screen.getByRole('link', { name: /إصدار فاتورة/ })
    expect(link.getAttribute('href')).toMatch(/\/g\/g1$/)
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('زر ↵ شقيق للرابط (لا زر داخل رابط) ويفتح داخل اللوحة بمعرّف الدليل', () => {
    const onOpenHere = vi.fn()
    render(<GuideRow g={g()} onOpenHere={onOpenHere} />)
    const btn = screen.getByRole('button', { name: 'اعرض «إصدار فاتورة» هنا في اللوحة' })
    expect(btn.closest('a')).toBeNull()
    expect(btn.getAttribute('data-guide')).toBe('g1')
    fireEvent.click(btn)
    expect(onOpenHere).toHaveBeenCalledWith('g1')
  })

  it('بلا onOpenHere لا زر', () => {
    render(<GuideRow g={g()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('GuideRow — ت (§٥)', () => {
  it('النجمة و«جديد» و«موثّق» بجانب العنوان', () => {
    const { container } = render(<GuideRow g={g({ pinned: true, fresh: 'new', verified: { at: '2026-10-30T00:00:00Z', byName: 'المدير' } })} />)
    const titleLine = container.querySelector('.doc-t')!
    expect(titleLine.querySelector('.doc-pin')?.textContent).toBe('★')
    expect(titleLine.querySelector('.doc-fresh')?.textContent).toBe('جديد')
    expect(titleLine.querySelector('.doc-ver')?.textContent).toContain('موثّق')
    expect(titleLine.querySelector('.doc-ver')?.getAttribute('title')).toContain('المدير')
  })

  it('«تحديث» لما حُدّث بعد قراءتي', () => {
    const { container } = render(<GuideRow g={g({ fresh: 'updated' })} />)
    expect(container.querySelector('.doc-fresh')?.textContent).toBe('تحديث')
  })

  it('سطر المعلومات: المنشئ و👁 بالعدد وشارة القسم', () => {
    const { container } = render(<GuideRow g={g({ creatorName: 'سارة العتيبي', readerCount: 24, ownerTeamName: 'المالية' })} />)
    const meta = container.querySelector('.doc-m')!
    expect(meta.textContent).toContain('سارة العتيبي')
    expect(meta.querySelector('.doc-eye')?.textContent).toContain('٢٤')
    expect(meta.querySelector('.doc-eye')?.getAttribute('title')).toBe('٢٤ شخصًا فتحوه')
    expect(meta.querySelector('.doc-dept')?.textContent).toBe('المالية')
  })

  it('الدليل الرسمي: اسم الشريك منشئًا', () => {
    const { container } = render(<GuideRow g={g({ source: 'official', creatorName: 'نُظم للحلول', partner: { id: 'p1', name: 'نُظم للحلول' } })} />)
    expect(container.querySelector('.doc-m')?.textContent).toContain('نُظم للحلول')
    expect(container.querySelector('.doc-partner')).not.toBeNull()
  })

  it('ش٢: شعار الشريك بدل حرفه حين يوجد', () => {
    const { container } = render(<GuideRow g={g({ source: 'official', creatorName: 'نُظم للحلول', partner: { id: 'p1', name: 'نُظم للحلول', logoUrl: 'https://api.example/api/logos/partner/p1?v=1' } })} />)
    expect(container.querySelector('img.doc-partner')?.getAttribute('src')).toBe('https://api.example/api/logos/partner/p1?v=1')
  })

  it('«جديد» يختفي محليًا بعد ↵ دون انتظار إعادة التحميل', () => {
    const { container } = render(<GuideRow g={g({ fresh: 'new' })} onOpenHere={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('.doc-fresh')).toBeNull()
  })
})

describe('readersTitle — قواعد العدد العربية', () => {
  it.each([
    [0, 'لم يفتحه أحد بعد'],
    [1, 'شخص واحد فتحه'],
    [2, 'شخصان فتحاه'],
    [5, '٥ أشخاص فتحوه'],
    [24, '٢٤ شخصًا فتحوه'],
  ])('%i', (n, want) => {
    expect(readersTitle(n)).toBe(want)
  })
})
