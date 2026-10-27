import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Product } from '../../catalog/types/product';
import type { CartItem } from '../types/cart';

interface CartStore {
    items: CartItem[];
    /** drawer 开关属 UI 态（裁决③：不 persist，刷新后默认关闭）。 */
    isOpen: boolean;
    add: (product: Product, quantity: number) => void;
    remove: (productId: string) => void;
    /** 数量步进：1..N 正整数；减到 0 = remove。 */
    setQuantity: (productId: string, quantity: number) => void;
    /**
     * G3.3c 裁决① edit 同步（editOrder 确认点调用；PM 修订窄读：作用域 = 被 edit 那张卡的
     * 原订单 orderItems）。cart 行在原订单内：draft 含该 productId → 数量直写对齐；原订单含
     * 而 draft 不含（edit 移除）→ 删行。订单外 cart 行（含 await_human 期间手动加购）一律保留；
     * align 永不新增（draft / 订单独有的 productId 不产生行）。
     */
    alignWithOrderItems: (
        orderItems: { productId: string; quantity: number }[],
        draftItems: { productId: string; quantity: number }[],
    ) => void;
    /**
     * G3.3c 裁决② 执行扣减（placeOrder 成功回执触点调用，数据源 = 审批记录 items）：
     * cartQty − orderQty，结果 ≤ 0 → 删行（clamp，不产生负数）；cart 没有的 productId 跳过。
     */
    deductExecutedItems: (items: { productId: string; quantity: number }[]) => void;
    clear: () => void;
    open: () => void;
    close: () => void;
    toggle: () => void;
    /** 条目数 = 条目行数（同商品合并后，UT-CART-01 口径）。 */
    itemCount: () => number;
    /** 合计 = Σ(product.price × quantity)（裁决⑥）。 */
    totalPrice: () => number;
}

export const useCartStore = create<CartStore>()(
    persist(
        (set, get) => ({
            items: [],
            isOpen: false,
            add(product, quantity) {
                if (quantity <= 0) return;
                set((state) => {
                    const existing = state.items.find((item) => item.product.id === product.id);
                    if (existing !== undefined) {
                        // 重复加购同商品 = 数量合并，不新增条目行（UT-CART-01）
                        return {
                            items: state.items.map((item) =>
                                item.product.id === product.id
                                    ? { ...item, quantity: item.quantity + quantity }
                                    : item,
                            ),
                        };
                    }
                    return { items: [...state.items, { product, quantity }] };
                });
            },
            remove(productId) {
                set((state) => ({
                    items: state.items.filter((item) => item.product.id !== productId),
                }));
            },
            setQuantity(productId, quantity) {
                if (quantity <= 0) {
                    set((state) => ({
                        items: state.items.filter((item) => item.product.id !== productId),
                    }));
                    return;
                }
                set((state) => ({
                    items: state.items.map((item) =>
                        item.product.id === productId ? { ...item, quantity } : item,
                    ),
                }));
            },
            alignWithOrderItems(orderItems, draftItems) {
                const scopeIds = new Set(orderItems.map((item) => item.productId));
                const draftQtyById = new Map(
                    draftItems.map((item) => [item.productId, item.quantity]),
                );
                set((state) => ({
                    items: state.items.flatMap((item) => {
                        // 订单外 cart 行（含 await_human 期间手动加购）→ 一律保留
                        // （PM 修订窄读：删行面收窄到被 edit 卡的原订单 items）
                        if (!scopeIds.has(item.product.id)) return [item];
                        // 原订单含而 draft 不含（edit 移除该条目）→ 删行
                        const draftQty = draftQtyById.get(item.product.id);
                        if (draftQty === undefined) return [];
                        // draft 含该 productId → 数量直写对齐（不分来源，不引 provenance）
                        return [{ ...item, quantity: draftQty }];
                    }),
                }));
            },
            deductExecutedItems(items) {
                const orderQtyById = new Map(items.map((item) => [item.productId, item.quantity]));
                set((state) => ({
                    items: state.items.flatMap((item) => {
                        const orderQty = orderQtyById.get(item.product.id);
                        // cart 没有而订单含有的 productId → 跳过（order→cart 只扣不补）
                        if (orderQty === undefined) return [item];
                        // clamp：cartQty − orderQty ≤ 0 → 删行，不产生负数数量
                        const remaining = item.quantity - orderQty;
                        return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
                    }),
                }));
            },
            clear() {
                set({ items: [] });
            },
            open() {
                set({ isOpen: true });
            },
            close() {
                set({ isOpen: false });
            },
            toggle() {
                set((state) => ({ isOpen: !state.isOpen }));
            },
            itemCount() {
                return get().items.length;
            },
            totalPrice() {
                return get().items.reduce(
                    (sum, item) => sum + item.product.price * item.quantity,
                    0,
                );
            },
        }),
        {
            name: 'clo-cart',
            // 裁决③：只 persist items；UI 态（drawer 开关、步进中间态）不持久化
            partialize: (state) => ({ items: state.items }),
        },
    ),
);
