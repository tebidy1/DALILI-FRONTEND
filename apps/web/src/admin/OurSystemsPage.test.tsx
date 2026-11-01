import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { CompanySystemDto, LibraryOverviewDto } from '@dalili/shared'
import { client } from '../api'
import { OurSystemsPage } from './OurSystemsPage'
import { adminSections } from './AdminConsole'

/** ج١ (الخطة §١٢.٢): أنظمتنا كالموصلات — أضف النظام، واختر شريكه، ونطاق نسختكم */

vi.mock('../api', () => ({
  client: {
    companySystems: vi.fn(),
    companyAddSystem: vi.fn(),
    companyRemoveSystem: vi.fn(),
    companyChoosePartner: vi.fn(),
    companyAddDomain: vi.fn(),
    companyRemoveDomain: vi.fn(),
  },
}))

const ODOO: CompanySystemDto = {
  id: 'odoo', name: 'أودو', domains: ['*.odoo.com', 'odoo.com'], added: false, partnerId: null, ownDomains: [],
  providers: [{ id: 'p1', name: 'نُظم للحلول', officialGuides: 12 }, { id: 'p2', name: 'حلول المستقبل', officialGuides: 0 }],
}
const QOYOD: CompanySystemDto = { id: 'qoyod', name: 'قيود', domains: ['qoyod.com'], added: false, partnerId: null, ownDomains: [], providers: [] }
const ADDED = { ...ODOO, added: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

const ours = () => screen.getByRole('region', { name: 'أنظمتنا' })
const available = () => screen.getByRole('region', { name: 'أنظمة يمكن إضافتها' })

describe('OurSystemsPage — أنظمتنا (ج١)', () => {
  it('يضيف النظام ثم يختار شريكه فيفعّل فوراً', async () => {
    vi.mocked(client.companySystems).mockResolvedValue([ODOO, QOYOD])
    vi.mocked(client.companyAddSystem).mockResolvedValue(ADDED)
    vi.mocked(client.companyChoosePartner).mockResolvedValue({ ...ADDED, partnerId: 'p1' })
    render(<OurSystemsPage />)
    expect(await within(await screen.findByRole('region', { name: 'أنظمتنا' })).findByText('لم تُضف أي نظام بعد. اختر من الأنظمة أدناه.')).toBeTruthy()
    const card = within(available()).getByRole('heading', { name: 'أودو' }).closest('article') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'أضف' }))
    expect(client.companyAddSystem).toHaveBeenCalledWith('odoo')

    const group = await within(ours()).findByRole('radiogroup', { name: 'مقدّم الأدلة' })
    expect((within(group).getByRole('radio', { name: /بلا شريك/ }) as HTMLInputElement).checked).toBe(true)
    expect(within(group).getByText('١٢ دليل رسمي')).toBeTruthy()
    fireEvent.click(within(group).getByRole('radio', { name: /نُظم للحلول/ }))
    expect(client.companyChoosePartner).toHaveBeenCalledWith('odoo', 'p1')
    expect(await within(ours()).findByText('تم. يرى موظفوكم أدلة «نُظم للحلول» لهذا النظام.')).toBeTruthy()
    expect(within(available()).queryByRole('heading', { name: 'أودو' })).toBeNull()
  })

  it('نطاق نسختكم: يُضاف ويُزال', async () => {
    vi.mocked(client.companySystems).mockResolvedValue([ADDED])
    vi.mocked(client.companyAddDomain).mockResolvedValue({ ...ADDED, ownDomains: ['erp.alofuq.sa'] })
    vi.mocked(client.companyRemoveDomain).mockResolvedValue(ADDED)
    render(<OurSystemsPage />)
    fireEvent.change(await screen.findByLabelText('نطاق نسختكم'), { target: { value: 'erp.alofuq.sa' } })
    fireEvent.click(screen.getByRole('button', { name: 'أضف النطاق' }))
    expect(client.companyAddDomain).toHaveBeenCalledWith('odoo', 'erp.alofuq.sa')
    fireEvent.click(await screen.findByRole('button', { name: 'أزل «erp.alofuq.sa»' }))
    expect(client.companyRemoveDomain).toHaveBeenCalledWith('odoo', 'erp.alofuq.sa')
  })

  it('نظام بلا مقدّمين: جملة واضحة بلا قائمة فارغة', async () => {
    vi.mocked(client.companySystems).mockResolvedValue([{ ...QOYOD, added: true }])
    render(<OurSystemsPage />)
    expect(await screen.findByText('لا يوجد مقدّم أدلة لهذا النظام بعد.')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('الإزالة بتأكيد', async () => {
    vi.mocked(client.companySystems).mockResolvedValue([ADDED])
    vi.mocked(client.companyRemoveSystem).mockResolvedValue(ODOO)
    render(<OurSystemsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'أزل من أنظمتنا' }))
    expect(window.confirm).toHaveBeenCalled()
    await vi.waitFor(() => expect(client.companyRemoveSystem).toHaveBeenCalledWith('odoo'))
    expect(await within(available()).findByRole('heading', { name: 'أودو' })).toBeTruthy()
  })
})

describe('AdminConsole — قسم «أنظمتنا» لحساب الشركة وحده', () => {
  const nav = (accountKind: LibraryOverviewDto['accountKind']) => adminSections({ accountKind } as LibraryOverviewDto).map((s) => s.to)
  it('يظهر للشركة ويختفي للشريك والشخصي', () => {
    expect(nav('company')).toContain('/admin/systems')
    expect(nav('partner')).not.toContain('/admin/systems')
    expect(nav('personal')).not.toContain('/admin/systems')
  })
})
