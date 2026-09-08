import type { Dispatch, SetStateAction } from 'react'
import type { MeDto } from '@dalili/shared'
import type { DiscoverResponseDto } from '@dalili/shared'
import type { RecentGuide } from '@/lib/recent'
import { searchHref, relativeTimeAr, filterByTitle } from '@/lib/recent'
import { guidesCountAr } from '@/lib/discover'
import { capabilities, CAPS_PANEL } from '@/lib/capabilities'
import { WEB_BASE } from '@/lib/config'
import { RecordIcon, MicIcon, SearchIcon, DocIcon } from './icons'

/** شاشة الخمول في اللوحة الجانبية — الاقتطاع من App.tsx لقانون الحجم (المكوّن ≤250) */

type SendMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

export function IdleScreen({
  send,
  me,
  query,
  setQuery,
  discover,
  recent,
  recentErr,
}: {
  send: (t: SendMsg) => void
  me: MeDto | null
  query: string
  setQuery: Dispatch<SetStateAction<string>>
  discover: DiscoverResponseDto | null
  recent: RecentGuide[]
  recentErr: string
}) {
  return (
    <div className="body">
      <button className="cta" onClick={() => send('start')}>
        <RecordIcon /> ابدأ الالتقاط
      </button>
      {/* VOX-01: يفتح صفحة إذن قصيرة ثم يبدأ الالتقاط مع تعليقك الصوتي */}
      <button className="cta cta-2" onClick={() => send('start-with-audio')}>
        <MicIcon /> ابدأ مع تعليق صوتي
      </button>
      <div className="kbd">اختصار <b>Ctrl</b>+<b>Shift</b>+<b>U</b> لبدء/إنهاء الالتقاط</div>

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
                    <a key={g.id} className="doc" href={`${WEB_BASE}/g/${g.id}`} target="_blank" rel="noreferrer">
                      <span className="doc-ic"><DocIcon /></span>
                      <span className="doc-tx">
                        <bdi>{g.title}</bdi>
                        <small>{relativeTimeAr(g.updatedAt)}</small>
                      </span>
                    </a>
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
                    <a key={g.id} className="doc" href={`${WEB_BASE}/g/${g.id}`} target="_blank" rel="noreferrer">
                      <span className="doc-ic"><DocIcon /></span>
                      <span className="doc-tx">
                        <bdi>{g.title}</bdi>
                        <small>{relativeTimeAr(g.updatedAt)}</small>
                      </span>
                    </a>
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
              <a key={g.id} className="doc" href={`${WEB_BASE}/g/${g.id}`} target="_blank" rel="noreferrer">
                <span className="doc-ic"><DocIcon /></span>
                <span className="doc-tx">
                  <bdi>{g.title}</bdi>
                  <small>{relativeTimeAr(g.updatedAt)} · {g.stepCount.toLocaleString('ar-EG')} خطوة</small>
                </span>
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="signin">
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
