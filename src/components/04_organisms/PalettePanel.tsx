import { useEffect, useRef, useState } from 'react'
import type { Background } from '../../types'
import { useAnchoredDialog } from '../../hooks/useAnchoredDialog'
import { OpenInFullIcon } from '../../icons'
import { isPrimaryPointerPressed, PALETTE_COLUMNS, updatePaletteDrag } from './paletteResize'
import { formatColor, getColorChannels, parseColor, setColorChannel, toHex } from './colorModels'
import type { Color, ColorChannel, ColorMode } from './colorModels'
import styles from './PalettePanel.module.css'

type PalettePanelProps = {
  color: string
  background: Background
  editingSlot: number | null
  eyedropperColor: string | null
  palette: Array<string | null>
  onPaletteChange: (palette: Array<string | null>) => void
  onColorChange: (color: string) => void
  onBackgroundChange: (color: Background) => void
  onPaletteSlotSelect: (index: number, color: string) => void
  onEmptySlotClick: (index: number) => void
  onSetSlot: (index: number, color: string) => void
}

type ResizeState = {
  pointerId: number | null
  anchorX: number
  anchorY: number
  cellSize: number
}

const idleResizeState: ResizeState = { pointerId: null, anchorX: 0, anchorY: 0, cellSize: 0 }

export function PalettePanel({ color, background, editingSlot, eyedropperColor, palette, onPaletteChange, onColorChange, onBackgroundChange, onPaletteSlotSelect, onEmptySlotClick, onSetSlot }: PalettePanelProps) {
  const [draftColor, setDraftColor] = useState<Color | null>(null)
  const [colorTarget, setColorTarget] = useState<'foreground' | 'background'>('foreground')
  const [editorMode, setEditorMode] = useState<ColorMode>('rgb')
  const paletteRef = useRef(palette)
  const resizeSlotsRef = useRef<ResizeState>(idleResizeState)
  const { closeDialog, dialogStyle, isDialogOpen, toggleDialog } = useAnchoredDialog()
  useEffect(() => { paletteRef.current = palette }, [palette])
  const updatePalette = (next: Array<string | null>) => { paletteRef.current = next; onPaletteChange(next) }
  const stopResizing = () => { resizeSlotsRef.current = idleResizeState }
  const setChannel = (channel: ColorChannel, value: number) => {
    if (!draftColor || !Number.isFinite(value)) return
    const next = setColorChannel(draftColor, editorMode, channel, value)
    setDraftColor(next)
    const nextColor = formatColor(next)
    if (editingSlot !== null) onSetSlot(editingSlot, nextColor)
    if (colorTarget === 'foreground') onColorChange(nextColor)
    else onBackgroundChange(nextColor)
  }
  const toggleColorEditor = (target: 'foreground' | 'background', nextColor: string | null, anchor: HTMLElement) => {
    setColorTarget(target)
    setDraftColor(parseColor(nextColor))
    setEditorMode('rgb')
    toggleDialog(anchor)
  }
  return <aside className={`${styles.panel} ${styles.palettePanel}`} aria-label="Color palette">
    <div className={styles.heading}><span>Palette</span><small>RGB / 12</small></div>
    <div className={styles.currentColor}><span style={{ backgroundColor: color }} /><code>{color.toUpperCase()}</code></div>
    <div className={styles.swatches} style={{ gridTemplateColumns: `repeat(${PALETTE_COLUMNS}, 1fr)` }}>{palette.map((swatch, index) => swatch
      ? <button key={`${swatch}-${index}`} className={editingSlot === index || (editingSlot === null && color === swatch) ? styles.selected : ''} style={{ backgroundColor: swatch }} onClick={() => onPaletteSlotSelect(index, swatch)} title={swatch} aria-label={`Use color ${swatch}`} aria-pressed={editingSlot === index} />
      : <button key={`empty-${index}`} className={`${styles.emptySlot} ${editingSlot === index ? styles.selected : ''}`} onClick={() => onEmptySlotClick(index)} title={eyedropperColor ? `Save sampled color ${eyedropperColor} to slot ${index + 1}` : `Select empty color slot ${index + 1}`} aria-label={eyedropperColor ? `Save sampled color to slot ${index + 1}` : `Select empty color slot ${index + 1}`} aria-pressed={editingSlot === index} />
    )}<button className={styles.resizeSlots} onPointerDown={(event) => {
      if (event.button !== 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      resizeSlotsRef.current = { pointerId: event.pointerId, anchorX: event.clientX, anchorY: event.clientY, cellSize: rect.width + 5 }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    }} onPointerMove={(event) => {
      const state = resizeSlotsRef.current
      if (state.pointerId === null) return
      if (!isPrimaryPointerPressed(state.pointerId, event.pointerId, event.buttons)) {
        stopResizing()
        return
      }
      const result = updatePaletteDrag(paletteRef.current, { x: state.anchorX, y: state.anchorY }, { x: event.clientX, y: event.clientY }, state.cellSize)
      state.anchorX = result.anchor.x
      state.anchorY = result.anchor.y
      if (result.palette !== paletteRef.current) updatePalette(result.palette)
    }} onPointerUp={(event) => {
      if (resizeSlotsRef.current.pointerId === event.pointerId) stopResizing()
    }} onPointerCancel={stopResizing} onLostPointerCapture={stopResizing} title="Press and drag left or right for slots and up or down for rows." aria-label="Resize color slots by pressing and dragging"><OpenInFullIcon /></button></div>
    <div className={styles.note}><span>Tip</span><p>Press and drag to paint continuously.</p></div>
    <div className={styles.colorDock} aria-label="Color controls"><button onClick={(event) => toggleColorEditor('foreground', color, event.currentTarget)}><span className={styles.foregroundChip} style={{ backgroundColor: color }} />Foreground</button><button onClick={(event) => toggleColorEditor('background', background, event.currentTarget)}><span className={styles.backgroundChip} style={{ backgroundColor: background === 'transparent' ? undefined : background }} />Background</button></div>
    {isDialogOpen && draftColor && <section className={styles.slotControls} style={dialogStyle} role="dialog" aria-label={`${colorTarget} color editor`}><div className={styles.slotHeading}><span>{editingSlot === null ? colorTarget : `Slot ${editingSlot + 1}`}</span><code>{toHex(draftColor)} / {draftColor.opacity}%</code><button onClick={closeDialog} aria-label="Close color editor">×</button></div><div className={styles.colorModes} role="tablist" aria-label="Color model">{(['rgb', 'hsv', 'hsl', 'gray'] as const).map((mode) => <button key={mode} className={editorMode === mode ? styles.selectedColorMode : ''} role="tab" aria-selected={editorMode === mode} onClick={() => setEditorMode(mode)}>{mode === 'gray' ? 'Gray' : mode.toUpperCase()}</button>)}</div><div className={styles.channelRows}>{getColorChannels(draftColor, editorMode).map((channel) => <label key={channel.channel} className={`${styles.channelRow} ${styles[channel.channel]}`}><span>{channel.label}</span><input type="range" min={channel.min} max={channel.max} value={channel.value} onChange={(event) => setChannel(channel.channel, event.currentTarget.valueAsNumber)} /><input type="number" min={channel.min} max={channel.max} value={channel.value} onChange={(event) => setChannel(channel.channel, event.currentTarget.valueAsNumber)} /></label>)}</div></section>}
  </aside>
}
