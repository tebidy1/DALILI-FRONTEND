import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { client } from '../api'
import { useAssignmentActions } from './useAssignmentActions'
import { assignedItem } from './test-fixtures'

vi.mock('../api', () => ({ client: { setAssignmentProgress: vi.fn().mockResolvedValue({ openedAt: 'x', doneAt: null }) } }))

describe('د١: useAssignmentActions', () => {
  it('«ابدأ» في الكرّاسة يفتح الكرّاسة نفسها ويسجّل الفتح', () => {
    const navigate = vi.fn()
    const { result } = renderHook(() => useAssignmentActions({ navigate }))
    result.current.onContinue(assignedItem())
    expect(client.setAssignmentProgress).toHaveBeenCalledWith('a1')
    expect(navigate).toHaveBeenCalledWith('/g/bk')
  })

  it('«تابع» لمضمّن يفتحه داخل الدورة', () => {
    const navigate = vi.fn()
    const { result } = renderHook(() => useAssignmentActions({ navigate }))
    result.current.onContinue(assignedItem({ openedAt: 'x', course: { ...assignedItem().course, itemsDone: 1, nextItemId: 'gB' } }))
    expect(navigate).toHaveBeenCalledWith('/g/gB?course=bk')
  })
})
