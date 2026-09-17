/**
 * نصوص لوحة الودجة الموسَّعة — صوت المنتج نفسه: الأرقام عربية (سائر
 * المنتج)، وتسميات أنواع الخطوات مطابقة **حرفيًّا** للإضافة
 * (extension/sidepanel/parts.tsx kindLabel) كي لا يسمع المستخدم لغتين.
 * نقيّ بلا DOM — العرض يستدعيها عند كل رسم.
 */

/** تحويل عدد إلى أرقام عربية هندية للعرض (توءم lib/ar-digits في الإضافة) */
export function arDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!)
}

/** تسمية نوع الخطوة — النصوص الثابتة نفسها في الإضافة */
export function kindLabel(kind: string): string {
  switch (kind) {
    case 'click':
      return 'نقرة'
    case 'input':
      return 'إدخال'
    case 'select':
      return 'اختيار'
    case 'toggle':
      return 'تبديل'
    case 'navigate':
      return 'تنقّل'
    case 'keypress':
      return 'مفتاح'
    default:
      return 'خطوة'
  }
}

/** سطر العدّاد في بطاقة التحكم — «٣ خطوة» كما يعرضه سطر العدّ في الإضافة */
export function countPhrase(steps: number): string {
  return `${arDigits(Math.max(0, Math.trunc(steps)))} خطوة`
}
