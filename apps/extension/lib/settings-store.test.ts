import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettingsStore, normalizeSettings } from './settings-store'

/**
 * زر الإعدادات (2026-09-10): تفضيلات الامتداد المحلية. أولها «طريقة البدء المفضّلة»:
 * الامتداد كان ينسى أن المستخدم يبدأ دائمًا بالتعليق الصوتي — الآن يتذكّر ويبرز زرّه.
 */

describe('normalizeSettings — القيمة الغريبة ترجع للافتراضي', () => {
  it('بلا تخزين → الافتراضي (البدء العادي كما وُلد الامتداد)', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.preferredStart).toBe('plain')
  })

  it('audio يُقبل، والغريب يعود plain', () => {
    expect(normalizeSettings({ preferredStart: 'audio' }).preferredStart).toBe('audio')
    expect(normalizeSettings({ preferredStart: 'video' }).preferredStart).toBe('plain')
    expect(normalizeSettings('x').preferredStart).toBe('plain')
  })
})

describe('createSettingsStore', () => {
  function world(seed?: unknown) {
    const store: Record<string, unknown> = seed === undefined ? {} : { [SETTINGS_KEY]: seed }
    return {
      s: createSettingsStore({
        get: async (k) => ({ [k]: store[k] }),
        set: async (o) => {
          Object.assign(store, o)
        },
      }),
      raw: () => store[SETTINGS_KEY],
    }
  }

  it('read بلا شيء مخزَّن → الافتراضي', async () => {
    expect(await world().s.read()).toEqual(DEFAULT_SETTINGS)
  })

  it('save يدمج التعديل فوق المخزَّن ويحفظه ويعيد النتيجة', async () => {
    const w = world()
    const got = await w.s.save({ preferredStart: 'audio' })
    expect(got.preferredStart).toBe('audio')
    expect(w.raw()).toEqual({ preferredStart: 'audio' })
    expect((await w.s.read()).preferredStart).toBe('audio')
  })
})
