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

describe('CartDrawer', () => {
    beforeEach(() => {
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
    });

    it('渲染条目与合计联动：数量步进 / 删除即时反映到数量、小计与合计', async () => {
        seedCart();
        render(<CartDrawer />);
        const user = userEvent.setup();
        const drawer = screen.getByRole('dialog', { name: '购物车' });

        expect(drawer).toHaveTextContent('购物车（2 件）');
        const freeRow = within(drawer).getByTestId('cart-item-p-free');
        expect(freeRow).toHaveTextContent('免费素材 Alpha');
        expect(within(freeRow).getByTestId('cart-quantity')).toHaveTextContent('2');
        expect(within(freeRow).getByTestId('cart-subtotal')).toHaveTextContent('$0.00');
        // 合计 = Σ price×qty = 0×2 + 12.5×1
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$12.50');

        // 步进 +：数量与小计联动（0×3 仍 $0.00），合计不变
        await user.click(within(freeRow).getByRole('button', { name: '增加 免费素材 Alpha' }));
        expect(within(freeRow).getByTestId('cart-quantity')).toHaveTextContent('3');
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$12.50');

        // 步进 − 三次（3 → 0）：条目行移除，合计只剩 paid 项
        const decrease = within(freeRow).getByRole('button', { name: '减少 免费素材 Alpha' });
        await user.click(decrease);
        await user.click(decrease);
        await user.click(decrease);
        expect(within(drawer).queryByTestId('cart-item-p-free')).toBeNull();
        expect(within(drawer).getByText('购物车（1 件）')).toBeInTheDocument();
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$12.50');

        // paid 行步进 +：合计联动 12.50 → 25.00
        const paidRow = within(drawer).getByTestId('cart-item-p-paid');
        await user.click(within(paidRow).getByRole('button', { name: '增加 付费模板 Beta' }));
        expect(within(paidRow).getByTestId('cart-quantity')).toHaveTextContent('2');
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$25.00');
    });

    it('删除单项与清空：删除即时移除条目，清空后空态文案 + 合计归零 + 占位 disabled', async () => {
        seedCart();
        render(<CartDrawer />);
        const user = userEvent.setup();
        const drawer = screen.getByRole('dialog', { name: '购物车' });

        await user.click(within(drawer).getByRole('button', { name: '删除 付费模板 Beta' }));
        expect(within(drawer).queryByTestId('cart-item-p-paid')).toBeNull();
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$0.00');
        expect(within(drawer).getByTestId('cart-item-p-free')).not.toBeNull();

        await user.click(within(drawer).getByRole('button', { name: '清空购物车' }));
        expect(within(drawer).getByText('购物车是空的')).toBeInTheDocument();
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$0.00');
        expect(within(drawer).getByRole('button', { name: '清空购物车' })).toBeDisabled();
        // 裁决⑤：「去结算」仅 disabled 占位，交互归 G3.2 / G3.3
        expect(within(drawer).getByRole('button', { name: '去结算（即将上线）' })).toBeDisabled();
    });

    it('空态与关闭态：关闭时不渲染；打开空购物车 → 空态文案与 disabled 占位', () => {
        const { rerender } = render(<CartDrawer />);
        expect(screen.queryByRole('dialog', { name: '购物车' })).toBeNull();

        useCartStore.getState().open();
        rerender(<CartDrawer />);
        const drawer = screen.getByRole('dialog', { name: '购物车' });
        expect(within(drawer).getByText('购物车是空的')).toBeInTheDocument();
        expect(within(drawer).getByTestId('cart-total')).toHaveTextContent('$0.00');
        expect(within(drawer).getByRole('button', { name: '清空购物车' })).toBeDisabled();
        expect(within(drawer).getByRole('button', { name: '去结算（即将上线）' })).toBeDisabled();
    });

    it('打开后聚焦关闭按钮，空态 Tab 循环，Escape 关闭并恢复 badge 焦点', async () => {
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

    it('有条目时 Shift+Tab 到最后可用控件，Tab 返回首个控件且不逃出对话框', async () => {
        seedCart();
        useCartStore.getState().close();
        const user = userEvent.setup();
        render(
            <>
                <CartBadge />
                <CartDrawer />
            </>,
        );
        const badge = screen.getByRole('button', { name: '购物车，2 件商品' });
        await user.click(badge);

        const drawer = screen.getByRole('dialog', { name: '购物车' });
        const closeButton = within(drawer).getByRole('button', { name: '关闭购物车' });
        const clearButton = within(drawer).getByRole('button', { name: '清空购物车' });
        expect(closeButton).toHaveFocus();

        await user.tab({ shift: true });
        expect(clearButton).toHaveFocus();
        await user.tab();
        expect(closeButton).toHaveFocus();
    });

    it('键盘清空后收容焦点到关闭按钮，Tab 不逃出且 Escape 返回 badge', async () => {
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
        const clearButton = within(drawer).getByRole('button', { name: '清空购物车' });
        clearButton.focus();
        await user.keyboard('{Enter}');

        expect(clearButton).toBeDisabled();
        expect(closeButton).toHaveFocus();
        await user.tab();
        expect(closeButton).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: '购物车' })).not.toBeInTheDocument();
        expect(badge).toHaveFocus();
    });

    it('键盘删除最后一项后收容焦点，Tab 不到背景链接且 Escape 返回 badge', async () => {
        useCartStore.getState().add(productPaid, 1);
        const user = userEvent.setup();
        render(
            <>
                <a href="#assistant">AI 导购</a>
                <CartBadge />
                <CartDrawer />
            </>,
        );
        const badge = screen.getByRole('button', { name: '购物车，1 件商品' });
        await user.click(badge);

        const drawer = screen.getByRole('dialog', { name: '购物车' });
        const closeButton = within(drawer).getByRole('button', { name: '关闭购物车' });
        const removeButton = within(drawer).getByRole('button', {
            name: '删除 付费模板 Beta',
        });
        removeButton.focus();
        await user.keyboard('{Enter}');

        expect(within(drawer).getByText('购物车是空的')).toBeInTheDocument();
        expect(closeButton).toHaveFocus();
        await user.tab();
        expect(closeButton).toHaveFocus();
        expect(screen.getByRole('link', { name: 'AI 导购' })).not.toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: '购物车' })).not.toBeInTheDocument();
        expect(badge).toHaveFocus();
    });
});
