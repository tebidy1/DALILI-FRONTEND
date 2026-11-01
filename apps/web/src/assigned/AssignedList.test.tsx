import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { AssignedItemDto } from '@dalili/shared'
import { t } from '../i18n'
import { AssignedList } from './AssignedList'
import { assignedItem, course } from './test-fixtures'

const mount = (items: AssignedItemDto[], onContinue = vi.fn(), onOpen = vi.fn(), compact = false) =>
  render(<AssignedList items={items} onOpen={onOpen} onContinue={onContinue} compact={compact} />)

describe('د١: AssignedList — بطاقة الدورة', () => {
  it('لم تبدأ: زر واحد «ابدأ» ومعه عدد الأدلة والوقت التقريبي', () => {
    const onContinue = vi.fn()
    const { getByRole, container } = mount([assignedItem()], onContinue)
    expect(container.textContent).toContain('٢ أدلة · نحو ٢٠ دقيقة')
    fireEvent.click(getByRole('button', { name: 'ابدأ' }))
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 'a1' }))
  })

  it('الدليل المنفرد: الوقت وحده بلا عدد أدلة', () => {
    const single = assignedItem({ kind: 'guide', guideId: 'g1', course: course({ guideId: 'g1', kind: 'guide', items: [{ id: 'g1', title: 'دليل', done: false, type: 'guide', minutes: 1 }], nextItemId: 'g1', minutes: 3 }) })
    const { container } = mount([single])
    expect(container.textContent).toContain('نحو ٣ دقيقة')
    expect(container.textContent).not.toContain('أدلة')
  })

  it('بدأت: «تابع: <التالي>» والتقدّم بالكلمات', () => {
    const started = assignedItem({ openedAt: '2026-09-10T01:00:00Z', course: course({ items: [{ id: 'gA', title: 'فاتورة مبدئية', done: true, type: 'guide', minutes: 1 }, { id: 'gB', title: 'تحصيل دفعة', done: false, type: 'guide', minutes: 1 }], itemsDone: 1, nextItemId: 'gB' }) })
    const { getByRole, container } = mount([started])
    expect(getByRole('button', { name: 'تابع: تحصيل دفعة' })).toBeTruthy()
    expect(container.textContent).toContain('أنهيتَ ١ من ٢')
  })

  it('اكتملت: «أكملتَ» بلا زر', () => {
    const done = assignedItem({ openedAt: 'x', doneAt: '2026-09-11T00:00:00Z', course: course({ itemsDone: 2, nextItemId: null, completedAt: '2026-09-11T00:00:00Z' }) })
    const { queryByRole, container } = mount([done])
    expect(container.textContent).toContain(t('course.completed'))
    expect(queryByRole('button', { name: /ابدأ|تابع/ })).toBeNull()
  })

  it('لا زر «تمّ» يدوي، وسطر الشفافية في العرض الكامل وحده', () => {
    const full = mount([assignedItem()])
    expect(full.container.textContent).not.toContain('تمّ')
    expect(full.container.textContent).toContain(t('course.transparency'))
    full.unmount()
    expect(mount([assignedItem()], vi.fn(), vi.fn(), true).container.textContent).not.toContain(t('course.transparency'))
  })

  it('العنوان يفتح الدورة نفسها', () => {
    const onOpen = vi.fn()
    const { getByText } = mount([assignedItem()], vi.fn(), onOpen)
    fireEvent.click(getByText('فواتير المبيعات'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ guideId: 'bk' }))
  })

  it('بلا أحمر ولا نسبة مئوية', () => {
    expect(mount([assignedItem()]).container.innerHTML).not.toMatch(/red|danger|%/)
  })

  it('حالة فارغة حين لا عناصر', () => {
    expect(mount([]).container.textContent).toContain(t('assigned.empty'))
  })

  it('assigned card counts lessons for a course', () => {
    const c = course({ kind: 'course', items: [...course().items, { id: 'l3', title: 'مرجع', done: false, type: 'page', minutes: 1 }] })
    const { getByText } = mount([assignedItem({ kind: 'course', course: c })])
    expect(getByText(/٣ دروس/)).toBeTruthy()
    expect(getByText(t('assigned.kindCourse'))).toBeTruthy()
  })
})
