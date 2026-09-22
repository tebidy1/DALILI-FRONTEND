/**
 * زر الإعدادات (2026-09-10): تفضيلات الامتداد المحلية في chrome.storage.local.
 * الثيم له مفتاحه المستقل (theme-choice) لأنه يُزامَن مع الخادم — هنا ما هو محلي فقط.
 */

export const SETTINGS_KEY = 'dalili:settings'

/** طريقة البدء المفضّلة — تقود أيّ زرّي البدء يكون الأساسي على شاشة الخمول */
export type PreferredStart = 'plain' | 'audio'

export interface AppSettings {
  preferredStart: PreferredStart
}

/** الامتداد وُلد بالبدء العادي — الغريب والناقص يعودان إليه */
export const DEFAULT_SETTINGS: AppSettings = { preferredStart: 'plain' }

export function normalizeSettings(v: unknown): AppSettings {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  return { preferredStart: o.preferredStart === 'audio' ? 'audio' : 'plain' }
}

export interface SettingsDeps {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (obj: Record<string, unknown>) => Promise<void>
}

export function createSettingsStore(deps: SettingsDeps) {
  async function read(): Promise<AppSettings> {
    return normalizeSettings((await deps.get(SETTINGS_KEY))[SETTINGS_KEY])
  }

  async function save(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = normalizeSettings({ ...(await read()), ...patch })
    await deps.set({ [SETTINGS_KEY]: next })
    return next
  }

  return { read, save }
}
