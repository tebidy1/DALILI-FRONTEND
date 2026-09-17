/**
 * تسليح الإلغاء بنقرتين (توصية UX الموافق عليها) — النمط نفسه الذي جعل
 * الأزرار الخطيرة في الإضافة آمنة داخل شاشة عمل ضيّقة: النقرة الأولى تُسلّح
 * والثانية داخل نافذة الزمن تُنفّذ، وما بعد انقضاء النافذة تعيد التسليح.
 * نقيّ بلا DOM ولا شبكة ولا ساعة داخلية — `now` محقون كي يُختبَر بزمن
 * مصنوع، والعرض (main.ts) يستقرئ `remaining` عند كل رسم (نبضة ٥٠مث).
 */

/** نافذة التأكيد بالمللي ثانية — ٤ ثوانٍ كما في الإضافة (CANCEL_ARM_WINDOW_MS) */
export const CANCEL_ARM_WINDOW_MS = 4000

export interface Arm {
  /** نقرة الزر: 'arm' ⇐ سُلِّح الآن، 'confirm' ⇐ نُفِّذ الإلغاء وفُكّ التسليح */
  press(t?: number): 'arm' | 'confirm'
  /** فكّ التسليح يدويًّا (خروج من الوضع مثلًا) */
  disarm(): void
  /** هل هو مسلَّح الآن؟ (قد يظل مسلَّحًا منطقيًّا بعد انقضاء النافذة —
   *  للعرض استخدم remaining ‏> 0) */
  readonly armed: boolean
  /** ثوانٍ التسليح المتبقية بالتقريب لأعلى — ٠ غير مسلَّح أو منقضٍ */
  remaining(t?: number): number
}

export function createArm(
  windowMs: number = CANCEL_ARM_WINDOW_MS,
  now: () => number = () => Date.now(),
): Arm {
  let armedAt: number | null = null
  return {
    press(t = now()) {
      if (armedAt !== null && t - armedAt <= windowMs) {
        armedAt = null
        return 'confirm'
      }
      armedAt = t
      return 'arm'
    },
    disarm() {
      armedAt = null
    },
    get armed() {
      return armedAt !== null
    },
    remaining(t = now()) {
      if (armedAt === null) return 0
      return Math.max(0, Math.ceil((windowMs - (t - armedAt)) / 1000))
    },
  }
}
