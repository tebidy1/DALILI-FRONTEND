// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuideRow } from './GuideRow'

afterEach(cleanup)

describe('GuideRow — PNL-01', () => {
  it('الصف نفسه يبقى رابطًا إلى الدليل في تبويب جديد', () => {
    render(<GuideRow id="g1" title="إصدار فاتورة" sub="منذ ٣ دقيقة" onOpenHere={() => {}} />)
    const link = screen.getByRole('link', { name: /إصدار فاتورة/ })
    expect(link.getAttribute('href')).toMatch(/\/g\/g1$/)
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('زر ↵ شقيق للرابط (لا زر داخل رابط) ويفتح داخل اللوحة بمعرّف الدليل', () => {
    const onOpenHere = vi.fn()
    render(<GuideRow id="g1" title="إصدار فاتورة" sub="" onOpenHere={onOpenHere} />)
    const btn = screen.getByRole('button', { name: 'اعرض «إصدار فاتورة» هنا في اللوحة' })
    expect(btn.closest('a')).toBeNull()
    expect(btn.getAttribute('data-guide')).toBe('g1')
    fireEvent.click(btn)
    expect(onOpenHere).toHaveBeenCalledWith('g1')
  })

  it('بلا onOpenHere لا زر', () => {
    render(<GuideRow id="g1" title="د" sub="" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
