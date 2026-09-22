import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SearchPalette } from './SearchPalette'

/**
 * المرحلة ٤: حرس Ctrl+K — الصفحات العامة (دخول/هوية/رابط مشاركة) بلا لوحة بحث،
 * فالزائر بلا حساب لا أدلة له والاختصار يبقى للمتصفح.
 */
vi.mock('../api', () => ({ client: { searchSuggest: vi.fn() } }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SearchPalette />
    </MemoryRouter>,
  )
}

function pressCtrlK() {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
}

describe('حرس لوحة البحث على الصفحات العامة (المرحلة ٤)', () => {
  it('Ctrl+K لا يفتح اللوحة على صفحة الدخول ولا رابط المشاركة', () => {
    const login = renderAt('/login')
    pressCtrlK()
    expect(login.container.querySelector('.palette')).toBeNull()
    const share = renderAt('/s/tok123')
    pressCtrlK()
    expect(share.container.querySelector('.palette')).toBeNull()
  })

  it('داخل التطبيق المحمي تفتح اللوحة كالعادة', () => {
    const { container } = renderAt('/')
    pressCtrlK()
    expect(container.querySelector('.palette')).toBeTruthy()
  })
})
