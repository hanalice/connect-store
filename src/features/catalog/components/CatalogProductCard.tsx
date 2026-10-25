import { useCartStore } from '../../cart/store/useCartStore';
import type { Product } from '../types/product';
import { ProductCard } from './ProductCard';
import styles from './CatalogProductCard.module.scss';

interface CatalogProductCardProps {
    product: Product;
}

/**
 * 目录页商品卡 wrapper（G3.1a 裁决①）：存量 ProductCard + 加购按钮的兄弟节点组合。
 * 按钮不得作为 ProductCard 的 DOM 后代（卡片本体 role="button"，防嵌套交互语义），
 * 也不遮挡卡片图片 / 价格；accessible name「加入购物车，{title}」供单测与 E2E 按 name 定位。
 * 纯消费 useCartStore，零 store 逻辑。
 */
export function CatalogProductCard({ product }: CatalogProductCardProps) {
    return (
        <div className={styles.wrapper}>
            <ProductCard product={product} />
            <button
                type="button"
                className={styles.addButton}
                aria-label={`加入购物车，${product.title}`}
                onClick={() => useCartStore.getState().add(product, 1)}
            >
                加入购物车
            </button>
        </div>
    );
}
