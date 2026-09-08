import { client } from '../api'
import { t } from '../i18n'

/**
 * إنشاء دليل فارغ وإرجاع معرّفه — المشترك بين زر الشريط الجانبي وزر الهوم
 * وحالة «ابدأ من هنا» (المستقبل: اختيار قالب بدل الدليل الفارغ).
 */
export async function createAndOpenGuide(): Promise<string> {
  const now = new Date().toISOString()
  const { assembleGuide } = await import('@dalili/core')
  const empty = assembleGuide([], Date.now())
  const { id } = await client.createGuide({ ...empty, createdAt: now, updatedAt: now })
  return id
}

/** BKL-01: كرّاسة فارغة — نفس مسار الإنشاء، والنوع وحده يفرّق */
export async function createAndOpenBooklet(): Promise<string> {
  const now = new Date().toISOString()
  const { assembleGuide } = await import('@dalili/core')
  const empty = assembleGuide([], Date.now())
  const { id } = await client.createGuide({
    ...empty,
    kind: 'booklet',
    title: t('booklet.untitled'),
    createdAt: now,
    updatedAt: now,
  })
  return id
}
