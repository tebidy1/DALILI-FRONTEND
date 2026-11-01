import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { LibraryOverviewDto, MemberDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { ConfirmProvider } from '../components/ConfirmProvider'
import { TeamPage } from './TeamPage'

/** منصة الشركة أ١: التعطيل لا الحذف (ORG-07)، وصلاحية النشر (PUB-01)، ورابط السجل (ORG-08) */

vi.mock('../api', () => ({
  client: {
    getTeamMembers: vi.fn(),
    createInvite: vi.fn(),
    inviteMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    deactivateMember: vi.fn(),
    reactivateMember: vi.fn(),
    listTeams: vi.fn(),
    createTeam: vi.fn(),
    deleteTeam: vi.fn(),
    libraryOverview: vi.fn(),
  },
  webShareUrl: (u: string) => u,
  webInviteUrl: (u: string) => u,
}))

const NOW = new Date('2026-10-29T10:00:00Z').toISOString()

const ADMIN_VIEW: LibraryOverviewDto = {
  workspaceName: 'شركة المثال',
  myRole: 'admin',
  myEmail: 'owner@co.sa',
  myTheme: 'brand',
  myLocale: 'ar',
  counts: { all: 1, mine: 1, published: 0, saved: 0 },
  sites: [],
}

const MEMBERS: MemberDto[] = [
  { id: 'u-admin', email: 'owner@co.sa', role: 'admin', department: '', joinedAt: NOW, guideCount: 1, status: 'active', canPublish: true },
  { id: 'u-sara', email: 'sara@co.sa', role: 'creator', department: '', joinedAt: NOW, guideCount: 2, status: 'active', canPublish: true },
  { id: 'u-old', email: 'old@co.sa', role: 'creator', department: '', joinedAt: NOW, guideCount: 0, status: 'deactivated', deactivatedAt: NOW, canPublish: true },
]

function renderTeam(overview: LibraryOverviewDto = ADMIN_VIEW) {
  vi.mocked(client.libraryOverview).mockResolvedValue(overview)
  vi.mocked(client.getTeamMembers).mockResolvedValue(MEMBERS)
  vi.mocked(client.listTeams).mockResolvedValue([])
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <OverviewProvider>
          <TeamPage />
        </OverviewProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  )
}

const row = (email: string) => screen.getByText(email).closest('tr') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
})

describe('التعطيل لا الحذف (ORG-07)', () => {
  it('عضو معطّل يظهر بشارة «معطّل» وزر «أعد التفعيل»', async () => {
    renderTeam()
    await screen.findByText('old@co.sa')
    expect(within(row('old@co.sa')).getByText(t('team.deactivated'))).toBeTruthy()
    fireEvent.click(within(row('old@co.sa')).getByRole('button', { name: t('team.reactivate') }))
    await waitFor(() => expect(client.reactivateMember).toHaveBeenCalledWith('u-old'))
  })

  it('«عطّل» يسأل تأكيداً ثم يستدعي الخادم — ولا زر تعطيل على صفي', async () => {
    renderTeam()
    await screen.findByText('sara@co.sa')
    expect(within(row('owner@co.sa')).queryByRole('button', { name: t('team.deactivate') })).toBeNull()
    fireEvent.click(within(row('sara@co.sa')).getByRole('button', { name: t('team.deactivate') }))
    fireEvent.click(await screen.findByRole('button', { name: t('team.deactivateYes') }))
    await waitFor(() => expect(client.deactivateMember).toHaveBeenCalledWith('u-sara'))
  })
})

describe('صلاحية النشر (PUB-01)', () => {
  it('مفتاح «ينشر» يسحب الصلاحية من المنشئ', async () => {
    renderTeam()
    await screen.findByText('sara@co.sa')
    const box = within(row('sara@co.sa')).getByRole('checkbox', { name: t('team.canPublishA11y', { email: 'sara@co.sa' }) }) as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    await waitFor(() => expect(client.updateMember).toHaveBeenCalledWith('u-sara', { canPublish: false }))
  })

  it('بلاغ المالك: الخادم بطيء — المفتاح يتغير فوراً ويُقفل حتى الرد، فالنقرة الثانية لا تعكس القرار', async () => {
    let finish: (m: MemberDto) => void = () => {}
    vi.mocked(client.updateMember).mockImplementation(() => new Promise<MemberDto>((r) => (finish = r)))
    renderTeam()
    await screen.findByText('sara@co.sa')
    const box = () => within(row('sara@co.sa')).getByRole('checkbox') as HTMLInputElement
    fireEvent.click(box())
    expect(box().checked).toBe(false)
    expect(box().disabled).toBe(true)
    fireEvent.click(box())
    expect(client.updateMember).toHaveBeenCalledTimes(1)
    expect(client.updateMember).toHaveBeenCalledWith('u-sara', { canPublish: false })
    vi.mocked(client.getTeamMembers).mockResolvedValue(MEMBERS.map((m) => (m.id === 'u-sara' ? { ...m, canPublish: false } : m)))
    finish({ ...(MEMBERS[1] as MemberDto), canPublish: false })
    await waitFor(() => expect(box().disabled).toBe(false))
    expect(box().checked).toBe(false)
  })

  it('المدير ينشر دائماً: مفتاحه معطّل ومفعّل', async () => {
    renderTeam()
    await screen.findByText('owner@co.sa')
    const box = within(row('owner@co.sa')).getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
  })

  it('غير المدير لا يرى المفاتيح ولا رابط السجل', async () => {
    renderTeam({ ...ADMIN_VIEW, myRole: 'creator' })
    await screen.findByText('sara@co.sa')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('link', { name: t('audit.title') })).toBeNull()
  })

  it('المدير يرى رابط سجل التدقيق', async () => {
    renderTeam()
    await screen.findByText('sara@co.sa')
    expect(screen.getByRole('link', { name: t('audit.title') }).getAttribute('href')).toBe('/audit')
  })
})
