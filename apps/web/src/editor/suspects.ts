import type { StepDto } from '@dalili/shared'

/**
 * TAM-01 (طلب المالك 2026-09-21): رادار الطمس التلقائي — يقرأ **حقائق** الخطوة
 * المخزّنة (عنوان النافذة، تسمية الهدف، النصوص المرافقة) ويعلّم ما شبّه
 * البيانات الحساسة القياسية. قراءة فقط: لا يعدّل شيئًا ولا يفتح صورًا —
 * القرار والرسم بيد المستخدم في المحرر. الأنماط أرقام بصيغ معلومة فدقّتها عالية؛
 * أسماء الأشخاص بلا نمط تأتي من قائمة المستخدم في جولة لاحقة.
 */

export type SuspectKind = 'iban' | 'nid' | 'phone' | 'email'

export interface Suspect {
  kind: SuspectKind
  /** عيّنة النص المصاب كما وردت — للعرض في الشارة لا للمطابقة */
  sample: string
}

const PATTERNS: ReadonlyArray<{ kind: SuspectKind; re: RegExp }> = [
  // آيبان سعودي: SA + رقمَي تحقّق + نص الحساب (24 حرفًا معتادًا)
  { kind: 'iban', re: /\bSA\d{2}[A-Z0-9]{4,22}\b/g },
  // هوية/إقامة: تبدأ 1 أو 2 ثم تسعة أرقام (بحدود كلمات كي لا تلتهم أرقامًا أطول)
  { kind: 'nid', re: /\b[12]\d{9}\b/g },
  // جوال سعودي: 05XXXXXXXX أو 9665XXXXXXXX
  { kind: 'phone', re: /(?:(?:\+|00)966|0)5\d{8}\b/g },
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
]

/** سقف الشارة — إغراقُها بعشرات الإصابات يقتل فائدتها */
const MAX_SUSPECTS = 4

/** يجمع النصوص من أي شكل: نص صريح، نص JSON معتم (target/source)، أو كائن متشعّب */
function collectTexts(v: unknown, out: string[], depth = 0): void {
  if (v == null || depth > 4) return
  if (typeof v === 'string') {
    out.push(v)
    return
  }
  if (typeof v !== 'object') return
  for (const child of Object.values(v as Record<string, unknown>)) {
    collectTexts(child, out, depth + 1)
  }
}

function textsOf(step: StepDto): string[] {
  const out: string[] = []
  // target/source تخزَّنان نصَّ JSON معتمًا (عتامة الدليل) — نفكّهما بأمان،
  // وإن لم يكونا JSON فنفسما النص الخام: أدلة قديمة أو نصوص حرة تُمسح كذلك
  const raws: unknown[] = [step.target, step.source]
  for (const raw of raws) {
    if (typeof raw === 'string') {
      if (raw.length === 0) continue
      try {
        collectTexts(JSON.parse(raw) as unknown, out)
      } catch {
        out.push(raw)
      }
    } else {
      collectTexts(raw, out)
    }
  }
  if (typeof step.title === 'string' && step.title.length > 0) out.push(step.title)
  return out
}

/** فحص نصّ حر — معرّض للاختبار مباشرة */
export function scanText(text: string): Suspect[] {
  const out: Suspect[] = []
  const seen = new Set<string>()
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const sample = m[0]
      const key = `${p.kind}:${sample}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ kind: p.kind, sample })
    }
  }
  return out
}

/** شكوك خطوة واحدة — من حقائقها المخزّنة حصرًا (سقف ‎MAX_SUSPECTS) */
export function stepSuspects(step: StepDto): Suspect[] {
  const out: Suspect[] = []
  const seen = new Set<string>()
  for (const text of textsOf(step)) {
    for (const s of scanText(text)) {
      const key = `${s.kind}:${s.sample}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
      if (out.length >= MAX_SUSPECTS) return out
    }
  }
  return out
}
