/**
 * CAP-17: جسر محرر الويب ↔ الامتداد عبر سكربت المحتوى.
 * صفحة الويب لا تعرف معرّف الامتداد ولا تملك externally_connectable —
 * لكن سكربت المحتوى محقون في صفحاتنا أصلًا، فالترحيل عبر window.postMessage
 * هو الأنبوب الموثوق: طلب dalili-web ← ترحيل ← ردّ dalili-ext أو مهلة صادقة.
 */
import type { GuideDto } from '@dalili/shared'

export interface AppendCaptureResult {
  ok: boolean
  /** رسالة خطأ عربية من الامتداد نفسه (جلسة جارية/مسودة قائمة) — أو فارغة عند غياب الامتداد */
  errorAr?: string
}

const ACK_TIMEOUT_MS = 1500

export function requestAppendCapture(guideId: string, insertAt?: number, timeoutMs = ACK_TIMEOUT_MS): Promise<AppendCaptureResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (r: AppendCaptureResult) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMsg)
      clearTimeout(timer)
      resolve(r)
    }
    const onMsg = (e: MessageEvent) => {
      // مصدر واحد موثوق: رسالة من نفس صفحتنا (postMessage الذاتي) بهوية dalili-ext —
      // لا نتحسس e.source (بعض البيئات لا تضبطه) بل الهوية والنوع
      const d = e.data as { source?: string; t?: string; ok?: boolean; errorAr?: string }
      if (d?.source === 'dalili-ext' && d.t === 'append-ack') {
        finish({ ok: !!d.ok, errorAr: d.errorAr || undefined })
      }
    }
    // مؤقت واحد لا حلقة — بلا ردّ خلال المهلة: الامتداد غير مثبّت أو الصفحة قديمة
    const timer = setTimeout(() => finish({ ok: false, errorAr: '' }), timeoutMs)
    window.addEventListener('message', onMsg)
    window.postMessage({ source: 'dalili-web', t: 'append-capture', guideId, insertAt }, '*')
  })
}

/** دربني: طلب بدء التدريب من عارض الدليل — نفس الأنبوب (dalili-web ↔ dalili-ext) */
export function requestTrainStart(token: string, timeoutMs = ACK_TIMEOUT_MS): Promise<AppendCaptureResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (r: AppendCaptureResult) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMsg)
      clearTimeout(timer)
      resolve(r)
    }
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; t?: string; ok?: boolean; errorAr?: string }
      if (d?.source === 'dalili-ext' && d.t === 'train-ack') {
        finish({ ok: !!d.ok, errorAr: d.errorAr || undefined })
      }
    }
    // بلا ردّ: errorAr فارغ → المتصل يعرض رسالة «ثبّت الامتداد» الصادقة
    const timer = setTimeout(() => finish({ ok: false, errorAr: '' }), timeoutMs)
    window.addEventListener('message', onMsg)
    window.postMessage({ source: 'dalili-web', t: 'train-start', token }, '*')
  })
}

/** دربني من المحرر: الدليل الحالي كاملًا بمراسيه — تجربة بلا حاجة لمشاركة أصلًا */
export function requestTrainStartGuide(guide: GuideDto, timeoutMs = ACK_TIMEOUT_MS): Promise<AppendCaptureResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (r: AppendCaptureResult) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMsg)
      clearTimeout(timer)
      resolve(r)
    }
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; t?: string; ok?: boolean; errorAr?: string }
      if (d?.source === 'dalili-ext' && d.t === 'train-ack') {
        finish({ ok: !!d.ok, errorAr: d.errorAr || undefined })
      }
    }
    const timer = setTimeout(() => finish({ ok: false, errorAr: '' }), timeoutMs)
    window.addEventListener('message', onMsg)
    window.postMessage({ source: 'dalili-web', t: 'train-start', guide }, '*')
  })
}
