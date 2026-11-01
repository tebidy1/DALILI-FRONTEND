import { useCallback, useEffect, useState } from 'react'
import { urlTokens } from '@dalili/core'
import type { DaliliClient, GuideSummaryDto, MeDto, WorkspaceDto } from '@dalili/shared'
import { blockedOf } from '@/lib/accounts'
import { hostOf } from '@/lib/discover'
import { t } from '@/lib/i18n'
import type { DiscoverState } from './ListStates'

/**
 * ت (§٣.٥): كل ما تعرضه شاشة البدء من الخادم — الحسابات والتبديل، وأدلة التبويب النشط
 * (SRCH-04: أحداث تفعيل/تحديث التبويب بلا دوران)، والأدلة الأخيرة. التبديل وإعادة المحاولة
 * يرفعان نسخة واحدة تعيد الجلب كله. الحساب الموقوف لا يُطلب له شيء: الخادم يرفضه أصلاً.
 */

export type LibraryApi = Pick<DaliliClient, 'listMyWorkspaces' | 'switchWorkspace' | 'discover' | 'listGuides'>

export function useLibrary(me: MeDto | null, api: LibraryApi) {
  const [accounts, setAccounts] = useState<WorkspaceDto[]>([])
  const [version, setVersion] = useState(0)
  const [discover, setDiscover] = useState<DiscoverState>({ status: 'off' })
  const [recent, setRecent] = useState<GuideSummaryDto[]>([])
  const [recentErr, setRecentErr] = useState('')
  const [accountsReady, setAccountsReady] = useState(false)
  const blocked = blockedOf(accounts)

  useEffect(() => {
    if (!me) return
    const ac = new AbortController()
    api.listMyWorkspaces(ac.signal)
      .then((list) => !ac.signal.aborted && setAccounts(list))
      .catch(() => {})
      .finally(() => !ac.signal.aborted && setAccountsReady(true))
    return () => ac.abort()
  }, [me, api, version])

  const live = !!me && accountsReady && !blocked

  useEffect(() => {
    if (!live) return
    let alive = true
    setRecentErr('')
    api.listGuides({ limit: 8, sort: 'updated', order: 'desc' })
      .then((r) => alive && setRecent(r.items))
      .catch(() => alive && setRecentErr(t('ext.recentError')))
    return () => {
      alive = false
    }
  }, [live, api, version])

  useEffect(() => {
    if (!live) {
      setDiscover({ status: 'off' })
      return
    }
    let alive = true
    let ac = new AbortController()
    async function refresh(tab: chrome.tabs.Tab | undefined) {
      const host = tab?.url ? hostOf(tab.url) : null
      if (!host || !tab?.url) {
        if (alive) setDiscover({ status: 'off' })
        return
      }
      ac.abort()
      ac = new AbortController()
      const signal = ac.signal
      setDiscover((d) => (d.status === 'ready' ? d : { status: 'loading' }))
      try {
        // SRCH-04 تطوّر: رموز الشاشة الحالية (مُجزّئ core نفسه المستعمل في الفهرس)
        const data = await api.discover(host, urlTokens(tab.url).screen.join(' '), signal)
        if (alive && !signal.aborted) setDiscover({ status: 'ready', data })
      } catch {
        if (alive && !signal.aborted) setDiscover({ status: 'error' })
      }
    }
    const queryActive = () => {
      chrome.tabs.query({ active: true, currentWindow: true }).then((ts) => refresh(ts[0])).catch(() => {})
    }
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (info.url || info.status === 'complete')) refresh(tab).catch(() => {})
    }
    setDiscover({ status: 'loading' })
    queryActive()
    chrome.tabs.onActivated.addListener(queryActive)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      alive = false
      ac.abort()
      chrome.tabs.onActivated.removeListener(queryActive)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [live, api, version])

  const retry = useCallback(() => setVersion((v) => v + 1), [])

  // وضع البحث: المكتبة كاملة مرة واحدة ثم التصفية محليًا (lib/search). الهوية تتجدد مع
  // كل تبديل حساب (version)، فيعيد البحث المفتوح الجلب من الحساب الجديد.
  const searchAll = useCallback(
    (signal?: AbortSignal) => api.listGuides({ limit: 100, sort: 'updated', order: 'desc' }, signal).then((r) => r.items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, version],
  )

  const switchTo = useCallback(
    async (id: string) => {
      await api.switchWorkspace(id)
      setRecent([])
      setVersion((v) => v + 1)
    },
    [api],
  )

  return { accounts, blocked, switchTo, discover, recent, recentErr, retry, searchAll }
}
