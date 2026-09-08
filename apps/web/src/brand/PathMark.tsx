/**
 * رمز «درج المسار» — هوية دليلي (docs/brand-identity.md): أربع درجات هندسية
 * على شبكة ٨px تصعد من اليمين لليسار تنتهي بمؤشر دلالة. يرث لونه من
 * currentColor فيعمل على الثيمين. النسخة المطابقة في الامتداد:
 * apps/extension/lib/path-mark.tsx
 */
export function PathMark({ size = 48 }: { size?: number }) {
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
