import { useState } from 'react'
import type { GuideSummaryDto, ListGuidesDto } from '@dalili/shared'
import { client, webShareUrl } from '../api'
import { t } from '../i18n'
import { copyToClipboard } from '../lib/format'
import { emptySelection, type Selection } from '../lib/selection'
import { useConfirm } from '../components/ConfirmProvider'
import type { HomeScreen } from './screen'

/**
 * كل إجراءات أدلة الهوم في خطاف واحد — إجراء الفردي (حذف/استعادة/بوكمارك/تكرار/
 * نقل/نشر/مشاركة) والإجراء الجماعي الثلاثي. يملك حالتي «تأكيد الحذف» و«انشغال
 * الجماعي» لأنهما لا تُستعملان إلا هنا. القاعدة الثابتة: أي فعل تُعقبه لافتة لا
 * يعيد جلب القائمة (يمسحها لحظة ظهورها) — تحديث الصف موضعيًا.
 */

interface GuideActionsDeps {
  screen: HomeScreen
  inTrash: boolean
  data: ListGuidesDto | null
  sel: Selection
  navigate: (to: string) => void
  setData: React.Dispatch<React.SetStateAction<ListGuidesDto | null>>
  setNotice: React.Dispatch<React.SetStateAction<string>>
  setError: React.Dispatch<React.SetStateAction<string>>
  setSel: React.Dispatch<React.SetStateAction<Selection>>
  bumpReload: () => void
  reloadOverview: () => void
  refreshFolders: () => Promise<void>
}

