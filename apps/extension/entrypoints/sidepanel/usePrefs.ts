import { useEffect, useState } from 'react'
import type { DaliliClient, MeDto } from '@dalili/shared'
import { createActivity, EVENTS_KEY, unreadCount, type ActivityEvent } from '@/lib/activity'
import { createSettingsStore, DEFAULT_SETTINGS, SETTINGS_KEY, type AppSettings, type PreferredStart } from '@/lib/settings-store'
import { THEME_STORAGE_KEY, normalizeChoice, type ThemeTokensChoice } from '@/lib/theme-choice'
import { injectTheme } from '@/lib/theme-apply'

/**
 * زرّا الترويسة (2026-09-10): حالة الإعدادات المحلية وسجل الانتباه والثيم في خطّاف
 * واحد — تُقرأ مرة ثم تتبع تغيّرات chrome.storage (الخلفية تدفع أحداثًا أثناء الجلسة).
 * مقتطع من App.tsx لقانون الحجم.
 */

const storageDeps = {
  get: (k: string) => chrome.storage.local.get(k) as Promise<Record<string, unknown>>,
  set: (o: Record<string, unknown>) => chrome.storage.local.set(o),
}
const activity = createActivity(storageDeps)
const settingsStore = createSettingsStore(storageDeps)

/** يُصدَّر للوحة كي تسجّل أحداثها هي (فشل نشر مسودة، فشل تفريغ) بنفس السجل */
export const panelActivity = activity

export function usePrefs(me: MeDto | null, client: Pick<DaliliClient, 'setMyTheme'>) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [theme, setTheme] = useState<ThemeTokensChoice>('classic')

  useEffect(() => {
    let live = true
    void settingsStore.read().then((s) => live && setSettings(s))
    void activity.list().then((evs) => live && setEvents(evs))
    void chrome.storage.local.get(THEME_STORAGE_KEY).then((got) => live && setTheme(normalizeChoice(got[THEME_STORAGE_KEY])))
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      if (EVENTS_KEY in changes) void activity.list().then((evs) => live && setEvents(evs))
      if (SETTINGS_KEY in changes) void settingsStore.read().then((s) => live && setSettings(s))
      if (THEME_STORAGE_KEY in changes) setTheme(normalizeChoice(changes[THEME_STORAGE_KEY]?.newValue))
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      live = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  function onPreferredStart(v: PreferredStart) {
    setSettings((s) => ({ ...s, preferredStart: v }))
    void settingsStore.save({ preferredStart: v }).catch(() => {})
  }

  // المظهر: حقن فوري + كاش محلي، وإن كان مسجّلًا فالخادم هو الحقيقة التي يتبعها الموقع أيضًا
  function onTheme(v: ThemeTokensChoice) {
    setTheme(v)
    injectTheme(v)
    void chrome.storage.local.set({ [THEME_STORAGE_KEY]: v }).catch(() => {})
    if (me) void client.setMyTheme(v).catch(() => {})
  }

  /** فتح الجرس: يعيد من كان جديدًا لحظتها (نقطة بجانبه) ثم يقرأ الكل فتُطفأ الشارة */
  async function readAll(): Promise<ReadonlySet<string>> {
    const fresh = new Set(events.filter((e) => !e.read).map((e) => e.id))
    const read = await activity.markAllRead().catch(() => null)
    if (read) setEvents(read)
    return fresh
  }

  return { settings, events, theme, unread: unreadCount(events), onPreferredStart, onTheme, readAll }
}
