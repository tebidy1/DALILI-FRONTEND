import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TranslateDialog } from './TranslateDialog'

afterEach(cleanup)

describe('TranslateDialog TRNS-01', () => {
  it('حالة المعلومات: الصدق الثلاثي + زر الترجمة', () => {
    render(<TranslateDialog phase="info" hasTranslation={false} stale={false} onTranslate={() => {}} onClose={() => {}} />)
    expect(screen.getByText('يُترجَم: العنوان والوصف وعناوين الخطوات وملاحظاتها ونصوص الكتل النصية.')).toBeTruthy()
    expect(screen.getByText('لا يُترجَم: محتوى الصور يبقى كما هو، وتسجيلاتك الصوتية تبقى بصوتك.')).toBeTruthy()
    expect(screen.getByText(/تُرسَل نصوص الخطوات/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ترجم الآن' })).toBeTruthy()
  })

  it('بترجمة قائمة: زر إعادة + تنويهة القدم عند كونها قديمة', () => {
    const { rerender } = render(<TranslateDialog phase="info" hasTranslation stale={false} onTranslate={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'إعادة الترجمة' })).toBeTruthy()
    expect(screen.queryByText(/الترجمة قديمة/)).toBeNull()

    rerender(<TranslateDialog phase="info" hasTranslation stale onTranslate={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/الترجمة قديمة/)).toBeTruthy()
  })

  it('حالة التقدم: نص جارٍ وبلا زر تنفيذ', () => {
    render(<TranslateDialog phase="running" hasTranslation={false} stale={false} onTranslate={() => {}} onClose={() => {}} />)
    expect(screen.getByText('جارٍ الترجمة...')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ترجم الآن' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'إعادة الترجمة' })).toBeNull()
  })

  it('حالة الخطأ: الرسالة ظاهرة وزر الترجمة يعود متاحًا', () => {
    render(<TranslateDialog phase="error" errorMsg="تعذّرت الترجمة من مزوّد الذكاء الصناعي — أعد المحاولة لاحقًا" hasTranslation={false} stale={false} onTranslate={() => {}} onClose={() => {}} />)
    expect(screen.getByText('تعذّرت الترجمة من مزوّد الذكاء الصناعي — أعد المحاولة لاحقًا')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ترجم الآن' })).toBeTruthy()
  })

  it('الإغلاق عند النقر خارج البطاقة', () => {
    const onClose = vi.fn()
    render(<TranslateDialog phase="info" hasTranslation={false} stale={false} onTranslate={() => {}} onClose={onClose} />)
    screen.getByRole('dialog').parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
