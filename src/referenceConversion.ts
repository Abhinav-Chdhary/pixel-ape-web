import { parseColor, toHex } from './components/04_organisms/colorModels'

export type ReferenceFit = 'contain' | 'cover'
export type ReferencePaletteMode = 'current' | 'auto'

export type ReferenceConversionOptions = {
  fit: ReferenceFit
  paletteMode: ReferencePaletteMode
  palette: Array<string | null>
  autoColorCount: number
  dither: boolean
}

export type ReferenceConversionResult = {
  pixels: Array<string | null>
  palette: string[]
}

type Rgb = { red: number; green: number; blue: number }
type PaletteColor = Rgb & { value: string; lab: [number, number, number] }

const ALPHA_THRESHOLD = 96
const MAX_PALETTE_SAMPLES = 8192

export function convertReferenceImage(
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
  options: ReferenceConversionOptions,
): ReferenceConversionResult {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  const scale = options.fit === 'cover'
    ? Math.max(width / image.width, height / image.height)
    : Math.min(width / image.width, height / image.height)
  const renderedWidth = image.width * scale
  const renderedHeight = image.height * scale
  context.drawImage(image, (width - renderedWidth) / 2, (height - renderedHeight) / 2, renderedWidth, renderedHeight)

  const rgba = context.getImageData(0, 0, width, height).data
  const currentPalette = options.palette.filter((color): color is string => Boolean(color))
  const palette = options.paletteMode === 'auto' || currentPalette.length === 0
    ? extractPalette(rgba, options.autoColorCount)
    : [...new Set(currentPalette)]

  return { pixels: quantizeRgbaPixels(rgba, width, height, palette, options.dither), palette }
}

export function extractPalette(rgba: ArrayLike<number>, requestedColors: number): string[] {
  const samples: Rgb[] = []
  const pixelCount = Math.floor(rgba.length / 4)
  const stride = Math.max(1, Math.ceil(pixelCount / MAX_PALETTE_SAMPLES))
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4
    if (rgba[offset + 3] < ALPHA_THRESHOLD) continue
    samples.push({ red: rgba[offset], green: rgba[offset + 1], blue: rgba[offset + 2] })
  }
  if (!samples.length) return ['#000000']

  const boxes: Rgb[][] = [samples]
  const colorCount = Math.max(2, Math.min(32, Math.round(requestedColors)))
  while (boxes.length < colorCount) {
    let splitIndex = -1
    let splitChannel: keyof Rgb = 'red'
    let bestScore = 0
    boxes.forEach((box, index) => {
      if (box.length < 2) return
      const ranges = colorRanges(box)
      const channel = ranges.green > ranges.red && ranges.green >= ranges.blue ? 'green' : ranges.blue > ranges.red ? 'blue' : 'red'
      const score = ranges[channel] * box.length
      if (score > bestScore) { bestScore = score; splitIndex = index; splitChannel = channel }
    })
    if (splitIndex < 0 || bestScore === 0) break
    const sorted = [...boxes[splitIndex]].sort((a, b) => a[splitChannel] - b[splitChannel])
    const midpoint = Math.ceil(sorted.length / 2)
    boxes.splice(splitIndex, 1, sorted.slice(0, midpoint), sorted.slice(midpoint))
  }

  return [...new Set(boxes.map((box) => toHex(averageColor(box))))]
}

export function quantizeRgbaPixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  paletteValues: string[],
  dither: boolean,
): Array<string | null> {
  const palette = paletteValues.map((value) => {
    const { red, green, blue } = parseColor(value)
    return { red, green, blue, value, lab: rgbToOklab({ red, green, blue }) } satisfies PaletteColor
  })
  if (!palette.length) return Array<string | null>(width * height).fill(null)

  const working = new Float32Array(width * height * 3)
  for (let pixel = 0; pixel < width * height; pixel++) {
    working[pixel * 3] = rgba[pixel * 4]
    working[pixel * 3 + 1] = rgba[pixel * 4 + 1]
    working[pixel * 3 + 2] = rgba[pixel * 4 + 2]
  }

  const pixels = Array<string | null>(width * height).fill(null)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      if (rgba[pixel * 4 + 3] < ALPHA_THRESHOLD) continue
      const offset = pixel * 3
      const source = {
        red: clampChannel(working[offset]),
        green: clampChannel(working[offset + 1]),
        blue: clampChannel(working[offset + 2]),
      }
      const nearest = nearestPaletteColor(source, palette)
      pixels[pixel] = nearest.value
      if (!dither) continue
      diffuseError(working, rgba, width, height, x + 1, y, source, nearest, 7 / 16)
      diffuseError(working, rgba, width, height, x - 1, y + 1, source, nearest, 3 / 16)
      diffuseError(working, rgba, width, height, x, y + 1, source, nearest, 5 / 16)
      diffuseError(working, rgba, width, height, x + 1, y + 1, source, nearest, 1 / 16)
    }
  }
  return pixels
}

function diffuseError(working: Float32Array, rgba: ArrayLike<number>, width: number, height: number, x: number, y: number, source: Rgb, target: Rgb, weight: number) {
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const pixel = y * width + x
  if (rgba[pixel * 4 + 3] < ALPHA_THRESHOLD) return
  const offset = pixel * 3
  working[offset] += (source.red - target.red) * weight
  working[offset + 1] += (source.green - target.green) * weight
  working[offset + 2] += (source.blue - target.blue) * weight
}

function nearestPaletteColor(source: Rgb, palette: PaletteColor[]) {
  const lab = rgbToOklab(source)
  let nearest = palette[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of palette) {
    const distance = (lab[0] - candidate.lab[0]) ** 2 + (lab[1] - candidate.lab[1]) ** 2 + (lab[2] - candidate.lab[2]) ** 2
    if (distance < nearestDistance) { nearest = candidate; nearestDistance = distance }
  }
  return nearest
}

function rgbToOklab({ red, green, blue }: Rgb): [number, number, number] {
  const r = linearChannel(red / 255)
  const g = linearChannel(green / 255)
  const b = linearChannel(blue / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function linearChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function colorRanges(colors: Rgb[]) {
  const channels: Array<keyof Rgb> = ['red', 'green', 'blue']
  return channels.reduce((ranges, channel) => {
    let minimum = 255
    let maximum = 0
    colors.forEach((color) => { minimum = Math.min(minimum, color[channel]); maximum = Math.max(maximum, color[channel]) })
    ranges[channel] = maximum - minimum
    return ranges
  }, { red: 0, green: 0, blue: 0 })
}

function averageColor(colors: Rgb[]) {
  const total = colors.reduce((sum, color) => ({ red: sum.red + color.red, green: sum.green + color.green, blue: sum.blue + color.blue }), { red: 0, green: 0, blue: 0 })
  return { red: Math.round(total.red / colors.length), green: Math.round(total.green / colors.length), blue: Math.round(total.blue / colors.length), opacity: 100 }
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value))
}
