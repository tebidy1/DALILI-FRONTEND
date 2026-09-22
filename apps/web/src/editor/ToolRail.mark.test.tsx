// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ToolRail } from './ToolRail'

/**
 * طلب المالك 2026-09-04: «عندما يكون الشكل نشطًا يمكن تغيير لونه من قائمة
 * الألوان في الشريط الجانبي» + تغيير شكله إلى دائرة/بيضاوي. فالشريط يصير
 * **شريط خصائص الشكل المحدَّد** كما في وورد: مبدّل الشكل ولوحة الألوان يظهران
 * بمجرد تنشيط شكل، ولو كانت الريشة مطوية — بلا نقرة تحضيرية.
 */

function mount(over: Partial<React.ComponentProps<typeof ToolRail>> = {}) {
  const props = {
    editing: true,
    tool: 'select' as const,
    onTool: vi.fn(),
    color: '#ea580c' as const,
    onColor: vi.fn(),
    onZoom: vi.fn(),
    onFit: vi.fn(),
    ...over,
  }
  render(<ToolRail {...props} />)
  return props
}

describe('شريط الأدوات — خصائص الشكل المنشَّط', () => {
  it('بلا شكل نشط والريشة مطوية: لا مبدّل شكل ولا لوحة ألوان', () => {
    mount()
    expect(screen.queryByLabelText('شكل الهدف: مستطيل')).toBeNull()
    expect(screen.queryByLabelText('لون الحبر: برتقالي')).toBeNull()
  })

  it('شكل نشط: مبدّل الشكل ولوحة الألوان يظهران فورًا رغم طيّ الريشة', () => {
    mount({ markShape: 'rect', onMarkShape: vi.fn() })
    expect(screen.getByLabelText('شكل الهدف: مستطيل')).toBeTruthy()
    expect(screen.getByLabelText('شكل الهدف: دائرة/بيضاوي')).toBeTruthy()
    expect(screen.getByLabelText('لون الحبر: برتقالي')).toBeTruthy()
  })

  it('الشكل الحالي معلَّم بـ aria-pressed — القارئ يعرف أيّهما مطبَّق', () => {
    mount({ markShape: 'ellipse', onMarkShape: vi.fn() })
    expect(screen.getByLabelText('شكل الهدف: دائرة/بيضاوي').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('شكل الهدف: مستطيل').getAttribute('aria-pressed')).toBe('false')
  })

  it('النقر على «دائرة» يطلب الشكل البيضاوي', () => {
    const onMarkShape = vi.fn()
    mount({ markShape: 'rect', onMarkShape })
    fireEvent.click(screen.getByLabelText('شكل الهدف: دائرة/بيضاوي'))
    expect(onMarkShape).toHaveBeenCalledWith('ellipse')
  })

  it('النقر على لون واللوحةُ ظاهرةٌ بسبب الشكل النشط يمرّر اللون كما هو', () => {
    const onColor = vi.fn()
    mount({ markShape: 'rect', onMarkShape: vi.fn(), onColor })
    fireEvent.click(screen.getByLabelText('لون الحبر: أزرق'))
    expect(onColor).toHaveBeenCalledWith('#2563eb')
  })

  it('وضع العرض (بلا تعديل) لا يعرض خصائص شكل مهما كان نشطًا', () => {
    mount({ editing: false, markShape: 'rect', onMarkShape: vi.fn() })
    expect(screen.queryByLabelText('شكل الهدف: مستطيل')).toBeNull()
  })
})
