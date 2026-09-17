import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { DevicePage } from './DevicePage'

/** DTOP-03: صفحة الموافقة على ربط جهاز — الاسم قبل القرار، والرفض قرار صريح */
vi.mock('../api', () => ({ client: { devicePending: vi.fn(), deviceApprove: vi.fn() } }))

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/device" element={<DevicePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('DevicePage', () => {
  it('الرمز في الرابط ← اسم الجهاز والرمز ← «اسمح» يوافق ويعرض النجاح', async () => {
    vi.mocked(client.devicePending).mockResolvedValue({ userCode: 'BCDF-GHJK', deviceName: 'مكتب سعد', createdAt: '' })
    vi.mocked(client.deviceApprove).mockResolvedValue({ ok: true })
    renderAt('/device?code=BCDF-GHJK')
    await screen.findByText(t('device.confirm', { name: 'مكتب سعد' }))
    expect(screen.getByText(t('device.codeShown', { code: 'BCDF-GHJK' }))).toBeTruthy()
    fireEvent.click(screen.getByText(t('device.approve')))
    await waitFor(() => expect(vi.mocked(client.deviceApprove)).toHaveBeenCalledWith('BCDF-GHJK', true))
    await screen.findByText(t('device.approved'))
  })

  it('«ارفض» يرسل approve=false ويعرض الرفض', async () => {
    vi.mocked(client.devicePending).mockResolvedValue({ userCode: 'BCDF-GHJK', deviceName: 'مكتب سعد', createdAt: '' })
    vi.mocked(client.deviceApprove).mockResolvedValue({ ok: true })
    renderAt('/device?code=BCDF-GHJK')
    fireEvent.click(await screen.findByText(t('device.deny')))
    await waitFor(() => expect(vi.mocked(client.deviceApprove)).toHaveBeenCalledWith('BCDF-GHJK', false))
    await screen.findByText(t('device.denied'))
  })

  it('رمز منتهٍ ← رسالة الخادم وحقل إدخال يدوي يعيد البحث', async () => {
    vi.mocked(client.devicePending)
      .mockRejectedValueOnce(new DaliliApiError(404, 'الرمز غير صحيح أو انتهت مهلته'))
      .mockResolvedValueOnce({ userCode: 'LMNP-QRST', deviceName: 'مكتب منى', createdAt: '' })
    renderAt('/device?code=XXXX-XXXX')
    await screen.findByText('الرمز غير صحيح أو انتهت مهلته')
    fireEvent.change(screen.getByLabelText(t('device.codeLabel')), { target: { value: 'lmnp qrst' } })
    fireEvent.click(screen.getByText(t('device.lookup')))
    await screen.findByText(t('device.confirm', { name: 'مكتب منى' }))
    expect(vi.mocked(client.devicePending)).toHaveBeenLastCalledWith('lmnp qrst')
  })
})