export function useGuideActions(d: GuideActionsDeps) {
  const confirm = useConfirm()
  const [bulkBusy, setBulkBusy] = useState(false)
  const [creating, setCreating] = useState(false)

  /** «دليل جديد» — ينشئ ويفتح المحرر؛ الفشل يرجع الزر ويعرض رسالة صادقة */
  async function newGuide() {
    setCreating(true)
    try {
      const { createAndOpenGuide } = await import('../lib/newGuide')
      const id = await createAndOpenGuide()
      d.reloadOverview()
      d.navigate(`/g/${id}`)
    } catch {
      d.setError(t('library.createError'))
      setCreating(false)
    }
  }

  /** BKL-01: «كرّاسة» — نفس مسار الإنشاء والنوع وحده يفرّق */
  async function newBooklet() {
    setCreating(true)
    try {
      const { createAndOpenBooklet } = await import('../lib/newGuide')
      const id = await createAndOpenBooklet()
      d.reloadOverview()
      d.navigate(`/g/${id}`)
    } catch {
      d.setError(t('library.createError'))
      setCreating(false)
    }
  }

  /**
   * القاعدة الموحدة (المرحلة ١): النقل الناعم للسلة نقرة واحدة + لافتة (فهو
   * مستدَدّ بـ30 يومًا)، والحذف النهائي من السلة نافذة التأكيد الموحدة.
   */
  async function remove(g: GuideSummaryDto) {
    if (d.inTrash) {
      const ok = await confirm({ title: t('library.deleteForever'), body: t('library.confirmDeleteForever'), danger: true })
      if (!ok) return
    }
    try {
      await client.deleteGuide(g.id, { permanent: d.inTrash })
      d.setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== g.id), total: prev.total - 1 } : prev))
      d.reloadOverview()
      if (!d.inTrash) d.setNotice(t('library.trashMoved'))
    } catch {
      d.setError(t('library.deleteError'))
    }
  }

  async function restore(g: GuideSummaryDto) {
    try {
      await client.restoreGuide(g.id)
      d.setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== g.id), total: prev.total - 1 } : prev))
      d.setNotice(t('library.restored'))
      d.reloadOverview()
      await d.refreshFolders().catch(() => {})
    } catch {
      d.setError(t('library.restoreError'))
    }
  }

  async function toggleBookmark(g: GuideSummaryDto) {
    try {
      const res = await client.toggleBookmark(g.id)
      d.setData((prev) =>
        prev
          ? {
              ...prev,
              // في المحفوظات يختفي ما أُزيل تعليمه فورًا، وفي غيره تتحدّث البطاقة
              items:
                d.screen === 'saved' && !res.bookmarked
                  ? prev.items.filter((x) => x.id !== g.id)
                  : prev.items.map((x) => (x.id === g.id ? { ...x, bookmarked: res.bookmarked } : x)),
            }
          : prev,
      )
      d.reloadOverview()
    } catch {
      d.setError(t('home.bookmarkError'))
    }
  }

  async function duplicate(g: GuideSummaryDto) {
    try {
      await client.duplicateGuide(g.id)
      d.setNotice(t('library.duplicated'))
      d.bumpReload()
      d.reloadOverview()
    } catch {
      d.setError(t('library.duplicateError'))
    }
  }

  async function moveTo(g: GuideSummaryDto, folderId: string | null) {
    try {
      const fresh = await client.updateGuideMeta(g.id, { folderId })
      d.setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === g.id ? { ...x, ...fresh } : x)) } : prev))
      await d.refreshFolders().catch(() => {})
    } catch {
      d.setError(t('library.folderError'))
    }
  }

  /** المرحلة ج: نشر للمساحة/إرجاع خاص من البطاقة — الشارة تقلب من جواب الخادم،
   *  والتقرير المجمّع يُعاد جلبه وإلا بقيت «منشورة للمساحة» قديمة (علة اللقطة الحية) */
  async function toggleVisibility(g: GuideSummaryDto) {
    try {
      const fresh = await client.updateGuideMeta(g.id, {
        visibility: g.visibility === 'private' ? 'workspace' : 'private',
      })
      d.setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === g.id ? { ...x, ...fresh } : x)) } : prev))
      d.bumpReload()
      d.reloadOverview()
    } catch {
      d.setError(t('home.publishError'))
    }
  }

  /** المرحلة ج: مشاركة سريعة — رابط قائم يُنسخ، وإلا وُلِّد ثم نُسخ. البطاقة تُحدَّث موضعيًا
   *  (لا إعادة جلب تمسح اللافتة لحظة ظهورها)، وحين يمنع المتصفح النسخ يظهر الرابط نفسه بصدق.
   *  قرار المالك 2026-09-11: مشاركة الدليل الخاص = رابط سري — يبقى خاصًا خارج بحث المساحة. */
  async function shareCopy(g: GuideSummaryDto) {
    try {
      let url = g.shared && g.shareUrl ? g.shareUrl : null
      if (!url) {
        url = (await client.createShare(g.id)).shareUrl
        d.setData((prev) =>
          prev ? { ...prev, items: prev.items.map((x) => (x.id === g.id ? { ...x, shared: true, shareUrl: url! } : x)) } : prev,
        )
      }
      const full = webShareUrl(url)
      if (await copyToClipboard(full))
        d.setNotice(g.visibility === 'private' ? t('home.shareSecretCopied') : t('home.shareCopied'))
      else d.setNotice(t('home.shareManual', { url: full }))
    } catch {
      d.setError(t('home.shareError'))
    }
  }

  async function bulkDelete() {
    if (!d.data || d.sel.ids.length === 0 || bulkBusy) return
    const n = d.sel.ids.length
    if (d.inTrash) {
      const ok = await confirm({
        title: t('library.deleteForever'),
        body: t('library.bulkDeleteForeverConfirm', { count: n }),
        danger: true,
      })
      if (!ok) return
    }
    setBulkBusy(true)
    try {
      for (const id of d.sel.ids) await client.deleteGuide(id, { permanent: d.inTrash })
      const gone = new Set(d.sel.ids)
      d.setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => !gone.has(x.id)), total: Math.max(0, prev.total - gone.size) } : prev))
      d.setNotice(d.inTrash ? t('library.bulkDeletedForever', { count: n }) : t('library.bulkDeleted', { count: n }))
      d.setSel(emptySelection())
      d.reloadOverview()
    } catch {
      d.setError(t('library.bulkError'))
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkMove(folderId: string | null) {
    if (d.sel.ids.length === 0 || bulkBusy) return
    const n = d.sel.ids.length
    setBulkBusy(true)
    try {
      for (const id of d.sel.ids) await client.updateGuideMeta(id, { folderId })
      d.setNotice(t('library.bulkMoved', { count: n }))
      d.setSel(emptySelection())
      d.bumpReload()
      await d.refreshFolders().catch(() => {})
    } catch {
      d.setError(t('library.bulkError'))
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkShare() {
    if (!d.data || d.sel.ids.length === 0 || bulkBusy) return
    // قرار المالك 2026-09-10: الرابط للمنشور وحده — والصمت عند زر مُضغوط عطَل لا رأي
    const targets = d.data.items.filter((g) => d.sel.ids.includes(g.id) && !g.shared && g.visibility === 'workspace')
    if (targets.length === 0) {
      d.setNotice(t('library.bulkShareNone'))
      return
    }
    setBulkBusy(true)
    try {
      for (const g of targets) await client.createShare(g.id)
      d.setNotice(t('library.bulkShared', { count: targets.length }))
      d.setSel(emptySelection())
      d.bumpReload()
    } catch {
      d.setError(t('library.bulkError'))
    } finally {
      setBulkBusy(false)
    }
  }

  return {
    bulkBusy,
    creating,
    newGuide,
    newBooklet,
    remove,
    restore,
    toggleBookmark,
    duplicate,
    moveTo,
    toggleVisibility,
    shareCopy,
    bulkDelete,
    bulkMove,
    bulkShare,
  }
}
