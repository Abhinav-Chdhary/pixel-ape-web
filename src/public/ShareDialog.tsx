import { useEffect, useState } from 'react'
import type { PixelWorkspace } from '../types'
import { getPublication, publicUrl, publishSprite, type Visibility } from './api'
import styles from './ShareDialog.module.css'

type Sprite = PixelWorkspace['sprites'][number]
type Props = { sprite: Sprite; projectId: string | null; canPublish: boolean; getAccessToken: () => Promise<string | null>; onClose: () => void }

export function ShareDialog({ sprite, projectId, canPublish, getAccessToken, onClose }: Props) {
  const [visibility, setVisibility] = useState<Visibility>('unlisted'); const [url, setUrl] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!canPublish || !projectId) return
    let active = true
    void (async () => {
      setLoading(true); setError(null)
      try { const token = await getAccessToken(); if (!token) throw new Error('Sign in to publish artwork.'); const publication = await getPublication(projectId, sprite.id, token); if (!active || !publication) return; setVisibility(publication.visibility); setUrl(publicUrl(publication.url)) } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Publication status could not load.') } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [canPublish, getAccessToken, projectId, sprite.id])
  const generate = async () => {
    if (!projectId) return
    setLoading(true); setError(null); setCopied(false)
    try { const token = await getAccessToken(); if (!token) throw new Error('Sign in to publish artwork.'); const publication = await publishSprite(projectId, sprite.id, visibility, token); setUrl(publicUrl(publication.url)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Link could not be generated.') } finally { setLoading(false) }
  }
  const copy = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); setCopied(true) } catch { setError('Copy the link manually from the field.') } }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
    <p className="eyebrow">Share sprite</p><h2 id="share-title">Share “{sprite.name || 'Untitled sprite'}”</h2><p className={styles.intro}>Choose who can find this snapshot. Generating again updates the artwork at the same link.</p>
    <div className={styles.options} role="radiogroup" aria-label="Share visibility"><label className={visibility === 'unlisted' ? styles.selected : ''}><input type="radio" name="visibility" checked={visibility === 'unlisted'} onChange={() => setVisibility('unlisted')} /><b>Share public link</b><span>Anyone with the link can view it. It stays out of the gallery.</span></label><label className={visibility === 'gallery' ? styles.selected : ''}><input type="radio" name="visibility" checked={visibility === 'gallery'} onChange={() => setVisibility('gallery')} /><b>Publish to gallery</b><span>Anyone with the link can view it, and it appears in the public gallery.</span></label></div>
    {!canPublish && <p className={styles.notice}>Wait for this signed-in workspace to finish saving before generating a link.</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    <label className={styles.linkField}>Public link<input readOnly value={url ?? ''} placeholder="Generate a link to share this sprite" aria-label="Public link" /></label>
    <div className="dialog-actions"><button className="quiet-button" onClick={onClose}>Close</button><button className="quiet-button" disabled={!url} onClick={() => void copy()}>{copied ? 'Copied!' : 'Copy link'}</button><button disabled={!canPublish || loading} onClick={() => void generate()}>{loading ? 'Working…' : 'Generate link'}</button></div>
  </section></div>
}
