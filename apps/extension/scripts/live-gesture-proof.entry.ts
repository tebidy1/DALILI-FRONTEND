import { createGestureCollector, usableRect, type FoldedGesture } from '../lib/gesture'
import { buildClickEvent, buildValueEvent } from '../lib/events'
import { pickInteractive } from '../lib/pick'
import { foldWithPrev } from '../lib/session'
import type { CaptureEvent, StoredStep } from '../lib/protocol'

/**
 * مدخل الإثبات الحيّ لعلة «الخطوة تُلتقط مرتين أو ثلاثًا» (بلاغ المالك 2026-09-06).
 *
 * لماذا إثبات حيّ ولا يكفي jsdom: هذا المشروع سبق أن مرّر اختبارات **كاذبة** لأن
 * jsdom لا يحاكي التركيز ولا الرسم (درس جلسة 2026-09-04). وعلّة اليوم كلها في
 * تسلسل أحداث المتصفح الحقيقي — فيجب أن يُقاس في المتصفح لا في محاكيه.
 *
 * هذا الملف يُجمَّع من **مصدر الامتداد نفسه** (لا نسخة منه) ويُحقن في صفحة فيها
 * أنماط التبديل الستة، فتُدفع نقرات فأرة حقيقية ويُحصى كم خطوة نتجت وعلى أي عنصر.
 *
 * **إعادة التشغيل** (من `apps/extension`):
 *   1. `./node_modules/.bin/esbuild scripts/live-gesture-proof.entry.ts --bundle \
 *        --format=iife --platform=browser --outfile=../web/public/__proof.js`
 *   2. انسخ `scripts/live-gesture-proof.html` إلى `apps/web/public/__toggles.html`
 *   3. افتح `http://localhost:5174/__toggles.html`، وحمّل `/__proof.js` في الصفحة
 *   4. لكل نمط: `__daliliProof.reset()` ← نقرة فأرة حقيقية ← `flush()` ← `steps()`
 *   5. المتوقّع: **خطوة واحدة** لكل ضغطة، على العنصر المرئي، بعنوان «إطار صالح»
 *   6. احذف الملفين من `apps/web/public` بعد الفراغ
 *
 * **نتيجة 2026-09-06 في كروم حقيقي:** A ١ (كانت ٢) · B ١ (٣) · C ١ (٣) ·
 * D ١ على `span#dspan` ٦٢×٣٦ لا على الحقل الضامر (٣) · E ١ (١، بلا تشويه) ·
 * F ١ على `label#fl` ٦٣×٣٦ (٣). وحارسا عدم الابتلاع: كتابة ثم «حفظ» ثم «إلغاء»
 * = أربع خطوات صحيحة، والكتابة لم تنطوِ في نقرة المغادرة (فخ 45).
 */

declare global {
  interface Window {
    __daliliProof: {
      reset(): void
      steps(): Array<{ kind: string; tag: string; id: string; rect: CaptureEvent['rect']; title: string }>
      flush(): void
    }
  }
}

/** خطوات وصلت «الخلفية» — مارّةً بشبكة أمانها نفسها (foldWithPrev) */
const stored: Array<{ ev: CaptureEvent; el: Element }> = []

function toBackground(ev: CaptureEvent, el: Element) {
  const prev: StoredStep | undefined = stored.length > 0 ? { ev: stored[stored.length - 1]!.ev } : undefined
  const decision = foldWithPrev(prev, ev)
  if (decision === 'drop') return
  if (decision === 'replace') stored[stored.length - 1] = { ev, el }
  else stored.push({ ev, el })
}

const gesture = createGestureCollector((folded: FoldedGesture) => {
  toBackground(folded.ev, folded.el)
})

document.addEventListener(
  'pointerdown',
  () => {
    gesture.open()
  },
  true,
)

document.addEventListener(
  'click',
  (e) => {
    const first = e.composedPath()[0]
    if (!(first instanceof Element)) return
    const interactive = pickInteractive(first) ?? first
    gesture.addClick(buildClickEvent(interactive, location.href, document.title, 1), interactive)
  },
  true,
)

document.addEventListener(
  'change',
  (e) => {
    const el = e.target
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
    ) {
      return
    }
    const ev = buildValueEvent(el, location.href, document.title, 1, gesture.seen())
    if (!ev) return
    if (!gesture.addValue(ev, el)) toBackground(ev, el)
  },
  true,
)

window.__daliliProof = {
  reset() {
    stored.length = 0
  },
  flush() {
    gesture.flush()
  },
  steps() {
    return stored.map(({ ev, el }) => ({
      kind: ev.kind,
      tag: el.tagName.toLowerCase(),
      id: el.id || '-',
      rect: ev.rect,
      // البرهان الحاسم على الإطار: هل المستطيل المخزّن صالح أصلًا للرسم؟
      title: ev.rect && usableRect(ev.rect) ? 'إطار صالح' : 'بلا إطار',
    }))
  },
}
