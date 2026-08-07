import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorkspace, normalizeWorkspace } from '../project'
import { supabase } from '../lib/supabase'
import type { PixelProject, PixelWorkspace } from '../types'

type FileDiagnostic = { severity: 'error' | 'warning'; code: string; file: string; line: number; column: number; message: string }
type Conflict = { resource: 'manifest' | string } | null
type FileStatus = 'loading' | 'saved' | 'saving' | 'unsaved' | 'conflict' | 'invalid' | 'offline'
type ProjectRow = { id: string; name: string; active_sprite_id: string | null; palette: unknown; revision: number }
type SpriteRow = { id: string; position: number; name: string; format_version: number; width: number; height: number; background: string; pixels: unknown }

const storageKey = 'pixel-ape-web:workspace'
const cloudProjectKey = 'pixel-ape-web:cloud-project'

function readLocalWorkspace(key = storageKey) {
  try {
    const saved = globalThis.localStorage?.getItem(key)
    return saved ? normalizeWorkspace(JSON.parse(saved)) : createWorkspace()
  } catch {
    return createWorkspace()
  }
}

export function useWorkspace(user: User | null, onExternalSpriteChange?: (id: string) => void) {
  const [workspace, setWorkspace] = useState<PixelWorkspace>(readLocalWorkspace)
  const [status, setStatus] = useState<FileStatus>('saved')
  const [conflict, setConflict] = useState<Conflict>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const projectIdRef = useRef<string | null>(null)
  const revisionRef = useRef(0)
  const saveSequenceRef = useRef(Promise.resolve())
  const workspaceRef = useRef(workspace)
  const skipSaveRef = useRef(true)
  const pausedRef = useRef(false)
  workspaceRef.current = workspace

  useEffect(() => {
    const key = user ? `${storageKey}:${user.id}` : storageKey
    globalThis.localStorage?.setItem(key, JSON.stringify(workspace))
  }, [user, workspace])

  useEffect(() => {
    let active = true
    setConflict(null)
    if (!user || !supabase) {
      projectIdRef.current = null
      revisionRef.current = 0
      setCloudReady(false)
      setStatus('saved')
      setWorkspace(readLocalWorkspace())
      return
    }
    setStatus('loading')
    skipSaveRef.current = true
    void hydrateCloud(user, workspaceRef.current).then((result) => {
      if (!active) return
      projectIdRef.current = result.projectId
      revisionRef.current = result.revision
      globalThis.localStorage?.setItem(cloudProjectKey, result.projectId)
      if (result.workspace) {
        setWorkspace(result.workspace)
        onExternalSpriteChange?.(result.workspace.activeSpriteId)
      }
      setCloudReady(true)
      setStatus('saved')
      window.setTimeout(() => { skipSaveRef.current = false }, 0)
    }).catch(() => {
      if (!active) return
      setCloudReady(false)
      setStatus('offline')
    })
    return () => { active = false }
  }, [onExternalSpriteChange, user])

  useEffect(() => {
    if (!user || !supabase || !cloudReady || skipSaveRef.current || pausedRef.current || conflict) return
    setStatus('unsaved')
    const timer = window.setTimeout(() => {
      const snapshot = workspaceRef.current
      const projectId = projectIdRef.current
      if (!projectId) return
      setStatus('saving')
      saveSequenceRef.current = saveSequenceRef.current.then(async () => {
        const nextRevision = await saveCloudWorkspace(user.id, projectId, snapshot, revisionRef.current)
        revisionRef.current = nextRevision
        setStatus('saved')
      }).catch((error: unknown) => {
        if (error instanceof CloudConflictError) {
          setConflict({ resource: 'manifest' })
          setStatus('conflict')
        } else setStatus('offline')
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [cloudReady, conflict, user, workspace])

  const updateManifest = useCallback((update: (current: PixelWorkspace) => PixelWorkspace) => setWorkspace(update), [])
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
  const resolveConflict = useCallback(async (_resource: string, resolution: 'disk' | 'retry') => {
    if (!user || !supabase) return
    setConflict(null); setStatus('loading')
    if (resolution === 'disk') {
      const result = await hydrateCloud(user, workspaceRef.current, projectIdRef.current)
      projectIdRef.current = result.projectId; revisionRef.current = result.revision
      if (result.workspace) setWorkspace(result.workspace)
    } else {
      const { data, error } = await supabase.from('projects').select('revision').eq('id', projectIdRef.current!).single()
      if (error) throw error
      revisionRef.current = data.revision
      skipSaveRef.current = false
      setWorkspace((current) => ({ ...current }))
    }
    setStatus('saved')
  }, [user])
  const copyConflictDraft = useCallback(async (_resource?: string) => { await navigator.clipboard.writeText(JSON.stringify(workspaceRef.current, null, 2)) }, [])
  const exportConflictDraft = useCallback((_resource?: string) => {
    const link = document.createElement('a')
    link.download = 'pixel-ape-conflict-draft.json'
    link.href = URL.createObjectURL(new Blob([JSON.stringify(workspaceRef.current, null, 2)], { type: 'application/json' }))
    link.click(); URL.revokeObjectURL(link.href)
  }, [])
  const setReconciliationPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused
    if (!paused) setWorkspace((current) => ({ ...current }))
  }, [])

  return {
    workspace, hydrated: status !== 'loading', writable: true, diagnostics: [] as FileDiagnostic[], status, conflict,
    updateManifest, updateSprite, createSprite, resolveConflict, copyConflictDraft, exportConflictDraft, setReconciliationPaused,
  }
}

async function hydrateCloud(user: User, local: PixelWorkspace, requestedProjectId?: string | null) {
  if (!supabase) throw new Error('Supabase is not configured')
  let query = supabase.from('projects').select('id,name,active_sprite_id,palette,revision').eq('owner_id', user.id).is('deleted_at', null)
  const remembered = requestedProjectId ?? globalThis.localStorage?.getItem(cloudProjectKey)
  if (remembered) query = query.eq('id', remembered)
  let { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle<ProjectRow>()
  if (error) throw error
  if (!data && remembered) {
    const fallback = await supabase.from('projects').select('id,name,active_sprite_id,palette,revision').eq('owner_id', user.id).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle<ProjectRow>()
    if (fallback.error) throw fallback.error
    data = fallback.data
  }
  if (!data) {
    const projectId = crypto.randomUUID()
    const { error: createError } = await supabase.from('projects').insert({ id: projectId, owner_id: user.id, name: local.sprites[0]?.name || 'My pixel art', active_sprite_id: local.activeSpriteId, palette: local.palette })
    if (createError) throw createError
    const { error: spriteError } = await supabase.from('sprites').insert(spriteRows(projectId, local))
    if (spriteError) throw spriteError
    return { projectId, revision: 1, workspace: null as PixelWorkspace | null }
  }
  const { data: sprites, error: spriteError } = await supabase.from('sprites').select('id,position,name,format_version,width,height,background,pixels').eq('project_id', data.id).order('position').returns<SpriteRow[]>()
  if (spriteError) throw spriteError
  if (!sprites?.length) return { projectId: data.id, revision: data.revision, workspace: local }
  const workspace = normalizeWorkspace({
    version: 2,
    activeSpriteId: sprites.some((sprite) => sprite.id === data!.active_sprite_id) ? data.active_sprite_id : sprites[0].id,
    palette: data.palette,
    sprites: sprites.map((sprite) => ({ version: sprite.format_version, id: sprite.id, name: sprite.name, width: sprite.width, height: sprite.height, background: sprite.background, pixels: sprite.pixels })),
  })
  return { projectId: data.id, revision: data.revision, workspace }
}

async function saveCloudWorkspace(userId: string, projectId: string, workspace: PixelWorkspace, expectedRevision: number) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('projects').update({
    name: workspace.sprites[0]?.name || 'My pixel art', active_sprite_id: workspace.activeSpriteId,
    palette: workspace.palette, revision: expectedRevision + 1,
  }).eq('id', projectId).eq('owner_id', userId).eq('revision', expectedRevision).select('revision').maybeSingle()
  if (error) throw error
  if (!data) throw new CloudConflictError()
  const rows = spriteRows(projectId, workspace)
  const { error: upsertError } = await supabase.from('sprites').upsert(rows, { onConflict: 'id' })
  if (upsertError) throw upsertError
  const ids = workspace.sprites.map((sprite) => sprite.id)
  let deleteQuery = supabase.from('sprites').delete().eq('project_id', projectId)
  if (ids.length) deleteQuery = deleteQuery.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`)
  const { error: deleteError } = await deleteQuery
  if (deleteError) throw deleteError
  return data.revision as number
}

function spriteRows(projectId: string, workspace: PixelWorkspace) {
  return workspace.sprites.map((sprite, position) => ({
    id: sprite.id, project_id: projectId, position, name: sprite.name, format_version: sprite.version,
    width: sprite.width, height: sprite.height, background: sprite.background, pixels: sprite.pixels,
  }))
}

class CloudConflictError extends Error {}
