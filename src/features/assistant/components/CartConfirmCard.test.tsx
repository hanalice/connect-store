import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { useCartStore } from '../../cart/store/useCartStore';
import { CartConfirmCard } from './CartConfirmCard';

const productPaid: Product = {
    id: 'p-paid',
    creator: 'Creator B',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

describe('CartConfirmCard', () => {
    beforeEach(() => {
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
    });

    it('加购确认卡：✓ 已加入 N 件「标题」+ 小计（$x.xx）+ 查看购物车打开 drawer', async () => {
        render(<CartConfirmCard product={productPaid} quantity={2} />);

        expect(screen.getByText('✓ 已加入 2 件「付费模板 Beta」')).toBeInTheDocument();
        expect(screen.getByText('小计 $25.00')).toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '查看购物车' }));
        expect(useCartStore.getState().isOpen).toBe(true);
    });
});
