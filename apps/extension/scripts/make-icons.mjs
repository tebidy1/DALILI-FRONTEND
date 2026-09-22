// مولّد أيقونات «إتقان» — PNG خالص بلا اعتماديات (PLAT-01)
//
// الرسم: مربع دائري الزوايا بلون الحبر #2B2A26، وفوقه شذرة من الشعار نفسه:
// **الألف** قائمةً على **امتداد القاف**، ونقطتا القاف فوقه. أي: «ـقا» مصغّرة.
//
// لماذا شذرة لا الكلمة كاملة: «إتقان» نسبتها 2.06:1 — تصير في 16px شخبطة.
// ولماذا ليست «ألف المعيار» (خمس نقاط): خمس نقاط وأربع فجوات في 16px = ١٫٨px
// لكل معلَم، فتذوب في عمود مصمت. الشذرة تُقرأ في 16px وتبقى هي هي في 128px —
// أيقونة واحدة بفكرة واحدة، وهذا أصدق من أيقونتين مختلفتين حسب المقاس.
//
// اللون: الألف وحدها ملوّنة — كما في الشعار. طينيّ فاتح كي يبقى تبايُنه على الحبر
// فوق 4.5:1 (الطينيّ الأصلي #8A5447 يختفي على أرضية داكنة).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const INK = { r: 43, g: 42, b: 38 } // #2B2A26 — أرضية المربع
const PAPER = { r: 246, g: 245, b: 242 } // #F6F5F2
const CLAY_LIGHT = { r: 201, g: 135, b: 122 } // #C9877A — الألف وحدها
const SIZES = [16, 32, 48, 128]
const SS = 4 // عينات فرعية لكل بُعد

/** هندسة الشذرة بإحداثيات وحدية 0..1 — مُصدَّرة كي تُختبر بلا رسم */
export const GLYPH = {
  corner: 0.22, // نصف قطر زوايا المربع
  kashida: { x0: 0.305, x1: 0.745, y: 0.665, w: 0.095 }, // امتداد القاف
  alif: { x: 0.33, y0: 0.25, y1: 0.665, w: 0.11 }, // الألف — قائمة على طرف الامتداد
  dots: [
    { x: 0.545, y: 0.395, h: 0.056 },
    { x: 0.665, y: 0.395, h: 0.056 },
  ],
}

function insideRoundedSquare(x, y) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false
  const r = GLYPH.corner
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** قضيب بنهايات مستديرة: المسافة إلى القطعة ≤ نصف العرض */
function inCapsule(px, py, ax, ay, bx, by, w) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.min(1, Math.max(0, t))
  const qx = ax + dx * t
  const qy = ay + dy * t
  return (px - qx) ** 2 + (py - qy) ** 2 <= (w / 2) ** 2
}

function inDiamond(px, py, cx, cy, h) {
  return Math.abs(px - cx) / h + Math.abs(py - cy) / h <= 1
}

/** لون البكسل عند نقطة وحدية — الأرضية ثم الامتداد ثم النقطتان ثم الألف فوقها */
export function sample(x, y) {
  if (!insideRoundedSquare(x, y)) return null
  let color = INK
  const k = GLYPH.kashida
  if (inCapsule(x, y, k.x0, k.y, k.x1, k.y, k.w)) color = PAPER
  for (const d of GLYPH.dots) if (inDiamond(x, y, d.x, d.y, d.h)) color = PAPER
  const a = GLYPH.alif
  if (inCapsule(x, y, a.x, a.y0, a.x, a.y1, a.w)) color = CLAY_LIGHT
  return { ...color, a: 1 }
}

/** متوسط العينات بضرب مسبق بالشفافية ثم فكّه — حواف ناعمة صادقة */
function pixel(x, y, size) {
  let ar = 0
  let ag = 0
  let ab = 0
  let aa = 0
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
      if (c) {
        ar += c.r * c.a
        ag += c.g * c.a
        ab += c.b * c.a
        aa += c.a
      }
    }
  }
  const n = SS * SS
  if (aa === 0) return [0, 0, 0, 0]
  return [Math.round(ar / aa), Math.round(ag / aa), Math.round(ab / aa), Math.round((aa / n) * 255)]
}

// ——— PNG ———
const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let c = i
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // عمق البت
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // لا فلترة
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels[y][x]
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
      raw[o++] = a
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function buildIcon(size) {
  const pixels = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => pixel(x, y, size)),
  )
  return encodePng(size, pixels)
}

// التنفيذ المباشر فقط — الاستيراد من الاختبارات لا يكتب ملفات
if (process.argv[1] && process.argv[1].endsWith('make-icons.mjs')) {
  const outDir = path.resolve(process.cwd(), 'public', 'icons')
  mkdirSync(outDir, { recursive: true })
  for (const size of SIZES) {
    const png = buildIcon(size)
    writeFileSync(path.join(outDir, `${size}.png`), png)
    console.log(`icon ${size}x${size}: ${png.length} bytes`)
  }
}
