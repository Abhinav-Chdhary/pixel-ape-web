import styles from './Brand.module.css'

export function Brand() {
  return <div className={styles.brand} aria-label="Pixel Ape">
    <span className={styles.mark} aria-hidden="true"><i /><i /><i /><i /></span>
    <span>PIXEL APE</span>
  </div>
}
