import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DaliliApiError, type MemberDto, type TeamDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { DepartmentsPanel } from './DepartmentsPanel'

/** منصة الشركة أ٢ (ORG-01/02): لوحة الأقسام — أب بمستوى واحد، ومدراء، وأرشفة لا حذف */

vi.mock('../api', () => ({
  client: {
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    archiveTeam: vi.fn(),
    unarchiveTeam: vi.fn(),
    setTeamManagers: vi.fn(),
    deleteTeam: vi.fn(),
  },
}))

const BUY: TeamDto = { id: 't-buy', name: 'المشتريات', memberCount: 2, parentId: null, archivedAt: null, managerIds: ['u-sara'] }
const CONTRACTS: TeamDto = { id: 't-con', name: 'العقود', memberCount: 0, parentId: 't-buy', archivedAt: null, managerIds: [] }
const FIN: TeamDto = { id: 't-fin', name: 'المالية', memberCount: 1, parentId: null, archivedAt: null, managerIds: [] }
const OLD: TeamDto = { id: 't-old', name: 'القديم', memberCount: 0, parentId: null, archivedAt: '2026-10-01T00:00:00Z', managerIds: [] }

const MEMBERS: MemberDto[] = [
  { id: 'u-sara', email: 'sara@co.sa', role: 'creator', department: '', status: 'active' },
  { id: 'u-ali', email: 'ali@co.sa', role: 'creator', department: '', status: 'active' },
  { id: 'u-off', email: 'off@co.sa', role: 'creator', department: '', status: 'deactivated' },
]

function renderPanel(teams: TeamDto[] = [BUY, CONTRACTS, FIN, OLD]) {
  const onTeamsChange = vi.fn()
  render(<DepartmentsPanel teams={teams} members={MEMBERS} onTeamsChange={onTeamsChange} />)
  return onTeamsChange
}

const row = (name: string) => screen.getByRole('listitem', { name })

beforeEach(() => vi.clearAllMocks())

