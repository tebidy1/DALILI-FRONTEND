import type { DiscoverGuideDto, DiscoverResponseDto } from '@dalili/shared'
import { guidesCountAr } from '@/lib/discover'
import { t } from '@/lib/i18n'
import { GuideRow } from './GuideRow'
import { PartnerSection } from './PartnerSection'

/**
 * ت (§٣.٥، القانون ٤): قائمة «لهذه الشاشة / لهذا الموقع» بحالاتها — تحميل، وفارغ،
 * وخطأ، ونتائج — وشاشة الحجب حين يكون الحساب أو العضوية غير فعّالين. لا شاشة بيضاء ولا زر ميت.
 */

/** off = التبويب ليس صفحة ويب (لا شيء يُعرض) */
export type DiscoverState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DiscoverResponseDto }

export function PanelState({ title, hint, tone, action }: { title: string; hint?: string; tone?: 'warn'; action?: { label: string; onClick: () => void; primary?: boolean } }) {
  return (
    <div className="pstate" role="status">
      <b className={tone === 'warn' ? 'pstate-t warn' : 'pstate-t'}>{title}</b>
      {hint && <span className="pstate-h">{hint}</span>}
      {action && (
        <button type="button" className={action.primary ? 'pstate-btn primary' : 'pstate-btn'} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

function Group({ label, count, guides, onOpenHere }: { label: string; count: number; guides: DiscoverGuideDto[]; onOpenHere?: (id: string) => void }) {
  if (!guides.length) return null
  return (
    <>
      <div className="discover-head">
        <span className="discover-badge">{guidesCountAr(count)}</span>
        <span>{label}</span>
      </div>
      {guides.map((g) => (
        <GuideRow key={g.id} g={g} onOpenHere={onOpenHere} />
      ))}
    </>
  )
}

export function DiscoverArea({ state, canCreate, onRetry, onStart, onOpenHere }: {
  state: DiscoverState
  canCreate: boolean
  onRetry: () => void
  onStart: () => void
  onOpenHere?: (id: string) => void
}) {
  if (state.status === 'off') return null
  if (state.status === 'loading') {
    return (
      <div className="discover" aria-busy="true">
        <div className="sk-line" />
        {[0, 1, 2].map((i) => <div key={i} className="sk-row" />)}
      </div>
    )
  }
  if (state.status === 'error') {
    return <PanelState title={t('ext.loadFail')} hint={t('ext.loadFailHint')} action={{ label: t('ext.retry'), onClick: onRetry }} />
  }
  const { data } = state
  // أدلة الشريك بعد أدلة الشركة دائمًا، ولو خلت الشركة من أي دليل (قرار المالك 2026-10-31)
  return (
    <>
      {data.count === 0 ? (
        <PanelState
          title={t('ext.emptyScreen')}
          hint={t('ext.emptyScreenHint')}
          action={canCreate ? { label: t('ext.recordFirst'), onClick: onStart, primary: true } : undefined}
        />
      ) : (
        <div className="discover">
          <Group label={t('ext.onThisScreen')} count={data.onScreen.length} guides={data.onScreen} onOpenHere={onOpenHere} />
          <Group label={t('ext.onThisSite')} count={data.count} guides={data.onSite} onOpenHere={onOpenHere} />
        </div>
      )}
      <PartnerSection guides={data.official ?? []} onOpenHere={onOpenHere} />
    </>
  )
}

/** suspended/ended = الحساب النشط (E-ACC-01/02)، disabled = كل العضويات معطّلة (E-ORG-02) */
export function BlockedScreen({ kind, accountName, other, onSwitch }: {
  kind: 'suspended' | 'ended' | 'disabled'
  accountName?: string
  other?: { id: string; name: string }
  onSwitch?: (id: string) => void
}) {
  const copy = {
    suspended: { title: t('ext.accSuspended'), hint: t('ext.accSuspendedHint'), code: 'E-ACC-01' },
    ended: { title: t('ext.accEnded'), hint: t('ext.accEndedHint'), code: 'E-ACC-02' },
    disabled: { title: t('ext.memberDisabled'), hint: t('ext.memberDisabledHint'), code: 'E-ORG-02' },
  }[kind]
  return (
    <div className="blocked">
      {accountName && <bdi className="blocked-acct">{accountName}</bdi>}
      <PanelState
        title={copy.title}
        hint={copy.hint}
        tone="warn"
        action={other && onSwitch ? { label: t('ext.switchTo', { name: other.name }), onClick: () => onSwitch(other.id) } : undefined}
      />
      <small className="blocked-code">{copy.code}</small>
    </div>
  )
}
