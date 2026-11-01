import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { client } from '../api'
import { t, type TKey } from '../i18n'
import { Button } from '../ui/Button'
import { notifyAuthChanged } from '../lib/ext-bridge'
import { WorkspaceSwitcher } from '../shell/WorkspaceSwitcher'

/** سبب منع واحد يُعرض بدل المحتوى: عضوية معطّلة (ORG-07)، أو حساب موقوف أو منتهٍ (م١) */
type Blocked = 'disabled' | 'suspended' | 'ended'

const BLOCKED_TEXT: Record<Blocked, { title: TKey; body: TKey }> = {
  disabled: { title: 'auth.disabledTitle', body: 'auth.disabledBody' },
  suspended: { title: 'auth.suspendedTitle', body: 'auth.suspendedBody' },
  ended: { title: 'auth.endedTitle', body: 'auth.endedBody' },
}

/** حارس الدخول — تأثير متعادل يتحمل StrictMode (لا تسريب حالة بين التركيب والفك) */
export function AuthGate({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const [state, setState] = useState<'checking' | 'ok' | 'out' | Blocked>('checking')

  useEffect(() => {
    let live = true
    client
      .me()
      .then((me) => {
        if (!live) return
        const status = me?.accountStatus
        setState(!me ? 'out' : status === 'suspended' || status === 'ended' ? status : 'ok')
      })
      .catch((err: { code?: string }) => {
        // ORG-07: المعطَّل في كل مساحاته يرى السبب — لا ارتداد صامت لشاشة الدخول
        if (live) setState(err?.code === 'E-ORG-02' ? 'disabled' : 'out')
      })
    return () => {
      live = false
    }
  }, [])

  async function logout() {
    await client.logout().catch(() => {})
    notifyAuthChanged()
    window.location.assign('/login')
  }

  if (state === 'checking') return <div className="page-center">{t('auth.checking')}</div>
  if (state === 'out') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (state !== 'ok') {
    const text = BLOCKED_TEXT[state]
    return (
      <div className="page-center">
        <div className="card invite-page" role="alert">
          <h1 className="screen-title">{t(text.title)}</h1>
          <p>{t(text.body)}</p>
          {/* الحساب الموقوف لا يعلق صاحبه: يبدّل إلى حساب آخر له إن وُجد */}
          {state !== 'disabled' && <WorkspaceSwitcher />}
          <Button variant="ghost" onClick={() => void logout()}>{t('common.logout')}</Button>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
