import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { t } from '../i18n'
import { LoginPage } from './LoginPage'

/** DTOP-03: الدخول يعيد المستخدم إلى صفحة الربط التي جاء منها — لا إلى الرئيسة */
vi.mock('../api', () => ({ client: { login: vi.fn().mockResolvedValue({ id: 'u', email: 'a@b.co' }), register: vi.fn() } }))

const seen: { path?: string } = {}
function Probe() {
  const loc = useLocation()
  seen.path = loc.pathname + loc.search
  return null
}

function renderLogin(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/device" element={<Probe />} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function submit() {
  fireEvent.change(screen.getByLabelText(t('login.email')), { target: { value: 'a@b.co' } })
  fireEvent.change(screen.getByLabelText(t('login.password')), { target: { value: '12345678' } })
  fireEvent.click(screen.getAllByText(t('login.submitLogin')).at(-1)!)
}

describe('LoginPage ?next=', () => {
  it('يعود إلى /device?code=… بعد الدخول', async () => {
    renderLogin(`/login?next=${encodeURIComponent('/device?code=BCDF-GHJK')}`)
    await submit()
    await waitFor(() => expect(seen.path).toBe('/device?code=BCDF-GHJK'))
  })

  it('next خارجي (//evil) يُتجاهل ⇐ الرئيسة', async () => {
    seen.path = undefined
    renderLogin(`/login?next=${encodeURIComponent('//evil.example/x')}`)
    await submit()
    await waitFor(() => expect(seen.path).toBe('/'))
  })

  it('next بشرطة مائلة عكسية (/\\evil) يُتجاهل — المتصفّحات تقرؤها //evil', async () => {
    seen.path = undefined
    renderLogin(`/login?next=${encodeURIComponent('/\\evil.example/x')}`)
    await submit()
    await waitFor(() => expect(seen.path).toBe('/'))
  })
})
