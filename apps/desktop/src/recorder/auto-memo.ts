import type { MemoStopResult } from './voice-memo'
import { t } from '../i18n'

/**
 * ‏VOX-AUTO منقولًا من الإضافة — سياسة «التعليق التلقائي لكل بطاقة»:
 * زر «ابدأ مع تعليق صوتي» يشغّل ميك الخطوة على كل بطاقة: بطاقة جديدة توقف
 * تعليق سابقتها وتحفظه وتبدأ على الجديدة حتى الإنهاء. وفي الجلسة العادية يعمل
 * الخطّاف نفسه بإيقاف التعليق الجاري عند بطاقة جديدة دون بدء بديل — فلا يمتد
 * صوت بطاقة إلى بطاقة أخرى بحسن نية. صمتُ الميكروفون في هذه الانتقالات ليس
 * خطأً يُعرَض — المستخدم لم يطلب الإيقاف بنفسه. التبعيات محقونة كي تُختبر بلا
 * واجهة، والانتقالات متسلسلة حرفيًّا كي لا تتلاحق أسرع من جواب المسجّل.
 */

export interface AutoMemoMeta {
  /** الجلسة في التسجيل الفعليّ (لا بناء ولا خمول) */
  capturing: boolean
  paused: boolean
  stepCount: number
  autoMemo: boolean
}

export interface AutoMemoMemo {
  startMemo(stepIndex: number): Promise<{ ok: true } | { ok: false; errorAr: string }>
  stopMemo(reason?: 'user' | 'cap'): Promise<MemoStopResult>
  activeMemo(): { memoId: string; stepIndex: number; startedAt: number } | null
}

export interface AutoMemoDeps {
  memo: AutoMemoMemo
  meta: () => AutoMemoMeta
  /** فلب العلم — مالكه الودجة (render) والسياسة تعلن تغييره عبره */
  setAutoMemo(v: boolean): void
  /** اللافتة العابرة — سطر الحالة في الودجة */
  onNotice?(textAr: string): void
}

export type AutoMemoToggleAck = { ok: true; enabled: boolean } | { ok: false; errorAr: string }

export function createAutoMemo(deps: AutoMemoDeps) {
  // انتقالات البطاقات قد تتلاحق أسرع من جواب المسجّل — تسلسل حرفي يمنع سباقَي بدء/إيقاف
  let chain: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }

  const capturing = () => deps.meta().capturing && deps.meta().stepCount >= 0

  /** إيقاف التعليق الجاري وحفظه بصمت — ثم لا شيء (اللافتة ليست إخفاقًا) */
  async function stopActive(): Promise<void> {
    if (!deps.memo.activeMemo()) return
    await deps.memo.stopMemo('user').catch(() => undefined)
  }

  /** بدء تعليق على بطاقة — والفشل يعطّل الوضع التلقائي بلافتة صادقة (تدهور معلن) */
  async function startOn(stepIndex: number): Promise<void> {
    const start = await deps.memo.startMemo(stepIndex)
    if (!start.ok) {
      deps.setAutoMemo(false)
      deps.onNotice?.(start.errorAr)
    }
  }

  /**
   * خطّاف البطاقة الجديدة (يستدعيه مسك العدّ في الودجة): يوقف تعليق السابقة
   * دائمًا، ثم في الوضع التلقائي يبدأ على الجديدة — ما لم تكن وصلت بطاقة أحدث
   * أثناء الانتظار فلا تعليق عابر على بطاقة لم يعد لها وجود في الواجهة.
   */
  function onNewStep(idx: number): Promise<void> {
    return serialized(async () => {
      if (!capturing()) return
      await stopActive()
      // الحالة تُقرأ بعد الإيقاف لا قبله: إطفاءُ الوضع التلقائي (أو وصول بطاقة
      // أحدث) أثناء انتظار المسجّل يُحترم فورًا، فلا يبدأ تعليق لم يعد مطلوبًا
      const meta = deps.meta()
      if (!meta.autoMemo) return
      if (meta.stepCount - 1 !== idx) return
      await startOn(idx)
    })
  }

  /** الإيقاف المؤقّت: لا صوت يُسمع في غيابك (VOX-06) — الجاري يُحفظ والتسلسل يتوقف */
  function suspend(): Promise<void> {
    return serialized(stopActive)
  }

  /** الاستئناف: الوضع التلقائي وحده يعيد التعليق على آخر بطاقة */
  function resumeAfterPause(): Promise<void> {
    return serialized(async () => {
      if (!deps.meta().capturing || deps.meta().paused) return
      const meta = deps.meta()
      if (!meta.autoMemo || meta.stepCount === 0) return
      await startOn(meta.stepCount - 1)
    })
  }

  /** إنهاء الالتقاط: الجاري يُحفظ كي يُرفع مع بقية تعليقات الجلسة */
  function stopForFinish(): Promise<void> {
    return serialized(stopActive)
  }

  /** زر الميك داخل الوضع التلقائي — مفتاح إيقاف/تشغيل للتعليق التلقائي كله */
  async function toggle(): Promise<AutoMemoToggleAck> {
    const meta = deps.meta()
    if (!meta.capturing && !meta.paused) return { ok: false, errorAr: t('dt.noSession') }
    if (meta.autoMemo) {
      await stopActive()
      deps.setAutoMemo(false)
      deps.onNotice?.(t('dt.autoMemoOff'))
      return { ok: true, enabled: false }
    }
    if (meta.stepCount === 0) return { ok: false, errorAr: t('dt.needStep') }
    deps.setAutoMemo(true)
    if (deps.meta().capturing) await serialized(() => startOn(deps.meta().stepCount - 1))
    return { ok: true, enabled: true }
  }

  return { onNewStep, suspend, resumeAfterPause, stopForFinish, stopActive, toggle }
}
