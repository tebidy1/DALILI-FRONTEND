import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmProvider, useConfirm } from './ConfirmProvider'
import { t } from '../i18n'

/** المرحلة ١: النافذة الموحدة — وعد يتحقق بالنقر، والإلغاء يرجع false بلا فعل */

function Probe({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({ title: 'عنوان الخطر', body: 'نص الخطر', confirmLabel: 'نفّذ', danger: true }).then(onResult)
      }
    >
      اطلب التأكيد
    </button>
  )
}

describe('ConfirmProvider — نافذة التأكيد الموحدة', () => {
  it('النقر على التأكيد يحل الوعد true ويعرض العنوان والنص وزر الفعل', async () => {
    let result: boolean | undefined
    render(
      <ConfirmProvider>
        <Probe onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'اطلب التأكيد' }))
    expect(await screen.findByRole('dialog', { name: 'عنوان الخطر' })).toBeTruthy()
    expect(screen.getByText('نص الخطر')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'نفّذ' }))
    await waitFor(() => expect(result).toBe(true))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('الإلغاء (زر أو Esc/خلفية) يحل الوعد false', async () => {
    let result: boolean | undefined
    render(
      <ConfirmProvider>
        <Probe onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'اطلب التأكيد' }))
    fireEvent.click(await screen.findByRole('button', { name: t('common.cancel') }))
    await waitFor(() => expect(result).toBe(false))
  })

  it('بلا مزوّد يرتد إلى window.confirm — الأسطح المعروضة جزئيًا لا تسقط', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let result: boolean | undefined
    render(<Probe onResult={(v) => (result = v)} />)
    fireEvent.click(screen.getByRole('button', { name: 'اطلب التأكيد' }))
    await waitFor(() => expect(result).toBe(true))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
