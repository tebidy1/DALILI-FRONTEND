import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MoreMenu, type MoreMenuItem } from './MoreMenu'

afterEach(cleanup)

function buildItems(a: () => void, c: () => void): MoreMenuItem[] {
  return [
    { key: 'a', label: 'أ', onSelect: a },
    { key: 'b', label: 'ب', disabled: true, disabledHint: 'قريبًا' },
    { key: 'c', label: 'ج', onSelect: c, danger: true },
  ]
}

describe('VER-02: MoreMenu — قائمة «المزيد»', () => {
  it('مغلق افتراضيًا، والنقر على الزر يفتحه', () => {
    render(<MoreMenu ariaLabel="المزيد" items={buildItems(vi.fn(), vi.fn())} />)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByLabelText('المزيد'))
    expect(screen.queryByRole('menu')).not.toBeNull()
  })

  it('العناصر تظهر بالترتيب، والمعطّل يحمل aria-disabled=true وتلميح «قريبًا»', () => {
    render(<MoreMenu ariaLabel="المزيد" items={buildItems(vi.fn(), vi.fn())} />)
    fireEvent.click(screen.getByLabelText('المزيد'))
    const rows = screen.getAllByRole('menuitem')
    expect(rows.map((r) => r.textContent)).toEqual(['أ', 'ب', 'ج'])
    expect(rows[1]!.getAttribute('aria-disabled')).toBe('true')
    expect(rows[1]!.getAttribute('title')).toBe('قريبًا')
  })

  it('النقر على مفعّل يستدعي onSelect ويُغلق القائمة', () => {
    const a = vi.fn()
    render(<MoreMenu ariaLabel="المزيد" items={buildItems(a, vi.fn())} />)
    fireEvent.click(screen.getByLabelText('المزيد'))
    fireEvent.click(screen.getByText('أ'))
    expect(a).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('النقر على معطّل لا يستدعي شيئًا ولا يغلق', () => {
    render(<MoreMenu ariaLabel="المزيد" items={buildItems(vi.fn(), vi.fn())} />)
    fireEvent.click(screen.getByLabelText('المزيد'))
    fireEvent.click(screen.getByText('ب'))
    expect(screen.queryByRole('menu')).not.toBeNull()
  })

  it('Escape يُغلق القائمة', () => {
    render(<MoreMenu ariaLabel="المزيد" items={buildItems(vi.fn(), vi.fn())} />)
    fireEvent.click(screen.getByLabelText('المزيد'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
