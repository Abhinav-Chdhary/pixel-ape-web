import { EraserIcon, EyedropperIcon, FillIcon, LineIcon, PencilIcon, TrashIcon } from '../../icons'
import type { LineMode, Tool } from '../../types'
import { ToolButton } from '../02_molecules/ToolButton'
import styles from './ToolsPanel.module.css'

type ToolsPanelProps = {
  colorsUsed: number
  spriteCount: number
  spriteIndex: number
  tool: Tool
  lineMode: LineMode
  eraserSize: number
  onClear: () => void
  onEraserSizeChange: (size: number) => void
  onLineModeChange: (mode: LineMode) => void
  onToolChange: (tool: Tool) => void
}

export function ToolsPanel({ colorsUsed, spriteCount, spriteIndex, tool, lineMode, eraserSize, onClear, onEraserSizeChange, onLineModeChange, onToolChange }: ToolsPanelProps) {
  return <aside className={`${styles.panel} ${styles.toolsPanel}`} aria-label="Drawing tools">
    <div className={styles.heading}><span>Tools</span><small>DRAW</small></div>
    <div className={styles.toolList}>
      <ToolButton activeTool={tool} tool="pencil" hotkey="P" icon={<PencilIcon />} label="Pencil" onSelect={onToolChange} />
      <ToolButton activeTool={tool} tool="fill" hotkey="F" icon={<FillIcon />} label="Bucket fill" onSelect={onToolChange} />
      <ToolButton activeTool={tool} tool="eraser" hotkey="E" icon={<EraserIcon />} label="Eraser" onSelect={onToolChange} />
      {tool === 'eraser' && <label className={styles.eraserSize}>Eraser size <output>{eraserSize}×</output><input type="range" min="1" max="8" value={eraserSize} onChange={(event) => onEraserSizeChange(Number(event.target.value))} aria-label="Eraser size" /></label>}
      <ToolButton activeTool={tool} tool="eyedropper" hotkey="I" icon={<EyedropperIcon />} label="Eyedropper" onSelect={onToolChange} />
      <ToolButton activeTool={tool} tool="line" hotkey="L" icon={<LineIcon />} label="Line" onSelect={onToolChange} />
      {tool === 'line' && <div className={styles.lineModes} role="group" aria-label="Line mode"><button className={lineMode === 'straight' ? styles.selectedMode : ''} onClick={() => onLineModeChange('straight')}>Straight</button><button className={lineMode === 'curve' ? styles.selectedMode : ''} onClick={() => onLineModeChange('curve')}>Curve</button></div>}
    </div>
    <div className={styles.separator} />
    <button className={styles.clearButton} onClick={onClear}><TrashIcon /> Clear canvas</button>
    <div className={styles.projectMeta}><span>Sprite</span><b>{String(spriteIndex).padStart(2, '0')} / {String(spriteCount).padStart(2, '0')}</b><span>Colors used</span><b>{colorsUsed}</b></div>
  </aside>
}
