import type { Product } from '../../catalog/types/product';
import { useCartStore } from '../../cart/store/useCartStore';
import styles from './CartConfirmCard.module.scss';

interface CartConfirmCardProps {
    product: Product;
    quantity: number;
}

/**
 * 加购成功确认卡（registry：tool-addToCart 命中分支，裁决④）。
 * 纯渲染 + 显式点击打开 drawer；store 写入只发生在 assistant store 的接线分支。
 */
export function CartConfirmCard({ product, quantity }: CartConfirmCardProps) {
    const open = useCartStore((state) => state.open);

    return (
        <div className={styles.card} data-testid="cart-confirm-card">
            <p className={styles.message}>
                ✓ 已加入 {quantity} 件「{product.title}」
            </p>
            <p className={styles.subtotal}>小计 ${(product.price * quantity).toFixed(2)}</p>
            <button type="button" className={styles.viewButton} onClick={open}>
                查看购物车
            </button>
        </div>
    );
}
