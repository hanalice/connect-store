import styles from './ProductSkeletonCard.module.scss';

export function ProductSkeletonCard() {
    return (
        <div className={styles.card} data-testid="product-skeleton">
            <div className={styles.imagePlaceholder} data-testid="skeleton-image" />
            <div className={styles.metaRow} data-testid="skeleton-meta-row">
                <div className={styles.meta}>
                    <div className={styles.titlePlaceholder} data-testid="skeleton-title" />
                    <div className={styles.creatorPlaceholder} data-testid="skeleton-creator" />
                </div>
                <div className={styles.priceInfo}>
                    <div className={styles.pricePlaceholder} data-testid="skeleton-price" />
                </div>
            </div>
        </div>
    );
}
