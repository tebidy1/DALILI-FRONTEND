import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { AssignedItemDto } from '@dalili/shared'
import { t } from '../i18n'
import { AssignedList } from './AssignedList'

const item: AssignedItemDto = {
  assignmentId: 'a1',
  guideId: 'g1',
  title: 'دورة التأهيل',
  kind: 'guide',
  site: 'erp.example',
  stepCount: 5,
  assignerEmail: 'mgr@x.sa',
  note: 'ابدأ بها',
  createdAt: '2026-09-10T00:00:00Z',
  openedAt: null,
  doneAt: null,
}

describe('AssignedList', () => {
  it('يعرض العنوان والملاحظة والإفصاح، ويستدعي onToggleDone عند «تمّ»', () => {
    const onToggleDone = vi.fn()
    const { getByText, container } = render(<AssignedList items={[item]} onOpen={() => {}} onToggleDone={onToggleDone} />)
    expect(container.textContent).toContain('دورة التأهيل')
    expect(container.textContent).toContain('ابدأ بها')
    expect(container.textContent).toContain(t('assigned.disclosure'))
    fireEvent.click(getByText(t('assigned.markDone')))
    expect(onToggleDone).toHaveBeenCalledWith('a1', true)
  })

  it('يستدعي onOpen عند الضغط على العنوان', () => {
    const onOpen = vi.fn()
    const { getByText } = render(<AssignedList items={[item]} onOpen={onOpen} onToggleDone={() => {}} />)
    fireEvent.click(getByText('دورة التأهيل'))
    expect(onOpen).toHaveBeenCalledWith(item)
  })

  it('العنصر المُتمّ يعرض «تم الإنجاز» ويبدّل بالتراجع', () => {
    const onToggleDone = vi.fn()
    const done = { ...item, openedAt: '2026-09-10T01:00:00Z', doneAt: '2026-09-10T02:00:00Z' }
    const { getByText } = render(<AssignedList items={[done]} onOpen={() => {}} onToggleDone={onToggleDone} />)
    fireEvent.click(getByText(t('assigned.doneState')))
    expect(onToggleDone).toHaveBeenCalledWith('a1', false)
  })

  it('حالة فارغة حين لا عناصر', () => {
    const { container } = render(<AssignedList items={[]} onOpen={() => {}} onToggleDone={() => {}} />)
    expect(container.textContent).toContain(t('assigned.empty'))
  })
})
