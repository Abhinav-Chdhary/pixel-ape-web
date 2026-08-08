import { describe, expect, test } from 'bun:test'
import { createProject, createWorkspace } from '../project'
import {
  buildWorkspaceDelta,
  getWorkspaceLimitError,
  isWorkspaceDeltaEmpty,
  isTransientSyncError,
  LatestTaskCoordinator,
  MAX_WORKSPACE_PIXELS,
  MAX_WORKSPACE_SPRITES,
} from './useWorkspace'

function workspaceWithIds() {
  const first = { ...createProject({ width: 4, height: 4 }), id: '00000000-0000-4000-8000-000000000001' }
  const second = { ...createProject({ width: 4, height: 4 }), id: '00000000-0000-4000-8000-000000000002', name: 'Second' }
  return { ...createWorkspace(), activeSpriteId: first.id, sprites: [first, second] }
}

describe('workspace deltas', () => {
  test('sends only the sprite whose pixels changed', () => {
    const baseline = workspaceWithIds()
    const pixels = [...baseline.sprites[1].pixels]
    pixels[3] = '#ff0000'
    const desired = { ...baseline, sprites: [baseline.sprites[0], { ...baseline.sprites[1], pixels }] }
    const delta = buildWorkspaceDelta(baseline, desired)
    expect(delta).toEqual({
      name: null, activeSpriteId: null, palette: null, deletedSpriteIds: [],
      spritePatches: [{ id: baseline.sprites[1].id, pixels }],
    })
  })

  test('palette and active-sprite changes send no sprite rows', () => {
    const baseline = workspaceWithIds()
    const palette = [...baseline.palette, '#123456']
    const delta = buildWorkspaceDelta(baseline, { ...baseline, palette, activeSpriteId: baseline.sprites[1].id })
    expect(delta.palette).toBe(palette)
    expect(delta.activeSpriteId).toBe(baseline.sprites[1].id)
    expect(delta.spritePatches).toEqual([])
    expect(delta.deletedSpriteIds).toEqual([])
  })

  test('reports new, deleted, and position-changed sprites exactly', () => {
    const baseline = workspaceWithIds()
    const added = { ...createProject({ width: 4, height: 4 }), id: '00000000-0000-4000-8000-000000000003', name: 'New' }
    const desired = { ...baseline, activeSpriteId: added.id, sprites: [baseline.sprites[1], added] }
    const delta = buildWorkspaceDelta(baseline, desired)
    expect(delta.deletedSpriteIds).toEqual([baseline.sprites[0].id])
    expect(delta.spritePatches.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: baseline.sprites[1].id, position: 0 }, { id: added.id, position: 1 },
    ])
    expect(delta.name).toBe('Second')
  })

  test('value-identical cloned workspaces are no-ops', () => {
    const baseline = workspaceWithIds()
    const clone = structuredClone(baseline)
    expect(isWorkspaceDeltaEmpty(buildWorkspaceDelta(baseline, clone))).toBe(true)
  })

  test('recomputing a queued desired state against the acknowledged baseline omits acknowledged changes', () => {
    const baseline = workspaceWithIds()
    const firstPixels = [...baseline.sprites[0].pixels]; firstPixels[0] = '#111111'
    const firstSave = { ...baseline, sprites: [{ ...baseline.sprites[0], pixels: firstPixels }, baseline.sprites[1]] }
    const secondPixels = [...baseline.sprites[1].pixels]; secondPixels[1] = '#222222'
    const queued = { ...firstSave, sprites: [firstSave.sprites[0], { ...baseline.sprites[1], pixels: secondPixels }] }
    expect(buildWorkspaceDelta(firstSave, queued).spritePatches).toEqual([{ id: baseline.sprites[1].id, pixels: secondPixels }])
  })

  test('offline recovery diffs the local draft against the hydrated remote baseline', () => {
    const remote = workspaceWithIds()
    const pixels = [...remote.sprites[1].pixels]; pixels[5] = '#abcdef'
    const localDraft = { ...remote, sprites: [remote.sprites[0], { ...remote.sprites[1], pixels }] }
    expect(buildWorkspaceDelta(remote, localDraft)).toEqual({
      name: null, activeSpriteId: null, palette: null, deletedSpriteIds: [],
      spritePatches: [{ id: remote.sprites[1].id, pixels }],
    })
  })

  test('conflict retry rebases on newer remote state and retains local-draft-wins semantics', () => {
    const original = workspaceWithIds()
    const localPixels = [...original.sprites[1].pixels]; localPixels[2] = '#123456'
    const localDraft = { ...original, sprites: [original.sprites[0], { ...original.sprites[1], pixels: localPixels }] }
    const latestRemote = {
      ...original,
      palette: [...original.palette, '#remote'],
      sprites: [{ ...original.sprites[0], background: '#remote-background' }, original.sprites[1]],
    }
    const delta = buildWorkspaceDelta(latestRemote, localDraft)
    expect(delta.palette).toEqual(original.palette)
    expect(delta.spritePatches).toEqual([
      { id: original.sprites[0].id, background: original.sprites[0].background },
      { id: original.sprites[1].id, pixels: localPixels },
    ])
  })

  test('rename and reorder patches omit pixel data', () => {
    const baseline = workspaceWithIds()
    const desired = { ...baseline, sprites: [{ ...baseline.sprites[1], name: 'Renamed' }, baseline.sprites[0]] }
    expect(buildWorkspaceDelta(baseline, desired).spritePatches).toEqual([
      { id: baseline.sprites[1].id, position: 0, name: 'Renamed' },
      { id: baseline.sprites[0].id, position: 1 },
    ])
  })

  test('resize sends dimensions and pixels but omits unrelated fields', () => {
    const baseline = workspaceWithIds()
    const pixels = Array<string | null>(32).fill(null)
    const desired = { ...baseline, sprites: [{ ...baseline.sprites[0], width: 8, pixels }, baseline.sprites[1]] }
    expect(buildWorkspaceDelta(baseline, desired).spritePatches).toEqual([
      { id: baseline.sprites[0].id, width: 8, pixels },
    ])
  })
})

