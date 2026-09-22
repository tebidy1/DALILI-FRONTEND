import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button (UX-01)', () => {
  it('ينفّذ onClick عند الضغط', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>احفظ</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'احفظ' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('المتغير ghost يظهر بصنفه ولا ينفّذ عند التعطيل', () => {
    const onClick = vi.fn()
    render(
      <Button variant="ghost" disabled onClick={onClick}>
        عودة
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'عودة' })
    expect(btn.className).toContain('ghost')
    expect(btn.getAttribute('disabled')).not.toBeNull()
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('المشغول: سبينر داخلي + معطّل + aria-busy — ولا نص متغير', () => {
    const onClick = vi.fn()
    render(
      <Button busy onClick={onClick}>
        دخول
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'دخول' })
    expect(btn.getAttribute('disabled')).not.toBeNull()
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.querySelector('.spinner')).not.toBeNull()
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })
})
