import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { useCartStore } from '../store/useCartStore';
import { CartBadge } from './CartBadge';
import { CartDrawer } from './CartDrawer';

const productFree: Product = {
    id: 'p-free',
    creator: 'Creator A',
    title: '免费素材 Alpha',
    pricingOption: 1,
    imagePath: '',
    price: 0,
};

const productPaid: Product = {
    id: 'p-paid',
    creator: 'Creator B',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

function seedCart() {
    const store = useCartStore.getState();
    store.add(productFree, 2);
    useCartStore.getState().add(productPaid, 1);
    useCartStore.getState().open();
}

describe('CartDrawer（G5.1 方向 D 只读投影）', () => {
    beforeEach(() => {
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
    });

    it('渲染条目与合计联动：数量以纯文本呈现，小计 / 合计正确（映射 UT-CART-03 展示面）', () => {
        seedCart();
        render(<CartDrawer />);
        const drawer = screen.getByRole('dialog', { name: '购物车' });

        expect(drawer).toHaveTextContent('购物车（2 件）');
        const freeRow = within(drawer).getByTestId('cart-item-p-free');
        expect(freeRow).toHaveTextContent('免费素材 Alpha');
        expect(within(freeRow).getByTestId('cart-quantity')).toHaveTextContent('2');
        expect(within(freeRow).getByTestId('cart-subtotal')).toHaveTextContent('$0.00');
        const paidRow = within(drawer).getByTestId('cart-item-p-paid');
        expect(paidRow).toHaveTextContent('付费模板 Beta');
        expect(within(paidRow).getByTestId('cart-quantity')).toHaveTextContent('1');
        expect(within(paidRow).getByTestId('cart-subtotal')).toHaveTextContent('$12.50');
        // 合计 = Σ price×qty = 0×2 + 12.5×1
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$12.50');
    });

    it('只读收口：drawer 内无任何人工写控件（无步进 / 单行删除 / 清空），写动作只由 AI 回执触发', () => {
        seedCart();
        render(<CartDrawer />);
        const drawer = screen.getByRole('dialog', { name: '购物车' });

        expect(within(drawer).queryByRole('button', { name: '增加 免费素材 Alpha' })).toBeNull();
        expect(within(drawer).queryByRole('button', { name: '减少 免费素材 Alpha' })).toBeNull();
        expect(within(drawer).queryByRole('button', { name: '删除 免费素材 Alpha' })).toBeNull();
        expect(within(drawer).queryByRole('button', { name: /删除/ })).toBeNull();
        expect(within(drawer).queryByRole('button', { name: '清空购物车' })).toBeNull();
        // 唯一可交互按钮 = 关闭；「去结算」维持 disabled 引导（裁决⑤ → 2026-10-28 方案 C 文案）
        expect(within(drawer).getByRole('button', { name: '关闭购物车' })).toBeEnabled();
        expect(within(drawer).getByRole('button', { name: '对 AI 说「下单」结算' })).toBeDisabled();
    });

    it('空态与关闭态：关闭时不渲染；打开空购物车 → 空态文案与 disabled 占位', () => {
        const { rerender } = render(<CartDrawer />);
        expect(screen.queryByRole('dialog', { name: '购物车' })).toBeNull();

        useCartStore.getState().open();
        rerender(<CartDrawer />);
        const drawer = screen.getByRole('dialog', { name: '购物车' });
        expect(within(drawer).getByText('购物车是空的')).toBeInTheDocument();
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$0.00');
        expect(within(drawer).getByRole('button', { name: '对 AI 说「下单」结算' })).toBeDisabled();
    });

    it('打开后聚焦关闭按钮，Tab 循环圈禁，Escape 关闭并恢复 badge 焦点', async () => {
        const user = userEvent.setup();
        render(
            <>
                <CartBadge />
                <CartDrawer />
            </>,
        );
        const badge = screen.getByRole('button', { name: '购物车，0 件商品' });

        await user.click(badge);
        const drawer = screen.getByRole('dialog', { name: '购物车' });
        const closeButton = within(drawer).getByRole('button', { name: '关闭购物车' });
        expect(drawer).toHaveAttribute('id', 'cart-drawer');
        expect(badge).toHaveAttribute('aria-controls', 'cart-drawer');
        expect(closeButton).toHaveFocus();

        await user.tab();
        expect(closeButton).toHaveFocus();
        await user.tab({ shift: true });
        expect(closeButton).toHaveFocus();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: '购物车' })).not.toBeInTheDocument();
        expect(badge).toHaveFocus();
        expect(badge).toHaveAttribute('aria-expanded', 'false');
    });

    it('有条目时唯一可交互控件仍是关闭按钮：Tab / Shift+Tab 均圈禁在对话框内', async () => {
        seedCart();
        useCartStore.getState().close();
        const user = userEvent.setup();
        render(
            <>
                <a href="#assistant">AI 导购</a>
                <CartBadge />
                <CartDrawer />
            </>,
        );
        const badge = screen.getByRole('button', { name: '购物车，2 件商品' });
        await user.click(badge);

        const drawer = screen.getByRole('dialog', { name: '购物车' });
        const closeButton = within(drawer).getByRole('button', { name: '关闭购物车' });
        expect(closeButton).toHaveFocus();

        // 只读 drawer 只有一个可交互控件：Tab 双向都回收到关闭按钮，不逃出对话框
        await user.tab({ shift: true });
        expect(closeButton).toHaveFocus();
        await user.tab();
        expect(closeButton).toHaveFocus();
        expect(screen.getByRole('link', { name: 'AI 导购' })).not.toHaveFocus();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: '购物车' })).not.toBeInTheDocument();
        expect(badge).toHaveFocus();
    });
});
