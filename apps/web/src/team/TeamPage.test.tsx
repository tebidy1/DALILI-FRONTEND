import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { LibraryOverviewDto, MemberDto, TeamDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { OverviewProvider } from '../shell/OverviewContext'
import { TeamPage } from './TeamPage'

/**
 * المرحلة د (الفرق — WS-08): الشاشة على نمط المرجع داخل القشرة — جدول أعضاء
 * (بريد + حالة الدعوة + الدور + الفريق + الانضمام + عدد أدلته)، دعوة برابط يُنسخ
 * ويُرسل واتساب، فرق تُنشأ وتُحذف ويُجمَّع فيها الأعضاء، وإزالة تنقل ملكية الأدلة.
 * الإدارة للمدير وحده — الباقي عرض فقط.
 */

vi.mock('../api', () => ({
  client: {
    getTeamMembers: vi.fn(),
    createInvite: vi.fn(),
    inviteMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    listTeams: vi.fn(),
    createTeam: vi.fn(),
    deleteTeam: vi.fn(),
    libraryOverview: vi.fn(),
  },
  webShareUrl: (u: string) => u,
  webInviteUrl: (u: string) => u,
}))

const NOW = new Date('2026-09-03T10:00:00Z').toISOString()

const ADMIN_VIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  myTheme: 'brand',
        myLocale: 'ar',
  counts: { all: 5, mine: 5, published: 2, saved: 0 },
  sites: [],
}

const CREATOR_VIEW: LibraryOverviewDto = { ...ADMIN_VIEW, myRole: 'creator' }

const MEMBERS: MemberDto[] = [
  { id: 'u-admin', email: 'owner@dalili.sa', role: 'admin', department: '', joinedAt: NOW, pending: false, guideCount: 5, teamId: null, teamName: null },
  { id: 'u-creator', email: 'sara@dalili.sa', name: 'سارة', role: 'creator', department: '', joinedAt: NOW, pending: false, guideCount: 2, teamId: 't1', teamName: 'المبيعات' },
  { id: 'u-pending', email: 'new@dalili.sa', role: 'viewer', department: '', joinedAt: NOW, pending: true, guideCount: 0, teamId: null, teamName: null },
]

const TEAMS: TeamDto[] = [{ id: 't1', name: 'المبيعات', memberCount: 1 }]

function renderTeam(overview: LibraryOverviewDto = ADMIN_VIEW) {
  vi.mocked(client.libraryOverview).mockResolvedValue(overview)
  vi.mocked(client.getTeamMembers).mockResolvedValue(MEMBERS)
  vi.mocked(client.listTeams).mockResolvedValue(TEAMS)
  render(
    <MemoryRouter>
      <OverviewProvider>
        <TeamPage />
      </OverviewProvider>
    </MemoryRouter>,
  )
  return client
}

