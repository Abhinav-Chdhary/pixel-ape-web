import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isVisibility, makePreview, parseCursor, serializeCursor, type Visibility } from './publication.js'

type Config = { supabaseUrl: string; serviceRoleKey: string; allowedOrigin?: string }
type PublicationRow = {
  id: string; slug: string; visibility: Visibility; title: string; width: number; height: number; background: string; pixels: Array<string | null>
  preview_width: number; preview_height: number; preview_pixels: Array<string | null>; author_name: string; updated_at: string; source_project_id: string; source_sprite_id: string
}

function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  console.error(error)
  response.status(500).json({ error: 'The publication service could not complete that request.' })
}

function bearerToken(request: Request) {
  const header = request.get('authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

function publicPublication(row: PublicationRow, detail = false) {
  const base = { slug: row.slug, title: row.title, width: row.width, height: row.height, background: row.background, authorName: row.author_name || 'Anonymous', updatedAt: row.updated_at }
  return detail ? { ...base, pixels: row.pixels } : { ...base, preview: { width: row.preview_width, height: row.preview_height, pixels: row.preview_pixels } }
}

function publicAuthorName(value: string | null | undefined) {
  const name = value?.trim()
  return name && !name.includes('@') ? name : 'Anonymous'
}

async function authenticatedUser(request: Request, response: Response, supabase: SupabaseClient) {
  const token = bearerToken(request)
  if (!token) { response.status(401).json({ error: 'Sign in to publish artwork.' }); return null }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) { response.status(401).json({ error: 'Your sign-in session has expired.' }); return null }
  return data.user
}

export function createApp(config: Config) {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: config.allowedOrigin ? [config.allowedOrigin] : true, methods: ['GET', 'POST'] }))
  app.use(express.json({ limit: '32kb' }))
  app.get('/health', (_request, response) => response.json({ ok: true }))

  app.get('/v1/gallery', async (request, response, next) => {
    try {
      const requestedLimit = Number(request.query.limit)
      const limit = requestedLimit === 6 ? 6 : 24
      const cursor = parseCursor(request.query.cursor)
      let query = supabase.from('publications').select('id,slug,visibility,title,width,height,background,preview_width,preview_height,preview_pixels,author_name,updated_at,source_project_id,source_sprite_id').eq('visibility', 'gallery').order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1)
      if (cursor) query = query.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`)
      const { data, error } = await query.returns<PublicationRow[]>()
      if (error) throw error
      const rows = data ?? []
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      response.json({ items: page.map((row) => publicPublication(row)), nextCursor: rows.length > limit && last ? serializeCursor(last.updated_at, last.id) : null })
    } catch (error) { next(error) }
  })

  app.get('/v1/publications/:slug', async (request, response, next) => {
    try {
      const { data, error } = await supabase.from('publications').select('id,slug,visibility,title,width,height,background,pixels,preview_width,preview_height,preview_pixels,author_name,updated_at,source_project_id,source_sprite_id').eq('slug', request.params.slug).maybeSingle<PublicationRow>()
      if (error) throw error
      if (!data) { response.status(404).json({ error: 'This public artwork is unavailable.' }); return }
      response.json(publicPublication(data, true))
    } catch (error) { next(error) }
  })

  app.get('/v1/publications/source/:projectId/:spriteId', async (request, response, next) => {
    try {
      const user = await authenticatedUser(request, response, supabase)
      if (!user) return
      const { data, error } = await supabase.from('publications').select('id,slug,visibility,title,width,height,background,pixels,preview_width,preview_height,preview_pixels,author_name,updated_at,source_project_id,source_sprite_id').eq('owner_id', user.id).eq('source_project_id', request.params.projectId).eq('source_sprite_id', request.params.spriteId).maybeSingle<PublicationRow>()
      if (error) throw error
      response.json(data ? { ...publicPublication(data), url: `/s/${data.slug}`, visibility: data.visibility } : null)
    } catch (error) { next(error) }
  })

  app.post('/v1/publications', async (request, response, next) => {
    try {
      const user = await authenticatedUser(request, response, supabase)
      if (!user) return
      const { projectId, spriteId, visibility } = request.body as { projectId?: unknown; spriteId?: unknown; visibility?: unknown }
      if (typeof projectId !== 'string' || typeof spriteId !== 'string' || !isVisibility(visibility)) { response.status(400).json({ error: 'A project, sprite, and visibility are required.' }); return }
      const { data: project, error: projectError } = await supabase.from('projects').select('id').eq('id', projectId).eq('owner_id', user.id).is('deleted_at', null).maybeSingle<{ id: string }>()
      if (projectError) throw projectError
      if (!project) { response.status(403).json({ error: 'You cannot publish that sprite.' }); return }
      const { data: sprite, error: spriteError } = await supabase.from('sprites').select('id,name,width,height,background,pixels').eq('project_id', projectId).eq('id', spriteId).maybeSingle<{ id: string; name: string; width: number; height: number; background: string; pixels: Array<string | null> }>()
      if (spriteError) throw spriteError
      if (!sprite) { response.status(404).json({ error: 'That sprite no longer exists.' }); return }
      const { data: profile, error: profileError } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle<{ display_name: string | null }>()
      if (profileError) throw profileError
      const preview = makePreview({ title: sprite.name, width: sprite.width, height: sprite.height, background: sprite.background, pixels: sprite.pixels })
      const { data, error } = await supabase.from('publications').upsert({
        owner_id: user.id, source_project_id: projectId, source_sprite_id: spriteId, visibility,
        title: sprite.name || 'Untitled sprite', width: sprite.width, height: sprite.height, background: sprite.background, pixels: sprite.pixels,
        preview_width: preview.width, preview_height: preview.height, preview_pixels: preview.pixels, author_name: publicAuthorName(profile?.display_name),
      }, { onConflict: 'source_project_id,source_sprite_id' }).select('id,slug,visibility,title,width,height,background,pixels,preview_width,preview_height,preview_pixels,author_name,updated_at,source_project_id,source_sprite_id').single<PublicationRow>()
      if (error) throw error
      response.json({ ...publicPublication(data), url: `/s/${data.slug}`, visibility: data.visibility })
    } catch (error) { next(error) }
  })
  app.use(errorHandler)
  return app
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN, PORT = '3000' } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
createApp({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY, allowedOrigin: ALLOWED_ORIGIN }).listen(Number(PORT), '0.0.0.0', () => console.log(`Pixel Ape API listening on ${PORT}`))
