export type Color = {
  red: number
  green: number
  blue: number
  opacity: number
}

export type ColorMode = 'rgb' | 'hsv' | 'hsl' | 'gray'

export type ColorChannel = 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'value' | 'lightness' | 'gray' | 'opacity'

export type ColorChannelControl = {
  channel: ColorChannel
  label: string
  min: number
  max: number
  value: number
}

type HsvColor = { hue: number; saturation: number; value: number }
type HslColor = { hue: number; saturation: number; lightness: number }

export function parseColor(color: string | null): Color {
  if (!color || color === 'transparent') return { red: 0, green: 0, blue: 0, opacity: 0 }
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) return { red: Number.parseInt(hex[1].slice(0, 2), 16), green: Number.parseInt(hex[1].slice(2, 4), 16), blue: Number.parseInt(hex[1].slice(4, 6), 16), opacity: 100 }
  const rgba = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
  if (rgba) return { red: clamp(Number(rgba[1]), 0, 255), green: clamp(Number(rgba[2]), 0, 255), blue: clamp(Number(rgba[3]), 0, 255), opacity: clamp(Math.round(Number(rgba[4] ?? 1) * 100), 0, 100) }
  return { red: 0, green: 0, blue: 0, opacity: 100 }
}

export function formatColor({ red, green, blue, opacity }: Color) {
  return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`
}

export function toHex({ red, green, blue }: Color) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export function getColorChannels(color: Color, mode: ColorMode): ColorChannelControl[] {
  const alpha = { channel: 'opacity' as const, label: 'A', min: 0, max: 100, value: color.opacity }
  if (mode === 'rgb') return [
    { channel: 'red', label: 'R', min: 0, max: 255, value: color.red },
    { channel: 'green', label: 'G', min: 0, max: 255, value: color.green },
    { channel: 'blue', label: 'B', min: 0, max: 255, value: color.blue },
    alpha,
  ]
  if (mode === 'gray') return [{ channel: 'gray', label: 'Gray', min: 0, max: 255, value: toGray(color) }, alpha]
  if (mode === 'hsv') {
    const { hue, saturation, value } = rgbToHsv(color)
    return [
      { channel: 'hue', label: 'H', min: 0, max: 360, value: hue },
      { channel: 'saturation', label: 'S', min: 0, max: 100, value: saturation },
      { channel: 'value', label: 'V', min: 0, max: 100, value },
      alpha,
    ]
  }
  const { hue, saturation, lightness } = rgbToHsl(color)
  return [
    { channel: 'hue', label: 'H', min: 0, max: 360, value: hue },
    { channel: 'saturation', label: 'S', min: 0, max: 100, value: saturation },
    { channel: 'lightness', label: 'L', min: 0, max: 100, value: lightness },
    alpha,
  ]
}

export function setColorChannel(color: Color, mode: ColorMode, channel: ColorChannel, value: number): Color {
  if (!Number.isFinite(value)) return color
  if (channel === 'opacity') return { ...color, opacity: clamp(value, 0, 100) }
  if (mode === 'rgb' && (channel === 'red' || channel === 'green' || channel === 'blue')) return { ...color, [channel]: clamp(value, 0, 255) }
  if (mode === 'gray' && channel === 'gray') {
    const gray = clamp(value, 0, 255)
    return { ...color, red: gray, green: gray, blue: gray }
  }
  if (mode === 'hsv') {
    const hsv = rgbToHsv(color)
    if (channel === 'hue') hsv.hue = clamp(value, 0, 360)
    if (channel === 'saturation') hsv.saturation = clamp(value, 0, 100)
    if (channel === 'value') hsv.value = clamp(value, 0, 100)
    return { ...hsvToRgb(hsv), opacity: color.opacity }
  }
  const hsl = rgbToHsl(color)
  if (channel === 'hue') hsl.hue = clamp(value, 0, 360)
  if (channel === 'saturation') hsl.saturation = clamp(value, 0, 100)
  if (channel === 'lightness') hsl.lightness = clamp(value, 0, 100)
  return { ...hslToRgb(hsl), opacity: color.opacity }
}

export function rgbToHsv({ red, green, blue }: Color): HsvColor {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const hue = delta === 0 ? 0 : 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4)
  return { hue: round((hue + 360) % 360), saturation: round(max === 0 ? 0 : delta / max * 100), value: round(max * 100) }
}

export function hsvToRgb({ hue, saturation, value }: HsvColor): Pick<Color, 'red' | 'green' | 'blue'> {
  const h = ((hue % 360) + 360) % 360
  const s = saturation / 100
  const v = value / 100
  const chroma = v * s
  const segment = h / 60
  const x = chroma * (1 - Math.abs(segment % 2 - 1))
  const [r, g, b] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x]
  const match = v - chroma
  return { red: round((r + match) * 255), green: round((g + match) * 255), blue: round((b + match) * 255) }
}

export function rgbToHsl({ red, green, blue }: Color): HslColor {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2
  const hue = delta === 0 ? 0 : 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4)
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return { hue: round((hue + 360) % 360), saturation: round(saturation * 100), lightness: round(lightness * 100) }
}

export function hslToRgb({ hue, saturation, lightness }: HslColor): Pick<Color, 'red' | 'green' | 'blue'> {
  const h = ((hue % 360) + 360) % 360
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const segment = h / 60
  const x = chroma * (1 - Math.abs(segment % 2 - 1))
  const [r, g, b] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x]
  const match = l - chroma / 2
  return { red: round((r + match) * 255), green: round((g + match) * 255), blue: round((b + match) * 255) }
}

function toGray({ red, green, blue }: Color) {
  return round(red * 0.299 + green * 0.587 + blue * 0.114)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function round(value: number) {
  return Math.round(value)
}
