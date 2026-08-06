import type { PixelWorkspace } from '../../types'
import styles from './SpriteTab.module.css'

type Sprite = PixelWorkspace['sprites'][number]

type SpriteTabProps = {
  sprite: Sprite
  isActive: boolean
  onSelect: () => void
  onRename: (name: string) => void
}

export function SpriteTab({ sprite, isActive, onSelect, onRename }: SpriteTabProps) {
  return <div
    role="tab"
    aria-selected={isActive}
    className={`${styles.spriteTab} ${isActive ? styles.active : ''}`}
    onClick={onSelect}
  >
    <input
      aria-label={`Rename ${sprite.name || 'sprite'}`}
      value={sprite.name}
      onClick={(event) => event.stopPropagation()}
      onFocus={onSelect}
      onChange={(event) => onRename(event.target.value)}
    />
    <small>{sprite.width}×{sprite.height}</small>
  </div>
}
