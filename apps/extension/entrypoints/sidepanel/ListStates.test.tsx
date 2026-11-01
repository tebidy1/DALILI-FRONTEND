// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscoverArea, BlockedScreen } from './ListStates'

afterEach(cleanup)

/** ت (§٣.٥، القانون ٤): كل قائمة لها تحميل وفارغ وخطأ ونتائج — ولا زر ميت */
describe('DiscoverArea — الحالات', () => {
  it('يحمّل: هيكل رمادي', () => {
    const { container } = render(<DiscoverArea state={{ status: 'loading' }} canCreate onRetry={vi.fn()} onStart={vi.fn()} />)
    expect(container.querySelectorAll('.sk-row').length).toBeGreaterThan(0)
  })

  it('فارغ لمن يملك الإنشاء: الجملة وزر «سجّل أول دليل»', () => {
    const onStart = vi.fn()
    render(<DiscoverArea state={{ status: 'ready', data: { count: 0, onScreen: [], onSite: [] } }} canCreate onRetry={vi.fn()} onStart={onStart} />)
    expect(screen.getByText('لا دليل لهذه الشاشة بعد')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'سجّل أول دليل' }))
    expect(onStart).toHaveBeenCalled()
  })

  it('فارغ للمشاهد: الجملة فقط', () => {
    render(<DiscoverArea state={{ status: 'ready', data: { count: 0, onScreen: [], onSite: [] } }} canCreate={false} onRetry={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByText('لا دليل لهذه الشاشة بعد')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('network error retries', () => {
    const onRetry = vi.fn()
    render(<DiscoverArea state={{ status: 'error' }} canCreate onRetry={onRetry} onStart={vi.fn()} />)
    expect(screen.getByText('تعذّر التحميل')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'أعد المحاولة' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('صفحة ليست موقعًا: لا شيء', () => {
    const { container } = render(<DiscoverArea state={{ status: 'off' }} canCreate onRetry={vi.fn()} onStart={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('النتائج: مجموعتان بعناوينهما', () => {
    render(<DiscoverArea state={{ status: 'ready', data: { count: 2, onScreen: [{ id: 'a', title: 'أ', updatedAt: '', views: 0 }], onSite: [{ id: 'b', title: 'ب', updatedAt: '', views: 0 }] } }} canCreate onRetry={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByText('على هذه الشاشة')).toBeTruthy()
    expect(screen.getByRole('link', { name: /^أ/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^ب/ })).toBeTruthy()
  })
})

describe('BlockedScreen — حساب الجهة والعضوية', () => {
  it('suspended account shows only the message', () => {
    const { container } = render(<BlockedScreen kind="suspended" accountName="شركة الأفق" />)
    expect(screen.getByText('حساب جهتك موقوف')).toBeTruthy()
    expect(container.textContent).toContain('E-ACC-01')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('موقوف ومعه حساب آخر فعّال: زر الانتقال إليه', () => {
    const onSwitch = vi.fn()
    render(<BlockedScreen kind="suspended" accountName="شركة الأفق" other={{ id: 'me', name: 'مساحتي الشخصية' }} onSwitch={onSwitch} />)
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى «مساحتي الشخصية»' }))
    expect(onSwitch).toHaveBeenCalledWith('me')
  })

  it('disabled membership without other account shows no switch button', () => {
    const { container } = render(<BlockedScreen kind="disabled" />)
    expect(screen.getByText('لم تعد عضوًا فعّالًا في جهتك')).toBeTruthy()
    expect(container.textContent).toContain('E-ORG-02')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
