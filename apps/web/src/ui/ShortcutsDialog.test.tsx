import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ShortcutsDialog } from './ShortcutsDialog'
import { t } from '../i18n'

/** UX-04: قائمة الاختصارات — حوار بمعايير وصولية (role=dialog، Esc يغلق) */
describe('ShortcutsDialog', () => {
  it('يعرض كل الاختصارات الخمسة مع وصفها العربي', () => {
    render(<ShortcutsDialog onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(t('shortcuts.search'))).toBeTruthy()
    expect(screen.getByText(t('shortcuts.undo'))).toBeTruthy()
    expect(screen.getByText(t('shortcuts.redo'))).toBeTruthy()
    expect(screen.getByText(t('shortcuts.esc'))).toBeTruthy()
    expect(screen.getByText(t('shortcuts.help'))).toBeTruthy()
    expect(screen.getByText(t('shortcuts.capture'))).toBeTruthy()
  })

  it('Esc وزر الإغلاق يناديان onClose', () => {
    let closed = 0
    render(<ShortcutsDialog onClose={() => closed++} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closed).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: t('shortcuts.close') }))
    expect(closed).toBe(2)
  })
})
