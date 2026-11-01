import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LibraryOverviewDto } from '@dalili/shared'
import { t, type TKey } from '../i18n'
import { EXTENSION_INSTALL_URL } from '../lib/extension-install'
import { Button } from '../ui/Button'

const HIDDEN_KEY = 'itqan.onboardingHidden'

type State = NonNullable<LibraryOverviewDto['onboarding']>

type Item = { key: keyof State | 'extension'; label: TKey; to: string; external?: boolean }
const EXTENSION: Item = { key: 'extension', label: 'onboarding.extension', to: EXTENSION_INSTALL_URL, external: true }

/** البنود بترتيبها: ما يحسبه الخادم يُعلَّم مكتملاً، والإضافة رابط تثبيت (لا يعرف الخادم إن ثُبّتت) */
const COMPANY: Item[] = [
  { key: 'departments', label: 'onboarding.departments', to: '/admin/members' },
  { key: 'members', label: 'onboarding.members', to: '/admin/members' },
  EXTENSION,
  { key: 'guides', label: 'onboarding.guides', to: EXTENSION_INSTALL_URL, external: true },
]
/** ش١: قائمة بداية الشريك — الملف العام، ثم فريقه كأي شركة (أقسام ودعوات)، وأول دليل رسمي */
const PARTNER: Item[] = [
  { key: 'profile', label: 'onboarding.profile', to: '/admin/profile' },
  { key: 'departments', label: 'onboarding.teamDepartments', to: '/admin/members' },
  { key: 'members', label: 'onboarding.team', to: '/admin/members' },
  EXTENSION,
  { key: 'guides', label: 'onboarding.officialGuide', to: EXTENSION_INSTALL_URL, external: true },
]

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * م٢ (الخطة §3.2): قائمة البداية لمدير الشركة في الرئيسية. تختفي وحدها حين تكتمل بنود الخادم،
 * أو حين يخفيها المدير — والإخفاء راحة لهذا المتصفح فقط.
 */
export function OnboardingChecklist({ state }: { state: LibraryOverviewDto['onboarding'] }) {
  const [hidden, setHidden] = useState(readHidden)
  if (!state || hidden) return null
  const items = 'profile' in state ? PARTNER : COMPANY
  if (items.every((i) => i.key === 'extension' || state[i.key])) return null

  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY, '1')
    } catch {
      /* التخزين محجوب: يبقى الإخفاء لهذه الزيارة فقط */
    }
    setHidden(true)
  }

  return (
    <section className="card onboarding" aria-labelledby="onboarding-title">
      <div className="row onboarding-head">
        <h2 id="onboarding-title" className="console-h3">{t('onboarding.title')}</h2>
        <Button size="sm" variant="ghost" onClick={hide}>{t('onboarding.hide')}</Button>
      </div>
      <ol className="onboarding-list">
        {items.map((item) => {
          const done = item.key !== 'extension' && state[item.key]
          return (
            <li key={item.key} className={done ? 'done' : undefined}>
              {done ? (
                <span>{t(item.label)}</span>
              ) : item.external ? (
                <a href={item.to} target="_blank" rel="noreferrer">{t(item.label)}</a>
              ) : (
                <Link to={item.to}>{t(item.label)}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
