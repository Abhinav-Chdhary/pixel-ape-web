import { DEFAULT_PALETTE } from '../../project'

export const PALETTE_COLUMNS = 8

export type PaletteResizeAxis = 'row' | 'slot'
export type PaletteDragAnchor = { x: number; y: number }

export function isPrimaryPointerPressed(activePointerId: number | null, pointerId: number, buttons: number) {
  return activePointerId === pointerId && (buttons & 1) === 1
}

export function resizePaletteFromDrag(
  startPalette: Array<string | null>,
  axis: PaletteResizeAxis,
  horizontal: number,
  vertical: number,
  cellSize: number,
) {
  if (cellSize <= 0) return startPalette
  const steps = Math.trunc((axis === 'slot' ? horizontal : vertical) / cellSize)
  return resizePaletteBySteps(startPalette, axis, steps)
}

export function updatePaletteDrag(
  palette: Array<string | null>,
  anchor: PaletteDragAnchor,
  pointer: PaletteDragAnchor,
  cellSize: number,
) {
  if (cellSize <= 0) return { palette, anchor }
  const horizontal = pointer.x - anchor.x
  const vertical = pointer.y - anchor.y
  const horizontalSteps = Math.trunc(horizontal / cellSize)
  const verticalSteps = Math.trunc(vertical / cellSize)
  if (!horizontalSteps && !verticalSteps) return { palette, anchor }

  const axis: PaletteResizeAxis = horizontalSteps && verticalSteps
    ? Math.abs(horizontal) >= Math.abs(vertical) ? 'slot' : 'row'
    : horizontalSteps ? 'slot' : 'row'
  const steps = axis === 'slot' ? horizontalSteps : verticalSteps
  const nextPalette = resizePaletteBySteps(palette, axis, steps)
  if (nextPalette === palette) return { palette, anchor }

  return {
    palette: nextPalette,
    anchor: axis === 'slot'
      ? { x: anchor.x + steps * cellSize, y: pointer.y }
      : { x: pointer.x, y: anchor.y + steps * cellSize },
  }
}

function resizePaletteBySteps(palette: Array<string | null>, axis: PaletteResizeAxis, steps: number) {
  let next = palette
  const direction = Math.sign(steps)
  for (let count = 0; count < Math.abs(steps); count++) {
    const candidate = axis === 'slot'
      ? resizeTrailingSlots(next, direction)
      : resizeTrailingRows(next, direction)
    if (candidate === next) break
    next = candidate
  }
  return next
}

function resizeTrailingSlots(startPalette: Array<string | null>, steps: number) {
  const startSlots = startPalette.length
  const rowStart = steps < 0 && startSlots > 0
    ? Math.floor((startSlots - 1) / PALETTE_COLUMNS) * PALETTE_COLUMNS
    : startSlots
  const rowEnd = steps > 0
    ? (Math.floor(startSlots / PALETTE_COLUMNS) + 1) * PALETTE_COLUMNS
    : startSlots
  const targetSlots = clamp(startSlots + steps, rowStart, rowEnd)
  return resizePalette(startPalette, targetSlots)
}

function resizeTrailingRows(startPalette: Array<string | null>, steps: number) {
  if (!steps) return startPalette
  if (steps < 0 && startPalette.length % PALETTE_COLUMNS !== 0) return startPalette

  const startRows = Math.ceil(startPalette.length / PALETTE_COLUMNS)
  const targetRows = Math.max(0, startRows + steps)
  const targetSlots = steps > 0
    ? targetRows * PALETTE_COLUMNS
    : Math.max(0, startPalette.length - (startRows - targetRows) * PALETTE_COLUMNS)
  return resizePalette(startPalette, targetSlots)
}

function resizePalette(startPalette: Array<string | null>, targetSlots: number) {
  if (targetSlots === startPalette.length) return startPalette
  if (targetSlots < startPalette.length) return startPalette.slice(0, targetSlots)
  return [
    ...startPalette,
    ...Array.from({ length: targetSlots - startPalette.length }, (_, offset) => DEFAULT_PALETTE[startPalette.length + offset] ?? null),
  ]
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}
