import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { AuthGate } from './AuthGate'

/** ORG-07: الحساب المعطّل يرى سبباً صريحاً — لا ارتداد صامت لشاشة الدخول */

vi.mock('../api', () => ({ client: { me: vi.fn(), logout: vi.fn(), listMyWorkspaces: vi.fn(), switchWorkspace: vi.fn() } }))
vi.mock('../lib/ext-bridge', () => ({ notifyAuthChanged: vi.fn() }))

describe('الحارس والحساب المعطّل', () => {
  it('E-ORG-02: شاشة «الحساب معطّل» مع خروج', async () => {
    vi.mocked(client.me).mockRejectedValue(new DaliliApiError(403, 'الحساب معطّل', 'E-ORG-02'))
    render(<MemoryRouter><AuthGate><div>محتوى</div></AuthGate></MemoryRouter>)
    expect(await screen.findByText(t('auth.disabledTitle'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('common.logout') })).toBeTruthy()
    expect(screen.queryByText('محتوى')).toBeNull()
  })

  const twoAccounts = [
    { id: 'co', name: 'شركة الأفق', role: 'creator' as const, kind: 'company' as const, status: 'suspended' as const, active: true },
    { id: 'me', name: 'مساحتي', role: 'admin' as const, kind: 'personal' as const, status: 'active' as const, active: false },
  ]

  it('م١: الحساب الموقوف يعرض السبب ومبدّل الحسابات، لا المحتوى', async () => {
    vi.mocked(client.me).mockResolvedValue({ id: 'u', email: 'e@x.sa', activeWorkspaceId: 'co', accountKind: 'company', accountStatus: 'suspended' })
    vi.mocked(client.listMyWorkspaces).mockResolvedValue(twoAccounts)
    render(<MemoryRouter><AuthGate><div>محتوى</div></AuthGate></MemoryRouter>)
    expect(await screen.findByText(t('auth.suspendedTitle'))).toBeTruthy()
    expect(await screen.findByRole('combobox', { name: t('ws.switchA11y') })).toBeTruthy()
    expect(screen.queryByText('محتوى')).toBeNull()
  })

  it('م١: الحساب المنتهي له عنوانه الخاص', async () => {
    vi.mocked(client.me).mockResolvedValue({ id: 'u', email: 'e@x.sa', activeWorkspaceId: 'co', accountKind: 'company', accountStatus: 'ended' })
    vi.mocked(client.listMyWorkspaces).mockResolvedValue([])
    render(<MemoryRouter><AuthGate><div>محتوى</div></AuthGate></MemoryRouter>)
    expect(await screen.findByText(t('auth.endedTitle'))).toBeTruthy()
    expect(screen.queryByText('محتوى')).toBeNull()
  })
})
