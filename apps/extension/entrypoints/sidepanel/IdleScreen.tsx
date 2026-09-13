import type { Dispatch, SetStateAction } from 'react'
import type { MeDto } from '@dalili/shared'
import type { DiscoverResponseDto } from '@dalili/shared'
import type { RecentGuide } from '@/lib/recent'
import { searchHref, relativeTimeAr, filterByTitle } from '@/lib/recent'
import { guidesCountAr } from '@/lib/discover'
import { capabilities, CAPS_PANEL } from '@/lib/capabilities'
import { WEB_BASE } from '@/lib/config'
import type { PreferredStart } from '@/lib/settings-store'
import { RecordIcon, MicIcon, SearchIcon } from './icons'
import { ItqanLockup } from '@/lib/itqan-mark'
import { GuideRow } from './GuideRow'

/** شاشة الخمول في اللوحة الجانبية — الاقتطاع من App.tsx لقانون الحجم (المكوّن ≤250) */

type SendMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

const ZWJ = '‍'

/**
 * العبارة التي يختصرها الاسم — الحروف الأربعة المأخوذة منها تبرز بالحبر.
 * تمييز حرف داخل كلمة عربية يكسر وصل الحروف، فيُحاط كل حدّ عنصر بـ ZWJ
 * ليبقى الشكل السياقي صحيحًا (التقنية نفسها المستعملة في الموقع).
 */
function BrandPhrase() {
  const w = (before: string, src: string, after: string) => (
    <>
      {before}
      {before ? ZWJ : ''}
      <b>{before ? ZWJ : ''}{src}{ZWJ}</b>
      {ZWJ}
      {after}
    </>
  )
  return (
    <p className="signin-phrase">
      <span>{w('', 'إ', 'جراءات')}</span>{' '}
      <span>{w('ال', 'ت', 'شغيل')}</span>{' '}
      <span>{w('ال', 'ق', 'ياسية')}</span>{' '}
      <span>{w('ال', 'ن', 'شطة')}</span>
    </p>
  )
}

