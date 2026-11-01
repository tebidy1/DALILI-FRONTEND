import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DaliliApiError, type LibraryOverviewDto, type PartnerConsoleDto, type PartnerProfileDto } from '@dalili/shared'
import { client } from '../api'
import { roleLabelAr } from '../lib/format'
import { adminSections, adminTitle } from './AdminConsole'
import { OnboardingChecklist } from './OnboardingChecklist'
import { PartnerProfilePage } from './PartnerProfilePage'
import { PartnerClientsPage, PartnerReportsPage, PartnerSystemsPage } from './PartnerPages'

/** ش١ (الخطة §٣.٣ و§٢٦): لوحة الشريك — أقسامها، وملفه العام، وعملاؤه وأنظمته، وتسميات الأدوار */

vi.mock('../api', () => ({
  client: { partnerProfile: vi.fn(), updatePartnerProfile: vi.fn(), uploadPartnerLogo: vi.fn(), partnerConsole: vi.fn(), stopPartnerService: vi.fn(), partnerReports: vi.fn() },
}))

const PROFILE: PartnerProfileDto = { name: 'نُظم للحلول', description: '', website: '', logoUrl: null }
const CONSOLE: PartnerConsoleDto = {
  systems: [{ id: 'odoo', name: 'أودو', domains: ['*.odoo.com', 'odoo.com'], officialGuides: 3, clients: 1, logoUrl: null }],
  clients: [{ companyId: 'co', companyName: 'شركة الأفق', systemId: 'odoo', systemName: 'أودو', since: '2026-10-30T08:00:00Z' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  try {
    localStorage.clear()
  } catch {
    /* بيئة بلا تخزين */
  }
})

describe('أقسام لوحة الشريك', () => {
  const nav = (accountKind: LibraryOverviewDto['accountKind']) => adminSections({ accountKind } as LibraryOverviewDto).map((s) => s.to)
  it('الشريك شركة كاملة لفريقه + ملفه وعملاؤه وأنظمته، بلا «أنظمتنا» (اختيار الشريك للشركات)', () => {
    expect(nav('partner')).toEqual(['/admin/members', '/admin/profile', '/admin/clients', '/admin/partner-systems', '/admin/reports', '/admin/account', '/admin/health', '/admin/audit'])
    expect(nav('company')).toEqual(['/admin/members', '/admin/systems', '/admin/account', '/admin/health', '/admin/audit'])
  })

  it('عنوان اللوحة باسم الشريك، وأعضاؤه وأقسامه كالشركة', () => {
    expect(adminSections({ accountKind: 'partner' } as LibraryOverviewDto)[0]?.label).toBe('الأعضاء والأقسام')
    expect(adminTitle({ accountKind: 'partner' } as LibraryOverviewDto)).toBe('لوحة الشريك')
    expect(adminTitle({ accountKind: 'company' } as LibraryOverviewDto)).toBe('لوحة الشركة')
  })

  it('تسميات الأدوار حسب نوع الحساب', () => {
    expect(['admin', 'creator', 'viewer'].map((r) => roleLabelAr(r, 'partner'))).toEqual(['مدير الشريك', 'محرّر الشريك', 'مراجع'])
    expect(['admin', 'creator', 'viewer'].map((r) => roleLabelAr(r, 'company'))).toEqual([roleLabelAr('admin'), roleLabelAr('creator'), roleLabelAr('viewer')])
  })
})

describe('الملف العام (PartnerProfilePage)', () => {
  it('يحفظ الوصف والموقع، ويعرض «هكذا تراك الشركات»', async () => {
    vi.mocked(client.partnerProfile).mockResolvedValue(PROFILE)
    vi.mocked(client.updatePartnerProfile).mockResolvedValue({ ...PROFILE, description: 'شريك أودو المعتمد', website: 'https://nuzum.sa' })
    render(<PartnerProfilePage />)
    fireEvent.change(await screen.findByLabelText('الوصف', {}, { timeout: 4000 }), { target: { value: 'شريك أودو المعتمد' } })
    fireEvent.change(screen.getByLabelText('الموقع'), { target: { value: 'nuzum.sa' } })
    fireEvent.click(screen.getByRole('button', { name: 'احفظ الملف' }))
    expect(client.updatePartnerProfile).toHaveBeenCalledWith({ description: 'شريك أودو المعتمد', website: 'nuzum.sa' })
    const preview = await screen.findByRole('region', { name: 'هكذا تراك الشركات' })
    expect(await within(preview).findByText('شريك أودو المعتمد')).toBeTruthy()
    expect(within(preview).getByText('نُظم للحلول')).toBeTruthy()
    expect(await screen.findByText('تم حفظ الملف.')).toBeTruthy()
  })

  it('رفض الشعار يظهر بنص الخادم ورمزه', async () => {
    vi.mocked(client.partnerProfile).mockResolvedValue(PROFILE)
    vi.mocked(client.uploadPartnerLogo).mockRejectedValue(new DaliliApiError(400, 'الشعار صورة PNG أو JPEG أو WebP حتى ٢٠٠ ك.ب (E-PRT-04)', 'E-PRT-04'))
    render(<PartnerProfilePage />)
    const input = (await screen.findByLabelText('ارفع الشعار')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } })
    expect((await screen.findByRole('alert')).textContent).toContain('E-PRT-04')
  })
})