describe('workspace persistence limits', () => {
  test('accepts one maximum-size canvas', () => {
    const workspace = createWorkspace()
    const sprite = { ...createProject({ width: 512, height: 512 }), id: workspace.activeSpriteId }
    expect(getWorkspaceLimitError({ ...workspace, sprites: [sprite] })).toBeNull()
  })

  test('rejects aggregate pixels above the server limit', () => {
    const workspace = createWorkspace()
    const sprite = { ...createProject({ width: 512, height: 512 }), id: workspace.activeSpriteId }
    const extra = { ...createProject({ width: 4, height: 4 }), id: 'extra' }
    const error = getWorkspaceLimitError({ ...workspace, sprites: [sprite, extra] })
    expect(error?.code).toBe('WORKSPACE_LIMIT')
    expect(error?.message).toContain(MAX_WORKSPACE_PIXELS.toLocaleString())
  })

  test('rejects more than the sprite cap', () => {
    const workspace = createWorkspace()
    const sprites = Array.from({ length: MAX_WORKSPACE_SPRITES + 1 }, (_, index) => ({
      ...createProject({ width: 4, height: 4 }), id: `sprite-${index}`,
    }))
    expect(getWorkspaceLimitError({ ...workspace, sprites })?.code).toBe('WORKSPACE_LIMIT')
  })
})

test('autosave coordinator keeps one in-flight request and coalesces to the latest edit', async () => {
  const coordinator = new LatestTaskCoordinator()
  const started: number[] = []
  const releases: Array<() => void> = []
  const task = (value: number) => async () => {
    started.push(value)
    await new Promise<void>((resolve) => releases.push(resolve))
  }

  coordinator.enqueue(task(1))
  await Promise.resolve()
  for (let value = 2; value <= 100; value++) coordinator.enqueue(task(value))
  expect(started).toEqual([1])
  releases.shift()!()
  await Promise.resolve()
  await Promise.resolve()
  expect(started).toEqual([1, 100])
  releases.shift()!()
  await Promise.resolve()
})

describe('sync retry classification', () => {
  test('retries network, throttling, and server failures', () => {
    expect(isTransientSyncError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientSyncError({ status: 429 })).toBe(true)
    expect(isTransientSyncError({ status: 503 })).toBe(true)
  })

  test('does not retry auth, validation, or schema failures', () => {
    expect(isTransientSyncError({ status: 401 })).toBe(false)
    expect(isTransientSyncError({ status: 400, code: '23514' })).toBe(false)
    expect(isTransientSyncError({ status: 404, code: 'PGRST205' })).toBe(false)
  })
})
