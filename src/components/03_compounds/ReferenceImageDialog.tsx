import { useEffect, useRef, useState } from 'react'

type ReferenceImageDialogProps = {
  replacing: boolean
  onClose: () => void
  onSelect: (file: File) => Promise<void>
}

const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

export function ReferenceImageDialog({ replacing, onClose, onSelect }: ReferenceImageDialogProps) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)

  const acceptFile = async (file: File | null) => {
    if (!file) { setError('No image was found. Choose a PNG, JPEG, WebP, GIF, or SVG file.'); return }
    if (!file.type.startsWith('image/')) { setError('That file is not an image. Choose a PNG, JPEG, WebP, GIF, or SVG file.'); return }
    if (file.size > MAX_REFERENCE_BYTES) { setError('That image is larger than 20 MB. Choose a smaller file.'); return }
    setBusy(true)
    setError('')
    try {
      await onSelect(file)
      onClose()
    } catch {
      setError('The browser could not read that image. Try exporting it as PNG or JPEG first.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((candidate) => candidate.type.startsWith('image/'))
      if (!item) { setError('The clipboard does not contain an image. Copy an image, then paste again.'); return }
      event.preventDefault()
      void acceptFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="reference-image-dialog" role="dialog" aria-modal="true" aria-labelledby="reference-image-title" onMouseDown={(event) => event.stopPropagation()}>
      <p className="eyebrow">Reference image</p>
      <h2 id="reference-image-title">{replacing ? 'Replace your reference' : 'Add a reference'}</h2>
      <p className="reference-image-intro">Bring in an image to trace beside the canvas or convert into editable pixel art.</p>
      <div
        className={`reference-drop-zone ${dragging ? 'reference-drop-active' : ''} ${busy ? 'reference-drop-busy' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current -= 1; if (dragDepthRef.current <= 0) { dragDepthRef.current = 0; setDragging(false) } }}
        onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDragging(false); void acceptFile(event.dataTransfer.files[0] ?? null) }}
      >
        <i className="reference-register reference-register-tl" /><i className="reference-register reference-register-tr" /><i className="reference-register reference-register-bl" /><i className="reference-register reference-register-br" />
        <div className="reference-paste-key"><kbd>⌘</kbd><span>/</span><kbd>Ctrl</kbd><b>+</b><kbd>V</kbd></div>
        <strong>{dragging ? 'Release to add image' : busy ? 'Reading image…' : 'Paste or drop image here'}</strong>
        <span>or</span>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>Browse files</button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { void acceptFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = '' }} />
      </div>
      <p className={`reference-image-message ${error ? 'reference-image-error' : ''}`} role="status" aria-live="polite">{error || 'PNG, JPEG, WebP, GIF, or SVG · maximum 20 MB'}</p>
      <div className="dialog-actions reference-image-actions"><button className="quiet-button" onClick={onClose}>Cancel</button></div>
    </section>
  </div>
}
