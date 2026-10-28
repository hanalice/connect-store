import { useEffect, useRef } from 'react';
import { useCartStore } from '../store/useCartStore';
import type { CartItem } from '../types/cart';
import styles from './CartDrawer.module.scss';

interface CartLineProps {
    item: CartItem;
}

/**
 * 单条购物车条目（G5.1 方向 D 只读投影）：缩略图 / 标题 / 单价 / 数量纯文本 / 小计。
 * 无步进 / 删除写控件——购物车由 AI 全权经手（single-writer），drawer 仅作效果视图。
 * 数量裸文本补 aria-label 可访问名（D2，G5.2）：讲述人可读「数量 N」，非无上下文数字。
 */
function CartLine({ item }: CartLineProps) {
    const { product, quantity } = item;

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
            <span
                className={styles.quantity}
                data-testid="cart-quantity"
                aria-label={`数量 ${quantity}`}
            >
                {quantity}
            </span>
            <span className={styles.subtotal} data-testid="cart-subtotal">
                ${(product.price * quantity).toFixed(2)}
            </span>
        </li>
    );
}

/** drawer 内容：打开时才挂载（关闭 = 不渲染，badge 可重开）。G5.1 方向 D：只读投影。 */
function DrawerContent() {
    const items = useCartStore((state) => state.items);
    const itemCount = useCartStore((state) => state.itemCount());
    const totalPrice = useCartStore((state) => state.totalPrice());
    const close = useCartStore((state) => state.close);
    const drawerRef = useRef<HTMLElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previouslyFocused =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeButtonRef.current?.focus();

        return () => {
            const canRestorePrevious =
                previouslyFocused?.isConnected && previouslyFocused !== document.body;
            const trigger = canRestorePrevious
                ? previouslyFocused
                : document.querySelector<HTMLElement>('[aria-controls="cart-drawer"]');
            trigger?.focus();
        };
    }, []);

    useEffect(() => {
        const drawer = drawerRef.current;
        const active = document.activeElement;
        const isDisabledButton = active instanceof HTMLButtonElement && active.disabled;
        if (drawer && (!drawer.contains(active) || isDisabledButton)) {
            closeButtonRef.current?.focus();
        }
    }, [items]);

    useEffect(() => {
        const drawer = drawerRef.current;
        if (!drawer) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== 'Tab') return;

            const currentDrawer = drawerRef.current;
            if (!currentDrawer) return;

            const focusable = Array.from(
                currentDrawer.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            );
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first || !last) return;

            const active = document.activeElement;
            if (event.shiftKey && (active === first || !currentDrawer.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !currentDrawer.contains(active))) {
                event.preventDefault();
                first.focus();
            }
        }

        drawer.addEventListener('keydown', handleKeyDown);
        return () => drawer.removeEventListener('keydown', handleKeyDown);
    }, [close]);

    return (
        <div className={styles.overlay}>
            <aside
                id="cart-drawer"
                ref={drawerRef}
                className={styles.drawer}
                role="dialog"
                aria-modal="true"
                aria-label="购物车"
            >
                <header className={styles.header}>
                    <h2 className={styles.title}>购物车（{itemCount} 件）</h2>
                    <button
                        ref={closeButtonRef}
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
                    {/* 结算引导（2026-10-28 用户拍板方案 C）：保留 disabled 按钮形态维持视觉
                        完整性，文案从「即将上线」改为导购引导——传统人工结算不建设，结算由
                        「对 AI 说下单 → 审批卡」承载（方向 D story 引子，无迷惑性）。 */}
                    <button type="button" className={styles.checkoutButton} disabled>
                        对 AI 说「下单」结算
                    </button>
                </footer>
            </aside>
        </div>
    );
}

/** 购物车侧栏（design §7，G5.1 方向 D 只读投影）：打开态由 store 驱动
 * （加购 / 清空回执自动打开 / badge 点击开关）；drawer 内无任何人工写控件。 */
export function CartDrawer() {
    const isOpen = useCartStore((state) => state.isOpen);
    return isOpen ? <DrawerContent /> : null;
}