export function IdleScreen({
  send,
  me,
  query,
  setQuery,
  discover,
  recent,
  recentErr,
  preferredStart = 'plain',
  onOpenHere,
}: {
  send: (t: SendMsg) => void
  me: MeDto | null
  query: string
  setQuery: Dispatch<SetStateAction<string>>
  discover: DiscoverResponseDto | null
  recent: RecentGuide[]
  recentErr: string
  /** الإعدادات: طريقة البدء المفضّلة — تقود أيّ الزرّين يكون الأساسي (النصوص والترتيب ثابتان) */
  preferredStart?: PreferredStart
  /** PNL-01: زر ↵ — يفتح الدليل داخل اللوحة */
  onOpenHere?: (id: string) => void
}) {
  const audioFirst = preferredStart === 'audio'
  return (
    <div className="body">
      <button className={audioFirst ? 'cta cta-2' : 'cta'} onClick={() => send('start')}>
        <RecordIcon /> ابدأ الالتقاط
      </button>
      {/* VOX-AUTO: يفتح صفحة إذن قصيرة ثم يبدأ الالتقاط — كل بطاقة جديدة يبدأ عليها
          تسجيل تعليقك تلقائيًا حتى البطاقة التالية، ويُحوَّل إلى نص مرفق بالبطاقة */}
      <button
        className={audioFirst ? 'cta' : 'cta cta-2'}
        title="صوتك يُسجَّل مع كل بطاقة تلقائيًا ويُحوَّل نصًا — قل ما تريد ثم التقط التالية"
        onClick={() => send('start-with-audio')}
      >
        <MicIcon /> ابدأ مع تعليق صوتي
      </button>
      {/* فراغ ثابت مكان سطر اختصار لوحة المفاتيح — الثلث الأول يتنفس (طلب المالك 2026-09-09) */}
      <div className="kbd-gap" aria-hidden="true" />

      {me ? (
        <>
          {/* بحث في الوسط — تصفية فورية للأخيرة، وEnter يفتح البحث الكامل في الويب */}
          <div className="search">
            <SearchIcon />
            <input
              type="search"
              placeholder="ابحث في أدلتك…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const href = searchHref(WEB_BASE, query)
                if (href) window.open(href, '_blank')
              }}
            />
          </div>

          {/* SRCH-04 تطوّر: مجموعتان — أدلة هذه الشاشة أولًا ثم بقية الموقع (الأكثر مشاهدة أولًا) */}
          {discover && (
            <div className="discover">
              {discover.onScreen.length > 0 && (
                <>
                  <div className="discover-head">
                    <span className="discover-badge">{guidesCountAr(discover.onScreen.length)}</span>
                    <span>على هذه الشاشة</span>
                  </div>
                  {discover.onScreen.map((g) => (
                    <GuideRow key={g.id} id={g.id} title={g.title} sub={relativeTimeAr(g.updatedAt)} onOpenHere={onOpenHere} />
                  ))}
                </>
              )}
              {discover.onSite.length > 0 && (
                <>
                  <div className="discover-head">
                    <span className="discover-badge">{guidesCountAr(discover.count)}</span>
                    <span>على هذا الموقع</span>
                  </div>
                  {discover.onSite.map((g) => (
                    <GuideRow key={g.id} id={g.id} title={g.title} sub={relativeTimeAr(g.updatedAt)} onOpenHere={onOpenHere} />
                  ))}
                </>
              )}
            </div>
          )}

          <div className="recent">
            <div className="recent-head">
              <span>الأدلة الأخيرة</span>
              <a href={`${WEB_BASE}/`} target="_blank" rel="noreferrer">المكتبة ↗</a>
            </div>
            {recentErr && <div className="muted center small">{recentErr}</div>}
            {!recentErr && filterByTitle(recent, query).length === 0 && (
              <div className="muted center small">
                {query.trim() ? 'لا نتائج مطابقة' : 'لا أدلة بعد — ابدأ الالتقاط لإنشاء أوّل دليل'}
              </div>
            )}
            {filterByTitle(recent, query).map((g) => (
              <GuideRow
                key={g.id}
                id={g.id}
                title={g.title}
                sub={`${relativeTimeAr(g.updatedAt)} · ${g.stepCount.toLocaleString('ar-EG')} خطوة`}
                onOpenHere={onOpenHere}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="signin">
          {/* شاشة الدخول هي أول لقاء بالعلامة — القفل كاملًا ثم العبارة التي اشتُقّ منها الاسم */}
          <div className="signin-brand">
            <ItqanLockup width={220} stroke={7} />
            <BrandPhrase />
          </div>
          <div className="muted center small">غير مسجّل الدخول — الالتقاط يعمل، والنشر وعرض أدلتك يحتاجان دخولًا</div>
          <button className="ghost" onClick={() => window.open(`${WEB_BASE}/login?return=extension`, '_blank')}>
            تسجيل الدخول
          </button>
          <div className="center">
            <a href={`${WEB_BASE}/`} target="_blank" rel="noreferrer">افتح المكتبة ↗</a>
          </div>
        </div>
      )}

      {/* CAP-19: تدهور معلن — عنوان يجيب «ما هذه؟» + تمهيد ومفتاح رموز */}
      <details className="caps">
        <summary>{CAPS_PANEL.title}</summary>
        <p className="caps-note">{CAPS_PANEL.intro}</p>
        <ul>
          {capabilities().map((c) => (
            <li key={c.id} className={c.ok ? 'cap-ok' : 'cap-no'}>
              <span aria-hidden>{c.ok ? '✓' : '—'}</span> {c.label}
            </li>
          ))}
        </ul>
        <p className="caps-note">{CAPS_PANEL.legend}</p>
      </details>
    </div>
  )
}
