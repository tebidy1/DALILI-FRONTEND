import { describe, expect, it } from 'vitest'
import { accountLabel, switcherVisible, type DesktopAccount } from './accounts'

// ش١ (الخطة §٢٦، المهمة ٥٧): مبدّل الحساب في الديسكتوب — التسمية والظهور (نقيّ بلا DOM)

const acc = (over: Partial<DesktopAccount> = {}): DesktopAccount => ({ id: 'w1', name: 'شركة الأفق', kind: 'company', role: 'creator', status: 'active', active: true, ...over })

describe('مبدّل الحساب في الديسكتوب', () => {
  it('التسمية: الاسم · النوع · الدور، وأدوار الشريك بأسمائها', () => {
    expect(accountLabel(acc())).toBe('شركة الأفق · شركة · منشئ')
    expect(accountLabel(acc({ name: 'نُظم للحلول', kind: 'partner', role: 'creator' }))).toBe('نُظم للحلول · شريك · محرّر الشريك')
    expect(accountLabel(acc({ name: 'مساحتي', kind: 'personal', role: 'admin' }))).toBe('مساحتي · شخصي · مدير')
  })

  it('يظهر المبدّل لأكثر من حساب فعّال فقط', () => {
    expect(switcherVisible([acc()])).toBe(false)
    expect(switcherVisible([acc(), acc({ id: 'p1', kind: 'partner', active: false })])).toBe(true)
    expect(switcherVisible([acc(), acc({ id: 'p1', status: 'suspended', active: false })])).toBe(false)
  })
})
