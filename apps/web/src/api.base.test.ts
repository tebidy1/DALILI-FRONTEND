import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * الإنتاج: الويب على `daleel.*` والـAPI (لارافل) على دومين آخر `apidaleel.*` — لا بروكسي
 * هناك، فالعميل يحتاج أصل الـAPI وقت البناء (`VITE_API_BASE`). محليًّا يبقى فارغًا
 * فتمرّ المسارات نسبيةً عبر بروكسي Vite كما كانت.
 */
async function loadClient() {
  vi.resetModules()
  return (await import('./api')).client
}

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"comments":[]}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('أصل الـAPI في عميل الويب', () => {
  it('بلا VITE_API_BASE: مسارات نسبية (بروكسي Vite محليًّا)', async () => {
    vi.stubEnv('VITE_API_BASE', '')
    const fetchMock = stubFetch()
    const client = await loadClient()
    await client.shareComments('tok')
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/share/tok/comments')
  })

  it('مع VITE_API_BASE: كل نداء يذهب لأصل الـAPI — والشرطة الأخيرة لا تتضاعف', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test/')
    const fetchMock = stubFetch()
    const client = await loadClient()
    await client.shareComments('tok')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.example.test/api/share/tok/comments')
  })
})
