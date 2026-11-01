import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CourseStateDto } from '@dalili/shared'
import { CourseBar, courseItemHref } from './CourseBar'

const state = (over: Partial<CourseStateDto> = {}): CourseStateDto => ({
  guideId: 'bk', title: 'فواتير المبيعات', kind: 'booklet',
  items: [
    { id: 'gA', title: 'فاتورة مبدئية', done: true, type: 'guide', minutes: 1 },
    { id: 'gB', title: 'تحصيل دفعة', done: false, type: 'guide', minutes: 1 },
    { id: 'gC', title: 'إشعار دائن', done: false, type: 'guide', minutes: 1 },
    { id: 'gD', title: 'مرتجع', done: false, type: 'guide', minutes: 1 },
    { id: 'gE', title: 'إقفال', done: false, type: 'guide', minutes: 1 },
  ],
  itemsDone: 1, minutes: 20, nextItemId: 'gB', completedAt: null, ...over,
})

const mount = (s: CourseStateDto, currentId: string, onFinish = vi.fn()) =>
  render(
    <MemoryRouter>
      <CourseBar state={s} currentId={currentId} onFinish={onFinish} />
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('د١: CourseBar', () => {
  it('يعرض العنوان والتقدّم بالكلمات', () => {
    mount(state({ itemsDone: 2 }), 'gB')
    expect(screen.getByText('فواتير المبيعات')).toBeTruthy()
    expect(screen.getByText('أنهيتَ ٢ من ٥')).toBeTruthy()
  })

  it('العنصر الحالي غير المنتهي: «أنهيتُه» يستدعي onFinish', () => {
    const onFinish = vi.fn()
    mount(state(), 'gB', onFinish)
    fireEvent.click(screen.getByRole('button', { name: 'أنهيتُه' }))
    expect(onFinish).toHaveBeenCalled()
  })

  it('بعد انتهاء الحالي: «تابع: <التالي>» رابط للمضمّن داخل الدورة', () => {
    mount(state({ items: state().items.map((i) => (i.id === 'gB' ? { ...i, done: true } : i)), itemsDone: 2, nextItemId: 'gC' }), 'gB')
    const link = screen.getByRole('link', { name: 'تابع: إشعار دائن' })
    expect(link.getAttribute('href')).toBe('/g/gC?course=bk')
    expect(screen.queryByRole('button', { name: 'أنهيتُه' })).toBeNull()
  })

  it('اكتملت والحالي مضمّن: «العودة إلى الدورة»', () => {
    const done = state().items.map((i) => ({ ...i, done: true }))
    mount(state({ items: done, itemsDone: 5, nextItemId: null, completedAt: '2026-10-31T10:00:00Z' }), 'gE')
    expect(screen.getByRole('link', { name: 'العودة إلى الدورة' }).getAttribute('href')).toBe('/g/bk')
  })

  it('سطر الشفافية حرفياً', () => {
    mount(state(), 'gB')
    expect(screen.getByText('يرى مديرك أنك بدأت الدورة وأكملتها فقط. لا يرى أخطاءك ولا وقتك في كل خطوة.')).toBeTruthy()
  })

  it('بلا أحمر ولا نسبة مئوية', () => {
    const { container } = mount(state(), 'gB')
    expect(container.innerHTML).not.toMatch(/red|danger|%/)
  })
})

describe('د١ب: courseItemHref', () => {
  it('courseItemHref routes courses to the player and booklets to the reader', () => {
    expect(courseItemHref({ guideId: 'c1', kind: 'course' }, 'l2')).toBe('/c/c1/l2')
    expect(courseItemHref({ guideId: 'bk', kind: 'booklet' }, 'gA')).toBe('/g/gA?course=bk')
    expect(courseItemHref({ guideId: 'g1', kind: 'guide' }, 'g1')).toBe('/g/g1')
  })
})
