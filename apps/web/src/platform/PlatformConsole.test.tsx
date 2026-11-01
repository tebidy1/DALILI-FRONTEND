import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DaliliApiError, type PlatformAccountDetailDto, type PlatformAccountDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { ConfirmProvider } from '../components/ConfirmProvider'
import { PlatformConsole } from './PlatformConsole'

/** م٢: لوحة إدارة المنصة — التحقق بخطوتين، والحسابات، والإيقاف بسبب، والبحث عن مستخدم */

vi.mock('../api', () => ({
  client: {
    platformMfa: vi.fn(),
    platformVerifyMfa: vi.fn(),
    platformSummary: vi.fn(),
    platformAccounts: vi.fn(),
    platformCreateAccount: vi.fn(),
    platformAccount: vi.fn(),
    platformUpdateAccount: vi.fn(),
    platformSetStatus: vi.fn(),
    platformAdminInvite: vi.fn(),
    platformUser: vi.fn(),
    platformResetLink: vi.fn(),
    platformEndSessions: vi.fn(),
    platformAudit: vi.fn(),
  },
}))

const ACC: PlatformAccountDto = {
  id: 'a1', kind: 'company', name: 'شركة الأفق', status: 'active', statusReason: null, plan: 'free', createdAt: '2026-10-30T08:00:00Z',
  retainUntil: null, note: null, members: 4, guides: 12, storageBytes: 3_500_000, lastActivityAt: '2026-10-30T09:00:00Z', adminEmails: ['admin@ufuq.test'],
}
const DETAIL: PlatformAccountDetailDto = { ...ACC, pendingInvites: [], history: [] }
const SUMMARY = { companies: { active: 1, suspended: 0, ended: 0 }, partners: { active: 0, suspended: 0, ended: 0 }, activeUsers30d: 3, guides: 12, storageBytes: 3_500_000, recent: [ACC] }

function renderAt(path: string) {
  render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformConsole />} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.platformSummary).mockResolvedValue(SUMMARY)
})

describe('التحقق بخطوتين (م٢)', () => {
  it('أول مرة: يعرض السر والرمز، ثم يفتح اللوحة بعد رمز صحيح', async () => {
    vi.mocked(client.platformSummary).mockRejectedValueOnce(new DaliliApiError(403, 'أدخل رمز التحقق', 'E-PLT-02')).mockResolvedValue(SUMMARY)
    vi.mocked(client.platformMfa).mockResolvedValue({ enrolled: false, secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' })
    vi.mocked(client.platformVerifyMfa).mockResolvedValue({ ok: true })
    renderAt('/platform')
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('platform.mfaCode')), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: t('platform.mfaVerify') }))
    await waitFor(() => expect(client.platformVerifyMfa).toHaveBeenCalledWith('123456'))
    expect(await screen.findByText(t('platform.homeTitle'))).toBeTruthy()
  })

  it('غير مدير المنصة يرى رفضاً صريحاً', async () => {
    vi.mocked(client.platformSummary).mockRejectedValue(new DaliliApiError(403, 'هذه الصفحة لإدارة المنصة فقط', 'E-PLT-01'))
    renderAt('/platform')
    expect(await screen.findByText(t('platform.denied'))).toBeTruthy()
  })
})

