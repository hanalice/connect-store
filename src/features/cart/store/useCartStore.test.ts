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

    it('UT-CART-02 Clear Cart（G5.1 裁决①-b 只读收口）：清空 → 条目与合计归零', () => {
        const store = useCartStore.getState();
        store.add(productPaid, 2);
        useCartStore.getState().add(productFree, 1);
        expect(useCartStore.getState().totalPrice()).toBe(25);

        // 清空：条目与合计归零（clear 唯一消费方 = clearCart 工具回执接线，G5.1 裁决①-b；
        // 单行 remove / 数量步进随 drawer 只读化整 action 移除——single-writer 收口）
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

    it('UT-CART-04 alignWithOrderItems（G3.3c 裁决①，PM 修订窄读）：订单内——draft 对齐数量 + 移除删行；订单外 cart 行（含手动加购）一律保留，永不新增', () => {
        const store = useCartStore.getState();
        store.add(productPaid, 5); // 原订单含（×5）→ draft 改 ×2 → 对齐
        useCartStore.getState().add(productFree, 1); // 原订单含（×1）→ draft 移除该条目 → 删行
        useCartStore.getState().add(productViewOnly, 2); // 订单外（await_human 期间手动加购）→ 保留

        useCartStore.getState().alignWithOrderItems(
            [
                // scope = 被 edit 那张卡的原订单 items
                { productId: 'p-paid', quantity: 5 },
                { productId: 'p-free', quantity: 1 },
            ],
            [
                // 修改后 draft：p-paid 改 2；p-free 移除
                { productId: 'p-paid', quantity: 2 },
                { productId: 'p-unknown', quantity: 9 }, // draft / cart 双无 → 永不新增
            ],
        );
        const { items, itemCount, totalPrice } = useCartStore.getState();
        expect(items).toEqual([
            { product: productPaid, quantity: 2 }, // 订单内数量直写对齐：5 → 2
            { product: productViewOnly, quantity: 2 }, // 订单外手动加购行保留（Q-D-01 回归锁）
        ]);
        expect(items.some((item) => item.product.id === 'p-free')).toBe(false); // 订单内移除 → 删行
        expect(items.some((item) => item.product.id === 'p-unknown')).toBe(false); // 永不新增
        expect(itemCount()).toBe(2);
        expect(totalPrice()).toBeCloseTo(12.5 * 2 + 4.75 * 2, 5); // 25 + 9.5
    });

    it('UT-CART-05 deductExecutedItems（G3.3c 裁决②）：按量扣减，clamp ≤0 删行不产生负数；cart 没有的 productId 跳过', () => {
        const store = useCartStore.getState();
        store.add(productPaid, 5);
        useCartStore.getState().add(productFree, 3);
        useCartStore.getState().add(productViewOnly, 1);

        useCartStore.getState().deductExecutedItems([
            { productId: 'p-paid', quantity: 2 }, // 5 − 2 = 3
            { productId: 'p-free', quantity: 5 }, // cartQty 3 < orderQty 5 → clamp 归零删行
            { productId: 'p-ghost', quantity: 1 }, // cart 没有 → 跳过不补行
        ]);
        // p-view 不在订单 items → 原样保留
        const { items } = useCartStore.getState();
        expect(items).toHaveLength(2);
        expect(items.find((item) => item.product.id === 'p-paid')).toEqual({
            product: productPaid,
            quantity: 3,
        });
        expect(items.some((item) => item.product.id === 'p-free')).toBe(false); // clamp 删行
        expect(items.find((item) => item.product.id === 'p-view')).toEqual({
            product: productViewOnly,
            quantity: 1,
        });
        expect(items.some((item) => item.product.id === 'p-ghost')).toBe(false);
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
