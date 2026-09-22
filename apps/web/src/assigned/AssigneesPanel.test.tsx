import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { AssignmentBoardDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { AssigneesPanel } from './AssigneesPanel'

vi.mock('../api', () => ({
  client: { guideAssignments: vi.fn() },
}))

const BOARD: AssignmentBoardDto = {
  recipientCount: 2,
  openedCount: 1,
  doneCount: 0,
  recipients: [
    { userId: 'u1', email: 'a@x.sa', teamName: 'الجودة', openedAt: '2026-09-10T01:00:00Z', doneAt: null },
    { userId: 'u2', email: 'b@x.sa', teamName: null, openedAt: null, doneAt: null },
  ],
}

describe('AssigneesPanel', () => {
  it('يعرض رأس العدّاد وأسماء المستهدَفين وحالتهم', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue(BOARD)
    render(<AssigneesPanel guideId="g1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('a@x.sa')).toBeTruthy())
    expect(screen.getByText('b@x.sa')).toBeTruthy()
    expect(document.body.textContent).toContain(t('assignees.header', { opened: 1, total: 2, done: 0 }))
  })

  it('حالة فارغة حين لا مستهدَفين', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue({ recipients: [], recipientCount: 0, openedCount: 0, doneCount: 0 })
    render(<AssigneesPanel guideId="g1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(t('assignees.empty'))).toBeTruthy())
  })
})
