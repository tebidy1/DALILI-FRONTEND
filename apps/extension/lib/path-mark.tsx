/**
 * رمز «درج المسار» — هوية دليلي (docs/brand-identity.md). نسخة مطابقة تمامًا
 * لأحجار الشبكة في apps/web/src/brand/PathMark.tsx — يرث لونه من currentColor
 * فيعمل على ثيمي الامتداد (الجرافيت/الهوية الجديدة) بلا تعديل.
 */
export function PathMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="brand-mark">
      <rect x="40" y="40" width="8" height="8" fill="currentColor" />
      <rect x="32" y="32" width="8" height="16" fill="currentColor" />
      <rect x="24" y="24" width="8" height="24" fill="currentColor" />
      <rect x="16" y="16" width="8" height="32" fill="currentColor" />
      <polygon points="12,10 0,16 12,22" fill="currentColor" />
    </svg>
  )
}
