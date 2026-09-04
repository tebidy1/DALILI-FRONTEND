import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'solid' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** مشغول: سبينر + تعطيل — لا نص «لحظة…» متغير يهتز */
  busy?: boolean
  icon?: ReactNode
}

/**
 * الزر الموحد (UX-01): لا زر خارج هذا المكوّن في شاشات الميزة.
 * variant: solid أساسي · ghost شفاف · danger هادم
 */
export function Button({
  variant = 'solid',
  size = 'md',
  busy = false,
  icon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = ['btn', variant !== 'solid' ? variant : '', size === 'sm' ? 'sm' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={cls} type={type} disabled={disabled || busy} aria-busy={busy} {...rest}>
      {busy ? <Spinner size={14} hidden /> : icon}
      {children}
    </button>
  )
}
