import { guideToHtml, type HtmlGuide } from '@dalili/core'

/**
 * VIEW-10 — نسخ غني بصور **مضمّنة** (data-URI) لا مربوطة برابط.
 * قرار المالك: التضمين يجعل اللصق يعمل في Google Docs (يجلب من خادمه) وWord دون
 * اتصال والبريد. نجلب كل لقطة مرة، نحوّلها base64، ونمرّر محلًّا يعيد data-URI؛
 * فشل لقطة مفردة يسقط لرابطها المطلق فلا ينهار النسخ كلّه.
 */

interface ShotStep {
  screenshot?: { fileId: string; fileUrl?: string } | { missing: true }
}

/** مفتاح الملف كما يحسبه guideToHtml — آخر مقطع من fileUrl وإلا fileId */
function fileKey(shot: { fileId: string; fileUrl?: string }): string {
  return shot.fileUrl ? shot.fileUrl.split('/').pop() ?? shot.fileId : shot.fileId
}

async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * يبني HTML الدليل بصور مضمّنة. `origin` أصل يقدّم `/files/:id` عموميًّا.
 * يعيد HTML جاهزًا للصق في الحافظة.
 */
export async function buildRichHtml(guide: HtmlGuide, origin: string): Promise<string> {
  const keys = new Set<string>()
  for (const s of guide.steps as ShotStep[]) {
    const shot = s.screenshot
    if (shot && !('missing' in shot)) keys.add(fileKey(shot))
  }

  const map = new Map<string, string>()
  await Promise.all(
    [...keys].map(async (key) => {
      const abs = `${origin}/files/${key}`
      const data = await toDataUri(abs)
      map.set(key, data ?? abs) // فشل التضمين → رابط مطلق كبديل صادق
    }),
  )

  return guideToHtml(guide, (key) => map.get(key) ?? `${origin}/files/${key}`)
}
