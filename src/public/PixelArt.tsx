import { useEffect, useRef } from 'react'
import type { PixelPayload } from './api'
import styles from './PublicPages.module.css'

export function PixelArt({ artwork, label, className }: { artwork: PixelPayload; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = artwork.width
    canvas.height = artwork.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, artwork.width, artwork.height)
    if (artwork.background !== 'transparent') { context.fillStyle = artwork.background; context.fillRect(0, 0, artwork.width, artwork.height) }
    artwork.pixels.forEach((pixel, index) => { if (pixel) { context.fillStyle = pixel; context.fillRect(index % artwork.width, Math.floor(index / artwork.width), 1, 1) } })
  }, [artwork])
  return <canvas ref={ref} className={`${styles.pixelArt} ${className ?? ''}`} style={{ aspectRatio: `${artwork.width} / ${artwork.height}` }} aria-label={label} role="img" />
}
