import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InsertStep } from './InsertStep'
import { t } from '../i18n'

describe('InsertStep — منبثقة أنواع الكتل', () => {
  it('النقر على «+» يفتح خمسة خيارات، وكلٌّ يستدعي onInsert بنوعه وموضعه', () => {
    const onInsert = vi.fn()
    render(<InsertStep label="أضف" insertAt={3} onInsert={onInsert} />)
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    for (const name of [
      t('editor.addStepManual'),
      t('editor.addTip'),
      t('editor.addAlert'),
      t('editor.addHeader'),
      t('editor.addCaptureItem'),
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addTip') }))
    expect(onInsert).toHaveBeenCalledWith('tip', 3)
  })

  it('Esc يغلق المنبثقة', () => {
    render(<InsertStep label="أضف" insertAt={0} onInsert={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    expect(screen.queryByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
