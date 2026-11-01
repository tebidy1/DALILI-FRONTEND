import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DaliliApiError, type PlatformAccountDto, type PlatformSystemDto } from '@dalili/shared'
import { client } from '../api'
import { SystemsPage } from './SystemsPage'

/** ج١ (الخطة §١٢.١): نحن نضيف النظام بنطاقاته، ونربط به مقدّمي أدلته */

vi.mock('../api', () => ({
  client: {
    platformSystems: vi.fn(),
    platformCreateSystem: vi.fn(),
    platformUpdateSystem: vi.fn(),
    platformAddProvider: vi.fn(),
    platformRemoveProvider: vi.fn(),
    platformAccounts: vi.fn(),
    platformUploadSystemLogo: vi.fn(),
  },
}))

const ODOO: PlatformSystemDto = { id: 's1', name: 'أودو', hidden: false, createdAt: '', domains: ['*.odoo.com', 'odoo.com'], providers: [], companies: 2 }
const partner = (id: string, name: string) => ({ id, name, kind: 'partner', status: 'active' }) as PlatformAccountDto

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.platformSystems).mockResolvedValue([ODOO])
  vi.mocked(client.platformAccounts).mockResolvedValue([partner('p1', 'نُظم للحلول'), partner('p2', 'حلول المستقبل')])
})

const card = async (name: string) => (await screen.findByRole('heading', { name })).closest('article') as HTMLElement

describe('SystemsPage — الأنظمة (ج١)', () => {
  it('ينشئ نظاماً بنطاقاته ويعرضها شرائح', async () => {
    vi.mocked(client.platformSystems).mockResolvedValueOnce([]).mockResolvedValue([ODOO])
    vi.mocked(client.platformCreateSystem).mockResolvedValue(ODOO)
    render(<SystemsPage />)
    fireEvent.change(await screen.findByLabelText('اسم النظام'), { target: { value: 'أودو' } })
    fireEvent.change(screen.getByLabelText('النطاقات'), { target: { value: 'odoo.com، *.odoo.com ,' } })
    fireEvent.click(screen.getByRole('button', { name: 'أضف النظام' }))
    const c = await card('أودو')
    expect(client.platformCreateSystem).toHaveBeenCalledWith({ name: 'أودو', domains: ['odoo.com', '*.odoo.com'] })
    expect(within(c).getByText('*.odoo.com')).toBeTruthy()
    expect(within(c).getByText('تستعمله ٢ شركة')).toBeTruthy()
  })

  it('يعرض رسالة الخادم حين يكون النطاق لنظام آخر (E-SYS-01)', async () => {
    vi.mocked(client.platformCreateSystem).mockRejectedValue(new DaliliApiError(409, 'هذا النطاق مسجّل لنظام آخر (E-SYS-01)', 'E-SYS-01'))
    render(<SystemsPage />)
    fireEvent.change(await screen.findByLabelText('اسم النظام'), { target: { value: 'آخر' } })
    fireEvent.change(screen.getByLabelText('النطاقات'), { target: { value: 'odoo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'أضف النظام' }))
    expect((await screen.findByRole('alert')).textContent).toContain('E-SYS-01')
  })

  it('يضيف مقدّماً من الشركاء ويزيله', async () => {
    vi.mocked(client.platformAddProvider).mockResolvedValue({ ...ODOO, providers: [{ id: 'p1', name: 'نُظم للحلول', status: 'active' }] })
    vi.mocked(client.platformRemoveProvider).mockResolvedValue(ODOO)
    render(<SystemsPage />)
    const c = await card('أودو')
    fireEvent.change(within(c).getByLabelText('أضف مقدّماً'), { target: { value: 'p1' } })
    fireEvent.click(within(c).getByRole('button', { name: 'أضف' }))
    expect(client.platformAddProvider).toHaveBeenCalledWith('s1', 'p1')
    fireEvent.click(await within(c).findByRole('button', { name: 'أزل «نُظم للحلول»' }))
    expect(client.platformRemoveProvider).toHaveBeenCalledWith('s1', 'p1')
    expect(await within(c).findByText('لا مقدّم أدلة بعد')).toBeTruthy()
  })

  it('يعدّل النطاقات ويخفي النظام', async () => {
    vi.mocked(client.platformUpdateSystem).mockImplementation(async (_id, patch) => ({ ...ODOO, ...('domains' in patch ? { domains: patch.domains! } : {}), hidden: !!patch.hidden }))
    render(<SystemsPage />)
    const c = await card('أودو')
    fireEvent.click(within(c).getByRole('button', { name: 'عدّل النطاقات' }))
    fireEvent.change(within(c).getByLabelText('النطاقات'), { target: { value: 'odoo.com' } })
    fireEvent.click(within(c).getByRole('button', { name: 'احفظ' }))
    expect(client.platformUpdateSystem).toHaveBeenCalledWith('s1', { domains: ['odoo.com'] })
    expect(await within(c).findByText('odoo.com')).toBeTruthy()
    fireEvent.click(within(c).getByRole('button', { name: 'أخفِ من الشركات الجديدة' }))
    expect(client.platformUpdateSystem).toHaveBeenLastCalledWith('s1', { hidden: true })
    expect(await within(c).findByText('مخفي')).toBeTruthy()
  })

  it('يرفع شعار النظام فيظهر بدل الحرف', async () => {
    vi.mocked(client.platformUploadSystemLogo).mockResolvedValue({ ...ODOO, logoUrl: 'http://api.test/api/logos/system/s1?v=1' })
    render(<SystemsPage />)
    const c = await card('أودو')
    const file = new File(['png'], 'odoo.png', { type: 'image/png' })
    fireEvent.change(within(c).getByLabelText('ارفع شعار النظام'), { target: { files: [file] } })
    expect(client.platformUploadSystemLogo).toHaveBeenCalledWith('s1', file)
    await vi.waitFor(() => expect(c.querySelector('img.sys-logo')?.getAttribute('src')).toContain('/api/logos/system/s1'))
  })
})
