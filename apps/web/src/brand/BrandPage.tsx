import type { CSSProperties } from 'react'
import { t, type TKey } from '../i18n'
import { PathMark } from './PathMark'
import './brand.css'

/**
 * صفحة عرض الهوية البصرية (/brand) — تحوّل docs/brand-identity.md وbrand-guidelines.md
 * إلى سطح مرئي يفهمه المالك بلا قراءة. الألوان هنا هي مصدر الوصول (Source of Truth)
 * للهوية: مكتوبة بمتغيرات نطاق الصفحة، ولا تُستعمل خارج هذا النطاق.
 */

const COLORS: Array<{ hex: string; name: TKey; role: TKey; dark: boolean }> = [
  { hex: '#16324F', name: 'brand.color.ink', role: 'brand.color.inkRole', dark: true },
  { hex: '#C97B2D', name: 'brand.color.amber', role: 'brand.color.amberRole', dark: true },
  { hex: '#F7F4EE', name: 'brand.color.sand', role: 'brand.color.sandRole', dark: false },
  { hex: '#0F1E2E', name: 'brand.color.night', role: 'brand.color.nightRole', dark: true },
  { hex: '#1C2B33', name: 'brand.color.charcoal', role: 'brand.color.charcoalRole', dark: true },
  { hex: '#5A6B75', name: 'brand.color.smoke', role: 'brand.color.smokeRole', dark: true },
]

const TYPE_ROWS: Array<{ label: TKey; size: number; weight: number; sample: string }> = [
  { label: 'brand.type.h1', size: 48, weight: 600, sample: 'الطريقة لا تستقيل.' },
  { label: 'brand.type.h2', size: 24, weight: 600, sample: 'كل طريقة، دليلًا يعيش.' },
  { label: 'brand.type.h3', size: 20, weight: 500, sample: 'ذاكرة شركتك، بصوت خبرائها.' },
  { label: 'brand.type.body', size: 16, weight: 400, sample: 'دليلي يحفظ طريقة شركتك كما تُنفَّذ فعلًا — بصوت خبيرك لا بكلام مُعاد صياغته.' },
  { label: 'brand.type.caption', size: 13, weight: 400, sample: 'منصة احتفاظ الخبرة التشغيلية — Dalili · ٢٠٢٦' },
]

const PILLARS: Array<{ title: string; proof: TKey }> = [
  { title: 'دقتنا رقم منشور، لا وعد.', proof: 'brand.pillar.werProof' },
  { title: 'البحث بالمعنى لا بالكلمة.', proof: 'brand.pillar.searchProof' },
  { title: 'خصوصيتك على بنيتك.', proof: 'brand.pillar.privacyProof' },
  { title: 'التقاط أثناء العمل، لا جلسات تمثيل.', proof: 'brand.pillar.captureProof' },
]

const VOICE_PAIRS = [
  {
    good: 'فشل التفريغ — الصوت أقصر من ثانيتين. أعد التسجيل أو اكتب الملاحظة يدويًا.',
    bad: 'حدث خطأ ما، نعتذر عن الإزعاج.',
  },
  {
    good: 'WER ‏٨.٣٪ على بوابة عشرة أدلة صوتية ملزمة.',
    bad: 'دقة تفريغ عالية لا مثيل لها!',
  },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="brand-section" aria-label={title}>
      <h2 className="brand-h2">{title}</h2>
      {children}
    </section>
  )
}

export function BrandPage() {
  return (
    <div className="brand-page" dir="rtl">
      <header className="brand-hero">
        <div className="brand-lockup">
          <PathMark size={56} />
          <span className="brand-word">دليلي</span>
        </div>
        <h1 className="brand-h1">{t('brand.tagline')}</h1>
        <p className="brand-support">{t('brand.support')}</p>
      </header>

      <main className="brand-main">
        <Section title={t('brand.sectionColors')}>
          <div className="brand-swatches">
            {COLORS.map((c) => (
              <div key={c.hex} className="brand-swatch-card">
                <div className={'brand-swatch' + (c.dark ? ' is-dark' : '')} style={{ '--sw': c.hex } as CSSProperties}>
                  <span>{c.hex}</span>
                </div>
                <strong>{t(c.name)}</strong>
                <small>{t(c.role)}</small>
              </div>
            ))}
          </div>
          <p className="brand-warn">
            {t('brand.contrastWarn')}
          </p>
        </Section>

        <Section title={t('brand.sectionType')}>
          <div className="brand-type">
            {TYPE_ROWS.map((r) => (
              <div key={r.label} className="brand-type-row">
                <small className="brand-type-label">{t(r.label)}</small>
                <p className="brand-type-sample" style={{ fontSize: r.size, fontWeight: r.weight, lineHeight: r.size > 24 ? 1.3 : 1.7 }}>
                  {r.sample}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t('brand.sectionLogo')}>
          <div className="brand-logo-row">
            <div className="brand-logo-tile is-sand">
              <div className="brand-lockup is-ink">
                <PathMark size={48} />
                <span className="brand-word">دليلي</span>
              </div>
              <small>{t('brand.logoPrimary')}</small>
            </div>
            <div className="brand-logo-tile is-night">
              <div className="brand-lockup">
                <PathMark size={48} />
                <span className="brand-word">دليلي</span>
              </div>
              <small>{t('brand.logoReversed')}</small>
            </div>
            <div className="brand-logo-tile is-sand">
              <div className="brand-sizes">
                <PathMark size={48} />
                <PathMark size={24} />
                <PathMark size={16} />
              </div>
              <small>{t('brand.logoSizes')}</small>
            </div>
          </div>
          <p className="brand-note">{t('brand.logoClearSpace')}</p>
        </Section>

        <Section title={t('brand.sectionMessaging')}>
          <div className="brand-pillars">
            {PILLARS.map((p) => (
              <article key={p.title} className="brand-pillar">
                <h3>{p.title}</h3>
                <p className="brand-proof">{t(p.proof)}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section title={t('brand.sectionVoice')}>
          <div className="brand-voice">
            {VOICE_PAIRS.map((pair, i) => (
              <div key={i} className="brand-voice-pair">
                <blockquote className="is-good">{pair.good}</blockquote>
                <div className="brand-voice-tags">
                  <span className="tag-good">افعل</span>
                  <span className="tag-bad">لا تفعل</span>
                </div>
                <blockquote className="is-bad">{pair.bad}</blockquote>
              </div>
            ))}
          </div>
        </Section>

        <footer className="brand-footer">
          <p>{t('brand.footer')}</p>
          <button type="button" className="brand-btn">{t('brand.cta')}</button>
        </footer>
      </main>
    </div>
  )
}
