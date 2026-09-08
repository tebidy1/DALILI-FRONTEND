import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FolderDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { IconFolder, IconUsers } from '../ui/icons'
import { t } from '../i18n'
import { arDigits, roleLabelAr } from '../lib/format'
import { readTheme, setTheme, type ThemeChoice } from '../lib/theme'
import { useOverview } from '../shell/OverviewContext'

/**
 * المرحلة هـ (الإعداد — WS-09): «فهرسُ كل شيء» لا تكرار للشاشات — بطاقة بيانات
 * المساحة (اسم/دور/بريد، والتعديل لاحقًا بصدق)، بطاقات مداخل بعداداتها من overview
 * تقود لشاشاتها (أدلتي/المنشورة/المحفوظات/الفريق/التقارير)، ومدير مجلدات مدمج
 * (مساحي بعد ترقية 0011). المشاهد يقرأ البطاقات ولا يكتب مجلدات.
 */

export function SettingsPage() {
  const { overview } = useOverview()
  const navigate = useNavigate()
  const isViewer = overview?.myRole === 'viewer'

  const [folders, setFolders] = useState<FolderDto[] | null>(null)
  const [newFolder, setNewFolder] = useState('')
  const [error, setError] = useState('')
  const [reloadSeq, setReloadSeq] = useState(0)
  const [theme, setThemeState] = useState<ThemeChoice>(() => readTheme())

  // مزامنة الثيم: المحلي فوري، والخادم هو الحقيقة — فشله لا يمنع التطبيق المحلي (صدق)
  function chooseTheme(choice: ThemeChoice) {
    setTheme(choice)
    setThemeState(choice)
    client.setMyTheme(choice).catch(() => setError(t('settings.themeSyncError')))
  }

  const reload = useCallback(() => setReloadSeq((s) => s + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    client
      .listFolders(ac.signal)
      .then(setFolders)
      .catch(() => setFolders([]))
    return () => ac.abort()
  }, [reloadSeq])

  async function createFolder(e: React.FormEvent) {
    e.preventDefault()
    const name = newFolder.trim()
    if (!name) return
    try {
      await client.createFolder(name)
      setNewFolder('')
      reload()
    } catch {
      setError(t('library.folderError'))
    }
  }

  async function removeFolder(f: FolderDto) {
    if (!window.confirm(t('library.deleteFolderConfirm', { name: f.name }))) return
    try {
      await client.deleteFolder(f.id)
      reload()
    } catch {
      setError(t('library.folderError'))
    }
  }

  const counts = overview?.counts

  return (
    <div className="page settings">
      <div className="toolbar">
        <h1 className="row screen-title">{t('settings.title')}</h1>
        <span className="muted">{t('settings.subtitle')}</span>
      </div>

      {error && <div className="err" role="alert">{error}</div>}
      {isViewer && <div className="muted team-note">{t('team.readonlyNote')}</div>}

      <div className="settings-grid">
        {/* — بيانات المساحة — */}
        <section className="settings-card ws-card" aria-label={t('settings.wsData')}>
          <h2>{t('settings.wsData')}</h2>
          <div className="ws-name">
            <bdi>{overview?.workspaceName || '…'}</bdi>
          </div>
          <div className="muted ws-meta">
            {t('settings.myRole')}: <span className="chip">{overview ? roleLabelAr(overview.myRole) : '…'}</span>
          </div>
          <div className="muted ws-meta">
            {t('settings.myEmail')}: <bdi>{overview?.myEmail}</bdi>
          </div>
          <div className="muted settings-later">{t('settings.laterNote')}</div>
        </section>

        {/* — المجلدات: الإدارة المدمجة الوحيدة هنا — */}
        <section className="settings-card" aria-label={t('settings.folders')}>
          <h2 className="row">
            <IconFolder size={16} />
            {t('settings.folders')}
          </h2>
          <p className="muted card-desc">{t('settings.foldersDesc')}</p>
          {folders === null ? (
            <div className="muted">{t('library.loadingA11y')}</div>
          ) : (
            <ul className="settings-folders">
              {folders.map((f) => (
                <li key={f.id}>
                  <span>
                    <bdi>{f.name}</bdi>
                  </span>
                  {!isViewer && (
                    <button className="af-x" aria-label={`${t('common.delete')} — ${f.name}`} onClick={() => void removeFolder(f)}>
                      ✕
                    </button>
                  )}
                </li>
              ))}
              {folders.length === 0 && <li className="muted">{t('settings.noFolders')}</li>}
            </ul>
          )}
          {!isViewer && (
            <form className="row settings-folder-new" onSubmit={createFolder}>
              <input aria-label={t('settings.newFolder')} value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder={t('settings.newFolder')} />
              <Button size="sm" variant="ghost" type="submit">
                {t('settings.createFolder')}
              </Button>
            </form>
          )}
        </section>

        {/* — المظهر: الهوية الجديدة أو الجرافيت القديم — */}
        <section className="settings-card" aria-label={t('settings.theme')}>
          <h2>{t('settings.theme')}</h2>
          <p className="muted card-desc">{t('settings.themeDesc')}</p>
          <div className="theme-options">
            <button
              type="button"
              className={'theme-option' + (theme === 'brand' ? ' is-active' : '')}
              aria-pressed={theme === 'brand'}
              onClick={() => chooseTheme('brand')}
            >
              <b>{t('settings.themeBrand')}</b>
              <small>{t('settings.themeBrandDesc')}</small>
            </button>
            <button
              type="button"
              className={'theme-option' + (theme === 'classic' ? ' is-active' : '')}
              aria-pressed={theme === 'classic'}
              onClick={() => chooseTheme('classic')}
            >
              <b>{t('settings.themeClassic')}</b>
              <small>{t('settings.themeClassicDesc')}</small>
            </button>
          </div>
        </section>

        {/* — بطاقات المداخل — */}
        <EntryCard title={t('settings.myGuides')} desc={t('settings.myGuidesDesc')} count={counts?.mine} onOpen={() => navigate('/mine')} />
        <EntryCard title={t('settings.published')} desc={t('settings.publishedDesc')} count={counts?.published} onOpen={() => navigate('/?visibility=workspace')} />
        <EntryCard title={t('settings.saved')} desc={t('settings.savedDesc')} count={counts?.saved} onOpen={() => navigate('/saved')} />
        <EntryCard title={t('settings.team')} desc={t('settings.teamDesc')} icon={<IconUsers size={16} />} onOpen={() => navigate('/team')} />
        <EntryCard title={t('settings.reports')} desc={t('settings.reportsDesc')} onOpen={() => navigate('/mine')} />
      </div>
    </div>
  )
}

/** بطاقة مدخل — رقم اختياري وزر فتح يقود للشاشة بدل تكرار وظيفتها هنا */
function EntryCard({ title, desc, count, icon, onOpen }: { title: string; desc: string; count?: number; icon?: React.ReactNode; onOpen: () => void }) {
  return (
    <section className="settings-card entry-card" aria-label={title}>
      <h2 className="row">
        {icon}
        {title}
      </h2>
      <p className="muted card-desc">{desc}</p>
      <div className="row push-end entry-foot">
        {count !== undefined && <span className="entry-count">{arDigits(count)}</span>}
        <Button size="sm" variant="ghost" onClick={onOpen}>
          {t('settings.open')}
        </Button>
      </div>
    </section>
  )
}
