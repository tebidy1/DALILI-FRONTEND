import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { client } from '../api'
import { t } from '../i18n'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/** ORG-00: مبدّل المساحات — يظهر لمن له مساحتان فأكثر، والتبديل يعيد تحميل التطبيق */

vi.mock('../api', () => ({
  client: { listMyWorkspaces: vi.fn(), switchWorkspace: vi.fn() },
}))

const TWO = [
  { id: 'w1', name: 'مساحتي', role: 'admin' as const, active: true },
  { id: 'w2', name: 'شركة المثال', role: 'creator' as const, active: false },
]

beforeEach(() => vi.clearAllMocks())

describe('مبدّل المساحات (ORG-00)', () => {
  it('يعرض المساحات والنشطة مختارة، والتبديل يستدعي الخادم ثم يعيد التحميل', async () => {
    vi.mocked(client.listMyWorkspaces).mockResolvedValue(TWO)
    vi.mocked(client.switchWorkspace).mockResolvedValue({ workspaceId: 'w2' })
    const onSwitched = vi.fn()
    render(<WorkspaceSwitcher onSwitched={onSwitched} />)
    const sel = (await screen.findByRole('combobox', { name: t('ws.switchA11y') })) as HTMLSelectElement
    expect(sel.value).toBe('w1')
    expect(screen.getByRole('option', { name: 'شركة المثال' })).toBeTruthy()
    fireEvent.change(sel, { target: { value: 'w2' } })
    await waitFor(() => expect(client.switchWorkspace).toHaveBeenCalledWith('w2'))
    await waitFor(() => expect(onSwitched).toHaveBeenCalled())
  })

  it('مساحة واحدة: لا مبدّل', async () => {
    vi.mocked(client.listMyWorkspaces).mockResolvedValue(TWO.slice(0, 1))
    const { container } = render(<WorkspaceSwitcher onSwitched={vi.fn()} />)
    await waitFor(() => expect(client.listMyWorkspaces).toHaveBeenCalled())
    expect(container.querySelector('select')).toBeNull()
  })

  it('فشل التبديل: رسالة صادقة ولا إعادة تحميل', async () => {
    vi.mocked(client.listMyWorkspaces).mockResolvedValue(TWO)
    vi.mocked(client.switchWorkspace).mockRejectedValue(new Error('x'))
    const onSwitched = vi.fn()
    render(<WorkspaceSwitcher onSwitched={onSwitched} />)
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'w2' } })
    expect(await screen.findByText(t('ws.switchError'))).toBeTruthy()
    expect(onSwitched).not.toHaveBeenCalled()
  })
})
