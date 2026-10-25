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
