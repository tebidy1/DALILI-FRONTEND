import { describe, expect, it } from 'vitest'
import {
  initialAuthUiState,
  reduceAuthUi,
  type AuthUiAction,
  type AuthUiState,
} from './auth-ui'

/** اق-٢ — مُصغِّر واجهة الاقتران النقيّ: الحالة لا تحمل أبدًا رمز جهاز
 *  (‏itq_) — بريدُ المستخدم ورمزُ الموافقة القصير (userCode) فحسب. */

function drive(actions: AuthUiAction[]): AuthUiState {
  return actions.reduce((s, a) => reduceAuthUi(s, a), initialAuthUiState)
}

describe('اق-٢ — مُصغِّر واجهة الاقتران', () => {
  it('(أ) دورة الحياة: غير مقترن ⇒ إقران (رمز) ⇒ مقترن (بريد) ⇒ فصل', () => {
    let s = drive([{ t: 'status', paired: false }])
    expect(s).toStrictEqual({ phase: 'unpaired' })

    s = reduceAuthUi(s, { t: 'start', userCode: 'WDJB-MJHT' })
    expect(s).toStrictEqual({ phase: 'pairing', userCode: 'WDJB-MJHT' })

    s = reduceAuthUi(s, { t: 'paired', email: 'itest@example.invalid' })
    // رمز الموافقة يُمحى لحظة الاقتران — لم يعد له معنى
    expect(s).toStrictEqual({ phase: 'paired', email: 'itest@example.invalid' })

    s = reduceAuthUi(s, { t: 'forget' })
    expect(s).toStrictEqual({ phase: 'unpaired' })
  })

  it('(ب) status(true, email) ⇒ مقترن بالبريد بلا أيّ رمز موافقة قديم', () => {
    // حتى لو كانت الحالة pairing برمز قائم — status يقصّها كائنًا جديدًا
    const s = drive([
      { t: 'start', userCode: 'OLD-CODE1' },
      { t: 'status', paired: true, email: 'user@example.invalid' },
    ])
    expect(s).toStrictEqual({ phase: 'paired', email: 'user@example.invalid' })
    expect('userCode' in s).toBe(false)
  })

  it('(ج) status(false) ⇒ غير مقترن صرف (بلا بريد ولا رمز)', () => {
    const s = drive([
      { t: 'status', paired: true, email: 'a@b.invalid' },
      { t: 'status', paired: false },
    ])
    expect(s).toStrictEqual({ phase: 'unpaired' })
    expect('email' in s).toBe(false)
    expect('userCode' in s).toBe(false)
  })

  it('(د) lost ⇒ غير مقترن صرف من أيّ حالة (بلا بريد ولا رمز)', () => {
    for (const from of [
      drive([]),
      drive([{ t: 'status', paired: true, email: 'a@b.invalid' }]),
      drive([{ t: 'start', userCode: 'WDJB-MJHT' }]),
    ]) {
      expect(reduceAuthUi(from, { t: 'lost' })).toStrictEqual({ phase: 'unpaired' })
    }
  })

  it('(هـ) paired بلا بريد ⇒ مقترن بلا email (العقد يجعله اختياريًّا)', () => {
    const s = reduceAuthUi(initialAuthUiState, { t: 'paired' })
    expect(s).toStrictEqual({ phase: 'paired' })
  })

  it('(و) شكل الحالة لا يحمل سوى phase/userCode/email — لا مكان لرمز جهاز', () => {
    const samples: AuthUiState[] = [
      drive([]),
      drive([{ t: 'status', paired: true, email: 'a@b.invalid' }]),
      drive([{ t: 'start', userCode: 'WDJB-MJHT' }]),
      drive([{ t: 'paired', email: 'a@b.invalid' }]),
      drive([{ t: 'lost' }]),
    ]
    for (const s of samples) {
      for (const key of Object.keys(s)) {
        expect(['phase', 'userCode', 'email']).toContain(key)
      }
      expect(JSON.stringify(s)).not.toContain('itq_')
    }
  })
})
