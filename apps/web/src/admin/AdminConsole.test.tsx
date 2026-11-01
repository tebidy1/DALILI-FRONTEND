import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'
import { AccountPage } from './AccountPage'
import { OnboardingChecklist } from './OnboardingChecklist'

/** م٢: لوحة الشركة — صفحة الحساب، وقائمة البداية لمدير الشركة */

vi.mock('../api', () => ({ client: { getCompanyAccount: vi.fn(), renameCompanyAccount: vi.fn() } }))

const ACCOUNT = { name: 'شركة الأفق', kind: 'company' as const, status: 'active' as const, plan: 'free', members: 4, guides: 12, storageBytes: 2_500_000 }

beforeEach(() => {
  vi.clearAllMocks()
  try {
    localStorage.clear()
  } catch {
    /* بيئة بلا تخزين */
  }
})

describe('صفحة الحساب (م٢)', () => {
  it('تعرض الخطة والاستعمال، وتغيّر الاسم', async () => {
    vi.mocked(client.getCompanyAccount).mockResolvedValue(ACCOUNT)
    vi.mocked(client.renameCompanyAccount).mockResolvedValue({ ...ACCOUNT, name: 'شركة الأفق القابضة' })
    render(<AccountPage />)
    expect(await screen.findByText(t('account.planFree'), {}, { timeout: 4000 })).toBeTruthy()
    // الاسم يُملأ من الخادم بعد الرسم: الكتابة قبلها يمحوها الملء
    const input = await screen.findByDisplayValue('شركة الأفق')
    fireEvent.change(input, { target: { value: 'شركة الأفق القابضة' } })
    fireEvent.click(screen.getByRole('button', { name: t('account.saveName') }))
    await waitFor(() => expect(client.renameCompanyAccount).toHaveBeenCalledWith('شركة الأفق القابضة'))
    expect(await screen.findByText(t('account.nameSaved'))).toBeTruthy()
  })
})

describe('قائمة البداية (م٢)', () => {
  it('تعرض البنود الناقصة مكتملة أو لا، وتختفي عند الإخفاء', () => {
    render(<MemoryRouter><OnboardingChecklist state={{ departments: false, members: true, guides: false }} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: new RegExp(t('onboarding.departments')) })).toBeTruthy()
    expect(screen.getByText(t('onboarding.members')).closest('li')?.className).toContain('done')
    fireEvent.click(screen.getByRole('button', { name: t('onboarding.hide') }))
    expect(screen.queryByText(t('onboarding.title'))).toBeNull()
  })

  it('لا تظهر حين تكتمل أو لغير المدير', () => {
    const { container } = render(<MemoryRouter><OnboardingChecklist state={{ departments: true, members: true, guides: true }} /></MemoryRouter>)
    expect(container.textContent).toBe('')
    const second = render(<MemoryRouter><OnboardingChecklist state={null} /></MemoryRouter>)
    expect(second.container.textContent).toBe('')
  })
})
