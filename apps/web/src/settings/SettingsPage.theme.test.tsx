import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FolderDto, LibraryOverviewDto } from '@dalili/shared'
import { vi } from 'vitest'
import { client } from '../api'
import { t } from '../i18n'
import { THEME_KEY, readTheme } from '../lib/theme'
import { OverviewProvider } from '../shell/OverviewContext'
import { SettingsPage } from './SettingsPage'

/**
 * خاصية الثيم في الإعداد (2026-09-06): خياران — الهوية الجديدة (حبر ليلي، الافتراضي)
 * والجرافيت القديم. الاختيار يطبَّق فورًا على <html data-theme> ويُحفظ محليًا.
 */

vi.mock('../api', () => ({
  client: {
    libraryOverview: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    // ‏vi.fn() العاري يعيد undefined، و chooseTheme ينادي .catch عليه — فيهرب
    // استثناء غير ملتقط يعدّه vitest خطأ تشغيل ويُسقط اختبارًا بريئًا في ملف آخر
    setMyTheme: vi.fn().mockResolvedValue(undefined),
    // DTOP-03: بطاقة الأجهزة الجديدة في الإعداد — بلاها تنهار في الاختبارات القائمة
    listDevices: vi.fn().mockResolvedValue([]),
  },
}))

const OVERVIEW: LibraryOverviewDto = {
  workspaceName: 'مساحة الفواتير',
  myRole: 'admin',
  myEmail: 'owner@dalili.sa',
  myTheme: 'brand',
        myLocale: 'ar',
  counts: { all: 1, mine: 1, published: 0, saved: 0 },
  sites: [],
}

const FOLDERS: FolderDto[] = []

function renderSettings() {
  vi.mocked(client.libraryOverview).mockResolvedValue(OVERVIEW)
  vi.mocked(client.listFolders).mockResolvedValue(FOLDERS)
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <OverviewProvider>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </OverviewProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('خاصية الثيم في الإعداد', () => {
  it('بطاقة المظهر بخياريها — والافتراضي المحدد هو الهوية الجديدة', async () => {
    renderSettings()
    await screen.findByText('مساحة الفواتير')

    const card = screen.getByText(t('settings.theme')).closest('.settings-card') as HTMLElement
    const brandBtn = card.querySelector('[aria-pressed]') as HTMLButtonElement
    expect(brandBtn.getAttribute('aria-pressed')).toBe('true')
    expect(brandBtn.textContent).toContain(t('settings.themeBrand'))
    expect(card.textContent).toContain(t('settings.themeClassic'))
  })

  it('اختيار الجرافيت: data-theme=classic فورًا على <html> + محفوظ في التخزين المحلي', async () => {
    renderSettings()
    await screen.findByText('مساحة الفواتير')

    const classicBtn = screen.getByText(t('settings.themeClassic')).closest('button') as HTMLButtonElement
    fireEvent.click(classicBtn)

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('classic')
      expect(localStorage.getItem(THEME_KEY)).toBe('classic')
    })
  })

  it('العودة للهوية الجديدة ترفع السمة وتحدّث المحفوظ', async () => {
    localStorage.setItem(THEME_KEY, 'classic')
    renderSettings()
    await screen.findByText('مساحة الفواتير')

    fireEvent.click(screen.getByText(t('settings.themeBrand')).closest('button') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBeUndefined()
      expect(localStorage.getItem(THEME_KEY)).toBe('brand')
    })
  })

  it('readTheme يقرأ المحفوظ ويرفض القيمة الغريبة (يرجع الافتراضي)', async () => {
    expect(readTheme()).toBe('brand')
    localStorage.setItem(THEME_KEY, 'classic')
    expect(readTheme()).toBe('classic')
    localStorage.setItem(THEME_KEY, 'nonsense')
    expect(readTheme()).toBe('brand')
  })

  it('مزامنة الخادم: الاختيار يُكتب عبر client.setMyTheme', async () => {
    vi.mocked(client.setMyTheme).mockResolvedValue({ myTheme: 'classic' })
    renderSettings()
    await screen.findByText('مساحة الفواتير')

    fireEvent.click(screen.getByText(t('settings.themeClassic')).closest('button') as HTMLButtonElement)
    await waitFor(() => expect(vi.mocked(client.setMyTheme)).toHaveBeenCalledWith('classic'))
  })

  it('فشل الكتابة للخادم → رسالة صدق، والثيم يبقى مطبقًا محليًا', async () => {
    vi.mocked(client.setMyTheme).mockRejectedValue(new Error('network'))
    renderSettings()
    await screen.findByText('مساحة الفواتير')

    fireEvent.click(screen.getByText(t('settings.themeClassic')).closest('button') as HTMLButtonElement)
    await screen.findByText(t('settings.themeSyncError'))
    expect(document.documentElement.dataset.theme).toBe('classic')
  })
})