/** البريد في خلية الجدول — لوحة الأقسام تعرضه أيضاً في قائمة «أضف مديراً» */
const ROW = { selector: 'td bdi' }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('جدول الأعضاء (المرحلة د)', () => {
  it('يعرض كل عضو ببريده ودوره وفريقه وعدد أدلته — و«دعوة معلقة» لمن لم يقبل بعد', async () => {
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)

    expect(screen.getByText('owner@dalili.sa', ROW)).toBeTruthy()
    expect(screen.getByText('new@dalili.sa', ROW)).toBeTruthy()
    expect(screen.getByText(t('team.pending'))).toBeTruthy()
    // دور سارة من قيمة قائمتها المنسدلة (نص «منشئ» مكرر بخيارات كل الصفوف)
    const saraRow = screen.getByText('sara@dalili.sa', ROW).closest('tr') as HTMLElement
    expect((within(saraRow).getByLabelText(t('team.roleA11y')) as HTMLSelectElement).value).toBe('creator')
    // فريقها «المبيعات» من قيمة قائمة الفريق (النص مكرر بخيارات الصفوف ورقاقة الفرق)
    expect((within(saraRow).getByLabelText(t('team.colTeam')) as HTMLSelectElement).value).toBe('t1')
    // عدد الأدلة بأرقام عربية — تأكيد الإزالة يحتاجه والعمود يعرضه
    expect(screen.getByText('٥')).toBeTruthy()
    expect(screen.getByText('٢')).toBeTruthy()
  })

  it('م٢: صف العضو يعرض اسمه وبريده تحته، ومن لا اسم له ببريده وحده', async () => {
    renderTeam()
    const row = (await screen.findByText('sara@dalili.sa', ROW)).closest('tr') as HTMLElement
    expect(within(row).getByText('سارة')).toBeTruthy()
    const owner = screen.getByText('owner@dalili.sa', ROW).closest('tr') as HTMLElement
    expect(within(owner).queryByText('سارة')).toBeNull()
  })

  it('المدير يغيّر الدور من القائمة المنسدلة — وينتقل PATCH للخادم', async () => {
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)

    const row = screen.getByText('sara@dalili.sa', ROW).closest('tr') as HTMLElement
    const roleSelect = within(row).getByLabelText(t('team.roleA11y')) as HTMLSelectElement
    fireEvent.change(roleSelect, { target: { value: 'viewer' } })
    await waitFor(() => expect(vi.mocked(client.updateMember)).toHaveBeenCalledWith('u-creator', { role: 'viewer' }))
  })

  it('تجميع العضو في فريق من عمود الفريق — PATCH بمعرف الفريق', async () => {
    renderTeam()
    await screen.findByText('owner@dalili.sa', ROW)

    const row = screen.getByText('owner@dalili.sa', ROW).closest('tr') as HTMLElement
    const teamSelect = within(row).getByLabelText(t('team.colTeam')) as HTMLSelectElement
    fireEvent.change(teamSelect, { target: { value: 't1' } })
    await waitFor(() => expect(vi.mocked(client.updateMember)).toHaveBeenCalledWith('u-admin', { teamId: 't1' }))
  })

  it('الإزالة تستأذن بتأكيد يذكر نقل الأدلة بعددها ثم تحذف العضو', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)

    const row = screen.getByText('sara@dalili.sa', ROW).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByText(t('team.remove')))
    await waitFor(() => expect(vi.mocked(client.removeMember)).toHaveBeenCalledWith('u-creator'))
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('٢')
    expect(confirmSpy.mock.calls[0]?.[0]).toContain(t('team.transferNote'))
  })

  it('صف المالك بلا زر إزالة — مالك المساحة لا يُزال', async () => {
    renderTeam()
    await screen.findByText('owner@dalili.sa', ROW)
    const row = screen.getByText('owner@dalili.sa', ROW).closest('tr') as HTMLElement
    expect(within(row).queryByText(t('team.remove'))).toBeNull()
  })
})

