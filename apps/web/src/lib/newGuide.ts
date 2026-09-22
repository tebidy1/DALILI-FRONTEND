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

/** BKL-01: كرّاسة فارغة — نفس مسار الإنشاء، والنوع وحده يفرّق */
export async function createAndOpenBooklet(): Promise<string> {
  return createGuide('booklet')
}
