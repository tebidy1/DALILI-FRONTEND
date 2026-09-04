// مولّد أيقونات دليلي — PNG خالص بلا اعتماديات (PLAT-01)
// الرسم: مربع دائري الزوايا بلون العلامة #0F766E + إبرة بوصلة ثنائية اللون تشير للشمال الشرقي.
// كل مقاس يُرسم مباشرة بتفريط 4×4 لكل بكسل — لا تصغير من مقاس أكبر فلا تهشّش.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BRAND = { r: 15, g: 118, b: 110 } // #0F766E
const WHITE = { r: 255, g: 255, b: 255 }
const SIZES = [16, 32, 48, 128]
const SS = 4 // عينات فرعية لكل بُعد

function insideRoundedSquare(x, y) {
  // إحداثيات وحدية 0..1، هامش 0 ونصف قطر 22%
  if (x < 0 || x > 1 || y < 0 || y > 1) return false
  const r = 0.22
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inTriangle(px, py, a, b, c) {
  const s = (p, q, r2) => (q.x - p.x) * (r2.y - p.y) - (q.y - p.y) * (r2.x - p.x)
  const d1 = s(a, b, { x: px, y: py })
  const d2 = s(b, c, { x: px, y: py })
  const d3 = s(c, a, { x: px, y: py })
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/** لون البكسل عند نقطة وحدية — طبقات: خلفية → ذيل الإبرة → رأسها → ثقب المركز */
function sample(x, y) {
  if (!insideRoundedSquare(x, y)) return null
  let color = BRAND
  const cx = 0.5
  const cy = 0.5
  const ux = 0.7071
  const uy = -0.7071 // الشمال الشرقي (y للأسفل)
  const vx = 0.7071
  const vy = 0.7071
  const tip = { x: cx + ux * 0.28, y: cy + uy * 0.28 }
  const tail = { x: cx - ux * 0.28, y: cy - uy * 0.28 }
  const p1 = { x: cx + vx * 0.085, y: cy + vy * 0.085 }
  const p2 = { x: cx - vx * 0.085, y: cy - vy * 0.085 }
  // الذيل أوضح (72%) كي لا يذوب في المقاسات الصغيرة — والحكم البصري أثبت أن الثقب المركزي يختفي في 16px فحُذف
  if (inTriangle(x, y, tail, p1, p2)) color = { ...WHITE, a: 0.72 }
  if (inTriangle(x, y, tip, p1, p2)) color = WHITE // الرأس: أبيض صلب
  return color.a === undefined ? { ...color, a: 1 } : color
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

const outDir = path.resolve(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })
for (const size of SIZES) {
  const pixels = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => pixel(x, y, size)),
  )
  const png = encodePng(size, pixels)
  writeFileSync(path.join(outDir, `${size}.png`), png)
  console.log(`icon ${size}x${size}: ${png.length} bytes`)
}
