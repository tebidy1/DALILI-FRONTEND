/**
 * مشاركة أصلية عبر ورقة النظام (`navigator.share`) — أهم تجربة على الجوال:
 * «سارة» تفتح الرابط من واتساب على جوالها، والزر يفتح ورقة النظام فتظهر واتساب مباشرة.
 * غير موجود على كل المتصفحات، فالمستدعي يسقط إلى الرابط/النسخ عند `false`.
 */
export interface NativeShareData {
  title?: string
  text?: string
  url: string
}

/** هل يدعم هذا المتصفح ورقة المشاركة الأصلية؟ (سطح المكتب غالبًا لا) */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * يفتح ورقة النظام. يعيد `true` إن تمّت المشاركة فعلًا، و`false` إن تعذّرت
 * (غياب الدعم أو إلغاء المستخدم) فيتولّى المستدعي البديل بلا رمي.
 */
export async function nativeShare(data: NativeShareData): Promise<boolean> {
  if (!canNativeShare()) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    // إلغاء المستخدم أو فشل الورقة — بديل صامت، لا خطأ مفبرك
    return false
  }
}
