import { useCartStore } from '../../cart/store/useCartStore';
import styles from './ClearCartConfirmCard.module.scss';

/**
 * 清空购物车确认卡（registry：tool-clearCart 命中分支，G5.1 裁决①-b）。
 * 纯渲染 + 显式点击打开 drawer；清空只发生在 assistant store 的接线分支
 * （single-writer：clearCart 回执是唯一清空通道，drawer 无人工写入口）。
 */
export function ClearCartConfirmCard() {
    const open = useCartStore((state) => state.open);

    return (
        <div className={styles.card} data-testid="clear-cart-confirm-card">
            <p className={styles.message}>✓ 已清空购物车</p>
            <button type="button" className={styles.viewButton} onClick={open}>
                查看购物车
            </button>
        </div>
    );
}
