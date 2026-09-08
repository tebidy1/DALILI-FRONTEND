import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EmbedPicker } from './EmbedPicker'
import { client } from '../api'

vi.mock('../api', () => ({
  client: { listGuides: vi.fn() },
}))

const ITEMS = [
  { id: 'g1', title: 'دليل الفوترة', stepCount: 7, kind: 'guide' },
  { id: 'g2', title: 'كرّاسة قديمة', stepCount: 3, kind: 'booklet' },
  { id: 'g3', title: 'دليل الطلبات', stepCount: 4, kind: 'guide' },
]

function mockList() {
  vi.mocked(client.listGuides).mockResolvedValue({ items: ITEMS, total: 3, page: 1, limit: 50 } as never)
}

describe('EmbedPicker — منتقي الدليل المضمّن (BKL-01)', () => {
  it('يعرض الأدلة ولا يعرض الكرّاسات — الكرّاسة لا تُضمّ داخل كرّاسة', async () => {
    mockList()
    render(<EmbedPicker onPick={() => {}} onClose={() => {}} />)
    expect(await screen.findByText('دليل الفوترة')).toBeTruthy()
    expect(screen.getByText('دليل الطلبات')).toBeTruthy()
    expect(screen.queryByText('كرّاسة قديمة')).toBeNull()
  })

  it('الاختيار يبلّغ onPick بالمعرّف والعنوان وعدد الخطوات', async () => {
    mockList()
    const onPick = vi.fn()
    render(<EmbedPicker onPick={onPick} onClose={() => {}} />)
    fireEvent.click(await screen.findByText('دليل الفوترة'))
    expect(onPick).toHaveBeenCalledWith('g1', 'دليل الفوترة', 7)
  })

  it('البحث الفوري يرشّح بالعنوان', async () => {
    mockList()
    render(<EmbedPicker onPick={() => {}} onClose={() => {}} />)
    await screen.findByText('دليل الفوترة')
    fireEvent.change(screen.getByRole('searchbox', { name: 'ابحث في أدلتك' }), { target: { value: 'الطلبات' } })
    expect(screen.queryByText('دليل الفوترة')).toBeNull()
    expect(screen.getByText('دليل الطلبات')).toBeTruthy()
  })

  it('Esc يغلق المنتقي', async () => {
    mockList()
    const onClose = vi.fn()
    render(<EmbedPicker onPick={() => {}} onClose={onClose} />)
    await screen.findByText('دليل الفوترة')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('فشل الجلب يعرض رسالة عربية محددة لا شاشة فارغة صامتة', async () => {
    vi.mocked(client.listGuides).mockRejectedValue(new Error('down'))
    render(<EmbedPicker onPick={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('تعذّر جلب أدلتك — تأكد من تشغيل الخادم')).toBeTruthy())
  })
})
