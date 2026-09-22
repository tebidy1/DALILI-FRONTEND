/*
 * هياكل التحميل (UX-02 حالة «تحميل») — كتل صامتة aria-hidden؛
 * الصفحة المحتضنة تعلن role="status" بنص مخفي.
 */
import { t } from '../i18n'

interface SkeletonProps {
  w?: number | string
  h?: number | string
  className?: string
}

export function Skeleton({ w = '100%', h = 14, className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`.trim()} style={{ width: w, height: h }} aria-hidden="true" />
}

/** بطاقة دليل هيكلية — نفس بصمات .card.guide-card تمامًا فلا تقفز الصفحة عند الوصول */
export function SkeletonGuideCard() {
  return (
    <div className="card guide-card" aria-hidden="true">
      <Skeleton w="62%" h={20} />
      <div className="row">
        <Skeleton w={70} h={22} className="skeleton-chip" />
        <Skeleton w={100} h={22} className="skeleton-chip" />
      </div>
      <Skeleton w="44%" h={12} />
      {/* row-end: أسفل البطاقة — نمط لا قيمة مضمّنة (UX-01) */}
      <div className="row row-end">
        <Skeleton w={96} h={34} className="skeleton-btn" />
        <Skeleton w={64} h={34} className="skeleton-btn" />
      </div>
    </div>
  )
}

/** خطوة هيكلية للعارض/المحرر — سطر عنوان + كتلة لقطة */
export function SkeletonStep() {
  return (
    <div className="viewer-step" aria-hidden="true">
      <Skeleton w="48%" h={18} />
      <Skeleton h={220} className="skeleton-shot" />
    </div>
  )
}

/** شاشة تحميل كاملة: تُستخدم مكان أي بيانات لم تصل بعد */
export function SkeletonScreen({ steps = 3 }: { steps?: number }) {
  return (
    <div className="page">
      <div className="header-bar">
        <Skeleton w={180} h={32} />
        <div className="row">
          <Skeleton w={92} h={38} className="skeleton-btn" />
          <Skeleton w={92} h={38} className="skeleton-btn" />
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {t('common.loading')}
      </div>
      {Array.from({ length: steps }, (_, i) => (
        <SkeletonStep key={i} />
      ))}
    </div>
  )
}
