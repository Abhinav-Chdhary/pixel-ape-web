import { describe, expect, test } from 'bun:test'
import { createWorkspace, DEFAULT_PALETTE, normalizeWorkspace } from '../../project'
import { isPrimaryPointerPressed, PALETTE_COLUMNS, resizePaletteFromDrag, updatePaletteDrag } from './paletteResize'

const cellSize = 20

describe('palette resize pointer guards', () => {
  test('requires the same pointer with the primary button pressed', () => {
    expect(isPrimaryPointerPressed(7, 7, 1)).toBe(true)
    expect(isPrimaryPointerPressed(7, 7, 0)).toBe(false)
    expect(isPrimaryPointerPressed(7, 8, 1)).toBe(false)
    expect(isPrimaryPointerPressed(null, 7, 1)).toBe(false)
  })

  test('movement below one grid step does not resize', () => {
    const result = updatePaletteDrag(DEFAULT_PALETTE, { x: 0, y: 0 }, { x: 19, y: 19 }, cellSize)

    expect(result.palette).toBe(DEFAULT_PALETTE)
    expect(result.anchor).toEqual({ x: 0, y: 0 })
  })
})

describe('continuous palette gestures', () => {
  test('stopping while pressed keeps every added slot', () => {
    const moved = updatePaletteDrag(DEFAULT_PALETTE, { x: 0, y: 0 }, { x: cellSize * 4, y: 0 }, cellSize)
    const stopped = updatePaletteDrag(moved.palette, moved.anchor, { x: cellSize * 4, y: 0 }, cellSize)

    expect(moved.palette).toHaveLength(16)
    expect(stopped.palette).toBe(moved.palette)
    expect(stopped.anchor).toEqual(moved.anchor)
  })

  test('can turn from right to down in the same press', () => {
    const right = updatePaletteDrag(DEFAULT_PALETTE, { x: 0, y: 0 }, { x: cellSize * 4, y: 0 }, cellSize)
    const down = updatePaletteDrag(right.palette, right.anchor, { x: cellSize * 4, y: cellSize }, cellSize)

    expect(right.palette).toHaveLength(16)
    expect(down.palette).toHaveLength(24)
    expect(down.anchor).toEqual({ x: cellSize * 4, y: cellSize })
  })

  test('can keep changing directions during one press', () => {
    const right = updatePaletteDrag(DEFAULT_PALETTE, { x: 0, y: 0 }, { x: cellSize * 4, y: 0 }, cellSize)
    const down = updatePaletteDrag(right.palette, right.anchor, { x: cellSize * 4, y: cellSize }, cellSize)
    const left = updatePaletteDrag(down.palette, down.anchor, { x: cellSize * 3, y: cellSize }, cellSize)

    expect(left.palette).toHaveLength(23)
  })
})

describe('horizontal palette resizing', () => {
  test('adds one trailing slot per grid step across row boundaries', () => {
    const oneSlot = resizePaletteFromDrag(DEFAULT_PALETTE, 'slot', cellSize, 0, cellSize)
    const twentySlots = resizePaletteFromDrag(DEFAULT_PALETTE, 'slot', cellSize * 20, 0, cellSize)

    expect(oneSlot).toEqual([...DEFAULT_PALETTE, null])
    expect(twentySlots).toHaveLength(DEFAULT_PALETTE.length + 20)
    expect(twentySlots.slice(DEFAULT_PALETTE.length)).toEqual(Array(20).fill(null))
  })

  test('a fresh right drag opens the next row after completing the current row', () => {
    const completeRows = [...DEFAULT_PALETTE, ...Array(4).fill(null)]
    const nextRow = resizePaletteFromDrag(completeRows, 'slot', cellSize, 0, cellSize)

    expect(completeRows).toHaveLength(16)
    expect(nextRow).toHaveLength(17)
    expect(nextRow.at(-1)).toBeNull()
  })

  test('removes trailing populated slots and restores defaults when revealed again', () => {
    const reduced = resizePaletteFromDrag(DEFAULT_PALETTE, 'slot', -cellSize, 0, cellSize)
    const restored = resizePaletteFromDrag(reduced, 'slot', cellSize, 0, cellSize)

    expect(reduced).toEqual(DEFAULT_PALETTE.slice(0, -1))
    expect(restored).toEqual(DEFAULT_PALETTE)
  })

  test('always derives the result from the pointer-down snapshot', () => {
    const start = [...DEFAULT_PALETTE, null, null]
    const right = resizePaletteFromDrag(start, 'slot', cellSize, 0, cellSize)
    const stationary = resizePaletteFromDrag(start, 'slot', 0, 0, cellSize)

    expect(right).toHaveLength(start.length + 1)
    expect(stationary).toBe(start)
  })
})

describe('vertical palette resizing', () => {
  test('dragging down adds complete eight-slot rows', () => {
    const oneRow = resizePaletteFromDrag(DEFAULT_PALETTE, 'row', 0, cellSize, cellSize)
    const twoRows = resizePaletteFromDrag(DEFAULT_PALETTE, 'row', 0, cellSize * 2, cellSize)

    expect(oneRow).toHaveLength(PALETTE_COLUMNS * 3)
    expect(oneRow.slice(DEFAULT_PALETTE.length)).toEqual(Array(12).fill(null))
    expect(twoRows).toHaveLength(PALETTE_COLUMNS * 4)
    expect(twoRows.slice(DEFAULT_PALETTE.length)).toEqual(Array(20).fill(null))
  })

  test('dragging up removes only complete trailing rows', () => {
    const completeRows = [...DEFAULT_PALETTE, ...Array(12).fill(null)]

    expect(resizePaletteFromDrag(completeRows, 'row', 0, -cellSize, cellSize)).toHaveLength(16)
    expect(resizePaletteFromDrag(completeRows, 'row', 0, -cellSize * 2, cellSize)).toHaveLength(8)
    expect(resizePaletteFromDrag(DEFAULT_PALETTE, 'row', 0, -cellSize, cellSize)).toBe(DEFAULT_PALETTE)
  })

  test('continues adding rows beyond the previous 40-slot limit', () => {
    const fortySlots = Array<string | null>(40).fill(null)
    const expanded = resizePaletteFromDrag(fortySlots, 'row', 0, cellSize * 2, cellSize)

    expect(expanded).toHaveLength(56)
    expect(expanded.length % PALETTE_COLUMNS).toBe(0)
  })
})

describe('large palettes', () => {
  test('continues adding horizontal slots beyond the previous 40-slot limit', () => {
    const fortySlots = Array<string | null>(40).fill(null)

    expect(resizePaletteFromDrag(fortySlots, 'slot', cellSize, 0, cellSize)).toHaveLength(41)
  })

  test('workspace normalization preserves palettes larger than 40 slots', () => {
    const workspace = createWorkspace()
    const largePalette = Array.from({ length: 56 }, (_, index) => index % 8 === 0 ? '#ff3b30' : null)
    const normalized = normalizeWorkspace({ ...workspace, palette: largePalette })

    expect(normalized.palette).toEqual(largePalette)
  })
})