describe('دعوة برابط واتساب (المرحلة د)', () => {
  it('المدير يولّد رابط دعوة فيظهر صندوقه بزر نسخ ورابط واتساب جاهز', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    vi.mocked(client.createInvite).mockResolvedValue({
      id: 'i1',
      email: 'khaled@dalili.sa',
      role: 'creator',
      token: 'tok123',
      inviteUrl: 'http://localhost:5174/invite/tok123',
      createdAt: NOW,
    })
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)

    fireEvent.change(screen.getByLabelText(t('team.email')), { target: { value: 'khaled@dalili.sa' } })
    fireEvent.click(screen.getByText(t('team.inviteBtn')))

    const box = await screen.findByText(t('team.inviteLinkTitle')).then((el) => el.closest('.invite-box') as HTMLElement)
    expect(within(box).getByText('http://localhost:5174/invite/tok123')).toBeTruthy()
    fireEvent.click(within(box).getByText(t('team.copyLink')))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:5174/invite/tok123'))
    const wa = within(box).getByText(t('team.waSend')).closest('a') as HTMLAnchorElement
    expect(wa.href).toContain('wa.me')
    expect(wa.href).toContain(encodeURIComponent('http://localhost:5174/invite/tok123'))
  })

  it('م١: الدعوة المرسلة بالبريد تقول ذلك، والرابط يبقى للنسخ', async () => {
    vi.mocked(client.createInvite).mockResolvedValue({
      id: 'i2',
      email: 'khaled@dalili.sa',
      role: 'creator',
      token: 'tok456',
      inviteUrl: 'http://localhost:5174/invite/tok456',
      createdAt: NOW,
      emailed: true,
    })
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)
    fireEvent.change(screen.getByLabelText(t('team.email')), { target: { value: 'khaled@dalili.sa' } })
    fireEvent.click(screen.getByText(t('team.inviteBtn')))

    const box = await screen.findByText(t('team.inviteEmailed', { email: 'khaled@dalili.sa' })).then((el) => el.closest('.invite-box') as HTMLElement)
    expect(within(box).getByText(t('team.copyLink'))).toBeTruthy()
  })

  it('بريد له حساب فعليًا (409) يُضاف مباشرة بلفتة صادقة — ولا مستخدم معلق أبدًا', async () => {
    vi.mocked(client.createInvite).mockRejectedValue({ name: 'DaliliApiError', status: 409 })
    vi.mocked(client.inviteMember).mockResolvedValue(MEMBERS[1]!)
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)

    fireEvent.change(screen.getByLabelText(t('team.email')), { target: { value: 'sara@dalili.sa' } })
    fireEvent.click(screen.getByText(t('team.inviteBtn')))

    await waitFor(() => expect(vi.mocked(client.inviteMember)).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(t('team.addedDirect'))).toBeTruthy())
  })
})

describe('الأقسام (أ٢ — ORG-01)', () => {
  it('المدير يرى لوحة الأقسام، والقائمة تُجلب بالمؤرشفة', async () => {
    renderTeam()
    await screen.findByText('sara@dalili.sa', ROW)
    expect(screen.getByRole('heading', { name: t('dept.title') })).toBeTruthy()
    expect(vi.mocked(client.listTeams)).toHaveBeenCalledWith(expect.anything(), true)
  })

  it('قسم مؤرشف لا يُعرض خياراً لنقل عضو إليه', async () => {
    vi.mocked(client.libraryOverview).mockResolvedValue(ADMIN_VIEW)
    vi.mocked(client.getTeamMembers).mockResolvedValue(MEMBERS)
    vi.mocked(client.listTeams).mockResolvedValue([...TEAMS, { id: 't-old', name: 'القديم', memberCount: 0, archivedAt: '2026-10-01T00:00:00Z' }])
    render(
      <MemoryRouter>
        <OverviewProvider>
          <TeamPage />
        </OverviewProvider>
      </MemoryRouter>,
    )
    const row = (await screen.findByText('new@dalili.sa', ROW)).closest('tr') as HTMLElement
    const options = Array.from((within(row).getByLabelText(t('team.colTeam')) as HTMLSelectElement).options).map((o) => o.value)
    expect(options).not.toContain('t-old')
  })

  it('غير المدير لا يرى لوحة الأقسام', async () => {
    renderTeam(CREATOR_VIEW)
    await screen.findByText('sara@dalili.sa', ROW)
    expect(screen.queryByRole('heading', { name: t('dept.title') })).toBeNull()
  })
})

describe('غير المدير يرى العرض فقط (المرحلة د)', () => {
  it('المنشئ: بلا صندوق دعوة ولا قوائم تعديل ولا أزرار إزالة — مع ملاحظة صدق', async () => {
    renderTeam(CREATOR_VIEW)
    await screen.findByText('sara@dalili.sa', ROW)

    expect(screen.queryByText(t('team.inviteBtn'))).toBeNull()
    expect(screen.queryByLabelText(t('team.roleA11y'))).toBeNull()
    expect(screen.queryByText(t('team.remove'))).toBeNull()
    expect(screen.getByText(t('team.readonlyNote'))).toBeTruthy()
    // لكن القائمة نفسها تُقرأ — «من في المنظمة» معرفة مشتركة
    expect(screen.getByText('new@dalili.sa', ROW)).toBeTruthy()
  })
})
