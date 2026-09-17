import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// القاعدة الذهبيّة (الخطّة الرئيسيّة §٣.١): Rust يجمع حقائق خام فقط — لا يبني دليلًا/خطوة/مرساة،
// ولا يقرأ JSON الدليل. أيّ ظهور لهذه الرموز في src-tauri دليل خرق للعقد.
const FORBIDDEN = ['schemaVersion', 'pageTitle', 'AnchorCandidate', 'struct Step', 'struct Guide', '"steps"']

const here = fileURLToPath(new URL('.', import.meta.url))
const tauriSrc = join(here, '..', 'src-tauri', 'src')

function rustFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return rustFiles(p)
    return e.name.endsWith('.rs') ? [p] : []
  })
}

describe('القاعدة الذهبيّة: Rust لا يعرف بنية الدليل', () => {
  it('لا يوجد أيّ رمز محظور في src-tauri/src/**/*.rs', () => {
    const files = rustFiles(tauriSrc)
    expect(files.length).toBeGreaterThan(0) // src-tauri موجود بعد tauri init
    const offenders: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const needle of FORBIDDEN) if (text.includes(needle)) offenders.push(`${f}: ${needle}`)
    }
    expect(offenders).toEqual([])
  })
})
