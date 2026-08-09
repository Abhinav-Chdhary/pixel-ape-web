export type Visibility = 'unlisted' | 'gallery'
export type PixelPayload = { width: number; height: number; background: string; pixels: Array<string | null> }
export type GalleryItem = { slug: string; title: string; width: number; height: number; background: string; authorName: string; updatedAt: string; preview: PixelPayload }
export type PublicSprite = { slug: string; title: string; width: number; height: number; background: string; authorName: string; updatedAt: string; pixels: Array<string | null> }
export type PublicationState = GalleryItem & { url: string; visibility: Visibility }

const origin = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!origin) throw new Error('The public gallery is not configured yet.')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await fetch(`${origin}${path}`, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The public API did not respond. Check that it is running at VITE_API_URL.')
    throw error
  } finally { window.clearTimeout(timeout) }
  const body = await response.json().catch(() => null) as { error?: string } | T | null
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Request failed.')
  return body as T
}

export function getGallery(limit: 6 | 24, cursor?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return request<{ items: GalleryItem[]; nextCursor: string | null }>(`/v1/gallery?${params}`)
}

export function getPublicSprite(slug: string) { return request<PublicSprite>(`/v1/publications/${encodeURIComponent(slug)}`) }

function authorized(token: string) { return { authorization: `Bearer ${token}` } }

export function getPublication(projectId: string, spriteId: string, token: string) {
  return request<PublicationState | null>(`/v1/publications/source/${encodeURIComponent(projectId)}/${encodeURIComponent(spriteId)}`, { headers: authorized(token) })
}

export function publishSprite(projectId: string, spriteId: string, visibility: Visibility, token: string) {
  return request<PublicationState>('/v1/publications', {
    method: 'POST', headers: { ...authorized(token), 'content-type': 'application/json' }, body: JSON.stringify({ projectId, spriteId, visibility }),
  })
}

export function publicUrl(path: string) { return new URL(path, globalThis.location.origin).toString() }
