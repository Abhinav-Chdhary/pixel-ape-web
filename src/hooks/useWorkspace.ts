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
export const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024
export const MAX_WORKSPACE_PIXELS = 262_144
export const MAX_WORKSPACE_SPRITES = 50

function serializedWorkspace(workspace: PixelWorkspace, limit: number) {
  const value = JSON.stringify(workspace)
  if (new Blob([value]).size > limit) throw new WorkspacePersistenceError(limit)
  return value
}

function storeLocalWorkspace(key: string, workspace: PixelWorkspace) {
  globalThis.localStorage?.setItem(key, serializedWorkspace(workspace, MAX_WORKSPACE_BYTES))
}

function trySetLocalValue(key: string, value: string) {
  try { globalThis.localStorage?.setItem(key, value); return true } catch { return false }
}

function readLocalWorkspace(key = storageKey) {
  try {
    const saved = globalThis.localStorage?.getItem(key)
    return saved ? normalizeWorkspace(JSON.parse(saved)) : createWorkspace()
  } catch {
    return createWorkspace()
  }
}

export class LatestTaskCoordinator {
  private running = false
  private pending: (() => Promise<void>) | null = null

  enqueue(task: () => Promise<void>) {
    this.pending = task
    if (!this.running) void this.drain()
  }

  clearPending() { this.pending = null }

  private async drain() {
    this.running = true
    while (this.pending) {
      const task = this.pending
      this.pending = null
      await task()
    }
    this.running = false
  }
}

