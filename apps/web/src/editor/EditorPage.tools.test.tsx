import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { INK_COLORS } from '@dalili/core'
import type { GuideDetailsDto } from '@dalili/shared'
import { t } from '../i18n'
import { PEN_DRAW_TOOLS } from './tools'
import { EditorPage } from './EditorPage'

/*
 * إعادة بناء تجربة المحرر (طلب المالك 2026-08-31):
 * - زر «تعديل/تم» في الشريط العلوي بعد «المكتبة» لا في العمود.
 * - العمود كشف تدريجي: العرض = المنظار وحده؛ التعديل = قص/طمس/ريشة؛
 *   الريشة تكشف أشكال الرسم + الألوان + تحريك الهدف دون أن تتحرّك الثلاثة.
 */

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    transcribeGuide: vi.fn(),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

/** ثلاث خطوات كلها بلقطات — الجوهر: أداة واحدة تسري على الثلاث */
function fixture3(): GuideDetailsDto {
  return {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل الفواتير',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps: [1, 2, 3].map((n) => ({
        id: `s${n}`,
        kind: 'click' as const,
        title: `خطوة رقم ${n}`,
        target: {},
        sensitive: false,
        url: 'https://erp.example.com/i',
        pageTitle: 'الفواتير',
        ts: n * 1000,
        screenshot: { fileId: `f${n}`, blurRects: [] },
      })),
    },
    share: null,
    meta: { starred: false, folderId: null, tags: [] },
  }
}

async function load3() {
  const { client } = await import('../api')
  vi.mocked(client.getGuide).mockResolvedValue(fixture3())
  render(
    <MemoryRouter initialEntries={['/g/g1']}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText('دليل الفواتير')
}

/** يدخل وضع التعديل من زر الشريط العلوي */
function enterEdit() {
  fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
}

/** يفتح كشف أدوات الريشة (أشكال الرسم + الألوان + تحريك الهدف) */
function openPen() {
  fireEvent.click(screen.getByRole('button', { name: t('editor.penGroup') }))
}

const rail = () => document.querySelector('.tool-rail') as HTMLElement
const bar = () => document.querySelector('.editor-bar') as HTMLElement

describe('S1: الأداة عالمية — تُختار مرة فتسري على كل اللقطات', () => {
  it('اختيار «طمس» من العمود يضع كل بطاقات الدليل في وضع الطمس دفعة واحدة', async () => {
    await load3()
    enterEdit()
    expect(document.querySelectorAll('.shot.drawing')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: t('editor.blurRegion') }))

    expect(document.querySelectorAll('.shot.drawing')).toHaveLength(3)
  })

  it('التبديل إلى «قص» يبدّل كل اللقطات معًا، والنقر ثانيةً على الأداة نفسها يطفئها', async () => {
    await load3()
    enterEdit()
    fireEvent.click(screen.getByRole('button', { name: t('editor.cropImage') }))
    expect(document.querySelectorAll('.shot.drawing')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: t('editor.cropImage') }))
    expect(document.querySelectorAll('.shot.drawing')).toHaveLength(0)
  })

  it('الخروج من وضع التعديل يصفّر الأداة — لا أداة عالقة عبر الوضعين', async () => {
    await load3()
    enterEdit()
    fireEvent.click(screen.getByRole('button', { name: t('editor.blurRegion') }))
    expect(document.querySelectorAll('.shot.drawing')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    enterEdit()
    expect(document.querySelectorAll('.shot.drawing')).toHaveLength(0)
    expect(
      screen.getByRole('button', { name: t('editor.blurRegion') }).getAttribute('aria-pressed'),
    ).toBe('false')
  })
})

describe('S2: زر التعديل انتقل إلى الشريط العلوي بعد زر العودة للرئيسية', () => {
  it('الشريط العلوي يحمل زر التعديل، والعمود بلا زر تعديل', async () => {
    await load3()
    const edit = screen.getByRole('button', { name: t('editor.edit') })
    expect(bar().contains(edit)).toBe(true)
    expect(rail().contains(edit)).toBe(false)
  })

  it('«مساحتي الرئيسية» بسهم الرجوع محل «الإعداد» — تنقل إلى الرئيسية (طلب المالك 2026-09-03)', async () => {
    await load3()
    enterEdit()
    const text = bar().textContent ?? ''
    expect(text).toContain(t('editor.myHome'))
    expect(text).not.toContain(t('settings.title'))
    expect(text).toContain(t('editor.shareOpen'))
    // زر عودة: رابط إلى الرئيسية تحمله أيقونة السهم
    const back = screen.getByRole('link', { name: t('editor.myHome') })
    expect(bar().contains(back)).toBe(true)
    expect(back.getAttribute('href')).toBe('/')
  })
})

