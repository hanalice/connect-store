import { useId, useState } from 'react';
import { PRICING_LABEL, PricingOption, type Product } from '../types/product';
import styles from './ProductCard.module.scss';

interface ProductCardProps {
    product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
    const [imgError, setImgError] = useState(false);
    const titleTooltipId = useId();
    const creatorTooltipId = useId();
    const pricingLabel = PRICING_LABEL[product.pricingOption];

    return (
        <article
            className={styles.card}
            aria-label={`${product.title} by ${product.creator}, price ${
                product.pricingOption === PricingOption.PAID
                    ? '$' + (product.price ?? 0).toFixed(2)
                    : pricingLabel
            }`}
        >
            {product.imagePath && !imgError ? (
                <img
                    className={styles.image}
                    src={product.imagePath}
                    alt={product.title}
                    loading="lazy"
                    onError={() => setImgError(true)}
                />
            ) : (
                <div
                    className={styles.imagePlaceholder}
                    data-testid="product-image-placeholder"
                    role="img"
                    aria-label={`${product.title} - Image not available`}
                >
                    <div className={styles.placeholderContent}>
                        <svg
                            viewBox="0 0 24 24"
                            width="28"
                            height="28"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span className={styles.placeholderText}>Image not available</span>
                    </div>
                </div>
            )}
            <div className={styles.metaRow}>
                <div className={styles.meta}>
                    <div className={styles.textWithTooltip}>
                        <div
                            className={styles.textTrigger}
                            ref={(element) => element?.setAttribute('tabindex', '0')}
                            aria-describedby={titleTooltipId}
                        >
                            <h3 className={styles.title}>{product.title}</h3>
                        </div>
                        <span
                            id={titleTooltipId}
                            className={styles.tooltip}
                            role="tooltip"
                            aria-label={product.title}
                            data-full-text={product.title}
                        />
                    </div>
                    <div className={styles.textWithTooltip}>
                        <div
                            className={styles.textTrigger}
                            ref={(element) => element?.setAttribute('tabindex', '0')}
                            aria-describedby={creatorTooltipId}
                        >
                            <span className={styles.creator}>{product.creator}</span>
                        </div>
                        <span
                            id={creatorTooltipId}
                            className={styles.tooltip}
                            role="tooltip"
                            aria-label={product.creator}
                            data-full-text={product.creator}
                        />
                    </div>
                </div>
                <div className={styles.priceInfo}>
                    {product.pricingOption === PricingOption.PAID ? (
                        <span className={styles.priceDetail}>
                            ${(product.price ?? 0).toFixed(2)}
                        </span>
                    ) : (
                        <span className={styles.priceDetail}>{pricingLabel}</span>
                    )}
                </div>
            </div>
        </article>
    );
}
