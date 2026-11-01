import { bookletToCourseSteps, embedIdsOf } from '@dalili/core'
import type { GuideDto, StepDto } from '@dalili/shared'
import { client } from '../../api'
import { createCourse } from '../../lib/newGuide'

/**
 * د١ب «حوّل إلى دورة»: دورة جديدة من الكرّاسة — كل دليل مضمّن درس، وكل مجموعة كتل صفحة.
 * عناوين الدروس من الأدلة نفسها، والدليل المتعذّر يأخذ عنوان كتلته. الكرّاسة لا تُمسّ.
 */
export async function convertBookletToCourse(booklet: GuideDto): Promise<string> {
  const ids = embedIdsOf(booklet.steps)
  const res = await Promise.allSettled(ids.map((id) => client.getGuide(id)))
  const titles: Record<string, string> = {}
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') titles[ids[i]!] = r.value.guide.title
  })
  return createCourse(booklet.title, bookletToCourseSteps(booklet.steps, titles) as StepDto[])
}
