import type { ReactNode } from 'react'
import type { Tool } from '../../types'
import styles from './ToolButton.module.css'

type ToolButtonProps = {
  activeTool: Tool
  hotkey: string
  icon: ReactNode
  label: string
  tool: Tool
  onSelect: (tool: Tool) => void
}

export function ToolButton({ activeTool, hotkey, icon, label, tool, onSelect }: ToolButtonProps) {
  return <button className={`${styles.button} ${activeTool === tool ? styles.active : ''}`} onClick={() => onSelect(tool)}>
    {icon}<span>{label}<kbd className={styles.hotkey}>{hotkey}</kbd></span>
  </button>
}
