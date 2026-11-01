import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { t } from '../i18n'
import { client } from '../api'
import { ViewerPage } from './ViewerPage'

vi.mock('../api', () => ({
  client: { publicGuide: vi.fn(), trackShareView: vi.fn().mockResolvedValue(undefined), shareComments: vi.fn().mockResolvedValue({ comments: [] }) },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

/** ب (PUB-03): رابط دليل موقوف يقول «موقوف مؤقتاً» بلا محتوى — لا «الرابط غير موجود» */

describe('ViewerPage — الدليل الموقوف (ب)', () => {
  it('يعرض «موقوف مؤقتاً» بلا إعادة محاولة', async () => {
    vi.mocked(client.publicGuide).mockRejectedValue(Object.assign(new Error('هذا الدليل موقوف مؤقتاً (E-PUB-04)'), { status: 423, code: 'E-PUB-04' }))
    render(
      <MemoryRouter initialEntries={['/s/tok-1']}>
        <Routes>
          <Route path="/s/:token" element={<ViewerPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(t('viewer.suspendedTitle'))).toBeTruthy()
    expect(screen.queryByText(t('viewer.goneTitle'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('common.retry') })).toBeNull()
  })
})
