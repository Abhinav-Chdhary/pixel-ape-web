import type { Background, PixelProject, PixelWorkspace } from './types'

export const DEFAULT_PALETTE = [
  '#ff3b30', '#ff7a70', '#8f1d18',
  '#34c759', '#7ee29a', '#176b2d',
  '#2979ff', '#73a7ff', '#123e91',
  '#ffd60a', '#f4f1e8', '#171812',
]

export function createProject(options: Partial<Pick<PixelProject, 'name' | 'width' | 'height' | 'background'>> = {}): PixelProject {
  const width = clampSize(options.width)
  const height = clampSize(options.height)
  return {
    version: 1,
    name: options.name ?? 'Untitled sprite',
    width,
    height,
    background: options.background ?? 'transparent',
    pixels: Array<string | null>(width * height).fill(null),
  }
}

export function createWorkspace(): PixelWorkspace {
  const sprite = { ...createProject(), id: createId() }
  return { version: 2, activeSpriteId: sprite.id, palette: [...DEFAULT_PALETTE], sprites: [sprite] }
}

export function normalizeProject(value: unknown): PixelProject {
  const fallback = createProject()
  if (!value || typeof value !== 'object') return fallback
  const input = value as Partial<PixelProject>
  const width = clampSize(input.width)
  const height = clampSize(input.height)
  const size = width * height
  const pixels = Array.isArray(input.pixels)
    ? input.pixels.slice(0, size).map((pixel) => typeof pixel === 'string' ? pixel : null)
    : []
  while (pixels.length < size) pixels.push(null)

  return {
    version: 1,
    name: typeof input.name === 'string' ? input.name.slice(0, 80) : fallback.name,
    width,
    height,
    background: typeof input.background === 'string' ? input.background : fallback.background,
    pixels,
  }
}

export function normalizeWorkspace(value: unknown): PixelWorkspace {
  if (!value || typeof value !== 'object') return createWorkspace()
  const input = value as Partial<PixelWorkspace>
  if (!Array.isArray(input.sprites)) {
    const sprite = { ...normalizeProject(value), id: 'sprite-1' }
    return { version: 2, activeSpriteId: sprite.id, palette: normalizePalette(input.palette), sprites: [sprite] }
  }
  const sprites = input.sprites.slice(0, 50).map((sprite, index) => ({
    ...normalizeProject(sprite),
    id: typeof sprite?.id === 'string' && sprite.id ? sprite.id : `sprite-${index}-${createId()}`,
  }))
  if (!sprites.length) return createWorkspace()
  const activeSpriteId = sprites.some((sprite) => sprite.id === input.activeSpriteId) ? input.activeSpriteId! : sprites[0].id
  return { version: 2, activeSpriteId, palette: normalizePalette(input.palette), sprites }
}

function normalizePalette(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_PALETTE]
  return value.map((color) => typeof color === 'string' ? color : null)
}

export function resizeProject(project: PixelProject, width: number, height: number, background: Background = project.background): PixelProject {
  const nextWidth = clampSize(width)
  const nextHeight = clampSize(height)
  const pixels = Array<string | null>(nextWidth * nextHeight).fill(null)
  for (let y = 0; y < Math.min(project.height, nextHeight); y++) {
    for (let x = 0; x < Math.min(project.width, nextWidth); x++) pixels[y * nextWidth + x] = project.pixels[y * project.width + x]
  }
  return { ...project, width: nextWidth, height: nextHeight, background, pixels }
}

function clampSize(value: unknown) {
  const numeric = typeof value === 'number' ? Math.round(value) : 24
  return Math.max(4, Math.min(64, numeric))
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
}

export function fillPixels(
  pixels: Array<string | null>,
  width: number,
  height: number,
  startIndex: number,
  color: string,
) {
  const source = pixels[startIndex]
  if (source === color) return pixels
  const next = [...pixels]
  const queue = [startIndex]
  const visited = new Set<number>()

  while (queue.length) {
    const index = queue.pop()!
    if (visited.has(index) || next[index] !== source) continue
    visited.add(index)
    next[index] = color
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) queue.push(index - 1)
    if (x < width - 1) queue.push(index + 1)
    if (y > 0) queue.push(index - width)
    if (y < height - 1) queue.push(index + width)
  }
  return next
}

type Point = { x: number; y: number }

export function drawLinePixels(pixels: Array<string | null>, width: number, height: number, start: Point, end: Point, color: string) {
  return paintPoints(pixels, width, height, linePoints(start, end), color)
}

export function erasePixels(pixels: Array<string | null>, width: number, height: number, point: Point, size: number) {
  return erasePoints(pixels, width, height, [point], size)
}

export function eraseLinePixels(pixels: Array<string | null>, width: number, height: number, start: Point, end: Point, size: number) {
  return erasePoints(pixels, width, height, linePoints(start, end), size)
}

export function drawCurvePixels(pixels: Array<string | null>, width: number, height: number, start: Point, control: Point, end: Point, color: string) {
  const distance = Math.abs(control.x - start.x) + Math.abs(control.y - start.y) + Math.abs(end.x - control.x) + Math.abs(end.y - control.y)
  const steps = Math.max(1, distance * 2)
  const points: Point[] = []
  let previous = start
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps
    const inverse = 1 - progress
    const current = {
      x: Math.round(inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x),
      y: Math.round(inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y),
    }
    points.push(...linePoints(previous, current))
    previous = current
  }
  return paintPoints(pixels, width, height, points, color)
}

function paintPoints(pixels: Array<string | null>, width: number, height: number, points: Point[], color: string) {
  const next = [...pixels]
  let changed = false
  for (const { x, y } of points) {
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    const index = y * width + x
    if (next[index] !== color) { next[index] = color; changed = true }
  }
  return changed ? next : pixels
}

function erasePoints(pixels: Array<string | null>, width: number, height: number, points: Point[], size: number) {
  const next = [...pixels]
  let changed = false
  const offset = Math.floor((size - 1) / 2)
  for (const { x, y } of points) {
    for (let eraseY = y - offset; eraseY < y - offset + size; eraseY++) {
      for (let eraseX = x - offset; eraseX < x - offset + size; eraseX++) {
        if (eraseX < 0 || eraseX >= width || eraseY < 0 || eraseY >= height) continue
        const index = eraseY * width + eraseX
        if (next[index] !== null) { next[index] = null; changed = true }
      }
    }
  }
  return changed ? next : pixels
}

function linePoints(start: Point, end: Point) {
  const points: Point[] = []
  let { x, y } = start
  const deltaX = Math.abs(end.x - start.x)
  const deltaY = -Math.abs(end.y - start.y)
  const stepX = start.x < end.x ? 1 : -1
  const stepY = start.y < end.y ? 1 : -1
  let error = deltaX + deltaY
  while (true) {
    points.push({ x, y })
    if (x === end.x && y === end.y) return points
    const doubledError = 2 * error
    if (doubledError >= deltaY) { error += deltaY; x += stepX }
    if (doubledError <= deltaX) { error += deltaX; y += stepY }
  }
}
