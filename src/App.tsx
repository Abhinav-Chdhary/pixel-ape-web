import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentIcon, CloudUploadIcon, CopyIcon } from './icons'
import { TopBar } from './components/03_compounds/TopBar'
import { PalettePanel } from './components/04_organisms/PalettePanel'
import { ToolsPanel } from './components/04_organisms/ToolsPanel'
import { StudioTemplate } from './components/05_templates/StudioTemplate'
import { AuthDialog } from './auth/AuthDialog'
import { useAuth } from './auth/AuthContext'
import { ReferenceConversionDialog } from './components/03_compounds/ReferenceConversionDialog'
import { ReferenceImageDialog } from './components/03_compounds/ReferenceImageDialog'
import { useWorkspace } from './hooks/useWorkspace'
import { ShareDialog } from './public/ShareDialog'
import { createProject, DEFAULT_PALETTE, drawCurvePixels, drawLinePixels, eraseLinePixels, erasePixels, fillPixels, resizeProject } from './project'
import type { Background, LineMode, PixelProject, Tool } from './types'

const backgroundOptions: Array<{ value: Background; label: string }> = [
  { value: 'transparent', label: 'Transparent' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' },
]
const MIN_ZOOM = 100
const MAX_ZOOM = 6400
const MIN_CANVAS_SIZE = 4
const MAX_CANVAS_SIZE = 512
const CANVAS_PIXEL_SCALE = 32
const MAX_EXPORT_DIMENSION = 4096
const EXPORT_SCALES = [1, 4, 8, 16] as const
type ExportScale = typeof EXPORT_SCALES[number]
const recentSpritesStorageKey = 'pixel-ape-web:recent-sprites'
type ReferenceAsset = { image: HTMLImageElement; name: string }
type ReferenceCursor = { clientX: number; clientY: number; x: number; y: number; sourceX: number; sourceY: number; color: string | null }

export function WorkspaceApp() {
  const auth = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [history, setHistory] = useState<PixelProject[]>([])
  const [future, setFuture] = useState<PixelProject[]>([])
  const activeSpriteIdRef = useRef('')
  const handleExternalSpriteChange = useCallback((id: string) => {
    if (id === activeSpriteIdRef.current) { setHistory([]); setFuture([]) }
  }, [])
  const sync = useWorkspace(auth.user, handleExternalSpriteChange)
  const { workspace, cloudProjectId, hydrated, writable, diagnostics, status: fileStatus, syncError, conflict, updateManifest, updateSprite, createSprite: persistNewSprite, resolveConflict, copyConflictDraft, exportConflictDraft, setReconciliationPaused, syncNotice, dismissSyncNotice, showGuestNudge, dismissGuestNudge } = sync
  const [tool, setTool] = useState<Tool>('pencil')
  const [eraserSize, setEraserSize] = useState(() => Number(globalThis.localStorage?.getItem('pixel-ape:eraser-size')) || 1)
  const [canvasHovered, setCanvasHovered] = useState(false)
  const [eyedropperColor, setEyedropperColor] = useState<string | null>(null)
  const [editingPaletteSlot, setEditingPaletteSlot] = useState<number | null>(0)
  const [lineMode, setLineMode] = useState<LineMode>(() => globalThis.localStorage?.getItem('pixel-ape:line-mode') === 'curve' ? 'curve' : 'straight')
  const [curveStage, setCurveStage] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [linePreview, setLinePreview] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [color, setColor] = useState<string | null>(DEFAULT_PALETTE[0])
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [zoomBySprite, setZoomBySprite] = useState<Record<string, number>>({})
  const [gridVisible, setGridVisible] = useState(true)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentPromptCopied, setAgentPromptCopied] = useState(false)
  const [newSpriteOpen, setNewSpriteOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportScale, setExportScale] = useState<ExportScale>(4)
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false)
  const [referenceConversionOpen, setReferenceConversionOpen] = useState(false)
  const [shareSpriteId, setShareSpriteId] = useState<string | null>(null)
  const [closedSpriteIds, setClosedSpriteIds] = useState<Set<string>>(() => new Set())
  const [confirmation, setConfirmation] = useState<
    | { kind: 'clear' }
    | { kind: 'delete'; spriteId: string; spriteName: string }
    | null
  >(null)
  const [recentSpriteIds, setRecentSpriteIds] = useState<string[]>(() => {
    try {
      const saved = globalThis.localStorage?.getItem(recentSpritesStorageKey)
      const parsed: unknown = saved ? JSON.parse(saved) : []
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [newSprite, setNewSprite] = useState({ name: 'Untitled sprite', width: 32, height: 32, background: 'transparent' as Background })
  const [newSpriteSizeDraft, setNewSpriteSizeDraft] = useState({ width: '32', height: '32' })
  const [canvasSizeDraft, setCanvasSizeDraft] = useState({ width: '', height: '' })
  const [referencesBySpriteId, setReferencesBySpriteId] = useState<Record<string, ReferenceAsset>>({})
  const [referenceCursor, setReferenceCursor] = useState<ReferenceCursor | null>(null)
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null)
  const referenceSampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const referenceLoupeCanvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const lineStartRef = useRef<{ x: number; y: number } | null>(null)
  const strokePointRef = useRef<{ x: number; y: number } | null>(null)
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null)
  const selectionMoveOriginRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const selectionMoveStartRef = useRef<{ x: number; y: number } | null>(null)
  const selectionPixelsRef = useRef<Array<string | null> | null>(null)
  const selectionRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const agentPromptResetTimeoutRef = useRef<number | undefined>(undefined)
  const openSprites = workspace.sprites.filter((sprite) => !closedSpriteIds.has(sprite.id))
  const project = workspace.sprites.find((sprite) => sprite.id === workspace.activeSpriteId) ?? openSprites[0] ?? workspace.sprites[0]
  activeSpriteIdRef.current = project.id
  const referenceAsset = referencesBySpriteId[project.id]
  const referenceImage = referenceAsset?.image ?? null
  const referenceName = referenceAsset?.name ?? ''
  const zoom = zoomBySprite[project.id] ?? 1600
  const recentSprites = [
    ...recentSpriteIds.map((id) => workspace.sprites.find((sprite) => sprite.id === id)).filter((sprite): sprite is PixelProject & { id: string } => Boolean(sprite)),
    ...workspace.sprites.filter((sprite) => !recentSpriteIds.includes(sprite.id)),
  ]
  const shareSprite = shareSpriteId ? workspace.sprites.find((sprite) => sprite.id === shareSpriteId) ?? null : null
  const updateSelection = (next: { x: number; y: number; width: number; height: number } | null) => {
    selectionRef.current = next
    setSelection(next)
  }
  // Keep large canvases responsive while retaining crisp pixel rendering.
  const canvasPixelScale = Math.min(CANVAS_PIXEL_SCALE, Math.max(1, Math.floor(2048 / Math.max(project.width, project.height))))

  useEffect(() => {
    setCanvasSizeDraft({ width: String(project.width), height: String(project.height) })
  }, [project.height, project.id, project.width])

  useEffect(() => setReferenceCursor(null), [project.id, referenceImage])
  useEffect(() => setReferenceCursor(null), [tool])

  useEffect(() => {
    setRecentSpriteIds((current) => current[0] === project.id ? current : [project.id, ...current.filter((id) => id !== project.id)].slice(0, 12))
  }, [project.id])

  useEffect(() => {
    globalThis.localStorage?.setItem(recentSpritesStorageKey, JSON.stringify(recentSpriteIds))
  }, [recentSpriteIds])

  const commit = useCallback((update: (current: PixelProject) => PixelProject) => {
    updateSprite(activeSpriteIdRef.current, (active) => {
      const nextSprite = update(active)
      if (nextSprite === active) return active
      setHistory((items) => [...items.slice(-49), active])
      setFuture([])
      return nextSprite
    })
  }, [updateSprite])

  const switchSprite = (id: string) => {
    setClosedSpriteIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    updateManifest((current) => ({ ...current, activeSpriteId: id }))
    setHistory([]); setFuture([]); setCursor({ x: 0, y: 0 })
  }

  const closeSprite = (id: string) => {
    const index = openSprites.findIndex((sprite) => sprite.id === id)
    if (index < 0 || openSprites.length <= 1) return
    if (workspace.activeSpriteId === id) switchSprite(openSprites[index === 0 ? 1 : index - 1].id)
    setClosedSpriteIds((current) => new Set(current).add(id))
    setHistory([]); setFuture([])
  }

  const reorderSprites = (ids: string[]) => {
    updateManifest((current) => {
      if (ids.length !== openSprites.length || new Set(ids).size !== ids.length) return current
      const spriteById = new Map(current.sprites.map((sprite) => [sprite.id, sprite]))
      if (ids.some((id) => !spriteById.has(id))) return current
      let openIndex = 0
      const sprites = current.sprites.map((sprite) => closedSpriteIds.has(sprite.id) ? sprite : spriteById.get(ids[openIndex++])!)
      if (sprites.every((sprite, index) => sprite === current.sprites[index])) return current
      return { ...current, sprites }
    })
  }

  const deleteSprite = (id: string) => {
    updateManifest((current) => {
      const index = current.sprites.findIndex((sprite) => sprite.id === id)
      if (index < 0 || current.sprites.length <= 1) return current
      const sprites = current.sprites.filter((sprite) => sprite.id !== id)
      const activeSpriteId = current.activeSpriteId === id
        ? sprites[Math.min(index, sprites.length - 1)].id
        : current.activeSpriteId
      return { ...current, activeSpriteId, sprites }
    })
    setClosedSpriteIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setReferencesBySpriteId((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
    setReferenceCursor(null)
    setHistory([]); setFuture([])
  }

  const duplicateSprite = async (sprite: PixelProject & { id: string }) => {
    const copy = createProject({ name: `${sprite.name || 'Untitled sprite'} copy`, width: sprite.width, height: sprite.height, background: sprite.background })
    copy.pixels = [...sprite.pixels]
    await persistNewSprite(copy)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key.toLowerCase() === 'p') setTool('pencil')
      if (event.key.toLowerCase() === 'f') setTool('fill')
      if (event.key.toLowerCase() === 'e') setTool('eraser')
      if (event.key.toLowerCase() === 'i') setTool('eyedropper')
      if (event.key.toLowerCase() === 'l') setTool('line')
      if (event.key.toLowerCase() === 'm') setTool('move')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (tool !== 'line') { setCurveStage(null); setLinePreview(null); lineStartRef.current = null }
  }, [tool])

  useEffect(() => {
    if (tool !== 'move') updateSelection(null)
  }, [tool])

  useEffect(() => { globalThis.localStorage?.setItem('pixel-ape:eraser-size', String(eraserSize)) }, [eraserSize])
  useEffect(() => { globalThis.localStorage?.setItem('pixel-ape:line-mode', lineMode) }, [lineMode])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      changeZoom(event.deltaY < 0 ? 100 : -100)
    }
    board.addEventListener('wheel', onWheel, { passive: false })
    return () => board.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => () => window.clearTimeout(agentPromptResetTimeoutRef.current), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const scale = canvas.width / project.width
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (project.background === 'transparent') drawCheckerboard(ctx, canvas.width, canvas.height, scale)
    else { ctx.fillStyle = project.background; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    const visiblePixels = tool === 'move' && selection && selectionMoveOriginRef.current && selectionPixelsRef.current
      ? previewMovedPixels(project.width, selectionMoveOriginRef.current, selection, selectionPixelsRef.current)
      : project.pixels
    visiblePixels.forEach((pixel, index) => { if (pixel) { ctx.fillStyle = pixel; ctx.fillRect((index % project.width) * scale, Math.floor(index / project.width) * scale, scale, scale) } })
    const previewPixels = tool === 'line' && linePreview && color
      ? drawLinePixels(Array<string | null>(project.width * project.height).fill(null), project.width, project.height, linePreview.start, linePreview.end, color)
      : tool === 'line' && curveStage && color
        ? drawCurvePixels(Array<string | null>(project.width * project.height).fill(null), project.width, project.height, curveStage.start, cursor, curveStage.end, color)
        : null
    if (previewPixels) previewPixels.forEach((pixel, index) => { if (pixel) { ctx.fillStyle = pixel; ctx.fillRect((index % project.width) * scale, Math.floor(index / project.width) * scale, scale, scale) } })
    if (gridVisible) {
      ctx.beginPath(); ctx.strokeStyle = project.background === 'black' ? 'rgba(255,255,255,.13)' : 'rgba(23,24,18,.13)'; ctx.lineWidth = 1
      for (let i = 1; i < project.width; i++) { const point = Math.round(i * scale) + .5; ctx.moveTo(point, 0); ctx.lineTo(point, canvas.height) }
      for (let i = 1; i < project.height; i++) { const point = Math.round(i * scale) + .5; ctx.moveTo(0, point); ctx.lineTo(canvas.width, point) }
      ctx.stroke()
    }
    if (tool === 'move' && selection) {
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 2
      ctx.strokeStyle = '#f4f1e8'
      ctx.strokeRect(selection.x * scale + 1, selection.y * scale + 1, selection.width * scale - 2, selection.height * scale - 2)
      ctx.lineDashOffset = 5
      ctx.strokeStyle = '#171812'
      ctx.strokeRect(selection.x * scale + 1, selection.y * scale + 1, selection.width * scale - 2, selection.height * scale - 2)
      ctx.restore()
    }
    if (tool === 'eraser' && canvasHovered) {
      const offset = Math.floor((eraserSize - 1) / 2)
      const x = (cursor.x - offset) * scale
      const y = (cursor.y - offset) * scale
      const size = eraserSize * scale
      ctx.lineWidth = 3; ctx.strokeStyle = '#f4f1e8'; ctx.strokeRect(x, y, size, size)
      ctx.lineWidth = 1; ctx.strokeStyle = '#171812'; ctx.strokeRect(x, y, size, size)
    }
  }, [canvasHovered, color, curveStage, cursor, eraserSize, gridVisible, linePreview, project, selection, tool])

  useEffect(() => {
    const canvas = referenceCanvasRef.current
    if (!canvas || !referenceImage) return
    const ctx = canvas.getContext('2d')!
    const scale = canvas.width / project.width
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const imageWidth = referenceImage.naturalWidth || referenceImage.width
    const imageHeight = referenceImage.naturalHeight || referenceImage.height
    const imageScale = Math.min(canvas.width / imageWidth, canvas.height / imageHeight)
    const width = imageWidth * imageScale
    const height = imageHeight * imageScale
    ctx.drawImage(referenceImage, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    if (gridVisible) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(23,24,18,.35)'; ctx.lineWidth = 1
      for (let i = 1; i < project.width; i++) { const point = Math.round(i * scale) + .5; ctx.moveTo(point, 0); ctx.lineTo(point, canvas.height) }
      for (let i = 1; i < project.height; i++) { const point = Math.round(i * scale) + .5; ctx.moveTo(0, point); ctx.lineTo(canvas.width, point) }
      ctx.stroke()
    }
  }, [gridVisible, project.height, project.width, referenceImage])

  useEffect(() => {
    referenceSampleCanvasRef.current = null
    if (!referenceImage) return
    const width = referenceImage.naturalWidth || referenceImage.width
    const height = referenceImage.naturalHeight || referenceImage.height
    if (!width || !height) return
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.drawImage(referenceImage, 0, 0, width, height)
    referenceSampleCanvasRef.current = canvas
    return () => { referenceSampleCanvasRef.current = null }
  }, [referenceImage])

  useEffect(() => {
    const canvas = referenceLoupeCanvasRef.current
    const sourceCanvas = referenceSampleCanvasRef.current
    if (!canvas || !sourceCanvas || !referenceCursor) return
    const context = canvas.getContext('2d')!
    const sampleSize = Math.min(9, sourceCanvas.width, sourceCanvas.height)
    const half = Math.floor(sampleSize / 2)
    const sourceX = Math.max(0, Math.min(sourceCanvas.width - sampleSize, referenceCursor.sourceX - half))
    const sourceY = Math.max(0, Math.min(sourceCanvas.height - sampleSize, referenceCursor.sourceY - half))
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(sourceCanvas, sourceX, sourceY, sampleSize, sampleSize, 0, 0, canvas.width, canvas.height)
    const cellSize = canvas.width / sampleSize
    context.beginPath()
    context.strokeStyle = 'rgba(23,24,18,.32)'
    context.lineWidth = 1
    for (let index = 1; index < sampleSize; index++) {
      context.moveTo(Math.round(index * cellSize) + .5, 0)
      context.lineTo(Math.round(index * cellSize) + .5, canvas.height)
      context.moveTo(0, Math.round(index * cellSize) + .5)
      context.lineTo(canvas.width, Math.round(index * cellSize) + .5)
    }
    context.stroke()
    context.lineWidth = 3
    context.strokeStyle = '#ff5c35'
    context.strokeRect((referenceCursor.sourceX - sourceX) * cellSize + 1.5, (referenceCursor.sourceY - sourceY) * cellSize + 1.5, cellSize - 3, cellSize - 3)
  }, [referenceCursor, referenceImage])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(project.width - 1, Math.floor((event.clientX - rect.left) / rect.width * project.width))), y: Math.max(0, Math.min(project.height - 1, Math.floor((event.clientY - rect.top) / rect.height * project.height))) }
  }
  const paintAt = (x: number, y: number, withHistory = true) => {
    if (!color && tool !== 'eraser') return
    const paintColor = color
    const index = y * project.width + x
    const updater = (current: PixelProject) => {
      if (tool === 'fill' && paintColor) return { ...current, pixels: fillPixels(current.pixels, current.width, current.height, index, paintColor) }
      if (tool === 'eraser') {
        const pixels = erasePixels(current.pixels, current.width, current.height, { x, y }, eraserSize)
        return pixels === current.pixels ? current : { ...current, pixels }
      }
      if (current.pixels[index] === paintColor) return current
      const pixels = [...current.pixels]; pixels[index] = paintColor
      return { ...current, pixels }
    }
    if (withHistory) commit(updater)
    else updateSprite(project.id, (active) => {
      const next = updater(active)
      return next
    })
  }
  const paintStrokeTo = (point: { x: number; y: number }) => {
    const previous = strokePointRef.current
    if (!previous) return
    if (tool !== 'eraser' && !color) return
    const paintColor = color
    updateSprite(project.id, (current) => {
      const pixels = tool === 'eraser'
        ? eraseLinePixels(current.pixels, current.width, current.height, previous, point, eraserSize)
        : drawLinePixels(current.pixels, current.width, current.height, previous, point, paintColor!)
      return pixels === current.pixels ? current : { ...current, pixels }
    })
    strokePointRef.current = point
  }
  const applySampledColor = (pixel: string | null) => {
    if (!pixel) return
    setColor(pixel)
    if (editingPaletteSlot !== null) {
      updateManifest((current) => ({ ...current, palette: current.palette.map((swatch, index) => index === editingPaletteSlot ? pixel : swatch) }))
      setEyedropperColor(null)
    } else setEyedropperColor(pixel)
  }
  const pickColorAt = (x: number, y: number) => applySampledColor(project.pixels[y * project.width + x])
  const referencePointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => pointFromEvent(event)
  const sampleReferenceAt = (point: { x: number; y: number }) => {
    const canvas = referenceCanvasRef.current
    const sourceCanvas = referenceSampleCanvasRef.current
    if (!canvas || !sourceCanvas || !referenceImage) return null
    const sourceWidth = sourceCanvas.width
    const sourceHeight = sourceCanvas.height
    const scale = canvas.width / project.width
    const imageScale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight)
    const offsetX = (canvas.width - sourceWidth * imageScale) / 2
    const offsetY = (canvas.height - sourceHeight * imageScale) / 2
    const sourceX = Math.max(0, Math.min(sourceWidth - 1, Math.floor(((point.x + .5) * scale - offsetX) / imageScale)))
    const sourceY = Math.max(0, Math.min(sourceHeight - 1, Math.floor(((point.y + .5) * scale - offsetY) / imageScale)))
    const pixel = sourceCanvas.getContext('2d')!.getImageData(sourceX, sourceY, 1, 1).data
    return { sourceX, sourceY, color: pixel[3] < 16 ? null : rgbToHex(pixel[0], pixel[1], pixel[2]) }
  }
  const updateReferenceCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'eyedropper') { setReferenceCursor(null); return }
    const point = referencePointFromEvent(event)
    const sample = sampleReferenceAt(point)
    setCursor(point)
    if (!sample) { setReferenceCursor(null); return }
    setReferenceCursor({ clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y, ...sample })
  }
  const pickReferenceColorAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = referencePointFromEvent(event)
    applySampledColor(sampleReferenceAt(point)?.color ?? null)
  }
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    if (tool === 'move') {
      if (selection && point.x >= selection.x && point.x < selection.x + selection.width && point.y >= selection.y && point.y < selection.y + selection.height) {
        selectionMoveOriginRef.current = selection
        selectionMoveStartRef.current = point
        selectionPixelsRef.current = project.pixels
      } else {
        selectionStartRef.current = point
        updateSelection({ x: point.x, y: point.y, width: 1, height: 1 })
      }
      drawingRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (tool === 'eyedropper') { pickColorAt(point.x, point.y); return }
    if (tool === 'line') {
      if (!color) return
      if (lineMode === 'curve' && curveStage) {
        commit((current) => ({ ...current, pixels: drawCurvePixels(current.pixels, current.width, current.height, curveStage.start, point, curveStage.end, color) }))
        setCurveStage(null)
        return
      }
      lineStartRef.current = point
      drawingRef.current = true
      setReconciliationPaused(true)
      setLinePreview({ start: point, end: point })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (!color && tool !== 'eraser') return
    drawingRef.current = true; strokePointRef.current = point; setReconciliationPaused(true); event.currentTarget.setPointerCapture(event.pointerId); paintAt(point.x, point.y)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    setCursor(point)
    if (drawingRef.current && tool === 'move' && selectionStartRef.current) {
      const start = selectionStartRef.current
      updateSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x) + 1, height: Math.abs(point.y - start.y) + 1 })
      return
    }
    if (drawingRef.current && tool === 'move' && selectionMoveStartRef.current && selectionMoveOriginRef.current) {
      const start = selectionMoveStartRef.current
      const origin = selectionMoveOriginRef.current
      updateSelection({ ...origin, x: Math.max(0, Math.min(project.width - origin.width, origin.x + point.x - start.x)), y: Math.max(0, Math.min(project.height - origin.height, origin.y + point.y - start.y)) })
      return
    }
    if (drawingRef.current && tool === 'line' && lineStartRef.current) { setLinePreview({ start: lineStartRef.current, end: point }); return }
    if (drawingRef.current && (tool === 'pencil' || tool === 'eraser')) paintStrokeTo(point)
  }
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const finalSelection = selectionRef.current
    if (drawingRef.current && tool === 'move' && selectionMoveOriginRef.current && selectionPixelsRef.current && finalSelection) {
      const source = selectionMoveOriginRef.current
      const sourcePixels = selectionPixelsRef.current
      if (source.x !== finalSelection.x || source.y !== finalSelection.y) {
        commit((current) => {
          const pixels = [...current.pixels]
          for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) pixels[(source.y + y) * current.width + source.x + x] = null
          for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) pixels[(finalSelection.y + y) * current.width + finalSelection.x + x] = sourcePixels[(source.y + y) * current.width + source.x + x]
          return { ...current, pixels }
        })
      }
    }
    if (drawingRef.current && (tool === 'pencil' || tool === 'eraser')) {
      const point = pointFromEvent(event)
      setCursor(point)
      paintStrokeTo(point)
    }
    if (tool === 'line' && drawingRef.current && lineStartRef.current) {
      const start = lineStartRef.current
      const end = pointFromEvent(event)
      if (lineMode === 'curve') setCurveStage({ start, end })
      else if (color) commit((current) => ({ ...current, pixels: drawLinePixels(current.pixels, current.width, current.height, start, end, color) }))
      lineStartRef.current = null
      setLinePreview(null)
    }
    drawingRef.current = false
    strokePointRef.current = null
    selectionStartRef.current = null
    selectionMoveOriginRef.current = null
    selectionMoveStartRef.current = null
    selectionPixelsRef.current = null
    setReconciliationPaused(false)
  }
  const loadReferenceImage = (file: File) => new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      setReferencesBySpriteId((current) => ({ ...current, [activeSpriteIdRef.current]: { image, name: file.name || 'Pasted image' } }))
      setReferenceCursor(null)
      resolve()
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be decoded')) }
    image.src = url
  })
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture((items) => [project, ...items]); setHistory((items) => items.slice(0, -1)); updateSprite(project.id, () => previous) }
  const redo = () => { const next = future[0]; if (!next) return; setHistory((items) => [...items, project]); setFuture((items) => items.slice(1)); updateSprite(project.id, () => next) }
  const exportPng = (scale: ExportScale) => {
    if (project.width * scale > MAX_EXPORT_DIMENSION || project.height * scale > MAX_EXPORT_DIMENSION) return
    const output = document.createElement('canvas'); output.width = project.width * scale; output.height = project.height * scale
    const ctx = output.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (project.background !== 'transparent') { ctx.fillStyle = project.background; ctx.fillRect(0, 0, output.width, output.height) }
    project.pixels.forEach((pixel, index) => { if (pixel) { ctx.fillStyle = pixel; ctx.fillRect((index % project.width) * scale, Math.floor(index / project.width) * scale, scale, scale) } })
    output.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const suffix = scale === 1 ? '' : `@${scale}x`
      const link = document.createElement('a')
      link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sprite'}${suffix}.png`
      link.href = url
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }, 'image/png')
    setExportOpen(false)
  }
  const parseSizeDraft = (value: string) => {
    if (!/^\d+$/.test(value.trim())) return null
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    return Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(numeric)))
  }
  const createSprite = async () => {
    const width = parseSizeDraft(newSpriteSizeDraft.width)
    const height = parseSizeDraft(newSpriteSizeDraft.height)
    if (width === null || height === null) {
      setNewSpriteSizeDraft({ width: width === null ? String(newSprite.width) : String(width), height: height === null ? String(newSprite.height) : String(height) })
      return
    }
    if (!await persistNewSprite(createProject({ ...newSprite, width, height }))) return
    setHistory([]); setFuture([]); setNewSpriteOpen(false); setNewSprite({ name: 'Untitled sprite', width: 32, height: 32, background: 'transparent' })
    setNewSpriteSizeDraft({ width: '32', height: '32' })
  }
  const setBackground = (background: Background) => commit((current) => ({ ...current, background }))
  const resize = (dimension: 'width' | 'height', value: number) => commit((current) => resizeProject(current, dimension === 'width' ? value : current.width, dimension === 'height' ? value : current.height))
  const commitCanvasSize = (dimension: 'width' | 'height') => {
    const value = parseSizeDraft(canvasSizeDraft[dimension])
    if (value === null) {
      setCanvasSizeDraft((current) => ({ ...current, [dimension]: String(project[dimension]) }))
      return
    }
    setCanvasSizeDraft((current) => ({ ...current, [dimension]: String(value) }))
    if (value !== project[dimension]) resize(dimension, value)
  }
  const clear = () => commit((current) => ({ ...current, pixels: current.pixels.map(() => null) }))
  const confirmAction = () => {
    if (confirmation?.kind === 'clear') clear()
    if (confirmation?.kind === 'delete') deleteSprite(confirmation.spriteId)
    setConfirmation(null)
  }
  const setClampedZoom = (value: number) => setZoomBySprite((current) => ({ ...current, [activeSpriteIdRef.current]: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value / 100) * 100)) }))
  const changeZoom = (amount: number) => setZoomBySprite((current) => ({ ...current, [activeSpriteIdRef.current]: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (current[activeSpriteIdRef.current] ?? 1600) + amount)) }))
  const agentFile = `pixel-ape/sprites/${project.id}.pixel`
  const agentPrompt = `I'm working on ${agentFile}. Read AGENT_GUIDE.md and then\nmake this change: [describe the edit].\nEdit only this sprite. Preserve its dimensions unless requested otherwise.`
  const copyAgentPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setAgentPromptCopied(true)
      window.clearTimeout(agentPromptResetTimeoutRef.current)
      agentPromptResetTimeoutRef.current = window.setTimeout(() => setAgentPromptCopied(false), 3000)
    } catch {
      setAgentPromptCopied(false)
    }
  }
  const closeAgentGuide = () => { setAgentOpen(false); setAgentPromptCopied(false) }
  const openShare = (spriteId: string) => {
    if (!auth.user) { setAuthOpen(true); return }
    setShareSpriteId(spriteId)
  }

  const canvas = <section className="canvas-area" aria-label="Pixel canvas workspace">
    <div className="canvas-toolbar"><div>
    </div><div className="canvas-config"><label>W <input type="number" min={MIN_CANVAS_SIZE} max={MAX_CANVAS_SIZE} value={canvasSizeDraft.width} onChange={(event) => { const value = event.currentTarget.value; setCanvasSizeDraft((current) => ({ ...current, width: value })) }} onBlur={() => commitCanvasSize('width')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label="Canvas width" /></label><label>H <input type="number" min={MIN_CANVAS_SIZE} max={MAX_CANVAS_SIZE} value={canvasSizeDraft.height} onChange={(event) => { const value = event.currentTarget.value; setCanvasSizeDraft((current) => ({ ...current, height: value })) }} onBlur={() => commitCanvasSize('height')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label="Canvas height" /></label><button className="reference-control" onClick={() => setReferenceDialogOpen(true)}><b>Reference</b><span>{referenceName || 'Add image'}</span></button>{referenceImage && <button className="reference-convert" onClick={() => setReferenceConversionOpen(true)}>Convert to pixels</button>}<div className="background-control" role="group" aria-label="Canvas background"><span>Background</span>{backgroundOptions.map((option) => <button key={option.value} className={`${option.value} ${project.background === option.value ? 'active' : ''}`} onClick={() => setBackground(option.value)} title={`${option.label} background`} aria-label={`${option.label} background`} />)}</div></div></div>
    <div className="drafting-board" ref={boardRef}><span className="register top-left" /><span className="register top-right" /><span className="register bottom-left" /><span className="register bottom-right" /><div className="canvas-pair"><div className="canvas-frame" style={{ width: `${project.width * zoom / 100}px`, height: `${project.height * zoom / 100}px` }}><canvas ref={canvasRef} width={project.width * canvasPixelScale} height={project.height * canvasPixelScale} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerEnter={(event) => { setCanvasHovered(true); setCursor(pointFromEvent(event)) }} onPointerLeave={() => setCanvasHovered(false)} style={{ cursor: tool === 'move' && selection && cursor.x >= selection.x && cursor.x < selection.x + selection.width && cursor.y >= selection.y && cursor.y < selection.y + selection.height ? 'move' : 'crosshair' }} aria-label={`${project.width} by ${project.height} editable pixel canvas`} /></div>{referenceImage && <div className="canvas-frame reference-frame" style={{ width: `${project.width * zoom / 100}px`, height: `${project.height * zoom / 100}px` }}><button className="reference-remove" type="button" onClick={() => { setReferencesBySpriteId((current) => { const next = { ...current }; delete next[project.id]; return next }); setReferenceCursor(null); setReferenceConversionOpen(false) }} aria-label="Remove reference image" title="Remove reference image">×</button><canvas ref={referenceCanvasRef} width={project.width * canvasPixelScale} height={project.height * canvasPixelScale} tabIndex={0} onPointerDown={(event) => { if (tool === 'eyedropper') { event.preventDefault(); pickReferenceColorAt(event) } }} onPointerMove={updateReferenceCursor} onPointerEnter={updateReferenceCursor} onPointerLeave={() => setReferenceCursor(null)} onClick={() => { if (tool !== 'eyedropper') setReferenceDialogOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (tool !== 'eyedropper') setReferenceDialogOpen(true) } }} style={{ cursor: tool === 'eyedropper' ? 'crosshair' : 'pointer' }} aria-label={`${project.width} by ${project.height} reference image. ${tool === 'eyedropper' ? 'Move to preview a color and click to sample.' : 'Click to replace.'}`} /></div>}</div></div>{referenceCursor && <div className="reference-loupe" style={{ left: `${Math.min(Math.max(12, referenceCursor.clientX + 18), Math.max(12, globalThis.innerWidth - 190))}px`, top: `${Math.min(Math.max(12, referenceCursor.clientY + 18), Math.max(12, globalThis.innerHeight - 210))}px` }} aria-live="polite"><div className="reference-loupe-heading"><span>Sampling</span><b>{referenceCursor.x},{referenceCursor.y}</b></div><canvas ref={referenceLoupeCanvasRef} width="108" height="108" aria-hidden="true" /><div className="reference-loupe-color"><span className={`reference-loupe-swatch ${referenceCursor.color ? '' : 'reference-loupe-transparent'}`} style={referenceCursor.color ? { backgroundColor: referenceCursor.color } : undefined} /><code>{referenceCursor.color ?? 'Transparent'}</code></div><p>Click to set {editingPaletteSlot === null ? 'foreground' : `slot ${editingPaletteSlot + 1}`}</p></div>}
    <div className="canvas-status"><span>X <b>{String(cursor.x).padStart(2, '0')}</b></span><span>Y <b>{String(cursor.y).padStart(2, '0')}</b></span><span className="status-rule" /><span>{tool === 'line' && curveStage ? 'CURVE: SET BEND' : tool === 'line' ? `LINE: ${lineMode.toUpperCase()}` : tool.toUpperCase()}</span><label className="grid-control"><input type="checkbox" checked={gridVisible} onChange={(event) => setGridVisible(event.target.checked)} /> Grid</label><div className="zoom-control"><span>Zoom</span><button onClick={() => changeZoom(-100)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button><input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="100" value={zoom} onChange={(event) => setClampedZoom(Number(event.target.value))} aria-label="Canvas zoom" /><button onClick={() => changeZoom(100)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button><b>{zoom}%</b></div></div>
  </section>

  return <>
    <div className={`file-status file-status-${fileStatus}`} role="status">
      <span title={fileStatus === 'sync-error' ? syncError?.message : undefined}>{fileStatus === 'loading' ? 'Loading…' : fileStatus === 'saving' ? 'Saving…' : fileStatus === 'unsaved' ? 'Unsaved' : fileStatus === 'conflict' ? 'Sync needs attention' : fileStatus === 'invalid' ? 'Invalid workspace' : fileStatus === 'offline' ? 'Offline' : fileStatus === 'sync-error' ? `Sync error${syncError?.code ? ` (${syncError.code})` : ''}: ${syncError?.message ?? 'Unknown error'}` : 'Saved'}</span>
    </div>
    {showGuestNudge && !auth.user && <aside className="sync-notice sync-notice-local" aria-live="polite">
      <span className="sync-notice-mark" aria-hidden="true"><CloudUploadIcon /></span>
      <p><b>Your work is safe in this browser.</b><span>Sign in to back it up.</span></p>
      <button className="sync-notice-action" onClick={() => setAuthOpen(true)}>Sign in to sync</button>
      <button className="sync-notice-close" onClick={dismissGuestNudge} aria-label="Dismiss sync reminder">×</button>
    </aside>}
    {syncNotice && auth.user && <aside className="sync-notice sync-notice-success" aria-live="polite">
      <span className="sync-notice-mark" aria-hidden="true">✓</span>
      <p><b>{syncNotice === 'imported' ? 'Local artwork added to your account.' : 'Artwork saved to your account.'}</b><span>Changes will now sync automatically.</span></p>
      <button className="sync-notice-close" onClick={dismissSyncNotice} aria-label="Dismiss sync confirmation">×</button>
    </aside>}
    <StudioTemplate
      topBar={<TopBar
        accountEmail={auth.user?.email ?? null}
        accountLoading={auth.loading}
        activeSpriteId={project.id}
        canRedo={Boolean(future.length)}
        canUndo={Boolean(history.length)}
        sprites={openSprites}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={auth.signOut}
        onAddSprite={() => setNewSpriteOpen(true)}
        onCloseSprite={closeSprite}
        onExport={() => { if (project.width * exportScale > MAX_EXPORT_DIMENSION || project.height * exportScale > MAX_EXPORT_DIMENSION) setExportScale(1); setExportOpen(true) }}
        onReorderSprites={reorderSprites}
        onOpenFiles={() => setFilesOpen(true)}
        onOpenGuide={() => { setAgentPromptCopied(false); setAgentOpen(true) }}
        onRedo={redo}
        onRenameSprite={(id, name) => updateSprite(id, (sprite) => ({ ...sprite, name }))}
        onSelectSprite={switchSprite}
        onShare={() => openShare(project.id)}
        onUndo={undo}
      />}
      palette={<PalettePanel
        color={color}
        background={project.background}
        editingSlot={editingPaletteSlot}
        eyedropperColor={eyedropperColor}
        palette={workspace.palette}
        onPaletteChange={(palette) => updateManifest((current) => ({ ...current, palette }))}
        onColorChange={setColor}
        onBackgroundChange={setBackground}
        onPaletteSlotSelect={(index, slotColor) => { setEditingPaletteSlot(index); setEyedropperColor(null); setColor(slotColor) }}
        onEmptySlotClick={(index) => {
          if (eyedropperColor) {
            updateManifest((current) => ({ ...current, palette: current.palette.map((swatch, slotIndex) => slotIndex === index ? eyedropperColor : swatch) }))
            setColor(eyedropperColor)
            setEyedropperColor(null)
            setEditingPaletteSlot(index)
            return
          }
          setEditingPaletteSlot(index)
          setColor(null)
        }}
        onSetSlot={(index, slotColor) => { setEyedropperColor(null); setColor(slotColor); updateManifest((current) => ({ ...current, palette: current.palette.map((swatch, slotIndex) => slotIndex === index ? slotColor : swatch) })) }}
      />}
      canvas={canvas}
      tools={<ToolsPanel
        colorsUsed={new Set(project.pixels.filter(Boolean)).size}
        spriteCount={workspace.sprites.length}
        spriteIndex={workspace.sprites.findIndex((sprite) => sprite.id === project.id) + 1}
        tool={tool}
        lineMode={lineMode}
        eraserSize={eraserSize}
        onClear={() => setConfirmation({ kind: 'clear' })}
        onEraserSizeChange={setEraserSize}
        onLineModeChange={(mode) => { setLineMode(mode); setCurveStage(null); setLinePreview(null) }}
        onToolChange={setTool}
      />}
    />
    {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    {shareSprite && <ShareDialog sprite={shareSprite} projectId={cloudProjectId} canPublish={Boolean(auth.user && cloudProjectId && fileStatus === 'saved')} getAccessToken={auth.getAccessToken} onClose={() => setShareSpriteId(null)} />}
    {newSpriteOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setNewSpriteOpen(false)}><section className="new-sprite-dialog" role="dialog" aria-modal="true" aria-labelledby="new-sprite-title" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">New sprite tab</p><h2 id="new-sprite-title">Set up your canvas</h2><label>Sprite name<input autoFocus value={newSprite.name} onChange={(event) => setNewSprite({ ...newSprite, name: event.target.value })} /></label><div className="dialog-grid"><label>Width<input type="number" min={MIN_CANVAS_SIZE} max={MAX_CANVAS_SIZE} value={newSpriteSizeDraft.width} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = event.currentTarget.value; setNewSpriteSizeDraft((current) => ({ ...current, width: value })) }} /></label><label>Height<input type="number" min={MIN_CANVAS_SIZE} max={MAX_CANVAS_SIZE} value={newSpriteSizeDraft.height} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = event.currentTarget.value; setNewSpriteSizeDraft((current) => ({ ...current, height: value })) }} /></label></div><p className="canvas-size-note">Canvas dimensions can be from {MIN_CANVAS_SIZE}×{MIN_CANVAS_SIZE} to {MAX_CANVAS_SIZE}×{MAX_CANVAS_SIZE} pixels.</p><fieldset><legend>Background</legend>{backgroundOptions.map((option) => <label key={option.value} className="background-choice"><input type="radio" name="new-background" checked={newSprite.background === option.value} onChange={() => setNewSprite({ ...newSprite, background: option.value })} />{option.label}</label>)}</fieldset><div className="existing-sprites"><div><b>Open an existing file</b><button className="text-button" onClick={() => { setNewSpriteOpen(false); setFilesOpen(true) }}>Browse all files</button></div>{recentSprites.slice(0, 3).map((sprite) => <button key={sprite.id} onClick={() => { switchSprite(sprite.id); setNewSpriteOpen(false) }}><span>{sprite.name || 'Untitled sprite'}</span><small>{sprite.width}×{sprite.height}</small></button>)}</div><div className="dialog-actions"><button className="quiet-button" onClick={() => setNewSpriteOpen(false)}>Cancel</button><button onClick={() => void createSprite()}>Create sprite</button></div></section></div>}
    {exportOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setExportOpen(false)}><section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">PNG export</p><h2 id="export-title">Choose output size</h2><div className="export-dimensions" aria-live="polite"><strong>{project.width * exportScale} × {project.height * exportScale}</strong><span>pixels · {exportScale}× scale</span></div><div className="export-scales" role="radiogroup" aria-label="PNG export scale">{EXPORT_SCALES.map((scale) => { const disabled = project.width * scale > MAX_EXPORT_DIMENSION || project.height * scale > MAX_EXPORT_DIMENSION; return <button key={scale} role="radio" aria-checked={exportScale === scale} className={exportScale === scale ? 'selected-export-scale' : ''} disabled={disabled} onClick={() => setExportScale(scale)}><b>{scale}×</b><small>{project.width * scale}×{project.height * scale}</small></button> })}</div><p className="export-note">Pixels stay sharp with no smoothing. {project.background === 'transparent' ? 'Transparent areas remain transparent.' : `The ${project.background} canvas background is included.`} Outputs are limited to {MAX_EXPORT_DIMENSION} pixels per side.</p><div className="dialog-actions export-actions"><button className="quiet-button" onClick={() => setExportOpen(false)}>Cancel</button><button onClick={() => exportPng(exportScale)}>Export PNG</button></div></section></div>}
    {referenceDialogOpen && <ReferenceImageDialog replacing={Boolean(referenceImage)} onClose={() => setReferenceDialogOpen(false)} onSelect={loadReferenceImage} />}
    {referenceConversionOpen && referenceImage && <ReferenceConversionDialog image={referenceImage} project={project} palette={workspace.palette} onClose={() => setReferenceConversionOpen(false)} onApply={(result, useExtractedPalette) => { commit((current) => ({ ...current, pixels: result.pixels })); if (useExtractedPalette) updateManifest((current) => ({ ...current, palette: result.palette })); setReferenceConversionOpen(false) }} />}
    {filesOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setFilesOpen(false)}><section className="file-list-dialog" role="dialog" aria-modal="true" aria-labelledby="file-list-title" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">Sprite files</p><h2 id="file-list-title">All files</h2><p className="file-list-intro">Open, rename, duplicate, share, or delete a sprite file.</p><div className="file-list">{workspace.sprites.map((sprite) => <article key={sprite.id} className={sprite.id === project.id ? 'active-file' : ''}><div className="file-name"><input value={sprite.name} onChange={(event) => updateSprite(sprite.id, (current) => ({ ...current, name: event.target.value }))} aria-label={`Rename ${sprite.name || 'sprite'}`} /><small>{sprite.width}×{sprite.height}</small></div><div className="file-actions"><button onClick={() => { switchSprite(sprite.id); setFilesOpen(false) }}>Open</button><button onClick={() => void duplicateSprite(sprite)}>Duplicate</button><button onClick={() => { openShare(sprite.id); setFilesOpen(false) }}>Share</button><button className="delete-file" onClick={() => setConfirmation({ kind: 'delete', spriteId: sprite.id, spriteName: sprite.name || 'Untitled sprite' })} disabled={workspace.sprites.length === 1}>Delete</button></div></article>)}</div><div className="dialog-actions"><button className="quiet-button" onClick={() => setFilesOpen(false)}>Done</button></div></section></div>}
    {confirmation && <div className="dialog-backdrop confirmation-backdrop" role="presentation" onMouseDown={() => setConfirmation(null)}><section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">Please confirm</p><h2 id="confirmation-title">{confirmation.kind === 'clear' ? 'Clear this canvas?' : `Delete “${confirmation.spriteName}”?`}</h2><p id="confirmation-description">{confirmation.kind === 'clear' ? 'Every pixel on this sprite will be removed. You can undo this action afterward.' : 'This permanently removes the sprite from your files and cannot be undone.'}</p><div className="dialog-actions confirmation-actions"><button className="quiet-button" onClick={() => setConfirmation(null)}>Cancel</button><button className="danger-button" onClick={confirmAction}>{confirmation.kind === 'clear' ? 'Clear canvas' : 'Delete sprite'}</button></div></section></div>}
    {!hydrated && <div className="file-blocker file-loader" role="status" aria-label="Loading workspace"><span className="workspace-spinner" /></div>}
    {hydrated && !writable && <div className="file-blocker" role="alert"><section><p className="eyebrow">Project files need attention</p><h2>Editing is paused until the files are valid.</h2>{diagnostics.slice(0, 4).map((item) => <p key={`${item.file}:${item.line}:${item.column}:${item.code}`}><code>{item.file}{item.line ? `:${item.line}:${item.column}` : ''}</code><br />{item.message}</p>)}</section></div>}
    {conflict && <div className="dialog-backdrop" role="presentation"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description"><p className="eyebrow">Sync conflict</p><h2 id="conflict-title">This project changed somewhere else.</h2><p id="conflict-description">Your unsynced browser draft and the latest cloud version both contain changes, so Pixel Ape cannot merge them automatically.</p><p><b>Your browser draft is safe until you choose.</b> Keep this draft to replace the cloud version, or keep the cloud version to discard this draft. Download it first if you want a backup.</p><div className="dialog-actions conflict-actions"><button className="quiet-button" onClick={() => void copyConflictDraft(conflict.resource)}>Copy draft</button><button className="quiet-button" onClick={() => exportConflictDraft(conflict.resource)}>Download draft</button><button className="quiet-button" onClick={() => resolveConflict(conflict.resource, 'disk')}>Keep cloud</button><button onClick={() => resolveConflict(conflict.resource, 'retry')}>Keep this draft</button></div></section></div>}
    {agentOpen &&
      <div className="dialog-backdrop" role="presentation" onMouseDown={closeAgentGuide}>
        <section className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="dialog-icon"><AgentIcon /></div><p className="eyebrow">Edit with AI</p>
          <h2 id="agent-title">Ask an AI to update this sprite</h2>
          <p>This tab is <code>{agentFile}</code>. Copy the prompt below, add your request, and send it to an AI.</p>
          <div className="agent-prompt-card"><pre aria-label="Starter prompt">{agentPrompt}</pre>
            {agentPromptCopied && <p className="agent-prompt-status" aria-live="polite">Copied!</p>}
            <button className="agent-prompt-copy" onClick={copyAgentPrompt} aria-label="Copy starter prompt" title="Copy starter prompt"><CopyIcon /></button></div><div className="dialog-actions"><a href="/AGENT_GUIDE.md" target="_blank" rel="noreferrer">View file format</a><button className="quiet-button" onClick={closeAgentGuide}>Done</button></div></section></div>}
  </>
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number, pixelScale: number) { for (let y = 0; y < height / pixelScale; y++) for (let x = 0; x < width / pixelScale; x++) { ctx.fillStyle = (x + y) % 2 ? '#dedede' : '#f4f4f4'; ctx.fillRect(x * pixelScale, y * pixelScale, pixelScale, pixelScale) } }

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function previewMovedPixels(
  width: number,
  source: { x: number; y: number; width: number; height: number },
  destination: { x: number; y: number; width: number; height: number },
  sourcePixels: Array<string | null>,
) {
  const pixels = [...sourcePixels]
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) pixels[(source.y + y) * width + source.x + x] = null
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) pixels[(destination.y + y) * width + destination.x + x] = sourcePixels[(source.y + y) * width + source.x + x]
  return pixels
}
