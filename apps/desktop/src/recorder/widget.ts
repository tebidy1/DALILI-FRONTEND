/**
 * مُصغِّر الودجة النقيّ (٣هـ-٢) — ‏(state, action) ⇒ state بلا DOM ولا جسر
 * ولا ساعة ولا شبكة: العرض (main.ts) يرسم الحالة، والجلسة وأزرار الودجة
 * تُصدِر الأفعال. ‏tick يزيد العدّاد في ‏recording حصرًا — طوق أمانٍ ثانٍ
 * فوق بوّابة الجلسة (paused يبوّب sensor://input في session.ts)؛ والأفعال
 * غير الصالحة للوضع تعيد الحالة كما هي فلا احتمال انزلاق وضع.
 */

export type WidgetMode = 'idle' | 'recording' | 'paused' | 'building'

export interface WidgetState {
  mode: WidgetMode
  steps: number
}

export type WidgetAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'done'
  | 'tick'
  | { t: 'count'; steps: number }

export const initialWidgetState: WidgetState = { mode: 'idle', steps: 0 }

export function reduceWidget(state: WidgetState, action: WidgetAction): WidgetState {
  // مزامنة العدّاد من حقيقة الجلسة (stepCount) لا عدّ أحداثٍ مستقلّ: نقرات
  // الودجة المستثناة لا تزيده، وخطوات navigate تُحسَب كما هي. عرضٌ فقط —
  // لا يغيّر الوضع إطلاقًا، والقيم المنحلّة/السالبة تُطبَّع.
  if (typeof action === 'object') {
    return { ...state, steps: Math.max(0, Math.trunc(action.steps)) }
  }
  switch (action) {
    case 'start':
      return state.mode === 'idle' ? { mode: 'recording', steps: 0 } : state
    case 'pause':
      return state.mode === 'recording' ? { ...state, mode: 'paused' } : state
    case 'resume':
      return state.mode === 'paused' ? { ...state, mode: 'recording' } : state
    case 'stop':
      return state.mode === 'recording' || state.mode === 'paused'
        ? { ...state, mode: 'building' }
        : state
    case 'done':
      // رجوع للبدء بعد الإنهاء (أو فشله) — جلسة جديدة عدّادها صفري
      return state.mode === 'building' ? { ...initialWidgetState } : state
    case 'tick':
      return state.mode === 'recording' ? { ...state, steps: state.steps + 1 } : state
  }
}
