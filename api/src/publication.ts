export type Visibility = 'unlisted' | 'gallery'

export type SpriteSnapshot = { title: string; width: number; height: number; background: string; pixels: Array<string | null> }

export function isVisibility(value: unknown): value is Visibility { return value === 'unlisted' || value === 'gallery' }

export function makePreview(sprite: SpriteSnapshot, maxDimension = 64) {
  const scale = Math.max(1, Math.ceil(Math.max(sprite.width, sprite.height) / maxDimension))
  const width = Math.ceil(sprite.width / scale)
  const height = Math.ceil(sprite.height / scale)
  const pixels: Array<string | null> = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.push(sprite.pixels[Math.min(sprite.height - 1, y * scale) * sprite.width + Math.min(sprite.width - 1, x * scale)] ?? null)
  return { width, height, pixels }
}

export function parseCursor(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { updatedAt?: unknown; id?: unknown }
    return typeof parsed.updatedAt === 'string' && typeof parsed.id === 'string' ? { updatedAt: parsed.updatedAt, id: parsed.id } : null
  } catch { return null }
}

export function serializeCursor(updatedAt: string, id: string) { return Buffer.from(JSON.stringify({ updatedAt, id })).toString('base64url') }
