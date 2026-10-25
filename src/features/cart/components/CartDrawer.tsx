import { useCartStore } from '../store/useCartStore';
import type { CartItem } from '../types/cart';
import styles from './CartDrawer.module.scss';

interface CartLineProps {
    item: CartItem;
}

/** 单条购物车条目：缩略图 / 标题 / 单价 / 数量步进 / 小计 / 删除。 */
function CartLine({ item }: CartLineProps) {
    const { product, quantity } = item;
    const setQuantity = useCartStore((state) => state.setQuantity);
    const remove = useCartStore((state) => state.remove);

    return (
        <li className={styles.item} data-testid={`cart-item-${product.id}`}>
            {product.imagePath ? (
                <img className={styles.thumb} src={product.imagePath} alt={product.title} />
            ) : (
                <div className={styles.thumbPlaceholder} aria-hidden="true" />
            )}
            <div className={styles.meta}>
                <span className={styles.itemTitle}>{product.title}</span>
                <span className={styles.unitPrice}>单价 ${product.price.toFixed(2)}</span>
            </div>
            <div className={styles.stepper}>
                <button
                    type="button"
                    className={styles.stepButton}
                    aria-label={`减少 ${product.title}`}
                    onClick={() => setQuantity(product.id, quantity - 1)}
                >
                    −
                </button>
                <span className={styles.quantity} data-testid="cart-quantity">
                    {quantity}
                </span>
                <button
                    type="button"
                    className={styles.stepButton}
                    aria-label={`增加 ${product.title}`}
                    onClick={() => setQuantity(product.id, quantity + 1)}
                >
                    +
                </button>
            </div>
            <span className={styles.subtotal} data-testid="cart-subtotal">
                ${(product.price * quantity).toFixed(2)}
            </span>
            <button
                type="button"
                className={styles.removeButton}
                aria-label={`删除 ${product.title}`}
                onClick={() => remove(product.id)}
            >
                删除
            </button>
        </li>
    );
}

/** drawer 内容：打开时才挂载（关闭 = 不渲染，badge 可重开）。 */
function DrawerContent() {
    const items = useCartStore((state) => state.items);
    const itemCount = useCartStore((state) => state.itemCount());
    const totalPrice = useCartStore((state) => state.totalPrice());
    const clear = useCartStore((state) => state.clear);
    const close = useCartStore((state) => state.close);

    return (
        <div className={styles.overlay}>
            <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="购物车">
                <header className={styles.header}>
                    <h2 className={styles.title}>购物车（{itemCount} 件）</h2>
                    <button
                        type="button"
                        className={styles.closeButton}
                        aria-label="关闭购物车"
                        onClick={close}
                    >
                        ×
                    </button>
                </header>
                {items.length === 0 ? (
                    <p className={styles.empty}>购物车是空的</p>
                ) : (
                    <ul className={styles.list}>
                        {items.map((item) => (
                            <CartLine key={item.product.id} item={item} />
                        ))}
                    </ul>
                )}
                <footer className={styles.footer}>
                    <div className={styles.totalRow}>
                        <span>合计</span>
                        <span className={styles.total} data-testid="cart-total">
                            ${totalPrice.toFixed(2)}
                        </span>
                    </div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.clearButton}
                            onClick={clear}
                            disabled={items.length === 0}
                        >
                            清空购物车
                        </button>
                        {/* 占位（裁决⑤）：下单交互归 G3.2 / G3.3，本 G 仅 disabled 静态占位 */}
                        <button type="button" className={styles.checkoutButton} disabled>
                            去结算（即将上线）
                        </button>
                    </div>
                </footer>
            </aside>
        </div>
    );
}

/** 购物车侧栏（design §7）：打开态由 store 驱动（加购回执自动打开 / badge 点击开关）。 */
export function CartDrawer() {
    const isOpen = useCartStore((state) => state.isOpen);
    return isOpen ? <DrawerContent /> : null;
}
