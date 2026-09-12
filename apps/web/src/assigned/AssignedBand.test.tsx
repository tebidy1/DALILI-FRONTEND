import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AssignedItemDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { AssignedBand } from './AssignedBand'

vi.mock('../api', () => ({
  client: {
    listAssigned: vi.fn(),
    setAssignmentProgress: vi.fn().mockResolvedValue({ openedAt: 'x', doneAt: null }),
  },
}))

const mk = (over: Partial<AssignedItemDto> = {}): AssignedItemDto => ({
  assignmentId: 'a1', guideId: 'g1', title: 'دورة التأهيل', kind: 'guide', site: 'erp.example',
  stepCount: 5, assignerEmail: 'mgr@x.sa', note: '', createdAt: '2026-09-10T00:00:00Z', openedAt: null, doneAt: null,
  ...over,
})

function renderBand() {
  return render(
    <MemoryRouter>
      <AssignedBand />
    </MemoryRouter>,
  )
}

describe('AssignedBand', () => {
  it('يعرض القسم والإعلان حين وجود عنصر غير مفتوح', async () => {
    vi.mocked(client.listAssigned).mockResolvedValue([mk()])
    renderBand()
    await waitFor(() => expect(screen.getByText('دورة التأهيل')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toContain(t('assigned.newBanner', { count: 1 }))
  })

  it('لا يعرض شيئًا حين القائمة فارغة', async () => {
    vi.mocked(client.listAssigned).mockResolvedValue([])
    const { container } = renderBand()
    await waitFor(() => expect(vi.mocked(client.listAssigned)).toHaveBeenCalled())
    expect(container.querySelector('.assigned-band')).toBeNull()
  })

  it('لا إعلان حين كل العناصر مفتوحة', async () => {
    vi.mocked(client.listAssigned).mockResolvedValue([mk({ openedAt: '2026-09-10T01:00:00Z' })])
    renderBand()
    await waitFor(() => expect(screen.getByText('دورة التأهيل')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
  })
})
