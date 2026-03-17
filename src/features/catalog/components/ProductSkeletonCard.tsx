import styles from './ProductSkeletonCard.module.scss'

export function ProductSkeletonCard() {
  return (
    <div className={styles.card} data-testid="product-skeleton">
      <div className={styles.imagePlaceholder} />
      <div className={styles.meta}>
        <div className={styles.titlePlaceholder} />
        <div className={styles.creatorPlaceholder} />
      </div>
    </div>
  )
}