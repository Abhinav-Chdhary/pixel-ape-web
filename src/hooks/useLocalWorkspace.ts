import { useCallback, useEffect, useState } from 'react'
import { createWorkspace, normalizeWorkspace } from '../project'
import type { PixelProject, PixelWorkspace } from '../types'

type FileDiagnostic = {
  severity: 'error' | 'warning'
  code: string
  file: string
  line: number
  column: number
  message: string
}

type Conflict = {
  resource: 'manifest' | string
} | null

type FileStatus = 'loading' | 'saved' | 'saving' | 'unsaved' | 'conflict' | 'invalid' | 'offline'

const storageKey = 'pixel-ape-web:workspace'

/**
 * Temporary browser persistence for the frontend foundation.
 * Replace this hook with API calls once the Zerops backend is added.
 */
export function useLocalWorkspace(_onExternalSpriteChange?: (id: string) => void) {
  const [status] = useState<FileStatus>('saved')
  const [workspace, setWorkspace] = useState<PixelWorkspace>(() => {
    try {
      const saved = globalThis.localStorage?.getItem(storageKey)
      return saved ? normalizeWorkspace(JSON.parse(saved)) : createWorkspace()
    } catch {
      return createWorkspace()
    }
  })

  useEffect(() => {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(workspace))
  }, [workspace])

  const updateManifest = useCallback((update: (current: PixelWorkspace) => PixelWorkspace) => {
    setWorkspace(update)
  }, [])

  const updateSprite = useCallback((id: string, update: (current: PixelProject & { id: string }) => PixelProject) => {
    setWorkspace((current) => {
      const sprite = current.sprites.find((item) => item.id === id)
      if (!sprite) return current
      const next = update(sprite)
      if (next === sprite) return current
      return { ...current, sprites: current.sprites.map((item) => item.id === id ? { ...next, id } : item) }
    })
  }, [])

  const createSprite = useCallback(async (project: PixelProject) => {
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    setWorkspace((current) => ({ ...current, activeSpriteId: id, sprites: [...current.sprites, { ...project, id }] }))
    return true
  }, [])

  const resolveConflict = useCallback(async (_resource: string, _resolution: 'disk' | 'retry') => undefined, [])
  const copyConflictDraft = useCallback(async (_resource: string) => undefined, [])
  const exportConflictDraft = useCallback((_resource: string) => undefined, [])
  const setReconciliationPaused = useCallback((_paused: boolean) => undefined, [])
  return {
    workspace,
    hydrated: true,
    writable: true,
    diagnostics: [] as FileDiagnostic[],
    status,
    conflict: null as Conflict,
    updateManifest,
    updateSprite,
    createSprite,
    resolveConflict,
    copyConflictDraft,
    exportConflictDraft,
    setReconciliationPaused,
  }
}
