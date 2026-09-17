import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// بوّابة قشرة الودجة العائمة (٣هـ-١): قيم النافذة مثبّتة في الإعداد —
// انعكاس أيّ قيمة منها يكسر الودجة (تسقط من الطفو أو تظهر بالإطار
// أو تعود لمكتب المهام فتراها لقطات المستخدم نافذةً عاديّة)
const here = fileURLToPath(new URL('.', import.meta.url))

describe('قشرة الودجة العائمة (٣هـ-١)', () => {
  const conf = JSON.parse(
    readFileSync(join(here, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'),
  ) as {
    app: { windows: Array<Record<string, unknown>> }
  }
  const win = conf.app.windows[0]!

  it('النافذة الوحيدة ودجة: بلا إطار، عائمة دائمًا، غير قابلة للتحجيم، خارج مكتب المهام', () => {
    expect(conf.app.windows).toHaveLength(1)
    expect(win.decorations).toBe(false)
    expect(win.alwaysOnTop).toBe(true)
    expect(win.resizable).toBe(false)
    expect(win.skipTaskbar).toBe(true)
    expect(win.fullscreen).toBe(false)
  })

  it('أبعاد الودجة الصغيرة 320×72', () => {
    expect(win.width).toBe(320)
    expect(win.height).toBe(72)
  })

  it('منطقة السحب data-tauri-drag-region على جذر القشرة', () => {
    const html = readFileSync(join(here, '..', 'index.html'), 'utf8')
    expect(html).toContain('data-tauri-drag-region')
  })
})
