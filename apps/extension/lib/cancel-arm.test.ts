import { describe, expect, it } from 'vitest'
import { CANCEL_ARM_WINDOW_MS, CancelArm } from './cancel-arm'

/** CAP-02: الإلغاء بتأكيد خطوتين — النقرة الأولى تُسلّح، والثانية داخل النافذة تلغي فعلًا */
describe('CancelArm — تأكيد الإلغاء خطوتين', () => {

  it('النقرة الأولى تُسلّح الزر فقط ولا تُلغي', () => {
    const arm = new CancelArm()
    expect(arm.press(1000)).toBe('arm')
    expect(arm.armed).toBe(true)
  })

  it('النقرة الثانية داخل النافذة تُلغي فعليًا وتُبطل التسليح', () => {
    const arm = new CancelArm()
    arm.press(1000)
    expect(arm.press(1000 + CANCEL_ARM_WINDOW_MS - 1)).toBe('confirm')
    expect(arm.armed).toBe(false)
  })

  it('تجاوز النافذة يُبطل التسليح — النقرة التالية تُسلّح من جديد لا تُلغي (لا إلغاء بنقرة قديمة)', () => {
    const arm = new CancelArm()
    arm.press(1000)
    expect(arm.press(1000 + CANCEL_ARM_WINDOW_MS + 1)).toBe('arm')
    expect(arm.press(1000 + CANCEL_ARM_WINDOW_MS + 1 + 500)).toBe('confirm')
  })

  it('disarm يُبطل التسليح فورًا حتى داخل النافذة', () => {
    const arm = new CancelArm()
    arm.press(1000)
    arm.disarm()
    expect(arm.press(1200)).toBe('arm')
  })

  it('بعد إلغاء ناجح تبدأ دورة جديدة — النقرة التالية تُسلّح لا تُلغي', () => {
    const arm = new CancelArm()
    arm.press(1000)
    expect(arm.press(1100)).toBe('confirm')
    expect(arm.press(1200)).toBe('arm')
  })
})
