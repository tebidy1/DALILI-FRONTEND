import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { client } from '../api'

afterEach(cleanup)

describe('VER-01: VersionHistoryPanel', () => {
  beforeEach(() => {
    vi.spyOn(client, 'listVersions').mockResolvedValue({
      items: [
        { id: 'v2', createdAt: '2026-09-08T12:00:00Z', authorId: 'u1', stepCount: 3, title: 'الحالية' },
        { id: 'v1', createdAt: '2026-09-08T10:00:00Z', authorId: 'u1', stepCount: 2, title: 'أول' },
      ],
    })
  })

  it('يعرض الصفّين، الأحدث بشارة «الحالي» ومعطّل', async () => {
    render(<VersionHistoryPanel guideId="g1" onPick={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getAllByRole('button').filter((b) => b.className.includes('version-row')).length).toBe(2),
    )
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('version-row'))
    expect(rows[0]!.textContent).toContain('الحالي')
    expect((rows[0] as HTMLButtonElement).disabled).toBe(true)
    expect((rows[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('نقر صفٍّ قديم يستدعي onPick بالمعرّف', async () => {
    const pick = vi.fn()
    render(<VersionHistoryPanel guideId="g1" onPick={pick} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getAllByRole('button').filter((b) => b.className.includes('version-row')).length).toBe(2),
    )
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('version-row'))
    fireEvent.click(rows[1]!)
    expect(pick).toHaveBeenCalledWith('v1')
  })

  it('حالة خالية عند items.length === 0', async () => {
    ;(client.listVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ items: [] })
    render(<VersionHistoryPanel guideId="g1" onPick={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText(/لا إصدارات بعد/)).toBeTruthy()
  })

  it('حالة الخطأ تعرض رسالة تحميل', async () => {
    ;(client.listVersions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('x'))
    render(<VersionHistoryPanel guideId="g1" onPick={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText(/تعذّر تحميل السجل/)).toBeTruthy()
  })
})
