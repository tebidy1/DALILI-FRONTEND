import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RichTextDto } from '@dalili/shared'
import { RichTextBlock } from './RichTextBlock'

const one: RichTextDto = [{ para: 'p', runs: [{ text: 'نص قائم' }] }]

describe('RichTextBlock — كتلة النص المنسّق (BKL-01)', () => {
  it('يعرض النص القائم قابلًا للتحرير باتجاه RTL', () => {
    render(<RichTextBlock value={one} onChange={() => {}} />)
    const area = screen.getByRole('textbox', { name: 'نص الكتلة' })
    expect(area.getAttribute('dir')).toBe('rtl')
    expect(area.textContent).toContain('نص قائم')
  })

  it('العريض والمائل يظهران بوسومهما لا بأنماط مضمّنة', () => {
    render(
      <RichTextBlock
        value={[{ para: 'p', runs: [{ text: 'عادي' }, { text: 'ثقيل', b: true }, { text: 'مائل', i: true }] }]}
        onChange={() => {}}
      />,
    )
    const area = screen.getByRole('textbox', { name: 'نص الكتلة' })
    expect(area.querySelector('b')?.textContent).toBe('ثقيل')
    expect(area.querySelector('i')?.textContent).toBe('مائل')
  })

  it('شريط التنسيق يعرض أزرار العريض والمائل والقوائم والعنوان', () => {
    render(<RichTextBlock value={one} onChange={() => {}} />)
    for (const name of ['عريض', 'مائل', 'قائمة نقطية', 'قائمة مرقّمة', 'عنوان']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('زر القائمة النقطية يبلّغ onChange بنوع فقرة ul — لا HTML', () => {
    const onChange = vi.fn()
    render(<RichTextBlock value={one} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'قائمة نقطية' }))
    const last = onChange.mock.calls.at(-1)?.[0] as RichTextDto
    expect(last[0]?.para).toBe('ul')
    expect(JSON.stringify(last)).not.toContain('<')
  })

  it('زر العنوان يبدّل الفقرة إلى h2 ثم يعيدها فقرة عند الضغط ثانيةً', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RichTextBlock value={one} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'عنوان' }))
    const asH2 = onChange.mock.calls.at(-1)?.[0] as RichTextDto
    expect(asH2[0]?.para).toBe('h2')
    rerender(<RichTextBlock value={asH2} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'عنوان' }))
    expect((onChange.mock.calls.at(-1)?.[0] as RichTextDto)[0]?.para).toBe('p')
  })

  // علة حية بلّغ عنها المالك: الأزرار تبلّغ النموذج لكن المنطقة لا يتغيّر مظهرها إطلاقًا
  it('تعليم العريض على تحديد يظهر في المنطقة بعد وصول القيمة الجديدة', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RichTextBlock value={one} onChange={onChange} />)
    const area = screen.getByRole('textbox', { name: 'نص الكتلة' })
    const range = document.createRange()
    range.selectNodeContents(area.firstElementChild!)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'عريض' }))
    const next = onChange.mock.calls.at(-1)?.[0] as RichTextDto
    expect(next[0]?.runs[0]?.b).toBe(true)

    rerender(<RichTextBlock value={next} onChange={onChange} />)
    expect(area.querySelector('b')?.textContent).toBe('نص قائم')
  })

  it('زر العنوان يعيد رسم المنطقة عنوانًا فعلًا — لا فقرة كما كانت', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RichTextBlock value={one} onChange={onChange} />)
    const area = screen.getByRole('textbox', { name: 'نص الكتلة' })
    fireEvent.click(screen.getByRole('button', { name: 'عنوان' }))
    rerender(<RichTextBlock value={onChange.mock.calls.at(-1)?.[0] as RichTextDto} onChange={onChange} />)
    expect(area.querySelector('h2')?.textContent).toBe('نص قائم')
  })

  it('زر القائمة النقطية يعيد رسم المنطقة قائمةً فعلًا', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RichTextBlock value={one} onChange={onChange} />)
    const area = screen.getByRole('textbox', { name: 'نص الكتلة' })
    fireEvent.click(screen.getByRole('button', { name: 'قائمة نقطية' }))
    rerender(<RichTextBlock value={onChange.mock.calls.at(-1)?.[0] as RichTextDto} onChange={onChange} />)
    expect(area.querySelector('ul li')?.textContent).toBe('نص قائم')
  })

  // بلاغ المالك: «الزر الأول غير قابل للضغط ولا يحدث أي تأثير» — كان يُهمَل بلا تحديد
  it('العريض بمؤشّر بلا تحديد يفعّل الوضع للكتابة التالية لا يُهمَل', () => {
    const exec = vi.fn()
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    render(<RichTextBlock value={one} onChange={() => {}} />)
    const area = screen.getByRole('textbox', { name: 'نص الكتلة' })
    const range = document.createRange()
    range.selectNodeContents(area.firstElementChild!)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'عريض' }))
    expect(exec).toHaveBeenCalledWith('bold', false, undefined)
  })

  it('زرّا العريض والمائل يعلنان حالتهما — لا زر يبدو ميتًا', () => {
    Object.defineProperty(document, 'queryCommandState', {
      value: (cmd: string) => cmd === 'bold',
      configurable: true,
      writable: true,
    })
    render(<RichTextBlock value={one} onChange={() => {}} />)
    fireEvent.keyUp(screen.getByRole('textbox', { name: 'نص الكتلة' }))
    expect(screen.getByRole('button', { name: 'عريض' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'مائل' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('كتلة بلا فقرات تعرض فقرة فارغة واحدة — لا منطقة تحرير مفقودة', () => {
    render(<RichTextBlock value={[]} onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'نص الكتلة' })).toBeTruthy()
  })
})
