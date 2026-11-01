import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { t } from '../i18n'
import type { ModerateFn } from './moderation'

/** ب (PUB-03): الإيقاف بسبب إلزامي — النافذة لا تُرسل فارغاً، وتبقى مفتوحة مع خطأ الخادم */
export function SuspendDialog(p: { title: string; onModerate: ModerateFn; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const clean = reason.trim()
    if (!clean) {
      setError(t('home.suspendNeedReason'))
      return
    }
    setBusy(true)
    setError('')
    const ok = await p.onModerate({ kind: 'suspend', reason: clean })
    setBusy(false)
    if (ok) p.onClose()
    else setError(t('home.moderateError'))
  }

  return (
    <ConfirmDialog
      open
      title={t('home.suspendTitle')}
      body={
        <>
          <p>
            <bdi>{p.title}</bdi> — {t('home.suspendBody')}
          </p>
          <label>
            {t('home.suspendReason')}
            <textarea className="suspend-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </>
      }
      confirmLabel={t('home.suspendConfirm')}
      cancelLabel={t('common.cancel')}
      danger
      busy={busy}
      errorAr={error || undefined}
      onConfirm={() => void submit()}
      onCancel={p.onClose}
    />
  )
}
