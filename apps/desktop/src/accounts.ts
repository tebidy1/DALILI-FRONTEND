import { t, type TKey } from './i18n'

/**
 * ش١ (الخطة §٢٦، المهمة ٥٧): مبدّل الحساب في الديسكتوب — حسابٌ كما يعيده أمر ‏auth_accounts
 * (من ‏/api/me/workspaces برمز الجهاز). التبديل نفسه في Rust وحده، ومحروسٌ هناك أثناء التسجيل.
 */
export interface DesktopAccount {
  id: string
  name: string
  kind: string
  role: string
  status: string
  active: boolean
}

const KIND: Record<string, TKey> = { company: 'dt.kindCompany', partner: 'dt.kindPartner', personal: 'dt.kindPersonal' }

/** «الاسم · النوع · الدور» — قيم الأدوار واحدة، وتسميتها في الشريك مختلفة */
export function accountLabel(a: DesktopAccount): string {
  const r = a.role === 'admin' ? 'Admin' : a.role === 'viewer' ? 'Viewer' : 'Creator'
  const role = t((a.kind === 'partner' ? `dt.partnerRole${r}` : `dt.role${r}`) as TKey)
  return `${a.name} · ${t(KIND[a.kind] ?? 'dt.kindPersonal')} · ${role}`
}

/** المبدّل لمن له أكثر من حساب فعّال — الموقوف لا يُختار */
export function switcherVisible(list: DesktopAccount[]): boolean {
  return list.filter((a) => a.status === 'active').length > 1
}
