import { DaliliClient } from '@dalili/shared'
import type { SessionMeta } from './protocol'
import type { ActivityKind } from './activity'
import { clearAllSteps, publishSteps } from './publish'
import { autoTranscribeSteps } from './voice-memo-upload'
import { t } from './i18n'
import { API_BASE, WEB_BASE } from './config'

/**
 * إنهاء الالتقاط (نشر/مسودة) والإلغاء — القانون الثابت: فشل تعليقات الخطوات أو
 * تفريغها لا يسقط نشر الخطوات أبدًا ولا يمحو شيئًا من عمل المستخدم.
 */

export interface FinishDeps {
  meta: () => SessionMeta
  saveMeta: (patch: Partial<SessionMeta>) => Promise<void>
  /** VOX-AUTO: إنهاء يوقف التعليق الجاري ويحفظه كي يُنشر مع بقية التعليقات */
  stopActiveMemo: () => Promise<void>
  /** VOX-09: إيقاف تعليق جارٍ ومسح صوت الجلسة عند الإلغاء */
  abortMemos: (sid: string) => Promise<void>
  /** زر الجرس: ما كان لافتة عابرة (مسودة، فشل تفريغ) يُسجَّل حدثًا — فشل التسجيل لا يمسّ النشر.
   *  المرحلة ٣: `href` يحمل رابط الحل (الدليل مثلًا) كي يقود الجرس إليه بنقرة */
  pushEvent?: (kind: ActivityKind, textAr: string, href?: string) => Promise<unknown>
}

export function createFinish(deps: FinishDeps) {
  const note = (kind: ActivityKind, textAr: string, href?: string) =>
    deps.pushEvent?.(kind, textAr, href).catch(() => undefined)

  /** المرحلة ٣ (قرار المالك): الاسم الاختياري يصل من اللوحة مع رسالة الإنهاء */
  async function finishCapture(title?: string) {
    const meta = deps.meta()
    if (meta.state !== 'capturing' && meta.state !== 'paused') return
    if (meta.stepCount === 0) {
      // لا ننشر دليلًا فارغًا يلوث المكتبة — رسالة صادقة والجلسة تبقى قابلة للاستكمال
      await deps.saveMeta({ state: 'paused', notice: t('ext.noStepsYet') })
      return
    }
    // VOX-AUTO: صوت البطاقة الجارية يُحفظ تحت مفتاحها قبل النشر — فشله لا يسقط شيئًا
    await deps.stopActiveMemo()
    await deps.saveMeta({ state: 'saving', notice: undefined })
    const client = new DaliliClient(API_BASE)
    const sid = meta.sessionId
    try {
      const me = await client.me()
      if (!me) {
        await deps.saveMeta({ state: 'draft', draftReason: t('ext.draftSavedLocal') })
        await note('draft', t('ext.draftSavedNotice'))
        await chrome.tabs.create({ url: `${WEB_BASE}/login?return=extension` })
        return
      }
      // VOX-09: تعليقات الخطوات تُرفع خلال النشر بتقدم صادق «ن من م»
      const published = await publishSteps(client, sid, meta.stepCount, {
        onMemoProgress: (m) => void deps.saveMeta({ notice: m }),
        title,
      })
      await clearAllSteps()
      // المرحلة ٣: لحظة النجاح تُحفظ في الحالة — بطاقة «دليلك جاهز» في اللوحة
      await deps.saveMeta({
        state: 'idle',
        sessionId: '',
        stepCount: 0,
        limited: false,
        autoMemo: false,
        memoLive: undefined,
        notice: undefined,
        lastPublished: { guideId: published.guideId, stepCount: meta.stepCount, at: Date.now() },
      })
      // التفريغ التلقائي (قرار المالك): كلام كل تعليق خطوة يُلحق تحت عنوانها — فشله
      // لا يمسّ الدليل؛ المحرر يفتح بلافتة إعادة المحاولة
      const sttSteps = await autoTranscribeSteps(client, published.guideId, published.memoTotal > 0)
      if (!sttSteps.ok)
        await note('stt', t('ext.sttFail'), `${WEB_BASE}/g/${published.guideId}`)
      // المرحلة ٣: النشر الناجح حدثٌ في الجرس برابط دائم — بطاقة النجاح تزول بعد دقيقتين، الحدث يبقى
      await note('publish', t('ext.publishSuccess'), `${WEB_BASE}/g/${published.guideId}`)
      await chrome.tabs.create({ url: `${WEB_BASE}/g/${published.guideId}${sttSteps.ok ? '' : '?stt=failed'}` })
    } catch (e) {
      await deps.saveMeta({
        state: 'draft',
        draftReason: (e instanceof Error ? e.message : t('ext.unknownFail')) + t('ext.stepsSavedLocal'),
      })
      await note('draft', t('ext.publishFailDraft'))
    }
  }

  async function cancelCapture() {
    const meta = deps.meta()
    if (meta.state === 'idle' || meta.state === 'saving') return
    if (meta.sessionId) await deps.abortMemos(meta.sessionId)
    await clearAllSteps()
    await deps.saveMeta({
      state: 'idle',
      sessionId: '',
      stepCount: 0,
      limited: false,
      draftReason: undefined,
      notice: undefined,
      autoMemo: false,
      memoLive: undefined,
      lastPublished: undefined,
    })
  }

  return { finishCapture, cancelCapture }
}