describe('العمود — كشف تدريجي: المنظار وحده ثم قص/طمس/ريشة ثم البقية', () => {
  it('وضع العرض: العمود أزرار المنظار الثلاثة فقط — لا أدوات تحرير', async () => {
    await load3()
    expect(screen.queryByRole('button', { name: t('editor.blurRegion') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('editor.cropImage') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('editor.penGroup') })).toBeNull()
    expect(rail().querySelectorAll('button')).toHaveLength(3) // تكبير/تصغير/ملاءمة
  })

  it('عند «تعديل»: تظهر قص/طمس/ريشة فقط — لا أشكال ولا ألوان ولا تحريك هدف بعد', async () => {
    await load3()
    enterEdit()
    expect(screen.getByRole('button', { name: t('editor.cropImage') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('editor.blurRegion') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('editor.penGroup') })).toBeTruthy()
    // أدوات الريشة مخفيّة حتى تُفتح الريشة
    expect(screen.queryByRole('button', { name: t('editor.annToolRect') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('editor.moveTarget') })).toBeNull()
    expect(document.querySelectorAll('.tool-rail .swatch')).toHaveLength(0)
  })

  it('عند «الريشة»: تنكشف الأشكال والألوان وتحريك الهدف، والثلاثة تبقى في مكانها', async () => {
    await load3()
    enterEdit()
    openPen()
    for (const key of [
      'editor.annToolRect',
      'editor.annToolEllipse',
      'editor.annToolOval',
      'editor.annToolArrow',
      'editor.annToolCurvedArrow',
      // «الترقيم» لم يعد أداة ريشة — صار مبدّل «إظهار الأرقام» في قائمة «المزيد»
      'editor.moveTarget',
    ] as const) {
      expect(screen.getByRole('button', { name: t(key) })).toBeTruthy()
    }
    // طلب المالك 2026-09-09: زر الترقيم القديم غائب من الريشة
    expect(screen.queryByRole('button', { name: t('editor.annToolNumber') })).toBeNull()
    expect(document.querySelectorAll('.tool-rail .swatch')).toHaveLength(INK_COLORS.length)
    // القص والطمس والريشة لم تختفِ — «كل الأزرار تظل في مكانها»
    expect(screen.getByRole('button', { name: t('editor.cropImage') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('editor.blurRegion') })).toBeTruthy()
  })

  it('النقر على الريشة ثانيةً يطويها — تعود قص/طمس/ريشة وحدها', async () => {
    await load3()
    enterEdit()
    openPen()
    expect(screen.getByRole('button', { name: t('editor.annToolRect') })).toBeTruthy()
    openPen()
    expect(screen.queryByRole('button', { name: t('editor.annToolRect') })).toBeNull()
    expect(document.querySelectorAll('.tool-rail .swatch')).toHaveLength(0)
  })
})

describe('طلب المالك 2026-09-09: «إظهار الأرقام» مبدّل في قائمة «المزيد» بآخر الشريط', () => {
  it('زر ⋮ بلا إطار في آخر الشريط يفتح قائمة فيها مبدّل الأرقام — مفعّل افتراضيًا ويتبدل', async () => {
    await load3()
    enterEdit()
    const trigger = screen.getByRole('button', { name: t('editor.more.aria') })
    // الزر داخل ركن النهاية (آخر الشريط) لا بجوار «تعديل»
    expect(trigger.closest('.editor-bar-end')).toBeTruthy()
    fireEvent.click(trigger)
    const item = screen.getByRole('menuitemcheckbox', { name: t('editor.more.showNumbers') })
    // الأرقام مفعّلة افتراضيًا (طلب المالك 2026-09-09)
    expect(item.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(item)
    // القائمة تُغلق بعد الاختيار — إعادة الفتح تكشف الحالة الجديدة
    fireEvent.click(screen.getByRole('button', { name: t('editor.more.aria') }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: t('editor.more.showNumbers') }).getAttribute('aria-checked'),
    ).toBe('false')
  })
})

