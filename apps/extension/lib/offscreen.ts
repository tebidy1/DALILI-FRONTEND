/** وثيقة offscreen — الميكروفون لا يُفتح من service worker في MV3، وهذه الوثيقة
 * تعيش بلا واجهة وتدير مسجّل التعليق (VOX-09/VOX-AUTO). تُنشأ مرة واحدة ويُعاد استخدامها. */

export async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] as never })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'] as never,
    justification: 'تسجيل التعليق الصوتي المدموج مع بطاقات الدليل',
  })
}
