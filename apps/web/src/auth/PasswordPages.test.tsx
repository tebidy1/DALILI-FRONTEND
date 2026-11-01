import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { ForgotPage } from './ForgotPage'
import { ResetPage } from './ResetPage'

/** م١: «نسيت كلمة المرور» — رسالة محايدة دائماً، ورابط لمرة واحدة */

vi.mock('../api', () => ({ client: { forgotPassword: vi.fn(), resetPassword: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

function renderReset() {
  render(
    <MemoryRouter initialEntries={['/reset/tok9']}>
      <Routes>
        <Route path="/reset/:token" element={<ResetPage />} />
        <Route path="/login" element={<div>صفحة الدخول</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('نسيت كلمة المرور (م١)', () => {
  it('يرسل البريد ثم يعرض رسالة محايدة لا تكشف إن كان الحساب موجوداً', async () => {
    vi.mocked(client.forgotPassword).mockResolvedValue({ ok: true })
    render(<MemoryRouter><ForgotPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(t('login.email')), { target: { value: 'sara@co.sa' } })
    fireEvent.click(screen.getByRole('button', { name: t('forgot.send') }))
    await waitFor(() => expect(client.forgotPassword).toHaveBeenCalledWith('sara@co.sa'))
    expect(await screen.findByText(t('forgot.sent'))).toBeTruthy()
  })

  it('الاستعادة الناجحة تحوّل لصفحة الدخول', async () => {
    vi.mocked(client.resetPassword).mockResolvedValue({ ok: true })
    renderReset()
    fireEvent.change(screen.getByLabelText(t('reset.newPassword')), { target: { value: 'newpass456' } })
    fireEvent.click(screen.getByRole('button', { name: t('reset.submit') }))
    await waitFor(() => expect(client.resetPassword).toHaveBeenCalledWith('tok9', 'newpass456'))
    expect(await screen.findByText('صفحة الدخول')).toBeTruthy()
  })

  it('الرابط المنتهي يعرض سبب الخادم ورابطاً لطلب رابط جديد', async () => {
    vi.mocked(client.resetPassword).mockRejectedValue(new DaliliApiError(400, 'الرابط غير صالح أو انتهت صلاحيته', 'E-AUTH-01'))
    renderReset()
    fireEvent.change(screen.getByLabelText(t('reset.newPassword')), { target: { value: 'newpass456' } })
    fireEvent.click(screen.getByRole('button', { name: t('reset.submit') }))
    expect((await screen.findByRole('alert')).textContent).toBe('الرابط غير صالح أو انتهت صلاحيته')
    expect(screen.getByRole('link', { name: t('reset.requestNew') }).getAttribute('href')).toBe('/forgot')
  })
})
