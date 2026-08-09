import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/01_atoms/Brand'
import styles from './PublicPages.module.css'

export function PublicShell({ children }: { children: ReactNode }) {
  return <div className={styles.publicApp}>
    <header className={styles.siteHeader}><Link to="/" className={styles.brandLink}><Brand /></Link><nav aria-label="Public navigation"><Link to="/gallery">Gallery</Link><Link to="/workspace">Workspace</Link></nav></header>
    {children}
  </div>
}
