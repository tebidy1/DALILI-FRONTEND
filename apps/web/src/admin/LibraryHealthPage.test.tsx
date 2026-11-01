import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { t } from '../i18n'
import { client } from '../api'
import { LibraryHealthPage } from './LibraryHealthPage'

vi.mock('../api', () => ({ client: { getLibraryHealth: vi.fn() } }))

/** ب (§٦): «صحة المكتبة» — ما يحتاج إعادة توثيق، وما هو موقوف وسببه */

describe('LibraryHealthPage (ب)', () => {
  it('يعرض القائمتين وكل سطر يفتح الدليل', async () => {
    vi.mocked(client.getLibraryHealth).mockResolvedValue({
      reverify: [{ id: 'g1', title: 'فاتورة مبدئية', ownerName: 'سارة', updatedAt: '2026-10-30T00:00:00Z', verifiedAt: '2026-10-01T00:00:00Z' }],
      suspended: [{ id: 'g2', title: 'قيد يومية', ownerName: 'خالد', updatedAt: '2026-10-30T00:00:00Z', reason: 'الشاشة تغيّرت', byName: 'المدير' }],
    })
    render(<MemoryRouter><LibraryHealthPage /></MemoryRouter>)
    expect((await screen.findByRole('link', { name: 'فاتورة مبدئية' })).getAttribute('href')).toBe('/g/g1')
    expect(screen.getByRole('link', { name: 'قيد يومية' }).getAttribute('href')).toBe('/g/g2')
    expect(screen.getByText(/الشاشة تغيّرت/)).toBeTruthy()
  })

  it('الفراغ له رسالة لكل قائمة', async () => {
    vi.mocked(client.getLibraryHealth).mockResolvedValue({ reverify: [], suspended: [] })
    render(<MemoryRouter><LibraryHealthPage /></MemoryRouter>)
    expect(await screen.findByText(t('health.reverifyEmpty'))).toBeTruthy()
    expect(screen.getByText(t('health.suspendedEmpty'))).toBeTruthy()
  })
})
