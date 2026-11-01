import type { WorkspaceDto } from '@dalili/shared'
import { t, type TKey } from './i18n'

/** ت (§٣.٥): المنطق النقي لمبدّل الحساب — التسميات، والحجب، والشعار النصي */

const KIND: Record<string, TKey> = { personal: 'ext.kindPersonal', company: 'ext.kindCompany', partner: 'ext.kindPartner' }

/** قيم الأدوار نفسها في كل حساب، وتسميتها تختلف عند الشريك (الخطة §٣.٣) */
function roleKey(ws: WorkspaceDto): TKey {
  if (ws.role === 'admin') return 'ext.roleAdmin'
  if (ws.kind === 'partner') return ws.role === 'viewer' ? 'ext.rolePartnerViewer' : 'ext.rolePartnerCreator'
  return ws.role === 'viewer' ? 'ext.roleViewer' : 'ext.roleCreator'
}

export function accountLabels(ws: WorkspaceDto): { kind: string; role: string } {
  return { kind: t(KIND[ws.kind ?? 'personal'] ?? 'ext.kindPersonal'), role: t(roleKey(ws)) }
}

/** الحساب النشط موقوف أو منتهٍ: الخادم يرفض قائمته (E-ACC-01/02)، فاللوحة تعرض السبب وحده */
export function blockedOf(accounts: WorkspaceDto[]): 'suspended' | 'ended' | null {
  const status = accounts.find((a) => a.active)?.status
  return status === 'suspended' || status === 'ended' ? status : null
}

/** حرف من كل كلمة من أول كلمتين — شعار نصي حتى يُرفع شعار الحساب */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words.slice(0, 2).map((w) => w[0]).join('')
}
