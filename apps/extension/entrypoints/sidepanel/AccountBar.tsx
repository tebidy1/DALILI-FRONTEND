import { useState } from 'react'
import type { WorkspaceDto } from '@dalili/shared'
import { accountLabels, initialsOf } from '@/lib/accounts'
import { t } from '@/lib/i18n'

/**
 * ت (§٣.٥): شريط الحساب تحت الترويسة — يُظهر دائماً في أي حساب أنت قبل أن تلتقط.
 * أكثر من حساب: زر يفتح قائمة بالنوع والدور. أثناء الالتقاط معطّل مع السبب،
 * فلا تنقسم جلسة واحدة بين حسابين.
 */
export function AccountBar({ accounts, onSwitch, lockedReason }: { accounts: WorkspaceDto[]; onSwitch: (id: string) => void; lockedReason?: string }) {
  const [open, setOpen] = useState(false)
  const active = accounts.find((a) => a.active) ?? accounts[0]
  if (!active) return null
  const face = (
    <>
      <span className="acct-logo" aria-hidden="true">{initialsOf(active.name)}</span>
      <bdi className="acct-name">{active.name}</bdi>
      <span className="acct-kind">{accountLabels(active).kind}</span>
    </>
  )
  if (accounts.length < 2) return <div className="acct">{face}</div>

  return (
    <div className="acct-wrap">
      <button
        type="button"
        className="acct"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!!lockedReason}
        title={lockedReason}
        onClick={() => setOpen((o) => !o)}
      >
        {face}
        <span className="acct-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          {accounts.map((a) => {
            const l = accountLabels(a)
            return (
              <button
                key={a.id}
                type="button"
                role="menuitemradio"
                aria-checked={a.active}
                className={a.active ? 'acct-item on' : 'acct-item'}
                onClick={() => {
                  setOpen(false)
                  if (!a.active) onSwitch(a.id)
                }}
              >
                <span className="acct-logo" aria-hidden="true">{initialsOf(a.name)}</span>
                <bdi className="acct-name">{a.name}</bdi>
                <span className="acct-kind">{`${l.kind} · ${l.role}`}</span>
                {a.active && <span aria-hidden="true">✓</span>}
              </button>
            )
          })}
          <p className="acct-note">{t('ext.switchNote')}</p>
        </div>
      )}
    </div>
  )
}
