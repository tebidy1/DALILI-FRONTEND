import type { GuideRowFields } from '@dalili/shared'
import { filterByTitle } from './recent'

/**
 * بحث اللوحة (ت، طلب المالك 2026-10-30): المكتبة تُجلب مرة عند دخول وضع البحث،
 * ثم الكلمة والفلاتر والترتيب كلها هنا محليًا — فوري بلا رحلة للخادم مع كل حرف.
 */
export type SearchRow = Pick<GuideRowFields, 'creatorName' | 'readerCount' | 'fresh'> & {
  id: string
  title: string
  updatedAt: string
  pinned?: boolean
}

/** «الأنسب» = ترتيب الخادم الموحّد (GuideOrder::sort في Laravel) */
export type SearchSort = 'best' | 'readers' | 'newest'
export type StatusFilter = 'pinned' | 'new' | 'updated'

export interface SearchFilters {
  query: string
  status: StatusFilter[]
  creator: string | null
  sort: SearchSort
}

export const EMPTY_FILTERS: SearchFilters = { query: '', status: [], creator: null, sort: 'best' }

const byNewest = (a: SearchRow, b: SearchRow) => b.updatedAt.localeCompare(a.updatedAt)
const byReaders = (a: SearchRow, b: SearchRow) => (b.readerCount ?? 0) - (a.readerCount ?? 0)
const rank = (cond: (g: SearchRow) => boolean) => (a: SearchRow, b: SearchRow) => Number(cond(b)) - Number(cond(a))

const ORDERS: Record<SearchSort, ((a: SearchRow, b: SearchRow) => number)[]> = {
  best: [rank((g) => !!g.pinned), rank((g) => !!g.fresh), byReaders, byNewest],
  readers: [byReaders, byNewest],
  newest: [byNewest],
}

const matchesStatus = (g: SearchRow, s: StatusFilter) => (s === 'pinned' ? !!g.pinned : g.fresh === s)

export function searchGuides<T extends SearchRow>(rows: T[], f: SearchFilters): T[] {
  const order = ORDERS[f.sort]
  return filterByTitle(rows, f.query)
    .filter((g) => f.status.length === 0 || f.status.some((s) => matchesStatus(g, s)))
    .filter((g) => f.creator === null || g.creatorName === f.creator)
    .sort((a, b) => {
      for (const cmp of order) {
        const d = cmp(a, b)
        if (d !== 0) return d
      }
      return 0
    })
}

/** خيارات فلتر المنشئ — من الأدلة المجلوبة نفسها، فلا يظهر اسم بلا أدلة */
export function creatorsOf(rows: SearchRow[]): string[] {
  return [...new Set(rows.map((g) => g.creatorName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'ar'))
}

/** هل غيّر المستخدم شيئًا يستحق زر «مسح الفلاتر» — الكلمة لها زر مسحها الخاص */
export function hasActiveFilters(f: SearchFilters): boolean {
  return f.status.length > 0 || f.creator !== null || f.sort !== EMPTY_FILTERS.sort
}
