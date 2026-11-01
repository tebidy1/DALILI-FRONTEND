// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoteForm } from './NoteForm'

/** هـ ج١ (HLP) نموذج الشريك — النصوص الحرفية، والعدّاد عند ١٨٠، و«انشر» معطّل
 *  حتى تكتمل الجملة والجمهور، و«أوقف» لمن يملك الإشراف وبسبب. */

const GUIDES = [{ id: 'g1', title: 'دليل الفاتورة' }]
const CLIENTS = [{ id: 'co1', name: 'شركة الأفق' }, { id: 'co2', name: 'شركة النخبة' }]

function form(over: { moderate?: boolean; initial?: Partial<Parameters<typeof NoteForm>[0]['initial']> } = {}) {
  const onPublish = vi.fn()
  const onSuspend = vi.fn()
  const onCancel = vi.fn()
  render(
    <NoteForm
      label="تأكيد"
      editing={false}
      initial={{ body: '', guideId: null, audience: 'all', companyIds: [], ...over.initial }}
      guides={GUIDES}
      clients={CLIENTS}
      moderate={over.moderate ?? false}
      busy={false}
      onPublish={onPublish}
      onSuspend={onSuspend}
      onCancel={onCancel}
    />,
  )
  return { onPublish, onSuspend, onCancel }
}

const BODY_LABEL = 'ماذا يفعل هذا الزر؟ جملة أو جملتان'

afterEach(cleanup)

describe('NoteForm', () => {
  it('«انشر» معطّل حتى تُكتب جملة، والعدّاد يظهر عند ١٨٠ حرفًا', () => {
    const { onPublish } = form()
    const publish = screen.getByRole('button', { name: 'انشر' }) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    expect(screen.queryByText('١٨٠/٢٠٠')).toBeNull()
    fireEvent.change(screen.getByLabelText(BODY_LABEL), { target: { value: 'ي'.repeat(180) } })
    expect(publish.disabled).toBe(false)
    expect(screen.getByText('١٨٠/٢٠٠')).toBeTruthy()
    fireEvent.click(publish)
    expect(onPublish).toHaveBeenCalledWith({ body: 'ي'.repeat(180), guideId: null, audience: 'all', companyIds: [] })
  })

  it('جمهور «شركات محددة» بلا شركة: «انشر» معطّل؛ وباختيار شركة يُنشر بها', () => {
    const { onPublish } = form()
    const publish = screen.getByRole('button', { name: 'انشر' }) as HTMLButtonElement
    fireEvent.change(screen.getByLabelText(BODY_LABEL), { target: { value: 'جملة' } })
    fireEvent.click(screen.getByLabelText('شركات محددة'))
    expect(publish.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('شركة النخبة'))
    expect(publish.disabled).toBe(false)
    fireEvent.click(publish)
    expect(onPublish).toHaveBeenCalledWith({ body: 'جملة', guideId: null, audience: 'listed', companyIds: ['co2'] })
  })

  it('الربط بدليل اختياري يُنشر مع الجملة', () => {
    const { onPublish } = form()
    fireEvent.change(screen.getByLabelText(BODY_LABEL), { target: { value: 'جملة' } })
    fireEvent.change(screen.getByLabelText('اربطه بدليل (اختياري)'), { target: { value: 'g1' } })
    fireEvent.click(screen.getByRole('button', { name: 'انشر' }))
    expect(onPublish).toHaveBeenCalledWith({ body: 'جملة', guideId: 'g1', audience: 'all', companyIds: [] })
  })

  it('«أوقف» لمن يملك الإشراف فقط، وبسبب لا يُنفَّذ فارغًا', () => {
    const first = form()
    expect(screen.queryByRole('button', { name: 'أوقف' })).toBeNull()
    cleanup()
    const { onSuspend } = form({ moderate: true })
    fireEvent.click(screen.getByRole('button', { name: 'أوقف' }))
    expect(screen.getByLabelText('سبب الإيقاف')).toBeTruthy()
    const stop = () => screen.getAllByRole('button', { name: 'أوقف' }).at(-1)! as HTMLButtonElement
    expect(stop().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('سبب الإيقاف'), { target: { value: 'لم يعد مستعملًا' } })
    expect(stop().disabled).toBe(false)
    fireEvent.click(stop())
    expect(onSuspend).toHaveBeenCalledWith('لم يعد مستعملًا')
    expect(first.onSuspend).not.toHaveBeenCalled()
  })
})
