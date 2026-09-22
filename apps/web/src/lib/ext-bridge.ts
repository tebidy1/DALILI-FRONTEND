/**
 * جسر الموقع ↔ الامتداد عبر سكربت المحتوى — أنبوب «دربني» (طلب بدء التدريب).
 * صفحة الويب لا تعرف معرّف الامتداد ولا تملك externally_connectable —
 * لكن سكربت المحتوى محقون في صفحاتنا أصلًا، فالترحيل عبر window.postMessage
 * هو الأنبوب الموثوق: طلب dalili-web ← ترحيل ← ردّ dalili-ext أو مهلة صادقة.
 */
import type { GuideDto } from '@dalili/shared'

export interface TrainStartResult {
  ok: boolean
  /** رسالة خطأ عربية من الامتداد نفسه — أو فارغة عند غياب الامتداد */
  errorAr?: string
}

const ACK_TIMEOUT_MS = 1500

/**
 * AUTH-LIVE: إعلان دخول/خروج للإضافة عبر الأنبوب نفسه — إطلاق ونسيان بلا ردّ.
 * سكربت المحتوى يرحّلها للخلفية فيُختم `dalili:auth-ping` فتعيد اللوحة فحص جلستها
 * لحظة نجاح الدخول، لا عند إغلاق اللوحة وفتحها.
 */
export function notifyAuthChanged() {
  window.postMessage({ source: 'dalili-web', t: 'auth-changed' }, '*')
}

/** دربني: الهيكل المشترك — رسالة واحدة وانتظار إشارة `train-ack` أو مهلة صادقة */
function sendAndWait(payload: object, timeoutMs: number): Promise<TrainStartResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (r: TrainStartResult) => {
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
    window.postMessage({ source: 'dalili-web', ...payload }, '*')
  })
}

/** دربني: طلب بدء التدريب من عارض الدليل — نفس الأنبوب (dalili-web ↔ dalili-ext) */
export function requestTrainStart(token: string, timeoutMs = ACK_TIMEOUT_MS): Promise<TrainStartResult> {
  return sendAndWait({ t: 'train-start', token }, timeoutMs)
}

/** دربني من المحرر: الدليل الحالي كاملًا بمراسيه — تجربة بلا حاجة لمشاركة أصلًا */
export function requestTrainStartGuide(guide: GuideDto, timeoutMs = ACK_TIMEOUT_MS): Promise<TrainStartResult> {
  return sendAndWait({ t: 'train-start', guide }, timeoutMs)
}
