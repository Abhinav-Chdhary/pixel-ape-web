import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorkspace, normalizeWorkspace } from '../project'
import { supabase } from '../lib/supabase'
import type { PixelProject, PixelWorkspace } from '../types'

type FileDiagnostic = { severity: 'error' | 'warning'; code: string; file: string; line: number; column: number; message: string }
type Conflict = { resource: 'manifest' | string } | null
type FileStatus = 'loading' | 'saved' | 'saving' | 'unsaved' | 'conflict' | 'invalid' | 'offline' | 'sync-error'
export type SyncError = { code?: string; message: string } | null
type ProjectRow = { id: string; name: string; active_sprite_id: string | null; palette: unknown; revision: number }
type SpriteRow = { id: string; position: number; name: string; format_version: number; width: number; height: number; background: string; pixels: unknown }

const storageKey = 'pixel-ape-web:workspace'
const cloudProjectKey = 'pixel-ape-web:cloud-project'
const cloudRevisionKey = 'pixel-ape-web:cloud-revision'
const cloudDirtyKey = 'pixel-ape-web:cloud-dirty'
const guestDirtyKey = 'pixel-ape-web:guest-dirty'
const guestNudgeSeenKey = 'pixel-ape-web:guest-sync-nudge-seen'
const guestImportHandledKey = 'pixel-ape-web:guest-import-handled'

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
  const [syncError, setSyncError] = useState<SyncError>(null)
  const [conflict, setConflict] = useState<Conflict>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncNotice, setSyncNotice] = useState<'created' | 'imported' | null>(null)
  const [showGuestNudge, setShowGuestNudge] = useState(false)
  const projectIdRef = useRef<string | null>(null)
  const revisionRef = useRef(0)
  const saveSequenceRef = useRef(Promise.resolve())
  const workspaceRef = useRef(workspace)
  const skipSaveRef = useRef(true)
  const pausedRef = useRef(false)
  const loadedOwnerRef = useRef<string | null>('guest')
  const hydrationRef = useRef<{ owner: string; promise: ReturnType<typeof hydrateCloud> } | null>(null)
  const mutationGenerationRef = useRef(0)
  workspaceRef.current = workspace

  useEffect(() => {
    const owner = user?.id ?? 'guest'
    if (loadedOwnerRef.current !== owner) return
    const key = user ? `${storageKey}:${user.id}` : storageKey
    globalThis.localStorage?.setItem(key, JSON.stringify(workspace))
  }, [user, workspace])

  useEffect(() => {
    let active = true
    setConflict(null)
    setSyncError(null)
    const owner = user?.id ?? 'guest'
    loadedOwnerRef.current = null
    if (!user || !supabase) {
      projectIdRef.current = null
      revisionRef.current = 0
      setCloudReady(false)
      setStatus('saved')
      const guestWorkspace = readLocalWorkspace()
      loadedOwnerRef.current = 'guest'
      setWorkspace(guestWorkspace)
      hydrationRef.current = null
      return
    }
    setStatus('loading')
    skipSaveRef.current = true
    const userStorageKey = `${storageKey}:${user.id}`
    const savedUserWorkspace = globalThis.localStorage?.getItem(userStorageKey)
    const guestWorkspace = readLocalWorkspace()
    const shouldImportGuest = globalThis.localStorage?.getItem(guestDirtyKey) === 'true'
      || (globalThis.localStorage?.getItem(guestImportHandledKey) !== 'true' && hasMeaningfulArtwork(guestWorkspace))
    const local = shouldImportGuest
      ? ensureCloudIds(guestWorkspace)
      : savedUserWorkspace ? readLocalWorkspace(userStorageKey) : ensureCloudIds(workspaceRef.current)
    const storedRevision = Number(globalThis.localStorage?.getItem(`${cloudRevisionKey}:${user.id}`)) || 0
    const hasDirtyDraft = globalThis.localStorage?.getItem(`${cloudDirtyKey}:${user.id}`) === 'true'
    const hydration = hydrationRef.current?.owner === owner
      ? hydrationRef.current.promise
      : hydrateCloud(user, local, undefined, shouldImportGuest)
    hydrationRef.current = { owner, promise: hydration }
    void hydration.then((result) => {
      if (!active) return
      projectIdRef.current = result.projectId
      revisionRef.current = result.revision
      globalThis.localStorage?.setItem(cloudProjectKey, result.projectId)
      if (result.created || result.imported) {
        globalThis.localStorage?.setItem(guestDirtyKey, 'false')
        globalThis.localStorage?.setItem(guestImportHandledKey, 'true')
        setSyncNotice(result.imported ? 'imported' : 'created')
      }
      const hasOfflineDraft = Boolean(savedUserWorkspace && hasDirtyDraft && storedRevision === result.revision && result.workspace)
      const hasDivergedDraft = Boolean(savedUserWorkspace && hasDirtyDraft && storedRevision !== result.revision && result.workspace)
      const nextWorkspace = ensureCloudIds(hasOfflineDraft || hasDivergedDraft || !result.workspace ? local : result.workspace)
      loadedOwnerRef.current = owner
      setWorkspace(nextWorkspace)
      onExternalSpriteChange?.(nextWorkspace.activeSpriteId)
      setCloudReady(true)
      if (hasDivergedDraft) {
        setConflict({ resource: 'manifest' })
        setStatus('conflict')
        return
      }
      globalThis.localStorage?.setItem(`${cloudRevisionKey}:${user.id}`, String(result.revision))
      if (!hasOfflineDraft) globalThis.localStorage?.setItem(`${cloudDirtyKey}:${user.id}`, 'false')
      setStatus('saved')
      window.setTimeout(() => {
        skipSaveRef.current = false
        if (hasOfflineDraft) setWorkspace((current) => ({ ...current }))
      }, 0)
    }).catch((error: unknown) => {
      if (!active) return
      loadedOwnerRef.current = owner
      setWorkspace(local)
      setCloudReady(false)
      if (isNetworkError(error)) setStatus('offline')
      else { setSyncError(getSyncError(error)); setStatus('sync-error') }
    })
    return () => { active = false }
  }, [onExternalSpriteChange, user])

  useEffect(() => {
    if (!user || !supabase || !cloudReady || skipSaveRef.current || pausedRef.current || conflict) return
    setStatus('unsaved')
    const timer = window.setTimeout(() => {
      const snapshot = workspaceRef.current
      const snapshotGeneration = mutationGenerationRef.current
      const projectId = projectIdRef.current
      if (!projectId) return
      setStatus('saving')
      saveSequenceRef.current = saveSequenceRef.current.then(async () => {
        const nextRevision = await saveCloudWorkspace(projectId, snapshot, revisionRef.current)
        revisionRef.current = nextRevision
        globalThis.localStorage?.setItem(`${cloudRevisionKey}:${user.id}`, String(nextRevision))
        if (mutationGenerationRef.current === snapshotGeneration) {
          globalThis.localStorage?.setItem(`${cloudDirtyKey}:${user.id}`, 'false')
          setStatus('saved')
        } else {
          setStatus('unsaved')
        }
      }).catch((error: unknown) => {
        if (error instanceof CloudConflictError) {
          setConflict({ resource: 'manifest' })
          setStatus('conflict')
        } else if (isNetworkError(error)) setStatus('offline')
        else { setSyncError(getSyncError(error)); setStatus('sync-error') }
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [cloudReady, conflict, user, workspace])

  const markDirty = useCallback(() => {
    mutationGenerationRef.current += 1
    if (user && loadedOwnerRef.current === user.id) {
      globalThis.localStorage?.setItem(`${cloudDirtyKey}:${user.id}`, 'true')
    } else if (!user && loadedOwnerRef.current === 'guest') {
      globalThis.localStorage?.setItem(guestDirtyKey, 'true')
      if (globalThis.localStorage?.getItem(guestNudgeSeenKey) !== 'true') setShowGuestNudge(true)
    }
  }, [user])
  const updateManifest = useCallback((update: (current: PixelWorkspace) => PixelWorkspace) => {
    markDirty(); setWorkspace(update)
  }, [markDirty])
  const updateSprite = useCallback((id: string, update: (current: PixelProject & { id: string }) => PixelProject) => {
    markDirty()
    setWorkspace((current) => {
      const sprite = current.sprites.find((item) => item.id === id)
      if (!sprite) return current
      const next = update(sprite)
      if (next === sprite) return current
      return { ...current, sprites: current.sprites.map((item) => item.id === id ? { ...next, id } : item) }
    })
  }, [markDirty])
  const createSprite = useCallback(async (project: PixelProject) => {
    markDirty()
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    setWorkspace((current) => ({ ...current, activeSpriteId: id, sprites: [...current.sprites, { ...project, id }] }))
    return true
  }, [markDirty])
  const resolveConflict = useCallback(async (_resource: string, resolution: 'disk' | 'retry') => {
    if (!user || !supabase) return
    setConflict(null); setStatus('loading')
    if (resolution === 'disk') {
      const result = await hydrateCloud(user, workspaceRef.current, projectIdRef.current)
      projectIdRef.current = result.projectId; revisionRef.current = result.revision
      if (result.workspace) setWorkspace(result.workspace)
      globalThis.localStorage?.setItem(`${cloudRevisionKey}:${user.id}`, String(result.revision))
      globalThis.localStorage?.setItem(`${cloudDirtyKey}:${user.id}`, 'false')
    } else {
      const { data, error } = await supabase.from('projects').select('revision').eq('id', projectIdRef.current!).single()
      if (error) throw error
      revisionRef.current = data.revision
      globalThis.localStorage?.setItem(`${cloudDirtyKey}:${user.id}`, 'true')
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
    workspace, hydrated: status !== 'loading', writable: true, diagnostics: [] as FileDiagnostic[], status, syncError, conflict,
    updateManifest, updateSprite, createSprite, resolveConflict, copyConflictDraft, exportConflictDraft, setReconciliationPaused,
    syncNotice, dismissSyncNotice: () => setSyncNotice(null), showGuestNudge,
    dismissGuestNudge: () => { globalThis.localStorage?.setItem(guestNudgeSeenKey, 'true'); setShowGuestNudge(false) },
  }
}

async function hydrateCloud(user: User, local: PixelWorkspace, requestedProjectId?: string | null, importLocal = false) {
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
  if (data && importLocal) return createCloudWorkspace(local, true)
  if (!data) {
    return createCloudWorkspace(local, false)
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
  return { projectId: data.id, revision: data.revision, workspace, created: false, imported: false }
}

async function createCloudWorkspace(local: PixelWorkspace, imported: boolean) {
  if (!supabase) throw new Error('Supabase is not configured')
  const cloudLocal = ensureCloudIds(local)
  const projectId = crypto.randomUUID()
  const { data: revision, error } = await supabase.rpc('create_workspace', {
    p_project_id: projectId,
    p_name: cloudLocal.sprites[0]?.name || 'My pixel art',
    p_active_sprite_id: cloudLocal.activeSpriteId,
    p_palette: cloudLocal.palette,
    p_sprites: spriteRows(projectId, cloudLocal).map(({ project_id: _projectId, ...sprite }) => sprite),
  })
  if (error) throw error
  return { projectId, revision: Number(revision) || 1, workspace: null as PixelWorkspace | null, created: !imported, imported }
}

async function saveCloudWorkspace(projectId: string, workspace: PixelWorkspace, expectedRevision: number) {
  if (!supabase) throw new Error('Supabase is not configured')
  const cloudWorkspace = ensureCloudIds(workspace)
  const { data, error } = await supabase.rpc('save_workspace', {
    p_project_id: projectId,
    p_expected_revision: expectedRevision,
    p_name: cloudWorkspace.sprites[0]?.name || 'My pixel art',
    p_active_sprite_id: cloudWorkspace.activeSpriteId,
    p_palette: cloudWorkspace.palette,
    p_sprites: spriteRows(projectId, cloudWorkspace).map(({ project_id: _projectId, ...sprite }) => sprite),
  })
  if (error?.code === '40001') throw new CloudConflictError()
  if (error) throw error
  return Number(data)
}

function spriteRows(projectId: string, workspace: PixelWorkspace) {
  return workspace.sprites.map((sprite, position) => ({
    id: sprite.id, project_id: projectId, position, name: sprite.name, format_version: sprite.version,
    width: sprite.width, height: sprite.height, background: sprite.background, pixels: sprite.pixels,
  }))
}

class CloudConflictError extends Error {}

function isNetworkError(error: unknown) {
  if (!globalThis.navigator?.onLine) return true
  if (error instanceof TypeError) return /fetch|network|load failed/i.test(error.message)
  return false
}

function getSyncError(error: unknown): SyncError {
  if (!error || typeof error !== 'object') return { message: 'An unknown sync error occurred.' }
  const value = error as { code?: unknown; message?: unknown }
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    message: typeof value.message === 'string' ? value.message : 'An unknown sync error occurred.',
  }
}

function ensureCloudIds(workspace: PixelWorkspace) {
  const ids = new Set<string>()
  const replacements = new Map<string, string>()
  const sprites = workspace.sprites.map((sprite) => {
    let id = sprite.id
    if (!isUuid(id) || ids.has(id)) {
      id = crypto.randomUUID()
      if (!replacements.has(sprite.id)) replacements.set(sprite.id, id)
    }
    ids.add(id)
    return { ...sprite, id }
  })
  const activeSpriteId = replacements.get(workspace.activeSpriteId) ?? (ids.has(workspace.activeSpriteId) ? workspace.activeSpriteId : sprites[0].id)
  return { ...workspace, activeSpriteId, sprites }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function hasMeaningfulArtwork(workspace: PixelWorkspace) {
  return workspace.sprites.length > 1 || workspace.sprites.some((sprite) =>
    sprite.name !== 'Untitled sprite' || sprite.width !== 32 || sprite.height !== 32 || sprite.pixels.some(Boolean),
  )
}
