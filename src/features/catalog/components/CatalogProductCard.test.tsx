import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useCartStore } from '../../cart/store/useCartStore';
import { PricingOption } from '../types/product';
import { CatalogProductCard, CatalogProductSkeletonCard } from './CatalogProductCard';

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

        fireEvent.click(
            screen.getByRole('button', { name: '加入购物车，Yellow Coat，Adam，$50.00' }),
        );

        const { items, itemCount } = useCartStore.getState();
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({ product: PRODUCT, quantity: 1 });
        expect(itemCount()).toBe(1);

        // 重复加购同商品 = 数量合并，不新增条目行（沿用 useCartStore.add 语义）
        fireEvent.click(
            screen.getByRole('button', { name: '加入购物车，Yellow Coat，Adam，$50.00' }),
        );
        expect(useCartStore.getState().items).toHaveLength(1);
        expect(useCartStore.getState().items[0].quantity).toBe(2);
        expect(useCartStore.getState().itemCount()).toBe(1);
    });

    it('加购按钮非 ProductCard 的 DOM 后代（兄弟节点挂载，无嵌套交互冲突）', () => {
        render(<CatalogProductCard product={PRODUCT} />);

        const card = screen.getByRole('article', {
            name: 'Yellow Coat by Adam, price $50.00',
        });
        const addButton = screen.getByRole('button', {
            name: '加入购物车，Yellow Coat，Adam，$50.00',
        });

        // article 与加购按钮是同一 wrapper 下的兄弟节点
        expect(addButton).not.toBe(card);
        expect(card).not.toContainElement(addButton);
        expect(addButton.parentElement).not.toBe(card);
        expect(card.parentElement).toBe(addButton.parentElement);
        expect(card.parentElement?.children).toHaveLength(2);
    });

    it('目录骨架复用商品骨架并提供非交互按钮占位', () => {
        render(<CatalogProductSkeletonCard />);

        const wrapper = screen.getByTestId('catalog-product-skeleton');
        const skeleton = screen.getByTestId('product-skeleton');
        const placeholder = screen.getByTestId('catalog-skeleton-button-placeholder');

        expect(wrapper.children).toHaveLength(2);
        expect(wrapper.firstElementChild).toBe(skeleton);
        expect(wrapper.lastElementChild).toBe(placeholder);
        expect(placeholder).toHaveAttribute('aria-hidden', 'true');
        expect(placeholder).not.toHaveAttribute('tabindex');
        expect(placeholder).not.toHaveAttribute('role');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
