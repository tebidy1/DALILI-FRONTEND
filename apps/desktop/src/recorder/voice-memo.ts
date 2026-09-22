import type { Guide } from '@dalili/core'
import { SILENT_MIC_ERROR_AR, type MemoStopAck, type MemoStartAck } from './media-recorder'

/**
 * VOX-09 «ميك الخطوة» منقولًا من الإضافة — آلة حالة التعليق الصوتي في الودجة:
 * يدمج التعليق مع **آخر خطوة مبنية**، يسقفه بستين ثانية يتوقف عندها تلقائيًا،
 * ويحفظه في الذاكرة تحت فهرس الخطوة بـpending:true حتى يرفعه طابور Rust عند
 * التسليم — فشلُ الرفع أو التفريغ لا يمحو الصوت أبدًا. بدل messageOffscreen في
 * الإضافة يُستدعى المسجّل مباشرة (الودجة حيّة طوال الجلسة لا تعامل خلفيّ يموت).
 * التبعيات محقونة كي تُختبر بلا متصفح.
 */

/** سقف التعليق الصادق — الثواني الستون يقرؤها المستخدم في الواجهة نفسها */
export const MEMO_CAP_MS = 60_000

/** تعليق صوتي محفوظ — chunks مقاطع webm بترتيبها b64، وpending حتى يرفعه الطابور */
export interface StoredVoiceMemo {
  memoId: string
  chunks: string[]
  durationMs: number
  pending: boolean
}

/** المسجّل الحقيقي (media-recorder) كما تراه الآلة — واجهة البدء/الإيقاف وحدها */
export interface MemoRecorderHost {
  start(): MemoStartAck | Promise<MemoStartAck>
  stop(): MemoStopAck | Promise<MemoStopAck>
}

export interface MemoHost {
  recorder: MemoRecorderHost
  /** مخزن الذاكرة بفهرس الخطوة — يموت مع الودجة، والطابور هو الحافظ عند التسليم */
  store: Map<number, StoredVoiceMemo>
  /** نتيجة بلوغ السقف — نجاحه وإخفاقه تعرضهما الودجة بصدق (فخ التسجيل الصامت) */
  onCapResult?(result: MemoStopResult): void
  now?: () => number
  setCapTimer?(fn: () => void, ms: number): unknown
  clearCapTimer?(t: unknown): void
}

export interface ActiveMemo {
  memoId: string
  stepIndex: number
  startedAt: number
}

export type MemoStartResult = { ok: true } | { ok: false; errorAr: string }

export type MemoStopResult = { ok: boolean; capped?: boolean; stepIndex?: number; durationMs?: number; errorAr?: string }

export function makeVoiceMemo(host: MemoHost) {
  const now = host.now ?? Date.now
  let active: ActiveMemo | null = null
  let capTimer: unknown = null

  function clearTimer() {
    if (capTimer !== null && capTimer !== undefined) host.clearCapTimer?.(capTimer)
    capTimer = null
  }

  async function startMemo(stepIndex: number): Promise<MemoStartResult> {
    if (active) return { ok: false, errorAr: 'تسجيل تعليق جارٍ بالفعل — أوقفه أولًا' }
    // التعليق يدمج مع آخر خطوة مبنية — بلا خطوة لا معنى للتعليق (صدق قبل أي رسالة)
    if (stepIndex < 0) return { ok: false, errorAr: 'التقط خطوة أولًا ثم علّق عليها بصوتك' }
    const memoId = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const ack = await host.recorder.start()
    if (!ack.ok) return { ok: false, errorAr: ack.errorAr }
    active = { memoId, stepIndex, startedAt: now() }
    capTimer = host.setCapTimer?.(() => {
      void stopMemo('cap').then((r) => host.onCapResult?.(r))
    }, MEMO_CAP_MS) ?? null
    return { ok: true }
  }

  async function stopMemo(reason: 'user' | 'cap' = 'user'): Promise<MemoStopResult> {
    const cur = active
    if (!cur) return { ok: false, errorAr: 'لا تسجيل تعليق جارٍ' }
    clearTimer()
    active = null
    const ack = await host.recorder.stop()
    if (!ack.ok || typeof ack.durationMs !== 'number') {
      return { ok: false, errorAr: ack.ok ? 'فشل تسجيل التعليق — جرّب من جديد' : ack.errorAr }
    }
    // مقاطع فارغة = ميكروفون صامت: لا يُخزَّن تعليق ميت لا يُفرَّغ أبدًا (بلاغ المالك 2026-09-04)
    if (ack.chunks.length === 0) {
      return { ok: false, errorAr: SILENT_MIC_ERROR_AR }
    }
    host.store.set(cur.stepIndex, { memoId: cur.memoId, chunks: ack.chunks, durationMs: ack.durationMs, pending: true })
    return { ok: true, capped: reason === 'cap', stepIndex: cur.stepIndex, durationMs: ack.durationMs }
  }

  function clearMemo(i: number): void {
    host.store.delete(i)
  }

  /** مسح كل تعليقات الجلسة (إلغاء الالتقاط) */
  function purge(): void {
    host.store.clear()
  }

  return {
    startMemo,
    stopMemo,
    clearMemo,
    purge,
    activeMemo: (): ActiveMemo | null => active,
  }
}

/**
 * ربط التعليقات المحفوظة بخطوات الدليل عند الإنهاء — كل خطوة لها تعليق تصير
 * `voice: {durationMs, pending:true}` بلا fileId ولا fileUrl: الرقم الحقيقيّ
 * يحلّه حدث رفع الطابور عند التسليم، وفشلُه يبقي الصوت pending محفوظًا لا
 * مفقودًا (صدق VOX). التعليق الأحدث لفهرس الخطوة هو المنتصر (إعادة تسجيل).
 */
export function applyMemosToGuide(guide: Guide, store: Map<number, StoredVoiceMemo>): void {
  guide.steps.forEach((step, i) => {
    const memo = store.get(i)
    if (memo) step.voice = { durationMs: memo.durationMs, pending: true }
  })
}
