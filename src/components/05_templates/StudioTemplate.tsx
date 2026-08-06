import type { ReactNode } from 'react'
import styles from './StudioTemplate.module.css'

type StudioTemplateProps = {
  canvas: ReactNode
  palette: ReactNode
  tools: ReactNode
  topBar: ReactNode
}

export function StudioTemplate({ canvas, palette, tools, topBar }: StudioTemplateProps) {
  return <main className={styles.studio}>
    {topBar}
    <section className={styles.workspace}>
      {palette}
      {canvas}
      {tools}
    </section>
  </main>
}
