/**
 * BKL-01: عمليات النص المنسّق — نقية بلا DOM كي تُختبر وحدها.
 * منطق المحرر لا يسكن المكوّن: المكوّن يقرأ التحديد ويستدعي هذه الدوال.
 */
import type { RichTextDto, RichParaDto, TextRunDto } from '@dalili/shared'

export type Mark = 'b' | 'i'

/** نص الفقرة كاملًا — فهارس التحديد في الواجهة تُحسب على هذا النص المسطّح */
export function paraText(runs: TextRunDto[]): string {
  return runs.map((r) => r.text).join('')
}

function sameStyle(a: TextRunDto, b: TextRunDto): boolean {
  return !!a.b === !!b.b && !!a.i === !!b.i && a.href === b.href
}

/** يدمج القطع المتجاورة المتطابقة الأسلوب — يمنع تكاثر القطع بعد كل تعليم */
function mergeRuns(runs: TextRunDto[]): TextRunDto[] {
  const out: TextRunDto[] = []
  for (const r of runs) {
    if (!r.text) continue
    const last = out[out.length - 1]
    if (last && sameStyle(last, r)) last.text += r.text
    else out.push({ ...r })
  }
  return out
}

/**
 * يشطر قطع الفقرة عند حدّي المدى ثم يبدّل العلامة على ما بينهما.
 * تبديل لا تكديس: إن كان المدى كله معلَّمًا سلفًا تُزال العلامة، وإلا تُضاف.
 */
export function toggleMark(
  rich: RichTextDto,
  paraIndex: number,
  start: number,
  end: number,
  mark: Mark,
): RichTextDto {
  const para = rich[paraIndex]
  if (!para || start >= end) return rich

  const pieces: { run: TextRunDto; inside: boolean }[] = []
  let pos = 0
  for (const run of para.runs) {
    const runStart = pos
    const runEnd = pos + run.text.length
    pos = runEnd
    if (runEnd <= start || runStart >= end) {
      pieces.push({ run: { ...run }, inside: false })
      continue
    }
    const a = Math.max(start, runStart) - runStart
    const b = Math.min(end, runEnd) - runStart
    if (a > 0) pieces.push({ run: { ...run, text: run.text.slice(0, a) }, inside: false })
    pieces.push({ run: { ...run, text: run.text.slice(a, b) }, inside: true })
    if (b < run.text.length) pieces.push({ run: { ...run, text: run.text.slice(b) }, inside: false })
  }

  const inside = pieces.filter((p) => p.inside)
  const allMarked = inside.length > 0 && inside.every((p) => !!p.run[mark])

  const runs = pieces.map(({ run, inside: isIn }) => {
    if (!isIn) return run
    const copy: TextRunDto = { ...run }
    if (allMarked) delete copy[mark]
    else copy[mark] = true
    return copy
  })

  return rich.map((p, i) => (i === paraIndex ? { ...p, runs: mergeRuns(runs) } : p))
}

export function setPara(rich: RichTextDto, paraIndex: number, para: RichParaDto['para']): RichTextDto {
  if (!rich[paraIndex]) return rich
  return rich.map((p, i) => (i === paraIndex ? { ...p, para } : p))
}
