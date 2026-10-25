import type { Product } from '../../catalog/types/product';

/**
 * 购物车条目（裁决⑥）：挂完整 Product 便于渲染，与 G2.4 复用组件同契约。
 * 合计口径 = Σ(product.price × quantity)，与 ProductCard 的 `$x.xx` 展示一致。
 */
export interface CartItem {
    product: Product;
    quantity: number;
}
