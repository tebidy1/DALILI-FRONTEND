import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { ProfileCard } from './ProfileCard'

/** م١: «ملفي» — الاسم الظاهر للزملاء، وتغيير كلمة المرور */

vi.mock('../api', () => ({ client: { updateProfile: vi.fn(), changePassword: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

describe('ملفي (م١)', () => {
  it('يعرض الاسم الحالي ويحفظ الجديد', async () => {
    vi.mocked(client.updateProfile).mockResolvedValue({ name: 'سارة العتيبي' })
    render(<ProfileCard initialName="سارة" />)
    const input = await screen.findByLabelText(t('profile.name'))
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('سارة'))
    fireEvent.change(input, { target: { value: 'سارة العتيبي' } })
    fireEvent.click(screen.getByRole('button', { name: t('profile.saveName') }))
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith('سارة العتيبي'))
    expect(await screen.findByText(t('profile.nameSaved'))).toBeTruthy()
  })

  it('تغيير كلمة المرور يعرض سبب الرفض كما جاء من الخادم', async () => {
    vi.mocked(client.changePassword).mockRejectedValue(new DaliliApiError(400, 'كلمة المرور الحالية غير صحيحة'))
    render(<ProfileCard initialName="سارة" />)
    fireEvent.change(await screen.findByLabelText(t('profile.currentPassword')), { target: { value: 'old-pass-1' } })
    fireEvent.change(screen.getByLabelText(t('profile.newPassword')), { target: { value: 'new-pass-2' } })
    fireEvent.click(screen.getByRole('button', { name: t('profile.changePassword') }))
    await waitFor(() => expect(client.changePassword).toHaveBeenCalledWith('old-pass-1', 'new-pass-2'))
    expect((await screen.findByRole('alert')).textContent).toBe('كلمة المرور الحالية غير صحيحة')
  })
})
