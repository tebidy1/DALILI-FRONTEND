/** CAP-19: إعلان قدرات السطح — تدهور معلن لا صامت */
import { t } from './i18n'

export interface Capability {
  id: string
  ok: boolean
  label: string
}

/**
 * ما يستطيعه سطح الامتداد اليوم. التعليق الصوتي (VOX) متاح من زر
 * «ابدأ مع تعليق صوتي»، وتفريغه نصًا زر في محرر الويب. تطبيقات سطح المكتب
 * (DSK P3) والإرشاد الحي (GM P4) معلنة «غير متاحة بعد» — المستخدم يرى الحقيقة.
 * I18N-01: النصوص عبر t() لحظة الطلب فتتبع اللغة الحية.
 */
export function capabilities(): Capability[] {
  return [
    { id: 'capture', ok: true, label: t('ext.capCapture') },
    { id: 'marker', ok: true, label: t('ext.capMarker') },
    { id: 'manualBlur', ok: true, label: t('ext.capManualBlur') },
    { id: 'autoMask', ok: true, label: t('ext.capAutoMask') },
    { id: 'append', ok: true, label: t('ext.capAppend') },
    { id: 'voice', ok: true, label: t('ext.capVoice') },
    { id: 'desktopApps', ok: false, label: t('ext.capDesktop') },
    { id: 'guideMe', ok: false, label: t('ext.capGuideMe') },
  ]
}

/**
 * نصوص لوحة القدرات (بلاغ المالك 2026-08-30: «لم أفهم القصد منها»).
 * عنوان يجيب «ما هذه القائمة؟»، تمهيد يوضح أنها خطة صادقة لا رسالة خطأ،
 * ومفتاح يفسّر الرمزين قبل قراءة البنود. دالة لا ثابت — كي تُقرأ باللغة الحية.
 */
export function capsPanel(): { title: string; intro: string; legend: string } {
  return {
    title: t('ext.capTitle'),
    intro: t('ext.capIntro'),
    legend: t('ext.capLegend'),
  }
}
