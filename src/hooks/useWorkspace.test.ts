import { describe, expect, test } from 'bun:test'
import { createProject, createWorkspace } from '../project'
import {
  getWorkspaceLimitError,
  isTransientSyncError,
  LatestTaskCoordinator,
  MAX_WORKSPACE_PIXELS,
  MAX_WORKSPACE_SPRITES,
} from './useWorkspace'

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
