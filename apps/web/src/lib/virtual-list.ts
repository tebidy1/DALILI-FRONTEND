/**
 * PERF-04: عتبة التمرير الافتراضي — فوقها يتحمل المتصفح تخطي ما هو خارج
 * الشاشة (content-visibility) بدل محرّك JS كامل للتمرير الافتراضي.
 * القائمة الوحيدة القادرة على تجاوزها اليوم: خطوات العارض العام (حتى 200).
 */

export const VIRTUAL_THRESHOLD = 100

export function needsVirtualScrolling(count: number): boolean {
  return count > VIRTUAL_THRESHOLD
}
