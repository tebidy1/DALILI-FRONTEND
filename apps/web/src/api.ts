import { DaliliClient } from '@dalili/shared'

/** قاعدة فارغة = مسارات نسبية عبر بروكسي Vite إلى الخادم على 8787 */
export const client = new DaliliClient('')

export const WEB_SHARE_BASE = typeof location !== 'undefined' ? `${location.origin}/s/` : '/s/'

/** رابط عرض على الويب من رابط المشاركة الخادمي */
export function webShareUrl(serverUrl: string): string {
  const token = serverUrl.split('/s/')[1] ?? ''
  return WEB_SHARE_BASE + token
}

/** رابط صفحة الدعوة على أصل الويب — أصل الخادم (8787) قد يختلف عن الويب (5174) */
export function webInviteUrl(serverInviteUrl: string): string {
  const token = serverInviteUrl.split('/invite/')[1] ?? ''
  return typeof location !== 'undefined' ? `${location.origin}/invite/${token}` : `/invite/${token}`
}
