import { Reorder, useDragControls } from 'framer-motion'
import type { PixelWorkspace } from '../../types'
import styles from './SpriteTab.module.css'

type Sprite = PixelWorkspace['sprites'][number]

type SpriteTabProps = {
  sprite: Sprite
  isActive: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onClose: () => void
}

export function SpriteTab({ sprite, isActive, onSelect, onRename, onClose }: SpriteTabProps) {
  const dragControls = useDragControls()

  return <Reorder.Item
    as="div"
    value={sprite.id}
    drag="x"
    dragListener={false}
    dragControls={dragControls}
    whileDrag={{ zIndex: 10 }}
    layout="position"
    role="tab"
    aria-selected={isActive}
    className={`${styles.spriteTab} ${isActive ? styles.active : ''}`}
    onClick={onSelect}
  >
    <button
      className={styles.dragHandle}
      type="button"
      aria-label={`Reorder ${sprite.name || 'sprite'} tab`}
      title="Drag to reorder"
      onPointerDown={(event) => { event.stopPropagation(); dragControls.start(event) }}
    >
      <span aria-hidden="true">⠿</span>
    </button>
    <input
      aria-label={`Rename ${sprite.name || 'sprite'}`}
      value={sprite.name}
      onClick={(event) => event.stopPropagation()}
      onFocus={onSelect}
      onChange={(event) => onRename(event.target.value)}
    />
    <small>{sprite.width}×{sprite.height}</small>
    <button className={styles.close} onClick={(event) => { event.stopPropagation(); onClose() }} aria-label={`Close ${sprite.name || 'sprite'}`} title="Close tab">×</button>
  </Reorder.Item>
}
