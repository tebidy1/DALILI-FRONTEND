import type { StepDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'

/**
 * المسار المشترك لإنشاء دليل فارغ وإرجاع معرّفه — المشترك بين زر الشريط الجانبي
 * وزر الهوم وحالة «ابدأ من هنا» (المستقبل: اختيار قالب بدل الدليل الفارغ).
 * النوع (واسم الكرّاسة) وحدهما يفرّقان.
 */
async function createGuide(kind: 'guide' | 'booklet'): Promise<string> {
  const now = new Date().toISOString()
  const { assembleGuide } = await import('@dalili/core')
  const empty = assembleGuide([], Date.now())
  const { id } = await client.createGuide(
    kind === 'booklet'
      ? { ...empty, kind: 'booklet', title: t('booklet.untitled'), createdAt: now, updatedAt: now }
      : { ...empty, createdAt: now, updatedAt: now },
  )
  return id
}

export async function createAndOpenGuide(): Promise<string> {
  return createGuide('guide')
}

/** د١ب: دورة — فارغة من «جديد»، أو بدروس جاهزة من «حوّل إلى دورة» */
export async function createCourse(title = t('course.untitled'), steps: StepDto[] = []): Promise<string> {
  const now = new Date().toISOString()
  const { assembleGuide } = await import('@dalili/core')
  const { id } = await client.createGuide({ ...assembleGuide([], Date.now()), kind: 'course', title, steps, createdAt: now, updatedAt: now })
  return id
}

/** BKL-01: كرّاسة فارغة — نفس مسار الإنشاء، والنوع وحده يفرّق */
export async function createAndOpenBooklet(): Promise<string> {
  return createGuide('booklet')
}
