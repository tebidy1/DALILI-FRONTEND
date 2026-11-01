import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DaliliApiError, type InviteInfoDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { InvitePage } from './InvitePage'

/** ORG-00: صفحة الدعوة — حساب قائم ينضم بحسابه، والجديد يضع كلمة مرور */

vi.mock('../api', () => ({
  client: { getInvite: vi.fn(), me: vi.fn(), joinInvite: vi.fn(), acceptInvite: vi.fn(), logout: vi.fn() },
}))
vi.mock('../lib/ext-bridge', () => ({ notifyAuthChanged: vi.fn() }))

const INFO: InviteInfoDto = { email: 'emp@co.sa', role: 'creator', workspaceName: 'شركة المثال', accepted: false, expired: false, hasAccount: true }

function renderPage(onDone = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/invite/tok1']}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage onDone={onDone} />} />
      </Routes>
    </MemoryRouter>,
  )
  return onDone
}

beforeEach(() => vi.clearAllMocks())

describe('صفحة الدعوة (ORG-00)', () => {
  it('حساب قائم داخل بالبريد نفسه: «انضم بحسابي» ينضم ثم يذهب للرئيسية', async () => {
    vi.mocked(client.getInvite).mockResolvedValue(INFO)
    vi.mocked(client.me).mockResolvedValue({ id: 'u', email: 'emp@co.sa' })
    vi.mocked(client.joinInvite).mockResolvedValue({ workspaceId: 'w2' })
    const onDone = renderPage()
    expect(await screen.findByText(t('invite.body', { ws: 'شركة المثال', role: t('home.roleCreator') }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('invite.join') }))
    await waitFor(() => expect(client.joinInvite).toHaveBeenCalledWith('tok1'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('حساب قائم غير داخل: رابط الدخول يعود للدعوة', async () => {
    vi.mocked(client.getInvite).mockResolvedValue(INFO)
    vi.mocked(client.me).mockResolvedValue(null)
    renderPage()
    const link = await screen.findByRole('link', { name: t('invite.loginToJoin', { email: 'emp@co.sa' }) })
    expect(link.getAttribute('href')).toBe('/login?next=%2Finvite%2Ftok1')
  })

  it('داخل بحساب آخر: لا زر انضمام، بل خروج وتبديل', async () => {
    vi.mocked(client.getInvite).mockResolvedValue(INFO)
    vi.mocked(client.me).mockResolvedValue({ id: 'x', email: 'other@co.sa' })
    renderPage()
    expect(await screen.findByText(t('invite.wrongAccount', { me: 'other@co.sa', email: 'emp@co.sa' }))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('invite.join') })).toBeNull()
    expect(screen.getByRole('button', { name: t('invite.logoutSwitch') })).toBeTruthy()
  })

  it('بلا حساب: الاسم وكلمة المرور ثم إنشاء ودخول', async () => {
    vi.mocked(client.getInvite).mockResolvedValue({ ...INFO, hasAccount: false })
    vi.mocked(client.me).mockResolvedValue(null)
    vi.mocked(client.acceptInvite).mockResolvedValue({ id: 'u', email: 'emp@co.sa' })
    const onDone = renderPage()
    fireEvent.change(await screen.findByLabelText(t('invite.yourName')), { target: { value: 'خالد' } })
    fireEvent.change(screen.getByLabelText(t('invite.setPassword')), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: t('invite.accept') }))
    await waitFor(() => expect(client.acceptInvite).toHaveBeenCalledWith('tok1', { name: 'خالد', password: 'password123' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('مستعملة، ومنتهية، وغير موجودة: رسائل صريحة', async () => {
    vi.mocked(client.me).mockResolvedValue(null)
    vi.mocked(client.getInvite).mockResolvedValue({ ...INFO, accepted: true })
    renderPage()
    expect(await screen.findByText(t('invite.accepted'))).toBeTruthy()
  })

  it('منتهية', async () => {
    vi.mocked(client.me).mockResolvedValue(null)
    vi.mocked(client.getInvite).mockResolvedValue({ ...INFO, expired: true })
    renderPage()
    expect(await screen.findByText(t('invite.expired'))).toBeTruthy()
  })

  it('غير موجودة', async () => {
    vi.mocked(client.me).mockResolvedValue(null)
    vi.mocked(client.getInvite).mockRejectedValue(new DaliliApiError(404, 'x'))
    renderPage()
    expect(await screen.findByText(t('invite.notFound'))).toBeTruthy()
  })

  it('فشل الانضمام يعرض رسالة الخادم العربية', async () => {
    vi.mocked(client.getInvite).mockResolvedValue(INFO)
    vi.mocked(client.me).mockResolvedValue({ id: 'u', email: 'emp@co.sa' })
    vi.mocked(client.joinInvite).mockRejectedValue(new DaliliApiError(410, 'هذه الدعوة استُخدمت سابقًا'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: t('invite.join') }))
    expect(await screen.findByText('هذه الدعوة استُخدمت سابقًا')).toBeTruthy()
  })
})
