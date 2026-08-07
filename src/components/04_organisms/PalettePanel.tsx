import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Background } from '../../types'
import { useAnchoredDialog } from '../../hooks/useAnchoredDialog'
import { OpenInFullIcon } from '../../icons'
import { isPrimaryPointerPressed, PALETTE_COLUMNS, updatePaletteDrag } from './paletteResize'
import { formatColor, getColorChannels, hsvToRgb, parseColor, parseHexColor, rgbToHsv, setColorChannel, toHex } from './colorModels'
import type { Color, ColorChannel, ColorMode } from './colorModels'
import styles from './PalettePanel.module.css'

type PalettePanelProps = {
  color: string | null
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

type ResizeState = { pointerId: number | null; anchorX: number; anchorY: number; cellSize: number }

const idleResizeState: ResizeState = { pointerId: null, anchorX: 0, anchorY: 0, cellSize: 0 }
const emptyPickerColor: Color = { red: 255, green: 0, blue: 0, opacity: 100 }

export function PalettePanel({ color, background, editingSlot, eyedropperColor, palette, onPaletteChange, onColorChange, onBackgroundChange, onPaletteSlotSelect, onEmptySlotClick, onSetSlot }: PalettePanelProps) {
  const [draftColor, setDraftColor] = useState<Color | null>(null)
  const [colorTarget, setColorTarget] = useState<'foreground' | 'background'>('foreground')
  const [editorMode, setEditorMode] = useState<ColorMode>('rgb')
  const [dialogHexDraft, setDialogHexDraft] = useState('')
  const [pickerHexDraft, setPickerHexDraft] = useState('')
  const paletteRef = useRef(palette)
  const resizeSlotsRef = useRef<ResizeState>(idleResizeState)
  const colorPlaneRef = useRef<HTMLDivElement>(null)
  const { closeDialog, dialogStyle, isDialogOpen, toggleDialog } = useAnchoredDialog()
  const pickerColor = color ? parseColor(color) : emptyPickerColor
  const pickerHsv = rgbToHsv(pickerColor)
  const pickerHex = toHex(pickerColor)

  useEffect(() => { paletteRef.current = palette }, [palette])
  useEffect(() => { setPickerHexDraft(pickerHex) }, [pickerHex])
  useEffect(() => { if (draftColor) setDialogHexDraft(toHex(draftColor)) }, [draftColor])

  const updatePalette = (next: Array<string | null>) => { paletteRef.current = next; onPaletteChange(next) }
  const stopResizing = () => { resizeSlotsRef.current = idleResizeState }
  const applyForegroundColor = (next: Color) => {
    const nextColor = formatColor(next)
    if (editingSlot !== null) onSetSlot(editingSlot, nextColor)
    else onColorChange(nextColor)
  }
  const applyDraftColor = (next: Color) => {
    setDraftColor(next)
    if (colorTarget === 'foreground') applyForegroundColor(next)
    else onBackgroundChange(formatColor(next))
  }
  const setChannel = (channel: ColorChannel, value: number) => {
    if (!draftColor || !Number.isFinite(value)) return
    applyDraftColor(setColorChannel(draftColor, editorMode, channel, value))
  }
  const toggleColorEditor = (target: 'foreground' | 'background', nextColor: string | null, anchor: HTMLElement) => {
    setColorTarget(target)
    setDraftColor(target === 'foreground' && !nextColor ? emptyPickerColor : parseColor(nextColor))
    setEditorMode('rgb')
    toggleDialog(anchor)
  }
  const updatePickerFromPlane = (event: PointerEvent<HTMLDivElement>) => {
    const rect = colorPlaneRef.current?.getBoundingClientRect()
    if (!rect) return
    const saturation = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))
    const value = Math.max(0, Math.min(100, (1 - (event.clientY - rect.top) / rect.height) * 100))
    applyForegroundColor({ ...hsvToRgb({ hue: pickerHsv.hue, saturation, value }), opacity: pickerColor.opacity })
  }
  const updatePickerHex = (value: string) => {
    setPickerHexDraft(value)
    const next = parseHexColor(value, pickerColor.opacity)
    if (next) applyForegroundColor(next)
  }
  const updateDialogHex = (value: string) => {
    setDialogHexDraft(value)
    if (!draftColor) return
    const next = parseHexColor(value, draftColor.opacity)
    if (next) applyDraftColor(next)
  }

  return <aside className={`${styles.panel} ${styles.palettePanel}`} aria-label="Color palette">
    <div className={styles.heading}><span>Palette</span><small>RGB / 12</small></div>
    <div className={styles.swatches} style={{ gridTemplateColumns: `repeat(${PALETTE_COLUMNS}, 1fr)` }}>{palette.map((swatch, index) => swatch
      ? <button key={`${swatch}-${index}`} className={editingSlot === index ? styles.selected : ''} style={{ backgroundColor: swatch }} onClick={() => onPaletteSlotSelect(index, swatch)} title={swatch} aria-label={`Use color ${swatch}`} aria-pressed={editingSlot === index} />
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
      if (!isPrimaryPointerPressed(state.pointerId, event.pointerId, event.buttons)) { stopResizing(); return }
      const result = updatePaletteDrag(paletteRef.current, { x: state.anchorX, y: state.anchorY }, { x: event.clientX, y: event.clientY }, state.cellSize)
      state.anchorX = result.anchor.x
      state.anchorY = result.anchor.y
      if (result.palette !== paletteRef.current) updatePalette(result.palette)
    }} onPointerUp={(event) => { if (resizeSlotsRef.current.pointerId === event.pointerId) stopResizing() }} onPointerCancel={stopResizing} onLostPointerCapture={stopResizing} title="Press and drag left or right for slots and up or down for rows." aria-label="Resize color slots by pressing and dragging"><OpenInFullIcon /></button></div>
    <div className={styles.note}><span>Tip</span><p>{color ? 'Press and drag to paint continuously.' : 'Choose a color to paint.'}</p></div>
    <section className={styles.colorSelector} aria-label="Foreground color selector">
      <div className={styles.selectorLabel}><span>Color</span><code>{pickerHex.toUpperCase()}</code></div>
      <div className={styles.colorPlane} ref={colorPlaneRef} style={{ backgroundColor: `hsl(${pickerHsv.hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updatePickerFromPlane(event) }} onPointerMove={(event) => { if (event.buttons & 1) updatePickerFromPlane(event) }} role="slider" aria-label="Color saturation and brightness" aria-valuetext={`${Math.round(pickerHsv.saturation)}% saturation, ${Math.round(pickerHsv.value)}% brightness`}><span className={styles.planeWhite} /><span className={styles.planeBlack} /><span className={styles.colorCursor} style={{ left: `${pickerHsv.saturation}%`, top: `${100 - pickerHsv.value}%` }} /></div>
      <label className={styles.hueControl}><span>Hue</span><input type="range" min="0" max="360" value={pickerHsv.hue} onChange={(event) => applyForegroundColor({ ...hsvToRgb({ ...pickerHsv, hue: event.currentTarget.valueAsNumber }), opacity: pickerColor.opacity })} aria-label="Hue" /></label>
      <label className={`${styles.hexInput} ${parseHexColor(pickerHexDraft) ? '' : styles.invalidHex}`}><span>Hex</span><input type="text" value={pickerHexDraft} onChange={(event) => updatePickerHex(event.currentTarget.value)} onBlur={() => { const next = parseHexColor(pickerHexDraft); if (next) setPickerHexDraft(toHex(next)) }} inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="Foreground hex color" aria-invalid={!parseHexColor(pickerHexDraft)} /></label>
    </section>
    <div className={styles.colorDock} aria-label="Color controls"><button onClick={(event) => toggleColorEditor('foreground', color, event.currentTarget)}><span className={`${styles.foregroundChip} ${!color ? styles.emptyColor : ''}`} style={color ? { backgroundColor: color } : undefined} />Foreground</button><button onClick={(event) => toggleColorEditor('background', background, event.currentTarget)}><span className={styles.backgroundChip} style={{ backgroundColor: background === 'transparent' ? undefined : background }} />Background</button></div>
    {isDialogOpen && draftColor && <section className={styles.slotControls} style={dialogStyle} role="dialog" aria-label={`${colorTarget} color editor`}><div className={styles.slotHeading}><span>{colorTarget === 'background' ? 'Background' : editingSlot === null ? 'Foreground' : `Slot ${editingSlot + 1}`}</span><button onClick={closeDialog} aria-label="Close color editor">×</button></div><label className={`${styles.hexInput} ${parseHexColor(dialogHexDraft) ? '' : styles.invalidHex}`}><span>Hex</span><input type="text" value={dialogHexDraft} onChange={(event) => updateDialogHex(event.currentTarget.value)} onBlur={() => { const next = parseHexColor(dialogHexDraft); if (next) setDialogHexDraft(toHex(next)) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="Hex color" aria-invalid={!parseHexColor(dialogHexDraft)} /></label><div className={styles.colorModes} role="tablist" aria-label="Color model">{(['rgb', 'hsv', 'hsl', 'gray'] as const).map((mode) => <button key={mode} className={editorMode === mode ? styles.selectedColorMode : ''} role="tab" aria-selected={editorMode === mode} onClick={() => setEditorMode(mode)}>{mode === 'gray' ? 'Gray' : mode.toUpperCase()}</button>)}</div><div className={styles.channelRows}>{getColorChannels(draftColor, editorMode).map((channel) => <label key={channel.channel} className={`${styles.channelRow} ${styles[channel.channel]}`}><span>{channel.label}</span><input type="range" min={channel.min} max={channel.max} value={channel.value} onChange={(event) => setChannel(channel.channel, event.currentTarget.valueAsNumber)} /><input type="number" min={channel.min} max={channel.max} value={channel.value} onChange={(event) => setChannel(channel.channel, event.currentTarget.valueAsNumber)} /></label>)}</div></section>}
  </aside>
}
