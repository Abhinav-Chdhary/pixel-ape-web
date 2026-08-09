import { useEffect, useRef } from 'react'
import type { PixelPayload } from '../../public/api'
import styles from './SpriteThumbnail.module.css'

type Props = { preview?: PixelPayload; name: string }

export function SpriteThumbnail({ preview, name }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !preview) return
    canvas.width = preview.width
    canvas.height = preview.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, preview.width, preview.height)
    if (preview.background !== 'transparent') {
      context.fillStyle = preview.background
      context.fillRect(0, 0, preview.width, preview.height)
    }
    preview.pixels.forEach((pixel, index) => {
      if (!pixel) return
      context.fillStyle = pixel
      context.fillRect(index % preview.width, Math.floor(index / preview.width), 1, 1)
    })
  }, [preview])

  return <div className={styles.frame}>{preview
    ? <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={`${name || 'Untitled sprite'} preview`} />
    : <img className={styles.placeholder} src="/sprite-thumbnail-placeholder.svg" alt={`${name || 'Untitled sprite'} preview unavailable`} />
  }</div>
}
