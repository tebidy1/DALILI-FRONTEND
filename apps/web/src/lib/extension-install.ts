/**
 * رابط تثبيت امتداد كروم — قرار المالك 2026-09-10: شاشة «ابدأ من هنا» تدعو
 * لتثبيت الامتداد فتأخذه بيدك بدل طريق مسدود. الرابط من إعداد البناء وحده
 * (VITE_EXTENSION_URL) كي لا نضيف اعتمادًا خارجيًا في الكود؛ بلا رابط لا زر
 * إطلاقًا — لا ندعو لفعل لا يصل إليه المستخدم.
 */
export const EXTENSION_INSTALL_URL: string =
  (import.meta.env.VITE_EXTENSION_URL as string | undefined)?.trim() ?? ''
