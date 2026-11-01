// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GuideSummaryDto } from '@dalili/shared'
import { EMPTY_FILTERS } from '@/lib/search'
import { SearchPanel } from './SearchPanel'

afterEach(cleanup)

const g = (id: string, title: string, over: Partial<GuideSummaryDto> = {}) =>
  ({ id, title, updatedAt: '2026-10-01T00:00:00.000Z', stepCount: 3, ...over }) as GuideSummaryDto

const library = [
  g('a', 'إصدار فاتورة ضريبية', { pinned: true, creatorName: 'خالد' }),
  g('b', 'إنشاء أمر شراء', { fresh: 'new', creatorName: 'سارة' }),
  g('c', 'اعتماد طلب إجازة', { fresh: 'updated', readerCount: 2, creatorName: 'خالد' }),
  g('d', 'تسوية المخزون الشهرية', { readerCount: 3, creatorName: 'سارة', updatedAt: '2026-09-01T00:00:00.000Z' }),
]

const titles = () => screen.getAllByRole('listitem').map((li) => li.querySelector('bdi')?.textContent)

/** الفلاتر يملكها App — المِحكّ يمسكها كما يمسكها هو */
function Harness(p: { load: () => Promise<GuideSummaryDto[]>; onExit: () => void }) {
  const [f, setF] = useState(EMPTY_FILTERS)
  return <SearchPanel filters={f} onChange={setF} {...p} />
}

async function open(load = vi.fn(async () => library), onExit = vi.fn()) {
  render(<Harness load={load} onExit={onExit} />)
  await screen.findByText('إصدار فاتورة ضريبية')
  return { load, onExit }
}

describe('SearchPanel — بحث اللوحة', () => {
  it('يفتح وحقل البحث في التركيز، والنتائج بالترتيب الأنسب', async () => {
    await open()
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
    expect(titles()).toEqual(['إصدار فاتورة ضريبية', 'اعتماد طلب إجازة', 'إنشاء أمر شراء', 'تسوية المخزون الشهرية'])
    expect(screen.getByText('٤ أدلة')).toBeTruthy()
  })

  it('الكلمة تصفّي فورًا', async () => {
    await open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'شراء' } })
    expect(titles()).toEqual(['إنشاء أمر شراء'])
  })

  it('شارة «جديد» تعمل كمفتاح تبديل، و«مسح الفلاتر» يعيد الكل', async () => {
    await open()
    const chip = screen.getByRole('button', { name: 'جديد' })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toEqual(['إنشاء أمر شراء'])
    fireEvent.click(screen.getByRole('button', { name: 'مسح الفلاتر' }))
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(titles()).toHaveLength(4)
  })

  it('الترتيب والمنشئ من القائمتين', async () => {
    await open()
    fireEvent.change(screen.getByLabelText('الترتيب'), { target: { value: 'readers' } })
    expect(titles()[0]).toBe('تسوية المخزون الشهرية')
    const creator = screen.getByLabelText('المنشئ')
    expect(within(creator).getAllByRole('option').map((o) => o.textContent)).toEqual(['الكل', 'خالد', 'سارة'])
    fireEvent.change(creator, { target: { value: 'سارة' } })
    expect(titles()).toEqual(['تسوية المخزون الشهرية', 'إنشاء أمر شراء'])
  })

  it('لا نتائج: جملة واضحة وزر مسح', async () => {
    await open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'غير موجود' } })
    fireEvent.click(screen.getByRole('button', { name: 'جديد' }))
    expect(screen.getByText('لا أدلة تطابق بحثك')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'مسح الفلاتر' }).length).toBeGreaterThan(0)
  })

  it('Esc يمسح الكلمة أولاً ثم يخرج، وزر الرجوع يخرج', async () => {
    const { onExit } = await open()
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'شراء' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect((box as HTMLInputElement).value).toBe('')
    expect(onExit).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }))
    expect(onExit).toHaveBeenCalledTimes(2)
  })

  it('فشل الجلب: خطأ معلن و«أعد المحاولة» يعيد الطلب', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(library)
    render(<Harness load={load} onExit={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'أعد المحاولة' }))
    await screen.findByText('إصدار فاتورة ضريبية')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
