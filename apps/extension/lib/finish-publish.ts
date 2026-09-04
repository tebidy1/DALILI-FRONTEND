import { DaliliClient } from '@dalili/shared'
import type { SessionMeta } from './protocol'
import { clearAllSteps, publishSteps } from './publish'
import { autoTranscribe, stopRecorderAndWait } from './audio-publish'
import { autoTranscribeSteps } from './voice-memo-upload'
import { API_BASE, WEB_BASE } from './config'

/**
 * إنهاء الالتقاط (نشر/مسودة) والإلغاء — استُخلص من background.ts بلا تغيير سلوك.
 * القانون الثابت: فشل الصوت أو تعليقات الخطوات أو تفريغها لا يسقط نشر الخطوات
 * أبدًا ولا يمحو شيئًا من عمل المستخدم.
 */

export interface FinishDeps {
  meta: () => SessionMeta
  saveMeta: (patch: Partial<SessionMeta>) => Promise<void>
  finishAudio: (client: DaliliClient, sid: string) => Promise<import('@dalili/core').AudioMeta | undefined>
  purgeAudio: (sid: string) => Promise<void>
  /** VOX-09: إيقاف تعليق جارٍ ومسح صوت الجلسة عند الإلغاء */
  abortMemos: (sid: string) => Promise<void>
}

export function createFinish(deps: FinishDeps) {
  async function finishCapture() {
    const meta = deps.meta()
    if (meta.state !== 'capturing' && meta.state !== 'paused') return
    if (meta.stepCount === 0) {
      // لا ننشر دليلًا فارغًا يلوث المكتبة — رسالة صادقة والجلسة تبقى قابلة للاستكمال
      await deps.saveMeta({ state: 'paused', notice: 'لم تُلتقط أي خطوة بعد — تفاعل مع الصفحة (نقرة أو كتابة) ثم أنهِ' })
      return
    }
    await deps.saveMeta({ state: 'saving', notice: undefined })
    const client = new DaliliClient(API_BASE)
    const sid = meta.sessionId
    try {
      const me = await client.me()
      if (!me) {
        await deps.saveMeta({ state: 'draft', draftReason: 'غير مسجّل الدخول — دليلك محفوظ محليًا' })
        await chrome.tabs.create({ url: `${WEB_BASE}/login?return=extension` })
        return
      }
      // VOX: الصوت أولًا (إيقاف + تجميع + رفع) — فشله لا يسقط نشر الخطوات أبدًا
      const audio = await deps.finishAudio(client, sid)
      // CAP-17: الجلسة تعرف هدفها — نشر عادي أو إضافة لدليل قائم في موضع محدد
      // VOX-09: تعليقات الخطوات تُرفع خلال النشر بتقدم صادق «ن من م»
      const published = await publishSteps(client, sid, meta.stepCount, meta.appendTo, meta.insertAt, audio, {
        onMemoProgress: (m) => void deps.saveMeta({ notice: m }),
      })
      await clearAllSteps()
      await deps.purgeAudio(sid)
      await deps.saveMeta({ state: 'idle', sessionId: '', stepCount: 0, limited: false, micOn: false, memoLive: undefined, appendTo: undefined, insertAt: undefined, notice: undefined })
      // التفريغ التلقائي (قرار المالك): كلام الصوت يملأ ملاحظات الخطوات وكلام كل تعليق
      // خطوة يُلحق تحت عنوانها — فشل أيٍّ منهما لا يمسّ الدليل؛ المحرر يفتح بلافتة إعادة
      const stt = await autoTranscribe(client, published.guideId, !!audio)
      const sttSteps = await autoTranscribeSteps(client, published.guideId, published.memoTotal > 0)
      await chrome.tabs.create({ url: `${WEB_BASE}/g/${published.guideId}${stt.ok && sttSteps.ok ? '' : '?stt=failed'}` })
    } catch (e) {
      await deps.saveMeta({
        state: 'draft',
        draftReason: (e instanceof Error ? e.message : 'فشل غير معروف') + ' — الخطوات محفوظة محليًا',
      })
    }
  }

  async function cancelCapture() {
    const meta = deps.meta()
    if (meta.state === 'idle' || meta.state === 'saving') return
    if (meta.sessionId) {
      await stopRecorderAndWait(meta.sessionId)
      await deps.purgeAudio(meta.sessionId)
      await deps.abortMemos(meta.sessionId)
    }
    await clearAllSteps()
    await deps.saveMeta({
      state: 'idle',
      sessionId: '',
      stepCount: 0,
      limited: false,
      draftReason: undefined,
      notice: undefined,
      micOn: false,
      memoLive: undefined,
      appendTo: undefined,
      insertAt: undefined,
    })
  }

  return { finishCapture, cancelCapture }
}
