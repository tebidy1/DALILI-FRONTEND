import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { NotificationsDto } from '@dalili/shared'
import { client } from '../api'
import { NotificationBell } from './NotificationBell'

vi.mock('../api', () => ({ client: { notifications: vi.fn(), markNotificationsRead: vi.fn().mockResolvedValue(undefined) } }))

/** ش٢ (§٣.٦ و§٢٧): الجرس — العدد، والقائمة بجمل مقروءة، و«علّم الكل مقروءاً» */

const AT = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const BELL: NotificationsDto = {
  unread: 2,
  items: [
    { id: 'n1', kind: 'partner.stopped', data: { partnerName: 'نُظم للحلول', systemName: 'أودو' }, createdAt: AT, readAt: null },
    { id: 'n2', kind: 'partner.chosen', data: { companyName: 'شركة الأفق', systemName: 'أودو' }, createdAt: AT, readAt: null },
    { id: 'n3', kind: 'provider.removed', data: { partnerName: 'حلول المستقبل', systemName: 'قيود' }, createdAt: AT, readAt: AT },
  ],
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  )
}

describe('الجرس (ش٢)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('العدد على الجرس، والقائمة بجمل مفهومة', async () => {
    vi.mocked(client.notifications).mockResolvedValue(BELL)
    renderBell()
    const bell = await screen.findByRole('button', { name: 'الإشعارات: ٢ غير مقروء' }, { timeout: 4000 })
    fireEvent.click(bell)
    const list = await screen.findByRole('list', { name: 'الإشعارات' })
    expect(list.textContent).toContain('أوقف نُظم للحلول خدمته لكم في أودو')
    expect(list.textContent).toContain('اختارتكم شركة الأفق لأدلة أودو')
    expect(list.textContent).toContain('لم يعد حلول المستقبل مقدّماً لأدلة قيود')
  })

  it('«علّم الكل مقروءاً» يصفّر العدد', async () => {
    vi.mocked(client.notifications).mockResolvedValue(BELL)
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'الإشعارات: ٢ غير مقروء' }, { timeout: 4000 }))
    fireEvent.click(await screen.findByRole('button', { name: 'علّم الكل مقروءاً' }))
    await waitFor(() => expect(client.markNotificationsRead).toHaveBeenCalledWith())
    expect(await screen.findByRole('button', { name: 'الإشعارات' })).toBeTruthy()
  })

  it('بلا إشعارات: جملة هادئة، وفشل الجلب لا يكسر الشريط', async () => {
    vi.mocked(client.notifications).mockResolvedValue({ unread: 0, items: [] })
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'الإشعارات' }, { timeout: 4000 }))
    expect(await screen.findByText('لا إشعارات بعد')).toBeTruthy()
  })

  it('هـ ج١: إشعار «شُرح الزر» بجملته، والضغط عليه لا ينقل إلى أي مكان', async () => {
    vi.mocked(client.notifications).mockResolvedValue({
      unread: 1,
      items: [{ id: 'n9', kind: 'note.answered', data: { label: 'تأكيد', systemName: 'أودو', partnerName: 'نُظم للحلول' }, createdAt: AT, readAt: null }],
    })
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'الإشعارات: ١ غير مقروء' }, { timeout: 4000 }))
    const list = await screen.findByRole('list', { name: 'الإشعارات' })
    expect(list.textContent).toContain('شُرح الزر «تأكيد» الذي سألت عنه في أودو')
    // ليس رابطًا — لا وجهة لإشعار الشرح
    const item = list.querySelector('li')!
    expect(item.querySelector('a')).toBeNull()
  })
})
