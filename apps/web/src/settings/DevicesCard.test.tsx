import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { client } from '../api'
import { t } from '../i18n'
import { DevicesCard } from './DevicesCard'

vi.mock('../api', () => ({ client: { listDevices: vi.fn(), revokeDevice: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

describe('DevicesCard — الأجهزة المرتبطة', () => {
  it('يعرض الأجهزة، وإلغاء الربط بتأكيد يزيل الجهاز', async () => {
    vi.mocked(client.listDevices).mockResolvedValue([{ id: 'd1', deviceName: 'مكتب سعد', createdAt: '2026-09-15T00:00:00Z', lastUsedAt: null }])
    vi.mocked(client.revokeDevice).mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<DevicesCard />)
    await screen.findByText('مكتب سعد')
    expect(screen.getByText(t('settings.deviceNeverUsed'))).toBeTruthy()
    fireEvent.click(screen.getByLabelText(`${t('settings.deviceRevoke')} — مكتب سعد`))
    await waitFor(() => expect(vi.mocked(client.revokeDevice)).toHaveBeenCalledWith('d1'))
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('مكتب سعد')
    await screen.findByText(t('settings.noDevices'))
  })

  it('بلا أجهزة ← نصّ صادق', async () => {
    vi.mocked(client.listDevices).mockResolvedValue([])
    render(<DevicesCard />)
    await screen.findByText(t('settings.noDevices'))
  })
})
