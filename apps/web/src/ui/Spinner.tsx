import type { SVGProps } from 'react'
import { t } from '../i18n'

interface SpinnerProps extends SVGProps<SVGSVGElement> {
  size?: number
  /** داخل زر مشغول: الأيقونة صامتة والنص يكفي */
  hidden?: boolean
}

/** مؤشر انتظار دائري — يتحول لنقطة ساكنة تحت prefers-reduced-motion (قاعدة tokens.css) */
export function Spinner({ size = 16, hidden = false, className = '', ...rest }: SpinnerProps) {
  const status = hidden ? { 'aria-hidden': true } : { role: 'status', 'aria-label': t('common.loading') }
  return (
    <svg
      className={`spinner ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      focusable="false"
      {...status}
      {...rest}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="spinner-arc" />
    </svg>
  )
}
