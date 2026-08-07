import { Reorder } from 'framer-motion'
import { AgentIcon, DownloadIcon, RedoIcon, UndoIcon } from '../../icons'
import type { PixelWorkspace } from '../../types'
import { Brand } from '../01_atoms/Brand'
import { SpriteTab } from '../02_molecules/SpriteTab'
import styles from './TopBar.module.css'

type TopBarProps = {
  accountLabel: string
  activeSpriteId: string
  canRedo: boolean
  canUndo: boolean
  sprites: PixelWorkspace['sprites']
  onAddSprite: () => void
  onAccount: () => void
  onCloseSprite: (id: string) => void
  onExport: () => void
  onReorderSprites: (ids: string[]) => void
  onOpenFiles: () => void
  onOpenGuide: () => void
  onRedo: () => void
  onRenameSprite: (id: string, name: string) => void
  onSelectSprite: (id: string) => void
  onUndo: () => void
}

export function TopBar({ accountLabel, activeSpriteId, canRedo, canUndo, sprites, onAccount, onAddSprite, onCloseSprite, onExport, onReorderSprites, onOpenFiles, onOpenGuide, onRedo, onRenameSprite, onSelectSprite, onUndo }: TopBarProps) {
  return <header className={styles.topbar}>
    <Brand />
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
      <button className={styles.accountButton} onClick={onAccount}>{accountLabel}</button>
      <button className={styles.filesButton} onClick={onOpenFiles}>All files</button>
      <button className={styles.iconButton} onClick={onUndo} disabled={!canUndo} title="Undo"><UndoIcon /></button>
      <button className={styles.iconButton} onClick={onRedo} disabled={!canRedo} title="Redo"><RedoIcon /></button>
      <span className={styles.agentButtonTooltip} data-tooltip="Coming soon">
        <button className={styles.agentButton} disabled aria-label="Edit with AI — coming soon"><AgentIcon /> Edit with AI</button>
      </span>
      <button className={styles.exportButton} onClick={onExport}><DownloadIcon /> Export PNG</button>
    </div>
  </header>
}
