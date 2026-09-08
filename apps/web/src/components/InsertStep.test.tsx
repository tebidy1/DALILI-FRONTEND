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

  // BKL-01: القائمة تتبع نوع المستند — الكرّاسة تجمع الأدلة ولا تلتقطها
  it('قائمة الكرّاسة تعرض كتلها ولا تعرض الالتقاط ولا الخطوة اليدوية', () => {
    const onInsert = vi.fn()
    render(<InsertStep label="أضف" insertAt={2} docKind="booklet" onInsert={onInsert} />)
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    for (const name of [
      t('editor.addText'),
      t('editor.addHeader'),
      t('editor.addEmbed'),
      t('editor.addImage'),
      t('editor.addLink'),
      t('editor.addDivider'),
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeTruthy()
    }
    expect(screen.queryByRole('menuitem', { name: t('editor.addCaptureItem') })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: t('editor.addStepManual') })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addEmbed') }))
    expect(onInsert).toHaveBeenCalledWith('embed', 2)
  })

  it('قائمة الدليل لا تعرض كتل الكرّاسة — المسار القائم بلا تغيير', () => {
    render(<InsertStep label="أضف" insertAt={0} docKind="guide" onInsert={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    expect(screen.getByRole('menuitem', { name: t('editor.addCaptureItem') })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: t('editor.addEmbed') })).toBeNull()
  })

  // طلب المالك 2026-09-07: بطاقات مرتّبة — رمز فوق كل خيار واسمه تحته
  it('كل خيار بطاقة برمز فوق اسمه — والرمز مخفيّ عن قارئ الشاشة فالاسم يبقى نظيفًا', () => {
    render(<InsertStep label="أضف" insertAt={0} docKind="booklet" onInsert={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    const item = screen.getByRole('menuitem', { name: t('editor.addText') })
    const glyph = item.querySelector('.insert-menu-glyph')
    expect(glyph?.getAttribute('aria-hidden')).toBe('true')
    expect(glyph?.textContent?.length).toBeGreaterThan(0)
    // الرمز أولًا ثم الاسم — لا العكس
    expect(item.firstElementChild).toBe(glyph)
    expect(item.querySelector('.insert-menu-label')?.textContent).toBe(t('editor.addText'))
  })

  it('Esc يغلق المنبثقة', () => {
    render(<InsertStep label="أضف" insertAt={0} onInsert={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    expect(screen.queryByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
