import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCaptureFlow, type CaptureFlowDeps } from './capture-flow'
import type { CaptureEvent, SessionMeta, StoredStep } from './protocol'
import { MAX_STEPS } from './session'

/** VOX-AUTO: خطّاف البطاقة الجديدة في خط الالتقاط — كل بطاقة جديدة (لا الاستبدال
 * ولا الخطوات المهمَلة) يُعلَم عنها السياسة الصوتية كي توقف تعليق السابقة وتبدأ على الجديدة */

const PAGE_URL = 'https://example.com/page'

function clickEv(ts: number): CaptureEvent {
  return {
    kind: 'click',
    target: { text: 'حفظ', label: 'حفظ' },
    sensitive: false,
    url: PAGE_URL,
    pageTitle: 'صفحة',
    ts,
    rect: { x: 1, y: 2, w: 30, h: 16 },
    dpr: 1,
  }
}

function inputEv(ts: number, value: string): CaptureEvent {
  return {
    kind: 'input',
    target: { label: 'اسم المستخدم' },
    sensitive: false,
    url: PAGE_URL,
    pageTitle: 'صفحة',
    ts,
    value,
    rect: { x: 1, y: 2, w: 120, h: 20 },
    dpr: 1,
  }
}

function flowWorld(over: Partial<SessionMeta> = {}) {
  let meta: SessionMeta = { state: 'capturing', sessionId: 's1', startedAt: 0, stepCount: 0, ...over }
  const steps = new Map<number, StoredStep>()
  const onNewStep = vi.fn<(sid: string, idx: number) => Promise<void>>().mockResolvedValue(undefined)
  const onLimitReached = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const deps: CaptureFlowDeps = {
    meta: () => meta,
    saveMeta: async (p) => {
      meta = { ...meta, ...p }
    },
    saveSilently: async () => {},
    readStep: async (_sid, i) => steps.get(i),
    writeStep: async (_sid, i, st) => {
      steps.set(i, st)
    },
    patchStep: async (_sid, i, patch) => {
      const cur = steps.get(i) ?? { ev: clickEv(0) }
      steps.set(i, { ...cur, ...patch })
    },
    renumberMemos: async () => {},
    onNewStep,
    onLimitReached,
  }
  return { flow: createCaptureFlow(deps), meta: () => meta, onNewStep, onLimitReached }
}

beforeEach(() => {
  // أدنى بيئة كروم لالتقاط الخطوة غير المتزامن — المتعلّق هنا هو الخطّاف لا اللقطة
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local: { set: async () => {}, get: async () => ({}) } },
    tabs: {
      sendMessage: async () => ({}),
      captureVisibleTab: async () => 'data:image/jpeg;base64,QQ==',
      get: async () => ({ id: 1, url: PAGE_URL }),
    },
  }
})

describe('capture-flow — خطّاف البطاقة الجديدة (VOX-AUTO)', () => {
  it('كل بطاقة جديدة يُعلَم عنها بمعرّف الجلسة وفهرسها', async () => {
    const w = flowWorld()
    await w.flow.handleCaptureEvent(clickEv(1000))
    expect(w.meta().stepCount).toBe(1)
    expect(w.onNewStep).toHaveBeenCalledWith('s1', 0)
  })

  it('الكتابة المتصلة على نفس الحقل تستبدل البطاقة — لا إعلان عن بطاقة جديدة', async () => {
    const w = flowWorld()
    await w.flow.handleCaptureEvent(inputEv(1000, 'أ'))
    await new Promise((r) => setTimeout(r, 520)) // تجاوز خنق اللقطات قبل الحدث الثاني
    await w.flow.handleCaptureEvent(inputEv(1600, 'أب'))
    expect(w.meta().stepCount).toBe(1)
    expect(w.onNewStep).toHaveBeenCalledTimes(1)
  })

  it('التنقّل التبع المكتوب داخل نافذة الكبت ليس بطاقة — لا إعلان', async () => {
    const w = flowWorld()
    await w.flow.handleCaptureEvent(clickEv(1000))
    await w.flow.handleCaptureEvent({ ...clickEv(2000), kind: 'navigate', url: 'https://example.com/page#x', rect: undefined })
    expect(w.meta().stepCount).toBe(1)
    expect(w.onNewStep).toHaveBeenCalledTimes(1)
  })
})

describe('capture-flow — خطّاف بلوغ الحد (زر الجرس)', () => {
  it('أول حدث فوق الحد يعلّم limited ويُعلم الخطّاف مرة واحدة', async () => {
    const w = flowWorld({ stepCount: MAX_STEPS })
    await w.flow.handleCaptureEvent(clickEv(1000))
    expect(w.meta().limited).toBe(true)
    expect(w.meta().stepCount).toBe(MAX_STEPS)
    expect(w.onLimitReached).toHaveBeenCalledTimes(1)
  })

  it('الأحداث التالية والحد معلَّم أصلًا لا تكرّر الإعلام', async () => {
    const w = flowWorld({ stepCount: MAX_STEPS, limited: true })
    await w.flow.handleCaptureEvent(clickEv(1000))
    await w.flow.handleCaptureEvent(clickEv(3000))
    expect(w.onLimitReached).not.toHaveBeenCalled()
  })
})
