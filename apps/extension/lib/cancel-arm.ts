/**
 * CAP-02: تأكيد الإلغاء خطوتين — النقرة الأولى تُسلّح الزر فقط، والثانية داخل النافذة
 * تلغي فعلًا. تجاوز النافذة يُبطل التسليح فلا يُلغي بنقرة قديمة نسيها المستخدم،
 * وdisarm يُبطل فورًا (بعد الإلغاء الناجح أو أي سبب خارجي).
 */
export const CANCEL_ARM_WINDOW_MS = 4_000

export type CancelPress = 'arm' | 'confirm'

export class CancelArm {
  private armedAt: number | null = null

  constructor(private readonly windowMs: number = CANCEL_ARM_WINDOW_MS) {}

  get armed(): boolean {
    return this.armedAt !== null
  }

  press(now: number): CancelPress {
    if (this.armedAt !== null && now - this.armedAt <= this.windowMs) {
      this.armedAt = null
      return 'confirm'
    }
    this.armedAt = now
    return 'arm'
  }

  disarm(): void {
    this.armedAt = null
  }
}
