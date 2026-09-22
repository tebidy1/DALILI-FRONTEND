// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto } from '@dalili/shared'
import { EditorPage } from './EditorPage'

/**
 * بلاغ المالك 2026-09-04 (تجربة ثانية): «المطلوب أن يظهر النص أيضًا بحيث يظهر بعد
 * العنوان» — تفريغ «ميك الخطوة» صار note لكن المحرر كان يعرضه أسفل البطاقة بعد
 * اللقطة؛ هنا يُثبَت الترتيب: الرأس (العنوان + 🎙) ثم الملاحظة ثم اللقطة.
 */

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    transcribeGuide: vi.fn(),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(): GuideDetailsDto {
  return {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل الإرجاع',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps: [
        {
          id: 's1',
          kind: 'click',
          title: 'افتح شاشة الطلبات',
          target: {},
          sensitive: false,
          url: 'https://erp.example.com/orders',
          pageTitle: 'الطلبات',
          ts: 1000,
          note: 'هذه الحطوة مهمة جداً لأن لابد من تنفيذها',
          voice: { fileId: 'a1', fileUrl: '/files/a1', durationMs: 7924, pending: false },
          screenshot: { fileId: 'f1', blurRects: [] },
        },
      ],
    },
    share: null,
    meta: { starred: false, folderId: null, tags: [] },
  }
}

/** FOLLOWING: يأتي الثاني في ترتيب المستند بعد الأول */
function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('بلاغ المالك: نص التفريغ يظهر مباشرة بعد العنوان', () => {
  beforeEach(async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    render(
      <MemoryRouter initialEntries={['/g/g1']}>
        <Routes>
          <Route path="/g/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('دليل الإرجاع')
  })

  it('الملاحظة تلي رأس البطاقة (العنوان والشارة) وتسبق اللقطة', () => {
    const head = document.querySelector('.step-head')
    const note = document.querySelector('.step-note-read')
    const figure = document.querySelector('.step-figure')
    expect(head).toBeTruthy()
    expect(note).toBeTruthy()
    expect(note!.textContent).toContain('هذه الحطوة مهمة جداً')
    expect(figure).toBeTruthy()
    expect(follows(head!, note!)).toBe(true)
    expect(follows(note!, figure!)).toBe(true)
  })

  it('شارة الصوت ظاهرة على البطاقة بملفها المرفوع', () => {
    expect(screen.getByRole('button', { name: 'شغّل تعليق الخطوة الصوتي' })).toBeTruthy()
  })
})
