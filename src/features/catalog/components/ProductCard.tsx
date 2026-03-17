import { PRICING_LABEL, PricingOption, type Product } from '../types/product';
import styles from './ProductCard.module.scss';

interface ProductCardProps {
    product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
    const pricingLabel = PRICING_LABEL[product.pricingOption];

    return (
        <div
            className={styles.card}
            tabIndex={0}
            role="button"
            aria-label={`${product.title} by ${product.creator}, price ${
                product.pricingOption === PricingOption.PAID
                    ? '$' + product.price.toFixed(2)
                    : pricingLabel
            }`}
        >
            {product.imagePath ? (
                <img
                    className={styles.image}
                    src={product.imagePath}
                    alt={product.title}
                    loading="lazy"
                />
            ) : (
                <div className={styles.imagePlaceholder} aria-hidden="true" />
            )}
            <div className={styles.metaRow}>
                <div className={styles.meta}>
                    <h3 className={styles.title}>{product.title}</h3>
                    <p className={styles.creator}>{product.creator}</p>
                </div>
                <div className={styles.priceInfo}>
                    {product.pricingOption === PricingOption.PAID ? (
                        <span className={styles.priceDetail}>${product.price.toFixed(2)}</span>
                    ) : (
                        <span className={styles.priceDetail}>{pricingLabel}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
