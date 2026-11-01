import { t, type TKey } from '../i18n'

/** م٢: أسماء أفعال سجل المنصة المقروءة — مصدر واحد لصفحة الحساب والسجل */
const LABELS: Record<string, TKey> = {
  'account.create': 'platform.a.create',
  'account.update': 'platform.a.update',
  'account.status.suspended': 'platform.a.suspended',
  'account.status.ended': 'platform.a.ended',
  'account.status.active': 'platform.a.active',
  'account.admin_invite': 'platform.a.adminInvite',
  'user.reset_link': 'platform.a.resetLink',
  'user.end_sessions': 'platform.a.endSessions',
  'platform.mfa_verified': 'platform.a.mfa',
  'system.create': 'platform.a.systemCreate',
  'system.update': 'platform.a.systemUpdate',
  'system.provider_add': 'platform.a.providerAdd',
  'system.provider_remove': 'platform.a.providerRemove',
  'system.logo': 'platform.a.systemLogo',
}

export function platformActionLabel(action: string): string {
  const key = LABELS[action]
  return key ? t(key) : action
}
