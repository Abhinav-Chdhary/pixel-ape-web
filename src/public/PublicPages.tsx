import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getGallery, getPublicSprite, type GalleryItem, type PublicSprite } from './api'
import { PixelArt } from './PixelArt'
import { PublicShell } from './PublicShell'
import styles from './PublicPages.module.css'

function GalleryCards({ items }: { items: GalleryItem[] }) {
  return <div className={styles.galleryGrid}>{items.map((item) => <Link className={styles.artCard} to={`/s/${item.slug}`} key={item.slug}><PixelArt artwork={item.preview} label={`${item.title} preview`} /><div><b>{item.title}</b><span>{item.width} × {item.height} · by {item.authorName}</span></div></Link>)}</div>
}

function useGallery(limit: 6 | 24) {
  const [items, setItems] = useState<GalleryItem[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const load = async (next?: string | null) => {
    setLoading(true); setError(null)
    try { const page = await getGallery(limit, next); setItems((current) => next ? [...current, ...page.items] : page.items); setCursor(page.nextCursor) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Gallery could not load.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [limit])
  return { items, cursor, loading, error, load }
}

export function HomePage() {
  const gallery = useGallery(6)
  return <PublicShell><main className={styles.home}>
    <section className={styles.hero}><p className={styles.kicker}>Pixel Ape / browser studio</p><h1>Make every pixel count.</h1><p>Draw crisp sprites, save them safely, and send the good ones out into the wild.</p><Link className={styles.primaryAction} to="/workspace">Start creating <span aria-hidden="true">→</span></Link><img className={styles.heroIllustration} src="/HomePageIllustration.png" alt="Pixel Ape character creating pixel art" /></section>
    <section className={styles.gallerySection}><div className={styles.sectionHeading}><div><p className={styles.kicker}>Fresh from the studio</p><h2>Gallery</h2></div><Link to="/gallery">View more →</Link></div>{gallery.loading && !gallery.items.length ? <p className={styles.state}>Loading artwork…</p> : gallery.error ? <p className={styles.state}>{gallery.error}</p> : gallery.items.length ? <GalleryCards items={gallery.items} /> : <p className={styles.state}>No public artwork yet. Make the first mark.</p>}</section>
  </main></PublicShell>
}

export function GalleryPage() {
  const gallery = useGallery(24)
  return <PublicShell><main className={styles.listPage}><p className={styles.kicker}>Community wall</p><h1>Gallery</h1><p className={styles.lede}>Small worlds, carefully made.</p>{gallery.loading && !gallery.items.length ? <p className={styles.state}>Loading artwork…</p> : gallery.error ? <p className={styles.state}>{gallery.error}</p> : gallery.items.length ? <><GalleryCards items={gallery.items} />{gallery.cursor && <button className={styles.loadMore} disabled={gallery.loading} onClick={() => void gallery.load(gallery.cursor)}>{gallery.loading ? 'Loading…' : 'Load more'}</button>}</> : <p className={styles.state}>No artwork has been published yet.</p>}</main></PublicShell>
}

export function PublicSpritePage() {
  const { slug = '' } = useParams(); const [artwork, setArtwork] = useState<PublicSprite | null>(null); const [error, setError] = useState<string | null>(null)
  useEffect(() => { setArtwork(null); setError(null); void getPublicSprite(slug).then(setArtwork).catch((reason) => setError(reason instanceof Error ? reason.message : 'This artwork is unavailable.')) }, [slug])
  return <PublicShell><main className={styles.detailPage}>{error ? <section className={styles.unavailable}><p className={styles.kicker}>Not found</p><h1>That sprite is unavailable.</h1><Link className={styles.primaryAction} to="/workspace">Start creating →</Link></section> : !artwork ? <p className={styles.state}>Loading artwork…</p> : <article className={styles.artworkDetail}><PixelArt artwork={artwork} label={artwork.title} className={styles.detailArt} /><div className={styles.artworkMeta}><p className={styles.kicker}>Shared pixel art</p><h1>{artwork.title}</h1><p>{artwork.width} × {artwork.height} pixels</p><p className={styles.byline}>by {artwork.authorName}</p><Link className={styles.primaryAction} to="/workspace">Start creating →</Link></div></article>}</main></PublicShell>
}
