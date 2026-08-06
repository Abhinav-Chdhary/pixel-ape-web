import { AgentIcon, DownloadIcon, RedoIcon, UndoIcon } from '../../icons'
import type { PixelWorkspace } from '../../types'
import { Brand } from '../01_atoms/Brand'
import { SpriteTab } from '../02_molecules/SpriteTab'
import styles from './TopBar.module.css'

type TopBarProps = {
  activeSpriteId: string
  canRedo: boolean
  canUndo: boolean
  sprites: PixelWorkspace['sprites']
  onAddSprite: () => void
  onExport: () => void
  onOpenGuide: () => void
  onRedo: () => void
  onRenameSprite: (id: string, name: string) => void
  onSelectSprite: (id: string) => void
  onUndo: () => void
}

export function TopBar({ activeSpriteId, canRedo, canUndo, sprites, onAddSprite, onExport, onOpenGuide, onRedo, onRenameSprite, onSelectSprite, onUndo }: TopBarProps) {
  return <header className={styles.topbar}>
    <Brand />
    <nav className={styles.tabs} aria-label="Sprite tabs">
      <div className={styles.tabList} role="tablist">
        {sprites.map((sprite) => <SpriteTab
          key={sprite.id}
          sprite={sprite}
          isActive={sprite.id === activeSpriteId}
          onSelect={() => onSelectSprite(sprite.id)}
          onRename={(name) => onRenameSprite(sprite.id, name)}
        />)}
      </div>
      <button className={styles.newTab} onClick={onAddSprite} aria-label="Add sprite tab" title="New sprite tab">+</button>
    </nav>
    <div className={styles.actions}>
      <button className={styles.iconButton} onClick={onUndo} disabled={!canUndo} title="Undo"><UndoIcon /></button>
      <button className={styles.iconButton} onClick={onRedo} disabled={!canRedo} title="Redo"><RedoIcon /></button>
      <button className={styles.agentButton} onClick={onOpenGuide}><AgentIcon /> Edit with AI</button>
      <button className={styles.exportButton} onClick={onExport}><DownloadIcon /> Export PNG</button>
    </div>
  </header>
}
