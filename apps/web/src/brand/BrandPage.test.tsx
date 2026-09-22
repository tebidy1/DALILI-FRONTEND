import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BrandPage } from './BrandPage'

function renderBrand() {
  return render(
    <MemoryRouter initialEntries={['/brand']}>
      <BrandPage />
    </MemoryRouter>,
  )
}

describe('BrandPage — صفحة عرض الهوية البصرية', () => {
  it('يعرض الصيحة الحاشدة والجملة المساندة', () => {
    renderBrand()
    expect(screen.getByText('اشرحها مرة… تكفِ الجميع')).toBeTruthy()
    expect(screen.getByText(/لقطة لكل خطوة/)).toBeTruthy()
  })

  it('يعرض لوحة الألوان بقيمها المعتمدة', () => {
    renderBrand()
    for (const hex of ['#16324F', '#C97B2D', '#F7F4EE', '#0F1E2E', '#1C2B33']) {
      expect(screen.getByText(hex)).toBeTruthy()
    }
  })

  it('يحذّر صريحًا من التوليفة الممنوعة (عنبر على رمل)', () => {
    renderBrand()
    expect(screen.getByText(/٢٫٧:١/)).toBeTruthy()
  })

  it('يعرض أعمدة الرسائل الأربعة مع إثبات كل عمود', () => {
    renderBrand()
    expect(screen.getByText('دقتنا رقم منشور، لا وعد.')).toBeTruthy()
    expect(screen.getByText('البحث بالمعنى لا بالكلمة.')).toBeTruthy()
    expect(screen.getByText('خصوصيتك على بنيتك.')).toBeTruthy()
    expect(screen.getByText('التقاط أثناء العمل، لا جلسات تمثيل.')).toBeTruthy()
    expect(screen.getAllByText(/بوابة/).length).toBeGreaterThan(0)
  })

  it('يعرض أمثلة الصوت: افعل ولا تفعل', () => {
    renderBrand()
    expect(screen.getAllByText('افعل').length).toBe(2)
    expect(screen.getAllByText('لا تفعل').length).toBe(2)
  })

  it('يعرض الشعار بأحجامه الثلاثة مع قاعدة الفراغ', () => {
    renderBrand()
    expect(screen.getByText(/٤٨ \/ ٢٤ \/ ١٦ بكسل/)).toBeTruthy()
    expect(screen.getByText(/شبكة ٨ بكسل/)).toBeTruthy()
  })
})
