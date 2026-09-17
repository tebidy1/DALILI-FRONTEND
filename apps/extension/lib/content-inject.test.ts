import { describe, expect, it, vi } from 'vitest'
import { CONTENT_SCRIPT_FILE, makeContentInjector } from './content-inject'

/** الحقن عند الطلب: التبويب اليتيم (مفتوح قبل تحميل الامتداد) يُفَعَّل لحظة البدء
 * بلا F5 — ورفض كروم للصفحات المحمية يُعلن بصدق لا يُرمى كخطأ */

describe('حقن سكربت المحتوى عند الطلب', () => {
  it('ينفّذ الملف المبني نفسه في التبويب المطلوب ويعلن النجاح', async () => {
    const executeScript = vi.fn().mockResolvedValue([])
    const injector = makeContentInjector({ executeScript })
    await expect(injector.inject(7)).resolves.toBe(true)
    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: [CONTENT_SCRIPT_FILE] })
  })

  it('رفض كروم التحقين في صفحة محمية يُعلن false بلا رمي — الصدق لا الانفجار', async () => {
    const executeScript = vi.fn().mockRejectedValue(new Error('cannot access contents of the page'))
    const injector = makeContentInjector({ executeScript })
    await expect(injector.inject(3)).resolves.toBe(false)
    expect(executeScript).toHaveBeenCalledTimes(1)
  })
})
