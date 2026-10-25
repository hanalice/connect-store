import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useCartStore } from '../../cart/store/useCartStore';
import { PricingOption } from '../types/product';
import { CatalogProductCard } from './CatalogProductCard';

const PRODUCT = {
    id: 'p1',
    creator: 'Adam',
    title: 'Yellow Coat',
    pricingOption: PricingOption.PAID,
    imagePath: '/test-image.jpg',
    price: 50,
};

describe('CatalogProductCard（G3.1a 目录页加购入口）', () => {
    beforeEach(() => {
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
    });

    it('点加购按钮 → useCartStore 写入条目，重复点击按 add 语义合并数量', () => {
        render(<CatalogProductCard product={PRODUCT} />);

        fireEvent.click(screen.getByRole('button', { name: '加入购物车，Yellow Coat' }));

        const { items, itemCount } = useCartStore.getState();
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({ product: PRODUCT, quantity: 1 });
        expect(itemCount()).toBe(1);

        // 重复加购同商品 = 数量合并，不新增条目行（沿用 useCartStore.add 语义）
        fireEvent.click(screen.getByRole('button', { name: '加入购物车，Yellow Coat' }));
        expect(useCartStore.getState().items).toHaveLength(1);
        expect(useCartStore.getState().items[0].quantity).toBe(2);
        expect(useCartStore.getState().itemCount()).toBe(1);
    });

    it('加购按钮非 ProductCard 的 DOM 后代（兄弟节点挂载，无嵌套交互冲突）', () => {
        render(<CatalogProductCard product={PRODUCT} />);

        const card = screen.getByRole('button', {
            name: 'Yellow Coat by Adam, price $50.00',
        });
        const addButton = screen.getByRole('button', { name: '加入购物车，Yellow Coat' });

        // accessible name 精确定位两个交互元素，且按钮不是卡片的 DOM 后代
        expect(addButton).not.toBe(card);
        expect(card).not.toContainElement(addButton);
        expect(addButton.parentElement).not.toBe(card);
        // 兄弟节点：卡片与按钮同属一个 wrapper
        expect(card.parentElement).toBe(addButton.parentElement);
    });
});
