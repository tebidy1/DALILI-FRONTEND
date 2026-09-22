// فحص UX-06: نصوص الواجهة العربية المضمنة خارج i18n (يتخطى التعليقات)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const AR = /[\u0600-\u06FF]/
const files = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) && !p.includes('i18n')) files.push(p)
  }
}
walk(root)

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!AR.test(line)) return
    // تجاهل إن كانت كل العربية داخل تعليق
    const firstAr = line.search(AR)
    const before = line.slice(0, firstAr)
    if (/\/\//.test(before) || /^\s*(\*|\/\*)/.test(line)) return
    console.log(`${path.relative(root, f)}:${i + 1}: ${line.trim().slice(0, 110)}`)
  })
}