export function useWorkspace(user: User | null, onExternalSpriteChange?: (id: string) => void) {
  const userId = user?.id
  const [workspace, setWorkspace] = useState<PixelWorkspace>(readLocalWorkspace)
  const [status, setStatus] = useState<FileStatus>('saved')
  const [syncError, setSyncError] = useState<SyncError>(null)
  const [conflict, setConflict] = useState<Conflict>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncNotice, setSyncNotice] = useState<'created' | 'imported' | null>(null)
  const [showGuestNudge, setShowGuestNudge] = useState(false)
  const projectIdRef = useRef<string | null>(null)
  const revisionRef = useRef(0)
  const saveCoordinatorRef = useRef(new LatestTaskCoordinator())
  const workspaceRef = useRef(workspace)
  const skipSaveRef = useRef(true)
  const pausedRef = useRef(false)
  const loadedOwnerRef = useRef<string | null>('guest')
  const hydrationRef = useRef<{ owner: string; promise: ReturnType<typeof hydrateCloud> } | null>(null)
  const mutationGenerationRef = useRef(0)
  const ownerEpochRef = useRef(0)
  const ownerIdentityRef = useRef<string | null>(null)
  const retryTimerRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const retryKindRef = useRef<'hydrate' | 'save' | null>(null)
  const recoveryFailuresRef = useRef(new Set<string>())
  const [hydrationRetryTick, setHydrationRetryTick] = useState(0)
  const [saveRetryTick, setSaveRetryTick] = useState(0)
  workspaceRef.current = workspace

  const writeRecoveryValue = useCallback((name: string, key: string, value: string) => {
    if (trySetLocalValue(key, value)) {
      recoveryFailuresRef.current.delete(name)
      if (!recoveryFailuresRef.current.size) setSyncError(null)
      return true
    }
    recoveryFailuresRef.current.add(name)
    setSyncError({ code: 'LOCAL_STORAGE_FAILED', message: 'Your draft is still open but recovery data could not be stored locally.' })
    setStatus('invalid')
    return false
  }, [])

  useEffect(() => {
    const owner = user?.id ?? 'guest'
    if (loadedOwnerRef.current !== owner) return
    const key = user ? `${storageKey}:${user.id}` : storageKey
    try {
      storeLocalWorkspace(key, workspace)
      recoveryFailuresRef.current.delete('workspace')
      if (!recoveryFailuresRef.current.size) setSyncError(null)
    } catch (error) {
      recoveryFailuresRef.current.add('workspace')
      const detail = getSyncError(error)
      setSyncError({ code: detail?.code ?? 'LOCAL_STORAGE_FAILED', message: `Your draft is still open but could not be stored locally. ${detail?.message ?? ''}`.trim() })
      setStatus('invalid')
    }
  }, [user, workspace])

  useEffect(() => {
    const retryNow = () => {
      if (!retryKindRef.current) return
      retryCountRef.current = 0
      if (retryKindRef.current === 'hydrate') setHydrationRetryTick((current) => current + 1)
      else setSaveRetryTick((current) => current + 1)
    }
    globalThis.addEventListener?.('online', retryNow)
    return () => globalThis.removeEventListener?.('online', retryNow)
  }, [])

  useEffect(() => {
    let active = true
    setConflict(null)
    if (!recoveryFailuresRef.current.size) setSyncError(null)
    const owner = user?.id ?? 'guest'
    if (ownerIdentityRef.current !== owner) {
      ownerIdentityRef.current = owner
      ownerEpochRef.current += 1
      // Do not let a slow request from the previous account block this owner.
      // The old coordinator may finish, but its epoch guards make it inert.
      saveCoordinatorRef.current = new LatestTaskCoordinator()
      setCloudReady(false)
      recoveryFailuresRef.current.clear()
      retryKindRef.current = null
      retryCountRef.current = 0
    }
    const epoch = ownerEpochRef.current
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
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
      if (!active || ownerEpochRef.current !== epoch) return
      retryCountRef.current = 0
      retryKindRef.current = null
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
      projectIdRef.current = result.projectId
      revisionRef.current = result.revision
      writeRecoveryValue('project', cloudProjectKey, result.projectId)
      if (result.created || result.imported) {
        writeRecoveryValue('dirty', guestDirtyKey, 'false')
        writeRecoveryValue('import', guestImportHandledKey, 'true')
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
      writeRecoveryValue('revision', `${cloudRevisionKey}:${user.id}`, String(result.revision))
      if (!hasOfflineDraft) writeRecoveryValue('dirty', `${cloudDirtyKey}:${user.id}`, 'false')
      setStatus(recoveryFailuresRef.current.size ? 'invalid' : 'saved')
      window.setTimeout(() => {
        if (!active || ownerEpochRef.current !== epoch || loadedOwnerRef.current !== owner) return
        skipSaveRef.current = false
        if (hasOfflineDraft) setWorkspace((current) => ({ ...current }))
      }, 0)
    }).catch((error: unknown) => {
      if (!active || ownerEpochRef.current !== epoch) return
      hydrationRef.current = null
      loadedOwnerRef.current = owner
      setWorkspace(local)
      setCloudReady(false)
      if (isNetworkError(error)) setStatus('offline')
      else { setSyncError(getSyncError(error)); setStatus('sync-error') }
      if (!isTransientSyncError(error)) return
      retryKindRef.current = 'hydrate'
      const delay = Math.min(30_000, 1000 * 2 ** retryCountRef.current++)
      retryTimerRef.current = window.setTimeout(() => {
        if (ownerEpochRef.current === epoch && retryKindRef.current === 'hydrate') setHydrationRetryTick((current) => current + 1)
      }, delay)
    })
    return () => {
      active = false
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [hydrationRetryTick, onExternalSpriteChange, userId])

  useEffect(() => {
    if (!user || !supabase || !cloudReady || loadedOwnerRef.current !== user.id || skipSaveRef.current || pausedRef.current || conflict) return
    setStatus('unsaved')
    const timer = window.setTimeout(() => {
      const snapshot = workspaceRef.current
      const snapshotGeneration = mutationGenerationRef.current
      const projectId = projectIdRef.current
      const epoch = ownerEpochRef.current
      const owner = user.id
      if (!projectId) return
      setStatus('saving')
      saveCoordinatorRef.current.enqueue(async () => {
        try {
          if (ownerEpochRef.current !== epoch || loadedOwnerRef.current !== owner) return
          const expectedRevision = revisionRef.current
          const nextRevision = await saveCloudWorkspace(projectId, snapshot, expectedRevision)
          if (ownerEpochRef.current !== epoch || loadedOwnerRef.current !== owner) return
          retryCountRef.current = 0
          retryKindRef.current = null
          if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
          retryTimerRef.current = null
          revisionRef.current = nextRevision
          writeRecoveryValue('revision', `${cloudRevisionKey}:${user.id}`, String(nextRevision))
          if (mutationGenerationRef.current === snapshotGeneration) {
            writeRecoveryValue('dirty', `${cloudDirtyKey}:${user.id}`, 'false')
            setStatus(recoveryFailuresRef.current.size ? 'invalid' : 'saved')
          } else {
            setStatus('unsaved')
          }
        } catch (error: unknown) {
          if (ownerEpochRef.current !== epoch || loadedOwnerRef.current !== owner) return
          if (error instanceof CloudConflictError) {
            saveCoordinatorRef.current.clearPending()
            setConflict({ resource: 'manifest' })
            setStatus('conflict')
          } else if (error instanceof WorkspacePersistenceError) {
            setSyncError(getSyncError(error))
            setStatus('invalid')
          } else if (isNetworkError(error)) setStatus('offline')
          else { setSyncError(getSyncError(error)); setStatus('sync-error') }
          if (isTransientSyncError(error)) {
            retryKindRef.current = 'save'
            const delay = Math.min(30_000, 1000 * 2 ** retryCountRef.current++)
            retryTimerRef.current = window.setTimeout(() => {
              if (ownerEpochRef.current === epoch && retryKindRef.current === 'save') setSaveRetryTick((current) => current + 1)
            }, delay)
          }
        }
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [cloudReady, conflict, saveRetryTick, userId, workspace])

  const markDirty = useCallback(() => {
    mutationGenerationRef.current += 1
    if (user && loadedOwnerRef.current === user.id) {
      writeRecoveryValue('dirty', `${cloudDirtyKey}:${user.id}`, 'true')
    } else if (!user && loadedOwnerRef.current === 'guest') {
      writeRecoveryValue('dirty', guestDirtyKey, 'true')
      if (globalThis.localStorage?.getItem(guestNudgeSeenKey) !== 'true') setShowGuestNudge(true)
    }
  }, [user, writeRecoveryValue])
  const updateManifest = useCallback((update: (current: PixelWorkspace) => PixelWorkspace) => {
    setWorkspace((current) => {
      const next = update(current)
      if (!validateWorkspaceLimits(next, setSyncError, setStatus)) return current
      markDirty()
      return next
    })
  }, [markDirty])
  const updateSprite = useCallback((id: string, update: (current: PixelProject & { id: string }) => PixelProject) => {
    setWorkspace((current) => {
      const sprite = current.sprites.find((item) => item.id === id)
      if (!sprite) return current
      const next = update(sprite)
      if (next === sprite) return current
      const nextWorkspace = { ...current, sprites: current.sprites.map((item) => item.id === id ? { ...next, id } : item) }
      if (!validateWorkspaceLimits(nextWorkspace, setSyncError, setStatus)) return current
      markDirty()
      return nextWorkspace
    })
  }, [markDirty])
  const createSprite = useCallback(async (project: PixelProject) => {
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    const candidate = { ...workspaceRef.current, activeSpriteId: id, sprites: [...workspaceRef.current.sprites, { ...project, id }] }
    if (!validateWorkspaceLimits(candidate, setSyncError, setStatus)) return false
    setWorkspace((current) => {
      const next = { ...current, activeSpriteId: id, sprites: [...current.sprites, { ...project, id }] }
      if (!validateWorkspaceLimits(next, setSyncError, setStatus)) return current
      markDirty()
      return next
    })
    return true
  }, [markDirty])
  const resolveConflict = useCallback(async (_resource: string, resolution: 'disk' | 'retry') => {
    if (!user || !supabase) return
    const owner = user.id
    const epoch = ownerEpochRef.current
    const projectId = projectIdRef.current
    if (!projectId || loadedOwnerRef.current !== owner) return
    const isCurrent = () => ownerEpochRef.current === epoch && loadedOwnerRef.current === owner && projectIdRef.current === projectId
    setConflict(null); setStatus('loading')
    if (resolution === 'disk') {
      const result = await hydrateCloud(user, workspaceRef.current, projectId)
      if (!isCurrent()) return
      projectIdRef.current = result.projectId; revisionRef.current = result.revision
      if (result.workspace) setWorkspace(result.workspace)
      writeRecoveryValue('revision', `${cloudRevisionKey}:${owner}`, String(result.revision))
      writeRecoveryValue('dirty', `${cloudDirtyKey}:${owner}`, 'false')
    } else {
      const { data, error } = await supabase.from('projects').select('revision').eq('id', projectId).single()
      if (!isCurrent()) return
      if (error) throw error
      revisionRef.current = data.revision
      writeRecoveryValue('dirty', `${cloudDirtyKey}:${owner}`, 'true')
      skipSaveRef.current = false
      setWorkspace((current) => ({ ...current }))
    }
    if (!isCurrent()) return
    setStatus(recoveryFailuresRef.current.size ? 'invalid' : resolution === 'retry' ? 'unsaved' : 'saved')
  }, [user, writeRecoveryValue])
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
    dismissGuestNudge: () => { trySetLocalValue(guestNudgeSeenKey, 'true'); setShowGuestNudge(false) },
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
  assertWorkspaceLimits(cloudLocal)
  serializedWorkspace(cloudLocal, MAX_WORKSPACE_BYTES)
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
  assertWorkspaceLimits(cloudWorkspace)
  serializedWorkspace(cloudWorkspace, MAX_WORKSPACE_BYTES)
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

class WorkspacePersistenceError extends Error {
  code: string
  constructor(limit: number, message?: string, code = 'WORKSPACE_TOO_LARGE') {
    super(message ?? `This workspace is too large to sync safely (limit ${Math.round(limit / 1024 / 1024)} MB). Export it before reducing its size.`)
    this.code = code
  }
}

export function getWorkspaceLimitError(workspace: PixelWorkspace): SyncError {
  const structuralError = getWorkspaceStructuralLimitError(workspace)
  if (structuralError) return structuralError
  try {
    serializedWorkspace(workspace, MAX_WORKSPACE_BYTES)
  } catch (error) {
    return getSyncError(error)
  }
  return null
}

export function getWorkspaceStructuralLimitError(workspace: PixelWorkspace): SyncError {
  if (workspace.sprites.length > MAX_WORKSPACE_SPRITES) {
    return { code: 'WORKSPACE_LIMIT', message: `A workspace can contain at most ${MAX_WORKSPACE_SPRITES} sprites.` }
  }
  const pixels = workspace.sprites.reduce((total, sprite) => total + sprite.width * sprite.height, 0)
  if (pixels > MAX_WORKSPACE_PIXELS) {
    return { code: 'WORKSPACE_LIMIT', message: `A workspace can contain at most ${MAX_WORKSPACE_PIXELS.toLocaleString()} pixels across all sprites.` }
  }
  return null
}

function assertWorkspaceLimits(workspace: PixelWorkspace) {
  const error = getWorkspaceLimitError(workspace)
  if (error) throw new WorkspacePersistenceError(MAX_WORKSPACE_BYTES, error.message, error.code)
}

function validateWorkspaceLimits(
  workspace: PixelWorkspace,
  setError: (error: SyncError) => void,
  setFileStatus: (status: FileStatus) => void,
) {
  const error = getWorkspaceStructuralLimitError(workspace)
  if (!error) return true
  setError(error)
  setFileStatus('invalid')
  return false
}

function isNetworkError(error: unknown) {
  if (globalThis.navigator && !globalThis.navigator.onLine) return true
  if (error instanceof TypeError) return /fetch|network|load failed/i.test(error.message)
  return false
}

export function isTransientSyncError(error: unknown) {
  if (!error || typeof error !== 'object') return isNetworkError(error)
  const value = error as { status?: unknown; code?: unknown }
  const status = typeof value.status === 'number' ? value.status : Number(value.status)
  if (status === 408 || status === 429 || status >= 500) return true
  if (Number.isFinite(status) && status >= 400) return false
  if (typeof value.code === 'string' && /^(53300|57P0[123])$/.test(value.code)) return true
  return isNetworkError(error)
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
