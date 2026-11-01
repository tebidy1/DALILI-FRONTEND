/**
 * طابور تحميل اللقطات — حدّ للتزامن وإعادة محاولة ومهلة لكل محاولة.
 *
 * علّة 2026-10-23: فتح دليل من ٤٠ خطوة أطلق ٤٠ طلب صورة دفعة واحدة؛ الاستضافة المشتركة
 * ردّت بـ 503/500 لنصفها، و`StepImage` لم يكن يعرف إلا onload فبقيت الإطارات فارغة إلى
 * الأبد. هنا: أربعة طلبات على الأكثر في وقت واحد لكل الصفحة، والفاشل يُعاد بمهلة متزايدة
 * (لا يحجز مكانًا أثناء انتظاره)، والمعلّق يُقطع بعد مهلة، والإخفاق النهائي يُبلَّغ صراحة.
 *
 * واجهة نداءات لا Promise عمدًا: الصورة المخبّأة (أو بديل الاختبار) تبلغ onLoad في اللحظة
 * نفسها، فلا يتأخر الرسم دورة كاملة.
 */

export interface ShotLoaderOptions {
  maxConcurrent?: number
  /** محاولات إضافية بعد الأولى */
  retries?: number
  baseDelayMs?: number
  /** محاولة بلا ردّ أطول من هذا تُعدّ فاشلة */
  attemptTimeoutMs?: number
  /** نسبة عشوائية تُضاف للمهلة كي لا تعود الطلبات الفاشلة معًا في اللحظة نفسها */
  jitter?: number
}

export interface ShotLoadHandlers {
  onLoad: (img: HTMLImageElement) => void
  onFail: () => void
}

interface Task {
  src: string
  handlers: ShotLoadHandlers
  attempt: number
  cancelled: boolean
  /** يقطع المحاولة الجارية أو المهلة المنتظرة */
  abort: (() => void) | null
}

export function createShotLoader(opts: ShotLoaderOptions = {}) {
  const maxConcurrent = opts.maxConcurrent ?? 4
  const retries = opts.retries ?? 5
  const baseDelayMs = opts.baseDelayMs ?? 1000
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? 30_000
  const jitter = opts.jitter ?? 0.3

  const queue: Task[] = []
  let running = 0

  function pump() {
    while (running < maxConcurrent && queue.length > 0) {
      const task = queue.shift()!
      if (!task.cancelled) start(task)
    }
  }

  function start(task: Task) {
    running++
    let settled = false
    const img = new Image()
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      task.abort = null
      running--
      if (task.cancelled) {
        pump()
        return
      }
      if (ok) {
        task.handlers.onLoad(img)
      } else if (task.attempt < retries) {
        task.attempt++
        const delay = baseDelayMs * 2 ** (task.attempt - 1) * (1 + Math.random() * jitter)
        const wait = setTimeout(() => {
          task.abort = null
          if (!task.cancelled) queue.push(task)
          pump()
        }, delay)
        task.abort = () => clearTimeout(wait)
      } else {
        task.handlers.onFail()
      }
      pump()
    }
    const timer = setTimeout(() => finish(false), attemptTimeoutMs)
    task.abort = () => {
      // إلغاء أثناء الطلب: يتحرّر المكان فورًا ولا يُبلَّغ أحد (لا src='' — يطلق طلبًا شاردًا في بعض المتصفّحات)
      finish(false)
    }
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = task.src
  }

  return {
    /** يبدأ (أو يصفّ) تحميل الصورة؛ يُعيد دالّة إلغاء تُستدعى عند فكّ المكوّن */
    load(src: string, handlers: ShotLoadHandlers): () => void {
      const task: Task = { src, handlers, attempt: 0, cancelled: false, abort: null }
      queue.push(task)
      pump()
      return () => {
        if (task.cancelled) return
        task.cancelled = true
        const i = queue.indexOf(task)
        if (i >= 0) queue.splice(i, 1)
        task.abort?.()
      }
    },
  }
}

/** طابور الصفحة الواحد — كل لقطات المحرر والعارض والكراسة تمرّ منه */
export const shotLoader = createShotLoader()
