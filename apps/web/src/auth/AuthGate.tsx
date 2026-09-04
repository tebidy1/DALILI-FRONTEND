import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'

/** حارس الدخول — تأثير متعادل يتحمل StrictMode (لا تسريب حالة بين التركيب والفك) */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'out'>('checking')

  useEffect(() => {
    let live = true
    client
      .me()
      .then((me) => {
        if (live) setState(me ? 'ok' : 'out')
      })
      .catch(() => {
        if (live) setState('out')
      })
    return () => {
      live = false
    }
  }, [])

  if (state === 'checking') return <div className="page-center">{t('auth.checking')}</div>
  if (state === 'out') return <Navigate to="/login" replace />
  return <>{children}</>
}
