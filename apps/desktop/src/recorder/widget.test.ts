import { describe, expect, it } from 'vitest'
import {
  initialWidgetState,
  reduceWidget,
  type WidgetAction,
  type WidgetState,
} from './widget'

/** ٣هـ-٢ — مُصغِّر الودجة النقيّ: (state, action) ⇒ state بلا DOM ولا جسر
 *  ولا ساعة. كل انتقال مُختبَر، وtick يزيد العدّاد في recording حصرًا،
 *  والأفعال غير الصالحة للوضع لا تغيّر الحالة إطلاقًا. */

function drive(actions: WidgetAction[]): WidgetState {
  return actions.reduce((s, a) => reduceWidget(s, a), initialWidgetState)
}

describe('٣هـ-٢ — مُصغِّر حالة الودجة النقيّ', () => {
  it('(أ) دورة الحياة كاملة: idle→recording→paused→recording→building→idle', () => {
    let s = initialWidgetState
    expect(s.mode).toBe('idle')

    s = reduceWidget(s, 'start')
    expect(s).toEqual({ mode: 'recording', steps: 0 })

    s = reduceWidget(s, 'tick')
    s = reduceWidget(s, 'tick')
    expect(s).toEqual({ mode: 'recording', steps: 2 })

    s = reduceWidget(s, 'pause')
    expect(s).toEqual({ mode: 'paused', steps: 2 })

    s = reduceWidget(s, 'resume')
    expect(s).toEqual({ mode: 'recording', steps: 2 })

    s = reduceWidget(s, 'tick')
    expect(s.steps).toBe(3)

    s = reduceWidget(s, 'stop')
    expect(s).toEqual({ mode: 'building', steps: 3 })

    s = reduceWidget(s, 'done')
    expect(s).toEqual({ mode: 'idle', steps: 0 })
  })

  it('(ب) tick يزيد العدّاد في recording حصرًا — لا في paused ولا idle ولا building', () => {
    expect(reduceWidget(initialWidgetState, 'tick')).toEqual(initialWidgetState)

    const recording = drive(['start', 'tick', 'tick'])
    expect(reduceWidget(recording, 'tick')).toEqual({ mode: 'recording', steps: 3 })

    const paused = drive(['start', 'tick', 'pause'])
    expect(reduceWidget(paused, 'tick')).toEqual({ mode: 'paused', steps: 1 })

    const building = drive(['start', 'tick', 'stop'])
    expect(reduceWidget(building, 'tick')).toEqual({ mode: 'building', steps: 1 })
  })

  it('(ج) الأفعال غير الصالحة للوضع لا تغيّر الحالة (عودة نفس الكائن بالمعنى)', () => {
    // pause/resume/stop/done خارج أوضاعها
    expect(reduceWidget(initialWidgetState, 'pause')).toEqual(initialWidgetState)
    expect(reduceWidget(initialWidgetState, 'resume')).toEqual(initialWidgetState)
    expect(reduceWidget(initialWidgetState, 'stop')).toEqual(initialWidgetState)
    expect(reduceWidget(initialWidgetState, 'done')).toEqual(initialWidgetState)
    // start في غير idle
    const recording = drive(['start', 'tick'])
    expect(reduceWidget(recording, 'start')).toEqual(recording)
    const paused = drive(['start', 'pause'])
    expect(reduceWidget(paused, 'start')).toEqual(paused)
    expect(reduceWidget(paused, 'pause')).toEqual(paused) // إيقافٌ مكرّر
    expect(reduceWidget(paused, 'resume')).not.toEqual(paused)
    const resumed = drive(['start', 'pause', 'resume'])
    expect(reduceWidget(resumed, 'resume')).toEqual(resumed) // استئنافٌ مكرّر
    // stop/done في غير موضعهما
    const done = drive(['start', 'stop', 'done'])
    expect(reduceWidget(done, 'done')).toEqual(done)
    expect(reduceWidget(done, 'stop')).toEqual(done)
  })

  it('(د) start من idle يبدأ عدّادًا صفريًا — جلسة جديدة لا ترث عدّ السابقة', () => {
    const finished = drive(['start', 'tick', 'tick', 'stop', 'done'])
    expect(reduceWidget(finished, 'start')).toEqual({ mode: 'recording', steps: 0 })
  })

  it('(و) الإلغاء (قرار المالك): recording/paused ⇐ صفر جديد، وغيرهما بلا أثر', () => {
    const recording = drive(['start', 'tick', 'tick'])
    expect(reduceWidget(recording, 'cancel')).toEqual({ mode: 'idle', steps: 0 })
    const paused = drive(['start', 'tick', 'pause'])
    expect(reduceWidget(paused, 'cancel')).toEqual({ mode: 'idle', steps: 0 })
    // الإلغاء في غير أوضاعه لا يفعل شيء — كباقي الأفعال المنضبطة
    expect(reduceWidget(initialWidgetState, 'cancel')).toEqual(initialWidgetState)
    const building = drive(['start', 'tick', 'stop'])
    expect(reduceWidget(building, 'cancel')).toEqual(building)
  })

  it('(هـ) مزامنة العدّاد من حقيقة الجلسة (count): يضبط العدد ولا يغيّر الوضع', () => {
    const recording = drive(['start', 'tick', 'tick'])
    expect(reduceWidget(recording, { t: 'count', steps: 5 })).toEqual({ mode: 'recording', steps: 5 })
    // نقرة الودجة المستثناة لا خطوة لها ⇐ مزامنة بنفس العدد بلا زيادة
    expect(reduceWidget(recording, { t: 'count', steps: 2 })).toEqual(recording)
    // الصفري والسالب والمكسور تُطبَّع — عرضٌ مزامَن لا حساب مستقلّ
    expect(reduceWidget(recording, { t: 'count', steps: 0 })).toEqual({ mode: 'recording', steps: 0 })
    expect(reduceWidget(recording, { t: 'count', steps: -3 })).toEqual({ mode: 'recording', steps: 0 })
    expect(reduceWidget(recording, { t: 'count', steps: 4.9 })).toEqual({ mode: 'recording', steps: 4 })
    // الوضع لا يتأثّر إطلاقًا
    const paused = drive(['start', 'tick', 'pause'])
    expect(reduceWidget(paused, { t: 'count', steps: 9 })).toEqual({ mode: 'paused', steps: 9 })
    const building = drive(['start', 'tick', 'stop'])
    expect(reduceWidget(building, { t: 'count', steps: 9 })).toEqual({ mode: 'building', steps: 9 })
  })
})
