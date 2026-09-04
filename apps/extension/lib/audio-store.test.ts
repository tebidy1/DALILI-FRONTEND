import { describe, expect, it } from 'vitest'
import {
  AUDIO_PREFIX,
  audioChunkKey,
  b64Bytes,
  b64ToBytes,
  bytesToB64,
  MAX_AUDIO_BYTES,
  shouldStopForCap,
} from './audio-store'

/** VOX-01: تخزين مقاطع الصوت — b64 في التخزين المحلي يصمد أمام موت service worker */

describe('b64 تحويلات', () => {
  it('bytes → b64 → bytes دورة كاملة بلا فقد', () => {
    const src = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 255, 1, 2, 3])
    const b64 = bytesToB64(src)
    expect(b64ToBytes(b64)).toEqual(src)
  })

  it('حجم b64 يحسب البايتات الفعلية (بلا حشو)', () => {
    expect(b64Bytes(bytesToB64(new Uint8Array(300)))).toBe(300)
    expect(b64Bytes(bytesToB64(new Uint8Array(0)))).toBe(0)
  })
})

describe('مفاتيح التخزين', () => {
  it('مفاتيح المقاطع تحت بادئة dalili:audio: — المسح الجماعي يجدها', () => {
    expect(audioChunkKey('sess1', 0)).toBe('dalili:audio:sess1:0')
    expect(audioChunkKey('sess1', 12).startsWith(AUDIO_PREFIX)).toBe(true)
  })
})

describe('سقف 25MB', () => {
  it('يتوقف حين يتجاوز المجموع + المقطع القادم السقف', () => {
    expect(MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024)
    expect(shouldStopForCap(0, 1000)).toBe(false)
    expect(shouldStopForCap(MAX_AUDIO_BYTES - 100, 200)).toBe(true)
    expect(shouldStopForCap(MAX_AUDIO_BYTES, 1)).toBe(true)
  })
})
