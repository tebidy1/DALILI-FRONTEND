import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { whatsappUrl } from '@dalili/core'
import { t } from '../i18n'
import { ViewerShare } from './ViewerShare'

/**
 * طلب المالك 2026-10-02: خيارات المشاركة كانت أزرارًا منفردة تملأ أعلى شاشة الجوال
 * (١٧٣px من الشريط) وتشوّش على القراءة — صارت زرًّا واحدًا «مشاركة» يفتح قائمة.
 * وكل خيار يُمتحن أنه يعمل فعلًا: واتساب برابط الصفحة، والنسخ بصدق نجاحه وفشله،
 * وQR، والطباعة، ومشاركة الجهاز حين يدعمها المتصفح.
 */
const TITLE = 'إصدار فاتورة توريد'

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: t('editor.shareOpen') }))
  return screen.getByRole('menu')
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
})

describe('مشاركة العارض العام — زر واحد وقائمة', () => {
  it('مغلقة: زر «مشاركة» وحده في الشريط — لا واتساب ولا نسخ ولا QR ولا طباعة منفردة', () => {
    render(<ViewerShare title={TITLE} />)
    const trigger = screen.getByRole('button', { name: t('editor.shareOpen') })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByText(t('editor.whatsapp'))).toBeNull()
    expect(screen.queryByText(t('editor.copyLink'))).toBeNull()
    expect(screen.queryByText(t('editor.qr'))).toBeNull()
    expect(screen.queryByText(t('common.print'))).toBeNull()
  })

  it('الفتح يجمع الخيارات كلها في قائمة واحدة، وEscape يغلقها', () => {
    render(<ViewerShare title={TITLE} />)
    const menu = openMenu()
    expect(screen.getByRole('button', { name: t('editor.shareOpen') }).getAttribute('aria-expanded')).toBe('true')
    const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent?.trim())
    expect(labels).toEqual([t('editor.whatsapp'), t('editor.copyLink'), t('editor.qr'), t('common.print')])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('واتساب: رابط يحمل عنوان الدليل ورابط الصفحة الحالية ويفتح في تبويب جديد', () => {
    render(<ViewerShare title={TITLE} />)
    openMenu()
    const wa = screen.getByRole('menuitem', { name: t('editor.whatsapp') }) as HTMLAnchorElement
    expect(wa.tagName).toBe('A')
    expect(wa.href).toBe(whatsappUrl(TITLE, location.href))
    expect(wa.target).toBe('_blank')
    expect(wa.rel).toContain('noopener')
  })

  it('نسخ الرابط: يكتب رابط الصفحة في الحافظة ويعلن «نُسخ»', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<ViewerShare title={TITLE} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.copyLink') }))
    expect(await screen.findByText(t('editor.copied'))).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(location.href)
  })

  it('نسخ الرابط حين يرفض المتصفح الحافظة والبديل: رسالة فشل صادقة — لا «نُسخ» كاذبة', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true })
    render(<ViewerShare title={TITLE} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.copyLink') }))
    expect(await screen.findByText(t('viewer.copyFailed'))).toBeTruthy()
    expect(screen.queryByText(t('editor.copied'))).toBeNull()
  })

  it('رمز QR: ينفتح داخل القائمة نفسها (لا منبثق يفيض خارج شاشة الجوال) ويُطوى بالنقر ثانية', () => {
    render(<ViewerShare title={TITLE} />)
    const menu = openMenu()
    const item = screen.getByRole('menuitem', { name: t('editor.qr') })
    expect(menu.querySelector('canvas')).toBeNull()
    fireEvent.click(item)
    expect(item.getAttribute('aria-expanded')).toBe('true')
    expect(menu.querySelector('canvas.qr-canvas')).toBeTruthy()
    fireEvent.click(item)
    expect(menu.querySelector('canvas')).toBeNull()
  })

  it('طباعة / PDF: تغلق القائمة ثم تستدعي طباعة المتصفح', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ViewerShare title={TITLE} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: t('common.print') }))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('مشاركة الجهاز: تظهر أول القائمة فقط حين يدعمها المتصفح، وتمرّر العنوان والرابط لورقة النظام', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    render(<ViewerShare title={TITLE} />)
    const menu = openMenu()
    const first = menu.querySelector('[role="menuitem"]')
    expect(first?.textContent?.trim()).toBe(t('viewer.shareNative'))
    fireEvent.click(first!)
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: TITLE, text: TITLE, url: location.href }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