describe('S4: لوحة حبر واحدة من خمسة ألوان تحت الريشة', () => {
  it('لوحة اللون خمسة أزرار من INK_COLORS لا لوحتان متباينتان، والافتراضي مضغوط', async () => {
    await load3()
    enterEdit()
    openPen()
    const swatches = Array.from(document.querySelectorAll<HTMLButtonElement>('.tool-rail .swatch'))
    expect(swatches).toHaveLength(INK_COLORS.length)
    expect(document.querySelectorAll('.pen-palette')).toHaveLength(0)
    expect(swatches.filter((s) => s.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })
})

describe('وصولية العمود — شرط قبول لا تحسين', () => {
  it('العمود شريط أدوات رأسي مُسمّى', async () => {
    await load3()
    expect(rail().getAttribute('role')).toBe('toolbar')
    expect(rail().getAttribute('aria-orientation')).toBe('vertical')
    expect(rail().getAttribute('aria-label')).toBe(t('editor.toolsRail'))
  })

  it('كل زر في العمود يحمل aria-label و title', async () => {
    await load3()
    enterEdit()
    openPen()
    const btns = Array.from(rail().querySelectorAll<HTMLButtonElement>('button'))
    expect(btns.length).toBeGreaterThan(10)
    for (const b of btns) {
      expect(b.getAttribute('aria-label'), `aria-label مفقود: ${b.className}`).toBeTruthy()
      expect(b.getAttribute('title'), `title مفقود: ${b.getAttribute('aria-label')}`).toBeTruthy()
    }
  })

  /*
   * aria-pressed يخصّ الأزرار القابلة للضغط المستمر (الأدوات والألوان وزر الريشة).
   * أزرار المنظار أوامر لحظية بلا حالة — استثناؤها صدق لا سهو.
   */
  it('كل زر أداة/لون/ريشة يعلن حالته بـaria-pressed، وأزرار المنظار لا تدّعي حالة', async () => {
    await load3()
    enterEdit()
    openPen()
    const toggles = Array.from(rail().querySelectorAll<HTMLButtonElement>('button[data-rail-toggle]'))
    // قص + طمس + ريشة (٣) + أشكال الريشة (٨ منذ EDT-05: +نص ورسم حر) + الألوان + تحريك الهدف (١)
    expect(toggles.length).toBe(3 + PEN_DRAW_TOOLS.length + INK_COLORS.length + 1)
    for (const b of toggles) {
      expect(b.getAttribute('aria-pressed'), `aria-pressed مفقود: ${b.getAttribute('aria-label')}`).toMatch(
        /^(true|false)$/,
      )
    }
    for (const key of ['editor.zoomIn', 'editor.zoomOut', 'editor.zoomFit'] as const) {
      expect(screen.getByRole('button', { name: t(key) }).hasAttribute('aria-pressed')).toBe(false)
    }
  })

  it('تسلسل Tab يدخل العمود مرة واحدة، والأسهم تتنقّل بين أزراره (roving focus)', async () => {
    await load3()
    enterEdit()
    openPen()
    const btns = Array.from(rail().querySelectorAll<HTMLButtonElement>('button'))
    expect(btns.filter((b) => b.tabIndex === 0)).toHaveLength(1)

    btns[0]!.focus()
    fireEvent.keyDown(rail(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(btns[1])
    expect(btns.filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(btns[1]!.tabIndex).toBe(0)

    fireEvent.keyDown(rail(), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(btns[0])

    // من أول زر: سهم لأعلى يلتفّ إلى آخر زر — لا طريق مسدود
    fireEvent.keyDown(rail(), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(btns[btns.length - 1])

    fireEvent.keyDown(rail(), { key: 'Home' })
    expect(document.activeElement).toBe(btns[0])
    fireEvent.keyDown(rail(), { key: 'End' })
    expect(document.activeElement).toBe(btns[btns.length - 1])
  })
})

describe('المنظار من العمود — تكبير/تصغير/ملاءمة دائمة الظهور', () => {
  it('أزرار المنظار الثلاثة موجودة في العمود حتى في وضع العرض', async () => {
    await load3()
    for (const key of ['editor.zoomIn', 'editor.zoomOut', 'editor.zoomFit'] as const) {
      const btn = screen.getByRole('button', { name: t(key) })
      expect(rail().contains(btn)).toBe(true)
    }
  })
})
