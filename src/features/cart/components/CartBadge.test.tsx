import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { useCartStore } from '../store/useCartStore';
import { CartBadge } from './CartBadge';

const productPaid: Product = {
    id: 'p-paid',
    creator: 'Creator B',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

describe('CartBadge', () => {
    beforeEach(() => {
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
    });

    it('badge 形态锁定：始终显示条目数（含 0），点击 toggle drawer，计数随加购联动', async () => {
        render(<CartBadge />);
        const user = userEvent.setup();

        // 0 也显示（coder 定的锁定形态）：accessible name 含计数，数字文本可见
        const badge = screen.getByRole('button', { name: '购物车，0 件商品' });
        expect(within(badge).getByText('0')).toBeInTheDocument();

        await user.click(badge);
        expect(useCartStore.getState().isOpen).toBe(true);
        await user.click(screen.getByRole('button', { name: '购物车，0 件商品' }));
        expect(useCartStore.getState().isOpen).toBe(false);

        // 加购后计数联动（条目数 = 合并后条目行数）
        act(() => {
            useCartStore.getState().add(productPaid, 2);
        });
        expect(await screen.findByRole('button', { name: '购物车，1 件商品' })).toBeInTheDocument();
    });
});
