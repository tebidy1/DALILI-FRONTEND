import type { ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  busy?: boolean
  errorAr?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * حوار تأكيد داخل الصفحة — بديل نظيف عن `window.confirm` الذي يقاطع الشاشة
 * فجأة ولا يحمل رسالة خطأ. تكرار الاستعمال: حذف الدليل من المحرر (VER-02)،
 * وأي فعل مستقبلي غير قابل للتراجع فورًا.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  errorAr,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null
  return (
    <div className="confirm-scrim" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        <div className="confirm-body">{body}</div>
        {errorAr && (
          <div className="confirm-error" role="alert">
            {errorAr}
          </div>
        )}
        <div className="confirm-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'danger' : 'solid'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
