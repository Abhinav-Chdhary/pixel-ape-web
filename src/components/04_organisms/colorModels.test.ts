import { describe, expect, test } from 'bun:test'
import { formatColor, getColorChannels, hslToRgb, hsvToRgb, parseColor, rgbToHsl, rgbToHsv, setColorChannel } from './colorModels'

const red = { red: 255, green: 0, blue: 0, opacity: 100 }

describe('color model conversions', () => {
  test('converts RGB primaries to HSV and HSL', () => {
    expect(rgbToHsv(red)).toEqual({ hue: 0, saturation: 100, value: 100 })
    expect(rgbToHsl(red)).toEqual({ hue: 0, saturation: 100, lightness: 50 })
    expect(rgbToHsv({ ...red, red: 0, green: 255 })).toEqual({ hue: 120, saturation: 100, value: 100 })
    expect(rgbToHsl({ ...red, red: 0, blue: 255 })).toEqual({ hue: 240, saturation: 100, lightness: 50 })
  })

  test('converts HSV and HSL values back to RGB', () => {
    expect(hsvToRgb({ hue: 240, saturation: 100, value: 100 })).toEqual({ red: 0, green: 0, blue: 255 })
    expect(hslToRgb({ hue: 120, saturation: 100, lightness: 50 })).toEqual({ red: 0, green: 255, blue: 0 })
  })

  test('uses zero saturation for neutral colors', () => {
    const gray = { red: 128, green: 128, blue: 128, opacity: 62 }
    expect(rgbToHsv(gray)).toEqual({ hue: 0, saturation: 0, value: 50 })
    expect(rgbToHsl(gray)).toEqual({ hue: 0, saturation: 0, lightness: 50 })
  })
})

describe('color model editing', () => {
  test('edits gray as equal RGB channels and preserves opacity', () => {
    expect(setColorChannel({ red: 10, green: 20, blue: 30, opacity: 45 }, 'gray', 'gray', 180)).toEqual({ red: 180, green: 180, blue: 180, opacity: 45 })
  })

  test('derives color controls for each mode', () => {
    expect(getColorChannels(red, 'rgb').map(({ label }) => label)).toEqual(['R', 'G', 'B', 'A'])
    expect(getColorChannels(red, 'hsv').map(({ label }) => label)).toEqual(['H', 'S', 'V', 'A'])
    expect(getColorChannels(red, 'hsl').map(({ label }) => label)).toEqual(['H', 'S', 'L', 'A'])
    expect(getColorChannels(red, 'gray').map(({ label }) => label)).toEqual(['Gray', 'A'])
  })
})

describe('CSS color compatibility', () => {
  test('parses existing CSS color formats and serializes rgba colors', () => {
    expect(parseColor('#1a2b3c')).toEqual({ red: 26, green: 43, blue: 60, opacity: 100 })
    expect(parseColor('rgba(12, 34, 56, 0.45)')).toEqual({ red: 12, green: 34, blue: 56, opacity: 45 })
    expect(parseColor('transparent')).toEqual({ red: 0, green: 0, blue: 0, opacity: 0 })
    expect(formatColor({ red: 12, green: 34, blue: 56, opacity: 45 })).toBe('rgba(12, 34, 56, 0.45)')
  })
})