describe('DepartmentsPanel', () => {
  it('يعرض الأقسام الحية شجرةً — الفرع تحت أبيه — ومدراءها، والمؤرشفة منفصلة', () => {
    renderPanel()
    const live = within(screen.getByRole('list', { name: t('dept.title') })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))
    // الرئيسية بالأبجدية، والفرع يلي أباه مباشرة
    expect(live).toEqual(['المالية', 'المشتريات', 'العقود'])
    expect(row('العقود').className).toContain('dept-child')
    expect(within(row('المشتريات')).getByText('sara@co.sa')).toBeTruthy()
    expect(screen.queryByRole('listitem', { name: 'القديم' })).toBeNull()
    expect(screen.getByText(t('dept.archivedTitle', { count: '١' }))).toBeTruthy()
  })

  it('إنشاء قسم فرعي باسمه وأبيه', async () => {
    const created: TeamDto = { id: 't-new', name: 'المستودعات', memberCount: 0, parentId: 't-buy', archivedAt: null, managerIds: [] }
    vi.mocked(client.createTeam).mockResolvedValue(created)
    const onTeamsChange = renderPanel()
    fireEvent.change(screen.getByLabelText(t('dept.newName')), { target: { value: ' المستودعات ' } })
    fireEvent.change(screen.getByLabelText(t('dept.newParent')), { target: { value: 't-buy' } })
    fireEvent.click(screen.getByRole('button', { name: t('dept.create') }))
    await waitFor(() => expect(client.createTeam).toHaveBeenCalledWith('المستودعات', 't-buy'))
    expect(onTeamsChange.mock.calls[0]![0]).toContainEqual(created)
  })

  it('الأب لا يُعرض إلا الأقسام الرئيسية، وقسم له فروع لا يُنقل تحت غيره', () => {
    renderPanel()
    const parentOf = (name: string) => within(row(name)).getByLabelText(t('dept.parentA11y', { name })) as HTMLSelectElement
    const options = Array.from(parentOf('المالية').options).map((o) => o.value)
    expect(options).toEqual(['', 't-buy']) // لا نفسه ولا الفرع «العقود»
    expect(parentOf('المشتريات').disabled).toBe(true)
  })

  it('تغيير الأب يرسل parentId ويستبدل القسم', async () => {
    const moved = { ...FIN, parentId: 't-buy' }
    vi.mocked(client.updateTeam).mockResolvedValue(moved)
    const onTeamsChange = renderPanel()
    fireEvent.change(within(row('المالية')).getByLabelText(t('dept.parentA11y', { name: 'المالية' })), { target: { value: 't-buy' } })
    await waitFor(() => expect(client.updateTeam).toHaveBeenCalledWith('t-fin', { parentId: 't-buy' }))
    expect(onTeamsChange.mock.calls[0]![0]).toContainEqual(moved)
  })

  it('إضافة مدير من الأعضاء الفعّالين فقط، وإزالته من رقاقته', async () => {
    vi.mocked(client.setTeamManagers).mockResolvedValue({ ...BUY, managerIds: ['u-sara', 'u-ali'] })
    renderPanel()
    const add = within(row('المشتريات')).getByLabelText(t('dept.addManagerA11y', { name: 'المشتريات' })) as HTMLSelectElement
    // سارة مديرة بالفعل، والمعطَّل لا يُعرض
    expect(Array.from(add.options).map((o) => o.value)).toEqual(['', 'u-ali'])
    fireEvent.change(add, { target: { value: 'u-ali' } })
    await waitFor(() => expect(client.setTeamManagers).toHaveBeenCalledWith('t-buy', ['u-sara', 'u-ali']))

    fireEvent.click(within(row('المشتريات')).getByRole('button', { name: t('dept.removeManager', { email: 'sara@co.sa', name: 'المشتريات' }) }))
    await waitFor(() => expect(client.setTeamManagers).toHaveBeenLastCalledWith('t-buy', []))
  })

  it('رفض الأرشفة يعرض سبب الخادم، ونجاحها ينقل القسم للمؤرشفة', async () => {
    vi.mocked(client.archiveTeam).mockRejectedValueOnce(new DaliliApiError(409, 'لا يمكن أرشفة قسم فيه أعضاء. انقلهم أولاً (E-ORG-01)', 'E-ORG-01'))
    renderPanel()
    fireEvent.click(within(row('المالية')).getByRole('button', { name: t('dept.archive') }))
    expect((await screen.findByRole('alert')).textContent).toContain('E-ORG-01')

    const archived = { ...CONTRACTS, archivedAt: '2026-10-30T00:00:00Z' }
    vi.mocked(client.archiveTeam).mockResolvedValueOnce(archived)
    fireEvent.click(within(row('العقود')).getByRole('button', { name: t('dept.archive') }))
    await waitFor(() => expect(client.archiveTeam).toHaveBeenLastCalledWith('t-con'))
    expect((await screen.findByRole('status')).textContent).toContain('العقود')
  })

  it('استعادة قسم مؤرشف', async () => {
    vi.mocked(client.unarchiveTeam).mockResolvedValue({ ...OLD, archivedAt: null })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: t('dept.unarchiveA11y', { name: 'القديم' }) }))
    await waitFor(() => expect(client.unarchiveTeam).toHaveBeenCalledWith('t-old'))
  })

  it('الحذف يستأذن ثم يرسل — ويُعرض للقسم الفارغ فقط', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(client.deleteTeam).mockResolvedValue(undefined)
    const onTeamsChange = renderPanel()
    expect(within(row('المشتريات')).queryByRole('button', { name: t('dept.deleteA11y', { name: 'المشتريات' }) })).toBeNull()
    fireEvent.click(within(row('العقود')).getByRole('button', { name: t('dept.deleteA11y', { name: 'العقود' }) }))
    await waitFor(() => expect(client.deleteTeam).toHaveBeenCalledWith('t-con'))
    expect(onTeamsChange.mock.calls[0]![0].map((x: TeamDto) => x.id)).not.toContain('t-con')
  })

  it('بلا أقسام: سطر يشرح لماذا تُنشأ', () => {
    renderPanel([])
    expect(screen.getByText(t('dept.empty'))).toBeTruthy()
  })
})
