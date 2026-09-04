import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

/** VIEW-05: ما نرسمه بـqrcode يجب أن يُقرأ فعلاً بماسح مستقل — إثبات ذهاب-وإياب بلا خدمة خارجية */
describe('QR ذهاب-وإياب (توليد → بكسلات → فك)', () => {
  /** jsQR يقبل بيانات البكسل مباشرة — نبنيها من مصفوفة الوحدات بلا DOM */
  function matrixToPixels(
    modules: { size: number; data: Uint8Array },
    scale: number,
    quiet: number,
  ): { data: Uint8ClampedArray; width: number; height: number } {
    const size = (modules.size + quiet * 2) * scale
    const data = new Uint8ClampedArray(size * size * 4)
    data.fill(255) // خلفية بيضاء
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.data[row * modules.size + col]) continue
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = (quiet + col) * scale + dx
            const y = (quiet + row) * scale + dy
            const o = (y * size + x) * 4
            data[o] = 0
            data[o + 1] = 0
            data[o + 2] = 0
            data[o + 3] = 255
          }
        }
      }
    }
    return { data, width: size, height: size }
  }

  it('رابط مشاركة عربي طويل يُرمَّز ثم يُفكَّ إلى النص نفسه', () => {
    const text = 'https://dalili.sa/s/Ab3xK9qZwx1 — دليل إصدار فاتورة توريد'
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
    const img = matrixToPixels(qr.modules as unknown as { size: number; data: Uint8Array }, 8, 4)
    const decoded = jsQR(img.data as unknown as Uint8ClampedArray, img.width, img.height)
    expect(decoded?.data).toBe(text)
  })

  it('رابط إنتاجي قصير أيضًا', () => {
    const text = 'https://dalili.sa/s/ASlJpz10wErG'
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
    const img = matrixToPixels(qr.modules as unknown as { size: number; data: Uint8Array }, 8, 4)
    const decoded = jsQR(img.data as unknown as Uint8ClampedArray, img.width, img.height)
    expect(decoded?.data).toBe(text)
  })
})
