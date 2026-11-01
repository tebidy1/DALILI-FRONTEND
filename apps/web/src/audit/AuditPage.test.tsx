import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DaliliApiError, type AuditEntryDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { AuditPage } from './AuditPage'

/** ORG-08: شاشة السجل بحالاتها الأربع — تحميل، فارغ، خطأ مع إعادة، نتائج — ومرشح وتصدير */

vi.mock('../api', () => ({
  client: { listAudit: vi.fn(), auditCsvUrl: vi.fn((a?: string) => `/api/audit.csv${a ? `?action=${a}` : ''}`) },
}))

const ROW: AuditEntryDto = {
  id: 'a1', at: '2026-10-29T10:00:00.000Z', action: 'member.deactivate', actorId: 'u1', actorEmail: 'boss@co.sa',
  targetKind: 'user', targetId: 'u2', targetLabel: 'emp@co.sa', meta: {},
}

function renderPage() {
  render(<MemoryRouter><AuditPage /></MemoryRouter>)
}

beforeEach(() => vi.clearAllMocks())

describe('سجل التدقيق (ORG-08)', () => {
  it('نتائج: من وماذا وعلى من، وتصدير CSV', async () => {
    vi.mocked(client.listAudit).mockResolvedValue({ items: [ROW] })
    renderPage()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(await screen.findByText('boss@co.sa')).toBeTruthy()
    const table = within(screen.getByRole('table'))
    expect(table.getByText(t('audit.a.member.deactivate'))).toBeTruthy()
    expect(table.getByText('emp@co.sa')).toBeTruthy()
    expect(screen.getByRole('link', { name: t('audit.export') }).getAttribute('href')).toBe('/api/audit.csv')
  })

  it('فارغ: يقول ما سيظهر هنا', async () => {
    vi.mocked(client.listAudit).mockResolvedValue({ items: [] })
    renderPage()
    expect(await screen.findByText(t('audit.empty'))).toBeTruthy()
  })

  it('خطأ: إعادة المحاولة تعيد الجلب', async () => {
    vi.mocked(client.listAudit).mockRejectedValueOnce(new DaliliApiError(0, 'x')).mockResolvedValue({ items: [ROW] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: t('common.retry') }))
    expect(await screen.findByText('boss@co.sa')).toBeTruthy()
  })

  it('غير المدير: رسالة صريحة لا شاشة خطأ عامة', async () => {
    vi.mocked(client.listAudit).mockRejectedValue(new DaliliApiError(403, 'x'))
    renderPage()
    expect(await screen.findByText(t('audit.forbidden'))).toBeTruthy()
  })

  it('المرشح يعيد الجلب بالفعل المختار ويغيّر رابط التصدير', async () => {
    vi.mocked(client.listAudit).mockResolvedValue({ items: [ROW] })
    renderPage()
    await screen.findByText('boss@co.sa')
    fireEvent.change(screen.getByRole('combobox', { name: t('audit.filterA11y') }), { target: { value: 'guide.publish' } })
    await waitFor(() => expect(client.listAudit).toHaveBeenLastCalledWith({ action: 'guide.publish', before: undefined }, expect.anything()))
    expect(screen.getByRole('link', { name: t('audit.export') }).getAttribute('href')).toBe('/api/audit.csv?action=guide.publish')
  })
})
