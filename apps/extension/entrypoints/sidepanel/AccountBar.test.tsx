// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceDto } from '@dalili/shared'
import { AccountBar } from './AccountBar'

afterEach(cleanup)

const accounts: WorkspaceDto[] = [
  { id: 'co', name: 'شركة الأفق', role: 'viewer', kind: 'company', status: 'active', active: true },
  { id: 'pa', name: 'نُظم للحلول', role: 'creator', kind: 'partner', status: 'active', active: false },
]

describe('AccountBar — ت (§٣.٥)', () => {
  it('يعرض الحساب النشط، والقائمة تعرض كل حساب بنوعه ودوره', () => {
    render(<AccountBar accounts={accounts} onSwitch={vi.fn()} />)
    const bar = screen.getByRole('button', { name: /شركة الأفق/ })
    expect(bar.textContent).toContain('شركة')
    fireEvent.click(bar)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('شركة · مشاهد'), expect.stringContaining('شريك · محرّر')])
    expect(items[0]?.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('التبديل يغيّر الأدلة الظاهرة، ومكان حفظ ما تلتقطه بعده.')).toBeTruthy()
  })

  it('اختيار حساب آخر يبدّل ويغلق القائمة', () => {
    const onSwitch = vi.fn()
    render(<AccountBar accounts={accounts} onSwitch={onSwitch} />)
    fireEvent.click(screen.getByRole('button', { name: /شركة الأفق/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /نُظم للحلول/ }))
    expect(onSwitch).toHaveBeenCalledWith('pa')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('switcher disabled while capturing — مع السبب', () => {
    render(<AccountBar accounts={accounts} onSwitch={vi.fn()} lockedReason="أنهِ الالتقاط أولاً" />)
    const bar = screen.getByRole('button', { name: /شركة الأفق/ })
    expect((bar as HTMLButtonElement).disabled).toBe(true)
    expect(bar.getAttribute('title')).toBe('أنهِ الالتقاط أولاً')
  })

  it('حساب واحد: شريط بلا قائمة', () => {
    render(<AccountBar accounts={accounts.slice(0, 1)} onSwitch={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('شركة الأفق')).toBeTruthy()
  })
})
