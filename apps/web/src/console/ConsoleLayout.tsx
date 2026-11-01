import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { t } from '../i18n'

export interface ConsoleSection {
  to: string
  label: string
  /** يطابق المسار حرفياً فقط — لقسم الرئيسية كي لا يبقى نشطاً تحت أقسامه */
  end?: boolean
}

/**
 * م٢ (الخطة §13): هيكل واحد للوحات الثلاث — إدارة المنصة، ولوحة الشركة، ولوحة الشريك لاحقاً.
 * كل لوحة تمرّر قائمة أقسامها فقط، فلا تتكرر القائمة الجانبية ولا حالاتها.
 */
export function ConsoleLayout({ title, sections, children }: { title: string; sections: ConsoleSection[]; children: ReactNode }) {
  return (
    <div className="console">
      <aside className="console-side">
        <h1 className="console-title">{title}</h1>
        <nav aria-label={title}>
          {sections.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end} className={({ isActive }) => `console-item${isActive ? ' sel' : ''}`}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <Link className="console-back" to="/">
          {t('console.backToLibrary')}
        </Link>
      </aside>
      <main className="console-main">{children}</main>
    </div>
  )
}
