/**
 * شاشة الإقلاع في اللوحة الجانبية.
 *
 * لماذا في `index.html` لا في React: اللوحة تبقى بيضاء حتى يُحمَّل الحزم ويُقرأ
 * الثيم من التخزين ثم يُركَّب React. أي شاشة تكتبها React تصل **بعد** ذلك
 * الفراغ تمامًا، فلا تسدّه. الشاشة الساكنة في HTML تُرسم من أول إطار.
 *
 * والحدّ الأدنى (`SPLASH_MIN_MS`) لأن الإقلاع السريع يقصّ الرسمة فتبدو وميضًا
 * مزعجًا؛ أما الإقلاع البطيء فلا يُؤخَّر لحظة — الباقي يصير صفرًا.
 */

export const SPLASH_ID = 'itqan-splash'
export const SPLASH_MIN_MS = 900
export const SPLASH_FADE_MS = 260

/** ما تبقّى من الحدّ الأدنى بعد `elapsed` — صفر إذا تجاوزه، ولا يعود سالبًا أبدًا. */
export function splashRemainingMs(elapsed: number, min: number = SPLASH_MIN_MS): number {
  return Math.max(0, min - elapsed)
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve())

/**
 * يُكمل الرسمة إن بقي منها شيء، ثم يُلاشي الشاشة ويزيلها من الـDOM.
 * غيابها ليس خطأً — يُحلّ الوعد فورًا.
 */
export async function dismissSplash(doc: Document = document, elapsed = 0): Promise<void> {
  const el = doc.getElementById(SPLASH_ID)
  if (!el) return
  await wait(splashRemainingMs(elapsed))
  el.classList.add('is-out')
  await wait(SPLASH_FADE_MS)
  el.remove()
}
