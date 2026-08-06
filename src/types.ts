export type Background = string
export type Tool = 'pencil' | 'fill' | 'eraser' | 'eyedropper' | 'line' | 'move'
export type LineMode = 'straight' | 'curve'

export interface PixelProject {
  version: 1
  name: string
  width: number
  height: number
  background: Background
  pixels: Array<string | null>
}

export interface PixelWorkspace {
  version: 2
  activeSpriteId: string
  palette: Array<string | null>
  sprites: Array<PixelProject & { id: string }>
}
