import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MemberDto, TeamDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { AssignDialog } from './AssignDialog'

vi.mock('../api', () => ({
  client: {
    getTeamMembers: vi.fn(),
    listTeams: vi.fn(),
    assignGuide: vi.fn().mockResolvedValue({ created: 1 }),
  },
}))

const MEMBERS: MemberDto[] = [
  { id: 'u1', email: 'a@x.sa', role: 'creator', department: '' },
  { id: 'u2', email: 'b@x.sa', role: 'viewer', department: '' },
]
const TEAMS: TeamDto[] = [{ id: 't1', name: 'الجودة', memberCount: 3 }]

function setup(isPrivate = false) {
  vi.mocked(client.getTeamMembers).mockResolvedValue(MEMBERS)
  vi.mocked(client.listTeams).mockResolvedValue(TEAMS)
  const onClose = vi.fn()
  render(<AssignDialog guideId="g1" isPrivate={isPrivate} onClose={onClose} />)
  return { onClose }
}

describe('AssignDialog', () => {
  it('إسناد «لكل الشركة» يستدعي assignGuide بهدف workspace', async () => {
    setup()
    await waitFor(() => expect(vi.mocked(client.listTeams)).toHaveBeenCalled())
    fireEvent.click(screen.getByText(t('assign.tabWorkspace')))
    fireEvent.click(screen.getByRole('button', { name: t('assign.submit') }))
    await waitFor(() =>
      expect(vi.mocked(client.assignGuide)).toHaveBeenCalledWith('g1', [{ kind: 'workspace', id: '*' }], ''),
    )
  })

  it('يعرض تحذير الدليل الخاص حين isPrivate', async () => {
    setup(true)
    await waitFor(() => expect(vi.mocked(client.listTeams)).toHaveBeenCalled())
    expect(screen.getByText(t('assign.privateWarn'))).toBeTruthy()
  })

  it('إسناد لشخص محدد يبني هدف user', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('a@x.sa')).toBeTruthy())
    fireEvent.click(screen.getByText('a@x.sa'))
    fireEvent.click(screen.getByRole('button', { name: t('assign.submit') }))
    await waitFor(() =>
      expect(vi.mocked(client.assignGuide)).toHaveBeenCalledWith('g1', [{ kind: 'user', id: 'u1' }], ''),
    )
  })

  it('لا هدف مختار: يظهر خطأ ولا يستدعي assignGuide', async () => {
    setup()
    await waitFor(() => expect(vi.mocked(client.getTeamMembers)).toHaveBeenCalled())
    // وضع «شخص» افتراضي بلا اختيار
    fireEvent.click(screen.getByRole('button', { name: t('assign.submit') }))
    expect(screen.getByText(t('assign.pickTarget'))).toBeTruthy()
  })
})
