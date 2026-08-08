import { describe, expect, test } from 'bun:test'
import { extractPalette, quantizeRgbaPixels } from './referenceConversion'

describe('reference palette conversion', () => {
  test('maps opaque pixels to the closest palette color and preserves transparency', () => {
    const rgba = new Uint8ClampedArray([
      248, 12, 8, 255,
      6, 15, 246, 255,
      255, 0, 0, 20,
    ])

    expect(quantizeRgbaPixels(rgba, 3, 1, ['#ff0000', '#0000ff'], false)).toEqual([
      '#ff0000', '#0000ff', null,
    ])
  })

  test('extracts a deterministic palette from the source image', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 0, 0, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ])

    expect(extractPalette(rgba, 2).sort()).toEqual(['#0000ff', '#ff0000'])
  })

  test('uses error diffusion to mix a limited palette across a flat tone', () => {
    const rgba = new Uint8ClampedArray(Array.from({ length: 8 }, () => [120, 120, 120, 255]).flat())
    const pixels = quantizeRgbaPixels(rgba, 8, 1, ['#000000', '#ffffff'], true)

    expect(new Set(pixels).size).toBe(2)
  })
})
