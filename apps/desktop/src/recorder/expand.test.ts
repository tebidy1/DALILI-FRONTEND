import { describe, expect, it } from 'vitest'
import {
  PILL_SIZE,
  createExpander,
  type MonitorLike,
  type SizeWindow,
} from './expand'

/** توصية UX الموافق عليها (قرار المالك): الودجة بحالتين — حبة 320×72 وقت
 *  الخمول، ولوحة زجاجية أعلى وقت التسجيل. نقيّ: الحدود محقونة (نافذة وشاشة)
 *  والقاعدة: **الحافة العليا ثابتة**، وإن لم تتّسع تحت انزاحت للأعلى كي لا
 *  يخرج نصف اللوحة عن الشاشة. الانكماش يحافظ على الحافة العليا الحالية —
 *  ما تُتحرّكه الودجة أثناء التسجيل يبقى موضعها بعد الانكماش (لا مفاجآت). */

function fakeWin(start = { x: 100, y: 500 }) {
  const calls: Array<{ op: 'size' | 'pos'; a: number; b: number }> = []
  let pos = { ...start }
  let size = { ...PILL_SIZE }
  const win: SizeWindow = {
    async outerPosition() {
      return { ...pos }
    },
    async setSize(s) {
      calls.push({ op: 'size', a: s.width, b: s.height })
      size = { ...s }
    },
    async setPosition(p) {
      calls.push({ op: 'pos', a: p.x, b: p.y })
      pos = { ...p }
    },
  }
  return {
    win,
    calls,
    get pos() {
      return pos
    },
    get size() {
      return size
    },
  }
}

const monitor = (h: number, sf = 1, y = 0): MonitorLike => ({
  position: { x: 0, y },
  size: { width: 1920, height: h },
  scaleFactor: sf,
})

describe('توسعة/انكماش الودجة بحالتين — نقيّ بحدود محقونة', () => {
  it('(أ) توسعة في وسط الشاشة: الحجم 320×400 والحافة العليا ثابتة بلا تحريك', async () => {
    const f = fakeWin({ x: 100, y: 300 })
    const ex = createExpander(f.win, async () => monitor(1080))
    await ex.expandTo(400)
    expect(f.size).toEqual({ width: 320, height: 400 })
    expect(f.pos).toEqual({ x: 100, y: 300 }) // تتّسع تحت — لا انزياح
    expect(f.calls).toHaveLength(1) // لا setPosition أصلًا
  })

  it('(ب) توسعة قرب أسفل الشاشة: تنزاح للأعلى كي لا تخرج عن الشاشة (بهامش المهام)', async () => {
    const f = fakeWin({ x: 100, y: 1000 })
    const ex = createExpander(f.win, async () => monitor(1080))
    await ex.expandTo(400)
    expect(f.size).toEqual({ width: 320, height: 400 })
    // 1080 − 56 (هامش شريط المهام) − 400 = 624
    expect(f.pos).toEqual({ x: 100, y: 624 })
  })

  it('(ج) الانكماش: حجم الحبة فقط — الحافة العليا الحالية تبقى (لا قفز موضع)', async () => {
    const f = fakeWin({ x: 100, y: 624 })
    const ex = createExpander(f.win, async () => monitor(1080))
    await ex.expandTo(400)
    f.calls.length = 0
    await ex.collapse()
    expect(f.size).toEqual({ width: 320, height: 72 })
    expect(f.calls).toHaveLength(1)
    expect(f.pos).toEqual({ x: 100, y: 624 })
  })

  it('(د) بلا معلومات شاشة: توسعة بالحجم وحدها بلا انزياح ولا فشل', async () => {
    const f = fakeWin({ x: 100, y: 2000 })
    const ex = createExpander(f.win, async () => null)
    await ex.expandTo(400)
    expect(f.size).toEqual({ width: 320, height: 400 })
    expect(f.pos).toEqual({ x: 100, y: 2000 })
  })

  it('(هـ) DPI ‏1.5: الانزياح يُحسب بالفيزيائي (ارتفاع 400 منطقيّ = 600 فيزيائيّ)', async () => {
    const f = fakeWin({ x: 0, y: 2600 })
    const ex = createExpander(f.win, async () => monitor(3000, 1.5))
    await ex.expandTo(400)
    // 3000 − 56 − 600 = 2344
    expect(f.pos).toEqual({ x: 0, y: 2344 })
  })

  it('(و) فشل النافذة لا يرمي — يعيد false كي يُدِرّه المستدعي، والنجاح يعيد true', async () => {
    let broken = true
    const calls: string[] = []
    const win: SizeWindow = {
      async outerPosition() {
        return { x: 0, y: 0 }
      },
      async setSize(s) {
        if (broken) throw new Error('denied')
        calls.push(`size ${s.height}`)
      },
      async setPosition() {
        calls.push('pos')
      },
    }
    const ex = createExpander(win, async () => monitor(1080))
    // العقد: الفشل **قيمة** يفحصها المستدعي (فيلغي جلسةً بدأت) — لا استثناء يضيع ولا صمت يعلّق
    await expect(ex.expandTo(400)).resolves.toBe(false)
    broken = false
    await expect(ex.expandTo(400)).resolves.toBe(true)
    expect(calls).toEqual(['size 400'])
    await expect(ex.collapse()).resolves.toBe(true)
  })
})
