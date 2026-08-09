import { describe, expect, test } from 'bun:test'
import { makePreview, parseCursor, serializeCursor } from './publication.js'

describe('publication preview', () => {
  test('keeps small sprite pixels untouched', () => {
    expect(makePreview({ title: 'Tiny', width: 2, height: 2, background: 'transparent', pixels: ['#000', '#fff', null, '#f00'] }, 64)).toEqual({ width: 2, height: 2, pixels: ['#000', '#fff', null, '#f00'] })
  })

  test('samples a large sprite on a nearest-neighbor grid capped to the requested edge', () => {
    const pixels = Array.from({ length: 16 }, (_, index) => String(index))
    expect(makePreview({ title: 'Large', width: 4, height: 4, background: 'transparent', pixels }, 2)).toEqual({ width: 2, height: 2, pixels: ['0', '2', '8', '10'] })
  })
})

test('gallery cursors are opaque but round-trip their position', () => {
  const cursor = serializeCursor('2026-08-09T12:00:00.000Z', 'row-1')
  expect(parseCursor(cursor)).toEqual({ updatedAt: '2026-08-09T12:00:00.000Z', id: 'row-1' })
  expect(parseCursor('not-a-cursor')).toBeNull()
})
