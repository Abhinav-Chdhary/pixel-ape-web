import { useCallback, useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'

type UseAnchoredDialogOptions = {
  gap?: number
}

type DialogPosition = Pick<CSSProperties, 'bottom' | 'left' | 'position'>

/** Positions a fixed dialog directly above the element that opened it. */
export function useAnchoredDialog({ gap = 4 }: UseAnchoredDialogOptions = {}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<DialogPosition | null>(null)

  const updatePosition = useCallback(() => {
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    setPosition({
      position: 'fixed',
      left: Math.max(12, rect.left),
      bottom: window.innerHeight - rect.top + gap,
    })
  }, [anchor, gap])

  useLayoutEffect(() => {
    if (!anchor) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const observer = new ResizeObserver(updatePosition)
    observer.observe(anchor)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      observer.disconnect()
    }
  }, [anchor, updatePosition])

  const openDialog = useCallback((nextAnchor: HTMLElement) => setAnchor(nextAnchor), [])
  const closeDialog = useCallback(() => {
    setAnchor(null)
    setPosition(null)
  }, [])
  const toggleDialog = useCallback((nextAnchor: HTMLElement) => {
    if (anchor === nextAnchor) closeDialog()
    else setAnchor(nextAnchor)
  }, [anchor, closeDialog])

  return {
    closeDialog,
    dialogStyle: position ?? undefined,
    isDialogOpen: anchor !== null,
    openDialog,
    toggleDialog,
  }
}
