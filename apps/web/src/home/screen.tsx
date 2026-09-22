import type { ReactNode } from 'react'
import { t } from '../i18n'
import { IconBookmark, IconHome, IconTrash, IconUser } from '../ui/icons'

/** شاشات الهوم الأربع — كل مكوّنات الشاشة تستورد أنواعها من هنا لا من HomePage */
export type HomeScreen = 'home' | 'mine' | 'saved' | 'trash'

/** «مجلدات» = عرض المحتوى حسب المجلدات (طلب المالك 2026-09-03) — للرئيسية وحدها */
export type Layout = 'grid' | 'list' | 'folders'

export function readLayout(): Layout {
  try {
    const stored = localStorage.getItem('home.layout')
    return stored === 'list' || stored === 'folders' ? stored : 'grid'
  } catch {
    return 'grid'
  }
}

export const SCREEN_META: Record<HomeScreen, { title: string; icon: ReactNode }> = {
  home: { title: t('home.navHome'), icon: <IconHome size={20} /> },
  mine: { title: t('home.navMine'), icon: <IconUser size={20} /> },
  saved: { title: t('home.navSaved'), icon: <IconBookmark size={20} /> },
  trash: { title: t('home.viewTrash'), icon: <IconTrash size={20} /> },
}
