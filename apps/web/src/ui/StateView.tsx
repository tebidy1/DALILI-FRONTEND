import type { ReactNode } from 'react'
import { Button } from './Button'

interface StateAction {
  label: string
  onAction: () => void
  busy?: boolean
}

interface StateViewProps {
  /** empty: إرشاد + فعل بداية · error: رسالة محددة + إعادة محاولة */
  kind: 'empty' | 'error'
  icon: ReactNode
  title: string
  desc?: string
  action?: StateAction
}

/**
 * حالة فارغة/خطأ موحدة (UX-02) — لا شاشة بيضاء بلا مخرج أبدًا:
 * أيقونة واحدة، عنوان صادق، وصف يقول ماذا يفعل المستخدم الآن، وفعل واحد.
 */
export function StateView({ kind, icon, title, desc, action }: StateViewProps) {
  return (
    <div className={`state-view ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <div className="state-icon">{icon}</div>
      <h2 className="state-title">{title}</h2>
      {desc && <p className="state-desc">{desc}</p>}
      {action && (
        <Button variant={kind === 'error' ? 'ghost' : 'solid'} onClick={action.onAction} busy={action.busy}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
