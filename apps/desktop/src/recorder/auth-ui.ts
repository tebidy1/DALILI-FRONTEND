/**
 * مُصغِّر واجهة الاقتران النقيّ (اق-٢) — ‏(state, action) ⇒ state بلا DOM
 * ولا جسر ولا شبكة: العرض (main.ts) يرسم الحالة والجسر يُصدِر الأفعال.
 * **لا رمز جهاز (itq_) يدخل الحالة أبدًا** — الحالة تحمل بريد المستخدم
 * ورمز الموافقة القصير (userCode، ‏XXXX-XXXX) فحسب؛ الرمز السرّي في
 * خزنة ويندوز وحده (عقد ٣د-١).
 */

export type AuthPhase = 'unknown' | 'unpaired' | 'pairing' | 'paired'

export interface AuthUiState {
  phase: AuthPhase
  /** رمز الموافقة القصير — يظهر أثناء pairing فقط ويُمحى عند الاقتران */
  userCode?: string
  /** بريد الحساب المربوط — للعرض وحده، غير سرّيّ بعقد ٣د-١ */
  email?: string
}

export type AuthUiAction =
  | { t: 'status'; paired: boolean; email?: string }
  | { t: 'start'; userCode: string }
  | { t: 'paired'; email?: string }
  | { t: 'lost' }
  | { t: 'forget' }

export const initialAuthUiState: AuthUiState = { phase: 'unknown' }

export function reduceAuthUi(state: AuthUiState, action: AuthUiAction): AuthUiState {
  switch (action.t) {
    case 'status':
      // قراءة الخزنة عند الإقلاع تقصّ أيّ حالة سابقة كائنًا جديدًا (بلا
      // مفاتيح undefined — الحالة نظيفة الشكل دائمًا)
      if (!action.paired) return { phase: 'unpaired' }
      return action.email === undefined
        ? { phase: 'paired' }
        : { phase: 'paired', email: action.email }
    case 'start':
      return { phase: 'pairing', userCode: action.userCode }
    case 'paired':
      // الاقتران يُمحى رمز الموافقة — انتهت صلاحيته
      return action.email === undefined
        ? { phase: 'paired' }
        : { phase: 'paired', email: action.email }
    case 'lost':
      return { phase: 'unpaired' }
    case 'forget':
      return { phase: 'unpaired' }
  }
}
