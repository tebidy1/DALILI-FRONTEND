import { describe, expect, it } from 'vitest'
import { b64ToBytes, bytesToB64 } from './audio-store'

/** تحويلات b64 لمقاطع التعليق الصوتي — دورة كاملة بلا فقد */

describe('b64 تحويلات', () => {
  it('bytes → b64 → bytes دورة كاملة بلا فقد', () => {
    const src = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 255, 1, 2, 3])
    const b64 = bytesToB64(src)
    expect(b64ToBytes(b64)).toEqual(src)
  })

  it('المصفوفة الفارغة تمرّ كما هي', () => {
    expect(b64ToBytes(bytesToB64(new Uint8Array(0)))).toEqual(new Uint8Array(0))
  })
})
