import { describe, expect, it } from 'vitest'
import type { WorkspaceDto } from '@dalili/shared'
import { accountLabels, blockedOf, initialsOf } from './accounts'

const ws = (over: Partial<WorkspaceDto> = {}): WorkspaceDto => ({ id: 'w1', name: 'شركة الأفق', role: 'creator', kind: 'company', status: 'active', active: true, ...over })

describe('accounts — ت (§٣.٥)', () => {
  it('نوع الحساب ودور العضو بتسمية نوعه', () => {
    expect(accountLabels(ws())).toEqual({ kind: 'شركة', role: 'منشئ' })
    expect(accountLabels(ws({ kind: 'partner', role: 'creator' }))).toEqual({ kind: 'شريك', role: 'محرّر' })
    expect(accountLabels(ws({ kind: 'partner', role: 'viewer' }))).toEqual({ kind: 'شريك', role: 'مراجع' })
    expect(accountLabels(ws({ kind: 'personal', role: 'admin' }))).toEqual({ kind: 'شخصي', role: 'مدير' })
  })

  it('الحساب النشط الموقوف أو المنتهي يحجب القائمة', () => {
    expect(blockedOf([ws()])).toBeNull()
    expect(blockedOf([ws({ status: 'suspended' })])).toBe('suspended')
    expect(blockedOf([ws({ status: 'ended' })])).toBe('ended')
    expect(blockedOf([ws({ active: false, status: 'suspended' }), ws({ id: 'w2' })])).toBeNull()
    expect(blockedOf([])).toBeNull()
  })

  it('الحرفان الأولان شعارًا', () => {
    expect(initialsOf('شركة الأفق')).toBe('شا')
    expect(initialsOf('Odoo')).toBe('O')
    expect(initialsOf('')).toBe('?')
  })
})
