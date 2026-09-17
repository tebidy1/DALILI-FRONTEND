import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { t } from '../i18n'

/**
 * UX- المرحلة ١: نافذة تأكيد موحدة لكل المواضع الخطرة — بدل ثلاثة أنماط متفرقة
 * (نافذة نظام قبيحة، ولمستان، وحوار أنيق واحد). النداء وعد: `if (!(await
 * confirm({...}))) return` فيستبدل `window.confirm` في مقعده دون قلب تدفق الدالة.
 * بلا مزوّد (عرض جزئي) يرتد إلى `window.confirm` كي لا يسقط أي سطح يستخدمه.
 */

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  /** افتراضيًا نص العنوان نفسه — خصّصه بفعل العمل حين يختلف عن السؤال مثل «حذف» */
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmCtx = createContext<ConfirmFn | null>(null)

const fallbackConfirm: ConfirmFn = (opts) =>
  Promise.resolve(
    window.confirm(typeof opts.body === 'string' && opts.body ? `${opts.title}\n${opts.body}` : opts.title),
  )

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const settling = useRef(false)

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        settling.current = false
        setState({ ...opts, resolve })
      }),
    [],
  )

  const settle = useCallback(
    (v: boolean) => {
      if (!state || settling.current) return
      settling.current = true
      state.resolve(v)
      setState(null)
    },
    [state],
  )

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state !== null}
        title={state?.title ?? ''}
        body={state?.body}
        confirmLabel={state?.confirmLabel ?? state?.title ?? t('common.confirm')}
        cancelLabel={state?.cancelLabel ?? t('common.cancel')}
        danger={state?.danger}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmCtx.Provider>
  )
}

/** اطرح سؤال تأكيد موحّد — يستخدم النافذة الأنيقة، ويرتد لنافذة النظام بلا مزوّد */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx) ?? fallbackConfirm
}
