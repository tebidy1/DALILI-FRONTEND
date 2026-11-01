import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAssignmentActions } from './useAssignmentActions'
import { assignedItem, course } from './test-fixtures'

vi.mock('../api', () => ({ client: { setAssignmentProgress: vi.fn().mockResolvedValue(undefined) } }))

/** د١ب: الدورة بالدروس تُفتح في مشغّلها — «ابدأ» إلى أول درس، و«تابع» إلى التالي */
describe('useAssignmentActions — الدورة', () => {
  const c = assignedItem({ guideId: 'c1', kind: 'course', course: course({ guideId: 'c1', kind: 'course', nextItemId: 'gA' }) })

  it('start opens the first lesson in the player', () => {
    const navigate = vi.fn()
    const { result } = renderHook(() => useAssignmentActions({ navigate }))
    result.current.onContinue(c)
    expect(navigate).toHaveBeenCalledWith('/c/c1/gA')
  })

  it('the title opens the course page', () => {
    const navigate = vi.fn()
    const { result } = renderHook(() => useAssignmentActions({ navigate }))
    result.current.onOpen(c)
    expect(navigate).toHaveBeenCalledWith('/c/c1')
  })
})
