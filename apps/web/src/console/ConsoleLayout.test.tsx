import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { t } from '../i18n'
import { ConsoleLayout } from './ConsoleLayout'

/** م٢: هيكل واحد للوحات الثلاث — قائمة أقسام، والقسم النشط من المسار، ورجوع للمكتبة */

describe('ConsoleLayout (م٢)', () => {
  it('يعلّم القسم النشط ويعرض المحتوى والرجوع', () => {
    render(
      <MemoryRouter initialEntries={['/platform/companies']}>
        <ConsoleLayout
          title="إدارة المنصة"
          sections={[
            { to: '/platform', label: 'الرئيسية', end: true },
            { to: '/platform/companies', label: 'الشركات' },
          ]}
        >
          <p>محتوى القسم</p>
        </ConsoleLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'إدارة المنصة' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'الشركات' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'الرئيسية' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByText('محتوى القسم')).toBeTruthy()
    expect(screen.getByRole('link', { name: t('console.backToLibrary') }).getAttribute('href')).toBe('/')
  })
})
