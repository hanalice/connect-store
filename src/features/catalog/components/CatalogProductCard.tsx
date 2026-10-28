import { useCartStore } from '../../cart/store/useCartStore';
import type { Product } from '../types/product';
import { PricingOption, PRICING_LABEL } from '../types/product';
import { ProductCard } from './ProductCard';
import { ProductSkeletonCard } from './ProductSkeletonCard';
import styles from './CatalogProductCard.module.scss';

interface CatalogProductCardProps {
    product: Product;
}

/**
 * 目录页商品卡 wrapper（G3.1a 裁决①）：存量 ProductCard + 加购按钮的兄弟节点组合。
 * 按钮不得作为 ProductCard 的 DOM 后代，也不遮挡卡片图片 / 价格。
 * accessible name「加入购物车，{title}，{creator}，{price}」供单测与 E2E 按 name 定位；
 * creator/价格为 H6-N2a 拍板补全——读屏用户仅凭按钮可访问名即可决策，无需卡片级上下文。
 * 纯消费 useCartStore，零 store 逻辑。
 */
export function CatalogProductCard({ product }: CatalogProductCardProps) {
    const priceText =
        product.pricingOption === PricingOption.PAID
            ? `$${(product.price ?? 0).toFixed(2)}`
            : PRICING_LABEL[product.pricingOption];
    return (
        <div className={styles.wrapper}>
            <ProductCard product={product} />
            <button
                type="button"
                className={styles.addButton}
                aria-label={`加入购物车，${product.title}，${product.creator}，${priceText}`}
                onClick={() => useCartStore.getState().add(product, 1)}
            >
                加入购物车
            </button>
        </div>
    );
}

export function CatalogProductSkeletonCard() {
    return (
        <div className={styles.wrapper} data-testid="catalog-product-skeleton">
            <ProductSkeletonCard />
            <div
                className={styles.buttonPlaceholder}
                data-testid="catalog-skeleton-button-placeholder"
                aria-hidden="true"
            />
        </div>
    );
}
