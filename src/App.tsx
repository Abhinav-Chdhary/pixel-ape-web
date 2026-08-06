import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentIcon, CopyIcon } from './icons'
import { TopBar } from './components/03_compounds/TopBar'
import { PalettePanel } from './components/04_organisms/PalettePanel'
import { ToolsPanel } from './components/04_organisms/ToolsPanel'
import { StudioTemplate } from './components/05_templates/StudioTemplate'
import { useLocalWorkspace } from './hooks/useLocalWorkspace'
import { createProject, DEFAULT_PALETTE, drawCurvePixels, drawLinePixels, eraseLinePixels, erasePixels, fillPixels, resizeProject } from './project'
import type { Background, LineMode, PixelProject, Tool } from './types'

const backgroundOptions: Array<{ value: Background; label: string }> = [
  { value: 'transparent', label: 'Transparent' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' },
]
const MIN_ZOOM = 100
const MAX_ZOOM = 6400

function App() {
  const [history, setHistory] = useState<PixelProject[]>([])
  const [future, setFuture] = useState<PixelProject[]>([])
  const activeSpriteIdRef = useRef('')
  const sync = useLocalWorkspace((id) => {
    if (id === activeSpriteIdRef.current) { setHistory([]); setFuture([]) }
  })
  const { workspace, hydrated, writable, diagnostics, status: fileStatus, conflict, updateManifest, updateSprite, createSprite: persistNewSprite, resolveConflict, copyConflictDraft, exportConflictDraft, setReconciliationPaused } = sync
  const [tool, setTool] = useState<Tool>('pencil')
  const [eraserSize, setEraserSize] = useState(() => Number(globalThis.localStorage?.getItem('pixel-ape:eraser-size')) || 1)
  const [canvasHovered, setCanvasHovered] = useState(false)
  const [eyedropperColor, setEyedropperColor] = useState<string | null>(null)
  const [editingPaletteSlot, setEditingPaletteSlot] = useState<number | null>(null)
  const [lineMode, setLineMode] = useState<LineMode>(() => globalThis.localStorage?.getItem('pixel-ape:line-mode') === 'curve' ? 'curve' : 'straight')
  const [curveStage, setCurveStage] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [linePreview, setLinePreview] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [color, setColor] = useState(DEFAULT_PALETTE[0])
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [zoomBySprite, setZoomBySprite] = useState<Record<string, number>>({})
  const [gridVisible, setGridVisible] = useState(true)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentPromptCopied, setAgentPromptCopied] = useState(false)
  const [newSpriteOpen, setNewSpriteOpen] = useState(false)
  const [newSprite, setNewSprite] = useState({ name: 'Untitled sprite', width: 24, height: 24, background: 'transparent' as Background })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const lineStartRef = useRef<{ x: number; y: number } | null>(null)
  const strokePointRef = useRef<{ x: number; y: number } | null>(null)
  const agentPromptResetTimeoutRef = useRef<number | undefined>(undefined)
  const project = workspace.sprites.find((sprite) => sprite.id === workspace.activeSpriteId) ?? workspace.sprites[0]
  activeSpriteIdRef.current = project.id
  const zoom = zoomBySprite[project.id] ?? 1600

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
    updateManifest((current) => ({ ...current, activeSpriteId: id }))
    setHistory([]); setFuture([]); setCursor({ x: 0, y: 0 })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key.toLowerCase() === 'p') setTool('pencil')
      if (event.key.toLowerCase() === 'f') setTool('fill')
      if (event.key.toLowerCase() === 'e') setTool('eraser')
      if (event.key.toLowerCase() === 'i') setTool('eyedropper')
      if (event.key.toLowerCase() === 'l') setTool('line')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (tool !== 'line') { setCurveStage(null); setLinePreview(null); lineStartRef.current = null }
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
    if (project.background === 'transparent') drawCheckerboard(ctx, canvas.width, scale)
    else { ctx.fillStyle = project.background; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    project.pixels.forEach((pixel, index) => { if (pixel) { ctx.fillStyle = pixel; ctx.fillRect((index % project.width) * scale, Math.floor(index / project.width) * scale, scale, scale) } })
    const previewPixels = tool === 'line' && linePreview
      ? drawLinePixels(Array<string | null>(project.width * project.height).fill(null), project.width, project.height, linePreview.start, linePreview.end, color)
      : tool === 'line' && curveStage
        ? drawCurvePixels(Array<string | null>(project.width * project.height).fill(null), project.width, project.height, curveStage.start, cursor, curveStage.end, color)
        : null
    if (previewPixels) previewPixels.forEach((pixel, index) => { if (pixel) { ctx.fillStyle = pixel; ctx.fillRect((index % project.width) * scale, Math.floor(index / project.width) * scale, scale, scale) } })
    if (gridVisible) {
      ctx.beginPath(); ctx.strokeStyle = project.background === 'black' ? 'rgba(255,255,255,.13)' : 'rgba(23,24,18,.13)'; ctx.lineWidth = 1
      for (let i = 0; i <= project.width; i++) { const point = Math.round(i * scale) + .5; ctx.moveTo(point, 0); ctx.lineTo(point, canvas.height) }
      for (let i = 0; i <= project.height; i++) { const point = Math.round(i * scale) + .5; ctx.moveTo(0, point); ctx.lineTo(canvas.width, point) }
      ctx.stroke()
    }
    if (tool === 'eraser' && canvasHovered) {
      const offset = Math.floor((eraserSize - 1) / 2)
      const x = (cursor.x - offset) * scale
      const y = (cursor.y - offset) * scale
      const size = eraserSize * scale
      ctx.lineWidth = 3; ctx.strokeStyle = '#f4f1e8'; ctx.strokeRect(x, y, size, size)
      ctx.lineWidth = 1; ctx.strokeStyle = '#171812'; ctx.strokeRect(x, y, size, size)
    }
  }, [canvasHovered, color, curveStage, cursor, eraserSize, gridVisible, linePreview, project, tool])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(project.width - 1, Math.floor((event.clientX - rect.left) / rect.width * project.width))), y: Math.max(0, Math.min(project.height - 1, Math.floor((event.clientY - rect.top) / rect.height * project.height))) }
  }
  const paintAt = (x: number, y: number, withHistory = true) => {
    const index = y * project.width + x
    const updater = (current: PixelProject) => {
      if (tool === 'fill') return { ...current, pixels: fillPixels(current.pixels, current.width, current.height, index, color) }
      if (tool === 'eraser') {
        const pixels = erasePixels(current.pixels, current.width, current.height, { x, y }, eraserSize)
        return pixels === current.pixels ? current : { ...current, pixels }
      }
      if (current.pixels[index] === color) return current
      const pixels = [...current.pixels]; pixels[index] = color
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
    updateSprite(project.id, (current) => {
      const pixels = tool === 'eraser'
        ? eraseLinePixels(current.pixels, current.width, current.height, previous, point, eraserSize)
        : drawLinePixels(current.pixels, current.width, current.height, previous, point, color)
      return pixels === current.pixels ? current : { ...current, pixels }
    })
    strokePointRef.current = point
  }
  const pickColorAt = (x: number, y: number) => {
    const pixel = project.pixels[y * project.width + x]
    if (pixel) { setColor(pixel); setEyedropperColor(pixel) }
  }
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    if (tool === 'eyedropper') { pickColorAt(point.x, point.y); return }
    if (tool === 'line') {
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
    drawingRef.current = true; strokePointRef.current = point; setReconciliationPaused(true); event.currentTarget.setPointerCapture(event.pointerId); paintAt(point.x, point.y)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    setCursor(point)
    if (drawingRef.current && tool === 'line' && lineStartRef.current) { setLinePreview({ start: lineStartRef.current, end: point }); return }
    if (drawingRef.current && (tool === 'pencil' || tool === 'eraser')) paintStrokeTo(point)
  }
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current && (tool === 'pencil' || tool === 'eraser')) {
      const point = pointFromEvent(event)
      setCursor(point)
      paintStrokeTo(point)
    }
    if (tool === 'line' && drawingRef.current && lineStartRef.current) {
      const start = lineStartRef.current
      const end = pointFromEvent(event)
      if (lineMode === 'curve') setCurveStage({ start, end })
      else commit((current) => ({ ...current, pixels: drawLinePixels(current.pixels, current.width, current.height, start, end, color) }))
      lineStartRef.current = null
      setLinePreview(null)
    }
    drawingRef.current = false
    strokePointRef.current = null
    setReconciliationPaused(false)
  }
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture((items) => [project, ...items]); setHistory((items) => items.slice(0, -1)); updateSprite(project.id, () => previous) }
  const redo = () => { const next = future[0]; if (!next) return; setHistory((items) => [...items, project]); setFuture((items) => items.slice(1)); updateSprite(project.id, () => next) }
  const exportPng = () => {
    const output = document.createElement('canvas'); output.width = project.width; output.height = project.height
    const ctx = output.getContext('2d')!
    if (project.background !== 'transparent') { ctx.fillStyle = project.background; ctx.fillRect(0, 0, output.width, output.height) }
    project.pixels.forEach((pixel, index) => { if (pixel) { ctx.fillStyle = pixel; ctx.fillRect(index % project.width, Math.floor(index / project.width), 1, 1) } })
    const link = document.createElement('a'); link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sprite'}.png`; link.href = output.toDataURL('image/png'); link.click()
  }
  const createSprite = async () => {
    if (!await persistNewSprite(createProject(newSprite))) return
    setHistory([]); setFuture([]); setNewSpriteOpen(false); setNewSprite({ name: 'Untitled sprite', width: 24, height: 24, background: 'transparent' })
  }
  const setBackground = (background: Background) => commit((current) => ({ ...current, background }))
  const resize = (dimension: 'width' | 'height', value: number) => commit((current) => resizeProject(current, dimension === 'width' ? value : current.width, dimension === 'height' ? value : current.height))
  const clear = () => commit((current) => ({ ...current, pixels: current.pixels.map(() => null) }))
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

  const canvas = <section className="canvas-area" aria-label="Pixel canvas workspace">
    <div className="canvas-toolbar"><div>
    </div><div className="canvas-config"><label>W <input type="number" min="4" max="64" value={project.width} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { if (event.currentTarget.valueAsNumber) resize('width', event.currentTarget.valueAsNumber) }} aria-label="Canvas width" /></label><label>H <input type="number" min="4" max="64" value={project.height} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { if (event.currentTarget.valueAsNumber) resize('height', event.currentTarget.valueAsNumber) }} aria-label="Canvas height" /></label><div className="background-control" role="group" aria-label="Canvas background"><span>Background</span>{backgroundOptions.map((option) => <button key={option.value} className={`${option.value} ${project.background === option.value ? 'active' : ''}`} onClick={() => setBackground(option.value)} title={`${option.label} background`} aria-label={`${option.label} background`} />)}</div></div></div>
    <div className="drafting-board" ref={boardRef}><span className="register top-left" /><span className="register top-right" /><span className="register bottom-left" /><span className="register bottom-right" /><div className="canvas-frame" style={{ width: `${project.width * zoom / 100}px`, height: `${project.height * zoom / 100}px` }}><canvas ref={canvasRef} width={576} height={576} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerEnter={() => setCanvasHovered(true)} onPointerLeave={() => setCanvasHovered(false)} aria-label={`${project.width} by ${project.height} editable pixel canvas`} /></div></div>
    <div className="canvas-status"><span>X <b>{String(cursor.x).padStart(2, '0')}</b></span><span>Y <b>{String(cursor.y).padStart(2, '0')}</b></span><span className="status-rule" /><span>{tool === 'line' && curveStage ? 'CURVE: SET BEND' : tool === 'line' ? `LINE: ${lineMode.toUpperCase()}` : tool.toUpperCase()}</span><label className="grid-control"><input type="checkbox" checked={gridVisible} onChange={(event) => setGridVisible(event.target.checked)} /> Grid</label><div className="zoom-control"><span>Zoom</span><button onClick={() => changeZoom(-100)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button><input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="100" value={zoom} onChange={(event) => setClampedZoom(Number(event.target.value))} aria-label="Canvas zoom" /><button onClick={() => changeZoom(100)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button><b>{zoom}%</b></div></div>
  </section>

  return <>
    <div className={`file-status file-status-${fileStatus}`} role="status">
      {fileStatus === 'loading' ? 'Loading files…' : fileStatus === 'saving' ? 'Saving…' : fileStatus === 'unsaved' ? 'Unsaved changes' : fileStatus === 'conflict' ? 'File conflict' : fileStatus === 'invalid' ? 'Invalid project file' : fileStatus === 'offline' ? 'File server offline' : 'Sprite files saved'}
    </div>
    <StudioTemplate
      topBar={<TopBar
        activeSpriteId={project.id}
        canRedo={Boolean(future.length)}
        canUndo={Boolean(history.length)}
        sprites={workspace.sprites}
        onAddSprite={() => setNewSpriteOpen(true)}
        onExport={exportPng}
        onOpenGuide={() => { setAgentPromptCopied(false); setAgentOpen(true) }}
        onRedo={redo}
        onRenameSprite={(id, name) => updateSprite(id, (sprite) => ({ ...sprite, name }))}
        onSelectSprite={switchSprite}
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
        onPaletteSlotSelect={(index, slotColor) => { setEditingPaletteSlot(index); setColor(slotColor) }}
        onEmptySlotClick={(index) => {
          if (eyedropperColor) {
            updateManifest((current) => ({ ...current, palette: current.palette.map((swatch, slotIndex) => slotIndex === index ? eyedropperColor : swatch) }))
            setColor(eyedropperColor)
            setEyedropperColor(null)
            setEditingPaletteSlot(index)
            return
          }
          setEditingPaletteSlot(index)
        }}
        onSetSlot={(index, slotColor) => { setColor(slotColor); updateManifest((current) => ({ ...current, palette: current.palette.map((swatch, slotIndex) => slotIndex === index ? slotColor : swatch) })) }}
      />}
      canvas={canvas}
      tools={<ToolsPanel
        colorsUsed={new Set(project.pixels.filter(Boolean)).size}
        spriteCount={workspace.sprites.length}
        spriteIndex={workspace.sprites.findIndex((sprite) => sprite.id === project.id) + 1}
        tool={tool}
        lineMode={lineMode}
        eraserSize={eraserSize}
        onClear={clear}
        onEraserSizeChange={setEraserSize}
        onLineModeChange={(mode) => { setLineMode(mode); setCurveStage(null); setLinePreview(null) }}
        onToolChange={setTool}
      />}
    />
    {newSpriteOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setNewSpriteOpen(false)}><section className="new-sprite-dialog" role="dialog" aria-modal="true" aria-labelledby="new-sprite-title" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">New sprite tab</p><h2 id="new-sprite-title">Set up your canvas</h2><label>Sprite name<input autoFocus value={newSprite.name} onChange={(event) => setNewSprite({ ...newSprite, name: event.target.value })} /></label><div className="dialog-grid"><label>Width<input type="number" min="4" max="64" value={newSprite.width} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { if (event.currentTarget.valueAsNumber) setNewSprite({ ...newSprite, width: event.currentTarget.valueAsNumber }) }} /></label><label>Height<input type="number" min="4" max="64" value={newSprite.height} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { if (event.currentTarget.valueAsNumber) setNewSprite({ ...newSprite, height: event.currentTarget.valueAsNumber }) }} /></label></div><fieldset><legend>Background</legend>{backgroundOptions.map((option) => <label key={option.value} className="background-choice"><input type="radio" name="new-background" checked={newSprite.background === option.value} onChange={() => setNewSprite({ ...newSprite, background: option.value })} />{option.label}</label>)}</fieldset><div className="dialog-actions"><button className="quiet-button" onClick={() => setNewSpriteOpen(false)}>Cancel</button><button onClick={() => void createSprite()}>Create sprite</button></div></section></div>}
    {(!hydrated || !writable) && <div className="file-blocker" role="alert"><section><p className="eyebrow">Project files need attention</p><h2>{!hydrated ? 'The workspace could not be loaded.' : 'Editing is paused until the files are valid.'}</h2>{diagnostics.slice(0, 4).map((item) => <p key={`${item.file}:${item.line}:${item.column}:${item.code}`}><code>{item.file}{item.line ? `:${item.line}:${item.column}` : ''}</code><br />{item.message}</p>)}{!diagnostics.length && <p>Waiting for the local Pixel Ape file server.</p>}</section></div>}
    {conflict && <div className="dialog-backdrop" role="presentation"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><p className="eyebrow">File conflict</p><h2 id="conflict-title">Both the browser and disk changed {conflict.resource === 'manifest' ? 'the workspace' : conflict.resource}.</h2><p>Your browser draft is still safe. Retry overwrites the latest disk version; use disk discards this browser draft.</p><div className="dialog-actions conflict-actions"><button className="quiet-button" onClick={() => void copyConflictDraft(conflict.resource)}>Copy draft</button><button className="quiet-button" onClick={() => exportConflictDraft(conflict.resource)}>Export draft</button><button className="quiet-button" onClick={() => resolveConflict(conflict.resource, 'disk')}>Use disk</button><button onClick={() => resolveConflict(conflict.resource, 'retry')}>Retry draft</button></div></section></div>}
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

function drawCheckerboard(ctx: CanvasRenderingContext2D, size: number, pixelScale: number) { for (let y = 0; y < size / pixelScale; y++) for (let x = 0; x < size / pixelScale; x++) { ctx.fillStyle = (x + y) % 2 ? '#dedede' : '#f4f4f4'; ctx.fillRect(x * pixelScale, y * pixelScale, pixelScale, pixelScale) } }
export default App
