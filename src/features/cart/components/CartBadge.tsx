import { useCartStore } from '../store/useCartStore';
import styles from './CartBadge.module.scss';

/**
 * 头部购物车 badge（裁决⑤ 触发②）：显示条目数（含 0，coder 定的锁定形态），
 * 点击 toggle drawer。selector 取调用后的数值（函数引用恒定，直接选函数不重渲染）。
 */
export function CartBadge() {
    const count = useCartStore((state) => state.itemCount());
    const isOpen = useCartStore((state) => state.isOpen);
    const toggle = useCartStore((state) => state.toggle);

    return (
        <button
            type="button"
            className={styles.badge}
            aria-label={`购物车，${count} 件商品`}
            aria-expanded={isOpen}
            aria-controls="cart-drawer"
            onClick={toggle}
        >
            <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="17" cy="20" r="1.5" />
                <path d="M2 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L19.5 7H6" />
            </svg>
            <span className={styles.count} aria-hidden="true">
                {count}
            </span>
        </button>
    );
}
