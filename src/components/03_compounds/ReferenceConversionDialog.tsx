import { useEffect, useRef, useState } from 'react'
import { convertReferenceImage } from '../../referenceConversion'
import type { ReferenceConversionResult, ReferenceFit, ReferencePaletteMode } from '../../referenceConversion'
import type { PixelProject } from '../../types'

type ReferenceConversionDialogProps = {
  image: HTMLImageElement
  palette: Array<string | null>
  project: PixelProject
  onApply: (result: ReferenceConversionResult, useExtractedPalette: boolean) => void
  onClose: () => void
}

export function ReferenceConversionDialog({ image, palette, project, onApply, onClose }: ReferenceConversionDialogProps) {
  const [fit, setFit] = useState<ReferenceFit>('contain')
  const [paletteMode, setPaletteMode] = useState<ReferencePaletteMode>('auto')
  const [autoColorCount, setAutoColorCount] = useState(12)
  const [dither, setDither] = useState(false)
  const [result, setResult] = useState<ReferenceConversionResult | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const previewRef = useRef<HTMLCanvasElement>(null)
  const previewScale = Math.max(1, Math.min(12, Math.floor(480 / Math.max(project.width, project.height))))

  useEffect(() => {
    setBusy(true)
    setError('')
    setResult(null)
    const timeout = window.setTimeout(() => {
      try {
        setResult(convertReferenceImage(image, project.width, project.height, { fit, paletteMode, palette, autoColorCount, dither }))
      } catch {
        setError('This image could not be converted. Try another PNG, JPEG, or WebP file.')
      } finally {
        setBusy(false)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [autoColorCount, dither, fit, image, palette, paletteMode, project.height, project.width])

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !result) return
    const context = canvas.getContext('2d')!
    const cellSize = canvas.width / project.width
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < project.height; y++) {
      for (let x = 0; x < project.width; x++) {
        context.fillStyle = (x + y) % 2 ? '#dedede' : '#f4f4f4'
        context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
      }
    }
    result.pixels.forEach((pixel, index) => {
      if (!pixel) return
      context.fillStyle = pixel
      context.fillRect((index % project.width) * cellSize, Math.floor(index / project.width) * cellSize, cellSize, cellSize)
    })
  }, [project.height, project.width, result])

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="reference-conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="reference-conversion-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="reference-conversion-heading"><div><p className="eyebrow">Reference conversion</p><h2 id="reference-conversion-title">Turn image into pixels</h2></div><span>{project.width} × {project.height}</span></header>
      <div className="reference-conversion-layout">
        <div className="conversion-proof">
          <div className="conversion-proof-label"><span>Conversion proof</span><b>{busy ? 'WORKING' : result ? `${result.palette.length} COLORS` : 'NO PREVIEW'}</b></div>
          <div className="conversion-preview-frame">
            {busy && <span className="conversion-preview-status">Building preview…</span>}
            {error && <span className="conversion-preview-status conversion-error">{error}</span>}
            <canvas ref={previewRef} width={project.width * previewScale} height={project.height * previewScale} aria-label="Converted pixel art preview" />
          </div>
          <div className="conversion-palette" aria-label="Colors used in conversion">{result?.palette.slice(0, 16).map((color) => <span key={color} style={{ backgroundColor: color }} title={color} />)}</div>
        </div>
        <div className="conversion-controls">
          <fieldset><legend>Image framing</legend><div className="conversion-choice-row"><button aria-pressed={fit === 'contain'} className={fit === 'contain' ? 'selected-conversion-choice' : ''} onClick={() => setFit('contain')}><b>Fit</b><small>Keep the whole image</small></button><button aria-pressed={fit === 'cover'} className={fit === 'cover' ? 'selected-conversion-choice' : ''} onClick={() => setFit('cover')}><b>Crop</b><small>Fill every edge</small></button></div></fieldset>
          <fieldset><legend>Color source</legend><div className="conversion-choice-row"><button aria-pressed={paletteMode === 'current'} className={paletteMode === 'current' ? 'selected-conversion-choice' : ''} onClick={() => setPaletteMode('current')} disabled={!palette.some(Boolean)}><b>Current palette</b><small>Match editor colors</small></button><button aria-pressed={paletteMode === 'auto'} className={paletteMode === 'auto' ? 'selected-conversion-choice' : ''} onClick={() => setPaletteMode('auto')}><b>Auto palette</b><small>Extract from image</small></button></div>{paletteMode === 'auto' && <label className="auto-color-count"><span>Colors</span><select value={autoColorCount} onChange={(event) => setAutoColorCount(Number(event.target.value))}><option value="8">8 colors</option><option value="12">12 colors</option><option value="16">16 colors</option></select></label>}</fieldset>
          <label className="conversion-dither"><input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} /><span><b>Dither gradients</b><small>Mix neighboring colors for extra detail</small></span></label>
        </div>
      </div>
      <p className="conversion-note">Applying replaces the current canvas pixels{paletteMode === 'auto' ? ' and sets the extracted colors as the editor palette' : ''}. The canvas change can be undone once with Undo.</p>
      <div className="dialog-actions reference-conversion-actions"><button className="quiet-button" onClick={onClose}>Cancel</button><button disabled={!result || busy} onClick={() => { if (result) onApply(result, paletteMode === 'auto') }}>Apply to canvas</button></div>
    </section>
  </div>
}