describe('الحسابات (م٢)', () => {
  it('القائمة بحالاتها: فارغة ثم نتائج، وخطأ مع إعادة المحاولة', async () => {
    vi.mocked(client.platformAccounts).mockRejectedValueOnce(new Error('net')).mockResolvedValue([ACC])
    renderAt('/platform/companies')
    fireEvent.click(await screen.findByRole('button', { name: t('common.retry') }))
    expect(await screen.findByText('شركة الأفق')).toBeTruthy()
    expect(client.platformAccounts).toHaveBeenLastCalledWith({ kind: 'company', status: '', q: '' }, expect.anything())
  })

  it('إنشاء شركة يعرض أن الدعوة أُرسلت', async () => {
    vi.mocked(client.platformAccounts).mockResolvedValue([])
    vi.mocked(client.platformCreateAccount).mockResolvedValue({ account: ACC, invite: { inviteUrl: 'http://x/invite/t', emailed: true } })
    renderAt('/platform/companies')
    expect(await screen.findByText(t('platform.accountsEmpty'))).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('platform.accountName')), { target: { value: 'شركة الأفق' } })
    fireEvent.change(screen.getByLabelText(t('platform.adminEmail')), { target: { value: 'admin@ufuq.test' } })
    fireEvent.click(screen.getByRole('button', { name: t('platform.createCompany') }))
    await waitFor(() => expect(client.platformCreateAccount).toHaveBeenCalledWith({ kind: 'company', name: 'شركة الأفق', adminEmail: 'admin@ufuq.test', note: '' }))
    expect(await screen.findByText(t('platform.inviteEmailed', { email: 'admin@ufuq.test' }))).toBeTruthy()
    // حادثة 2026-11-01: البريد الحقيقي غير مضبوط فكان الرابط يُخفى — يجب أن يظهر دائماً مع زرّي النسخ وواتساب
    expect(screen.getByText('http://x/invite/t')).toBeTruthy()
    // قارئ الشاشة يعلن حالة الدعوة (كان ok-note بدور status قبل الصندوق)
    expect(screen.getByRole('status').textContent).toContain(t('platform.inviteEmailed', { email: 'admin@ufuq.test' }))
    expect(screen.getByRole('button', { name: t('team.copyLink') })).toBeTruthy()
    expect(screen.getByRole('link', { name: t('team.waSend') }).getAttribute('href'))
      .toBe(`https://wa.me/?text=${encodeURIComponent(t('team.waText', { url: 'http://x/invite/t' }))}`)
  })

  it('زر النسخ ينسخ رابط الدعوة', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.mocked(client.platformAccounts).mockResolvedValue([])
    vi.mocked(client.platformCreateAccount).mockResolvedValue({ account: ACC, invite: { inviteUrl: 'http://x/invite/t', emailed: true } })
    renderAt('/platform/companies')
    expect(await screen.findByText(t('platform.accountsEmpty'))).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('platform.accountName')), { target: { value: 'شركة الأفق' } })
    fireEvent.change(screen.getByLabelText(t('platform.adminEmail')), { target: { value: 'admin@ufuq.test' } })
    fireEvent.click(screen.getByRole('button', { name: t('platform.createCompany') }))
    fireEvent.click(await screen.findByRole('button', { name: t('team.copyLink') }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://x/invite/t'))
    expect(await screen.findByText(t('team.linkCopied'))).toBeTruthy()
  })

  it('الإيقاف يتطلب سبباً، ثم ينادي الخادم بعد التأكيد', async () => {
    vi.mocked(client.platformAccount).mockResolvedValue(DETAIL)
    vi.mocked(client.platformSetStatus).mockResolvedValue({ ...ACC, status: 'suspended' })
    renderAt('/platform/accounts/a1')
    const suspend = await screen.findByRole('button', { name: t('platform.suspend') })
    expect((suspend as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(t('platform.statusReason')), { target: { value: 'تأخر السداد' } })
    fireEvent.click(suspend)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: t('platform.suspend') }))
    await waitFor(() => expect(client.platformSetStatus).toHaveBeenCalledWith('a1', 'suspended', 'تأخر السداد'))
  })

  it('دعوة مدير لحساب قائم تعرض الرابط', async () => {
    vi.mocked(client.platformAccount).mockResolvedValue(DETAIL)
    vi.mocked(client.platformAdminInvite).mockResolvedValue({ inviteUrl: 'http://x/invite/u', emailed: false })
    renderAt('/platform/accounts/a1')
    fireEvent.change(await screen.findByLabelText(t('platform.adminEmail')), { target: { value: 'boss@ufuq.test' } })
    fireEvent.click(screen.getByRole('button', { name: t('platform.inviteAdmin') }))
    await waitFor(() => expect(client.platformAdminInvite).toHaveBeenCalledWith('a1', 'boss@ufuq.test'))
    expect(await screen.findByText('http://x/invite/u')).toBeTruthy()
    expect(screen.getByText(t('platform.adminInviteCopy'))).toBeTruthy()
  })
})

describe('صفحة الشريك في لوحة المنصة (ش١)', () => {
  it('تعرض أنظمته وعدد أدلته الرسمية وعملائه', async () => {
    vi.mocked(client.platformAccount).mockResolvedValue({ ...DETAIL, kind: 'partner', name: 'نُظم للحلول', partner: { systems: [{ id: 'odoo', name: 'أودو' }], officialGuides: 7, clients: 3 } })
    renderAt('/platform/accounts/a1')
    expect(await screen.findByText(t('platform.partnerOfficial'))).toBeTruthy()
    expect(screen.getByText('أودو')).toBeTruthy()
    expect(screen.getByText('٧')).toBeTruthy()
    expect(screen.getByText('٣')).toBeTruthy()
  })
})

describe('البحث عن مستخدم (م٢)', () => {
  it('يعرض عضوياته وحالة كل منها', async () => {
    vi.mocked(client.platformUser).mockResolvedValue({
      id: 'u1', email: 'emp@co.sa', name: 'خالد', createdAt: '2026-10-01T00:00:00Z',
      memberships: [{ accountId: 'a1', accountName: 'شركة الأفق', kind: 'company', accountStatus: 'active', role: 'viewer', status: 'active' }],
    })
    renderAt('/platform/users')
    fireEvent.change(await screen.findByLabelText(t('platform.userEmail')), { target: { value: 'emp@co.sa' } })
    fireEvent.click(screen.getByRole('button', { name: t('platform.userFind') }))
    expect(await screen.findByText('شركة الأفق')).toBeTruthy()
    expect(screen.getByRole('button', { name: t('platform.endSessions') })).toBeTruthy()
  })
})
