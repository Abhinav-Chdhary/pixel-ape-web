import { Reorder } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentIcon, DownloadIcon, RedoIcon, UndoIcon } from '../../icons'
import type { PixelWorkspace } from '../../types'
import { Brand } from '../01_atoms/Brand'
import { SpriteTab } from '../02_molecules/SpriteTab'
import styles from './TopBar.module.css'

type TopBarProps = {
  accountEmail: string | null
  accountLoading: boolean
  activeSpriteId: string
  canRedo: boolean
  canUndo: boolean
  sprites: PixelWorkspace['sprites']
  onAddSprite: () => void
  onSignIn: () => void
  onSignOut: () => void
  onCloseSprite: (id: string) => void
  onExport: () => void
  onReorderSprites: (ids: string[]) => void
  onOpenFiles: () => void
  onOpenGuide: () => void
  onRedo: () => void
  onRenameSprite: (id: string, name: string) => void
  onSelectSprite: (id: string) => void
  onShare: () => void
  onUndo: () => void
}

export function TopBar({ accountEmail, accountLoading, activeSpriteId, canRedo, canUndo, sprites, onSignIn, onSignOut, onAddSprite, onCloseSprite, onExport, onReorderSprites, onOpenFiles, onOpenGuide, onRedo, onRenameSprite, onSelectSprite, onShare, onUndo }: TopBarProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const accountInitial = accountEmail?.trim().charAt(0).toUpperCase() || 'A'

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  return <header className={styles.topbar}>
    <Link className={styles.brandLink} to="/" aria-label="Go to Pixel Ape home"><Brand /></Link>
    <nav className={styles.tabs} aria-label="Sprite tabs">
      <Reorder.Group
        as="div"
        axis="x"
        values={sprites.map((sprite) => sprite.id)}
        onReorder={onReorderSprites}
        className={styles.tabList}
        role="tablist"
      >
        {sprites.map((sprite) => <SpriteTab
          key={sprite.id}
          sprite={sprite}
          isActive={sprite.id === activeSpriteId}
          onSelect={() => onSelectSprite(sprite.id)}
          onRename={(name) => onRenameSprite(sprite.id, name)}
          onClose={() => onCloseSprite(sprite.id)}
        />)}
      </Reorder.Group>
      <button className={styles.newTab} onClick={onAddSprite} aria-label="Add sprite tab" title="New sprite tab">+</button>
    </nav>
    <div className={styles.actions}>
      {accountLoading
        ? <span className={styles.accountLoading} aria-label="Checking account" title="Checking account"><span /></span>
        : accountEmail
          ? <div className={styles.accountMenu} ref={accountMenuRef}>
            <button className={styles.accountButton} onClick={() => setAccountMenuOpen((open) => !open)} aria-label={`Account menu for ${accountEmail}`} aria-expanded={accountMenuOpen} aria-haspopup="menu" title={accountEmail}>{accountInitial}</button>
            {accountMenuOpen && <div className={styles.accountPopover} role="menu">
              <span className={styles.accountPopoverLabel}>Signed in as</span>
              <strong title={accountEmail}>{accountEmail}</strong>
              <button role="menuitem" onClick={() => { setAccountMenuOpen(false); void onSignOut() }}>Sign out</button>
            </div>}
          </div>
          : <button className={styles.signInButton} onClick={onSignIn}>Sign in</button>}
      <button className={styles.filesButton} onClick={onOpenFiles}>All files</button>
      <button className={styles.iconButton} onClick={onUndo} disabled={!canUndo} title="Undo"><UndoIcon /></button>
      <button className={styles.iconButton} onClick={onRedo} disabled={!canRedo} title="Redo"><RedoIcon /></button>
      <span className={styles.agentButtonTooltip} data-tooltip="Coming soon">
        <button className={styles.agentButton} disabled aria-label="Edit with AI — coming soon"><AgentIcon /> Edit with AI</button>
      </span>
      <button className={styles.shareButton} onClick={onShare}>Share</button>
      <button className={styles.exportButton} onClick={onExport}><DownloadIcon /> Export PNG</button>
    </div>
  </header>
}
