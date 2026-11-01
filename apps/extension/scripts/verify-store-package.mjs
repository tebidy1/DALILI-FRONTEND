/**
 * PLAT-05: فحص حزمة المتجر قبل الإرسال — يُشغَّل بعد `pnpm --filter @dalili/extension zip`.
 * يفحص المخرَج المبنيّ لا المصدر: الإصدار، الأيقونات، الصلاحيات، منشآ الإنتاج،
 * وغياب أي كود بعيد (جوجل يرفض الحزم التي تُحمّل سكربتات من الشبكة).
 *
 *   node scripts/verify-store-package.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.output', 'chrome-mv3')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const PROD_API = 'https://apidaleel.sootnote.com'
const PROD_WEB = 'https://daleel.sootnote.com'
const EXPECTED_PERMISSIONS = ['storage', 'unlimitedStorage', 'tabs', 'sidePanel', 'offscreen', 'scripting']
const ICON_SIZES = ['16', '32', '48', '128']
/** نطاقات مسموحة داخل النصوص: روابط توثيق لا تُحمَّل كسكربت */
// www.w3.org = نطاق أسماء SVG/XML داخل النصوص، لا يُجلب من الشبكة
const ALLOWED_URL_HOSTS = ['react.dev', 'www.w3.org', 'apidaleel.sootnote.com', 'daleel.sootnote.com']

const fails = []
const notes = []
const fail = (m) => fails.push(m)
const note = (m) => notes.push(m)

if (!existsSync(out)) {
  console.error('✗ لا يوجد مخرَج مبنيّ: .output/chrome-mv3 — شغّل `pnpm --filter @dalili/extension zip` أولًا')
  process.exit(1)
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const files = walk(out)
const js = files.filter((f) => ['.js', '.mjs'].includes(extname(f)))
const sources = js.map((f) => ({ f, text: readFileSync(f, 'utf8') }))

// ١) المانيفست
const mf = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
if (mf.version !== pkg.version) fail(`إصدار المانيفست ${mf.version} ≠ إصدار الحزمة ${pkg.version}`)
else note(`الإصدار ${mf.version}`)
if (mf.manifest_version !== 3) fail(`manifest_version = ${mf.manifest_version} (المتجر يطلب 3)`)
if ([...(mf.name ?? '')].length > 75) fail('الاسم يتجاوز 75 حرفًا (حد المتجر)')
if (!mf.description) fail('لا وصف في المانيفست')
else if ([...mf.description].length > 132) fail(`الوصف ${[...mf.description].length} حرفًا > 132`)
else note(`الوصف ${[...mf.description].length} حرفًا`)

const perms = [...(mf.permissions ?? [])].sort()
const expect = [...EXPECTED_PERMISSIONS].sort()
if (perms.join(',') !== expect.join(',')) {
  fail(`الصلاحيات تغيّرت عمّا يعلّله إعلان المتجر: ${perms.join(', ')} (المتوقَّع ${expect.join(', ')}) — حدّث docs/chrome-web-store/store-listing.md`)
} else note(`الصلاحيات ${perms.length} كما يعلّلها الإعلان`)
if ((mf.host_permissions ?? []).join(',') !== '<all_urls>')
  fail(`host_permissions = ${JSON.stringify(mf.host_permissions)} — الإعلان يعلّل <all_urls> فقط`)

// ٢) الأيقونات
for (const s of ICON_SIZES) {
  const rel = mf.icons?.[s]
  if (!rel) { fail(`المانيفست بلا أيقونة ${s}`); continue }
  const p = join(out, rel)
  if (!existsSync(p)) { fail(`أيقونة مفقودة من الحزمة: ${rel}`); continue }
  const b = readFileSync(p)
  // ترويسة PNG: العرض والارتفاع في البايتات 16..24
  if (b.subarray(1, 4).toString() !== 'PNG') { fail(`${rel} ليست PNG`); continue }
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
  if (w !== Number(s) || h !== Number(s)) fail(`${rel} مقاسها ${w}×${h} بدل ${s}×${s}`)
}
if (!fails.some((m) => m.includes('أيقونة'))) note(`الأيقونات ${ICON_SIZES.join('/')} سليمة`)

// ٣) منشآ الإنتاج — الفحص على المخرَج لا على ‎.env
const hasApi = sources.some(({ text }) => text.includes(PROD_API))
const hasWeb = sources.some(({ text }) => text.includes(PROD_WEB))
if (!hasApi) fail(`الحزمة لا تحتوي عنوان الخادم الحيّ ${PROD_API}`)
if (!hasWeb) fail(`الحزمة لا تحتوي عنوان الويب الحيّ ${PROD_WEB}`)
if (hasApi && hasWeb) note('منشآ الإنتاج داخل المخرَج')
for (const { f, text } of sources) {
  const bad = text.match(/VITE_(?:API|WEB)_BASE:"http:\/\/(?:localhost|127\.0\.0\.1)[^"]*"/g)
  if (bad) fail(`${f.slice(out.length + 1)} يحقن منشأ محليًّا: ${[...new Set(bad)].join(', ')}`)
  const mode = text.match(/MODE:"(\w+)"/)
  if (mode && mode[1] !== 'production') fail(`${f.slice(out.length + 1)} مبنيّ بوضع ${mode[1]} لا production`)
}

// ٤) لا كود بعيد
for (const { f, text } of sources) {
  const unexpected = new Set()
  for (const u of text.match(/https?:\/\/[a-zA-Z0-9.-]+/g) ?? []) {
    const host = u.replace(/^https?:\/\//, '')
    if (!ALLOWED_URL_HOSTS.includes(host) && !host.startsWith('localhost') && !host.startsWith('127.0.0.1'))
      unexpected.add(host)
  }
  if (unexpected.size) fail(`نطاق غير متوقَّع في ${f.slice(out.length + 1)}: ${[...unexpected].join(', ')}`)
}
if (!fails.some((m) => m.includes('نطاق غير متوقَّع'))) note('لا كود بعيد: الخطوط والسكربتات كلها داخل الحزمة')

// ٥) الحزمة نفسها
const zip = join(root, '.output', `daliliextension-${pkg.version}-chrome.zip`)
if (!existsSync(zip)) fail(`ملف الحزمة غير موجود: ${zip}`)
else {
  const mb = statSync(zip).size / 1024 / 1024
  note(`الحزمة ${zip.slice(root.length + 1)} — ${mb.toFixed(2)} ميغابايت`)
  if (mb > 100) fail('الحزمة تتجاوز حد المتجر (100 ميغابايت)')
}

for (const n of notes) console.log('  ✔', n)
if (fails.length) {
  console.error('\n✗ الحزمة غير جاهزة للمتجر:')
  for (const m of fails) console.error('  ✗', m)
  process.exit(1)
}
console.log('\n✔ حزمة المتجر جاهزة.')
