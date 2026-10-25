import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { useCartStore } from './useCartStore';

/** Free 商品：price 0（G2.1 价格语义：小计统一按 price 计）。 */
const productFree: Product = {
    id: 'p-free',
    creator: 'Creator A',
    title: '免费素材 Alpha',
    pricingOption: 1,
    imagePath: '',
    price: 0,
};

/** Paid 商品：price 12.5。 */
const productPaid: Product = {
    id: 'p-paid',
    creator: 'Creator B',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

/** View Only 商品：price 4.75（G2.1 价格语义：Free / View Only price 非 0）。 */
const productViewOnly: Product = {
    id: 'p-view',
    creator: 'Creator C',
    title: '仅查看样例 Gamma',
    pricingOption: 2,
    imagePath: '',
    price: 4.75,
};

describe('useCartStore', () => {
    // 裁决③：用例间隔离——清 localStorage 并把内存态重置到初始态，防跨用例污染
    beforeEach(() => {
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
    });

    it('UT-CART-01 Add & Quantity Merge：重复加购同商品 → 数量合并、条目行不增', () => {
        const store = useCartStore.getState();
        // 隔离证据：用例起始购物车必为空（前序用例的 persist 残留已被 beforeEach 清掉）
        expect(store.items).toHaveLength(0);

        store.add(productPaid, 1);
        useCartStore.getState().add(productPaid, 2);
        useCartStore.getState().add(productFree, 1);

        const { items, itemCount } = useCartStore.getState();
        expect(items).toHaveLength(2); // 条目行不增：同商品只保留一行
        expect(items.find((item) => item.product.id === 'p-paid')?.quantity).toBe(3);
        expect(items.find((item) => item.product.id === 'p-free')?.quantity).toBe(1);
        expect(itemCount()).toBe(2); // 条目数 = 合并后的条目行数
    });

    it('UT-CART-02 Remove & Clear Cart：删除单项 / 步进减到 0 / 清空 → 条目与合计归零', () => {
        const store = useCartStore.getState();
        store.add(productPaid, 2);
        useCartStore.getState().add(productFree, 1);

        // 删除单项：paid 移除后只剩 free，合计 = 0
        useCartStore.getState().remove('p-paid');
        expect(useCartStore.getState().items).toHaveLength(1);
        expect(useCartStore.getState().totalPrice()).toBe(0);

        // 步进减到 0 = remove（数量步进口径：1..N，减到 0 即移除）
        useCartStore.getState().add(productPaid, 1);
        useCartStore.getState().setQuantity('p-free', 0);
        expect(useCartStore.getState().items.map((item) => item.product.id)).toEqual(['p-paid']);
        expect(useCartStore.getState().totalPrice()).toBe(12.5);

        // 清空：条目与合计归零
        useCartStore.getState().clear();
        expect(useCartStore.getState().items).toHaveLength(0);
        expect(useCartStore.getState().itemCount()).toBe(0);
        expect(useCartStore.getState().totalPrice()).toBe(0);
    });

    it('UT-CART-03 Total & Price Summary：Free / Paid / View Only 混合合计 = Σ price×qty', () => {
        const store = useCartStore.getState();
        store.add(productFree, 2); // 0 × 2
        useCartStore.getState().add(productPaid, 1); // 12.5 × 1
        useCartStore.getState().add(productViewOnly, 3); // 4.75 × 3

        const { totalPrice } = useCartStore.getState();
        expect(totalPrice()).toBeCloseTo(0 + 12.5 + 14.25, 5);
        // 展示口径（裁决⑥）：$x.xx 两位小数，与 ProductCard 一致
        expect(`$${totalPrice().toFixed(2)}`).toBe('$26.75');
    });

    it('persist 恢复：写入经 persist 层落盘 clo-cart（只含 items）→ rehydrate 从 localStorage 恢复', async () => {
        useCartStore.getState().add(productPaid, 2);
        useCartStore.getState().open();

        // 真实经过 persist 层：写入即落盘 localStorage，键名 clo-cart（裁决③）
        const persisted = localStorage.getItem('clo-cart');
        expect(persisted).not.toBeNull();
        const parsed = JSON.parse(persisted!) as {
            state: { items?: unknown[]; isOpen?: boolean };
        };
        expect(parsed.state.items).toHaveLength(1);
        expect(parsed.state.isOpen).toBeUndefined(); // partialize：UI 态不持久化

        // 模拟刷新：内存态丢失，localStorage 仍持有上次落盘的快照
        useCartStore.setState({ items: [], isOpen: false });
        expect(useCartStore.getState().items).toHaveLength(0);
        localStorage.setItem('clo-cart', persisted!);

        await useCartStore.persist.rehydrate();
        const restored = useCartStore.getState();
        expect(restored.items).toHaveLength(1);
        expect(restored.items[0]).toEqual({ product: productPaid, quantity: 2 });
        expect(restored.totalPrice()).toBe(25);
        // rehydrate 不恢复 UI 态：isOpen 维持内存当前值（初始值 = false，drawer 默认关闭）
        expect(restored.isOpen).toBe(false);
    });
});
