// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { SPLASH_ID, SPLASH_MIN_MS, SPLASH_FADE_MS, splashRemainingMs, dismissSplash } from './splash'

function mount() {
  document.body.innerHTML = `<div id="${SPLASH_ID}"></div><div id="root"></div>`
  return document.getElementById(SPLASH_ID)!
}

describe('شاشة الإقلاع', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('تبقى بقية الحد الأدنى إذا أقلع التطبيق أسرع من الرسمة', () => {
    expect(splashRemainingMs(0)).toBe(SPLASH_MIN_MS)
    expect(splashRemainingMs(300)).toBe(SPLASH_MIN_MS - 300)
  })

  it('لا تؤخّر شيئًا إذا استغرق الإقلاع أطول من الحد الأدنى — صفر لا سالب', () => {
    expect(splashRemainingMs(SPLASH_MIN_MS)).toBe(0)
    expect(splashRemainingMs(5000)).toBe(0)
  })

  it('الإخفاء يمرّ بحالة التلاشي أولًا ثم يُزال العنصر — لا قطع مفاجئ', async () => {
    const el = mount()
    const done = dismissSplash(document, 9999)
    await Promise.resolve() // الحدّ الأدنى انقضى، فالتلاشي يبدأ في أول دورة دقيقة
    expect(el.classList.contains('is-out')).toBe(true)
    expect(document.getElementById(SPLASH_ID)).not.toBeNull() // التلاشي أولًا، والإزالة بعده
    await done
    expect(document.getElementById(SPLASH_ID)).toBeNull()
  })

  it('ينتظر بقيّة الحد الأدنى قبل أن يبدأ التلاشي', async () => {
    const el = mount()
    const done = dismissSplash(document, 0)
    expect(el.classList.contains('is-out')).toBe(false) // ما زالت الرسمة تُكمل نفسها
    await done
    expect(document.getElementById(SPLASH_ID)).toBeNull()
  })

  it('لا ينكسر إذا لم توجد شاشة إقلاع أصلًا', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await expect(dismissSplash(document, 9999)).resolves.toBeUndefined()
  })

  it('مدّة التلاشي معلومة ومحدودة كي لا تُشعر بالبطء', () => {
    expect(SPLASH_FADE_MS).toBeGreaterThan(0)
    expect(SPLASH_FADE_MS).toBeLessThanOrEqual(400)
  })
})
