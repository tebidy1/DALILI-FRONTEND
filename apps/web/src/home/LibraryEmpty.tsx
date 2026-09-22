import { StateView } from '../ui/StateView'
import { IconBookOpen, IconBookmark, IconUser } from '../ui/icons'
import { t } from '../i18n'
import { EXTENSION_INSTALL_URL } from '../lib/extension-install'
import type { HomeScreen } from './screen'

/**
 * حالات الفراغ الثماني بترتيبها الملزم — الترتيب جزء من السلوك: سلة → مشاهد في
 * «أدلتي» → فراغ أدلتي/محفوظات بلا فلاتر → مساحة فارغة (مشاهد/منشئ) → لا نتائج
 * بفلاتر → البداية من الصفر.
 */

export function LibraryEmpty(p: {
  screen: HomeScreen
  inTrash: boolean
  isViewer: boolean
  anyFilter: boolean
  folder: string | null
  hasOverview: boolean
  allCount: number
  creating: boolean
  onNewGuide: () => void
  onClearFilters: () => void
}) {
  const emptyStart = { label: t('library.newGuide'), onAction: p.onNewGuide, busy: p.creating }
  if (p.inTrash) {
    return <StateView kind="empty" icon={<IconBookOpen size={30} />} title={t('library.trashEmpty')} desc={t('library.trashEmptyDesc')} />
  }
  if (p.isViewer && p.screen === 'mine') {
    return <StateView kind="empty" icon={<IconUser size={30} />} title={t('home.viewerMine')} desc={t('home.viewerEmptyDesc')} />
  }
  if (p.screen === 'mine' && !p.anyFilter) {
    return <StateView kind="empty" icon={<IconBookOpen size={30} />} title={t('home.mineEmpty')} desc={t('home.mineEmptyDesc')} action={emptyStart} />
  }
  if (p.screen === 'saved' && !p.anyFilter) {
    return <StateView kind="empty" icon={<IconBookmark size={30} />} title={t('home.savedEmpty')} desc={t('home.savedEmptyDesc')} />
  }
  if (p.screen === 'home' && p.isViewer && p.hasOverview && p.allCount === 0) {
    return <StateView kind="empty" icon={<IconBookOpen size={30} />} title={t('home.viewerEmpty')} desc={t('home.viewerEmptyDesc')} />
  }
  if (p.screen === 'home' && p.hasOverview && p.allCount === 0) {
    return (
      <>
        <StateView kind="empty" icon={<IconBookOpen size={30} />} title={t('home.startTitle')} desc={t('home.startDesc')} action={emptyStart} />
        {/* قرار المالك 2026-09-10: الدعوة للتثبيت تأخذ للرابط — والزر يختفي حتى يوضع VITE_EXTENSION_URL */}
        {EXTENSION_INSTALL_URL && (
          <div className="row center">
            <a className="btn ghost" href={EXTENSION_INSTALL_URL} target="_blank" rel="noreferrer">
              {t('home.installExt')} ↗
            </a>
          </div>
        )}
      </>
    )
  }
  if (p.anyFilter || p.screen !== 'home') {
    return (
      <StateView
        kind="empty"
        icon={<IconBookOpen size={30} />}
        title={p.folder && p.screen === 'home' ? t('library.emptyFolder') : t('home.noResults')}
        desc={t('home.noResultsDesc')}
        action={{ label: t('home.clearFilters'), onAction: p.onClearFilters }}
      />
    )
  }
  return <StateView kind="empty" icon={<IconBookOpen size={30} />} title={t('library.emptyTitle')} desc={t('library.emptyDesc')} action={emptyStart} />
}
