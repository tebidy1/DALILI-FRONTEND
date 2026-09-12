import type { AutoMemoToggleAck, SessionMeta } from './protocol'
import type { makeVoiceMemo } from './voice-memo'

/**
 * VOX-AUTO — سياسة «التعليق التلقائي لكل بطاقة»: زر «ابدأ مع تعليق صوتي» لم يعد
 * يسجّل صوتًا مستمرًا واحدًا للجلسة، بل يشغّل ميك الخطوة (VOX-09) على كل بطاقة:
 * بطاقة جديدة توقف تعليق سابقتها وتحفظه وتبدأ على الجديدة حتى الإنهاء. وفي الجلسة
 * العادية يعمل الخطّاف نفسه بإيقاف التعليق الجاري عند بطاقة جديدة دون بدء بديل —
 * فلا يمتد صوت بطاقة إلى بطاقة أخرى بحسن نية. صمتُ الميكروفون في هذه الانتقالات
 * ليس خطأً يُعرَض — المستخدم لم يطلب الإيقاف بنفسه. التبعيات محقونة كي يُختبر بلا متصفح.
 */

export interface AutoMemoMemo {
  startMemo(sid: string, idx: number): Promise<{ ok: true } | { ok: false; errorAr: string }>
  stopMemo(reason?: 'user' | 'cap'): Promise<{ ok: boolean; errorAr?: string }>
  activeMemo(): { sid: string; memoId: string; stepIndex: number; startedAt: number } | null
}

export interface AutoMemoDeps {
  memo: AutoMemoMemo
  meta: () => SessionMeta
  saveMeta: (patch: Partial<SessionMeta>) => Promise<void>
  /** ربط/فك حالة التعليق الجارية ببث الحالة — اللوحة ترى الحلقة والمؤقت منها */
  syncMeta: () => Promise<void>
  /** ضمان جاهزية مسجّل offscreen قبل بدء تعليق — موتُ العامل قد يغلق الوثيقة */
  prepare?: () => Promise<void>
}

export type { AutoMemoToggleAck }

export function createAutoMemo(deps: AutoMemoDeps) {
  // انتقالات البطاقات قد تتلاحق أسرع من جواب offscreen — تسلسل حرفي يمنع سباقَي بدء/إيقاف
  let chain: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }

  const capturing = () => deps.meta().state === 'capturing' && !!deps.meta().sessionId

  /** إيقاف التعليق الجاري وحفظه بصمت — ثم مزامنة مؤشر اللوحة */
  async function stopActive(): Promise<void> {
    if (!deps.memo.activeMemo()) return
    await deps.memo.stopMemo('user').catch(() => undefined)
    await deps.syncMeta()
  }

  /** بدء تعليق على بطاقة — والفشل يعطّل الوضع التلقائي بلافتة صادقة (تدهور معلن) */
  async function startOn(sid: string, idx: number): Promise<void> {
    await deps.prepare?.().catch(() => undefined)
    const start = await deps.memo.startMemo(sid, idx)
    await deps.syncMeta()
    if (!start.ok) await deps.saveMeta({ autoMemo: false, notice: start.errorAr })
  }

  /**
   * خطّاف البطاقة الجديدة (يستدعيه خط الالتقاط): يوقف تعليق السابقة دائمًا، ثم في
   * الوضع التلقائي يبدأ على الجديدة — ما لم تكن وصلت بطاقة أحدث أثناء الانتظار
   * فلا تعليق عابر على بطاقة لم يعد لها وجود في الواجهة.
   */
  function onNewStep(sid: string, idx: number): Promise<void> {
    return serialized(async () => {
      if (!capturing()) return
      await stopActive()
      // الحالة تُقرأ بعد الإيقاف لا قبله: إطفاءُ الوضع التلقائي (أو وصول بطاقة أحدث)
      // أثناء انتظار offscreen يُحترم فورًا، فلا يبدأ تعليق لم يعد مطلوبًا
      const meta = deps.meta()
      if (!meta.autoMemo) return
      if (meta.stepCount - 1 !== idx) return
      await startOn(sid, idx)
    })
  }

  /** الإيقاف المؤقت: لا صوت يُسمع في غيابك (VOX-06) — الجاري يُحفظ والتسلسل يتوقف */
  function suspend(): Promise<void> {
    return serialized(stopActive)
  }

  /** الاستئناف: الوضع التلقائي وحده يعيد التعليق على آخر بطاقة */
  function resumeAfterPause(): Promise<void> {
    return serialized(async () => {
      if (!capturing()) return
      const meta = deps.meta()
      if (!meta.autoMemo || meta.stepCount === 0) return
      await startOn(meta.sessionId, meta.stepCount - 1)
    })
  }

  /** إنهاء الالتقاط: الجاري يُحفظ كي يُرفع ويُفرَّغ مع بقية تعليقات الجلسة */
  function stopForFinish(): Promise<void> {
    return serialized(stopActive)
  }

  /** زر الميك داخل الوضع التلقائي — مفتاح إيقاف/تشغيل للتعليق التلقائي كله */
  async function toggle(): Promise<AutoMemoToggleAck> {
    const meta = deps.meta()
    if (meta.state !== 'capturing' && meta.state !== 'paused') return { ok: false, errorAr: 'لا جلسة التقاط جارية' }
    if (meta.autoMemo) {
      await stopActive()
      await deps.saveMeta({ autoMemo: false, notice: 'أُوقف التعليق التلقائي — زر الميك يسجّل يدويًا' })
      return { ok: true, enabled: false }
    }
    if (meta.stepCount === 0) return { ok: false, errorAr: 'التقط خطوة أولًا ثم علّق عليها بصوتك' }
    await deps.saveMeta({ autoMemo: true })
    if (meta.state === 'capturing') await serialized(() => startOn(meta.sessionId, meta.stepCount - 1))
    return { ok: true, enabled: true }
  }

  return { onNewStep, suspend, resumeAfterPause, stopForFinish, stopActive, toggle }
}
