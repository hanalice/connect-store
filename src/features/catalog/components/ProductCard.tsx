import { PRICING_LABEL, PricingOption, type Product } from '../types/product'
import styles from './ProductCard.module.scss'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const pricingLabel = PRICING_LABEL[product.pricingOption]

  return (
    <article className={styles.card}>
      <img className={styles.image} src={product.imagePath} alt={product.title} loading="lazy" />
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
    </article>
  )
}