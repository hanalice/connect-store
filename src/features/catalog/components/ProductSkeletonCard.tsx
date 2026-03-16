import styles from './ProductSkeletonCard.module.scss'

export function ProductSkeletonCard() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.image} />
      <div className={styles.line} />
      <div className={styles.lineShort} />
    </div>
  )
}