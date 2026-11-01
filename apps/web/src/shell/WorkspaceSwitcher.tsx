import { useEffect, useState } from 'react'
import type { WorkspaceDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'

/**
 * ORG-00: مبدّل المساحات في الشريط الجانبي — يظهر لمن له مساحتان فأكثر.
 * التبديل يحفظ الاختيار لهذه الجلسة في الخادم ثم يعيد تحميل التطبيق كاملاً،
 * فلا تبقى قائمة أو عدّاد من المساحة السابقة في أي حالة محلية.
 */
export function WorkspaceSwitcher({ onSwitched = () => window.location.assign('/') }: { onSwitched?: () => void }) {
  const [list, setList] = useState<WorkspaceDto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    client
      .listMyWorkspaces(ac.signal)
      .then(setList)
      .catch(() => {})
    return () => ac.abort()
  }, [])

  if (list.length < 2) return null
  const active = list.find((w) => w.active)?.id ?? ''

  async function change(id: string) {
    if (id === active) return
    setBusy(true)
    setError('')
    try {
      await client.switchWorkspace(id)
      onSwitched()
    } catch {
      setError(t('ws.switchError'))
      setBusy(false)
    }
  }

  return (
    <div className="ws-switch">
      <select aria-label={t('ws.switchA11y')} value={active} disabled={busy} onChange={(e) => void change(e.target.value)}>
        {list.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  )
}
