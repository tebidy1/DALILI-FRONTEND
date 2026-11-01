import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { AssignmentBoardDto, AssignmentRecipientDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { AssigneesPanel } from './AssigneesPanel'

vi.mock('../api', () => ({
  client: { guideAssignments: vi.fn() },
}))

const rec = (over: Partial<AssignmentRecipientDto>): AssignmentRecipientDto => ({
  userId: 'u', email: 'x@x.sa', teamName: null, openedAt: null, doneAt: null, itemsDone: 0, itemsTotal: 2, started: false, ...over,
})

const BOARD: AssignmentBoardDto = {
  recipientCount: 3,
  openedCount: 2,
  doneCount: 1,
  recipients: [
    rec({ userId: 'u2', email: 'new@x.sa' }),
    rec({ userId: 'u1', email: 'started@x.sa', teamName: 'الجودة', openedAt: '2026-09-10T01:00:00Z', itemsDone: 1, started: true }),
    rec({ userId: 'u3', email: 'done@x.sa', openedAt: 'x', doneAt: '2026-09-11T00:00:00Z', itemsDone: 2, started: true }),
  ],
}

describe('د١: AssigneesPanel', () => {
  it('ثلاث مجموعات بالترتيب: أكملوا، بدأوا، لم يبدأوا بعد', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue(BOARD)
    render(<AssigneesPanel guideId="g1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('done@x.sa')).toBeTruthy())
    const text = document.body.textContent ?? ''
    const order = ['أكملوا', 'done@x.sa', 'بدأوا', 'started@x.sa', 'لم يبدأوا بعد', 'new@x.sa'].map((s) => text.indexOf(s))
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]!))).toBe(true)
  })

  it('يعرض «أنهى ١ من ٢» لمن بدأ في دورة بأكثر من عنصر', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue(BOARD)
    render(<AssigneesPanel guideId="g1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('أنهى ١ من ٢')).toBeTruthy())
  })

  it('د١ب: في الدورة العدد بالدروس', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue(BOARD)
    render(<AssigneesPanel guideId="c1" kind="course" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('أنهى ١ من ٢ دروس')).toBeTruthy())
  })

  it('بلا أحمر', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue(BOARD)
    const { container } = render(<AssigneesPanel guideId="g1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('done@x.sa')).toBeTruthy())
    expect(container.innerHTML).not.toMatch(/red|danger/)
  })

  it('حالة فارغة حين لا مستهدَفين', async () => {
    vi.mocked(client.guideAssignments).mockResolvedValue({ recipients: [], recipientCount: 0, openedCount: 0, doneCount: 0 })
    render(<AssigneesPanel guideId="g1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(t('assignees.empty'))).toBeTruthy())
  })
})
