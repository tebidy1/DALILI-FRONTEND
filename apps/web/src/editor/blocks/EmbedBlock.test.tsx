import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EmbedBlock } from './EmbedBlock'

describe('EmbedBlock — بطاقة الدليل المضمّن (BKL-01)', () => {
  it('البطاقة تعرض العنوان وعدد الخطوات ومفتاح الفرد', () => {
    render(<EmbedBlock title="دليل الفوترة" stepCount={7} expanded={false} onToggle={() => {}} onRemove={() => {}} />)
    expect(screen.getByText('دليل الفوترة')).toBeTruthy()
    // الأرقام هندية شرقية كبقية الواجهة — لا «7» غربية وسط عربية
    expect(screen.getByText('٧ خطوة')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'افرد الخطوات' })).toBeTruthy()
  })

  it('المفرود يعرض زر الطيّ بدل الفرد', () => {
    render(<EmbedBlock title="د" stepCount={2} expanded onToggle={() => {}} onRemove={() => {}} />)
    expect(screen.getByRole('button', { name: 'اطوِ الخطوات' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'افرد الخطوات' })).toBeNull()
  })

  it('النقر على المفتاح يبلّغ onToggle', () => {
    const onToggle = vi.fn()
    render(<EmbedBlock title="د" stepCount={1} expanded={false} onToggle={onToggle} onRemove={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'افرد الخطوات' }))
    expect(onToggle).toHaveBeenCalled()
  })

  // E-BKL-01: الدليل المفقود لا يُسقط الكرّاسة ولا يظهر بطاقةً فارغة
  it('الدليل المفقود يعرض رسالة صادقة وزر إزالة بلا مفتاح فرد', () => {
    const onRemove = vi.fn()
    render(<EmbedBlock missing title="" stepCount={0} expanded={false} onToggle={() => {}} onRemove={onRemove} />)
    expect(screen.getByText('هذا الدليل لم يعد موجودًا')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'افرد الخطوات' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'أزل الكتلة' }))
    expect(onRemove).toHaveBeenCalled()
  })

  it('في العارض (بلا onRemove) لا يظهر زر الإزالة — القارئ لا يحرّر', () => {
    render(<EmbedBlock title="د" stepCount={3} expanded={false} onToggle={() => {}} />)
    expect(screen.queryByRole('button', { name: 'أزل الكتلة' })).toBeNull()
  })
})
