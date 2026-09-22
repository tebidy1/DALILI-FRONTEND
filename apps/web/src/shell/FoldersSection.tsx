import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FolderDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { IconPlus } from '../ui/icons'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { patchParams } from '../lib/params'
import { useOverview } from './OverviewContext'
import { useConfirm } from '../components/ConfirmProvider'

/**
 * قسم «المجلدات» في الشريط الجانبي — نمط Team Directory المرفق (طلب المالك
 * 2026-09-03): رأس القسم بزر «+» للإنشاء، وبنود بشارة حرف واسم وعدد الأدلة،
 * وحقل بحث يرشّح محليًا مع «لا نتائج». الإدارة لغير المشاهد، والاختيار يرشّح
 * الرئيسية عبر معامل الرابط.
 */
export function FoldersSection({ isViewer }: { isViewer: boolean }) {
  const { reload } = useOverview()
  const confirm = useConfirm()
  const [sp, setSp] = useSearchParams()
  const folder = sp.get('folder')

  const [folders, setFolders] = useState<FolderDto[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [folderBusy, setFolderBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderQuery, setFolderQuery] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    client
      .listFolders(ac.signal)
      .then(setFolders)
      .catch(() => setFolders([]))
    return () => ac.abort()
  }, [])

  async function refreshFolders() {
    setFolders(await client.listFolders().catch(() => []))
    reload()
  }

  async function createFolderNow() {
    const name = newFolder.trim()
    if (!name || folderBusy) return
    setFolderBusy(true)
    try {
      await client.createFolder(name)
      setNewFolder('')
      setCreatingFolder(false)
      setNotice(t('library.folderCreated'))
      await refreshFolders()
    } catch {
      setError(t('library.folderError'))
    } finally {
      setFolderBusy(false)
    }
  }

  async function deleteFolderNow(f: FolderDto) {
    if (!(await confirm({ title: t('library.folderDelete'), body: t('library.folderDeleteNote'), danger: true }))) return
    try {
      await client.deleteFolder(f.id)
      if (folder === f.id) setSp(patchParams(sp, { folder: null }))
      await refreshFolders()
    } catch {
      setError(t('library.folderError'))
    }
  }

  async function renameFolderNow() {
    if (!renaming || renameBusy) return
    const name = renaming.value.trim()
    if (!name) return
    setRenameBusy(true)
    try {
      await client.renameFolder(renaming.id, name)
      setRenaming(null)
      setNotice(t('library.folderRenamed'))
      await refreshFolders()
    } catch {
      setError(t('library.folderError'))
    } finally {
      setRenameBusy(false)
    }
  }

  const visibleFolders = (folders ?? []).filter((f) => f.name.includes(folderQuery.trim()))

  return (
    <>
      {error && <div className="err" role="alert">{error}</div>}
      {notice && <div className="ok-note" role="status">{notice}</div>}

      <div className="side-sec-row">
        <span className="side-sec">{t('home.navFolders')}</span>
        {!isViewer && (
          <button
            className="side-add"
            aria-label={t('library.addFolder')}
            title={t('library.addFolder')}
            onClick={() => setCreatingFolder(true)}
          >
            <IconPlus size={14} />
          </button>
        )}
      </div>
      {!isViewer && creatingFolder && (
        <div className="folder-new">
          <input
            type="text"
            className="folder-input"
            aria-label={t('library.newFolder')}
            placeholder={t('library.newFolder')}
            value={newFolder}
            autoFocus
            maxLength={60}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void createFolderNow()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setCreatingFolder(false)
                setNewFolder('')
              }
            }}
          />
          <Button size="sm" variant="ghost" onClick={createFolderNow} busy={folderBusy}>
            {t('library.folderCreate')}
          </Button>
        </div>
      )}
      <input
        type="search"
        className="side-folder-search"
        aria-label={t('library.searchFolders')}
        placeholder={t('library.searchFolders')}
        value={folderQuery}
        maxLength={60}
        onChange={(e) => setFolderQuery(e.target.value)}
      />
      <div className="side-folder-list">
        {visibleFolders.map((f) => (
          <div key={f.id} className="side-folder">
            {renaming?.id === f.id ? (
              <div className="row">
                <input
                  type="text"
                  className="folder-input"
                  aria-label={t('library.folderRenamePrompt')}
                  value={renaming.value}
                  autoFocus
                  maxLength={60}
                  onChange={(e) => setRenaming({ id: f.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void renameFolderNow()
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                />
                <Button size="sm" variant="ghost" onClick={renameFolderNow} busy={renameBusy}>
                  {t('library.folderRenameSave')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  {t('library.folderRenameCancel')}
                </Button>
              </div>
            ) : (
              <>
                <button
                  className={`side-item${folder === f.id ? ' sel' : ''}`}
                  aria-pressed={folder === f.id}
                  onClick={() =>
                    setSp(patchParams(sp, { folder: folder === f.id ? null : f.id }))
                  }
                >
                  <span className="folder-chip" aria-hidden="true">{f.name.charAt(0)}</span>
                  <span className="side-item-label">{f.name}</span>
                  <span className="count">{arDigits(f.count)}</span>
                </button>
                {!isViewer && (
                  <span className="side-folder-ops">
                    <button
                      className="folder-ren"
                      aria-label={`${t('library.folderRename')}: ${f.name}`}
                      title={t('library.folderRename')}
                      onClick={() => setRenaming({ id: f.id, value: f.name })}
                    >
                      ✎
                    </button>
                    <button
                      className="folder-del"
                      aria-label={`${t('library.folderDelete')}: ${f.name}`}
                      title={t('library.folderDelete')}
                      onClick={() => deleteFolderNow(f)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </>
            )}
          </div>
        ))}
        {(folders ?? []).length === 0 && <div className="side-empty">{t('settings.noFolders')}</div>}
        {(folders ?? []).length > 0 && visibleFolders.length === 0 && (
          <div className="side-empty">{t('library.noFolderResults')}</div>
        )}
      </div>
    </>
  )
}
