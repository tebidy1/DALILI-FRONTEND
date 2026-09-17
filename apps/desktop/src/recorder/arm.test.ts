import { describe, expect, it } from 'vitest'
import { CANCEL_ARM_WINDOW_MS, createArm } from './arm'

/** توصية UX الموافق عليها (قرار المالك): زر «إلغاء» بنمط الإضافة — النقرة
 *  الأولى تُسلّح، والثانية داخل نافذة الزمن تُنفّذ. نقيّ بساعة محقونة:
 *  بلا Date.now داخليًّا ولا DOM — العرض (main.ts) يستقرئ remaining كل نبضة. */

describe('تسليح الإلغاء بنقرتين — نقيّ بساعة محقونة', () => {
  it('(أ) النقرة الأولى تُسلّح والثانية داخل النافذة تُنفّذ وتفكّ التسليح', () => {
    let t = 1000
    const arm = createArm(4000, () => t)
    expect(arm.press(t)).toBe('arm')
    expect(arm.armed).toBe(true)
    expect(arm.remaining(t)).toBe(4)
    t += 1500
    expect(arm.press(t)).toBe('confirm')
    expect(arm.armed).toBe(false)
    expect(arm.remaining(t)).toBe(0)
  })

  it('(ب) الثانية بعد انقضاء النافذة تعيد التسليح ولا تُنفّذ', () => {
    let t = 0
    const arm = createArm(CANCEL_ARM_WINDOW_MS, () => t)
    expect(arm.press(t)).toBe('arm')
    t += 4001
    expect(arm.press(t)).toBe('arm')
    t += 2000
    expect(arm.press(t)).toBe('confirm')
  })

  it('(ج) disarm يفكّ التسليح فلا نقرة ثانية تُنفّذ', () => {
    let t = 0
    const arm = createArm(4000, () => t)
    arm.press(t)
    t += 100
    arm.disarm()
    expect(arm.armed).toBe(false)
    expect(arm.press(t)).toBe('arm')
  })

  it('(د) remaining تهبط بالتقريب لأعلى وتصل صفرًا عند الانقضاء', () => {
    let t = 0
    const arm = createArm(4000, () => t)
    arm.press(t)
    t += 2500
    expect(arm.remaining(t)).toBe(2)
    t += 2000
    expect(arm.remaining(t)).toBe(0)
  })
})
