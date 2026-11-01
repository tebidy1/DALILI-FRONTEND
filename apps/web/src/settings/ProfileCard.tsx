import { useEffect, useState } from 'react'
import { client } from '../api'
import { t } from '../i18n'
import { Button } from '../ui/Button'

/** م١: «ملفي» — الاسم الذي يراه الزملاء بدل البريد، وتغيير كلمة المرور. الاسم الحالي يأتي من overview */
export function ProfileCard({ initialName }: { initialName?: string | null }) {
  const [name, setName] = useState(initialName ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState<'name' | 'password' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // overview يصل بعد التركيب أحياناً: الاسم يتبعه
  useEffect(() => setName(initialName ?? ''), [initialName])

  /** نداء واحد لكل نموذج: ينتظر، ويعلن النجاح، أو يعرض سبب الرفض كما جاء */
  async function run(kind: 'name' | 'password', call: () => Promise<unknown>, ok: string) {
    setBusy(kind)
    setError('')
    setNotice('')
    try {
      await call()
      setNotice(ok)
      return true
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    await run('name', () => client.updateProfile(name.trim()), t('profile.nameSaved'))
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (await run('password', () => client.changePassword(current, next), t('profile.passwordSaved'))) {
      setCurrent('')
      setNext('')
    }
  }

  return (
    <section className="settings-card" aria-label={t('profile.title')}>
      <h2>{t('profile.title')}</h2>
      <p className="muted card-desc">{t('profile.desc')}</p>
      {error && <div className="err" role="alert">{error}</div>}
      {notice && <div className="ok-note" role="status">{notice}</div>}
      <form className="stack" onSubmit={saveName}>
        <label htmlFor="profile-name">{t('profile.name')}</label>
        <input id="profile-name" required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" type="submit" busy={busy === 'name'}>{t('profile.saveName')}</Button>
      </form>
      <form className="stack" onSubmit={savePassword}>
        <label htmlFor="profile-current">{t('profile.currentPassword')}</label>
        <input id="profile-current" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <label htmlFor="profile-next">{t('profile.newPassword')}</label>
        <input id="profile-next" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Button size="sm" variant="ghost" type="submit" busy={busy === 'password'}>{t('profile.changePassword')}</Button>
      </form>
    </section>
  )
}