describe('العملاء والأنظمة', () => {
  it('العملاء: الشركة والنظام وتاريخ الاختيار', async () => {
    vi.mocked(client.partnerConsole).mockResolvedValue(CONSOLE)
    render(<PartnerClientsPage />)
    const row = (await screen.findByText('شركة الأفق')).closest('tr') as HTMLElement
    expect(within(row).getByText('أودو')).toBeTruthy()
  })

  it('الأنظمة: النطاقات وعدد الأدلة والعملاء، قراءة فقط', async () => {
    vi.mocked(client.partnerConsole).mockResolvedValue(CONSOLE)
    render(<PartnerSystemsPage />)
    const card = (await screen.findByRole('heading', { name: 'أودو' })).closest('article') as HTMLElement
    expect(within(card).getByText('٣ دليل رسمي')).toBeTruthy()
    expect(within(card).getByText('odoo.com')).toBeTruthy()
    expect(within(card).queryByRole('button')).toBeNull()
  })

  it('ش٢: «أوقف الخدمة» بتأكيد، ثم تختفي الشركة', async () => {
    vi.mocked(client.partnerConsole).mockResolvedValue(CONSOLE)
    vi.mocked(client.stopPartnerService).mockResolvedValue({ ...CONSOLE, clients: [] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PartnerClientsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'أوقف الخدمة عن شركة الأفق' }))
    await waitFor(() => expect(client.stopPartnerService).toHaveBeenCalledWith('co', 'odoo'))
    expect(confirm.mock.calls[0]?.[0]).toContain('شركة الأفق')
    expect(await screen.findByText('لم تخترك أي شركة بعد. حين تختارك شركة لنظام، تظهر هنا.')).toBeTruthy()
    confirm.mockRestore()
  })

  it('ش٢: التقارير — قرّاء كل دليل رسمي وعدد الشركات', async () => {
    vi.mocked(client.partnerReports).mockResolvedValue({ activeCompanies: 2, guides: [{ id: 'og1', title: 'إنشاء فاتورة مبدئية', systemName: 'أودو', readers: 14, companies: 2 }] })
    render(<PartnerReportsPage />)
    const row = (await screen.findByText('إنشاء فاتورة مبدئية')).closest('tr') as HTMLElement
    expect(within(row).getByText('١٤')).toBeTruthy()
    expect(screen.getByText('شركتان مفعّلتان', { exact: false })).toBeTruthy()
  })

  it('بلا عملاء: جملة واضحة', async () => {
    vi.mocked(client.partnerConsole).mockResolvedValue({ ...CONSOLE, clients: [] })
    render(<PartnerClientsPage />)
    expect(await screen.findByText('لم تخترك أي شركة بعد. حين تختارك شركة لنظام، تظهر هنا.')).toBeTruthy()
  })
})

describe('قائمة بداية الشريك', () => {
  it('الملف العام وأقسام الفريق ودعوته، ونشر أول دليل رسمي', () => {
    render(<MemoryRouter><OnboardingChecklist state={{ profile: true, departments: false, members: false, guides: false }} /></MemoryRouter>)
    expect(screen.getByText('أكمل ملفك العام: الشعار والوصف').closest('li')?.className).toContain('done')
    expect(screen.getByText('أنشئ أقسام فريقك، مثل الدعم الفني')).toBeTruthy()
    expect(screen.getByText('ادعُ فريقك')).toBeTruthy()
    expect(screen.getByText('انشر أول دليل رسمي لنظام من أنظمتك')).toBeTruthy()
  })
})
