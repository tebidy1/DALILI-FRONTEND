import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StateView } from './StateView'
import { IconBookOpen, IconCloudOff } from './icons'

describe('StateView (UX-02)', () => {
  it('الحالة الفارغة: عنوان + وصف + فعل ينفّذ', () => {
    const onAction = vi.fn()
    render(
      <StateView
        kind="empty"
        icon={<IconBookOpen size={30} />}
        title="لا أدلة بعد"
        desc="سجّل أول دليل من امتداد كروم"
        action={{ label: 'دليل جديد', onAction }}
      />,
    )
    expect(screen.getByText('لا أدلة بعد')).toBeTruthy()
    expect(screen.getByText('سجّل أول دليل من امتداد كروم')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'دليل جديد' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('حالة الخطأ: تنبيه دوري (role=alert) للمطالبة باهتمام قارئ الشاشة', () => {
    render(
      <StateView
        kind="error"
        icon={<IconCloudOff size={30} />}
        title="المكتبة غير متاحة الآن"
        action={{ label: 'إعادة المحاولة', onAction: () => {} }}
      />,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy()
  })

  it('بلا فعل: لا زر على الإطلاق', () => {
    render(<StateView kind="empty" icon={<IconBookOpen size={30} />} title="لا خطوات بعد" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
