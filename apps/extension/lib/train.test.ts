import { describe, expect, it, vi } from 'vitest'
import { advanceTrain, buildTrainPlan, bumpTrainStats, retryUntil } from './train'
import type { AnchorCandidate } from '@dalili/core'
import type { GuideDto, StepDto } from '@dalili/shared'

function step(partial: Partial<StepDto>): StepDto {
  return {
    id: 's',
    kind: 'click',
    title: 'خطوة',
    target: {},
    sensitive: false,
    url: 'https://x.test/a',
    pageTitle: 'ص',
    ts: 1,
    ...partial,
  }
}

function guide(steps: StepDto[]): GuideDto {
  return {
    id: 'g1',
    schemaVersion: 1,
    title: 'دليل الفاتورة',
    locale: 'ar',
    dir: 'rtl',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    steps,
  }
}

const anchor: AnchorCandidate[] = [{ k: 'id', v: 'save' }]

describe('buildTrainPlan — خطة التدريب من الدليل (GM-01)', () => {
  it('يبقي الأفعال القابلة للتدريب ذات المرساة فقط — navigate انتقال لا فعل مستخدم', () => {
    const plan = buildTrainPlan(
      guide([
        step({ id: 'n1', kind: 'navigate', url: 'https://x.test/a' }),
        step({ id: 'c1', kind: 'click', target: { anchor } }),
        step({ id: 'c2', kind: 'click', target: {} }), // بلا مرساة — عرض فقط
        step({ id: 'i1', kind: 'input', target: { anchor } }),
      ]),
    )
    expect(plan.map((s) => s.id)).toEqual(['c1', 'i1'])
    expect(plan[0]).toMatchObject({ title: 'خطوة', anchor, url: 'https://x.test/a' })
  })

  it('يحمل الملاحظة مع الخطوة — كلام الخبير يظهر في بطاقة التدريب', () => {
    const plan = buildTrainPlan(guide([step({ id: 'c1', note: 'انتبه: الحقل حساس', target: { anchor } })]))
    expect(plan[0]!.note).toBe('انتبه: الحقل حساس')
  })

  it('دليل كله بلا مراساة (أدلة ما قبل AUTO-01) = خطة فارغة — تُعلَب بصدق لا تدريب وهمي', () => {
    expect(buildTrainPlan(guide([step({ kind: 'click' })]))).toEqual([])
  })
})

describe('advanceTrain — تقدّم الجلسة (GM-02/GM-03)', () => {
  const session = { token: 't', guideId: 'g', guideTitle: 'د', idx: 0, tabId: 7, startedAt: 1, steps: [
    { id: 'a', kind: 'click' as const, title: '١', anchor, url: 'u' },
    { id: 'b', kind: 'click' as const, title: '٢', anchor, url: 'u' },
  ] }

  it('done وskip يقدمان الخطوة بنفس الوزن — التخطي لا يعلّق التدريب', () => {
    const s1 = advanceTrain(session, 'done')!
    expect(s1.session.idx).toBe(1)
    expect(advanceTrain(s1.session, 'skip')!.session.idx).toBe(2)
  })

  it('نهاية الخطوات = جلسة منتهية مكتملة', () => {
    const s1 = advanceTrain(session, 'done')!
    const s2 = advanceTrain(s1.session, 'done')!
    expect(s2.finished).toBe(true)
    expect(s2.completed).toBe(true)
  })

  it('stop ينهي الجلسة فورًا — مكتملة فقط إن بلغ ٨٠٪ (GM-03)', () => {
    expect(advanceTrain(session, 'stop')!.completed).toBe(false)
    const deep = { ...session, idx: 4, steps: session.steps.concat(
      { id: 'c', kind: 'click' as const, title: '٣', anchor, url: 'u' },
      { id: 'd', kind: 'click' as const, title: '٤', anchor, url: 'u' },
      { id: 'e', kind: 'click' as const, title: '٥', anchor, url: 'u' },
    ) }
    // ٤ من ٥ منجزة (٨٠٪) ثم إيقاف → مكتمل بقرار GM-03
    const stopped = advanceTrain(deep, 'stop')!
    expect(stopped.finished).toBe(true)
    expect(stopped.completed).toBe(true)
  })
})

describe('bumpTrainStats — تتبّع مجمّع بلا بيانات أفراد (GM-03)', () => {
  it('يزيد الجولات دائمًا والإكمال عند الاكتمال فقط — غير قابل للتغيير في المكان', () => {
    const a = bumpTrainStats(undefined, false)
    expect(a).toEqual({ runs: 1, completed: 0 })
    const b = bumpTrainStats(a, true)
    expect(b).toEqual({ runs: 2, completed: 1 })
    expect(a).toEqual({ runs: 1, completed: 0 })
  })
})


describe('retryUntil — تسليم صبور بحد أقصى (RC3: سباق جهوزية سكربت المحتوى)', () => {
  it('ينجح حين تنجح المحاولة الثالثة — المحاولتان الأولان رُفضتا', async () => {
    vi.useFakeTimers()
    let n = 0
    const p = retryUntil(
      () => {
        n++
        return n < 3 ? Promise.reject(new Error('receiving end does not exist')) : Promise.resolve(true)
      },
      { attempts: 6, intervalMs: 400 },
    )
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toBe(true)
    expect(n).toBe(3)
    vi.useRealTimers()
  })

  it('يتخلى بعد آخر محاولة بصدق — false لا تعليق أبدًا', async () => {
    vi.useFakeTimers()
    let n = 0
    const p = retryUntil(
      () => {
        n++
        return Promise.reject(new Error('gone'))
      },
      { attempts: 4, intervalMs: 300 },
    )
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toBe(false)
    expect(n).toBe(4)
    vi.useRealTimers()
  })

  it('shouldStop يقطع الإعادة فورًا — لا تسليم خطوة قديمة لجلسة تحرّكت', async () => {
    vi.useFakeTimers()
    let n = 0
    const p = retryUntil(
      () => {
        n++
        return Promise.reject(new Error('busy'))
      },
      { attempts: 10, intervalMs: 300, shouldStop: () => n >= 2 },
    )
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toBe(false)
    expect(n).toBe(2)
    vi.useRealTimers()
  })
})
